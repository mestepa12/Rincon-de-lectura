// Bingo de lectura: reglas de /bingos y de users/{uid}/bingo, con sesiones
// de usuaria de verdad, y scripts/publicar-bingo.mjs contra el emulador.
// Se lanza con npm run test:emu.
//
// Los cartones de las pruebas de reglas se siembran con el Admin SDK y
// fechas relativas a ahora (abierto, cerrado, futuro): las reglas comparan
// con request.time y no hay forma de mover el reloj del emulador. Usan
// meses de 2091 para no chocar con los que publica el script más abajo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, deleteField, serverTimestamp,
} from 'firebase/firestore';
import { adminDb, crearUsuaria, sesion, clienteSinSesion, cerrarAdmin } from './entorno.mjs';

const denegado = (e) => e?.code === 'permission-denied';
const HORA = 3600e3;
const IDS = Array.from({ length: 16 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`);
const ABIERTO = '2091-01';
const CERRADO = '2091-02';
const FUTURO = '2091-03';
const SIN_CARTON = '2091-04';

const cartonSembrado = (mes, desde, hasta) => adminDb.doc(`bingos/${mes}`).set({
  mes,
  titulo: `Bingo ${mes}`,
  tamano: 4,
  maxCasillasPorLibro: 2,
  casillas: IDS.map((id) => ({ id, texto: `Reto ${id}` })),
  idsCasillas: IDS,
  publicaDesde: new Date(desde),
  cierraEn: new Date(hasta),
  version: 1,
});
const casilla = (bookId) => ({ bookId, titulo: `Libro ${bookId}`, marcadoEn: serverTimestamp() });

let ana;
let bea;
let sAna;
let sBea;
let anonimo;

before(async () => {
  ana = await crearUsuaria('ana-bingo@prueba.test');
  bea = await crearUsuaria('bea-bingo@prueba.test');
  await adminDb.doc(`users/${ana}`).set({ uid: ana, username: 'AnaBingo' });
  await adminDb.doc(`users/${bea}`).set({ uid: bea, username: 'BeaBingo' });
  // Amigas: Bea puede leer el perfil y los libros de Ana, pero el bingo no.
  await adminDb.doc(`users/${ana}/friends/${bea}`).set({ friendUid: bea, friendUsername: 'BeaBingo', since: new Date() });
  await adminDb.doc(`users/${bea}/friends/${ana}`).set({ friendUid: ana, friendUsername: 'AnaBingo', since: new Date() });

  const ahora = Date.now();
  await cartonSembrado(ABIERTO, ahora - HORA, ahora + HORA);
  await cartonSembrado(CERRADO, ahora - 48 * HORA, ahora - HORA);
  await cartonSembrado(FUTURO, ahora + 24 * HORA, ahora + 48 * HORA);
  // Progreso de Ana en el mes cerrado, de cuando estaba abierto.
  await adminDb.doc(`users/${ana}/bingo/${CERRADO}`).set({ mes: CERRADO, casillas: { c01: { bookId: 'b1', titulo: 'Libro b1' } } });

  sAna = await sesion('ana-bingo@prueba.test');
  sBea = await sesion('bea-bingo@prueba.test');
  anonimo = clienteSinSesion();
});

after(async () => {
  await Promise.all([sAna, sBea, anonimo].filter(Boolean).map((s) => s.cerrar()));
  await cerrarAdmin();
});

// --- /bingos: el cartón del mes ------------------------------------------

test('1. un cartón abierto lo lee cualquiera, también sin cuenta', async () => {
  assert.equal((await getDoc(doc(sAna.db, 'bingos', ABIERTO))).data().titulo, `Bingo ${ABIERTO}`);
  assert.equal((await getDoc(doc(anonimo.db, 'bingos', ABIERTO))).exists(), true);
  // Y uno cerrado también: hace falta para el historial.
  assert.equal((await getDoc(doc(sAna.db, 'bingos', CERRADO))).exists(), true);
});

test('2. el cartón de un mes futuro no se ve, ni uno que no existe; y no se listan', async () => {
  await assert.rejects(getDoc(doc(sAna.db, 'bingos', FUTURO)), denegado);
  await assert.rejects(getDoc(doc(anonimo.db, 'bingos', FUTURO)), denegado);
  // Sin cartón da lo mismo que futuro: el cliente lo trata como "no hay".
  await assert.rejects(getDoc(doc(sAna.db, 'bingos', SIN_CARTON)), denegado);
  await assert.rejects(getDocs(collection(sAna.db, 'bingos')), denegado);
  await assert.rejects(getDocs(collection(anonimo.db, 'bingos')), denegado);
});

test('3. ningún cliente escribe cartones', async () => {
  const nuevo = { mes: SIN_CARTON, titulo: 'Mío', idsCasillas: IDS, publicaDesde: new Date(0), cierraEn: new Date(9e12) };
  await assert.rejects(setDoc(doc(sAna.db, 'bingos', SIN_CARTON), nuevo), denegado);
  await assert.rejects(setDoc(doc(anonimo.db, 'bingos', SIN_CARTON), nuevo), denegado);
  await assert.rejects(updateDoc(doc(sAna.db, 'bingos', ABIERTO), { titulo: 'Cambiado' }), denegado);
  await assert.rejects(deleteDoc(doc(sAna.db, 'bingos', ABIERTO)), denegado);
  assert.equal((await adminDb.doc(`bingos/${ABIERTO}`).get()).data().titulo, `Bingo ${ABIERTO}`);
});

// --- users/{uid}/bingo: el progreso de cada una ---------------------------

test('4. Ana marca, cambia y quita casillas en el mes abierto, como hará la app', async () => {
  const ref = doc(sAna.db, 'users', ana, 'bingo', ABIERTO);
  await setDoc(ref, { mes: ABIERTO, casillas: { c01: casilla('b1') }, actualizadoEn: serverTimestamp() });
  await updateDoc(ref, { 'casillas.c06': casilla('b1'), actualizadoEn: serverTimestamp() });
  await updateDoc(ref, { 'casillas.c11': casilla('b2'), 'casillas.c16': casilla('b3'), lineaEn: serverTimestamp() });
  await updateDoc(ref, { 'casillas.c16': deleteField(), lineaEn: deleteField() });

  const datos = (await getDoc(ref)).data();
  assert.deepEqual(Object.keys(datos.casillas).sort(), ['c01', 'c06', 'c11']);
  assert.equal(datos.casillas.c06.bookId, 'b1', 'un mismo libro en dos casillas');
  assert.equal('lineaEn' in datos, false);
});

test('5. el esquema es cerrado', async () => {
  const ref = doc(sAna.db, 'users', ana, 'bingo', ABIERTO);
  await assert.rejects(updateDoc(ref, { premio: true }), denegado, 'campo que no existe');
  await assert.rejects(updateDoc(ref, { mes: CERRADO }), denegado, 'mes distinto del id');
  await assert.rejects(updateDoc(ref, { 'casillas.c17': casilla('b9') }), denegado, 'casilla que no está en el cartón');
  await assert.rejects(updateDoc(ref, { 'casillas.libre': casilla('b9') }), denegado, 'id inventado');
  await assert.rejects(updateDoc(ref, { casillas: ['c01'] }), denegado, 'casillas no es un mapa');
  await assert.rejects(updateDoc(ref, { lineaEn: 'ayer' }), denegado, 'lineaEn no es una fecha');
  await assert.rejects(updateDoc(ref, { completoEn: 1 }), denegado, 'completoEn no es una fecha');
  await assert.rejects(updateDoc(ref, { actualizadoEn: 'hoy' }), denegado, 'actualizadoEn no es una fecha');
  // Otro documento con un id que no es el del mes.
  await assert.rejects(
    setDoc(doc(sAna.db, 'users', ana, 'bingo', 'cualquiera'), { mes: 'cualquiera', casillas: {} }),
    denegado,
  );
});

test('6. Bea, aunque sea su amiga, no lee, ni lista, ni escribe el bingo de Ana', async () => {
  // Sí puede leer su perfil: el bingo va fuera de él justo por eso.
  assert.equal((await getDoc(doc(sBea.db, 'users', ana))).exists(), true);

  await assert.rejects(getDoc(doc(sBea.db, 'users', ana, 'bingo', ABIERTO)), denegado);
  await assert.rejects(getDocs(collection(sBea.db, 'users', ana, 'bingo')), denegado);
  await assert.rejects(updateDoc(doc(sBea.db, 'users', ana, 'bingo', ABIERTO), { 'casillas.c02': casilla('x') }), denegado);
  await assert.rejects(deleteDoc(doc(sBea.db, 'users', ana, 'bingo', ABIERTO)), denegado);
  await assert.rejects(getDoc(doc(anonimo.db, 'users', ana, 'bingo', ABIERTO)), denegado);
});

test('7. un mes cerrado se lee pero ya no se toca; se puede borrar', async () => {
  const ref = doc(sAna.db, 'users', ana, 'bingo', CERRADO);
  assert.equal((await getDoc(ref)).data().casillas.c01.bookId, 'b1');
  await assert.rejects(updateDoc(ref, { 'casillas.c02': casilla('b2') }), denegado, 'marcar en un mes cerrado');
  await assert.rejects(setDoc(ref, { mes: CERRADO, casillas: {} }), denegado, 'reescribirlo entero');

  // Bea no tenía progreso en el mes cerrado: tampoco puede empezarlo ahora.
  await assert.rejects(
    setDoc(doc(sBea.db, 'users', bea, 'bingo', CERRADO), { mes: CERRADO, casillas: { c01: casilla('z') } }),
    denegado,
  );

  await deleteDoc(ref);
  assert.equal((await adminDb.doc(`users/${ana}/bingo/${CERRADO}`).get()).exists, false);
});

test('8. no hay progreso de un mes que aún no se ha abierto ni de uno sin cartón', async () => {
  await assert.rejects(
    setDoc(doc(sAna.db, 'users', ana, 'bingo', FUTURO), { mes: FUTURO, casillas: { c01: casilla('b1') } }),
    denegado,
  );
  await assert.rejects(
    setDoc(doc(sAna.db, 'users', ana, 'bingo', SIN_CARTON), { mes: SIN_CARTON, casillas: {} }),
    denegado,
  );
});

test('9. Ana lista su historial', async () => {
  await setDoc(doc(sBea.db, 'users', bea, 'bingo', ABIERTO), { mes: ABIERTO, casillas: {} });
  const suyos = await getDocs(collection(sAna.db, 'users', ana, 'bingo'));
  assert.deepEqual(suyos.docs.map((d) => d.id), [ABIERTO], 'solo los suyos, y el cerrado ya lo borró');
});

// --- scripts/publicar-bingo.mjs -------------------------------------------

const carpeta = mkdtempSync(join(tmpdir(), 'bingo-'));
after(() => rmSync(carpeta, { recursive: true, force: true }));

/** Escribe un cartón de prueba y devuelve su ruta. */
function fixture(mes, cambios = {}, nombre = `${mes}.json`) {
  const c = {
    mes,
    titulo: `Bingo de prueba ${mes}`,
    tamano: 4,
    maxCasillasPorLibro: 2,
    casillas: IDS.map((id) => ({ id, texto: `Reto de prueba ${id}` })),
    ...cambios,
  };
  const ruta = join(carpeta, nombre);
  writeFileSync(ruta, JSON.stringify(c));
  return ruta;
}

/** Ejecuta el script contra el emulador y devuelve su salida. */
function publicar(extra) {
  const r = spawnSync(process.execPath, ['scripts/publicar-bingo.mjs', ...extra], {
    encoding: 'utf8',
    // Sin las variables heredadas: el script las pone él con --emulador.
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: '' },
  });
  return { ...r, salida: `${r.stdout}${r.stderr}` };
}

test('10. sin --aplicar valida y enseña, pero no publica', async () => {
  const r = publicar([fixture('2031-05'), '--emulador']);
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /primera publicación/);
  assert.match(r.salida, /Sin --aplicar no se ha publicado nada/);
  assert.equal((await adminDb.doc('bingos/2031-05').get()).exists, false);
});

test('11. el cartón de diciembre del repo es válido', () => {
  const r = publicar(['contenido/bingos/2026-12.json', '--emulador']);
  assert.equal(r.status, 0, r.salida);
  const carton = JSON.parse(readFileSync('contenido/bingos/2026-12.json', 'utf8'));
  for (const c of carton.casillas) assert.ok(r.salida.includes(c.texto), `enseña ${c.id}`);
});

test('12. con --aplicar publica con ids, fechas de España y versión', async () => {
  const r = publicar([fixture('2031-05'), '--emulador', '--aplicar']);
  assert.equal(r.status, 0, r.salida);
  const d = (await adminDb.doc('bingos/2031-05').get()).data();
  assert.equal(d.version, 1);
  assert.deepEqual(d.idsCasillas, IDS);
  assert.equal(d.publicaDesde.toDate().toISOString(), '2031-04-30T22:00:00.000Z');
  assert.equal(d.cierraEn.toDate().toISOString(), '2031-06-03T22:00:00.000Z');
  assert.equal(d.casillas.length, 16);
});

test('13. antes de abrirse se puede reordenar; la versión sube', async () => {
  const al_reves = IDS.map((id) => ({ id, texto: `Reto de prueba ${id}` })).reverse();
  const r = publicar([fixture('2031-05', { casillas: al_reves }), '--emulador', '--aplicar']);
  assert.equal(r.status, 0, r.salida);
  const d = (await adminDb.doc('bingos/2031-05').get()).data();
  assert.equal(d.version, 2);
  assert.equal(d.idsCasillas[0], 'c16');
});

test('14. ya abierto: se corrigen textos, pero no se reordena', async () => {
  // Octubre de 2026 ya se abrió (y cerró): cuenta como "a la vista".
  assert.equal(publicar([fixture('2026-10'), '--emulador', '--aplicar']).status, 0);

  const errata = IDS.map((id) => ({ id, texto: id === 'c05' ? 'Texto corregido' : `Reto de prueba ${id}` }));
  const r1 = publicar([fixture('2026-10', { casillas: errata }), '--emulador', '--aplicar']);
  assert.equal(r1.status, 0, r1.salida);
  assert.match(r1.salida, /ya está cerrado/);
  const d = (await adminDb.doc('bingos/2026-10').get()).data();
  assert.equal(d.version, 2);
  assert.equal(d.casillas[4].texto, 'Texto corregido');

  const r2 = publicar([fixture('2026-10', { casillas: [...errata].reverse() }), '--emulador', '--aplicar']);
  assert.equal(r2.status, 1);
  assert.match(r2.salida, /ya está abierto/);
  assert.equal((await adminDb.doc('bingos/2026-10').get()).data().version, 2, 'no ha tocado nada');
});

test('15. un cartón mal escrito no se publica, y dice qué falla', async () => {
  const mal = fixture('2031-06', { casillas: IDS.slice(0, 15).map((id) => ({ id, texto: 'ab' })) });
  const r = publicar([mal, '--emulador', '--aplicar']);
  assert.equal(r.status, 1);
  assert.match(r.salida, /lleva 16 casillas y hay 15/);
  assert.match(r.salida, /Casilla 1 \(c01\): el texto/);
  assert.equal((await adminDb.doc('bingos/2031-06').get()).exists, false);

  const malNombre = publicar([fixture('2031-07', {}, '2031-08.json'), '--emulador', '--aplicar']);
  assert.equal(malNombre.status, 1);
  assert.match(malNombre.salida, /tiene que llamarse 2031-07\.json/);
});

test('16. se niega sin fichero, sin destino o con el emulador puesto contra un proyecto real', () => {
  const sinFichero = publicar(['--emulador']);
  assert.equal(sinFichero.status, 1);
  assert.match(sinFichero.salida, /Indica el fichero/);

  const sinDestino = publicar([fixture('2031-05')]);
  assert.equal(sinDestino.status, 1);
  assert.match(sinDestino.salida, /Indica UN destino/);

  const conVariable = spawnSync(process.execPath, ['scripts/publicar-bingo.mjs', fixture('2031-05'), '--proyecto', 'prod'], {
    encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
  });
  assert.equal(conVariable.status, 1);
  assert.match(conVariable.stderr, /FIRESTORE_EMULATOR_HOST/);

  const sinTerminal = publicar([fixture('2031-05'), '--proyecto', 'prod', '--aplicar']);
  assert.equal(sinTerminal.status, 1);
  assert.match(sinTerminal.salida, /confirmación interactiva/);
});
