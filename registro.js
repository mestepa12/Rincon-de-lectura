// El alta con correo y contraseña, sin DOM ni Firebase, para poder probarla
// sola. auth.js le pasa las llamadas de verdad y pinta lo que devuelve.
//
// Dos cosas que salieron de un fallo en producción (23/09): un doble toque
// en "Crear cuenta" lanzó dos altas a la vez y Auth aceptó las dos, en el
// mismo segundo, pese a tener activada una cuenta por correo. La reserva del
// nombre se la quedó la cuenta que la persona nunca llegó a usar.
//
//   1. Un alta a la vez: mientras hay una en curso, los envíos que lleguen
//      (doble toque, Enter repetido) no hacen nada.
//   2. Lo que falle DESPUÉS de crear la cuenta no puede acabar en "vuelve a
//      pulsar Crear cuenta": la cuenta ya existe y el reintento crearía otra
//      o chocaría con ella. El resultado dice en qué punto se quedó para que
//      la página la lleve a terminarla.

/**
 * Envuelve un manejador asíncrono para que no se solape consigo mismo: si
 * llega otra llamada mientras la anterior no ha terminado, se ignora y
 * devuelve undefined.
 * @param {function(...*): Promise<*>} fn Manejador.
 * @return {function(...*): Promise<*>}
 */
export function unoALaVez(fn) {
    let enCurso = false;
    return async (...args) => {
        if (enCurso) return undefined;
        enCurso = true;
        try {
            return await fn(...args);
        } finally {
            enCurso = false;
        }
    };
}

/**
 * Resultados posibles de altaConCorreo():
 *  - { estado: 'nombre-ocupado' }            nada creado; que elija otro.
 *  - { estado: 'sin-cuenta', error }         falló antes de crear la cuenta
 *                                            (o al crearla): se puede reintentar.
 *  - { estado: 'sin-perfil', uid, error }    la cuenta existe, pero el perfil
 *                                            y el nombre no: al onboarding.
 *  - { estado: 'sin-verificacion', uid, error }  alta completa, falló el correo
 *                                            de verificación: al aviso, que
 *                                            tiene el botón de reenviar.
 *  - { estado: 'completa', uid }
 */

/**
 * El alta, en orden: nombre libre → cuenta → perfil y reserva juntos →
 * medición → correo de verificación.
 * @param {{username: string}} datos Nombre ya validado por formato.
 * @param {object} deps Las llamadas de verdad (o de prueba):
 *   nombreLibre(clave) → Promise<boolean>
 *   crearCuenta() → Promise<string>   uid de la cuenta nueva
 *   guardarPerfilYReserva(uid, username, clave) → Promise   todo o nada
 *   medirAlta() → Promise             no puede romper el alta
 *   enviarVerificacion() → Promise
 * @return {Promise<object>} Uno de los resultados de arriba.
 */
export async function altaConCorreo({ username }, deps) {
    const clave = username.toLowerCase();

    // Antes de la cuenta: cualquier fallo deja todo como estaba.
    let uid;
    try {
        if (!(await deps.nombreLibre(clave))) return { estado: 'nombre-ocupado' };
        uid = await deps.crearCuenta();
    } catch (error) {
        return { estado: 'sin-cuenta', error };
    }

    // Desde aquí la cuenta existe. Perfil y reserva van juntos: o los dos o
    // ninguno, así no queda un perfil con un nombre que no es suyo.
    try {
        await deps.guardarPerfilYReserva(uid, username, clave);
    } catch (error) {
        // Sin perfil no hay alta que medir, pero sí correo que verificar: el
        // onboarding la manda luego a la biblioteca, que lo exige.
        await deps.enviarVerificacion().catch(() => {});
        return { estado: 'sin-perfil', uid, error };
    }

    // Alta completa: cuenta, perfil y nombre reservado. La medición va en
    // paralelo con el correo; se espera antes de devolver para que el
    // evento salga antes de cambiar de página.
    const medida = (async () => deps.medirAlta())().catch(() => {});

    let resultado = { estado: 'completa', uid };
    try {
        await deps.enviarVerificacion();
    } catch (error) {
        resultado = { estado: 'sin-verificacion', uid, error };
    }
    await medida;
    return resultado;
}
