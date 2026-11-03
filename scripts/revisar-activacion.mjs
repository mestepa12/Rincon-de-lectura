#!/usr/bin/env node
// ¿Dónde se cae la gente? Embudo de activación, solo con recuentos.
//
//   node scripts/revisar-activacion.mjs --emulador
//   node scripts/revisar-activacion.mjs --proyecto prod
//
// Por qué: hay ~100 cuentas y solo 2-3 usuarias activas al día. Este script
// cuenta cuántas pasan cada escalón (cuenta → perfil → libros → sesiones →
// lectura reciente) y reparte las altas por mes para ver si las que no
// vuelven son las antiguas o las recientes.
//
// SOLO LECTURA: ninguna escritura en Auth ni en Firestore (ni set, update,
// delete, batch ni runTransaction). No imprime nombres, correos, uids ni
// títulos: solo recuentos.
//
// Coste acotado por número de perfiles, no por tamaño de las bibliotecas:
// por cada perfil hace 4 count() (libros, libros de Goodreads, sesiones y
// amigos), que cobran 1 lectura por cada mil entradas del índice (mínimo 1),
// y 1 get() de privado/notificaciones. Más 1 lectura por perfil al recorrer
// /users (con select() de los dos campos de fecha). Unas 6 lecturas por
// perfil: ~600 para 100 perfiles. Recorrer Authentication no cobra.
//
// Mismas guardas que los demás scripts: hay que elegir destino, no habla con
// un proyecto real si las variables de emulador están puestas, credenciales
// de ADC y firebase-admin de functions/node_modules. Ejecutar desde la raíz.
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
const MS_POR_DIA = 24 * 60 * 60 * 1000;
// Consultas por perfil en vuelo a la vez: de sobra para 100 perfiles sin
// abrir cientos de peticiones de golpe.
const PARALELO = 10;

const args = process.argv.slice(2);
const usarEmulador = args.includes('--emulador');
const iProyecto = args.indexOf('--proyecto');
const alias = iProyecto === -1 ? null : args[iProyecto + 1];

if (usarEmulador === Boolean(alias) || (alias && !['prod', 'dev'].includes(alias))) {
  console.error(color.rojo(`
✗ Indica UN destino:
    --emulador            emuladores locales (Firestore ${EMULADOR_FIRESTORE}, Auth ${EMULADOR_AUTH})
    --proyecto prod|dev   proyecto real, con Application Default Credentials
`));
  process.exit(1);
}

// Con cualquiera de las dos variables puestas, el Admin SDK hablaría con un
// emulador aunque se pida el proyecto real, y los recuentos de ahí
// parecerían la respuesta buena.
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

// En el emulador los datos viven bajo el ID de producción (ver
// scripts/dev-emuladores.mjs); es solo una etiqueta local.
const projectId = usarEmulador ? PROD : proyecto(alias);
const app = usarEmulador
  ? initializeApp({ projectId })
  : initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);
const auth = getAuth(app);

const ahora = Date.now();
console.log(color.negrita(
  `\n▶ Activación · ${usarEmulador ? `EMULADORES ${EMULADOR_FIRESTORE} / ${EMULADOR_AUTH}` : `PROYECTO ${projectId}`}` +
  ` · ${new Date(ahora).toISOString()}\n`,
));

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const FORMATO_MES = new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, year: 'numeric', month: '2-digit' });
/** 'AAAA-MM' en hora de Madrid. */
function mes(ms) {
  const p = Object.fromEntries(FORMATO_MES.formatToParts(new Date(ms)).map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month.padStart(2, '0')}`;
}

/** Milisegundos de un Timestamp de Firestore, o null si no lo es. */
function msDe(v) {
  return v && typeof v.toMillis === 'function' ? v.toMillis() : null;
}

/** Tramo de antigüedad de una fecha: '≤7', '8-30', '>30' o 'futuro'. */
function tramoDias(ms) {
  const dias = (ahora - ms) / MS_POR_DIA;
  if (dias < 0) return 'futuro';
  if (dias <= 7) return '≤7';
  if (dias <= 30) return '8-30';
  return '>30';
}

/** Reparte n en el primer tramo [min, max, etiqueta] que lo contiene. */
const tramo = (tramos, n) => tramos.find(([a, b]) => n >= a && n <= b)[2];
const contar = (mapa, clave) => mapa.set(clave, (mapa.get(clave) || 0) + 1);
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)} %` : '—');

/** Ejecuta fn sobre cada elemento con como mucho `n` en vuelo. */
async function enParalelo(items, n, fn) {
  const resultados = new Array(items.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      resultados[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador));
  return resultados;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/** Todas las cuentas de Authentication: uid → { alta, ultimoAcceso }. */
async function cuentasAuth() {
  const cuentas = new Map();
  let pagina;
  do {
    const r = await auth.listUsers(1000, pagina);
    for (const u of r.users) {
      const m = u.metadata;
      // lastRefreshTime se actualiza cada vez que la app renueva el token
      // (cada hora con la app abierta): mejor señal de "ha vuelto" que
      // lastSignInTime, que solo cambia al iniciar sesión.
      const accesos = [m.lastSignInTime, m.lastRefreshTime]
        .filter(Boolean).map((t) => new Date(t).getTime()).filter(Number.isFinite);
      cuentas.set(u.uid, {
        alta: new Date(m.creationTime).getTime(),
        ultimoAcceso: accesos.length ? Math.max(...accesos) : null,
      });
    }
    pagina = r.pageToken;
  } while (pagina);
  return cuentas;
}

/** Recuentos de un perfil. Solo count() y un get(); nada de contenido. */
async function datosDePerfil(uid) {
  const libros = db.collection('books').where('userId', '==', uid);
  const perfil = db.collection('users').doc(uid);
  const [nLibros, nGoodreads, nSesiones, nAmigos, privado] = await Promise.all([
    libros.count().get(),
    libros.where('importedFrom', '==', 'goodreads').count().get(),
    perfil.collection('sessions').count().get(),
    perfil.collection('friends').count().get(),
    perfil.collection('privado').doc('notificaciones').get(),
  ]);
  const tokens = privado.exists ? privado.get('tokens') : null;
  return {
    libros: nLibros.data().count,
    goodreads: nGoodreads.data().count,
    sesiones: nSesiones.data().count,
    amigos: nAmigos.data().count,
    notificaciones: Array.isArray(tokens) && tokens.length > 0,
  };
}

let cuentas;
let perfiles;
try {
  cuentas = await cuentasAuth();
  perfiles = [];
  const snap = await db.collection('users').select('ultimaFechaLectura').get();
  const datos = await enParalelo(snap.docs, PARALELO, (d) => datosDePerfil(d.id));
  snap.docs.forEach((d, i) => {
    const v = d.get('ultimaFechaLectura');
    perfiles.push({
      uid: d.id,
      ultimaLectura: msDe(v),
      ultimaLecturaRara: v !== undefined && v !== null && msDe(v) === null,
      ...datos[i],
    });
  });
} catch (error) {
  console.error(color.rojo(`✗ La consulta falló: ${error.message}\n`));
  await db.terminate();
  process.exit(1);
}
await db.terminate();

// ---------------------------------------------------------------------------
// Recuentos
// ---------------------------------------------------------------------------

const TRAMOS_LIBROS = [[0, 0, '0'], [1, 2, '1-2'], [3, 5, '3-5'], [6, 20, '6-20'], [21, Infinity, 'más de 20']];
const TRAMOS_SESIONES = [[0, 0, '0'], [1, 1, '1'], [2, 5, '2-5'], [6, 20, '6-20'], [21, Infinity, 'más de 20']];
const TRAMOS_FECHA = ['≤7', '8-30', '>30', 'futuro', 'sin fecha'];

const nPerfiles = perfiles.length;
const uidsPerfil = new Set(perfiles.map((p) => p.uid));
const perfilesSinAuth = perfiles.filter((p) => !cuentas.has(p.uid)).length;
const authSinPerfil = [...cuentas.keys()].filter((uid) => !uidsPerfil.has(uid)).length;

const porLibros = new Map(TRAMOS_LIBROS.map(([, , t]) => [t, 0]));
const porSesiones = new Map(TRAMOS_SESIONES.map(([, , t]) => [t, 0]));
const porFecha = new Map(TRAMOS_FECHA.map((t) => [t, 0]));
let conSesion = 0;
let conNotif = 0;
let conAmigo = 0;
let conGoodreads = 0;
let librosGoodreads = 0;
let conLibros = 0;
let conLibrosYSesion = 0;
let conTresLibros = 0;
let fechaRara = 0;

for (const p of perfiles) {
  contar(porLibros, tramo(TRAMOS_LIBROS, p.libros));
  contar(porSesiones, tramo(TRAMOS_SESIONES, p.sesiones));
  contar(porFecha, p.ultimaLectura === null ? 'sin fecha' : tramoDias(p.ultimaLectura));
  if (p.ultimaLecturaRara) fechaRara++;
  if (p.sesiones > 0) conSesion++;
  if (p.notificaciones) conNotif++;
  if (p.amigos > 0) conAmigo++;
  if (p.goodreads > 0) conGoodreads++;
  librosGoodreads += p.goodreads;
  if (p.libros > 0) {
    conLibros++;
    if (p.sesiones > 0) conLibrosYSesion++;
  }
  if (p.libros >= 3) conTresLibros++;
}

// Accesos (Auth) de todas las cuentas, tengan perfil o no.
const porAcceso = new Map(['≤7', '8-30', '>30', 'futuro', 'nunca'].map((t) => [t, 0]));
for (const c of cuentas.values()) contar(porAcceso, c.ultimoAcceso === null ? 'nunca' : tramoDias(c.ultimoAcceso));

// Altas por mes (fecha de Auth). Los perfiles sin cuenta en Auth no tienen
// fecha de alta y se cuentan aparte arriba.
const perfilPorUid = new Map(perfiles.map((p) => [p.uid, p]));
const porMes = new Map();
for (const [uid, c] of cuentas) {
  const clave = Number.isFinite(c.alta) ? mes(c.alta) : 'desconocido';
  if (!porMes.has(clave)) porMes.set(clave, { altas: 0, perfil: 0, libros: 0, sesion: 0, lectura30: 0, acceso30: 0 });
  const f = porMes.get(clave);
  const p = perfilPorUid.get(uid);
  f.altas++;
  if (c.ultimoAcceso !== null && ahora - c.ultimoAcceso <= 30 * MS_POR_DIA) f.acceso30++;
  if (!p) continue;
  f.perfil++;
  if (p.libros > 0) f.libros++;
  if (p.sesiones > 0) f.sesion++;
  if (p.ultimaLectura !== null && ahora - p.ultimaLectura <= 30 * MS_POR_DIA) f.lectura30++;
}

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------

const fila = (etiqueta, n, total) =>
  console.log(`  ${etiqueta.padEnd(46)} ${String(n).padStart(5)}${total === undefined ? '' : `   ${pct(n, total).padStart(5)}`}`);
const titulo = (t) => console.log(color.negrita(`\n  ${t}`));

titulo('Cuentas');
fila('Cuentas en Authentication', cuentas.size);
fila('Perfiles en /users', nPerfiles);
fila('  perfiles sin cuenta en Auth', perfilesSinAuth);
fila('  cuentas de Auth sin perfil', authSinPerfil);

titulo('Embudo (sobre perfiles)');
fila('Perfiles', nPerfiles, nPerfiles);
fila('  con al menos 1 libro', conLibros, nPerfiles);
fila('  con 3 libros o más', conTresLibros, nPerfiles);
fila('  con al menos 1 sesión de lectura', conSesion, nPerfiles);
fila('  ultimaFechaLectura en los últimos 30 días', porFecha.get('≤7') + porFecha.get('8-30'), nPerfiles);
fila('  ultimaFechaLectura en los últimos 7 días', porFecha.get('≤7'), nPerfiles);
console.log('');
fila('De los que tienen libros, con alguna sesión', conLibrosYSesion, conLibros);
fila('De los que tienen libros, sin ninguna', conLibros - conLibrosYSesion, conLibros);

titulo('Libros por perfil');
for (const [t, n] of porLibros) fila(`  ${t}`, n, nPerfiles);

titulo('Sesiones de lectura por perfil');
for (const [t, n] of porSesiones) fila(`  ${t}`, n, nPerfiles);

titulo('ultimaFechaLectura');
fila('  últimos 7 días', porFecha.get('≤7'), nPerfiles);
fila('  de 8 a 30 días', porFecha.get('8-30'), nPerfiles);
fila('  hace más de 30 días', porFecha.get('>30'), nPerfiles);
fila('  sin fecha', porFecha.get('sin fecha'), nPerfiles);
if (porFecha.get('futuro')) console.log(color.amarillo(`    en el futuro: ${porFecha.get('futuro')}`));
if (fechaRara) console.log(color.amarillo(`    (de "sin fecha", ${fechaRara} tienen el campo pero no es un Timestamp)`));

titulo('Último acceso según Auth (todas las cuentas)');
fila('  últimos 7 días', porAcceso.get('≤7'), cuentas.size);
fila('  de 8 a 30 días', porAcceso.get('8-30'), cuentas.size);
fila('  hace más de 30 días', porAcceso.get('>30'), cuentas.size);
fila('  sin registro', porAcceso.get('nunca'), cuentas.size);
if (porAcceso.get('futuro')) console.log(color.amarillo(`    en el futuro: ${porAcceso.get('futuro')}`));

titulo('Otras señales (sobre perfiles)');
fila('Notificaciones activadas (algún token)', conNotif, nPerfiles);
fila('Al menos un amigo', conAmigo, nPerfiles);
fila('Importaron desde Goodreads', conGoodreads, nPerfiles);
fila('  libros importados de Goodreads', librosGoodreads);

titulo(`Altas por mes (Auth, hora de ${ZONA})`);
console.log('  mes        altas  perfil  ≥1 libro  ≥1 sesión  leyó ≤30d  entró ≤30d');
for (const clave of [...porMes.keys()].sort()) {
  const f = porMes.get(clave);
  console.log(
    `  ${clave.padEnd(9)} ${String(f.altas).padStart(6)} ${String(f.perfil).padStart(7)}` +
    ` ${String(f.libros).padStart(9)} ${String(f.sesion).padStart(10)}` +
    ` ${String(f.lectura30).padStart(10)} ${String(f.acceso30).padStart(11)}`,
  );
}
console.log('\n  "leyó" = ultimaFechaLectura del perfil; "entró" = último inicio de sesión o renovación de token en Auth.\n');
