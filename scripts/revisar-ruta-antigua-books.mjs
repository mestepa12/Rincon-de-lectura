#!/usr/bin/env node
// ¿Queda algún libro en la ruta antigua users/{uid}/books/{bookId}?
//
//   node scripts/revisar-ruta-antigua-books.mjs --emulador
//   node scripts/revisar-ruta-antigua-books.mjs --proyecto prod
//
// SOLO LECTURA. No hay ni una llamada de escritura (set, update, delete,
// batch, runTransaction...). Pinta el total y el número por uid; de los
// libros no pide ni un campo: select() sin argumentos trae solo la ruta.
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

const EMULADOR = '127.0.0.1:8080';

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
// pida el proyecto real, y un "0" de ahí parecería la respuesta buena.
if (alias && process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(color.rojo(`
✗ FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST} está definida:
  se consultaría el emulador y no ${alias}. Quítala o usa --emulador.
`));
  process.exit(1);
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

console.log(color.negrita(
  `\n▶ Ruta antigua users/{uid}/books · ${usarEmulador ? `EMULADOR ${EMULADOR}` : `PROYECTO ${projectId}`}\n`,
));

/**
 * uid del dueño si la ruta es exactamente users/{uid}/books/{bookId}; null
 * para cualquier otra, empezando por la actual /books/{bookId} y siguiendo
 * por cualquier otra subcolección que también se llame books.
 * @param {string} ruta Ruta completa del documento.
 * @return {?string} uid, o null si no es la ruta antigua.
 */
function uidRutaAntigua(ruta) {
  const s = ruta.split('/');
  return s.length === 4 && s[0] === 'users' && s[2] === 'books' ? s[1] : null;
}

const porUid = new Map();
let total = 0;
try {
  for await (const snap of db.collectionGroup('books').select().stream()) {
    const uid = uidRutaAntigua(snap.ref.path);
    if (uid === null) continue;
    total++;
    porUid.set(uid, (porUid.get(uid) || 0) + 1);
  }
} catch (error) {
  console.error(color.rojo(`✗ La consulta falló: ${error.message}\n`));
  await db.terminate();
  process.exit(1);
}
await db.terminate();

console.log(`  Total: ${total}`);
[...porUid]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .forEach(([uid, n]) => console.log(`  ${uid}  ${n}`));
console.log('');
