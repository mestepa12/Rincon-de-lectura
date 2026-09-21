// Tokens de FCM fuera del perfil: users/{uid}/privado/notificaciones.
// Reglas con sesiones de usuaria de verdad (no Admin), Functions en el
// emulador y el script de migración. Se lanza con npm run test:emu.
//
// Las pruebas de este fichero van en orden (node:test las corre una tras
// otra dentro del fichero) y comparten usuarias.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { adminDb, crearUsuaria, sesion, esperar, cerrarAdmin } from './entorno.mjs';

const denegado = (e) => e?.code === 'permission-denied';
const tokensPrivados = async (uid) => {
  const snap = await adminDb.doc(`users/${uid}/privado/notificaciones`).get();
  return snap.exists ? snap.data().tokens : null;
};

let ana;
let bea;
let carla;
let sAna;
let sBea;
let sCarla;

before(async () => {
  ana = await crearUsuaria('ana-tok@prueba.test');
  bea = await crearUsuaria('bea-tok@prueba.test');
  carla = await crearUsuaria('carla-tok@prueba.test');
  await adminDb.doc(`users/${ana}`).set({ uid: ana, username: 'AnaTok', rachaActual: 2 });
  await adminDb.doc(`users/${bea}`).set({ uid: bea, username: 'BeaTok' });
  // Carla es una usuaria de antes del cambio: sus tokens siguen en el perfil.
  await adminDb.doc(`users/${carla}`).set({
    uid: carla,
    username: 'CarlaTok',
    rachaActual: 4,
    fcmTokens: ['token-carla-1', 'invalido-carla'],
    fcmToken: 'token-carla-viejo',
  });
  await adminDb.doc(`users/${ana}/friends/${bea}`).set({ friendUid: bea, friendUsername: 'BeaTok', since: new Date() });
  await adminDb.doc(`users/${bea}/friends/${ana}`).set({ friendUid: ana, friendUsername: 'AnaTok', since: new Date() });

  sAna = await sesion('ana-tok@prueba.test');
  sBea = await sesion('bea-tok@prueba.test');
  sCarla = await sesion('carla-tok@prueba.test');
});

after(async () => {
  await Promise.all([sAna, sBea, sCarla].filter(Boolean).map((s) => s.cerrar()));
  await cerrarAdmin();
});

test('1. Ana guarda su token en su documento privado, como hace la app', async () => {
  const ref = doc(sAna.db, 'users', ana, 'privado', 'notificaciones');
  await setDoc(ref, { tokens: arrayUnion('token-ana-1') }, { merge: true });
  assert.deepEqual((await getDoc(ref)).data().tokens, ['token-ana-1']);

  // Esquema cerrado: solo ese documento, solo `tokens` y como mucho 20.
  await assert.rejects(setDoc(doc(sAna.db, 'users', ana, 'privado', 'otro'), { tokens: [] }), denegado);
  await assert.rejects(setDoc(ref, { tokens: ['a'], extra: 1 }), denegado);
  await assert.rejects(setDoc(ref, { tokens: Array.from({ length: 21 }, (_, i) => `t${i}`) }), denegado);
});

test('2. Bea no puede leer, escribir ni listar los tokens de Ana', async () => {
  const ref = doc(sBea.db, 'users', ana, 'privado', 'notificaciones');
  await assert.rejects(getDoc(ref), denegado);
  await assert.rejects(setDoc(ref, { tokens: ['token-de-bea'] }), denegado);
  await assert.rejects(updateDoc(ref, { tokens: arrayUnion('token-de-bea') }), denegado);
  await assert.rejects(getDocs(collection(sBea.db, 'users', ana, 'privado')), denegado);
  assert.deepEqual(await tokensPrivados(ana), ['token-ana-1']);
});

test('3. el perfil ya no acepta tokens, y los perfiles antiguos se siguen pudiendo editar', async () => {
  const perfilAna = doc(sAna.db, 'users', ana);
  await assert.rejects(updateDoc(perfilAna, { fcmTokens: arrayUnion('x') }), denegado);
  await assert.rejects(updateDoc(perfilAna, { fcmToken: 'x' }), denegado);

  // Carla todavía tiene fcmTokens en el perfil: tocar otros campos vale.
  await updateDoc(doc(sCarla.db, 'users', carla), { rachaActual: 5 });
  assert.equal((await adminDb.doc(`users/${carla}`).get()).data().rachaActual, 5);
});

test('4. las notificaciones salen del documento privado y el token inválido se limpia de ahí', async () => {
  await adminDb.doc(`users/${ana}/privado/notificaciones`).update({ tokens: ['token-ana-1', 'invalido-ana'] });

  const participantes = [ana, bea].sort();
  const chatId = participantes.join('_');
  await setDoc(doc(sBea.db, 'chats', chatId), { participants: participantes });
  await addDoc(collection(sBea.db, 'chats', chatId, 'messages'), {
    from: bea, to: ana, type: 'text', text: 'hola', timestamp: serverTimestamp(),
  });

  const simulado = await esperar(async () => {
    const q = await adminDb.collection('_pushSimulados').where('uid', '==', ana).get();
    return q.empty ? null : q.docs[0].data();
  }, { que: 'el envío simulado a Ana' });
  assert.equal(simulado.tokens, 2);

  const tokens = await esperar(async () => {
    const t = await tokensPrivados(ana);
    return t.length === 1 ? t : null;
  }, { que: 'la limpieza del token inválido de Ana' });
  assert.deepEqual(tokens, ['token-ana-1']);

  // La limpieza no debe dejar un fcmTokens vacío en un perfil que no lo tenía.
  assert.equal('fcmTokens' in (await adminDb.doc(`users/${ana}`).get()).data(), false);
});

test('5. un perfil con tokens antiguos ya NO recibe avisos por ellos', async () => {
  // Los tokens viven solo en el documento privado. Carla sigue teniendo
  // fcmTokens y fcmToken en su perfil (sembrados arriba, como una cuenta
  // anterior a la migración) y no le debe llegar nada por ahí.
  const previos = await adminDb.collection('_pushSimulados').get();
  await Promise.all(previos.docs.map((d) => d.ref.delete()));

  // Bea le pide amistad a Carla desde el cliente: dispara
  // onFriendRequestCreated. Y a la vez, un mensaje de chat a Ana, que sí
  // tiene token privado: es el testigo. Cuando llegue el aviso de Ana,
  // el de Carla ya habría llegado si fuera a llegar.
  await setDoc(doc(sBea.db, 'users', carla, 'friend_requests', bea), {
    fromUid: bea, fromUsername: 'BeaTok', status: 'pending', timestamp: serverTimestamp(),
  });
  const participantes = [ana, bea].sort();
  const chatId = participantes.join('_');
  await addDoc(collection(sBea.db, 'chats', chatId, 'messages'), {
    from: bea, to: ana, type: 'text', text: 'testigo', timestamp: serverTimestamp(),
  });

  await esperar(async () => {
    const q = await adminDb.collection('_pushSimulados').where('uid', '==', ana).get();
    return q.empty ? null : q.docs[0].data();
  }, { que: 'el envío simulado a Ana (testigo)' });
  await new Promise((ok) => setTimeout(ok, 500)); // margen para el de Carla

  const aCarla = await adminDb.collection('_pushSimulados').where('uid', '==', carla).get();
  assert.equal(aCarla.size, 0, 'no sale ningún aviso a los tokens del perfil');

  // Y sus campos antiguos se quedan como estaban: ya no se leen ni se limpian.
  const perfil = (await adminDb.doc(`users/${carla}`).get()).data();
  assert.deepEqual(perfil.fcmTokens, ['token-carla-1', 'invalido-carla']);
  assert.equal(perfil.fcmToken, 'token-carla-viejo');
  assert.equal(await tokensPrivados(carla), null, 'sin documento privado, no hay tokens');
});

/**
 * Ejecuta el script de migración contra el emulador.
 * @param {string[]} extra Argumentos adicionales.
 * @return {{status: number, stdout: string, stderr: string}}
 */
function migrar(...extra) {
  return spawnSync(process.execPath, ['scripts/migrar-tokens-fcm.mjs', '--emulador', ...extra], {
    encoding: 'utf8', timeout: 60000,
  });
}
const numero = (salida, etiqueta) => Number(new RegExp(`${etiqueta}:\\s+(\\d+)`).exec(salida)?.[1]);

test('6. el script de migración mueve los tokens, no imprime ninguno y es idempotente', async () => {
  const mig = (id) => `mig-${id}`;
  await adminDb.doc(`users/${mig('dana')}`).set({ username: 'Dana', fcmTokens: ['tok-dana-1', 'tok-dana-2'], fcmToken: 'tok-dana-3' });
  await adminDb.doc(`users/${mig('eva')}`).set({ username: 'Eva', fcmTokens: [] });
  await adminDb.doc(`users/${mig('fede')}`).set({ username: 'Fede', fcmToken: 'tok-fede-1' });
  await adminDb.doc(`users/${mig('fede')}/privado/notificaciones`).set({ tokens: ['tok-fede-nuevo'] });
  await adminDb.doc(`users/${mig('gala')}`).set({ username: 'Gala' });
  await adminDb.doc(`users/${mig('gala')}/privado/notificaciones`).set({ tokens: ['tok-gala-1'] });
  // 21 en el perfil + 1 en el privado = 22: se quedan 20.
  await adminDb.doc(`users/${mig('hana')}`).set({
    username: 'Hana', fcmTokens: Array.from({ length: 21 }, (_, i) => `tok-hana-${i}`),
  });
  await adminDb.doc(`users/${mig('hana')}/privado/notificaciones`).set({ tokens: ['tok-hana-nuevo'] });

  // Sin --aplicar: cuenta y no toca nada.
  const recuento = migrar();
  assert.equal(recuento.status, 0, recuento.stderr);
  assert.ok(numero(recuento.stdout, 'con algún token \\(los que hay que mover\\)') >= 4, recuento.stdout);
  assert.ok(numero(recuento.stdout, 'con el campo pero sin tokens') >= 1, recuento.stdout);
  assert.ok(numero(recuento.stdout, `Pasarían del tope de 20 al juntar`) >= 1, recuento.stdout);
  assert.ok('fcmTokens' in (await adminDb.doc(`users/${mig('dana')}`).get()).data());

  const aplicado = migrar('--aplicar');
  assert.equal(aplicado.status, 0, aplicado.stdout + aplicado.stderr);
  assert.equal(numero(aplicado.stdout, 'Quedan perfiles con fcmTokens o fcmToken'), 0);
  assert.ok(numero(aplicado.stdout, 'Descartados por el tope') >= 2, aplicado.stdout);

  // Ni tokens ni uids en la salida.
  for (const salida of [recuento.stdout, aplicado.stdout]) {
    assert.doesNotMatch(salida, /tok-|token-|invalido-|mig-/);
    for (const uid of [ana, bea, carla]) assert.equal(salida.includes(uid), false);
  }

  const sinCampos = async (id) => {
    const d = (await adminDb.doc(`users/${id}`).get()).data();
    return !('fcmTokens' in d) && !('fcmToken' in d);
  };
  for (const id of ['dana', 'eva', 'fede', 'hana'].map(mig).concat(carla)) {
    assert.ok(await sinCampos(id), `${id} conserva campos antiguos`);
  }
  assert.deepEqual((await tokensPrivados(mig('dana'))).sort(), ['tok-dana-1', 'tok-dana-2', 'tok-dana-3']);
  assert.equal(await tokensPrivados(mig('eva')), null, 'sin tokens no se crea documento privado');
  assert.deepEqual((await tokensPrivados(mig('fede'))).sort(), ['tok-fede-1', 'tok-fede-nuevo']);
  assert.deepEqual(await tokensPrivados(mig('gala')), ['tok-gala-1']);
  const hana = await tokensPrivados(mig('hana'));
  assert.equal(hana.length, 20);
  assert.equal(hana[0], 'tok-hana-nuevo', 'el del documento privado se queda');
  assert.ok(hana.includes('tok-hana-20') && !hana.includes('tok-hana-0'), 'del perfil, los más nuevos');
  // Los tres de Carla, el inválido incluido: desde que las Functions no
  // miran el perfil, nadie los limpia de ahí; los mueve la migración y ya
  // los depurará el primer envío que los use.
  assert.deepEqual((await tokensPrivados(carla)).sort(),
    ['invalido-carla', 'token-carla-1', 'token-carla-viejo']);
  assert.equal((await adminDb.doc(`users/${carla}`).get()).data().rachaActual, 5, 'el resto del perfil no se toca');

  // Segunda pasada: nada que hacer.
  const otra = migrar('--aplicar');
  assert.equal(otra.status, 0, otra.stderr);
  assert.match(otra.stdout, /Nada que migrar/);
});

test('6b. el script se niega a escribir en un proyecto real sin terminal, antes de conectar', () => {
  const entorno = { ...process.env };
  delete entorno.FIRESTORE_EMULATOR_HOST;
  const r = spawnSync(process.execPath, ['scripts/migrar-tokens-fcm.mjs', '--proyecto', 'dev', '--aplicar'], {
    encoding: 'utf8', timeout: 30000, env: entorno, stdio: ['pipe', 'pipe', 'pipe'],
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /exige confirmación interactiva/);
  assert.doesNotMatch(r.stdout, /Perfiles:/, 'no debe haber llegado a contar');
});
