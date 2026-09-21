#!/usr/bin/env node
// Borra una cuenta entera: la de Authentication y todo lo suyo en Firestore,
// incluidos sus datos dentro de las cuentas de otras personas.
//
//   node scripts/borrar-cuenta.mjs --emulador --correo alguien@ejemplo.test
//   node scripts/borrar-cuenta.mjs --proyecto prod --uid abc123   [--aplicar]
//   node scripts/borrar-cuenta.mjs --proyecto prod --huerfanos    [--aplicar]
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
// Con --huerfanos busca TODAS las cuentas que ya no existen en
// Authentication y de las que aún quedan datos: perfiles sin cuenta y
// también uids que solo aparecen en listas de amigos o en solicitudes de
// otras personas. Es la limpieza que pide la política: los datos se guardan
// mientras la cuenta está activa. Una cuenta que existe en Authentication
// NUNCA se toca en este modo; si Authentication no devuelve ni una cuenta,
// el script se planta antes de borrar nada.
//
// No imprime nombres, correos, uids ni contenidos: solo recuentos. Al
// aplicar deja un recibo local por cuenta con el uid, la fecha y los
// recuentos —sin el correo—, que es lo que hace falta para acreditar que la
// solicitud se atendió.
//
// Mismas guardas que scripts/migrar-tokens-fcm.mjs: hay que elegir destino,
// no habla con un proyecto real si las variables de emulador están puestas,
// y contra un proyecto real pide confirmación escrita con un código
// aleatorio (una sola para todas las huérfanas). firebase-admin se toma de
// functions/node_modules. Ejecutar desde la raíz del repo.
//
// Permisos de la credencial: roles/datastore.user (escribe) y
// roles/firebaseauth.admin (lee y borra cuentas de Authentication).
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
const huerfanos = args.includes('--huerfanos');
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
if ([correo, uidArg, huerfanos ? '--huerfanos' : null].filter(Boolean).length !== 1) {
  console.error(color.rojo(`
✗ Indica UNA cosa que borrar:
    --correo alguien@ejemplo.com   se resuelve en Authentication
    --uid abc123                   directo (vale para un perfil huérfano)
    --huerfanos                    todas las cuentas que ya no están en Auth
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
  `\n▶ ${huerfanos ? 'Limpieza de cuentas huérfanas' : 'Borrado de cuenta'} · ` +
  `${usarEmulador ? `EMULADOR ${EMULADOR_FIRESTORE}` : `PROYECTO ${projectId}`}\n`,
));

/** Resuelve la cuenta indicada: uid y si existe en Authentication. */
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

/** Todos los uid que existen hoy en Authentication. */
async function uidsEnAuth() {
  const vivos = new Set();
  let pagina = await auth.listUsers(1000);
  for (;;) {
    pagina.users.forEach((u) => vivos.add(u.uid));
    if (!pagina.pageToken) break;
    pagina = await auth.listUsers(1000, pagina.pageToken);
  }
  return vivos;
}

/**
 * Cuentas de las que quedan datos y que ya no existen en Authentication:
 * perfiles sin cuenta y uids que solo aparecen en listas de amigos o en
 * solicitudes de otras personas.
 * @param {Set<string>} vivos Los uid que sí existen.
 * @return {Promise<string[]>} Uids huérfanos, ordenados.
 */
async function buscarHuerfanos(vivos) {
  const encontrados = new Set();
  for await (const snap of db.collection('users').select().stream()) {
    if (!vivos.has(snap.id)) encontrados.add(snap.id);
  }
  for (const grupo of ['friends', 'friend_requests']) {
    const docs = (await db.collectionGroup(grupo).select().get()).docs;
    docs.forEach((d) => { if (!vivos.has(d.id)) encontrados.add(d.id); });
  }
  return [...encontrados].sort();
}

/** Documentos de una consulta, como referencias. */
const refsDe = async (consulta) => (await consulta.get()).docs.map((d) => d.ref);

/**
 * Documentos de un grupo de colecciones cuyo ID es este uid y que cuelgan de
 * OTRA cuenta (los de la propia van con su perfil).
 * @param {string} grupo Nombre de la subcolección.
 * @param {string} uid Cuenta.
 * @return {Promise<object[]>} Referencias.
 */
async function refsEnOtrasCuentas(grupo, uid) {
  const snap = await db.collectionGroup(grupo).select().get();
  return snap.docs
    .filter((d) => d.id === uid && d.ref.parent.parent?.id !== uid)
    .map((d) => d.ref);
}

/**
 * Todo lo que hay que borrar de una cuenta, agrupado por sitio.
 * @param {string} uid Cuenta.
 * @return {Promise<object>} Referencias por sitio.
 */
async function inventario(uid) {
  const perfil = db.collection('users').doc(uid);
  const chats = (await db.collection('chats').where('participants', 'array-contains', uid).get()).docs;

  // De cada conversación, solo los mensajes que envió esta cuenta.
  const mensajes = [];
  for (const chat of chats) {
    mensajes.push(...await refsDe(chat.ref.collection('messages').where('from', '==', uid).select()));
  }

  return {
    enListasDeOtras: await refsEnOtrasCuentas('friends', uid),
    solicitudesEnviadas: await refsEnOtrasCuentas('friend_requests', uid),
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

/** Cuántas referencias hay en cada sitio. */
const recuento = (inv) => Object.fromEntries(Object.entries(inv).map(([k, v]) => [k, v.length]));

/** Suma dos recuentos, sitio a sitio. */
const sumar = (a, b) => Object.fromEntries(
  Object.keys(b).map((k) => [k, (a[k] || 0) + b[k]]),
);

/**
 * Pinta los recuentos y devuelve el total de documentos que se borrarían.
 * Las conversaciones van aparte: solo se borra la que se quede sin mensajes,
 * y eso no se sabe hasta haber borrado los suyos.
 * @param {object} cuantos Recuento por sitio.
 * @return {number} Total, sin contar las conversaciones.
 */
function pintar(cuantos) {
  for (const [clave, etiqueta] of Object.entries(ETIQUETAS)) {
    console.log(`    ${etiqueta}:`.padEnd(48) + cuantos[clave]);
  }
  console.log('    conversaciones en las que participa:'.padEnd(48) + cuantos.chats +
    '  (solo se borra la que se quede vacía)');
  const total = Object.entries(cuantos)
    .filter(([clave]) => clave !== 'chats')
    .reduce((suma, [, v]) => suma + v, 0);
  console.log(color.negrita(`\n  Documentos que se borrarían: ${total}\n`));
  return total;
}

/** Confirmación escrita con código aleatorio, como el despliegue. */
async function confirmar(queSeBorra) {
  const codigo = randomBytes(3).toString('hex');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(
    `  ${color.amarillo(`Esto BORRA ${queSeBorra} en ${projectId} y no se puede deshacer.`)}\n` +
    `  Para continuar, escribe ${color.negrita(`borrar ${codigo}`)}\n  > `,
  );
  rl.close();
  return respuesta.trim() === `borrar ${codigo}`;
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

/**
 * Borra todo lo de una cuenta, en el orden que importa, y deja el recibo.
 * @param {string} uid Cuenta.
 * @param {object} inv Su inventario.
 * @param {boolean} enAuth Si tiene cuenta en Authentication.
 * @return {Promise<{chatsBorrados: number, ruta: string}>}
 */
async function borrarCuenta(uid, inv, enAuth) {
  // 1. Lo suyo dentro de otras cuentas, primero: es lo que deja su nombre a
  //    la vista de otras personas.
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
  if (enAuth) await auth.deleteUser(uid);

  // Recibo: lo que hace falta para acreditar que se atendió la solicitud.
  // Sin el correo, que es justo lo que se ha pedido borrar.
  const cuantos = recuento(inv);
  const total = Object.entries(cuantos)
    .filter(([clave]) => clave !== 'chats')
    .reduce((suma, [, v]) => suma + v, 0);
  const recibo = {
    uid,
    proyecto: projectId,
    fecha: new Date().toISOString(),
    cuentaDeAuthBorrada: enAuth,
    documentosBorrados: { ...cuantos, chats: chatsBorrados },
    total: total + chatsBorrados,
  };
  mkdirSync(CARPETA_RECIBOS, { recursive: true });
  const ruta = join(CARPETA_RECIBOS, `${uid}-${recibo.fecha.slice(0, 10)}.json`);
  writeFileSync(ruta, `${JSON.stringify(recibo, null, 2)}\n`);
  return { chatsBorrados, ruta };
}

// ===========================================================================
// Modo cuentas huérfanas
// ===========================================================================
if (huerfanos) {
  const vivos = await uidsEnAuth();
  // Si Authentication no devuelve nada, TODO parecería huérfano: mejor
  // plantarse que borrar la base de datos entera por un fallo de permisos.
  if (vivos.size === 0) {
    console.error(color.rojo(
      '\n✗ Authentication no ha devuelto ninguna cuenta. Con esa lista vacía, todos los\n' +
      '  perfiles parecerían huérfanos. Revisa los permisos de la credencial.\n',
    ));
    await db.terminate();
    process.exit(1);
  }

  const lista = await buscarHuerfanos(vivos);
  console.log(`  Cuentas vivas en Authentication: ${vivos.size}`);
  console.log(`  Cuentas huérfanas con datos:     ${lista.length}\n`);

  const inventarios = new Map();
  let cuantos = Object.fromEntries(Object.keys(ETIQUETAS).concat('chats').map((k) => [k, 0]));
  for (const uid of lista) {
    const inv = await inventario(uid);
    inventarios.set(uid, inv);
    cuantos = sumar(cuantos, recuento(inv));
  }
  const total = pintar(cuantos);

  if (!aplicar) {
    console.log('  Sin --aplicar no se ha borrado nada.\n');
    await db.terminate();
    process.exit(0);
  }
  if (lista.length === 0) {
    console.log('  Nada que limpiar.\n');
    await db.terminate();
    process.exit(0);
  }
  if (alias && !(await confirmar(`${lista.length} cuentas huérfanas (${total} documentos)`))) {
    console.log(color.rojo('\n  Cancelado: no se ha borrado nada.\n'));
    await db.terminate();
    process.exit(1);
  }

  let chats = 0;
  for (const uid of lista) {
    // enAuth siempre false: son justo las que ya no están.
    const { chatsBorrados } = await borrarCuenta(uid, inventarios.get(uid), false);
    chats += chatsBorrados;
  }
  await db.terminate();
  console.log(color.verde(`  ✓ ${lista.length} cuentas huérfanas limpiadas. ` +
    `Conversaciones eliminadas por quedarse vacías: ${chats}`));
  console.log(`  Un recibo por cuenta en ${CARPETA_RECIBOS}/\n`);
  process.exit(0);
}

// ===========================================================================
// Modo una cuenta
// ===========================================================================
const { uid, enAuth } = await resolverCuenta();
const inv = await inventario(uid);
console.log(`  Cuenta en Authentication: ${enAuth ? 'sí' : color.amarillo('NO (perfil huérfano)')}`);
pintar(recuento(inv));

if (!aplicar) {
  console.log('  Sin --aplicar no se ha borrado nada.\n');
  await db.terminate();
  process.exit(0);
}
if (alias && !(await confirmar('la cuenta'))) {
  console.log(color.rojo('\n  Cancelado: no se ha borrado nada.\n'));
  await db.terminate();
  process.exit(1);
}

const { chatsBorrados, ruta } = await borrarCuenta(uid, inv, enAuth);
await db.terminate();
console.log(color.verde(`  ✓ Cuenta borrada. Conversaciones eliminadas por quedarse vacías: ${chatsBorrados}`));
console.log(`  Recibo: ${ruta}\n`);
