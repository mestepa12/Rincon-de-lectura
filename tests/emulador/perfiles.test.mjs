// Lectura de perfiles solo para la dueña y sus amigos, y búsqueda de amigos
// por nombre exacto sobre /usernames. Reglas con sesiones de usuaria de
// verdad (y un cliente sin sesión, como el registro). Se lanza con
// npm run test:emu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  doc, getDoc, getDocs, setDoc, collection, query, where, limit, serverTimestamp,
} from 'firebase/firestore';
import { adminDb, crearUsuaria, sesion, clienteSinSesion, cerrarAdmin } from './entorno.mjs';
import { claveBusquedaUsuario } from '../../nombre-usuario.js';

const denegado = (e) => e?.code === 'permission-denied';

let ana;
let bea;
let carla;
let dani;
let emi;
let sAna;
let sBea;
let sCarla;
let sDani;
let anonimo;

before(async () => {
  ana = await crearUsuaria('ana-perf@prueba.test');
  bea = await crearUsuaria('bea-perf@prueba.test');
  carla = await crearUsuaria('carla-perf@prueba.test');
  dani = await crearUsuaria('dani-perf@prueba.test');
  emi = await crearUsuaria('emi-perf@prueba.test');
  const perfil = (uid, username) => adminDb.doc(`users/${uid}`).set({
    uid, username, searchKey: username.toLowerCase(), rachaActual: 3, totalPaginasLeidas: 120,
  });
  await perfil(ana, 'AnaPerf');
  await perfil(bea, 'BeaPerf');
  await perfil(carla, 'CarlaPerf');
  await perfil(dani, 'DaniPerf');
  await perfil(emi, 'MaríaGarcía12'); // un nombre de los antiguos, fuera del formato
  await adminDb.doc('usernames/anaperf').set({ uid: ana });
  await adminDb.doc('usernames/maríagarcía12').set({ uid: emi });

  // Ana y Bea son amigas en los dos sentidos.
  await adminDb.doc(`users/${ana}/friends/${bea}`).set({ friendUid: bea, friendUsername: 'BeaPerf', since: new Date() });
  await adminDb.doc(`users/${bea}/friends/${ana}`).set({ friendUid: ana, friendUsername: 'AnaPerf', since: new Date() });
  // Dani está en la lista de Ana, pero Ana no está en la de Dani.
  await adminDb.doc(`users/${ana}/friends/${dani}`).set({ friendUid: dani, friendUsername: 'DaniPerf', since: new Date() });
  await adminDb.collection('books').add({ userId: ana, title: 'Dune', section: 'leyendo-ahora' });

  sAna = await sesion('ana-perf@prueba.test');
  sBea = await sesion('bea-perf@prueba.test');
  sCarla = await sesion('carla-perf@prueba.test');
  sDani = await sesion('dani-perf@prueba.test');
  anonimo = clienteSinSesion();
});

after(async () => {
  await Promise.all([sAna, sBea, sCarla, sDani, anonimo].filter(Boolean).map((s) => s.cerrar()));
  await cerrarAdmin();
});

test('1. la dueña lee su perfil', async () => {
  assert.equal((await getDoc(doc(sAna.db, 'users', ana))).data().username, 'AnaPerf');
});

test('2. una amiga lee el perfil y los libros (biblioteca de un amigo y ranking)', async () => {
  const perfil = await getDoc(doc(sBea.db, 'users', ana));
  assert.equal(perfil.data().totalPaginasLeidas, 120);
  const libros = await getDocs(query(collection(sBea.db, 'books'), where('userId', '==', ana)));
  assert.equal(libros.size, 1);
});

test('3. quien no es amiga no puede leer el perfil', async () => {
  await assert.rejects(getDoc(doc(sCarla.db, 'users', ana)), denegado);
  await assert.rejects(getDoc(doc(anonimo.db, 'users', ana)), denegado);
});

test('4. nadie puede listar /users, ni con la búsqueda antigua', async () => {
  for (const s of [sAna, sCarla]) {
    await assert.rejects(getDocs(collection(s.db, 'users')), denegado);
    await assert.rejects(getDocs(query(collection(s.db, 'users'), where('uid', '==', s.uid))), denegado);
    await assert.rejects(getDocs(query(collection(s.db, 'users'),
      where('searchKey', '>=', 'ana'), where('searchKey', '<=', 'ana'), limit(5))), denegado);
  }
  await assert.rejects(getDocs(collection(anonimo.db, 'users')), denegado);
});

test('5. amistad en un solo sentido: lee quien está en la lista de la dueña', async () => {
  // Dani está en la lista de Ana: puede leer el perfil de Ana.
  assert.equal((await getDoc(doc(sDani.db, 'users', ana))).data().username, 'AnaPerf');
  // Ana no está en la lista de Dani: no puede leer el de Dani.
  await assert.rejects(getDoc(doc(sAna.db, 'users', dani)), denegado);
});

test('6. /usernames: get para todos, list para nadie', async () => {
  assert.equal((await getDoc(doc(anonimo.db, 'usernames', 'anaperf'))).data().uid, ana);
  assert.equal((await getDoc(doc(sCarla.db, 'usernames', 'anaperf'))).data().uid, ana);
  await assert.rejects(getDocs(collection(anonimo.db, 'usernames')), denegado);
  await assert.rejects(getDocs(collection(sCarla.db, 'usernames')), denegado);
  await assert.rejects(getDocs(query(collection(sCarla.db, 'usernames'), limit(1))), denegado);
});

test('7. la búsqueda de la app encuentra por nombre exacto, también con tildes, y lleva a la solicitud', async () => {
  const clave = claveBusquedaUsuario('  @MaríaGarcía12 ');
  const reserva = await getDoc(doc(sCarla.db, 'usernames', clave));
  assert.equal(reserva.data().uid, emi);

  // Con un trozo del nombre no aparece nada.
  assert.equal((await getDoc(doc(sCarla.db, 'usernames', claveBusquedaUsuario('maría')))).exists(), false);

  // Con el uid, Carla le manda la solicitud aunque no pueda leer su perfil.
  await assert.rejects(getDoc(doc(sCarla.db, 'users', emi)), denegado);
  await setDoc(doc(sCarla.db, 'users', emi, 'friend_requests', carla), {
    fromUid: carla, fromUsername: 'CarlaPerf', status: 'pending', timestamp: serverTimestamp(),
  });
  assert.ok((await adminDb.doc(`users/${emi}/friend_requests/${carla}`).get()).exists);
});

test('8. el registro sigue pudiendo comprobar sin cuenta si un nombre está libre', async () => {
  assert.equal((await getDoc(doc(anonimo.db, 'usernames', 'nombre-libre-perf'))).exists(), false);
});
