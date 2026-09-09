// Pruebas de la papelera y del formato CSV.
// Runner de Node (node:test), sin dependencias nuevas:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DIAS_PAPELERA, CAMPOS_LIBRO, soloCamposDeLibro,
    diasRestantes, estaCaducado, idsAPurgar,
} from '../papelera.js';

import {
    COLUMNAS_EXPORTACION, COLUMNAS_GOODREADS_REQUERIDAS,
    esCsvGoodreads, esCsvPropio,
} from '../csv-formato.js';

const DIA = 24 * 60 * 60 * 1000;
const AHORA = Date.UTC(2026, 8, 9, 12, 0, 0);
const borradoHace = (dias) => ({ id: `x${dias}`, title: 'T', deletedAt: AHORA - dias * DIA });

// ---------------------------------------------------------------------------
// Caducidad
// ---------------------------------------------------------------------------

test('un libro recién borrado tiene el plazo entero por delante', () => {
    assert.equal(diasRestantes(borradoHace(0), AHORA), DIAS_PAPELERA);
    assert.equal(estaCaducado(borradoHace(0), AHORA), false);
});

test('a un día del plazo todavía se puede restaurar', () => {
    assert.equal(estaCaducado(borradoHace(DIAS_PAPELERA - 1), AHORA), false);
    assert.equal(diasRestantes(borradoHace(DIAS_PAPELERA - 1), AHORA), 1);
});

test('justo al cumplirse el plazo ya se purga', () => {
    assert.equal(estaCaducado(borradoHace(DIAS_PAPELERA), AHORA), true);
    assert.equal(diasRestantes(borradoHace(DIAS_PAPELERA), AHORA), 0);
});

test('idsAPurgar solo devuelve los que han pasado del plazo', () => {
    const items = [borradoHace(0), borradoHace(29), borradoHace(30), borradoHace(400)];
    assert.deepEqual(idsAPurgar(items, AHORA), ['x30', 'x400']);
});

test('sin marca de borrado válida no se purga nada: ante la duda, no se borra', () => {
    const raros = [
        { id: 'a', title: 'T' },                        // sin deletedAt
        { id: 'b', title: 'T', deletedAt: null },
        { id: 'c', title: 'T', deletedAt: 'ayer' },
        { id: 'd', title: 'T', deletedAt: 0 },
        { id: 'e', title: 'T', deletedAt: NaN },
    ];
    assert.deepEqual(idsAPurgar(raros, AHORA), []);
    raros.forEach((r) => assert.equal(diasRestantes(r, AHORA), null));
});

test('una marca en el futuro no adelanta el borrado', () => {
    const futuro = { id: 'f', title: 'T', deletedAt: AHORA + 10 * DIA };
    assert.equal(estaCaducado(futuro, AHORA), false);
});

test('idsAPurgar aguanta entradas que no son lista', () => {
    assert.deepEqual(idsAPurgar(null, AHORA), []);
    assert.deepEqual(idsAPurgar(undefined, AHORA), []);
});

// ---------------------------------------------------------------------------
// Saneado de campos
// ---------------------------------------------------------------------------

test('soloCamposDeLibro descarta el id y cualquier campo no permitido', () => {
    const sucio = {
        id: 'abc', userId: 'u1', title: 'Dune', author: 'Herbert',
        section: 'leyendo-ahora', currentPage: 245, totalPages: 680,
        deletedAt: 123, _estado: 'En papelera', loQueSea: 'fuera',
    };
    const limpio = soloCamposDeLibro(sucio);
    assert.equal(limpio.title, 'Dune');
    assert.equal(limpio.currentPage, 245);
    // Lo que las reglas de Firestore rechazarían no debe ni salir de aquí
    for (const prohibido of ['id', 'deletedAt', '_estado', 'loQueSea']) {
        assert.ok(!(prohibido in limpio), `${prohibido} no debería viajar`);
    }
});

test('soloCamposDeLibro no inventa campos que no estaban', () => {
    const limpio = soloCamposDeLibro({ userId: 'u1', title: 'T' });
    assert.deepEqual(Object.keys(limpio).sort(), ['title', 'userId']);
    // undefined revienta las escrituras de Firestore
    Object.values(limpio).forEach((v) => assert.notEqual(v, undefined));
});

test('la lista blanca del cliente coincide con la de las reglas de Firestore', async () => {
    const { readFileSync } = await import('node:fs');
    const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    const bloque = reglas.match(/function bookFields\(\)\s*\{\s*return \[([\s\S]*?)\];/);
    assert.ok(bloque, 'no se encontró bookFields() en firestore.rules');
    const enReglas = [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual([...CAMPOS_LIBRO].sort(), enReglas.sort());
});

// ---------------------------------------------------------------------------
// CSV: nuestra exportación NO se puede reimportar por accidente
//
// Es la garantía que impide que restaurar una copia meta en la biblioteca
// libros que estaban en la papelera.
// ---------------------------------------------------------------------------

test('el CSV que exportamos no se cuela por el importador de Goodreads', () => {
    assert.equal(esCsvGoodreads(COLUMNAS_EXPORTACION), false);
});

test('el CSV que exportamos se reconoce como propio', () => {
    assert.equal(esCsvPropio(COLUMNAS_EXPORTACION), true);
});

test('los dos formatos no comparten ninguna columna obligatoria', () => {
    const exportacion = new Set(COLUMNAS_EXPORTACION);
    COLUMNAS_GOODREADS_REQUERIDAS.forEach((c) => {
        assert.ok(!exportacion.has(c), `"${c}" está en los dos formatos: el importador podría tragarse nuestro CSV`);
    });
});

test('un CSV de Goodreads de verdad sí se reconoce, y no como propio', () => {
    const goodreads = ['Book Id', 'Title', 'Author', 'ISBN13', 'My Rating',
        'Number of Pages', 'Exclusive Shelf', 'Bookshelves'];
    assert.equal(esCsvGoodreads(goodreads), true);
    assert.equal(esCsvPropio(goodreads), false);
});

test('las cabeceras se comparan sin espacios de sobra', () => {
    assert.equal(esCsvGoodreads([' Title ', 'Author']), true);
    assert.equal(esCsvPropio(['  Título  ', ' Estado ']), true);
});

test('un CSV que no es ni de Goodreads ni nuestro no se importa', () => {
    assert.equal(esCsvGoodreads(['Nombre', 'Paginas']), false);
    assert.equal(esCsvPropio(['Nombre', 'Paginas']), false);
});
