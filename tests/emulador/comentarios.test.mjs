// Comentarios del Club de lectura: solo los lee su autora y quien está en la
// lista de amigos de la autora. Reglas con sesiones de usuaria de verdad (y
// un cliente sin sesión). Se lanza con npm run test:emu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  doc, getDoc, getDocs, addDoc, deleteDoc, collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import { adminDb, crearUsuaria, sesion, clienteSinSesion, cerrarAdmin } from './entorno.mjs';

const denegado = (e) => e?.code === 'permission-denied';
const SLUG = 'dune-frank-herbert-club';

let ana;
let bea;
let carla;
let dani;
let comentarioAna;
let sAna;
let sBea;
let sCarla;
let sDani;
let anonimo;

const porAutora = (s, autora, slug = SLUG) =>
  getDocs(query(collection(s.db, 'book_comments'), where('bookSlug', '==', slug), where('uid', '==', autora)));

before(async () => {
  ana = await crearUsuaria('ana-club@prueba.test');
  bea = await crearUsuaria('bea-club@prueba.test');
  carla = await crearUsuaria('carla-club@prueba.test');
  dani = await crearUsuaria('dani-club@prueba.test');
  for (const [uid, username] of [[ana, 'AnaClub'], [bea, 'BeaClub'], [carla, 'CarlaClub'], [dani, 'DaniClub']]) {
    await adminDb.doc(`users/${uid}`).set({ uid, username });
  }
  // Ana y Bea, amigas en los dos sentidos.
  await adminDb.doc(`users/${ana}/friends/${bea}`).set({ friendUid: bea, friendUsername: 'BeaClub', since: new Date() });
  await adminDb.doc(`users/${bea}/friends/${ana}`).set({ friendUid: ana, friendUsername: 'AnaClub', since: new Date() });
  // Dani está en la lista de Ana, pero Ana no está en la de Dani.
  await adminDb.doc(`users/${ana}/friends/${dani}`).set({ friendUid: dani, friendUsername: 'DaniClub', since: new Date() });

  const comentar = (uid, username, page, text, slug = SLUG) =>
    adminDb.collection('book_comments').add({ bookSlug: slug, uid, username, page, text, timestamp: new Date() });
  comentarioAna = (await comentar(ana, 'AnaClub', 10, 'Me encanta el principio')).id;
  await comentar(ana, 'AnaClub', 400, 'Qué final');
  await comentar(ana, 'AnaClub', 5, 'Otro libro', 'otro-libro-club');
  await comentar(bea, 'BeaClub', 20, 'A mí también');
  await comentar(carla, 'CarlaClub', 30, 'Comentario de alguien de fuera');
  await comentar(dani, 'DaniClub', 40, 'Comentario de Dani');

  sAna = await sesion('ana-club@prueba.test');
  sBea = await sesion('bea-club@prueba.test');
  sCarla = await sesion('carla-club@prueba.test');
  sDani = await sesion('dani-club@prueba.test');
  anonimo = clienteSinSesion();
});

after(async () => {
  await Promise.all([sAna, sBea, sCarla, sDani, anonimo].filter(Boolean).map((s) => s.cerrar()));
  await cerrarAdmin();
});

test('1. la autora lee sus comentarios del libro, y todos los suyos (logros)', async () => {
  assert.equal((await porAutora(sAna, ana)).size, 2);
  const todos = await getDocs(query(collection(sAna.db, 'book_comments'), where('uid', '==', ana)));
  assert.equal(todos.size, 3);
  assert.equal((await getDoc(doc(sAna.db, 'book_comments', comentarioAna))).data().text, 'Me encanta el principio');
});

test('2. una amiga lee los comentarios de la autora, con la consulta por autora', async () => {
  const deAna = await porAutora(sBea, ana);
  assert.equal(deAna.size, 2);
  assert.deepEqual(deAna.docs.map((d) => d.data().page).sort((a, b) => a - b), [10, 400]);
  assert.equal((await getDoc(doc(sBea.db, 'book_comments', comentarioAna))).exists(), true);
  // Y la autora lee los de su amiga.
  assert.equal((await porAutora(sAna, bea)).size, 1);
});

test('3. quien no es amiga no puede leerlos, ni por consulta ni por ID', async () => {
  await assert.rejects(porAutora(sCarla, ana), denegado);
  await assert.rejects(getDoc(doc(sCarla.db, 'book_comments', comentarioAna)), denegado);
  await assert.rejects(porAutora(anonimo, ana), denegado);
  // Los suyos sí.
  assert.equal((await porAutora(sCarla, carla)).size, 1);
});

test('4. nadie puede leer sin fijar la autora: ni la consulta antigua por libro ni la colección entera', async () => {
  for (const s of [sAna, sBea, sCarla, anonimo]) {
    await assert.rejects(getDocs(query(collection(s.db, 'book_comments'), where('bookSlug', '==', SLUG))), denegado);
    await assert.rejects(getDocs(collection(s.db, 'book_comments')), denegado);
  }
});

test('5. amistad en un solo sentido: lee quien está en la lista de la autora', async () => {
  // Dani está en la lista de Ana: lee los comentarios de Ana.
  assert.equal((await porAutora(sDani, ana)).size, 2);
  // Ana no está en la lista de Dani: no lee los de Dani.
  await assert.rejects(porAutora(sAna, dani), denegado);
});

test('6. escribir y borrar siguen igual: cada cual los suyos', async () => {
  const nuevo = await addDoc(collection(sBea.db, 'book_comments'), {
    bookSlug: SLUG, uid: bea, username: 'BeaClub', page: 25, text: 'Nuevo', timestamp: serverTimestamp(),
  });
  await assert.rejects(addDoc(collection(sBea.db, 'book_comments'), {
    bookSlug: SLUG, uid: ana, username: 'AnaClub', page: 25, text: 'Suplantando', timestamp: serverTimestamp(),
  }), denegado);
  await assert.rejects(deleteDoc(doc(sBea.db, 'book_comments', comentarioAna)), denegado);
  await deleteDoc(doc(sBea.db, 'book_comments', nuevo.id));
  assert.equal((await adminDb.doc(`book_comments/${nuevo.id}`).get()).exists, false);
});
