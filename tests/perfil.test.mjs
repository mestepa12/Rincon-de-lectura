// Qué cuenta como perfil completo. Es la puerta del onboarding: el muro del
// test llegó a crear perfiles con solo quizResults, y esas cuentas tienen que
// pasar por elegir nombre igual que un alta nueva.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perfilCompleto } from '../perfil.js';

/** Snapshot de mentira, con la forma que devuelve getDoc(). */
const snap = (datos) => ({ exists: () => datos !== null, data: () => datos });

test('sin documento no hay perfil', () => {
    assert.equal(perfilCompleto(snap(null)), false);
});

test('documento con solo el resultado del test no basta', () => {
    assert.equal(perfilCompleto(snap({ quizResults: { 'tropo-literario': 'cozy' } })), false);
});

test('username vacío o de otro tipo no basta', () => {
    assert.equal(perfilCompleto(snap({ username: '' })), false);
    assert.equal(perfilCompleto(snap({ username: null })), false);
    assert.equal(perfilCompleto(snap({ username: 42 })), false);
});

test('con username es completo', () => {
    assert.equal(perfilCompleto(snap({ username: 'AnaPrueba', searchKey: 'anaprueba' })), true);
});
