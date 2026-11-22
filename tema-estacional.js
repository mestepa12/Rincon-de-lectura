// Temas estacionales: decide por fecha cuál toca pintar.
//
// Puro a propósito: recibe la fecha, no llama a new Date() ni toca el DOM,
// localStorage o Firestore, para poder probarlo solo
// (tests/tema-estacional.test.mjs). El cableado está en script.js.
//
// Fecha LOCAL del dispositivo, no UTC: "del 20 de octubre al 2 de
// noviembre" es el calendario de quien mira, como rachas y objetivos
// (ver fecha-local.js). Con UTC, en México saldría a las 18:00 del 19.
// No hay nada compartido entre usuarias que obligue a un reloj común.

/**
 * Una fila por tema. desde/hasta = [mes, día] del calendario local, ambos
 * incluidos. Si desde es posterior a hasta, el periodo cruza de año.
 * Los periodos no se solapan (lo comprueba una prueba).
 * claveApagado: clave de localStorage con el periodo en que se apagó; la de
 * Halloween es la de siempre, así lo ya guardado sigue valiendo.
 */
export const TEMAS = Object.freeze([
    Object.freeze({ nombre: 'halloween', desde: [10, 20], hasta: [11, 2], claveApagado: 'tema-halloween-apagado' }),
    Object.freeze({ nombre: 'navidad', desde: [12, 1], hasta: [1, 6], claveApagado: 'tema-navidad-apagado' }),
]);

const mesDia = ([mes, dia]) => mes * 100 + dia;

/**
 * Periodo de `tema` en el que cae una fecha local, identificado por el año
 * en que EMPIEZA: del 1/12/2026 al 6/01/2027 es todo "2026". Así, apagarlo
 * en diciembre sigue valiendo en enero.
 * @param {{desde: number[], hasta: number[]}} tema Fila de TEMAS.
 * @param {Date} fecha Instante a comprobar.
 * @return {string|null} "2026" si está dentro; null si no (o fecha inválida).
 */
export const periodoTema = (tema, fecha) => {
    if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return null;
    // Mes, día y año de la MISMA fecha local; nunca mezclar con getUTC*
    const md = (fecha.getMonth() + 1) * 100 + fecha.getDate();
    const ini = mesDia(tema.desde);
    const fin = mesDia(tema.hasta);
    const cruza = ini > fin;
    const dentro = cruza ? (md >= ini || md <= fin) : (md >= ini && md <= fin);
    if (!dentro) return null;
    return String(fecha.getFullYear() - (cruza && md <= fin ? 1 : 0));
};

/**
 * Tema cuyo periodo contiene la fecha, esté o no apagado.
 * @param {Date} fecha
 * @return {object|null} Fila de TEMAS o null.
 */
export const temaDelPeriodo = (fecha) => TEMAS.find((t) => periodoTema(t, fecha) !== null) ?? null;

/**
 * Tema que se pinta. Apagarlo vale solo para el periodo en curso.
 * @param {Date} fecha
 * @param {Record<string, string|null|undefined>} [apagados] nombre → valor de su claveApagado.
 * @return {string|null} Nombre del tema o null.
 */
export const temaActivo = (fecha, apagados = {}) => {
    const tema = temaDelPeriodo(fecha);
    if (!tema) return null;
    return periodoTema(tema, fecha) === (apagados ?? {})[tema.nombre] ? null : tema.nombre;
};

// --- Compatibilidad: API anterior de Halloween -------------------------------

/** Clave de localStorage: año del periodo en el que se apagó. */
export const CLAVE_APAGADO_HALLOWEEN = 'tema-halloween-apagado';

/** @return {string|null} Periodo de Halloween de la fecha, o null. */
export const periodoHalloween = (fecha) => periodoTema(TEMAS[0], fecha);

/** @return {boolean} ¿Se pinta Halloween con ese valor guardado? */
export const temaHalloweenActivo = (fecha, apagadoEn = null) => {
    const periodo = periodoHalloween(fecha);
    return periodo !== null && periodo !== apagadoEn;
};
