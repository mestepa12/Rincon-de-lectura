#!/usr/bin/env node
// ¿Cómo está la papelera de 30 días? Recuento de /papelera.
//
//   node scripts/revisar-papelera.mjs --emulador
//   node scripts/revisar-papelera.mjs --proyecto prod
//
// SOLO LECTURA. No hay ni una llamada de escritura (set, update, delete,
// batch, runTransaction...). De cada documento se piden solo userId y
// deletedAt con select(): ni títulos ni nada del libro. Y no se imprimen
// uids ni IDs de documento, solo recuentos.
//
// La purga la hace el cliente al abrir /biblioteca, y solo sobre la
// papelera de quien la abre (script.js, purgarPapelera). Lo que pasó de
// los 30 días y sigue aquí es de cuentas que no han vuelto a entrar desde
// entonces. Para decidir qué está caducado se usan las mismas funciones
// que la purga (papelera.js), así que el criterio no puede divergir.
//
// Sin destino por defecto: hay que decir a cuál se habla. Con --emulador
// fija aquí el host (127.0.0.1:8080) y no usa credenciales. Con --proyecto
// usa Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS o
// `gcloud auth application-default login`) y el ID sale de .firebaserc.
//
// firebase-admin se toma de functions/node_modules para no añadir
// dependencias a la raíz. Ejecutar desde la raíz del repo.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { proyecto, PROD } from './lib/proyectos.mjs';
import { color } from './lib/proc.mjs';
import { DIAS_PAPELERA, diasRestantes, estaCaducado } from '../papelera.js';

const EMULADOR = '127.0.0.1:8080';
const MS_POR_DIA = 24 * 60 * 60 * 1000;

const args = process.argv.slice(2);
const usarEmulador = args.includes('--emulador');
const iProyecto = args.indexOf('--proyecto');
const alias = iProyecto === -1 ? null : args[iProyecto + 1];

if (usarEmulador === Boolean(alias) || (alias && !['prod', 'dev'].includes(alias))) {
  console.error(color.rojo(`
✗ Indica UN destino:
    --emulador            emulador local (${EMULADOR})
    --proyecto prod|dev   proyecto real, con Application Default Credentials
`));
  process.exit(1);
}

// Con la variable puesta, el Admin SDK hablaría con el emulador aunque se
// pida el proyecto real, y un recuento de ahí parecería la respuesta buena.
for (const variable of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (alias && process.env[variable]) {
    console.error(color.rojo(`
✗ ${variable}=${process.env[variable]} está definida:
  se consultaría el emulador y no ${alias}. Quítala o usa --emulador.
`));
    process.exit(1);
  }
}
if (usarEmulador) process.env.FIRESTORE_EMULATOR_HOST = EMULADOR;

const require = createRequire(resolve(process.cwd(), 'functions', 'package.json'));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// En el emulador los datos viven bajo el ID de producción (ver
// scripts/dev-emuladores.mjs); es solo una etiqueta local.
const projectId = usarEmulador ? PROD : proyecto(alias);
const app = usarEmulador
  ? initializeApp({ projectId })
  : initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);

const ahora = Date.now();
console.log(color.negrita(
  `\n▶ Papelera (/papelera) · ${usarEmulador ? `EMULADOR ${EMULADOR}` : `PROYECTO ${projectId}`}` +
  ` · ${new Date(ahora).toISOString()}\n`,
));

/**
 * Por qué un deletedAt no le sirve a la purga, o null si es válido. Es la
 * misma condición que marcaDeBorrado() en papelera.js, desglosada.
 * @param {*} v Valor de deletedAt.
 * @return {?string} Motivo, o null si es un número válido.
 */
function deletedAtInvalido(v) {
  if (v === undefined || v === null) return 'ausente';
  if (typeof v !== 'number') return `no es un número (${v?.constructor?.name || typeof v})`;
  if (!isFinite(v)) return 'número no finito';
  if (v <= 0) return 'cero o negativo';
  return null;
}

// Tramos de días restantes (los mismos que ve la usuaria en la papelera)
const TRAMOS_RESTANTES = [[1, 7], [8, 14], [15, 21], [22, DIAS_PAPELERA]];
// Cuánto hace que se les pasó el plazo a los caducados
const TRAMOS_PASADOS = [[0, 6, 'menos de 7 días'], [7, 29, 'de 7 a 29 días'], [30, Infinity, '30 días o más']];

let total = 0;
const cuentas = new Set();
const cuentasConCaducados = new Set();
let dentroDePlazo = 0;
let caducados = 0;
let futuros = 0;
let sinUserId = 0;
const restantes = new Map(TRAMOS_RESTANTES.map(([a, b]) => [`${a}-${b}`, 0]));
const pasados = new Map(TRAMOS_PASADOS.map(([, , t]) => [t, 0]));
const invalidos = new Map();
let caducadoMasAntiguo = null;

try {
  for await (const snap of db.collection('papelera').select('userId', 'deletedAt').stream()) {
    total++;
    const { userId, deletedAt } = snap.data();
    // La app busca su papelera por userId: sin él, nadie la ve ni la purga.
    if (typeof userId === 'string' && userId) cuentas.add(userId);
    else sinUserId++;

    const motivo = deletedAtInvalido(deletedAt);
    if (motivo) {
      invalidos.set(motivo, (invalidos.get(motivo) || 0) + 1);
      continue;
    }
    if (deletedAt > ahora) futuros++;

    const item = { deletedAt };
    if (estaCaducado(item, ahora)) {
      caducados++;
      if (typeof userId === 'string' && userId) cuentasConCaducados.add(userId);
      const diasPasados = Math.floor((ahora - deletedAt - DIAS_PAPELERA * MS_POR_DIA) / MS_POR_DIA);
      const tramo = TRAMOS_PASADOS.find(([a, b]) => diasPasados >= a && diasPasados <= b);
      pasados.set(tramo[2], pasados.get(tramo[2]) + 1);
      if (caducadoMasAntiguo === null || deletedAt < caducadoMasAntiguo) caducadoMasAntiguo = deletedAt;
    } else {
      dentroDePlazo++;
      const dias = diasRestantes(item, ahora);
      const tramo = TRAMOS_RESTANTES.find(([a, b]) => dias >= a && dias <= b);
      // Más de 30 días restantes solo pasa con un deletedAt en el futuro
      // (reloj del cliente adelantado): se cuenta aparte, en "futuros".
      if (tramo) restantes.set(`${tramo[0]}-${tramo[1]}`, restantes.get(`${tramo[0]}-${tramo[1]}`) + 1);
    }
  }
} catch (error) {
  console.error(color.rojo(`✗ La consulta falló: ${error.message}\n`));
  await db.terminate();
  process.exit(1);
}
await db.terminate();

const nInvalidos = [...invalidos.values()].reduce((s, n) => s + n, 0);
const fecha = (ms) => new Date(ms).toISOString().slice(0, 10);

console.log(`  Documentos en /papelera:          ${total}`);
console.log(`  Cuentas distintas:                ${cuentas.size}`);
console.log('');
console.log(`  Dentro de plazo (≤ ${DIAS_PAPELERA} días):       ${dentroDePlazo}`);
for (const [tramo, n] of restantes) console.log(`    quedan ${tramo.padEnd(6)} días        ${n}`);
if (futuros) console.log(color.amarillo(`    con deletedAt en el futuro:    ${futuros} (reloj del dispositivo adelantado: más de ${DIAS_PAPELERA} días restantes, fuera de los tramos)`));
console.log('');
console.log(`  Pasados de plazo (deberían purgarse al abrir su dueña la app): ${caducados}`);
for (const [tramo, n] of pasados) console.log(`    plazo vencido hace ${tramo.padEnd(16)} ${n}`);
console.log(`    cuentas con algo vencido:      ${cuentasConCaducados.size}`);
if (caducadoMasAntiguo !== null) console.log(`    el más antiguo se borró el     ${fecha(caducadoMasAntiguo)}`);
console.log('');
if (nInvalidos) {
  console.log(color.amarillo(`  deletedAt ausente o inválido (la purga nunca los toca): ${nInvalidos}`));
  for (const [motivo, n] of invalidos) console.log(color.amarillo(`    ${motivo}: ${n}`));
} else {
  console.log('  deletedAt ausente o inválido:     0');
}
if (sinUserId) console.log(color.amarillo(`  Sin userId (nadie los ve ni los purga): ${sinUserId}`));
console.log('');
