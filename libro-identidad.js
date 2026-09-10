// Identidad de un libro: título + autor normalizados.
//
// Es la clave que ya usaban los comentarios del club y las lecturas
// compartidas, y ahora también la deduplicación al importar y al añadir a
// mano. Está aquí, fuera de script.js, para que se pueda probar sola.
//
// Ojo con lo que implica: dos ediciones del mismo libro que escriban igual
// título y autor son la MISMA identidad aunque tengan distinto número de
// páginas. Si la edición va en el título ("Dune (edición ilustrada)") sí se
// distinguen.

/**
 * Normaliza un texto para comparar: minúsculas, sin tildes y sin nada que
 * no sea letra o número. Así "J.R.R. Tolkien" y "J. R. R. Tolkien" son la
 * misma persona, y "El Hóbbit" y "El Hobbit" el mismo libro.
 * @param {string} s Texto de origen.
 * @return {string} Texto normalizado.
 */
const normalizar = (s) => (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

/**
 * Clave de identidad de un libro.
 * @param {string} titulo Título.
 * @param {string} autor Autor.
 * @return {string} Clave "titulo-autor" normalizada.
 */
export function slugLibro(titulo, autor) {
    return `${normalizar(titulo)}-${normalizar(autor)}`;
}

/**
 * ¿Son el mismo libro?
 * @param {{title?: string, author?: string}} a Primer libro.
 * @param {{title?: string, author?: string}} b Segundo libro.
 * @return {boolean} true si comparten identidad.
 */
export function mismoLibro(a, b) {
    return slugLibro(a?.title, a?.author) === slugLibro(b?.title, b?.author);
}
