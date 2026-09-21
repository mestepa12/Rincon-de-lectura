// Cerrar sesión quitando el token de FCM (cierre-sesion.js) contra Firestore
// y Auth del emulador, con sesiones de usuaria de verdad. FCM va con dobles:
// no tiene emulador. Se lanza con npm run test:emu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { doc, updateDoc, arrayRemove } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { adminDb, crearUsuaria, sesion, cerrarAdmin } from './entorno.mjs';
import { cerrarSesionSinAvisos } from '../../cierre-sesion.js';

const denegado = (e) => e?.code === 'permission-denied';
const tokensDe = async (uid) => (await adminDb.doc(`users/${uid}/privado/notificaciones`).get()).data()?.tokens;

let ana;
let bea;
let carla;
const sesiones = [];

before(async () => {
  ana = await crearUsuaria('ana-cierre@prueba.test');
  bea = await crearUsuaria('bea-cierre@prueba.test');
  carla = await crearUsuaria('carla-cierre@prueba.test');
  for (const [uid, username] of [[ana, 'AnaCierre'], [bea, 'BeaCierre'], [carla, 'CarlaCierre']]) {
    await adminDb.doc(`users/${uid}`).set({ uid, username });
  }
  await adminDb.doc(`users/${ana}/privado/notificaciones`).set({ tokens: ['token-este', 'token-otro'] });
  await adminDb.doc(`users/${bea}/privado/notificaciones`).set({ tokens: ['token-bea'] });
  // Carla no tiene documento privado: nunca activó las notificaciones.
});

after(async () => {
  await Promise.all(sesiones.map((s) => s.cerrar()));
  await cerrarAdmin();
});

/** Las operaciones de la app, con Firestore y signOut de verdad y FCM doble. */
function operaciones(s, uid, cambios = {}) {
  const avisos = [];
  const op = {
    tokenConocido: 'token-este',
    permiso: 'granted',
    obtenerToken: async () => 'token-este',
    quitarDeFirestore: (token) => updateDoc(doc(s.db, 'users', uid, 'privado', 'notificaciones'), { tokens: arrayRemove(token) }),
    borrarEnFcm: async () => {},
    desuscribir: async () => {},
    cerrarSesion: () => signOut(s.auth),
    avisar: (m) => avisos.push(m),
    ...cambios,
  };
  return { op, avisos };
}

test('al cerrar sesión se quita el token de este navegador, y solo ese', async () => {
  const s = await sesion('ana-cierre@prueba.test');
  sesiones.push(s);
  const { op, avisos } = operaciones(s, ana);
  const informe = await cerrarSesionSinAvisos(op);

  assert.deepEqual(await tokensDe(ana), ['token-otro']);
  assert.equal(s.auth.currentUser, null, 'la sesión quedó cerrada');
  assert.equal(informe.firestore, 'quitado');
  assert.deepEqual(avisos, []);
});

test('contraprueba: después del signOut ya no se puede quitar (por eso va antes)', async () => {
  const s = await sesion('bea-cierre@prueba.test');
  sesiones.push(s);
  await signOut(s.auth);
  await assert.rejects(
    updateDoc(doc(s.db, 'users', bea, 'privado', 'notificaciones'), { tokens: arrayRemove('token-bea') }),
    denegado);
  assert.deepEqual(await tokensDe(bea), ['token-bea']);
});

test('sin documento privado: se avisa y la sesión se cierra igual', async () => {
  const s = await sesion('carla-cierre@prueba.test');
  sesiones.push(s);
  const { op, avisos } = operaciones(s, carla);
  const informe = await cerrarSesionSinAvisos(op);

  assert.equal(s.auth.currentUser, null);
  assert.equal(informe.firestore, 'fallo');
  assert.equal(informe.fcm, 'borrado');
  assert.match(avisos.join('\n'), /no se pudo quitar el token de Firestore \(not-found\)/);
});
