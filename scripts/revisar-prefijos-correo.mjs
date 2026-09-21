#!/usr/bin/env node
// ¿Hay nombres guardados que en realidad sean el prefijo de un correo?
//
//   node scripts/revisar-prefijos-correo.mjs --emulador
//   node scripts/revisar-prefijos-correo.mjs --proyecto prod
//
// Para qué: script.js tiene (todavía) cuatro sitios donde, si no encuentra el
// nombre de usuario, guarda `user.email.split('@')[0]` en documentos que ven
// otras personas: el username de un comentario del Club, el fromUsername de
// una solicitud de amistad, el friendUsername que se escribe en la lista de
// la otra persona y el nombre dentro de una lectura compartida. Antes de
// quitar ese apaño hay que saber cuántos documentos lo tienen ya guardado.
//
// Cómo lo decide: para cada cuenta de Auth calcula el prefijo de su correo y
// lo compara (sin distinguir mayúsculas) con el nombre guardado en cada
// documento, siempre contra la cuenta a la que ese nombre pertenece: en
// /friends el nombre es el de la amiga, en /friend_requests el de quien
// envía, y en buddy_reads hay un nombre por participante.
//
// SOLO LECTURA. No hay ni una llamada de escritura (set, update, delete,
// batch, runTransaction...). Pinta números y nada más: ni nombres, ni
// correos, ni uids. Para comparar tiene que leerlos, así que pasan por
// memoria, pero no salen por pantalla ni se guardan en ningún sitio.
//
// Sin destino por defecto: hay que decir a cuál se habla. Con --emulador fija
// aquí los hosts (Firestore 127.0.0.1:8080, Auth 127.0.0.1:9099) y no usa
// credenciales. Con --proyecto usa Application Default Credentials
// (GOOGLE_APPLICATION_CREDENTIALS o `gcloud auth application-default login`)
// y el ID sale de .firebaserc.
//
// Permisos que necesita la credencial (lee Auth además de Firestore):
//   - Firestore: roles/datastore.viewer (Cloud Datastore Viewer).
//   - Auth:      roles/firebaseauth.viewer (Firebase Authentication Viewer),
//                que da firebaseauth.users.get y .list.
// La cuenta de servicio del Admin SDK que crea Firebase
// (firebase-adminsdk-…@<proyecto>.iam.gserviceaccount.com) ya los tiene. Si
// Auth no responde, el script sigue y lo dice: sin correos no puede comparar
// prefijos, pero los demás recuentos salen igual.
//
// firebase-admin se toma de functions/node_modules para no añadir
// dependencias a la raíz. Ejecutar desde la raíz del repo.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { proyecto, PROD } from './lib/proyectos.mjs';
import { color } from './lib/proc.mjs';

const EMULADOR_FIRESTORE = '127.0.0.1:8080';
const EMULADOR_AUTH = '127.0.0.1:9099';

// Los otros dos apaños de la misma familia: nombres que no son de nadie.
const COMODINES = new Set(['?', 'yo', 'Yo']);

const args = process.argv.slice(2);
const usarEmulador = args.includes('--emulador');
const iProyecto = args.indexOf('--proyecto');
const alias = iProyecto === -1 ? null : args[iProyecto + 1];

if (usarEmulador === Boolean(alias) || (alias && !['prod', 'dev'].includes(alias))) {
  console.error(color.rojo(`
✗ Indica UN destino:
    --emulador            emuladores locales (${EMULADOR_FIRESTORE} y ${EMULADOR_AUTH})
    --proyecto prod|dev   proyecto real, con Application Default Credentials
`));
  process.exit(1);
}

// Con la variable puesta, el Admin SDK hablaría con el emulador aunque se
// pida el proyecto real, y un "0" de ahí parecería la respuesta buena.
for (const variable of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (alias && process.env[variable]) {
    console.error(color.rojo(`
✗ ${variable}=${process.env[variable]} está definida:
  se consultaría el emulador y no ${alias}. Quítala o usa --emulador.
`));
    process.exit(1);
  }
}
if (usarEmulador) {
  process.env.FIRESTORE_EMULATOR_HOST = EMULADOR_FIRESTORE;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = EMULADOR_AUTH;
}

const require = createRequire(resolve(process.cwd(), 'functions', 'package.json'));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// En el emulador los datos viven bajo el ID de producción (ver
// scripts/dev-emuladores.mjs); es solo una etiqueta local.
const projectId = usarEmulador ? PROD : proyecto(alias);
const app = usarEmulador
  ? initializeApp({ projectId })
  : initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);

console.log(color.negrita(
  `\n▶ Nombres guardados que sean el prefijo de un correo · ` +
  `${usarEmulador ? `EMULADOR ${EMULADOR_FIRESTORE}` : `PROYECTO ${projectId}`}\n`,
));

/** Un nombre guardado que sirva para comparar, o null. */
const nombreDe = (v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);

/** Recuento de una colección, con los mismos apartados para todas. */
const nuevoRecuento = () => ({
  documentos: 0,
  conNombre: 0,
  prefijoDelCorreo: 0,
  distintoDelPerfil: 0,
  comodines: 0,
  sinCuentaEnAuth: 0,
  sinPerfil: 0,
});

let prefijos = null;     // uid -> prefijo del correo en minúsculas
let motivoSinAuth = '';
let cuentas = 0;
let cuentasConCorreo = 0;
let docsLecturas = 0; // buddy_reads guarda VARIOS nombres por documento
const perfiles = new Map(); // uid -> nombre actual del perfil, o null
const recuentos = {
  perfiles: nuevoRecuento(),
  comentarios: nuevoRecuento(),
  amigas: nuevoRecuento(),
  solicitudes: nuevoRecuento(),
  lecturas: nuevoRecuento(),
};

/**
 * Compara un nombre guardado con lo que sabemos de su dueña y suma donde toque.
 * @param {object} r Recuento de la colección.
 * @param {string|null} uid Cuenta a la que pertenece ese nombre.
 * @param {*} valor Nombre tal y como está guardado.
 */
function comparar(r, uid, valor) {
  r.documentos++;
  const nombre = nombreDe(valor);
  if (nombre === null) return;
  r.conNombre++;
  if (COMODINES.has(nombre)) r.comodines++;
  if (!uid) return;
  if (!perfiles.has(uid)) r.sinPerfil++;
  else if (perfiles.get(uid) !== null && perfiles.get(uid) !== nombre) r.distintoDelPerfil++;
  if (prefijos === null) return;
  if (!prefijos.has(uid)) r.sinCuentaEnAuth++;
  else if (prefijos.get(uid) === nombre.toLowerCase()) r.prefijoDelCorreo++;
}

try {
  // --- Auth: uid -> prefijo del correo. Si falla, se sigue sin comparar. ---
  try {
    prefijos = new Map();
    let pagina = await getAuth(app).listUsers(1000);
    for (;;) {
      for (const u of pagina.users) {
        cuentas++;
        const correo = typeof u.email === 'string' ? u.email : '';
        const arroba = correo.lastIndexOf('@');
        if (arroba <= 0) continue;
        cuentasConCorreo++;
        prefijos.set(u.uid, correo.slice(0, arroba).toLowerCase());
      }
      if (!pagina.pageToken) break;
      pagina = await getAuth(app).listUsers(1000, pagina.pageToken);
    }
  } catch (error) {
    prefijos = null;
    motivoSinAuth = error.code || error.message || 'error';
  }

  // --- Perfiles: el nombre que tiene hoy cada cuenta ---
  for await (const snap of db.collection('users').select('username').stream()) {
    perfiles.set(snap.id, nombreDe(snap.get('username')));
  }
  for (const [uid, nombre] of perfiles) comparar(recuentos.perfiles, uid, nombre);

  // --- Comentarios del Club: el nombre es el de quien comenta ---
  for await (const snap of db.collection('book_comments').select('uid', 'username').stream()) {
    comparar(recuentos.comentarios, nombreDe(snap.get('uid')), snap.get('username'));
  }

  // --- Listas de amigas: el nombre guardado es el de la AMIGA, y su uid es
  // el ID del documento (friendUid es una copia del mismo valor) ---
  for await (const snap of db.collectionGroup('friends').select('friendUsername').stream()) {
    comparar(recuentos.amigas, snap.id, snap.get('friendUsername'));
  }

  // --- Solicitudes: el nombre es el de quien la envía, que es el ID ---
  for await (const snap of db.collectionGroup('friend_requests').select('fromUsername').stream()) {
    comparar(recuentos.solicitudes, snap.id, snap.get('fromUsername'));
  }

  // --- Lecturas compartidas: un nombre por participante ---
  for await (const snap of db.collection('buddy_reads').select('usernames').stream()) {
    docsLecturas++;
    const mapa = snap.get('usernames');
    if (!mapa || typeof mapa !== 'object') { recuentos.lecturas.documentos++; continue; }
    for (const [uid, valor] of Object.entries(mapa)) comparar(recuentos.lecturas, uid, valor);
  }
} catch (error) {
  console.error(color.rojo(`✗ La consulta falló: ${error.message}\n`));
  await db.terminate();
  process.exit(1);
}
await db.terminate();

const conNombre = [...perfiles.values()].filter((v) => v !== null).length;
console.log(`  Cuentas en Auth: ${prefijos === null ? `NO disponible (${motivoSinAuth})` : `${cuentas} · con correo ${cuentasConCorreo}`}`);
console.log(`  Perfiles: ${perfiles.size} · con nombre ${conNombre}\n`);

const ANCHO = 46;
/** Una línea "etiqueta ....... número", con el número siempre alineado. */
const linea = (etiqueta, valor, destacar = false) => {
  const texto = `    ${etiqueta}:`.padEnd(ANCHO) + valor;
  console.log(destacar && valor !== 0 && valor !== '—' ? color.amarillo(texto) : texto);
};

/**
 * Pinta el recuento de una colección.
 * @param {string} titulo Colección y campo, como se leen.
 * @param {object} r Recuento.
 * @param {string} unidad Qué se ha contado (documentos, entradas, nombres...).
 * @param {boolean} [propio] true si el nombre es el de la dueña del documento,
 *     en cuyo caso compararlo con su perfil no dice nada.
 */
function bloque(titulo, r, unidad, propio = false) {
  console.log(color.negrita(`  ${titulo}`));
  linea(unidad, r.documentos);
  linea('con nombre guardado', r.conNombre);
  linea('el nombre ES el prefijo del correo', prefijos === null ? '—' : r.prefijoDelCorreo, true);
  if (!propio) linea('distinto del nombre actual de su perfil', r.distintoDelPerfil);
  linea("comodines ('?', 'yo', 'Yo')", r.comodines, true);
  linea('de una cuenta que ya no está en Auth', prefijos === null ? '—' : r.sinCuentaEnAuth);
  linea('de una cuenta sin perfil', r.sinPerfil);
  console.log('');
}

bloque('Perfiles (users.username)', recuentos.perfiles, 'perfiles', true);
bloque('Comentarios del Club (book_comments.username)', recuentos.comentarios, 'comentarios');
bloque('Listas de amigas (friends.friendUsername)', recuentos.amigas, 'entradas');
bloque('Solicitudes (friend_requests.fromUsername)', recuentos.solicitudes, 'solicitudes');
bloque('Lecturas compartidas (buddy_reads.usernames)', recuentos.lecturas, 'nombres');

const totalPrefijos = Object.values(recuentos).reduce((s, r) => s + r.prefijoDelCorreo, 0);
// Las lecturas de Firestore van por documento; en buddy_reads se comprueban
// varios nombres dentro del mismo documento.
const totalDocs = recuentos.perfiles.documentos + recuentos.comentarios.documentos
  + recuentos.amigas.documentos + recuentos.solicitudes.documentos + docsLecturas;
console.log(color.negrita(`  Documentos leídos: ${totalDocs}`));
if (prefijos === null) {
  console.log(color.amarillo('  Sin Auth no se ha podido comparar ningún prefijo de correo.\n'));
} else if (totalPrefijos === 0) {
  console.log(color.verde('  Ningún nombre guardado coincide con el prefijo de un correo.\n'));
} else {
  console.log(color.amarillo(`  Nombres que son el prefijo de un correo: ${totalPrefijos}\n`));
}
