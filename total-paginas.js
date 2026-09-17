// Total de páginas leídas: cómo se calcula y cuál ven los logros.
//
// Este módulo NO toca el DOM ni Firestore a propósito, para poder probarlo
// solo (tests/total-paginas.test.mjs).

/**
 * Páginas leídas según los libros: los terminados cuentan enteros y el
 * resto por la página en la que van.
 * @param {object[]} libros Libros de la biblioteca propia.
 * @return {number} Total de páginas leídas.
 */
export const totalPaginasDeLibros = (libros) => libros.reduce((sum, b) => {
    if (b.section === 'libros-terminados') return sum + (b.totalPages || 0);
    return sum + (b.currentPage || 0);
}, 0);

/**
 * Total con el que se evalúan los logros de páginas. Manda el calculado
 * desde los libros: el guardado en el perfil puede ir una escritura por
 * detrás, o ni siquiera haberse escrito si el perfil aún no ha llegado
 * (ver sincronizarTotalPaginas en script.js). Si lo usaran los logros, los
 * de páginas saldrían en la carga siguiente a la que cambió el total.
 * @param {?number} calculado Total según los libros; null si aún no han llegado.
 * @param {?number} guardado totalPaginasLeidas del perfil en Firestore.
 * @return {number} Total a comparar con los umbrales.
 */
export const totalPaginasParaLogros = (calculado, guardado) => (calculado ?? guardado) || 0;
