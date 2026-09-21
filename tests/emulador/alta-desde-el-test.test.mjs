// Alta desde el muro del test: el test guarda el resultado, pero el nombre de
// usuario se elige en el onboarding. Aquí se comprueban contra las reglas las
// dos escrituras del flujo (la del test y la del onboarding), con sesiones de
// usuaria de verdad. Se lanza con npm run test:emu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { doc, getDoc, setDoc, updateDoc, FieldPath } from 'firebase/firestore';
import { adminDb, crearUsuaria, sesion, cerrarAdmin } from './entorno.mjs';
import { perfilCompleto } from '../../perfil.js';

const QUIZ = 'tropo-literario';
const denegado = (e) => e?.code === 'permission-denied';

/** Lo único que escribe quiz.js al terminar: el resultado, con updateDoc. */
const guardarResultado = (db, uid, resultado) =>
  updateDoc(doc(db, 'users', uid), new FieldPath('quizResults', QUIZ), resultado);

/**
 * Lo que escribe onboarding.js al enviar el formulario: primero la reserva
 * del nombre, después el perfil con merge.
 * @param {object} db Firestore de la sesión.
 * @param {string} uid Dueña del perfil.
 * @param {string} username Nombre elegido.
 * @return {Promise<void>}
 */
async function completarOnboarding(db, uid, username) {
  await setDoc(doc(db, 'usernames', username.toLowerCase()), { uid });
  await setDoc(doc(db, 'users', uid),
    { username, searchKey: username.toLowerCase(), uid }, { merge: true });
}

let nueva;   // cuenta recién creada, sin perfil (alta con Google desde el muro)
let antigua; // perfil sin nombre de los que dejaba el muro antes
let otra;    // una tercera cuenta, para las reservas ajenas
let sNueva;
let sAntigua;
let sOtra;

before(async () => {
  nueva = await crearUsuaria('nueva-muro@prueba.test');
  antigua = await crearUsuaria('antigua-muro@prueba.test');
  otra = await crearUsuaria('otra-muro@prueba.test');
  // El perfil que dejaba el muro antiguo: datos, pero sin nombre ni reserva.
  await adminDb.doc(`users/${antigua}`).set({
    uid: antigua, rachaActual: 3, quizResults: { 'otro-quiz': 'conservado' },
  });
  sNueva = await sesion('nueva-muro@prueba.test');
  sAntigua = await sesion('antigua-muro@prueba.test');
  sOtra = await sesion('otra-muro@prueba.test');
});

after(async () => {
  await Promise.all([sNueva, sAntigua, sOtra].filter(Boolean).map((s) => s.cerrar()));
  await cerrarAdmin();
});

test('cuenta sin perfil: el test no lo crea al guardar el resultado', async () => {
  await assert.rejects(() => guardarResultado(sNueva.db, nueva, 'cozy'));
  const creado = await adminDb.doc(`users/${nueva}`).get();
  assert.equal(creado.exists, false, 'el test no debe crear el perfil');
});

test('cuenta sin perfil: no está completa, así que va al onboarding', async () => {
  const snap = await getDoc(doc(sNueva.db, 'users', nueva));
  assert.equal(perfilCompleto(snap), false);
});

test('tras elegir nombre en el onboarding, el resultado ya se guarda', async () => {
  await completarOnboarding(sNueva.db, nueva, 'LectoraDelMuro');
  const snap = await getDoc(doc(sNueva.db, 'users', nueva));
  assert.equal(perfilCompleto(snap), true);

  await guardarResultado(sNueva.db, nueva, 'cozy');
  const perfil = (await adminDb.doc(`users/${nueva}`).get()).data();
  assert.equal(perfil.username, 'LectoraDelMuro');
  assert.equal(perfil.searchKey, 'lectoradelmuro');
  assert.equal(perfil.quizResults[QUIZ], 'cozy');
  const reserva = (await adminDb.doc('usernames/lectoradelmuro').get()).data();
  assert.equal(reserva.uid, nueva, 'la reserva tiene que apuntar a su cuenta');
});

test('perfil antiguo sin nombre: elegirlo no borra lo que ya tenía', async () => {
  const antes = await getDoc(doc(sAntigua.db, 'users', antigua));
  assert.equal(perfilCompleto(antes), false, 'sin username no está completo');

  await completarOnboarding(sAntigua.db, antigua, 'VuelveAlMuro');
  await guardarResultado(sAntigua.db, antigua, 'gotico');

  const perfil = (await adminDb.doc(`users/${antigua}`).get()).data();
  assert.equal(perfil.username, 'VuelveAlMuro');
  assert.equal(perfil.rachaActual, 3, 'la racha se conserva');
  assert.equal(perfil.quizResults['otro-quiz'], 'conservado', 'el resultado anterior se conserva');
  assert.equal(perfil.quizResults[QUIZ], 'gotico');
});

test('el nombre elegido es de quien lo elige: no se reserva para otra cuenta', async () => {
  await assert.rejects(
    () => setDoc(doc(sOtra.db, 'usernames', 'nombreajeno'), { uid: nueva }),
    denegado, 'reservar un nombre para otro uid',
  );
  await assert.rejects(
    () => setDoc(doc(sOtra.db, 'usernames', 'lectoradelmuro'), { uid: otra }),
    denegado, 'quedarse con un nombre ya reservado',
  );
  await assert.rejects(
    () => setDoc(doc(sOtra.db, 'users', nueva), { username: 'Suplantada' }, { merge: true }),
    denegado, 'escribir el nombre en el perfil de otra',
  );
});
