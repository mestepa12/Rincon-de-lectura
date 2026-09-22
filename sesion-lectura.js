// Sesión de lectura activa: saneado, duración y decisión de cierre.
//
// Este módulo NO toca el DOM, ni localStorage, ni Firestore. Recibe datos y
// devuelve decisiones, así que se puede probar solo y, sobre todo, así la
// lógica que decide "esta sesión no se puede guardar" no depende de que la
// biblioteca haya cargado ni de que haya red.
//
// El porqué de todo esto es un fallo de producción: una sesión de 42:57:17
// sobre un libro que se había mandado a la papelera dejaba la barra del
// reproductor encallada en un iPhone. El libro ya no estaba en booksData, así
// que el botón de terminar se escondía, el clic en la barra no abría nada y
// Guardar hacía un `return` mudo; y aunque se hubiera llegado a escribir, las
// reglas rechazan cualquier durationMin por encima de MAX_DURACION_MIN.
//
// Regla de oro que sostiene el diseño: descartar una sesión nunca depende de
// nada. Ese camino no pasa por aquí precisamente porque no necesita decisiones.

/**
 * Tope de duración que aceptan las reglas de users/{uid}/sessions.
 * Si cambias este número, cambia también la regla `durationMin <= 1440` de
 * firestore.rules: hay una prueba que comprueba que los dos coinciden.
 */
export const MAX_DURACION_MIN = 1440;

/**
 * A partir de aquí se pide confirmación del tiempo, sin dar por hecho nada.
 * Ocho horas: una maratón de lectura de verdad son cuatro o seis, así que por
 * debajo de ese listón preguntar sería molestar a quien sí leyó ese rato.
 * Muy por debajo de MAX_DURACION_MIN a propósito: el tope de las reglas es un
 * muro, no un umbral, y preguntar cerca de él dejaría sin margen la respuesta.
 */
export const UMBRAL_REVISION_MIN = 480;

/**
 * Minutos de respaldo cuando el cronómetro marca algo que no se puede guardar
 * (por encima de MAX_DURACION_MIN). Si lo que marca sí cabe, se propone eso:
 * quien haya leído nueve horas seguidas confirma sus 540 de una pulsación.
 */
export const MINUTOS_PROPUESTOS = 60;

/** Longitud máxima del bookId, la misma que exigen las reglas. */
const MAX_BOOKID = 128;

/**
 * Sanea la sesión que viene de localStorage. Devuelve null a la mínima duda:
 * una sesión que no se puede interpretar es una sesión que hay que tirar, no
 * una que haya que pintar con un contador en NaN.
 *
 * Lo que valida y por qué:
 *   - bookId: string de 1 a MAX_BOOKID caracteres, como en las reglas.
 *   - startAt: número finito, positivo y no futuro. Sin esto,
 *     `Date.now() - startAt` da NaN y la barra muestra "NaN:NaN:NaN" sin
 *     ninguna forma de cerrarse.
 *   - uid: si la sesión lo lleva y no es el de quien está dentro, se descarta.
 *     En un navegador compartido, la cuenta B heredaba la sesión de la A y
 *     caía en el mismo atasco: un bookId que no está en su biblioteca.
 *     Las sesiones guardadas antes de este cambio no lo llevan: se aceptan.
 *
 * @param {*} bruto Lo que había en localStorage, ya parseado (o cualquier cosa).
 * @param {object} [opciones] Contexto.
 * @param {?string} [opciones.uid] Uid de la cuenta actual, si se conoce.
 * @param {number} [opciones.ahoraMs] Momento actual en ms.
 * @return {?{bookId: string, startAt: number, startPage: number, uid: ?string}}
 *     Sesión saneada, o null si no sirve.
 */
export function normalizarSesion(bruto, { uid = null, ahoraMs = Date.now() } = {}) {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;

    const bookId = bruto.bookId;
    if (typeof bookId !== 'string' || bookId.length < 1 || bookId.length > MAX_BOOKID) return null;

    const startAt = bruto.startAt;
    if (typeof startAt !== 'number' || !isFinite(startAt) || startAt <= 0) return null;
    if (startAt > ahoraMs) return null;

    const suUid = typeof bruto.uid === 'string' && bruto.uid ? bruto.uid : null;
    if (suUid && uid && suUid !== uid) return null;

    // La página de partida no invalida nada: como mucho vale 0. Perder el
    // punto de salida es molesto; perder la sesión entera por eso, absurdo.
    const cruda = Number(bruto.startPage);
    const startPage = (isFinite(cruda) && cruda > 0) ? Math.floor(cruda) : 0;

    return { bookId, startAt, startPage, uid: suUid };
}

/**
 * Minutos que lleva corriendo una sesión. Suelo de 1: una sesión de veinte
 * segundos es una sesión de un minuto, no de cero (las reglas admiten el 0,
 * pero guardar ceros ensucia la media de páginas por hora).
 * @param {{startAt: number}} sesion Sesión ya saneada.
 * @param {number} [ahoraMs] Momento actual en ms.
 * @return {number} Duración en minutos.
 */
export function duracionMin(sesion, ahoraMs = Date.now()) {
    const ms = ahoraMs - sesion.startAt;
    return Math.max(1, Math.round(ms / 60000));
}

/**
 * Qué hacer al cerrar una sesión. El orden de las ramas importa:
 *
 *   1. `esperando`: la biblioteca aún no ha llegado, o se está mirando la de
 *      un amigo (que sustituye booksData). Ahí no se sabe si el libro existe,
 *      así que no se avisa de nada. Un falso "tu libro ya no está" cada vez
 *      que arranca la app sería peor que el fallo original.
 *   2. `sin-libro` gana sobre la duración: sin libro no hay nada que guardar,
 *      así que preguntar cuántos minutos leyó no tendría sentido.
 *   3. `revisar`: pasa del umbral, se pide confirmación del tiempo. La
 *      propuesta es lo que marca el cronómetro siempre que quepa en una
 *      sesión; solo cuando no cabe se propone otra cosa, porque ahí el número
 *      del cronómetro no es una respuesta posible.
 *   4. `ok`: se guarda tal cual.
 *
 * @param {object} opciones Contexto de la decisión.
 * @param {?object} opciones.sesion Sesión ya saneada, o null.
 * @param {boolean} opciones.libroExiste Si el libro sigue en la biblioteca.
 * @param {boolean} opciones.librosCargados Si booksData ya es de fiar.
 * @param {number} [opciones.ahoraMs] Momento actual en ms.
 * @return {{estado: string, minutos?: number, minutosPropuestos?: number}}
 */
export function evaluarCierre({ sesion, libroExiste, librosCargados, ahoraMs = Date.now() }) {
    if (!sesion) return { estado: 'sin-sesion' };
    if (!librosCargados) return { estado: 'esperando' };

    const minutos = duracionMin(sesion, ahoraMs);
    if (!libroExiste) return { estado: 'sin-libro', minutos };
    if (minutos > UMBRAL_REVISION_MIN) {
        const minutosPropuestos = minutos <= MAX_DURACION_MIN ? minutos : MINUTOS_PROPUESTOS;
        return { estado: 'revisar', minutos, minutosPropuestos, cabe: minutos <= MAX_DURACION_MIN };
    }
    return { estado: 'ok', minutos };
}

/**
 * Interpreta los minutos que teclea la usuaria cuando se le pregunta.
 * Devuelve null en vez de recortar: recortar 2577 a 1440 sería inventarse un
 * dato que nadie ha dicho, y encima uno que las reglas aceptarían.
 * @param {*} entrada Texto (o número) tal cual llega del diálogo.
 * @return {?number} Entero entre 1 y MAX_DURACION_MIN, o null si no vale.
 */
export function minutosValidos(entrada) {
    if (typeof entrada !== 'string' && typeof entrada !== 'number') return null;
    const texto = String(entrada).trim();
    // Solo dígitos: "45.7" o "45 min" no se adivinan, se vuelven a preguntar.
    if (!/^\d+$/.test(texto)) return null;
    const n = Number(texto);
    if (!isFinite(n) || n < 1 || n > MAX_DURACION_MIN) return null;
    return n;
}

/**
 * Familia de un fallo al guardar, para poder decir qué ha pasado en vez de
 * soltar siempre el mismo "no se pudo guardar la sesión".
 * @param {*} error Error de Firestore (o lo que sea).
 * @return {string} 'permisos' | 'sin-red' | 'otro'.
 */
export function clasificarFalloGuardado(error) {
    const code = String(error?.code || '');
    if (code === 'permission-denied') return 'permisos';
    if (code === 'unavailable' || code === 'deadline-exceeded') return 'sin-red';
    return 'otro';
}

/**
 * Duración en texto para los avisos ("42 h 57 min", "35 min"). El contador de
 * la barra usa otro formato (hh:mm:ss); aquí se busca que se lea de corrido
 * dentro de una frase.
 * @param {number} minutos Duración en minutos.
 * @return {string} Texto legible.
 */
export function duracionEnTexto(minutos) {
    const m = Math.max(0, Math.round(Number(minutos) || 0));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const resto = m % 60;
    return resto === 0 ? `${h} h` : `${h} h ${resto} min`;
}
