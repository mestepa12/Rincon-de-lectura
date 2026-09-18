#!/usr/bin/env node
// ¿Queda algún perfil users/{uid} con el campo `email`?
//
//   node scripts/revisar-email-en-perfiles.mjs --emulador
//   node scripts/revisar-email-en-perfiles.mjs --proyecto prod
//
// SOLO LECTURA. No hay ni una llamada de escritura (set, update, delete,
// batch, runTransaction...). Pinta dos números y nada más: cuántos perfiles
// hay y cuántos tienen el campo `email`. Ni uids, ni valores.
//
// Tampoco se descarga ningún documento: las dos consultas son agregaciones
// count(), que devuelven solo el número. orderBy('email') deja fuera los
// documentos que no tienen el campo, así que el segundo número cuenta los
// que lo tienen, valga lo que valga (también null o una cadena vacía).
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
  `\n▶ Campo email en users/{uid} · ${usarEmulador ? `EMULADOR ${EMULADOR}` : `PROYECTO ${projectId}`}\n`,
));

let total;
let conEmail;
try {
  const perfiles = db.collection('users');
  total = (await perfiles.count().get()).data().count;
  conEmail = (await perfiles.orderBy('email').count().get()).data().count;
} catch (error) {
  console.error(color.rojo(`✗ La consulta falló: ${error.message}\n`));
  await db.terminate();
  process.exit(1);
}
await db.terminate();

console.log(`  Perfiles:          ${total}`);
console.log(`  Con campo email:   ${conEmail}`);
console.log('');
