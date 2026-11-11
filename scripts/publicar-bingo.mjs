#!/usr/bin/env node
// Publica el cartón del bingo de un mes: lee contenido/bingos/AAAA-MM.json,
// lo valida y lo escribe en bingos/{AAAA-MM} con el Admin SDK.
//
//   npm run bingo:publicar -- contenido/bingos/2026-12.json --emulador  [--aplicar]
//   npm run bingo:publicar -- contenido/bingos/2026-12.json --proyecto prod [--aplicar]
//
// Por qué así: el contenido vive en git (historial, diff, revisión) y se
// publica sin desplegar hosting. Los clientes no pueden escribir en
// /bingos (allow write: if false), así que esta es la única vía.
//
// SIN --aplicar NO ESCRIBE: valida, enseña cómo quedaría (casillas, fechas
// en hora de España, versión) y compara con lo que ya hay publicado. Es la
// forma de revisar antes de publicar.
//
// Lo que añade el script y no se escribe a mano (ver bingo-carton.js):
// idsCasillas, publicaDesde (día 1, 00:00 de España), cierraEn (día 1 del
// mes siguiente + 3 días de gracia, 00:00 de España) y version.
//
// Republicar sirve para corregir erratas: textos y título se pueden cambiar
// siempre. Los ids de las casillas, su orden y el tamaño solo hasta que el
// cartón se abre; después el script se niega, porque el progreso de cada
// usuaria guarda "id de casilla → libro".
//
// Mismas guardas que scripts/borrar-cuenta.mjs: hay que elegir destino, no
// habla con un proyecto real si FIRESTORE_EMULATOR_HOST está puesta, y
// contra un proyecto real pide confirmación escrita con un código aleatorio.
// firebase-admin se toma de functions/node_modules. Ejecutar desde la raíz
// del repo. Permiso de la credencial: roles/datastore.user.
import { createRequire } from 'node:module';
import { resolve, basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { proyecto, PROD } from './lib/proyectos.mjs';
import { color } from './lib/proc.mjs';
import {
  validarCarton, documentoPublicable, cambiosNoPermitidos, ZONA,
} from '../bingo-carton.js';

const EMULADOR = '127.0.0.1:8080';

const args = process.argv.slice(2);
const usarEmulador = args.includes('--emulador');
const aplicar = args.includes('--aplicar');
const iProyecto = args.indexOf('--proyecto');
const alias = iProyecto === -1 ? null : args[iProyecto + 1];
const fichero = args.find((a, i) => a.endsWith('.json') && args[i - 1] !== '--proyecto');

const salir = (mensaje) => {
  console.error(color.rojo(`\n✗ ${mensaje}\n`));
  process.exit(1);
};

if (!fichero) {
  salir('Indica el fichero del cartón, p. ej. contenido/bingos/2026-12.json');
}
if (usarEmulador === Boolean(alias) || (alias && !['prod', 'dev'].includes(alias))) {
  salir(`Indica UN destino:
    --emulador            emulador local (${EMULADOR})
    --proyecto prod|dev   proyecto real, con Application Default Credentials
  y --aplicar para escribir (sin él solo valida y enseña cómo quedaría).`);
}
// Con la variable puesta, el Admin SDK hablaría con el emulador aunque se
// pida el proyecto real, y se "publicaría" donde nadie lo ve.
if (alias && process.env.FIRESTORE_EMULATOR_HOST) {
  salir(`FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST} está definida:
  se escribiría en el emulador y no en ${alias}. Quítala o usa --emulador.`);
}
// Antes de conectar a nada: sin terminal no hay confirmación posible.
if (aplicar && alias && !process.stdin.isTTY) {
  salir('--aplicar contra un proyecto real exige confirmación interactiva y no hay terminal.');
}

// ---------------------------------------------------------------------------
// 1. Leer y validar, sin conectar a nada todavía
// ---------------------------------------------------------------------------
let carton;
try {
  carton = JSON.parse(readFileSync(fichero, 'utf8'));
} catch (error) {
  salir(`No se puede leer ${fichero}: ${error.message}`);
}
const errores = validarCarton(carton);
if (errores.length === 0 && basename(fichero) !== `${carton.mes}.json`) {
  errores.push(`El fichero se llama ${basename(fichero)} pero el cartón es de ${carton.mes}: tiene que llamarse ${carton.mes}.json.`);
}
if (errores.length) {
  console.error(color.rojo(`\n✗ ${fichero} tiene ${errores.length} error(es):\n`));
  errores.forEach((e) => console.error(`    · ${e}`));
  console.error('');
  process.exit(1);
}

if (usarEmulador) process.env.FIRESTORE_EMULATOR_HOST = EMULADOR;

const require = createRequire(resolve(process.cwd(), 'functions', 'package.json'));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// En el emulador los datos viven bajo el ID de producción (ver
// scripts/dev-emuladores.mjs); es solo una etiqueta local.
const projectId = usarEmulador ? PROD : proyecto(alias);
const app = usarEmulador
  ? initializeApp({ projectId })
  : initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);
const ref = db.collection('bingos').doc(carton.mes);

const terminar = async (codigo) => {
  await db.terminate();
  process.exit(codigo);
};

console.log(color.negrita(
  `\n▶ Bingo ${carton.mes} · ${usarEmulador ? `EMULADOR ${EMULADOR}` : `PROYECTO ${projectId}`}\n`,
));

// ---------------------------------------------------------------------------
// 2. Comparar con lo publicado
// ---------------------------------------------------------------------------
const snap = await ref.get();
const anterior = snap.exists
  ? { ...snap.data(), publicaDesde: snap.data().publicaDesde.toDate() }
  : null;
const nuevo = documentoPublicable(carton, (anterior?.version || 0) + 1);
const ahora = new Date();

const enEspana = (d) => d.toLocaleString('es-ES', {
  timeZone: ZONA, dateStyle: 'full', timeStyle: 'short',
});
console.log(`  ${nuevo.titulo} · ${nuevo.tamano}×${nuevo.tamano} · hasta ${nuevo.maxCasillasPorLibro} casillas por libro\n`);
for (let fila = 0; fila < nuevo.tamano; fila++) {
  const desde = fila * nuevo.tamano;
  nuevo.casillas.slice(desde, desde + nuevo.tamano).forEach((c) => {
    const antes = anterior?.casillas?.find((x) => x.id === c.id);
    const marca = !anterior ? ' ' : !antes ? color.verde('+') : antes.texto !== c.texto ? color.amarillo('~') : ' ';
    console.log(`  ${marca} ${c.id}  ${c.texto}`);
  });
  if (fila < nuevo.tamano - 1) console.log('');
}
console.log(`\n  Se abre:   ${enEspana(nuevo.publicaDesde)}`);
console.log(`  Se cierra: ${enEspana(nuevo.cierraEn)}  (fin de mes + gracia)`);
console.log(`  Versión:   ${nuevo.version}${anterior ? ` (publicada ahora: ${anterior.version})` : ' (primera publicación)'}`);

const motivos = cambiosNoPermitidos(anterior, nuevo, ahora);
if (motivos.length) {
  console.error(color.rojo(
    `\n✗ El cartón ya está abierto (desde ${enEspana(anterior.publicaDesde)}) y cambia ${motivos.join(' y ')}.\n` +
    '  Eso movería las marcas que ya han hecho las usuarias. Solo se pueden corregir textos y título.\n',
  ));
  await terminar(1);
}
if (nuevo.cierraEn <= ahora) {
  console.log(color.amarillo('\n  Ojo: este mes ya está cerrado. Solo cambiará lo que se ve en el historial.'));
}

if (!aplicar) {
  console.log('\n  Sin --aplicar no se ha publicado nada.\n');
  await terminar(0);
}

// ---------------------------------------------------------------------------
// 3. Publicar
// ---------------------------------------------------------------------------
if (alias) {
  const codigo = randomBytes(3).toString('hex');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(
    `\n  ${color.amarillo(`Esto PUBLICA el bingo de ${carton.mes} en ${projectId}: lo verá todo el mundo a partir de la fecha de apertura.`)}\n` +
    `  Para continuar, escribe ${color.negrita(`publicar ${codigo}`)}\n  > `,
  );
  rl.close();
  if (respuesta.trim() !== `publicar ${codigo}`) {
    console.log(color.rojo('\n  Cancelado: no se ha publicado nada.\n'));
    await terminar(1);
  }
}

// En una transacción: si otra ejecución publica a la vez, la versión no se
// pisa ni se salta la comprobación de ids.
try {
  await db.runTransaction(async (tx) => {
    const actual = await tx.get(ref);
    if ((actual.exists ? actual.data().version : 0) !== (anterior?.version || 0)) {
      throw new Error('Alguien ha publicado este mes mientras tanto. Vuelve a ejecutar el script.');
    }
    tx.set(ref, {
      ...nuevo,
      publicaDesde: Timestamp.fromDate(nuevo.publicaDesde),
      cierraEn: Timestamp.fromDate(nuevo.cierraEn),
    });
  });
} catch (error) {
  console.error(color.rojo(`\n✗ ${error.message}\n`));
  await terminar(1);
}
console.log(color.verde(`\n  ✓ Publicado bingos/${carton.mes} (versión ${nuevo.version}).\n`));
await terminar(0);
