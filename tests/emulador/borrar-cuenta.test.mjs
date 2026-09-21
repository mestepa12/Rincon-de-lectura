// scripts/borrar-cuenta.mjs contra los emuladores: una cuenta sembrada en
// los trece sitios donde deja datos, se borra, y se comprueba que no queda
// nada suyo y que lo de las demás personas sigue intacto.
// Se lanza con npm run test:emu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { adminDb, crearUsuaria, cerrarAdmin, PROYECTO } from './entorno.mjs';

const CARPETA_RECIBOS = 'recibos-borrado';

/** Ejecuta el script contra el emulador y devuelve su salida. */
function borrar(extra = []) {
  const r = spawnSync(process.execPath, ['scripts/borrar-cuenta.mjs', '--emulador', ...extra], {
    encoding: 'utf8',
    // Sin las variables de emulador heredadas: el script las pone él, y así
    // se comprueba de paso que no depende del entorno de las pruebas.
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' },
  });
  return { ...r, salida: `${r.stdout}${r.stderr}` };
}

/** Número que el script imprime en una línea con esa etiqueta. */
function numero(salida, etiqueta) {
  const linea = salida.split('\n').find((l) => l.includes(etiqueta));
  assert.ok(linea, `no aparece "${etiqueta}" en la salida`);
  // El primero: alguna línea lleva una aclaración detrás del número.
  const encontrado = linea.slice(linea.indexOf(etiqueta) + etiqueta.length).match(/\d+/);
  assert.ok(encontrado, `"${etiqueta}" no trae número: ${linea}`);
  return Number(encontrado[0]);
}

const existe = async (ruta) => (await adminDb.doc(ruta).get()).exists;
const cuantos = async (ruta) => (await adminDb.collection(ruta).get()).size;

let zoe;   // la que se borra
let ana;   // amiga: conserva sus cosas
let bea;   // le escribió por chat y le mandó una solicitud
let chatZoeAna;
let chatZoeBea;

before(async () => {
  zoe = await crearUsuaria('zoe-borrar@prueba.test');
  ana = await crearUsuaria('ana-borrar@prueba.test');
  bea = await crearUsuaria('bea-borrar@prueba.test');

  const ahora = new Date();
  // 1. Su perfil y 2. la reserva de su nombre
  await adminDb.doc(`users/${zoe}`).set({ uid: zoe, username: 'ZoeBorrar', searchKey: 'zoeborrar', rachaActual: 3 });
  await adminDb.doc('usernames/zoeborrar').set({ uid: zoe });
  await adminDb.doc(`users/${ana}`).set({ uid: ana, username: 'AnaBorrar', searchKey: 'anaborrar' });
  await adminDb.doc('usernames/anaborrar').set({ uid: ana });
  await adminDb.doc(`users/${bea}`).set({ uid: bea, username: 'BeaBorrar', searchKey: 'beaborrar' });

  // 3. Documento privado con sus tokens · 4. sesiones de lectura
  await adminDb.doc(`users/${zoe}/privado/notificaciones`).set({ tokens: ['token-zoe'] });
  await adminDb.doc(`users/${zoe}/sessions/s1`).set({ bookId: 'b1', startAtMs: 1, durationMin: 30, pagesRead: 10 });

  // 5. Su lista de amigos · 6. una solicitud que recibió
  await adminDb.doc(`users/${zoe}/friends/${ana}`).set({ friendUid: ana, friendUsername: 'AnaBorrar', since: ahora });
  await adminDb.doc(`users/${zoe}/friend_requests/${bea}`).set({ fromUid: bea, fromUsername: 'BeaBorrar', status: 'pending' });

  // 7. Su entrada en la lista de Ana · 8. una solicitud que envió a Bea
  await adminDb.doc(`users/${ana}/friends/${zoe}`).set({ friendUid: zoe, friendUsername: 'ZoeBorrar', since: ahora });
  await adminDb.doc(`users/${bea}/friend_requests/${zoe}`).set({ fromUid: zoe, fromUsername: 'ZoeBorrar', status: 'pending' });

  // 9. Libros · 10. papelera · 11. comentarios del Club
  await adminDb.collection('books').add({ userId: zoe, title: 'Dune', section: 'leyendo-ahora' });
  await adminDb.collection('books').add({ userId: zoe, title: 'Solaris', section: 'libros-terminados' });
  await adminDb.collection('papelera').add({ userId: zoe, title: 'Borrado', deletedAt: Date.now() });
  await adminDb.collection('book_comments').add({ bookSlug: 'dune', uid: zoe, username: 'ZoeBorrar', text: 'suyo', page: 10 });

  // 12. Lectura compartida con Ana
  await adminDb.doc(`buddy_reads/${[zoe, ana].sort().join('_')}_dune`).set({
    participants: [zoe, ana].sort(), bookSlug: 'dune', createdBy: zoe,
    usernames: { [zoe]: 'ZoeBorrar', [ana]: 'AnaBorrar' },
  });

  // 13. Chats: uno con Ana (mensajes de las dos) y otro con Bea (solo suyos)
  chatZoeAna = [zoe, ana].sort().join('_');
  chatZoeBea = [zoe, bea].sort().join('_');
  await adminDb.doc(`chats/${chatZoeAna}`).set({ participants: [zoe, ana].sort() });
  await adminDb.doc(`chats/${chatZoeAna}/messages/m1`).set({ from: zoe, to: ana, text: 'suyo', timestamp: ahora });
  await adminDb.doc(`chats/${chatZoeAna}/messages/m2`).set({ from: ana, to: zoe, text: 'de Ana', timestamp: ahora });
  await adminDb.doc(`chats/${chatZoeBea}`).set({ participants: [zoe, bea].sort() });
  await adminDb.doc(`chats/${chatZoeBea}/messages/m1`).set({ from: zoe, to: bea, text: 'suyo', timestamp: ahora });

  // Cosas de Ana que no se pueden tocar
  await adminDb.collection('books').add({ userId: ana, title: 'Suyo', section: 'leyendo-ahora' });
  await adminDb.collection('book_comments').add({ bookSlug: 'dune', uid: ana, username: 'AnaBorrar', text: 'de Ana', page: 5 });
});

after(async () => {
  rmSync(CARPETA_RECIBOS, { recursive: true, force: true });
  await cerrarAdmin();
});

test('1. sin --aplicar cuenta los trece sitios y no borra nada', async () => {
  const r = borrar(['--correo', 'zoe-borrar@prueba.test']);
  assert.equal(r.status, 0, r.salida);

  assert.equal(numero(r.salida, 'en listas de amigos de otras cuentas'), 1);
  assert.equal(numero(r.salida, 'solicitudes que envió'), 1);
  assert.equal(numero(r.salida, 'lecturas compartidas'), 1);
  assert.equal(numero(r.salida, 'mensajes que envió en chats'), 2);
  assert.equal(numero(r.salida, 'conversaciones en las que participa'), 2);
  assert.equal(numero(r.salida, 'perfil (users/{uid})'), 1);
  assert.equal(numero(r.salida, 'documentos privados'), 1);
  assert.equal(numero(r.salida, 'sesiones de lectura'), 1);
  assert.equal(numero(r.salida, 'su lista de amigos'), 1);
  assert.equal(numero(r.salida, 'solicitudes que recibió'), 1);
  assert.equal(numero(r.salida, 'libros:'), 2);
  assert.equal(numero(r.salida, 'papelera'), 1);
  assert.equal(numero(r.salida, 'comentarios del Club'), 1);
  assert.equal(numero(r.salida, 'reservas de nombre'), 1);

  assert.equal(await existe(`users/${zoe}`), true, 'no ha debido borrar nada');
  assert.ok(!existsSync(CARPETA_RECIBOS), 'sin --aplicar no se escribe recibo');
});

test('2. no imprime el correo, ni nombres, ni identificadores', async () => {
  const r = borrar(['--correo', 'zoe-borrar@prueba.test']);
  assert.ok(!r.salida.includes('zoe-borrar@prueba.test'), 'el correo no puede salir por pantalla');
  assert.ok(!r.salida.includes('ZoeBorrar'), 'el nombre de usuario tampoco');
  assert.ok(!r.salida.includes(zoe), 'ni el uid');
});

test('3. con --aplicar no queda nada suyo', async () => {
  const r = borrar(['--correo', 'zoe-borrar@prueba.test', '--aplicar']);
  assert.equal(r.status, 0, r.salida);

  assert.equal(await existe(`users/${zoe}`), false, 'perfil');
  assert.equal(await existe(`users/${zoe}/privado/notificaciones`), false, 'documento privado');
  assert.equal(await cuantos(`users/${zoe}/sessions`), 0, 'sesiones');
  assert.equal(await cuantos(`users/${zoe}/friends`), 0, 'su lista de amigos');
  assert.equal(await cuantos(`users/${zoe}/friend_requests`), 0, 'solicitudes recibidas');
  assert.equal(await existe('usernames/zoeborrar'), false, 'el nombre queda libre');
  assert.equal((await adminDb.collection('books').where('userId', '==', zoe).get()).size, 0, 'libros');
  assert.equal((await adminDb.collection('papelera').where('userId', '==', zoe).get()).size, 0, 'papelera');
  assert.equal((await adminDb.collection('book_comments').where('uid', '==', zoe).get()).size, 0, 'comentarios');
  assert.equal((await adminDb.collection('buddy_reads').where('participants', 'array-contains', zoe).get()).size, 0,
    'lecturas compartidas');
});

test('4. tampoco queda nada suyo dentro de otras cuentas', async () => {
  assert.equal(await existe(`users/${ana}/friends/${zoe}`), false, 'su entrada en la lista de Ana');
  assert.equal(await existe(`users/${bea}/friend_requests/${zoe}`), false, 'la solicitud que envió a Bea');
});

test('5. lo de las demás personas sigue intacto', async () => {
  assert.equal(await existe(`users/${ana}`), true, 'el perfil de Ana');
  assert.equal(await existe('usernames/anaborrar'), true, 'la reserva de Ana');
  assert.equal((await adminDb.collection('books').where('userId', '==', ana).get()).size, 1, 'los libros de Ana');
  assert.equal((await adminDb.collection('book_comments').where('uid', '==', ana).get()).size, 1,
    'el comentario de Ana en el mismo libro');
});

test('6. de los chats se van sus mensajes; los de la otra persona se quedan', async () => {
  const conAna = await adminDb.collection(`chats/${chatZoeAna}/messages`).get();
  assert.equal(conAna.size, 1, 'queda el mensaje de Ana');
  assert.equal(conAna.docs[0].data().from, ana);
  assert.equal(await existe(`chats/${chatZoeAna}`), true, 'la conversación con Ana sigue');

  // El chat con Bea solo tenía mensajes suyos: se queda vacío y desaparece.
  assert.equal(await cuantos(`chats/${chatZoeBea}/messages`), 0);
  assert.equal(await existe(`chats/${chatZoeBea}`), false, 'la conversación vacía se borra');
});

test('7. la cuenta de Authentication se borra, y el recibo no lleva el correo', async () => {
  const r = borrar(['--uid', zoe]);
  assert.match(r.salida, /NO \(perfil huérfano\)/);

  const ficheros = readdirSync(CARPETA_RECIBOS);
  assert.equal(ficheros.length, 1, 'un recibo por borrado');
  const recibo = JSON.parse(readFileSync(`${CARPETA_RECIBOS}/${ficheros[0]}`, 'utf8'));
  assert.equal(recibo.uid, zoe);
  assert.equal(recibo.proyecto, PROYECTO);
  assert.equal(recibo.cuentaDeAuthBorrada, true);
  assert.equal(recibo.documentosBorrados.libros, 2);
  assert.equal(recibo.documentosBorrados.enListasDeOtras, 1);
  assert.ok(recibo.fecha.startsWith(new Date().toISOString().slice(0, 4)));
  assert.ok(!JSON.stringify(recibo).includes('@'), 'el recibo no puede llevar el correo');
});

test('8. una segunda pasada no falla y no encuentra nada', async () => {
  const r = borrar(['--uid', zoe, '--aplicar']);
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /Documentos que se borrarían: 0/);
});

test('9. un perfil huérfano (sin cuenta en Auth) también se limpia', async () => {
  const huerfano = 'uid-huerfano-de-prueba';
  await adminDb.doc(`users/${huerfano}`).set({ uid: huerfano, username: 'Huerfano', searchKey: 'huerfano' });
  await adminDb.doc('usernames/huerfano').set({ uid: huerfano });
  await adminDb.collection('books').add({ userId: huerfano, title: 'Suyo', section: 'leyendo-ahora' });

  const r = borrar(['--uid', huerfano, '--aplicar']);
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /NO \(perfil huérfano\)/);
  assert.equal(await existe(`users/${huerfano}`), false);
  assert.equal(await existe('usernames/huerfano'), false);
  assert.equal((await adminDb.collection('books').where('userId', '==', huerfano).get()).size, 0);
});

test('10. se niega a trabajar sin destino, sin cuenta o con las dos cosas', () => {
  const sinDestino = spawnSync(process.execPath, ['scripts/borrar-cuenta.mjs', '--uid', 'x'], { encoding: 'utf8' });
  assert.equal(sinDestino.status, 1);
  assert.match(sinDestino.stderr, /Indica UN destino/);

  const sinCuenta = borrar([]);
  assert.equal(sinCuenta.status, 1);
  assert.match(sinCuenta.salida, /Indica UNA cuenta/);

  const dosCuentas = borrar(['--uid', 'x', '--correo', 'y@z.test']);
  assert.equal(dosCuentas.status, 1);

  // Con la variable de emulador puesta no puede hablar con un proyecto real.
  const conVariable = spawnSync(
    process.execPath, ['scripts/borrar-cuenta.mjs', '--proyecto', 'prod', '--uid', 'x'],
    { encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' } },
  );
  assert.equal(conVariable.status, 1);
  assert.match(conVariable.stderr, /FIRESTORE_EMULATOR_HOST/);

  // Y sin terminal no puede pedir confirmación, así que ni lo intenta.
  const sinTerminal = spawnSync(
    process.execPath, ['scripts/borrar-cuenta.mjs', '--proyecto', 'prod', '--uid', 'x', '--aplicar'],
    { encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' } },
  );
  assert.equal(sinTerminal.status, 1);
  assert.match(sinTerminal.stderr, /confirmación interactiva/);
});
