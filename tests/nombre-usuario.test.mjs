// Pruebas de la clave de búsqueda de amigos (búsqueda por nombre exacto).
// Runner de Node (node:test), sin dependencias nuevas:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';

import { claveBusquedaUsuario, nombrePublicable, obtenerMiNombre } from '../nombre-usuario.js';

test('pasa a minúsculas y quita espacios y la @ del principio', () => {
    assert.equal(claveBusquedaUsuario('AnaPrueba'), 'anaprueba');
    assert.equal(claveBusquedaUsuario('  @AnaPrueba  '), 'anaprueba');
    assert.equal(claveBusquedaUsuario('@@ana'), 'ana');
    assert.equal(claveBusquedaUsuario('@ ana'), 'ana');
});

test('no aplica el formato del registro: tildes, puntos y nombres cortos pasan', () => {
    assert.equal(claveBusquedaUsuario('MaríaGarcíaLópez482'), 'maríagarcíalópez482');
    assert.equal(claveBusquedaUsuario('J.Pérez12'), 'j.pérez12');
    assert.equal(claveBusquedaUsuario('Al'), 'al');
    assert.equal(claveBusquedaUsuario('x'.repeat(40)), 'x'.repeat(40));
});

test('devuelve null con lo que no puede ser el ID de un documento', () => {
    for (const malo of ['', '   ', '@', undefined, null, 'ana/bea', '/', '.', '..', '__x__', 'ñ'.repeat(751)]) {
        assert.equal(claveBusquedaUsuario(malo), null, JSON.stringify(malo));
    }
    // 750 ñ son 1500 bytes: justo en el límite, vale.
    assert.equal(claveBusquedaUsuario('ñ'.repeat(750)), 'ñ'.repeat(750));
});

// --- obtenerMiNombre: mi nombre antes de publicarlo -----------------------

/** Perfil de mentira con la forma que devuelve getDoc(). */
const perfil = (datos, fromCache = false) => ({
    exists: () => datos !== null,
    data: () => datos,
    metadata: { fromCache },
});

/** Espía de leerPerfil: cuenta las veces que se va a por el perfil. */
const lector = (respuesta) => {
    const espia = { veces: 0 };
    espia.leerPerfil = async () => {
        espia.veces++;
        if (respuesta instanceof Error) throw respuesta;
        return respuesta;
    };
    return espia;
};

test('con el nombre en memoria no se lee el perfil', async () => {
    const l = lector(perfil({ username: 'OtroNombre' }));
    const r = await obtenerMiNombre({ enMemoria: () => 'AnaPrueba', leerPerfil: l.leerPerfil });
    assert.deepEqual(r, { nombre: 'AnaPrueba', motivo: 'memoria' });
    assert.equal(l.veces, 0);
});

test('sin nada en memoria, el nombre sale del perfil', async () => {
    for (const vacio of [null, undefined, '', '   ']) {
        const l = lector(perfil({ username: 'AnaPrueba' }));
        const r = await obtenerMiNombre({ enMemoria: () => vacio, leerPerfil: l.leerPerfil });
        assert.deepEqual(r, { nombre: 'AnaPrueba', motivo: 'perfil' }, JSON.stringify(vacio));
        assert.equal(l.veces, 1);
    }
});

test('un perfil servido por la caché local (sin red) vale igual', async () => {
    const l = lector(perfil({ username: 'AnaPrueba' }, true));
    const r = await obtenerMiNombre({ enMemoria: () => null, leerPerfil: l.leerPerfil });
    assert.deepEqual(r, { nombre: 'AnaPrueba', motivo: 'perfil' });
});

test('sin documento de perfil: hay que pasar por el onboarding', async () => {
    const r = await obtenerMiNombre({ enMemoria: () => null, leerPerfil: lector(perfil(null)).leerPerfil });
    assert.deepEqual(r, { nombre: null, motivo: 'sin-perfil' });
});

test('perfil sin nombre (el que dejaba el muro del test)', async () => {
    for (const malo of [undefined, null, '', '  ', 42, {}]) {
        const r = await obtenerMiNombre({
            enMemoria: () => null,
            leerPerfil: lector(perfil({ username: malo })).leerPerfil,
        });
        assert.deepEqual(r, { nombre: null, motivo: 'sin-nombre' }, JSON.stringify(malo));
    }
});

test('si la lectura falla (sin red y sin caché) no se inventa nada', async () => {
    const fallo = new Error('unavailable');
    const r = await obtenerMiNombre({ enMemoria: () => null, leerPerfil: lector(fallo).leerPerfil });
    assert.equal(r.nombre, null);
    assert.equal(r.motivo, 'error');
    assert.equal(r.error, fallo);
});

test('el nombre se devuelve sin espacios alrededor', async () => {
    const enMemoria = await obtenerMiNombre({ enMemoria: () => '  AnaPrueba ', leerPerfil: lector(perfil(null)).leerPerfil });
    assert.equal(enMemoria.nombre, 'AnaPrueba');
    const enPerfil = await obtenerMiNombre({ enMemoria: () => null, leerPerfil: lector(perfil({ username: ' AnaPrueba  ' })).leerPerfil });
    assert.equal(enPerfil.nombre, 'AnaPrueba');
});

test('nombrePublicable: solo cadenas con algo dentro', () => {
    assert.equal(nombrePublicable('AnaPrueba'), 'AnaPrueba');
    assert.equal(nombrePublicable('  Ana  '), 'Ana');
    for (const malo of ['', '   ', null, undefined, 0, 42, {}, []]) {
        assert.equal(nombrePublicable(malo), null, JSON.stringify(malo));
    }
});
