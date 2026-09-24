#!/usr/bin/env node
// Todas las cuentas de Authentication que comparten un correo, lado a lado,
// para saber cuál usa de verdad la persona.
//
//   node scripts/comparar-cuentas-duplicadas.mjs --emulador --correo alguien@ejemplo.test
//   node scripts/comparar-cuentas-duplicadas.mjs --proyecto prod --correo alguien@ejemplo.com
//
// Por qué: con "una cuenta por correo" activado, Auth no debería aceptar un
// segundo alta con el mismo correo y contraseña, y aun así hay dos. De cada
// una saca las fechas de Auth, si su perfil está completo, si la reserva de
// su nombre apunta a ella y cuántas cosas ha creado después del alta.
//
// SOLO LECTURA: ninguna escritura en Auth ni en Firestore. Los recuentos van
// con count(), que cobra una lectura por cada mil entradas del índice, no
// una por documento. Para encontrar las cuentas recorre la lista entera de
// Authentication (getUserByEmail solo devuelve una).
//
// No imprime el correo, nombres, títulos ni contenidos: solo fechas,
// booleanos, números y los uid recortados a 6 caracteres para poder
// distinguir las cuentas. El nombre de usuario se lee para comprobar su
// reserva y no sale por pantalla.
//
// Mismas guardas que investigar-perfiles-sin-reserva.mjs: hay que elegir
// destino, no habla con un proyecto real si las variables de emulador están
// puestas, credenciales de ADC y firebase-admin de functions/node_modules.
// Ejecutar desde la raíz del repo.
//
// Permisos de la credencial: roles/datastore.viewer y
// roles/firebaseauth.viewer bastan.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { proyecto, PROD } from './lib/proyectos.mjs';
import { color } from './lib/proc.mjs';

const EMULADOR_FIRESTORE = '127.0.0.1:8080';
const EMULADOR_AUTH = '127.0.0.1:9099';
const ZONA = 'Europe/Madrid';

const args = process.argv.slice(2);
const usarEmulador = args.includes('--emulador');
const valor = (bandera) => {
  const i = args.indexOf(bandera);
  return i === -1 ? null : args[i + 1] || null;
};
const alias = valor('--proyecto');
const correo = valor('--correo');

if (usarEmulador === Boolean(alias) || (alias && !['prod', 'dev'].includes(alias))) {
  console.error(color.rojo(`
✗ Indica UN destino:
    --emulador            emuladores locales (Firestore ${EMULADOR_FIRESTORE}, Auth ${EMULADOR_AUTH})
    --proyecto prod|dev   proyecto real, con Application Default Credentials
`));
  process.exit(1);
}

if (!correo || !correo.includes('@')) {
  console.error(color.rojo(`
✗ Indica el correo:  --correo alguien@ejemplo.com
`));
  process.exit(1);
}

// Con cualquiera de las dos variables puestas, el Admin SDK hablaría con un
// emulador aunque se pida el proyecto real.
for (const v of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (alias && process.env[v]) {
    console.error(color.rojo(`
✗ ${v}=${process.env[v]} está definida:
  se consultaría un emulador y no ${alias}. Quítala o usa --emulador.
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

const projectId = usarEmulador ? PROD : proyecto(alias);
const app = usarEmulador
  ? initializeApp({ projectId })
  : initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);
const auth = getAuth(app);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const corto = (uid) => uid.slice(0, 6);

const FORMATO_FECHA = new Intl.DateTimeFormat('es-ES', {
  timeZone: ZONA,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/**
 * Fecha y hora en la zona de España, con segundos: entre dos altas de un
 * doble envío puede no haber ni un minuto.
 * @param {string|Date|null|undefined} f Fecha de Auth (texto UTC) o Date.
 * @return {string}
 */
function fecha(f) {
  if (!f) return '—';
  const d = f instanceof Date ? f : new Date(f);
  return Number.isNaN(d.getTime()) ? '—' : `${FORMATO_FECHA.format(d)} (${ZONA})`;
}

/** Timestamp de Firestore (o lo que haya) a texto. */
function fechaFirestore(v) {
  if (v === undefined) return '—';
  if (v && typeof v.toDate === 'function') return fecha(v.toDate());
  // Formato inesperado: se dice qué tipo es, sin enseñar el valor.
  return `(no es una fecha: ${typeof v})`;
}

const numeroO = (v) => (typeof v === 'number' ? String(v) : v === undefined ? '—' : `(no es un número: ${typeof v})`);
const siNo = (b) => (b ? 'sí' : 'no');

/** count() de una consulta. */
const contar = async (consulta) => (await consulta.count().get()).data().count;

const linea = (texto, v) => console.log(`    ${texto.padEnd(40)} ${v}`);

// ---------------------------------------------------------------------------
// Cuentas con ese correo
// ---------------------------------------------------------------------------

/**
 * Todas las cuentas cuyo correo coincide, sin distinguir mayúsculas (Auth
 * las normaliza). Recorre la lista completa: getUserByEmail devuelve una.
 * @return {Promise<object[]>} UserRecord, de la más antigua a la más nueva.
 */
async function cuentasConCorreo() {
  const buscado = correo.trim().toLowerCase();
  const encontradas = [];
  let total = 0;
  let pagina;
  do {
    const r = await auth.listUsers(1000, pagina);
    total += r.users.length;
    encontradas.push(...r.users.filter((u) => u.email?.toLowerCase() === buscado));
    pagina = r.pageToken;
  } while (pagina);
  console.log(`  Cuentas en Authentication: ${total}. Con ese correo: ${encontradas.length}.\n`);
  const alta = (u) => new Date(u.metadata.creationTime).getTime();
  return encontradas.sort((a, b) => alta(a) - alta(b));
}

/** Qué cuenta devuelve getUserByEmail, que es la que usan otros scripts. */
async function laDeGetUserByEmail() {
  try {
    return (await auth.getUserByEmail(correo.trim())).uid;
  } catch (error) {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Una cuenta
// ---------------------------------------------------------------------------

async function describir(u, primera) {
  const perfilRef = db.collection('users').doc(u.uid);
  const perfilSnap = await perfilRef.get();
  const perfil = perfilSnap.exists ? perfilSnap.data() : null;
  const username = typeof perfil?.username === 'string' && perfil.username ? perfil.username : null;

  // ¿La reserva de SU nombre apunta a ella?
  let reserva = 'sin nombre en el perfil';
  if (username) {
    const r = await db.collection('usernames').doc(username.toLowerCase()).get();
    if (!r.exists) reserva = 'no: el nombre no está reservado';
    else if (r.get('uid') === u.uid) reserva = 'sí';
    else reserva = `no: apunta a ${typeof r.get('uid') === 'string' ? corto(r.get('uid')) : '(sin uid)'}`;
  }

  const privado = await perfilRef.collection('privado').doc('notificaciones').get();
  const tokens = privado.exists && Array.isArray(privado.get('tokens')) ? privado.get('tokens').length : 0;

  const [
    reservasSuyas, libros, papelera, sesiones, amigos, solicitudes, comentarios, lecturas,
  ] = await Promise.all([
    contar(db.collection('usernames').where('uid', '==', u.uid)),
    contar(db.collection('books').where('userId', '==', u.uid)),
    contar(db.collection('papelera').where('userId', '==', u.uid)),
    contar(perfilRef.collection('sessions')),
    contar(perfilRef.collection('friends')),
    contar(perfilRef.collection('friend_requests')),
    contar(db.collection('book_comments').where('uid', '==', u.uid)),
    contar(db.collection('buddy_reads').where('participants', 'array-contains', u.uid)),
  ]);

  console.log(color.negrita(`  Cuenta ${corto(u.uid)}`));
  console.log('   Authentication');
  linea('alta (creationTime)', fecha(u.metadata.creationTime));
  linea('último inicio de sesión', fecha(u.metadata.lastSignInTime));
  linea('último refresco del token', fecha(u.metadata.lastRefreshTime));
  // Se buscan sin distinguir mayúsculas; esto dice si además es idéntico,
  // carácter a carácter, al de la cuenta más antigua.
  linea('correo idéntico al de la más antigua', siNo(u.email === primera.email));
  linea('correo verificado', siNo(u.emailVerified));
  linea('proveedores', u.providerData.map((p) => p.providerId).join(', ') || '(ninguno)');
  linea('deshabilitada', siNo(u.disabled));
  console.log('   Firestore');
  linea('perfil en users/{uid}', siNo(perfil));
  linea('el perfil tiene username', siNo(username));
  linea('usernames/{su nombre} apunta a ella', reserva);
  linea('reservas de nombre a su uid', reservasSuyas);
  linea('libros', libros);
  linea('papelera', papelera);
  linea('sesiones de lectura', sesiones);
  linea('amigos', amigos);
  linea('solicitudes recibidas', solicitudes);
  linea('comentarios del Club', comentarios);
  linea('lecturas compartidas', lecturas);
  linea('documento privado de tokens', privado.exists ? `sí (${tokens} tokens)` : 'no');
  linea('totalPaginasLeidas', perfil ? numeroO(perfil.totalPaginasLeidas) : '—');
  linea('rachaActual', perfil ? numeroO(perfil.rachaActual) : '—');
  linea('ultimaFechaLectura', perfil ? fechaFirestore(perfil.ultimaFechaLectura) : '—');
  console.log('');
}

// ---------------------------------------------------------------------------

console.log(color.negrita(`\nComparar cuentas con el mismo correo en ${usarEmulador ? 'el emulador' : projectId} (solo lectura)\n`));

const cuentas = await cuentasConCorreo();
if (cuentas.length === 0) {
  console.log(color.amarillo('  Ninguna cuenta con ese correo.\n'));
  process.exit(0);
}

const deGetUser = await laDeGetUserByEmail();
console.log(`  getUserByEmail devuelve: ${deGetUser ? corto(deGetUser) : '(ninguna)'}\n`);

for (const u of cuentas) await describir(u, cuentas[0]);

if (cuentas.length > 1) {
  const [a, b] = cuentas.map((u) => new Date(u.metadata.creationTime).getTime());
  console.log(`  Entre las dos primeras altas: ${Math.round((b - a) / 1000)} s.\n`);
}
