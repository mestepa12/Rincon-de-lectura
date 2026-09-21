// obtenerMiNombre() contra Firestore de verdad (emulador), con sesiones de
// usuaria y con la red cortada, que es el caso que no se puede montar con
// dobles: sin red, getDoc devuelve el perfil desde la caché local, y ese
// nombre vale. Se lanza con npm run test:emu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { doc, getDoc, disableNetwork, enableNetwork } from 'firebase/firestore';
import { adminDb, crearUsuaria, sesion, cerrarAdmin } from './entorno.mjs';
import { obtenerMiNombre } from '../../nombre-usuario.js';

/** Lo mismo que hace script.js, con lo que haya en memoria. */
const nombreDe = (s, uid, enMemoria = null) => obtenerMiNombre({
  enMemoria: () => enMemoria,
  leerPerfil: () => getDoc(doc(s.db, 'users', uid)),
});

let conNombre;
let sinNombre;
let sinPerfil;
let sConNombre;
let sSinNombre;
let sSinPerfil;

before(async () => {
  conNombre = await crearUsuaria('con-nombre-mn@prueba.test');
  sinNombre = await crearUsuaria('sin-nombre-mn@prueba.test');
  sinPerfil = await crearUsuaria('sin-perfil-mn@prueba.test');
  await adminDb.doc(`users/${conNombre}`).set({ uid: conNombre, username: 'MiaConNombre', searchKey: 'miaconnombre' });
  // El perfil que dejaba el muro del test: existe, pero sin nombre.
  await adminDb.doc(`users/${sinNombre}`).set({ uid: sinNombre, quizResults: { 'tropo-literario': 'cozy' } });
  sConNombre = await sesion('con-nombre-mn@prueba.test');
  sSinNombre = await sesion('sin-nombre-mn@prueba.test');
  sSinPerfil = await sesion('sin-perfil-mn@prueba.test');
});

after(async () => {
  await Promise.all([sConNombre, sSinNombre, sSinPerfil].filter(Boolean).map((s) => s.cerrar()));
  await cerrarAdmin();
});

test('el nombre sale del perfil cuando no está en memoria', async () => {
  assert.deepEqual(await nombreDe(sConNombre, conNombre), { nombre: 'MiaConNombre', motivo: 'perfil' });
});

test('lo que hay en memoria manda y ahorra la lectura', async () => {
  assert.deepEqual(await nombreDe(sConNombre, conNombre, 'DesdeMemoria'),
    { nombre: 'DesdeMemoria', motivo: 'memoria' });
});

test('sin red, el perfil lo sirve la caché local y ese nombre vale', async () => {
  // Leerlo una vez con red es lo que lo deja en la caché, igual que hace la
  // biblioteca al arrancar.
  await getDoc(doc(sConNombre.db, 'users', conNombre));
  await disableNetwork(sConNombre.db);
  try {
    const deCache = await getDoc(doc(sConNombre.db, 'users', conNombre));
    assert.equal(deCache.metadata.fromCache, true, 'la prueba solo vale si viene de la caché');
    assert.deepEqual(await nombreDe(sConNombre, conNombre), { nombre: 'MiaConNombre', motivo: 'perfil' });
  } finally {
    await enableNetwork(sConNombre.db);
  }
});

test('sin red y sin nada en la caché, no se inventa un nombre', async () => {
  await disableNetwork(sSinPerfil.db);
  try {
    const r = await nombreDe(sSinPerfil, sinPerfil);
    assert.equal(r.nombre, null);
    assert.equal(r.motivo, 'error');
  } finally {
    await enableNetwork(sSinPerfil.db);
  }
});

test('cuenta sin perfil: le toca elegir nombre en el onboarding', async () => {
  assert.deepEqual(await nombreDe(sSinPerfil, sinPerfil), { nombre: null, motivo: 'sin-perfil' });
});

test('perfil sin nombre: tampoco se escribe nada', async () => {
  assert.deepEqual(await nombreDe(sSinNombre, sinNombre), { nombre: null, motivo: 'sin-nombre' });
});
