// En el emulador, las Functions no mandan notificaciones a FCM: las
// simulan (functions/index.js, simularEnvio). Se lanza con npm run test:emu.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { adminDb, crearUsuaria, sesion, esperar, cerrarAdmin } from './entorno.mjs';

after(cerrarAdmin);

test('un mensaje de chat no sale a FCM: queda simulado y el token inválido se limpia', async () => {
  const ana = await crearUsuaria('ana-fcm@prueba.test');
  const bea = await crearUsuaria('bea-fcm@prueba.test');
  await adminDb.doc(`users/${ana}`).set({
    uid: ana, username: 'AnaFcm', fcmTokens: ['token-falso-1', 'invalido-1'],
  });
  await adminDb.doc(`users/${bea}`).set({ uid: bea, username: 'BeaFcm' });
  await adminDb.doc(`users/${ana}/friends/${bea}`).set({ friendUid: bea, friendUsername: 'BeaFcm', since: new Date() });
  await adminDb.doc(`users/${bea}/friends/${ana}`).set({ friendUid: ana, friendUsername: 'AnaFcm', since: new Date() });

  // Bea escribe a Ana desde el cliente, como en la app: pasa por las reglas
  // del chat y dispara onNewChatMessage.
  const s = await sesion('bea-fcm@prueba.test');
  try {
    const participantes = [ana, bea].sort();
    const chatId = participantes.join('_');
    await setDoc(doc(s.db, 'chats', chatId), { participants: participantes });
    await addDoc(collection(s.db, 'chats', chatId, 'messages'), {
      from: bea, to: ana, type: 'text', text: 'hola', timestamp: serverTimestamp(),
    });
  } finally {
    await s.cerrar();
  }

  const simulado = await esperar(async () => {
    const q = await adminDb.collection('_pushSimulados').where('uid', '==', ana).get();
    return q.empty ? null : q.docs[0].data();
  }, { que: 'el envío simulado a Ana' });

  // Ni tokens ni cuerpo (el cuerpo lleva el texto del mensaje).
  assert.deepEqual(Object.keys(simulado).sort(), ['at', 'title', 'tokens', 'uid', 'url']);
  assert.equal(simulado.tokens, 2);
  assert.equal(simulado.title, '💬 Nuevo mensaje de @BeaFcm');
  assert.equal(simulado.url, `/biblioteca.html?chat=${encodeURIComponent(bea)}`);

  // Se limpia solo el inválido. El FCM real también habría rechazado
  // 'token-falso-1', que no es un token de verdad, y la limpieza lo habría
  // borrado: que siga ahí demuestra que no se llamó a FCM.
  const tokens = await esperar(async () => {
    const t = (await adminDb.doc(`users/${ana}`).get()).data().fcmTokens;
    return t.length === 1 ? t : null;
  }, { que: 'la limpieza del token inválido' });
  assert.deepEqual(tokens, ['token-falso-1']);
});
