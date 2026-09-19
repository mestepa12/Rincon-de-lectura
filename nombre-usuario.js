// Lo que alguien teclea o pega en el buscador de amigos → el ID de la
// reserva que hay que pedir en /usernames (el nombre en minúsculas).
//
// Módulo puro, sin DOM ni Firestore, para poder probarlo solo.
//
// A propósito NO se aplica el formato del registro (^[a-zA-Z0-9_]{3,30}$):
// hay nombres antiguos, del login con Google y del test, con tildes o
// puntos, y también se tienen que poder encontrar.

/**
 * @param {string} texto Lo tecleado: "@AnaPrueba", " anaprueba ", ...
 * @return {?string} El ID que buscar, o null si no puede ser el ID de ningún
 *   documento (vacío, con "/", "." o "..", con forma __x__ o de más de 1500
 *   bytes: Firestore no los admite).
 */
export function claveBusquedaUsuario(texto) {
    const clave = String(texto ?? '').trim().replace(/^@+/, '').trim().toLowerCase();
    if (!clave || clave.includes('/') || clave === '.' || clave === '..') return null;
    if (/^__.*__$/.test(clave)) return null;
    if (new TextEncoder().encode(clave).length > 1500) return null;
    return clave;
}
