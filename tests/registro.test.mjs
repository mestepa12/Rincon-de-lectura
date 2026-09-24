// El alta con correo (registro.js) con llamadas de mentira: el orden de los
// pasos, qué pasa cuando falla cada uno y que un doble envío no lanza dos
// altas. El caso real: 23/09, dos cuentas con el mismo correo en el mismo
// segundo por un doble toque en "Crear cuenta".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { altaConCorreo, unoALaVez } from '../registro.js';

const fallo = (code) => Object.assign(new Error(code), { code });

/**
 * Llamadas de mentira que apuntan lo que se hace, en orden.
 * @param {object} cambios Llamadas que sustituir (p. ej. una que falle).
 * @return {{deps: object, pasos: string[]}}
 */
function falsas(cambios = {}) {
    const pasos = [];
    const deps = {
        nombreLibre: async (clave) => { pasos.push(`nombreLibre:${clave}`); return true; },
        crearCuenta: async () => { pasos.push('crearCuenta'); return 'uid-1'; },
        guardarPerfilYReserva: async (uid, username, clave) => { pasos.push(`perfilYReserva:${uid}:${username}:${clave}`); },
        medirAlta: async () => { pasos.push('medirAlta'); },
        enviarVerificacion: async () => { pasos.push('enviarVerificacion'); },
    };
    for (const [k, fn] of Object.entries(cambios)) {
        deps[k] = async (...a) => { pasos.push(`${k}!`); return fn(...a); };
    }
    return { deps, pasos };
}

test('alta completa: nombre, cuenta, perfil y reserva juntos, medición y correo', async () => {
    const { deps, pasos } = falsas();
    const r = await altaConCorreo({ username: 'AnaLee' }, deps);
    assert.deepEqual(r, { estado: 'completa', uid: 'uid-1' });
    assert.deepEqual(pasos, [
        'nombreLibre:analee',
        'crearCuenta',
        'perfilYReserva:uid-1:AnaLee:analee',
        'medirAlta',
        'enviarVerificacion',
    ]);
});

test('nombre ocupado: no se crea la cuenta', async () => {
    const { deps, pasos } = falsas({ nombreLibre: () => false });
    const r = await altaConCorreo({ username: 'AnaLee' }, deps);
    assert.deepEqual(r, { estado: 'nombre-ocupado' });
    assert.ok(!pasos.includes('crearCuenta'));
});

test('falla la comprobación del nombre: sin-cuenta, se puede reintentar', async () => {
    const { deps, pasos } = falsas({ nombreLibre: () => { throw fallo('unavailable'); } });
    const r = await altaConCorreo({ username: 'AnaLee' }, deps);
    assert.equal(r.estado, 'sin-cuenta');
    assert.equal(r.error.code, 'unavailable');
    assert.ok(!pasos.includes('crearCuenta'));
});

test('Auth rechaza la cuenta: sin-cuenta con su código, nada más se toca', async () => {
    const { deps, pasos } = falsas({ crearCuenta: () => { throw fallo('auth/email-already-in-use'); } });
    const r = await altaConCorreo({ username: 'AnaLee' }, deps);
    assert.equal(r.estado, 'sin-cuenta');
    assert.equal(r.error.code, 'auth/email-already-in-use');
    assert.deepEqual(pasos, ['nombreLibre:analee', 'crearCuenta!']);
});

test('falla perfil+reserva tras crear la cuenta: sin-perfil, sin medir, pero con correo', async () => {
    const { deps, pasos } = falsas({ guardarPerfilYReserva: () => { throw fallo('permission-denied'); } });
    const r = await altaConCorreo({ username: 'AnaLee' }, deps);
    assert.equal(r.estado, 'sin-perfil');
    assert.equal(r.uid, 'uid-1');
    assert.equal(r.error.code, 'permission-denied');
    assert.ok(!pasos.includes('medirAlta'), 'sin perfil no es un alta completa');
    assert.ok(pasos.includes('enviarVerificacion'), 'la biblioteca exigirá el correo verificado');
});

test('sin-perfil aunque tampoco salga el correo', async () => {
    const { deps } = falsas({
        guardarPerfilYReserva: () => { throw fallo('permission-denied'); },
        enviarVerificacion: () => { throw fallo('auth/too-many-requests'); },
    });
    const r = await altaConCorreo({ username: 'AnaLee' }, deps);
    assert.equal(r.estado, 'sin-perfil');
    assert.equal(r.error.code, 'permission-denied', 'el error que cuenta es el del perfil');
});

test('falla el correo de verificación: sin-verificacion, el alta sí se mide', async () => {
    const { deps, pasos } = falsas({ enviarVerificacion: () => { throw fallo('auth/too-many-requests'); } });
    const r = await altaConCorreo({ username: 'AnaLee' }, deps);
    assert.equal(r.estado, 'sin-verificacion');
    assert.equal(r.uid, 'uid-1');
    assert.equal(r.error.code, 'auth/too-many-requests');
    assert.ok(pasos.includes('medirAlta'));
});

test('un fallo de la analítica no rompe el alta', async () => {
    const { deps } = falsas({ medirAlta: () => { throw new Error('gtag'); } });
    assert.equal((await altaConCorreo({ username: 'AnaLee' }, deps)).estado, 'completa');
});

test('se espera a la medición antes de devolver (sale antes de cambiar de página)', async () => {
    let medida = false;
    const { deps } = falsas({
        medirAlta: () => new Promise((r) => setTimeout(() => { medida = true; r(); }, 20)),
    });
    await altaConCorreo({ username: 'AnaLee' }, deps);
    assert.equal(medida, true);
});

test('unoALaVez: un doble envío mientras el primero sigue en curso no hace nada', async () => {
    let llamadas = 0;
    let soltar;
    const manejador = unoALaVez(() => {
        llamadas++;
        return new Promise((r) => { soltar = r; });
    });
    const primera = manejador('a');
    const segunda = await manejador('b'); // doble toque
    assert.equal(segunda, undefined);
    assert.equal(llamadas, 1);
    soltar('hecho');
    assert.equal(await primera, 'hecho');
});

test('unoALaVez: al terminar (bien o mal) se puede volver a enviar', async () => {
    let llamadas = 0;
    const manejador = unoALaVez(async (falla) => {
        llamadas++;
        if (falla) throw new Error('x');
        return llamadas;
    });
    await assert.rejects(manejador(true));
    assert.equal(await manejador(false), 2);
    assert.equal(await manejador(false), 3);
});

test('doble envío del alta entera: una sola cuenta', async () => {
    const { deps, pasos } = falsas();
    const enviar = unoALaVez(() => altaConCorreo({ username: 'AnaLee' }, deps));
    const [a, b] = await Promise.all([enviar(), enviar()]);
    assert.equal(a.estado, 'completa');
    assert.equal(b, undefined);
    assert.equal(pasos.filter((p) => p === 'crearCuenta').length, 1);
});
