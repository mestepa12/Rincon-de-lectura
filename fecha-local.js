// Fechas de calendario ("YYYY-MM-DD") en la zona horaria del dispositivo.
//
// Antes se sacaban con toISOString(), que devuelve la fecha en UTC: en
// España, lo leído entre las 00:00 y la 01:00 (02:00 en verano) contaba
// para el día anterior, y un lunes de madrugada la semana empezaba el
// lunes previo. Rachas, objetivos y logros son "de tu día", no del de UTC.
//
// Este módulo NO toca el DOM ni Firestore a propósito, para poder probarlo
// solo (tests/fecha-local.test.mjs).

const dosCifras = (n) => String(n).padStart(2, '0');

/**
 * Fecha de calendario local de un instante.
 * @param {Date} [d] Instante; por defecto, ahora.
 * @return {string} "YYYY-MM-DD" según el reloj del dispositivo.
 */
export const fechaLocal = (d = new Date()) =>
    `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`;

/**
 * Lunes de la semana (local) de un instante. La semana empieza en lunes.
 * @param {Date} [d] Instante; por defecto, ahora.
 * @return {string} "YYYY-MM-DD" del lunes de esa semana.
 */
export const inicioSemanaLocal = (d = new Date()) => {
    const dia = d.getDay(); // 0 = domingo
    const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (dia === 0 ? 6 : dia - 1));
    return fechaLocal(lunes);
};

/**
 * Convierte "YYYY-MM-DD" en la medianoche LOCAL de ese día. new Date(str)
 * lo interpretaría como medianoche UTC, que en España es otro día a
 * ciertas horas.
 * @param {string} str Fecha "YYYY-MM-DD".
 * @return {Date} Medianoche local de esa fecha.
 */
export const parsearFechaLocal = (str) => {
    const [a, m, d] = str.split('-').map(Number);
    return new Date(a, m - 1, d);
};
