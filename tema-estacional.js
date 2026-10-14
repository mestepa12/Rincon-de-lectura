// Tema de Halloween: decide por fecha si toca pintarlo.
//
// Puro a propósito: recibe la fecha, no llama a new Date() ni toca el DOM,
// localStorage o Firestore, para poder probarlo solo
// (tests/tema-estacional.test.mjs). El cableado está en script.js.
//
// Fecha LOCAL del dispositivo, no UTC: "del 20 de octubre al 2 de
// noviembre" es el calendario de quien mira, como rachas y objetivos
// (ver fecha-local.js). Con UTC, en México saldría a las 18:00 del 19.
// No hay nada compartido entre usuarias que obligue a un reloj común.

/** Clave de localStorage: año del periodo en el que se apagó. */
export const CLAVE_APAGADO_HALLOWEEN = 'tema-halloween-apagado';

/**
 * Periodo de Halloween (20 oct – 2 nov, ambos incluidos) en el que cae
 * una fecha local, identificado por su año.
 * @param {Date} fecha Instante a comprobar.
 * @return {string|null} "2026" si está dentro; null si no (o fecha inválida).
 */
export const periodoHalloween = (fecha) => {
    const mes = fecha.getMonth() + 1;
    const dia = fecha.getDate();
    const dentro = (mes === 10 && dia >= 20) || (mes === 11 && dia <= 2);
    return dentro ? String(fecha.getFullYear()) : null;
};

/**
 * ¿Se pinta el tema? Apagarlo vale solo para el periodo en curso: el año
 * siguiente el valor guardado ya no coincide y vuelve solo.
 * @param {Date} fecha Instante a comprobar.
 * @param {string|null} [apagadoEn] Valor guardado en CLAVE_APAGADO_HALLOWEEN.
 * @return {boolean}
 */
export const temaHalloweenActivo = (fecha, apagadoEn = null) => {
    const periodo = periodoHalloween(fecha);
    return periodo !== null && periodo !== apagadoEn;
};
