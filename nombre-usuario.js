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

// --- Mi nombre, antes de escribirlo donde lo leen otras personas -----------
//
// Cuatro sitios de la app guardan el nombre de usuario dentro de documentos
// que ven otras cuentas: el comentario del Club, la solicitud de amistad, la
// entrada en la lista de amigas de la otra persona y la lectura compartida.
// Cuando no lo encontraban en memoria guardaban el prefijo del correo, así
// que una lectura que tardaba (los primeros instantes de la página) o una
// carga sin red publicaban la dirección de correo de quien escribía. Aquí se
// decide una sola vez y sin nombre no se escribe nada.

/**
 * El nombre si se puede publicar, o null.
 * @param {*} valor Lo que hubiera guardado.
 * @return {?string} El nombre sin espacios alrededor, o null.
 */
export const nombrePublicable = (valor) =>
    (typeof valor === 'string' && valor.trim().length > 0 ? valor.trim() : null);

/**
 * Mi nombre de usuario: el que ya está en memoria o, si no, el del perfil.
 *
 * Vale un perfil servido por la caché local de Firestore (sin red): es el
 * nombre que la cuenta tenía la última vez, y sigue siendo suyo. Lo que no
 * puede pasar es inventarse uno.
 *
 * @param {{enMemoria: function(): *, leerPerfil: function(): Promise<object>}} ops
 *     enMemoria: lo último que se sabe del perfil, sin ir a la red.
 *     leerPerfil: getDoc del propio perfil.
 * @return {Promise<{nombre: ?string, motivo: string, error?: *}>} motivo:
 *     'memoria' | 'perfil' | 'sin-perfil' (la cuenta no tiene documento: le
 *     toca pasar por el onboarding) | 'sin-nombre' | 'error' (no se pudo
 *     leer: sin red y sin nada en la caché).
 */
export async function obtenerMiNombre({ enMemoria, leerPerfil }) {
    const enSitio = nombrePublicable(enMemoria());
    if (enSitio) return { nombre: enSitio, motivo: 'memoria' };

    let perfil;
    try {
        perfil = await leerPerfil();
    } catch (error) {
        return { nombre: null, motivo: 'error', error };
    }

    if (!perfil.exists()) return { nombre: null, motivo: 'sin-perfil' };
    const guardado = nombrePublicable(perfil.data()?.username);
    return guardado
        ? { nombre: guardado, motivo: 'perfil' }
        : { nombre: null, motivo: 'sin-nombre' };
}
