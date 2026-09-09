// Papelera de 30 días: reglas de caducidad y saneado de documentos.
//
// Este módulo NO toca el DOM ni Firestore a propósito. Recibe datos y
// devuelve datos, así que se puede probar solo y, el día que la purga pase
// de hacerse en el cliente a hacerse en una Cloud Function programada,
// cambia quién lo llama y no lo que hace.

/** Días que un libro sobrevive en la papelera antes de purgarse. */
export const DIAS_PAPELERA = 30;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Campos que viajan de /books a /papelera y de vuelta. Es la misma lista
 * blanca que aplican las reglas de Firestore (bookFields), así que mandar
 * cualquier otra cosa sería rechazado en el servidor. Se filtra también
 * aquí para no depender solo de eso y para no arrastrar el `id`, que es
 * el identificador del documento, no un campo suyo.
 */
export const CAMPOS_LIBRO = [
    'userId', 'title', 'author', 'cover', 'section', 'totalPages',
    'currentPage', 'notes', 'rating', 'googleLink', 'genre',
    'ritmoNarrativo', 'estadosDeAnimo', 'importedFrom',
];

/**
 * Deja un libro con solo los campos permitidos, descartando los que no
 * existen (Firestore rechaza `undefined`).
 * @param {object} libro Libro de origen (puede traer id y extras).
 * @return {object} Objeto listo para escribir.
 */
export function soloCamposDeLibro(libro) {
    const salida = {};
    for (const campo of CAMPOS_LIBRO) {
        if (libro[campo] !== undefined) salida[campo] = libro[campo];
    }
    return salida;
}

/**
 * Milisegundos en que se borró un elemento, o null si la marca no sirve.
 * Defensivo porque el dato lo escribe el cliente: un `deletedAt` corrupto
 * no debe hacer que se purgue algo por sorpresa.
 * @param {object} item Documento de la papelera.
 * @return {number|null} Marca de borrado en ms, o null.
 */
function marcaDeBorrado(item) {
    const ms = item?.deletedAt;
    return (typeof ms === 'number' && isFinite(ms) && ms > 0) ? ms : null;
}

/**
 * Días completos que le quedan a un elemento antes de purgarse.
 * @param {object} item Documento de la papelera.
 * @param {number} ahoraMs Instante de referencia en ms.
 * @return {number|null} Días restantes (0 o más), o null si no hay marca.
 */
export function diasRestantes(item, ahoraMs = Date.now()) {
    const ms = marcaDeBorrado(item);
    if (ms === null) return null;
    const restantes = Math.ceil((ms + DIAS_PAPELERA * MS_POR_DIA - ahoraMs) / MS_POR_DIA);
    return Math.max(0, restantes);
}

/**
 * ¿Le ha pasado el plazo a este elemento?
 * Sin marca válida se considera NO caducado: ante la duda, no se borra.
 * @param {object} item Documento de la papelera.
 * @param {number} ahoraMs Instante de referencia en ms.
 * @return {boolean} true si toca purgarlo.
 */
export function estaCaducado(item, ahoraMs = Date.now()) {
    const ms = marcaDeBorrado(item);
    if (ms === null) return false;
    return ahoraMs - ms >= DIAS_PAPELERA * MS_POR_DIA;
}

/**
 * IDs de los elementos que toca purgar. Función pura: no borra nada, solo
 * dice qué borraría. Quien la llame decide qué hacer con la lista.
 * @param {object[]} items Documentos de la papelera (con id).
 * @param {number} ahoraMs Instante de referencia en ms.
 * @return {string[]} IDs a purgar.
 */
export function idsAPurgar(items, ahoraMs = Date.now()) {
    if (!Array.isArray(items)) return [];
    return items.filter((i) => estaCaducado(i, ahoraMs)).map((i) => i.id).filter(Boolean);
}
