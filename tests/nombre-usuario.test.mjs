// Pruebas de la clave de búsqueda de amigos (búsqueda por nombre exacto).
// Runner de Node (node:test), sin dependencias nuevas:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';

import { claveBusquedaUsuario } from '../nombre-usuario.js';

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
