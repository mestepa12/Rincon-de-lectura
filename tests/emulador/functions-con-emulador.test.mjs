// functions/index.js cargado como lo carga el emulador (FUNCTIONS_EMULATOR
// definida). Pareja de functions-sin-emulador.test.mjs, que es la prueba
// contraria. Se lanza con npm run test:emu.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { adminDb, cerrarAdmin } from './entorno.mjs';
import { cargarFunctions, evento, cerrarFunctions } from './functions-en-proceso.mjs';

const { funciones, fcm, messagingRealCargado } = cargarFunctions({ emulador: true });

after(async () => {
  await cerrarFunctions();
  await cerrarAdmin();
});

test('con el emulador, getMessaging() no se llega a llamar y el envío se simula', async () => {
  const ana = 'ana-con-emulador';
  const bea = 'bea-con-emulador';
  await adminDb.doc(`users/${ana}`).set({ uid: ana, username: 'AnaCon' });
  await adminDb.doc(`users/${ana}/privado/notificaciones`).set({ tokens: ['token-falso-1'] });
  await adminDb.doc(`users/${bea}`).set({ uid: bea, username: 'BeaCon' });

  await funciones.onNewChatMessage.run(evento(
    { from: bea, to: ana, type: 'text', text: 'hola' },
    { chatId: `${ana}_${bea}`, messageId: 'm1' },
  ));

  assert.equal(fcm.instancias, 0, 'getMessaging() no debe llamarse en el emulador');
  assert.deepEqual(fcm.envios, []);
  assert.equal(messagingRealCargado(), false, 'el SDK de FCM de verdad no debe cargarse');

  const simulados = await adminDb.collection('_pushSimulados').where('uid', '==', ana).get();
  assert.equal(simulados.size, 1);
  assert.equal(simulados.docs[0].data().title, '💬 Nuevo mensaje de @BeaCon');
});
