#!/usr/bin/env node
// Borra una cuenta entera: la de Authentication y todo lo suyo en Firestore,
// incluidos sus datos dentro de las cuentas de otras personas.
//
//   node scripts/borrar-cuenta.mjs --emulador --correo alguien@ejemplo.test
//   node scripts/borrar-cuenta.mjs --proyecto prod --uid abc123   [--aplicar]
//
// Para qué: es lo que promete el apartado 6 de privacidad.html cuando
// alguien pide la baja. La aplicación todavía no tiene botón de borrado, así
// que la baja se atiende con esto.
//
// SIN --aplicar NO ESCRIBE: solo cuenta lo que hay en cada sitio. Es la
// forma de enseñarle a alguien qué se va a borrar antes de borrarlo, y de
// comprobar después que no queda nada.
//
// Qué borra, en este orden (importa):
//   1. Sus datos dentro de otras cuentas: su entrada en la lista de amigos
//      de cada persona y las solicitudes que envió y siguen pendientes.
//   2. Las lecturas compartidas en las que participaba, enteras.
//   3. Los mensajes que envió en cada conversación y, si la conversación se
//      queda vacía, el documento del chat. Los mensajes que le escribieron
//      otras personas NO se tocan: son datos de ellas.
//   4. Lo suyo: perfil y subcolecciones (documento privado de
//      notificaciones, sesiones de lectura, su lista de amigos y las
//      solicitudes que recibió), libros, papelera y comentarios del Club.
//   5. La reserva de su nombre de usuario, que queda libre.
//   6. La cuenta de Authentication, al final: si algo falla antes, la cuenta
//      sigue existiendo y se puede reintentar sin dejar datos huérfanos.
//
// Con --uid vale también para un perfil huérfano (el documento existe pero
// ya no hay cuenta en Authentication): borra lo de Firestore y lo dice.
//
// No imprime nombres, correos ni contenidos: solo recuentos. Al aplicar deja
// un recibo local con el uid, la fecha y los recuentos —sin el correo—, que
// es lo que hace falta para acreditar que la solicitud se atendió.
//
// Mismas guardas que scripts/migrar-tokens-fcm.mjs: hay que elegir destino,
// no habla con un proyecto real si las variables de emulador están puestas,
// y contra un proyecto real pide confirmación escrita con un código
// aleatorio. firebase-admin se toma de functions/node_modules.
// Ejecutar desde la raíz del repo.
//
// Permisos de la credencial: roles/datastore.user (escribe) y
// roles/firebaseauth.admin (borra cuentas de Authentication).
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { proyecto, PROD } from './lib/proyectos.mjs';
import { color } from './lib/proc.mjs';

const EMULADOR_FIRESTORE = '127.0.0.1:8080';
const EMULADOR_AUTH = '127.0.0.1:9099';
const CARPETA_RECIBOS = 'recibos-borrado';

const args = process.argv.slice(2);
const usarEmulador = args.includes('--emulador');
const aplicar = args.includes('--aplicar');
const valor = (bandera) => {
  const i = args.indexOf(bandera);
  return i === -1 ? null : args[i + 1] || null;
};
const alias = valor('--proyecto');
const correo = valor('--correo');
const uidArg = valor('--uid');

if (usarEmulador === Boolean(alias) || (alias && !['prod', 'dev'].includes(alias))) {
  console.error(color.rojo(`
✗ Indica UN destino:
    --emulador            emuladores locales (${EMULADOR_FIRESTORE} y ${EMULADOR_AUTH})
    --proyecto prod|dev   proyecto real, con Application Default Credentials
`));
  process.exit(1);
}
if (Boolean(correo) === Boolean(uidArg)) {
  console.error(color.rojo(`
✗ Indica UNA cuenta:
    --correo alguien@ejemplo.com   se resuelve en Authentication
    --uid abc123                   directo (vale para un perfil huérfano)
  Sin --aplicar solo cuenta lo que hay; con --aplicar borra.
`));
  process.exit(1);
}

// Con las variables puestas, el Admin SDK hablaría con el emulador aunque se
// pida el proyecto real: se borraría lo que no es y el "0" final engañaría.
for (const variable of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (alias && process.env[variable]) {
    console.error(color.rojo(`
✗ ${variable}=${process.env[variable]} está definida:
  se trabajaría contra el emulador y no contra ${alias}. Quítala o usa --emulador.
`));
    process.exit(1);
  }
}

// Antes de conectar a nada: sin terminal no hay confirmación posible.
if (aplicar && alias && !process.stdin.isTTY) {
  console.error(color.rojo(
    '\n✗ --aplicar contra un proyecto real exige confirmación interactiva y no hay terminal.\n',
  ));
  process.exit(1);
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
const auth = getAuth(app);

console.log(color.negrita(
  `\n▶ Borrado de cuenta · ${usarEmulador ? `EMULADOR ${EMULADOR_FIRESTORE}` : `PROYECTO ${projectId}`}\n`,
));

/** Resuelve la cuenta: uid y si existe en Authentication. */
async function resolverCuenta() {
  if (correo) {
    try {
      const u = await auth.getUserByEmail(correo);
      return { uid: u.uid, enAuth: true };
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.error(color.rojo('\n✗ No hay ninguna cuenta con ese correo. Si es un perfil huérfano, usa --uid.\n'));
        process.exit(1);
      }
      throw error;
    }
  }
  const existe = await auth.getUser(uidArg).then(() => true, () => false);
  return { uid: uidArg, enAuth: existe };
}

const { uid, enAuth } = await resolverCuenta();

/** Documentos de una consulta, como referencias. */
const refsDe = async (consulta) => (await consulta.get()).docs.map((d) => d.ref);

/**
 * Documentos de un grupo de colecciones cuyo ID es el uid y que cuelgan de
 * OTRA cuenta (los de la propia van con su perfil).
 * @param {string} grupo Nombre de la subcolección.
 * @return {Promise<object[]>} Referencias.
 */
async function refsEnOtrasCuentas(grupo) {
  const snap = await db.collectionGroup(grupo).select().get();
  return snap.docs
    .filter((d) => d.id === uid && d.ref.parent.parent?.id !== uid)
    .map((d) => d.ref);
}

/** Todo lo que hay que borrar, agrupado por sitio. */
async function inventario() {
  const perfil = db.collection('users').doc(uid);
  const chats = (await db.collection('chats').where('participants', 'array-contains', uid).get()).docs;

  // De cada conversación, solo los mensajes que envió esta cuenta.
  const mensajes = [];
  for (const chat of chats) {
    mensajes.push(...await refsDe(chat.ref.collection('messages').where('from', '==', uid).select()));
  }

  return {
    enListasDeOtras: await refsEnOtrasCuentas('friends'),
    solicitudesEnviadas: await refsEnOtrasCuentas('friend_requests'),
    lecturasCompartidas: await refsDe(db.collection('buddy_reads').where('participants', 'array-contains', uid)),
    chats: chats.map((d) => d.ref),
    mensajesSuyos: mensajes,
    privado: await refsDe(perfil.collection('privado').select()),
    sesiones: await refsDe(perfil.collection('sessions').select()),
    susAmigos: await refsDe(perfil.collection('friends').select()),
    solicitudesRecibidas: await refsDe(perfil.collection('friend_requests').select()),
    libros: await refsDe(db.collection('books').where('userId', '==', uid).select()),
    papelera: await refsDe(db.collection('papelera').where('userId', '==', uid).select()),
    comentarios: await refsDe(db.collection('book_comments').where('uid', '==', uid).select()),
    reservasDeNombre: await refsDe(db.collection('usernames').where('uid', '==', uid).select()),
    perfil: (await perfil.get()).exists ? [perfil] : [],
  };
}

const inv = await inventario();
const cuantos = Object.fromEntries(Object.entries(inv).map(([k, v]) => [k, v.length]));

const ETIQUETAS = {
  enListasDeOtras: 'en listas de amigos de otras cuentas',
  solicitudesEnviadas: 'solicitudes que envió, sin contestar',
  lecturasCompartidas: 'lecturas compartidas (se borran enteras)',
  mensajesSuyos: 'mensajes que envió en chats',
  perfil: 'perfil (users/{uid})',
  privado: 'documentos privados (tokens de avisos)',
  sesiones: 'sesiones de lectura',
  susAmigos: 'su lista de amigos',
  solicitudesRecibidas: 'solicitudes que recibió',
  libros: 'libros',
  papelera: 'libros en la papelera',
  comentarios: 'comentarios del Club',
  reservasDeNombre: 'reservas de nombre de usuario',
};
console.log(`  Cuenta en Authentication: ${enAuth ? 'sí' : color.amarillo('NO (perfil huérfano)')}`);
for (const [clave, etiqueta] of Object.entries(ETIQUETAS)) {
  console.log(`    ${etiqueta}:`.padEnd(48) + cuantos[clave]);
}
// Las conversaciones van aparte del total: solo se borra la que se quede sin
// mensajes, y eso no se sabe hasta haber borrado los suyos.
console.log('    conversaciones en las que participa:'.padEnd(48) + cuantos.chats +
  '  (solo se borra la que se quede vacía)');
const totalDocs = Object.entries(cuantos)
  .filter(([clave]) => clave !== 'chats')
  .reduce((suma, [, v]) => suma + v, 0);
console.log(color.negrita(`\n  Documentos que se borrarían: ${totalDocs}\n`));

if (!aplicar) {
  console.log('  Sin --aplicar no se ha borrado nada.\n');
  await db.terminate();
  process.exit(0);
}

/** Confirmación escrita con código aleatorio, como el despliegue. */
async function confirmar() {
  const codigo = randomBytes(3).toString('hex');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(
    `  ${color.amarillo(`Esto BORRA la cuenta en ${projectId} y no se puede deshacer.`)}\n` +
    `  Para continuar, escribe ${color.negrita(`borrar ${codigo}`)}\n  > `,
  );
  rl.close();
  return respuesta.trim() === `borrar ${codigo}`;
}

if (alias && !(await confirmar())) {
  console.log(color.rojo('\n  Cancelado: no se ha borrado nada.\n'));
  await db.terminate();
  process.exit(1);
}

/**
 * Borra una lista de referencias en lotes.
 * @param {object[]} refs Referencias.
 * @return {Promise<void>}
 */
async function borrar(refs) {
  if (refs.length === 0) return;
  const lotes = db.bulkWriter();
  refs.forEach((ref) => { lotes.delete(ref); });
  await lotes.close();
}

// 1. Lo suyo dentro de otras cuentas, primero: es lo que deja su nombre a la
//    vista de otras personas.
await borrar(inv.enListasDeOtras);
await borrar(inv.solicitudesEnviadas);

// 2. Las lecturas compartidas, enteras.
await borrar(inv.lecturasCompartidas);

// 3. Sus mensajes. La conversación solo se borra si se queda vacía: los
//    mensajes de la otra persona son datos suyos.
await borrar(inv.mensajesSuyos);
let chatsBorrados = 0;
for (const chat of inv.chats) {
  const quedan = await chat.collection('messages').limit(1).get();
  if (quedan.empty) {
    await chat.delete();
    chatsBorrados++;
  }
}

// 4. Lo suyo.
await borrar([
  ...inv.privado, ...inv.sesiones, ...inv.susAmigos, ...inv.solicitudesRecibidas,
  ...inv.libros, ...inv.papelera, ...inv.comentarios, ...inv.perfil,
]);

// 5. El nombre, que queda libre.
await borrar(inv.reservasDeNombre);

// 6. Y por último la cuenta: si algo de lo anterior falla, sigue existiendo.
let authBorrada = false;
if (enAuth) {
  await auth.deleteUser(uid);
  authBorrada = true;
}

// Recibo: lo que hace falta para acreditar que se atendió la solicitud. Sin
// el correo, que es justo lo que se ha pedido borrar.
const recibo = {
  uid,
  proyecto: projectId,
  fecha: new Date().toISOString(),
  cuentaDeAuthBorrada: authBorrada,
  documentosBorrados: { ...cuantos, chats: chatsBorrados },
  total: totalDocs + chatsBorrados,
};
mkdirSync(CARPETA_RECIBOS, { recursive: true });
const ruta = join(CARPETA_RECIBOS, `${uid}-${recibo.fecha.slice(0, 10)}.json`);
writeFileSync(ruta, `${JSON.stringify(recibo, null, 2)}\n`);

await db.terminate();
console.log(color.verde(`  ✓ Cuenta borrada. Conversaciones eliminadas por quedarse vacías: ${chatsBorrados}`));
console.log(`  Recibo: ${ruta}\n`);
