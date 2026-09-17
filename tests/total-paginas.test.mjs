// Pruebas del total de páginas y de qué total ven los logros.
// Runner de Node (node:test), sin dependencias nuevas:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';

import { totalPaginasDeLibros, totalPaginasParaLogros } from '../total-paginas.js';

// El caso que partía los logros en dos cargas: el perfil guarda 310 páginas
// pero la biblioteca tiene 6 terminados de 900 y uno por la página 88.
const TOTAL_GUARDADO_DESFASADO = 310;
const terminado = (i) => ({ id: `t${i}`, section: 'libros-terminados', totalPages: 900, currentPage: 900 });
const LIBROS = [
    ...Array.from({ length: 6 }, (_, i) => terminado(i)),
    { id: 'l0', section: 'leyendo-ahora', totalPages: 471, currentPage: 88 },
];

// ---------------------------------------------------------------------------
// Cálculo desde los libros
// ---------------------------------------------------------------------------

test('los terminados cuentan enteros y el resto por la página en la que van', () => {
    assert.equal(totalPaginasDeLibros(LIBROS), 6 * 900 + 88);
});

test('un terminado cuenta sus páginas totales aunque currentPage vaya por detrás', () => {
    const libro = { section: 'libros-terminados', totalPages: 300, currentPage: 12 };
    assert.equal(totalPaginasDeLibros([libro]), 300);
});

test('los campos que faltan cuentan como cero', () => {
    assert.equal(totalPaginasDeLibros([
        { section: 'libros-terminados' },
        { section: 'proximas-lecturas' },
        { section: 'lista-deseos', currentPage: 0 },
    ]), 0);
    assert.equal(totalPaginasDeLibros([]), 0);
});

// ---------------------------------------------------------------------------
// Qué total ven los logros
// ---------------------------------------------------------------------------

test('los logros de páginas salen en la misma carga en que cambia el total', () => {
    // Llegan los libros con el perfil aún a 310: la sincronización no ha
    // escrito (o no ha vuelto). Los logros tienen que ver ya 5488, no 310,
    // o paginas_2000 y paginas_5000 esperarían a la carga siguiente.
    const total = totalPaginasParaLogros(totalPaginasDeLibros(LIBROS), TOTAL_GUARDADO_DESFASADO);
    assert.equal(total, 5488);
    assert.ok(total >= 2000 && total >= 5000);
});

test('manda el calculado también cuando es menor que el guardado', () => {
    // Borrar libros baja el total; el guardado se corrige con la
    // sincronización, así que el calculado es la referencia.
    assert.equal(totalPaginasParaLogros(88, TOTAL_GUARDADO_DESFASADO), 88);
});

test('un calculado de cero sigue mandando (biblioteca vacía)', () => {
    assert.equal(totalPaginasParaLogros(0, TOTAL_GUARDADO_DESFASADO), 0);
});

test('antes de que lleguen los libros se usa el total guardado', () => {
    assert.equal(totalPaginasParaLogros(null, TOTAL_GUARDADO_DESFASADO), TOTAL_GUARDADO_DESFASADO);
});

test('sin libros ni total guardado, cero', () => {
    assert.equal(totalPaginasParaLogros(null, undefined), 0);
});
