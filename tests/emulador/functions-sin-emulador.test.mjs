// Prueba contraria de functions-con-emulador.test.mjs: functions/index.js
// cargado como en Cloud Functions (sin FUNCTIONS_EMULATOR). Aquí sí se usa
// FCM, pero el doble de functions-en-proceso.mjs: el SDK de verdad no se
// carga y nada sale de la máquina. Se lanza con npm run test:emu.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { adminDb, cerrarAdmin } from './entorno.mjs';
import { cargarFunctions, evento, cerrarFunctions } from './functions-en-proceso.mjs';

const { funciones, fcm, messagingRealCargado } = cargarFunctions({ emulador: false });

after(async () => {
  await cerrarFunctions();
  await cerrarAdmin();
});

test('sin el emulador, el envío va a FCM y no se simula', async () => {
  const ana = 'ana-sin-emulador';
  const bea = 'bea-sin-emulador';
  await adminDb.doc(`users/${ana}`).set({ uid: ana, username: 'AnaSin', fcmTokens: ['token-falso-1'] });
  await adminDb.doc(`users/${bea}`).set({ uid: bea, username: 'BeaSin' });

  await funciones.onNewChatMessage.run(evento(
    { from: bea, to: ana, type: 'text', text: 'hola' },
    { chatId: `${ana}_${bea}`, messageId: 'm1' },
  ));

  assert.equal(fcm.instancias, 1, 'getMessaging() se llama una vez, al cargar el módulo');
  assert.deepEqual(fcm.envios, [{ tokens: 1, title: '💬 Nuevo mensaje de @BeaSin' }]);
  assert.equal(messagingRealCargado(), false, 'el doble tiene que haber sustituido al SDK de verdad');

  const simulados = await adminDb.collection('_pushSimulados').where('uid', '==', ana).get();
  assert.equal(simulados.size, 0);
});
