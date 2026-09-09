#!/usr/bin/env node
// Crea cuentas de prueba con libros en los emuladores.
//
//   npm run emu:semilla        (con los emuladores ya levantados)
//
// Habla por REST con 127.0.0.1: no usa el SDK ni admin, así que no hay
// dependencias nuevas y, sobre todo, no existe ninguna ruta por la que
// pueda acabar escribiendo en el Firestore real. Los hosts están fijos
// abajo y no se leen de ninguna variable de entorno.
import { color } from './lib/proc.mjs';

const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const PROJECT = 'mi-rincon-de-lectura';
const DB = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;

// El emulador acepta cualquier key; no hay ninguna credencial real aquí.
const FAKE_KEY = 'fake-api-key';

const CUENTAS = [
  {
    email: 'ana@prueba.test',
    password: 'prueba1234',
    username: 'AnaPrueba',
    perfil: {
      rachaActual: 5,
      totalPaginasLeidas: 1240,
      paginasLeidasHoy: 32,
      paginasLeidasSemana: 210,
      objetivoPaginasDiarias: 30,
      objetivoPaginasSemanales: 200,
    },
    libros: [
      { title: 'Dune', author: 'Frank Herbert', section: 'leyendo-ahora', totalPages: 680, currentPage: 245, genre: 'Ciencia ficción' },
      { title: 'La sombra del viento', author: 'Carlos Ruiz Zafón', section: 'libros-terminados', totalPages: 576, currentPage: 576, rating: 5, genre: 'Misterio' },
      { title: 'Kafka en la orilla', author: 'Haruki Murakami', section: 'proximas-lecturas', totalPages: 618, currentPage: 0, genre: 'Realismo mágico' },
    ],
  },
  {
    email: 'bea@prueba.test',
    password: 'prueba1234',
    username: 'BeaPrueba',
    perfil: {
      rachaActual: 0,
      totalPaginasLeidas: 310,
      paginasLeidasHoy: 0,
      paginasLeidasSemana: 45,
      objetivoPaginasDiarias: 20,
      objetivoPaginasSemanales: 140,
    },
    libros: [
      { title: 'Cien años de soledad', author: 'Gabriel García Márquez', section: 'leyendo-ahora', totalPages: 471, currentPage: 88, genre: 'Realismo mágico' },
      { title: 'El nombre del viento', author: 'Patrick Rothfuss', section: 'lista-deseos', totalPages: 662, currentPage: 0, genre: 'Fantasía' },
    ],
  },
];

/**
 * Convierte un valor JS al formato tipado que espera la API REST de
 * Firestore ({stringValue}, {integerValue}, ...).
 * @param {*} v Valor a convertir.
 * @return {object} Valor tipado.
 */
function valor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  return { mapValue: { fields: campos(v) } };
}

/**
 * Convierte un objeto plano al mapa de campos tipados de Firestore.
 * @param {object} obj Objeto de origen.
 * @return {object} Campos tipados.
 */
function campos(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, valor(v)]));
}

/**
 * Petición HTTP que lanza si la respuesta no es 2xx.
 * @param {string} url URL destino.
 * @param {object} opciones Opciones de fetch.
 * @return {Promise<object>} Cuerpo JSON de la respuesta.
 */
async function pedir(url, opciones) {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${url}\n${texto.slice(0, 400)}`);
  return texto ? JSON.parse(texto) : {};
}

/**
 * Escribe (o sobrescribe) un documento en el emulador de Firestore.
 * El token "owner" salta las reglas: es la credencial de administrador
 * que el emulador reconoce, y solo existe en el emulador.
 * @param {string} ruta Ruta del documento, p. ej. "users/abc".
 * @param {object} datos Campos del documento.
 * @return {Promise<object>} Documento escrito.
 */
function escribir(ruta, datos) {
  const i = ruta.lastIndexOf('/');
  const coleccion = ruta.slice(0, i);
  const id = ruta.slice(i + 1);
  return pedir(`${DB}/${coleccion}?documentId=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: campos(datos) }),
  });
}

/**
 * Crea un usuario en el emulador de Auth y lo deja con el email
 * verificado (la app exige verificación para entrar a la biblioteca).
 * @param {string} email Correo.
 * @param {string} password Contraseña.
 * @return {Promise<string>} UID del usuario creado.
 */
async function crearUsuario(email, password) {
  const alta = await pedir(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FAKE_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  await pedir(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:update?key=${FAKE_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: alta.localId, emailVerified: true }),
    },
  );
  return alta.localId;
}

// --- Comprobación previa: ¿están los emuladores levantados? ---
try {
  await fetch(`${FIRESTORE}/`, { signal: AbortSignal.timeout(2500) });
} catch {
  console.error(color.rojo(`
✗ No hay ningún emulador escuchando en ${FIRESTORE}.
  Levántalos primero en otra terminal:  npm run dev:emu
`));
  process.exit(1);
}

console.log(color.negrita('\n▶ Sembrando datos en los emuladores\n'));

let totalLibros = 0;
for (const cuenta of CUENTAS) {
  let uid;
  try {
    uid = await crearUsuario(cuenta.email, cuenta.password);
  } catch (error) {
    if (String(error.message).includes('EMAIL_EXISTS')) {
      console.log(color.amarillo(`  ~ ${cuenta.email} ya existe, se omite`));
      continue;
    }
    throw error;
  }

  const clave = cuenta.username.toLowerCase();
  // Mismos campos que escribe auth.js al registrarse, ni uno más: las
  // reglas usan hasOnly(userFields()) y rechazarían cualquier extra.
  await escribir(`users/${uid}`, {
    username: cuenta.username,
    searchKey: clave,
    uid,
    ...cuenta.perfil,
  });
  await escribir(`usernames/${clave}`, { uid });

  for (const libro of cuenta.libros) {
    const id = `seed-${clave}-${totalLibros++}`;
    await escribir(`books/${id}`, { userId: uid, cover: '', notes: '', ...libro });
  }

  console.log(color.verde(`  ✓ ${cuenta.username} (${cuenta.email}) · uid ${uid} · ${cuenta.libros.length} libros`));
}

console.log(`
${color.negrita('  Cuentas de prueba')}
${CUENTAS.map((c) => `    ${c.email}  /  ${c.password}`).join('\n')}

  Panel de los emuladores: http://127.0.0.1:4000/firestore
`);
