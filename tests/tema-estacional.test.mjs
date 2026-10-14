// Pruebas de la activación por fecha del tema de Halloween (20 oct – 2 nov).
// Runner de Node (node:test), sin dependencias nuevas:  npm test
//
// Se fija la zona de las usuarias, como en fecha-local.test.mjs: la
// diferencia entre fecha local y UTC solo se ve con desfase.
process.env.TZ = 'Europe/Madrid';

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { periodoHalloween, temaHalloweenActivo, CLAVE_APAGADO_HALLOWEEN } from '../tema-estacional.js';

// Fecha local (mes 1-12) para que los casos se lean como en el calendario
const dia = (a, m, d, h = 12, min = 0) => new Date(a, m - 1, d, h, min);

test('la zona horaria de las pruebas es de verdad Europe/Madrid', () => {
    assert.equal(new Date('2026-10-19T22:30:00Z').getDate(), 20);
});

// ---------------------------------------------------------------------------
// Fronteras del periodo
// ---------------------------------------------------------------------------

test('19 de octubre a las 23:59 todavía no toca', () => {
    assert.equal(temaHalloweenActivo(dia(2026, 10, 19, 23, 59)), false);
    assert.equal(periodoHalloween(dia(2026, 10, 19, 23, 59)), null);
});

test('20 de octubre a las 00:00 ya toca', () => {
    assert.equal(temaHalloweenActivo(dia(2026, 10, 20, 0, 0)), true);
    assert.equal(periodoHalloween(dia(2026, 10, 20, 0, 0)), '2026');
});

test('23, 24 y 31 de octubre están dentro', () => {
    for (const d of [23, 24, 31]) assert.equal(temaHalloweenActivo(dia(2026, 10, d)), true, `${d}/10`);
});

test('1 y 2 de noviembre (hasta las 23:59) están dentro', () => {
    assert.equal(temaHalloweenActivo(dia(2026, 11, 1)), true);
    assert.equal(temaHalloweenActivo(dia(2026, 11, 2, 0, 0)), true);
    assert.equal(temaHalloweenActivo(dia(2026, 11, 2, 23, 59)), true);
});

test('3 de noviembre a las 00:00 ya no toca', () => {
    assert.equal(temaHalloweenActivo(dia(2026, 11, 3, 0, 0)), false);
    assert.equal(periodoHalloween(dia(2026, 11, 3, 0, 0)), null);
});

test('mismo día de otros meses no cuenta (20 de septiembre, 2 de diciembre)', () => {
    assert.equal(temaHalloweenActivo(dia(2026, 9, 20)), false);
    assert.equal(temaHalloweenActivo(dia(2026, 12, 2)), false);
    assert.equal(temaHalloweenActivo(dia(2026, 10, 2)), false);
    assert.equal(temaHalloweenActivo(dia(2026, 11, 20)), false);
});

test('cambio de año: 31 de diciembre y 1 de enero fuera', () => {
    assert.equal(temaHalloweenActivo(dia(2026, 12, 31, 23, 59)), false);
    assert.equal(temaHalloweenActivo(dia(2027, 1, 1, 0, 0)), false);
});

test('el periodo se identifica por su año', () => {
    assert.equal(periodoHalloween(dia(2026, 10, 25)), '2026');
    assert.equal(periodoHalloween(dia(2026, 11, 2)), '2026');
    assert.equal(periodoHalloween(dia(2027, 10, 25)), '2027');
});

test('fecha inválida: no toca', () => {
    assert.equal(temaHalloweenActivo(new Date('no es una fecha')), false);
    assert.equal(periodoHalloween(new Date(NaN)), null);
});

// ---------------------------------------------------------------------------
// Apagado por la usuaria
// ---------------------------------------------------------------------------

test('la clave de localStorage es la acordada', () => {
    assert.equal(CLAVE_APAGADO_HALLOWEEN, 'tema-halloween-apagado');
});

test('apagado en 2026: sigue apagado todo el periodo de 2026', () => {
    assert.equal(temaHalloweenActivo(dia(2026, 10, 20, 0, 0), '2026'), false);
    assert.equal(temaHalloweenActivo(dia(2026, 10, 25), '2026'), false);
    assert.equal(temaHalloweenActivo(dia(2026, 11, 2, 23, 59), '2026'), false);
});

test('apagado en 2026: el año siguiente vuelve solo', () => {
    assert.equal(temaHalloweenActivo(dia(2027, 10, 20, 0, 0), '2026'), true);
});

test('sin valor guardado o con basura, activo', () => {
    assert.equal(temaHalloweenActivo(dia(2026, 10, 25), null), true);
    assert.equal(temaHalloweenActivo(dia(2026, 10, 25), undefined), true);
    assert.equal(temaHalloweenActivo(dia(2026, 10, 25), ''), true);
    assert.equal(temaHalloweenActivo(dia(2026, 10, 25), 'true'), true);
});

test('apagado no enciende nada fuera del periodo', () => {
    assert.equal(temaHalloweenActivo(dia(2026, 11, 3), '2025'), false);
});

// ---------------------------------------------------------------------------
// Fecha local, no UTC
// ---------------------------------------------------------------------------

test('Madrid: el 19/10 a las 22:30 UTC ya es día 20 y toca (UTC diría que no)', () => {
    const d = new Date('2026-10-19T22:30:00Z');
    assert.equal(d.toISOString().slice(0, 10), '2026-10-19');
    assert.equal(temaHalloweenActivo(d), true);
});

test('Madrid: el 2/11 a las 23:30 UTC ya es día 3 y no toca (UTC diría que sí)', () => {
    // 2 nov ya en horario de invierno: UTC+1
    assert.equal(temaHalloweenActivo(new Date('2026-11-02T23:30:00Z')), false);
});

test('Madrid: el 1/11 a las 00:30 (en UTC aún 31/10) mes y día salen de la misma fecha local', () => {
    // Mezclar mes UTC (octubre) con día local (1) daría "1 de octubre": fuera
    const d = dia(2026, 11, 1, 0, 30);
    assert.equal(d.getUTCMonth() + 1, 10);
    assert.equal(temaHalloweenActivo(d), true);
});

test('Ciudad de México: el mismo instante sigue siendo día 19 y no toca', () => {
    // process.env.TZ se lee al arrancar: otra zona necesita otro proceso
    const modulo = new URL('../tema-estacional.js', import.meta.url).href;
    const codigo = `import { temaHalloweenActivo } from ${JSON.stringify(modulo)};
        const casos = ['2026-10-19T22:30:00Z', '2026-10-20T05:59:00Z', '2026-10-20T06:00:00Z', '2026-11-03T05:59:00Z', '2026-11-03T06:00:00Z'];
        console.log(JSON.stringify(casos.map((c) => temaHalloweenActivo(new Date(c)))));`;
    const salida = execFileSync(process.execPath, ['--input-type=module', '-e', codigo], {
        env: { ...process.env, TZ: 'America/Mexico_City' },
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        encoding: 'utf8',
    });
    // UTC-6 todo el año: el 20 empieza a las 06:00 UTC y el 3 también
    assert.deepEqual(JSON.parse(salida), [false, false, true, true, false]);
});
