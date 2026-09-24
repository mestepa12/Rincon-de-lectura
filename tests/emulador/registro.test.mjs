// El lote del registro (auth.js): reserva del nombre y perfil juntos, contra
// las reglas y con una sesión de usuaria de verdad. Lo que importa es el
// "todo o nada": si el nombre ya es de otra cuenta, tampoco se crea el
// perfil. Antes el perfil iba primero y se quedaba escrito con un nombre
// que no era suyo. Se lanza con npm run test:emu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { doc, writeBatch } from 'firebase/firestore';
import { adminDb, crearUsuaria, sesion, cerrarAdmin } from './entorno.mjs';

const denegado = (e) => e?.code === 'permission-denied';

/** Lo mismo que guardarPerfilYReserva en auth.js. */
function guardarPerfilYReserva(db, uid, username) {
    const clave = username.toLowerCase();
    const lote = writeBatch(db);
    lote.set(doc(db, 'usernames', clave), { uid });
    lote.set(doc(db, 'users', uid), { username, searchKey: clave, uid });
    return lote.commit();
}

let nueva;
let tardia;
let sNueva;
let sTardia;

before(async () => {
    nueva = await crearUsuaria('nueva-registro@prueba.test');
    tardia = await crearUsuaria('tardia-registro@prueba.test');
    sNueva = await sesion('nueva-registro@prueba.test');
    sTardia = await sesion('tardia-registro@prueba.test');
});

after(async () => {
    await Promise.all([sNueva, sTardia].filter(Boolean).map((s) => s.cerrar()));
    await cerrarAdmin();
});

test('nombre libre: el lote crea la reserva y el perfil', async () => {
    await guardarPerfilYReserva(sNueva.db, nueva, 'LectoraLote');
    assert.equal((await adminDb.doc('usernames/lectoralote').get()).data().uid, nueva);
    const perfil = (await adminDb.doc(`users/${nueva}`).get()).data();
    assert.deepEqual(perfil, { username: 'LectoraLote', searchKey: 'lectoralote', uid: nueva });
});

test('nombre recién ocupado por otra cuenta: el lote falla entero, sin perfil', async () => {
    await assert.rejects(guardarPerfilYReserva(sTardia.db, tardia, 'LectoraLote'), denegado);
    assert.equal((await adminDb.doc(`users/${tardia}`).get()).exists, false, 'no queda perfil a medias');
    assert.equal((await adminDb.doc('usernames/lectoralote').get()).data().uid, nueva, 'la reserva sigue siendo de la primera');
});

test('tras el choque, con otro nombre el lote entra', async () => {
    // Tras el fallo, la tardía elige otro nombre (lo que hará en el
    // onboarding) y ahora sí entra.
    await guardarPerfilYReserva(sTardia.db, tardia, 'OtraLectora');
    assert.equal((await adminDb.doc('usernames/otralectora').get()).data().uid, tardia);
});
