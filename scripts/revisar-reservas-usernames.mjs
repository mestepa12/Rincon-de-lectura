#!/usr/bin/env node
// ¿Casan los perfiles (users/{uid}.username) con las reservas de nombre
// (usernames/{nombre en minúsculas} = {uid})?
//
//   node scripts/revisar-reservas-usernames.mjs --emulador
//   node scripts/revisar-reservas-usernames.mjs --proyecto prod
//
// Para qué: la búsqueda de amigas va a pasar a ser un get exacto sobre
// /usernames. Una usuaria con nombre en su perfil y sin reserva que apunte a
// ella no podría ser encontrada. La cifra clave es "encontrables".
//
// SOLO LECTURA. No hay ni una llamada de escritura (set, update, delete,
// batch, runTransaction...). Pinta números y nada más: ni nombres ni uids.
// Para comparar tiene que leer los nombres (los perfiles con
// select('username'); las reservas enteras, que solo llevan {uid}), así que
// pasan por memoria.
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

// El formato que exigen el registro (auth.js) y el onboarding. El muro del
// test (quiz.js) no lo aplica: los nombres que genera pueden salirse.
const FORMATO = /^[a-zA-Z0-9_]{3,30}$/;

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
  `\n▶ Perfiles y reservas de nombre · ${usarEmulador ? `EMULADOR ${EMULADOR}` : `PROYECTO ${projectId}`}\n`,
));

let n;
try {
  // uid -> nombre del perfil, o null si no tiene.
  const perfiles = new Map();
  for await (const snap of db.collection('users').select('username').stream()) {
    const nombre = snap.get('username');
    perfiles.set(snap.id, typeof nombre === 'string' && nombre.length > 0 ? nombre : null);
  }

  // nombre en minúsculas (ID) -> uid, o null si la reserva no lo tiene bien.
  const reservas = new Map();
  let reservasConOtraForma = 0;
  for await (const snap of db.collection('usernames').stream()) {
    const d = snap.data();
    const uid = typeof d.uid === 'string' && d.uid.length > 0 ? d.uid : null;
    if (!uid || Object.keys(d).some((k) => k !== 'uid')) reservasConOtraForma++;
    reservas.set(snap.id, uid);
  }

  n = {
    perfiles: perfiles.size,
    conNombre: 0,
    sinNombre: 0,
    encontrables: 0,
    sinReserva: 0,
    reservaDeOtra: 0,
    fueraDeFormato: 0,
    reservas: reservas.size,
    reservasHuerfanas: 0,
    reservasDePerfilSinNombre: 0,
    reservasDeOtroNombre: 0,
    reservasConOtraForma,
    conVariasReservas: 0,
  };

  for (const [uid, nombre] of perfiles) {
    if (nombre === null) { n.sinNombre++; continue; }
    n.conNombre++;
    if (!FORMATO.test(nombre)) n.fueraDeFormato++;
    const clave = nombre.toLowerCase();
    if (!reservas.has(clave)) n.sinReserva++;
    else if (reservas.get(clave) !== uid) n.reservaDeOtra++;
    else n.encontrables++;
  }

  const reservasPorUid = new Map();
  for (const [clave, uid] of reservas) {
    if (uid === null) continue;
    reservasPorUid.set(uid, (reservasPorUid.get(uid) || 0) + 1);
    if (!perfiles.has(uid)) n.reservasHuerfanas++;
    else if (perfiles.get(uid) === null) n.reservasDePerfilSinNombre++;
    else if (perfiles.get(uid).toLowerCase() !== clave) n.reservasDeOtroNombre++;
  }
  n.conVariasReservas = [...reservasPorUid.values()].filter((v) => v > 1).length;
} catch (error) {
  console.error(color.rojo(`✗ La consulta falló: ${error.message}\n`));
  await db.terminate();
  process.exit(1);
}
await db.terminate();

console.log(`  Perfiles:                                         ${n.perfiles}`);
console.log(`    sin nombre (a medias; pasan por el onboarding): ${n.sinNombre}`);
console.log(`    con nombre:                                     ${n.conNombre}`);
console.log(`      encontrables (reserva suya con su nombre):    ${n.encontrables}`);
console.log(`      SIN reserva (no se las podría encontrar):     ${n.sinReserva}`);
console.log(`      su nombre reservado a otro uid:               ${n.reservaDeOtra}`);
console.log(`      nombre fuera del formato del registro:        ${n.fueraDeFormato}`);
console.log('');
console.log(`  Reservas:                                         ${n.reservas}`);
console.log(`    huérfanas (su uid no tiene perfil):             ${n.reservasHuerfanas}`);
console.log(`    de un perfil sin nombre:                        ${n.reservasDePerfilSinNombre}`);
console.log(`    de un perfil que se llama de otra forma:        ${n.reservasDeOtroNombre}`);
console.log(`    con otra forma (sin uid o con más campos):      ${n.reservasConOtraForma}`);
console.log(`  Usuarias con más de una reserva:                  ${n.conVariasReservas}`);
console.log('');
