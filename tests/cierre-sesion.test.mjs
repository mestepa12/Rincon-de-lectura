// Pruebas de cerrar sesión sin dejar el dispositivo recibiendo avisos
// (cierre-sesion.js), con dobles en lugar de Firebase.
// Runner de Node (node:test), sin dependencias nuevas:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';

import { cerrarSesionSinAvisos, TOPE_LIMPIEZA_MS } from '../cierre-sesion.js';

const TOPE = 60;
const nunca = () => new Promise(() => {});  // sin red: no responde nunca
const fallo = (code, message = 'falló') => Object.assign(new Error(message), { code });

/**
 * Operaciones de mentira que apuntan en `llamadas` lo que se hace y en qué
 * orden. Cada una se puede sustituir.
 */
function dobles(cambios = {}) {
    const llamadas = [];
    const avisos = [];
    const op = {
        tokenConocido: null,
        permiso: 'default',
        obtenerToken: async () => { llamadas.push('obtenerToken'); return 'tok-nuevo'; },
        quitarDeFirestore: async (t) => { llamadas.push(`quitar:${t}`); },
        borrarEnFcm: async () => { llamadas.push('borrarEnFcm'); },
        desuscribir: async () => { llamadas.push('desuscribir'); },
        cerrarSesion: async () => { llamadas.push('cerrarSesion'); },
        avisar: (m) => avisos.push(m),
        tope: TOPE,
        ...cambios,
    };
    return { op, llamadas, avisos };
}

test('el tope por defecto es de 3 s', () => {
    assert.equal(TOPE_LIMPIEZA_MS, 3000);
});

test('1. sin permiso ni token: no toca FCM ni Firestore y cierra sesión', async () => {
    for (const permiso of ['default', 'denied', 'no-disponible']) {
        const { op, llamadas, avisos } = dobles({ permiso });
        const informe = await cerrarSesionSinAvisos(op);
        assert.deepEqual(llamadas, ['cerrarSesion'], permiso);
        assert.deepEqual(avisos, []);
        assert.deepEqual(informe, { token: false, firestore: 'omitido', fcm: 'omitido', tiempoAgotado: false });
    }
});

test('2. todo bien: quita de Firestore y borra en FCM, sin desuscribir, y luego cierra sesión', async () => {
    const { op, llamadas, avisos } = dobles({ tokenConocido: 'tok-1', permiso: 'granted' });
    const informe = await cerrarSesionSinAvisos(op);
    assert.deepEqual([...llamadas].sort(), ['borrarEnFcm', 'cerrarSesion', 'quitar:tok-1']);
    assert.equal(llamadas.at(-1), 'cerrarSesion', 'el signOut va el último');
    assert.ok(!llamadas.includes('desuscribir'), 'deleteToken ya desuscribe');
    assert.ok(!llamadas.includes('obtenerToken'), 'el token ya se conocía');
    assert.deepEqual(avisos, []);
    assert.deepEqual(informe, { token: true, firestore: 'quitado', fcm: 'borrado', tiempoAgotado: false });
});

test('3. deleteToken lanza: se avisa, se desuscribe a mano y se cierra sesión', async () => {
    const { op, llamadas, avisos } = dobles({
        tokenConocido: 'tok-1',
        borrarEnFcm: async () => { throw fallo('messaging/token-unsubscribe-failed'); },
    });
    const informe = await cerrarSesionSinAvisos(op);
    assert.ok(llamadas.includes('desuscribir'));
    assert.equal(llamadas.at(-1), 'cerrarSesion');
    assert.equal(informe.fcm, 'desuscrito');
    assert.match(avisos.join('\n'), /deleteToken falló \(messaging\/token-unsubscribe-failed\)/);
});

test('4. quitar de Firestore lanza: se avisa, FCM se limpia igual y se cierra sesión', async () => {
    const { op, llamadas, avisos } = dobles({
        tokenConocido: 'tok-1',
        quitarDeFirestore: async () => { throw fallo('not-found'); },
    });
    const informe = await cerrarSesionSinAvisos(op);
    assert.ok(llamadas.includes('borrarEnFcm'));
    assert.equal(llamadas.at(-1), 'cerrarSesion');
    assert.equal(informe.firestore, 'fallo');
    assert.equal(informe.fcm, 'borrado');
    assert.match(avisos.join('\n'), /no se pudo quitar el token de Firestore \(not-found\)/);
});

test('5. sin red: al cumplirse el tope se cierra sesión igual', { timeout: 2000 }, async () => {
    const { op, llamadas, avisos } = dobles({
        tokenConocido: 'tok-1',
        quitarDeFirestore: nunca,
        borrarEnFcm: nunca,
    });
    const inicio = Date.now();
    const informe = await cerrarSesionSinAvisos(op);
    const tardo = Date.now() - inicio;
    assert.ok(tardo >= TOPE - 5 && tardo < TOPE + 500, `tardó ${tardo} ms`);
    assert.deepEqual(llamadas, ['cerrarSesion']);
    assert.equal(informe.tiempoAgotado, true);
    assert.match(avisos.join('\n'), /se agotaron los 60 ms/);
});

test('6. permiso concedido y token desconocido: se pide; si falla, nada de deleteToken', async () => {
    // a) getToken lo da: se usa ese.
    let d = dobles({ permiso: 'granted' });
    let informe = await cerrarSesionSinAvisos(d.op);
    assert.ok(d.llamadas.includes('obtenerToken'));
    assert.ok(d.llamadas.includes('quitar:tok-nuevo'));
    assert.ok(d.llamadas.includes('borrarEnFcm'));
    assert.equal(informe.token, true);

    // b) getToken lanza: sin deleteToken (registraría otro service worker),
    //    plan B de desuscribir y signOut.
    d = dobles({ permiso: 'granted', obtenerToken: async () => { throw fallo('messaging/token-subscribe-failed'); } });
    informe = await cerrarSesionSinAvisos(d.op);
    assert.deepEqual(d.llamadas, ['desuscribir', 'cerrarSesion']);
    assert.equal(informe.token, false);
    assert.equal(informe.fcm, 'desuscrito');
    assert.match(d.avisos.join('\n'), /no se pudo obtener el token \(messaging\/token-subscribe-failed\)/);

    // c) no hay service worker: getToken no da nada.
    d = dobles({ permiso: 'granted', obtenerToken: async () => null });
    await cerrarSesionSinAvisos(d.op);
    assert.deepEqual(d.llamadas, ['desuscribir', 'cerrarSesion']);
});

test('7. el signOut se llama siempre, una sola vez, y si falla el error llega a quien llama', async () => {
    const casos = [
        dobles({ tokenConocido: 'tok-1' }),
        dobles({ tokenConocido: 'tok-1', quitarDeFirestore: nunca, borrarEnFcm: nunca }),
        dobles({ permiso: 'granted', obtenerToken: async () => { throw fallo('x'); }, desuscribir: async () => { throw fallo('y'); } }),
    ];
    for (const { op, llamadas } of casos) {
        await cerrarSesionSinAvisos(op);
        assert.equal(llamadas.filter((l) => l === 'cerrarSesion').length, 1);
    }
    const { op } = dobles({ cerrarSesion: async () => { throw fallo('auth/network-request-failed'); } });
    await assert.rejects(cerrarSesionSinAvisos(op), /falló/);
});

test('8. ningún aviso lleva el token, aunque el error lo traiga en el mensaje', async () => {
    const TOKEN = 'tok-secreto-123';
    const { op, avisos } = dobles({
        tokenConocido: TOKEN,
        quitarDeFirestore: async () => { throw fallo('a', `falló con ${TOKEN}`); },
        borrarEnFcm: async () => { throw fallo('b', `falló con ${TOKEN}`); },
        desuscribir: async () => { throw fallo('c', `falló con ${TOKEN}`); },
    });
    await cerrarSesionSinAvisos(op);
    assert.equal(avisos.length, 3);
    for (const a of avisos) assert.ok(!a.includes(TOKEN), a);
});
