// Cerrar sesión sin dejar el dispositivo recibiendo los avisos de la cuenta.
//
// Módulo puro: no toca el DOM ni Firebase. script.js le pasa las operaciones
// (quitar el token de Firestore, borrarlo en FCM, desuscribir, signOut...),
// así que se puede probar solo con dobles, incluidos los fallos.
//
// Antes del signOut, con la sesión aún abierta, se hacen dos limpiezas a la
// vez. Basta con una para que el dispositivo deje de recibir avisos:
//   - Firestore: quitar el token de users/{uid}/privado/notificaciones, así
//     las Functions ya no le mandan nada.
//   - FCM: deleteToken(). Si falla, plan B: cancelar a mano la suscripción
//     push del navegador. deleteToken() hace primero una llamada de red y,
//     si falla (sin red), lanza ANTES de desuscribir.
//
// Todo con un tope: pase lo que pase, el signOut llega como mucho a los
// TOPE_LIMPIEZA_MS, y cada fallo queda en avisar() (nunca con el token).

/** Tiempo máximo de limpieza antes de cerrar sesión igualmente. */
export const TOPE_LIMPIEZA_MS = 3000;

const motivo = (error) => error?.code || error?.name || 'error';

/**
 * Las dos limpiezas. Rellena `informe` sobre la marcha.
 * @param {object} op Operaciones (ver cerrarSesionSinAvisos).
 * @param {object} informe Resultado que se va completando.
 * @return {Promise<void>}
 */
async function limpiar(op, informe) {
    let token = op.tokenConocido || null;
    // Solo se llama a deleteToken() si el token salió de getToken() en esta
    // carga: si no, el SDK registra por su cuenta otro service worker.
    let deGetToken = Boolean(token);

    if (!token) {
        // Nunca getToken() sin permiso: pediría el permiso al cerrar sesión.
        if (op.permiso !== 'granted') return;
        try {
            token = (await op.obtenerToken()) || null;
            deGetToken = Boolean(token);
        } catch (error) {
            op.avisar(`no se pudo obtener el token (${motivo(error)})`);
        }
    }
    informe.token = Boolean(token);

    const firestore = token
        ? op.quitarDeFirestore(token).then(
                () => { informe.firestore = 'quitado'; },
                (error) => {
                    informe.firestore = 'fallo';
                    op.avisar(`no se pudo quitar el token de Firestore (${motivo(error)})`);
                })
        : Promise.resolve();

    const fcm = (async () => {
        if (deGetToken) {
            try {
                await op.borrarEnFcm();
                informe.fcm = 'borrado';
                return;
            } catch (error) {
                op.avisar(`deleteToken falló (${motivo(error)}); se desuscribe a mano`);
            }
        }
        try {
            await op.desuscribir();
            informe.fcm = 'desuscrito';
        } catch (error) {
            informe.fcm = 'fallo';
            op.avisar(`no se pudo desuscribir (${motivo(error)})`);
        }
    })();

    await Promise.allSettled([firestore, fcm]);
}

/**
 * Limpia el token de este dispositivo y cierra sesión. El signOut llega
 * siempre, una sola vez y después de la limpieza (o del tope). Si falla el
 * propio signOut, el error se propaga: eso lo decide quien llama.
 * @param {object} op
 * @param {?string} op.tokenConocido Token que dio getToken() en esta carga.
 * @param {string} op.permiso Notification.permission, o 'no-disponible'.
 * @param {function(): Promise<?string>} op.obtenerToken getToken() con el
 *   service worker de la app.
 * @param {function(string): Promise<void>} op.quitarDeFirestore arrayRemove
 *   del token en el documento privado.
 * @param {function(): Promise<void>} op.borrarEnFcm deleteToken().
 * @param {function(): Promise<void>} op.desuscribir Plan B: unsubscribe()
 *   de la suscripción push del navegador.
 * @param {function(): Promise<void>} op.cerrarSesion signOut().
 * @param {function(string): void} op.avisar Registro de fallos.
 * @param {number} [op.tope] Milisegundos de limpieza como mucho.
 * @return {Promise<{token: boolean, firestore: string, fcm: string, tiempoAgotado: boolean}>}
 */
export async function cerrarSesionSinAvisos(op) {
    const informe = { token: false, firestore: 'omitido', fcm: 'omitido', tiempoAgotado: false };
    const tope = op.tope ?? TOPE_LIMPIEZA_MS;

    let temporizador;
    const agotado = new Promise((resolver) => {
        temporizador = setTimeout(() => {
            informe.tiempoAgotado = true;
            resolver();
        }, tope);
    });
    try {
        await Promise.race([
            limpiar(op, informe).catch((error) => op.avisar(`limpieza (${motivo(error)})`)),
            agotado,
        ]);
    } finally {
        clearTimeout(temporizador);
    }
    if (informe.tiempoAgotado) op.avisar(`se agotaron los ${tope} ms de limpieza; se cierra sesión igual`);

    await op.cerrarSesion();
    return informe;
}
