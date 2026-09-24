// Pruebas de las fechas de calendario locales (rachas, objetivos, logros).
// Runner de Node (node:test), sin dependencias nuevas:  npm test
//
// Se fija la zona de las usuarias: el bug solo se ve con desfase respecto a
// UTC, y en un CI en UTC pasaría cualquier implementación.
process.env.TZ = 'Europe/Madrid';

import test from 'node:test';
import assert from 'node:assert/strict';

import { fechaLocal, inicioSemanaLocal, parsearFechaLocal } from '../fecha-local.js';

// ---------------------------------------------------------------------------
// fechaLocal
// ---------------------------------------------------------------------------

test('la zona horaria de las pruebas es de verdad Europe/Madrid', () => {
    // 22:30 UTC en verano = 00:30 del día siguiente en Madrid (UTC+2)
    assert.equal(new Date('2026-07-14T22:30:00Z').getDate(), 15);
});

test('pasada la medianoche en España ya es el día nuevo (horario de verano)', () => {
    // 00:30 del 15 en Madrid; toISOString() decía todavía 14
    const d = new Date('2026-07-14T22:30:00Z');
    assert.equal(d.toISOString().slice(0, 10), '2026-07-14');
    assert.equal(fechaLocal(d), '2026-07-15');
});

test('pasada la medianoche en España ya es el día nuevo (horario de invierno)', () => {
    // 00:30 del 15 en Madrid (UTC+1)
    assert.equal(fechaLocal(new Date('2026-01-14T23:30:00Z')), '2026-01-15');
});

test('a media tarde coincide con la fecha UTC', () => {
    assert.equal(fechaLocal(new Date('2026-03-10T15:00:00Z')), '2026-03-10');
});

test('rellena mes y día con cero', () => {
    assert.equal(fechaLocal(new Date(2026, 0, 5, 12)), '2026-01-05');
});

test('fin de año local', () => {
    // 00:15 del 1 de enero en Madrid = 23:15 UTC del 31 de diciembre
    assert.equal(fechaLocal(new Date('2025-12-31T23:15:00Z')), '2026-01-01');
});

// ---------------------------------------------------------------------------
// inicioSemanaLocal
// ---------------------------------------------------------------------------

test('un lunes de madrugada la semana empieza ese mismo lunes', () => {
    // 00:30 del lunes 13/07/2026 en Madrid = domingo 22:30 UTC
    const d = new Date('2026-07-12T22:30:00Z');
    assert.equal(inicioSemanaLocal(d), '2026-07-13');
});

test('entre semana devuelve el lunes anterior', () => {
    assert.equal(inicioSemanaLocal(new Date(2026, 6, 16, 20)), '2026-07-13'); // jueves
});

test('el domingo pertenece a la semana que empezó el lunes previo', () => {
    assert.equal(inicioSemanaLocal(new Date(2026, 6, 19, 23, 59)), '2026-07-13');
});

test('semana que cruza de mes', () => {
    assert.equal(inicioSemanaLocal(new Date(2026, 8, 2, 10)), '2026-08-31'); // miércoles 2/9
});

test('semana del cambio de hora (último domingo de marzo)', () => {
    assert.equal(inicioSemanaLocal(new Date(2026, 2, 29, 12)), '2026-03-23');
});

// ---------------------------------------------------------------------------
// parsearFechaLocal
// ---------------------------------------------------------------------------

test('parsea a medianoche local, no UTC', () => {
    const d = parsearFechaLocal('2026-07-15');
    assert.equal(d.getDate(), 15);
    assert.equal(d.getHours(), 0);
});

test('ida y vuelta con fechaLocal', () => {
    assert.equal(fechaLocal(parsearFechaLocal('2026-02-28')), '2026-02-28');
});

test('días entre dos fechas locales cruzando el cambio de hora', () => {
    const dias = Math.round((parsearFechaLocal('2026-03-30') - parsearFechaLocal('2026-03-28')) / 86400000);
    assert.equal(dias, 2);
});
