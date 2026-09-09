// Formatos de CSV que maneja la app. Están aquí, y no sueltos dentro de
// script.js, para que se puedan comprobar solos: el CSV que exportamos y el
// que importamos son formatos DISTINTOS, y conviene que eso quede fijado por
// una prueba en vez de por la memoria de quien lo escribió.

/** Cabeceras del CSV que exporta la app (en su orden). */
export const COLUMNAS_EXPORTACION = [
    'Título', 'Autor', 'Estado', 'Páginas totales', 'Página actual',
    'Valoración', 'Género', 'Notas', 'Ritmo narrativo', 'Estados de ánimo',
    'Portada', 'Enlace',
];

/**
 * Columnas sin las cuales un CSV de Goodreads no se puede leer. Si falta el
 * título no hay libro que crear: el importador descarta esas filas.
 */
export const COLUMNAS_GOODREADS_REQUERIDAS = ['Title'];

/** Etiqueta de la columna Estado para los libros que están en la papelera. */
export const ESTADO_CSV_PAPELERA = 'En papelera';

/**
 * ¿Estas cabeceras son las de un export de Goodreads?
 * @param {string[]} cabeceras Cabeceras leídas del fichero.
 * @return {boolean} true si se puede importar.
 */
export function esCsvGoodreads(cabeceras) {
    const set = new Set((cabeceras || []).map((c) => String(c).trim()));
    return COLUMNAS_GOODREADS_REQUERIDAS.every((c) => set.has(c));
}

/**
 * ¿Estas cabeceras son las del CSV que exporta esta misma app?
 * Sirve para dar un mensaje útil en vez del genérico "no se encontraron
 * libros válidos" cuando alguien intenta reimportar su propia copia.
 * @param {string[]} cabeceras Cabeceras leídas del fichero.
 * @return {boolean} true si el fichero es nuestro.
 */
export function esCsvPropio(cabeceras) {
    const set = new Set((cabeceras || []).map((c) => String(c).trim()));
    // Con Título y Estado basta: son nuestras y no existen en Goodreads.
    return set.has('Título') && set.has('Estado');
}
