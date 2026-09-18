#!/usr/bin/env node
// ¿De dónde salen los perfiles con nombre que no se podrían encontrar con una
// búsqueda exacta sobre /usernames? Recuentos cruzados, sin identificar a
// nadie.
//
//   node scripts/investigar-perfiles-sin-reserva.mjs --emulador
//   node scripts/investigar-perfiles-sin-reserva.mjs --proyecto prod
//
// Grupos (los mismos que revisar-reservas-usernames.mjs):
//   - SIN RESERVA: perfil con nombre y sin usernames/{nombre en minúsculas}.
//   - RESERVADO A OTRO UID: la reserva de su nombre apunta a otra cuenta.
//   - SIN NOMBRE: perfiles a medias.
//   - ENCONTRABLES: el resto, como referencia para comparar.
//
// De cada perfil mira, en Firestore: si tiene quizResults, si el nombre se
// sale del formato del registro, si searchKey casa con el nombre, si tiene
// otra reserva con otro nombre, cuántos libros y amigos tiene y cuándo leyó
// por última vez. En Firebase Auth: si la cuenta existe, con qué proveedor
// entra, si verificó el correo, cuándo se dio de alta y cuándo entró por
// última vez, y si su nombre sale del nombre de su cuenta de Google.
//
// SOLO LECTURA. Pinta números y nada más: ni nombres ni uids ni correos.
// Para comparar lee nombres (y, en RESERVADO A OTRO UID, correos y nombres
// de Google de las dos cuentas), que pasan por memoria.
//
// La parte de Auth es opcional: si falla (por ejemplo, las credenciales de
// usuario de ADC sin proyecto de cuota: `gcloud auth application-default
// set-quota-project <id>`), lo dice y sigue con lo de Firestore.
//
// Las épocas salen de las fechas de los commits, no de los despliegues:
//   12/06  5c55b13  aparecen las reservas en /usernames
//   18/07  3f196af  muro del test, que genera el nombre desde Google
//   23/07  710ba10  onboarding: el login con Google ya pide el nombre
//   11/09  2203e75  el muro del test deja de crear perfiles sin nombre
//
// Mismas guardas que revisar-reservas-usernames.mjs, y además con la
// variable del emulador de Auth. Ejecutar desde la raíz del repo.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { proyecto, PROD } from './lib/proyectos.mjs';
import { color } from './lib/proc.mjs';

const EMULADOR_FIRESTORE = '127.0.0.1:8080';
const EMULADOR_AUTH = '127.0.0.1:9099';
const FORMATO = /^[a-zA-Z0-9_]{3,30}$/;
const DIA = 24 * 60 * 60 * 1000;

const ERAS = [
  ['antes del 12/06 (sin reservas)', Date.UTC(2026, 5, 12)],
  ['12/06-18/07 (reservas; Google con nombre real)', Date.UTC(2026, 6, 18)],
  ['18/07-23/07 (además, muro del test)', Date.UTC(2026, 6, 23)],
  ['23/07-11/09 (onboarding; el test aún con nombre real)', Date.UTC(2026, 8, 11)],
  ['desde el 11/09', Infinity],
];

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

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** @return {string} Etiqueta de la época en que cae un instante. */
function era(ms) {
  if (!Number.isFinite(ms)) return 'sin fecha';
  return ERAS.find(([, hasta]) => ms < hasta)[0];
}

/** @return {string} Antigüedad del último acceso, en tramos. */
function tramoAcceso(ms) {
  if (!Number.isFinite(ms)) return 'nunca';
  const dias = (Date.now() - ms) / DIA;
  if (dias <= 30) return 'últimos 30 días';
  if (dias <= 90) return 'hace 30-90 días';
  return 'hace más de 90 días';
}

/** @return {number} ms de un Timestamp de Firestore, o NaN. */
const msDe = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : NaN);

/** Cuenta cuántos cumplen, sobre el total del grupo. */
const de = (lista, pred) => `${lista.filter(pred).length} de ${lista.length}`;

/** Reparto de una etiqueta, de más a menos: ["A: 2", "B: 1"]. */
function repartoLineas(lista, etiqueta) {
  const m = new Map();
  for (const x of lista) m.set(etiqueta(x), (m.get(etiqueta(x)) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`);
}

/** El mismo reparto en una línea: "A: 2 · B: 1". */
const reparto = (lista, etiqueta) => repartoLineas(lista, etiqueta).join(' · ') || '—';

const linea = (texto, valor) => console.log(`    ${texto.padEnd(46)} ${valor}`);

/** Proveedor de acceso de una cuenta de Auth. */
function proveedor(u) {
  if (!u) return 'sin cuenta en Auth';
  const ids = new Set(u.providerData.map((p) => p.providerId));
  if (ids.has('google.com') && ids.has('password')) return 'Google y correo';
  if (ids.has('google.com')) return 'Google';
  if (ids.has('password')) return 'correo';
  return 'otro';
}

/**
 * ¿El nombre es el que generaban auth.js (12/06-23/07) y quiz.js: el
 * displayName de Google sin espacios, cortado a 26, más 0-999?
 */
function nombreDesdeGoogle(nombre, u) {
  const visible = u?.displayName || u?.providerData.find((p) => p.providerId === 'google.com')?.displayName;
  if (!visible || !nombre) return false;
  const base = visible.replace(/\s+/g, '').toLowerCase();
  const n = nombre.toLowerCase();
  // Con y sin el corte a 26: antes del 12/06 auth.js no cortaba.
  return [base, base.slice(0, 26)].some((b) => n.startsWith(b) && /^\d{1,3}$/.test(n.slice(b.length)));
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

console.log(color.negrita(
  `\n▶ De dónde salen los perfiles sin reserva · ${usarEmulador ? 'EMULADORES' : `PROYECTO ${projectId}`}\n`,
));

let salida = 0;
try {
  const perfiles = [];
  const campos = ['username', 'searchKey', 'uid', 'quizResults', 'lastReadTimestamp', 'ultimaFechaLectura'];
  for await (const snap of db.collection('users').select(...campos).stream()) {
    const d = snap.data();
    const nombre = typeof d.username === 'string' && d.username.length > 0 ? d.username : null;
    perfiles.push({
      uid: snap.id,
      nombre,
      quiz: 'quizResults' in d,
      searchKeyCasa: nombre !== null && d.searchKey === nombre.toLowerCase(),
      tieneSearchKey: 'searchKey' in d,
      uidCampoCasa: d.uid === snap.id,
      // Math.max con un NaN da NaN: solo las fechas que existan.
      ultimaLectura: Math.max(...[msDe(d.lastReadTimestamp), msDe(d.ultimaFechaLectura)].filter(Number.isFinite)),
    });
  }
  const porUid = new Map(perfiles.map((p) => [p.uid, p]));

  const reservas = new Map(); // id -> uid
  const reservasDe = new Map(); // uid -> [ids]
  for await (const snap of db.collection('usernames').stream()) {
    const uid = typeof snap.get('uid') === 'string' ? snap.get('uid') : null;
    reservas.set(snap.id, uid);
    if (uid) reservasDe.set(uid, [...(reservasDe.get(uid) || []), snap.id]);
  }

  // Cuántos perfiles llevan cada nombre (en minúsculas): si dos comparten
  // nombre, reservarlo para uno deja sin encontrar al otro.
  const perfilesPorNombre = new Map();
  for (const p of perfiles) {
    if (p.nombre === null) continue;
    const clave = p.nombre.toLowerCase();
    perfilesPorNombre.set(clave, (perfilesPorNombre.get(clave) || 0) + 1);
  }

  for (const p of perfiles) {
    if (p.nombre === null) { p.grupo = 'sinNombre'; continue; }
    p.comparteNombre = perfilesPorNombre.get(p.nombre.toLowerCase()) > 1;
    const clave = p.nombre.toLowerCase();
    p.fueraDeFormato = !FORMATO.test(p.nombre);
    p.otraReserva = (reservasDe.get(p.uid) || []).some((id) => id !== clave);
    if (!reservas.has(clave)) p.grupo = 'sinReserva';
    else if (reservas.get(clave) !== p.uid) { p.grupo = 'deOtra'; p.otroUid = reservas.get(clave); }
    else p.grupo = 'encontrable';
  }

  const grupo = (g) => perfiles.filter((p) => p.grupo === g);
  const sinReserva = grupo('sinReserva');
  const deOtra = grupo('deOtra');
  const sinNombre = grupo('sinNombre');
  const encontrables = grupo('encontrable');

  // Libros y amigos, solo de los grupos pequeños: una agregación por perfil.
  for (const p of [...sinReserva, ...deOtra, ...sinNombre]) {
    p.libros = (await db.collection('books').where('userId', '==', p.uid).count().get()).data().count;
    p.amigos = (await db.collection('users').doc(p.uid).collection('friends').count().get()).data().count;
  }

  // Auth, opcional.
  let auth = null;
  let motivoSinAuth = '';
  try {
    const uids = [...new Set([...perfiles.map((p) => p.uid), ...deOtra.map((p) => p.otroUid)])];
    auth = new Map();
    for (let i = 0; i < uids.length; i += 100) {
      const r = await getAuth(app).getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
      for (const u of r.users) auth.set(u.uid, u);
    }
  } catch (error) {
    auth = null;
    motivoSinAuth = error.code || 'error';
  }
  const alta = (uid) => Date.parse(auth?.get(uid)?.metadata.creationTime ?? '');
  const eraAlta = (uid) => (auth?.has(uid) ? era(alta(uid)) : 'sin cuenta en Auth');
  const tramo = (uid) => (auth?.has(uid)
    ? tramoAcceso(Date.parse(auth.get(uid).metadata.lastSignInTime ?? ''))
    : 'sin cuenta en Auth');

  console.log(`  Perfiles: ${perfiles.length} · encontrables ${encontrables.length} · sin reserva ${sinReserva.length}` +
    ` · reservado a otro uid ${deOtra.length} · sin nombre ${sinNombre.length}`);
  console.log(`  Auth: ${auth ? 'consultado' : `NO disponible (${motivoSinAuth}); solo datos de Firestore`}\n`);

  /** Bloque común de atributos de un grupo. */
  function atributos(lista, { actividad }) {
    linea('con quizResults (pasó por el test)', de(lista, (p) => p.quiz));
    linea('nombre fuera del formato del registro', de(lista, (p) => p.fueraDeFormato));
    linea('searchKey casa con el nombre', de(lista, (p) => p.searchKeyCasa));
    linea('sin searchKey', de(lista, (p) => !p.tieneSearchKey));
    linea('campo uid distinto del ID (o ausente)', de(lista, (p) => !p.uidCampoCasa));
    linea('tiene otra reserva con otro nombre', de(lista, (p) => p.otraReserva));
    linea('comparte nombre con otro perfil', de(lista, (p) => p.comparteNombre));
    if (actividad) {
      linea('con algún libro', de(lista, (p) => p.libros > 0));
      linea('con algún amigo', de(lista, (p) => p.amigos > 0));
      linea('última lectura', reparto(lista, (p) => era(p.ultimaLectura)));
    }
    if (auth) {
      linea('existe en Auth', de(lista, (p) => auth.has(p.uid)));
      linea('proveedor', reparto(lista, (p) => proveedor(auth.get(p.uid))));
      linea('correo verificado', de(lista, (p) => auth.get(p.uid)?.emailVerified === true));
      linea('nombre sacado del nombre de Google', de(lista, (p) => nombreDesdeGoogle(p.nombre ?? '', auth.get(p.uid))));
      linea('alta', reparto(lista, (p) => eraAlta(p.uid)));
      linea('último acceso', reparto(lista, (p) => tramo(p.uid)));
    }
  }

  console.log(color.negrita(`  SIN RESERVA (${sinReserva.length})`));
  atributos(sinReserva, { actividad: true });
  console.log('    combinaciones (proveedor / test / formato / alta):');
  for (const l of repartoLineas(sinReserva, (p) => [
    auth ? proveedor(auth.get(p.uid)) : '¿?',
    p.quiz ? 'con test' : 'sin test',
    p.fueraDeFormato ? 'fuera de formato' : 'en formato',
    auth ? eraAlta(p.uid) : '¿?',
  ].join(' / '))) console.log(`      ${l}`);
  console.log('');

  console.log(color.negrita(`  RESERVADO A OTRO UID (${deOtra.length})`));
  atributos(deOtra, { actividad: true });
  const otro = (p) => porUid.get(p.otroUid);
  linea('la otra cuenta tiene perfil', de(deOtra, (p) => !!otro(p)));
  linea('… y su perfil se llama igual (colisión real)', de(deOtra, (p) => otro(p)?.nombre?.toLowerCase() === p.nombre.toLowerCase()));
  linea('… y su perfil se llama de otra forma', de(deOtra, (p) => !!otro(p)?.nombre && otro(p).nombre.toLowerCase() !== p.nombre.toLowerCase()));
  linea('… y su perfil no tiene nombre', de(deOtra, (p) => !!otro(p) && !otro(p).nombre));
  linea('la otra cuenta tiene varias reservas', de(deOtra, (p) => (reservasDe.get(p.otroUid) || []).length > 1));
  if (auth) {
    const a = (uid) => auth.get(uid);
    linea('la otra cuenta existe en Auth', de(deOtra, (p) => !!a(p.otroUid)));
    linea('proveedor de la otra cuenta', reparto(deOtra, (p) => proveedor(a(p.otroUid))));
    linea('mismo correo en las dos cuentas', de(deOtra, (p) => !!a(p.uid)?.email && a(p.uid)?.email?.toLowerCase() === a(p.otroUid)?.email?.toLowerCase()));
    linea('mismo nombre de Google en las dos', de(deOtra, (p) => !!a(p.uid)?.displayName && a(p.uid)?.displayName === a(p.otroUid)?.displayName));
    linea('esta cuenta es anterior a la otra', de(deOtra, (p) => alta(p.uid) < alta(p.otroUid)));
    linea('alta de la otra cuenta', reparto(deOtra, (p) => eraAlta(p.otroUid)));
    linea('último acceso de la otra cuenta', reparto(deOtra, (p) => tramo(p.otroUid)));
  }
  console.log('');

  console.log(color.negrita(`  SIN NOMBRE (${sinNombre.length})`));
  linea('con quizResults (pasó por el test)', de(sinNombre, (p) => p.quiz));
  linea('tiene alguna reserva', de(sinNombre, (p) => (reservasDe.get(p.uid) || []).length > 0));
  linea('con algún libro', de(sinNombre, (p) => p.libros > 0));
  if (auth) {
    linea('existe en Auth', de(sinNombre, (p) => auth.has(p.uid)));
    linea('proveedor', reparto(sinNombre, (p) => proveedor(auth.get(p.uid))));
    linea('alta', reparto(sinNombre, (p) => eraAlta(p.uid)));
    linea('último acceso', reparto(sinNombre, (p) => tramo(p.uid)));
  }
  console.log('');

  console.log(color.negrita(`  REFERENCIA: ENCONTRABLES (${encontrables.length})`));
  atributos(encontrables, { actividad: false });
  console.log('');
} catch (error) {
  console.error(color.rojo(`✗ Falló: ${error.message}\n`));
  salida = 1;
}
await db.terminate();
process.exit(salida);
