// Bingo de lectura: el cartón del mes, tal como se escribe a mano en
// contenido/bingos/AAAA-MM.json y tal como se publica en bingos/{AAAA-MM}.
//
// Este módulo NO toca Firestore ni el DOM a propósito: valida, calcula
// fechas y compara versiones, así que se puede probar solo
// (tests/bingo-carton.test.mjs). Lo usa scripts/publicar-bingo.mjs; el
// cliente lo podrá importar cuando llegue la interfaz.
//
// Lo que escribe la autora (el JSON):
//   { mes, titulo, tamano, maxCasillasPorLibro, casillas: [{ id, texto }] }
// Lo que añade la publicación, para que no se pueda escribir mal a mano:
//   idsCasillas  — los ids en orden; lo usan las reglas de Firestore
//   publicaDesde — día 1 a las 00:00, hora de España
//   cierraEn     — día 1 del mes siguiente + GRACIA_DIAS, 00:00 de España
//   version      — 1 la primera vez, +1 en cada republicación

// Días del mes siguiente en que todavía se puede marcar el cartón: quien
// termina un libro el 30 y lo apunta el 2 tiene que poder usarlo.
export const GRACIA_DIAS = 3;

// Las fronteras del mes son las de España, para todas: el cartón es el
// mismo para todo el mundo y se comenta a la vez en redes.
export const ZONA = 'Europe/Madrid';

export const TAMANOS = [3, 4, 5];
export const TEXTO_MIN = 3;
export const TEXTO_MAX = 120;
export const TITULO_MAX = 80;

const CLAVES_JSON = ['mes', 'titulo', 'tamano', 'maxCasillasPorLibro', 'casillas'];
const CLAVES_CASILLA = ['id', 'texto'];
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_ID = /^c\d{2}$/;
// Los textos salen en la imagen compartible, y ahí los adornos son SVG
// propios: un emoji se pintaría con la fuente del sistema de cada móvil.
const RE_EMOJI = /\p{Extended_Pictographic}/u;

const esTextoCon = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const tiene = (obj, clave) => Object.prototype.hasOwnProperty.call(obj, clave);

/** ¿Es un id de mes válido ("AAAA-MM")? */
export const esMes = (v) => typeof v === 'string' && RE_MES.test(v);

/**
 * Valida el cartón tal como lo escribe la autora.
 * @param {*} c Contenido del JSON ya parseado.
 * @return {string[]} Errores, en castellano y con la casilla afectada. Vacío
 *     si el cartón es válido.
 */
export function validarCarton(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['El cartón tiene que ser un objeto JSON.'];
  const errores = [];

  const sobran = Object.keys(c).filter((k) => !CLAVES_JSON.includes(k));
  if (sobran.length) errores.push(`Campos que no existen: ${sobran.join(', ')}. Solo valen: ${CLAVES_JSON.join(', ')}.`);
  const faltan = CLAVES_JSON.filter((k) => !tiene(c, k));
  if (faltan.length) errores.push(`Faltan campos: ${faltan.join(', ')}.`);

  if (tiene(c, 'mes') && !esMes(c.mes)) errores.push(`"mes" tiene que ser AAAA-MM (p. ej. 2026-12), no ${JSON.stringify(c.mes)}.`);
  if (tiene(c, 'titulo') && !esTextoCon(c.titulo, 1, TITULO_MAX)) errores.push(`"titulo" tiene que tener entre 1 y ${TITULO_MAX} caracteres.`);
  if (tiene(c, 'titulo') && RE_EMOJI.test(String(c.titulo))) errores.push('"titulo" no puede llevar emojis: sale en la imagen.');

  const tamanoOk = TAMANOS.includes(c.tamano);
  if (tiene(c, 'tamano') && !tamanoOk) errores.push(`"tamano" tiene que ser ${TAMANOS.join(', ')} (lado de la cuadrícula).`);
  const total = tamanoOk ? c.tamano * c.tamano : null;

  if (tiene(c, 'maxCasillasPorLibro')) {
    const m = c.maxCasillasPorLibro;
    if (!Number.isInteger(m) || m < 1 || (total && m > total)) {
      errores.push(`"maxCasillasPorLibro" tiene que ser un entero entre 1 y ${total ?? 'el número de casillas'}.`);
    }
  }

  if (tiene(c, 'casillas')) {
    if (!Array.isArray(c.casillas)) {
      errores.push('"casillas" tiene que ser una lista.');
    } else {
      if (total && c.casillas.length !== total) {
        errores.push(`Un cartón de ${c.tamano}×${c.tamano} lleva ${total} casillas y hay ${c.casillas.length}.`);
      }
      const ids = new Set();
      const textos = new Map();
      c.casillas.forEach((casilla, i) => {
        const donde = `Casilla ${i + 1}`;
        if (!casilla || typeof casilla !== 'object' || Array.isArray(casilla)) {
          errores.push(`${donde}: tiene que ser un objeto { id, texto }.`);
          return;
        }
        const extra = Object.keys(casilla).filter((k) => !CLAVES_CASILLA.includes(k));
        if (extra.length) errores.push(`${donde}: campos que no existen: ${extra.join(', ')}.`);
        if (!RE_ID.test(String(casilla.id))) {
          errores.push(`${donde}: el id tiene que ser "c" y dos cifras (c01, c02…), no ${JSON.stringify(casilla.id)}.`);
        } else if (ids.has(casilla.id)) {
          errores.push(`${donde}: el id ${casilla.id} está repetido.`);
        } else {
          ids.add(casilla.id);
        }
        if (!esTextoCon(casilla.texto, TEXTO_MIN, TEXTO_MAX)) {
          errores.push(`${donde} (${casilla.id}): el texto tiene que tener entre ${TEXTO_MIN} y ${TEXTO_MAX} caracteres.`);
        } else {
          if (RE_EMOJI.test(casilla.texto)) errores.push(`${donde} (${casilla.id}): sin emojis, sale en la imagen.`);
          const clave = casilla.texto.trim().toLowerCase();
          if (textos.has(clave)) errores.push(`${donde} (${casilla.id}): mismo texto que ${textos.get(clave)}.`);
          else textos.set(clave, casilla.id);
        }
      });
    }
  }
  return errores;
}

/**
 * Instante UTC de las 00:00 de un día en hora de España. Sin librerías:
 * prueba los desfases posibles (+1 en invierno, +2 en verano) y se queda con
 * el que, visto desde Madrid, cae a medianoche de ese día.
 * @param {number} anio Año.
 * @param {number} mes Mes, 1-12. Se admite 13 (enero del año siguiente).
 * @param {number} dia Día del mes. Se admite pasarse (desborda como Date).
 * @return {Date} El instante.
 */
export function medianocheEspana(anio, mes, dia) {
  const base = Date.UTC(anio, mes - 1, dia);
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const esperado = new Date(base).toISOString().slice(0, 10);
  for (const horas of [1, 2, 0, 3]) {
    const instante = new Date(base - horas * 3600e3);
    const p = Object.fromEntries(formato.formatToParts(instante).map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` === esperado && p.hour === '00' && p.minute === '00') return instante;
  }
  throw new Error(`No se pudo calcular la medianoche de ${esperado} en ${ZONA}.`);
}

/**
 * Cuándo se abre y se cierra el cartón de un mes.
 * @param {string} mes "AAAA-MM".
 * @return {{publicaDesde: Date, cierraEn: Date}}
 */
export function fechasDelMes(mes) {
  if (!esMes(mes)) throw new Error(`Mes no válido: ${mes}`);
  const [anio, m] = mes.split('-').map(Number);
  return {
    publicaDesde: medianocheEspana(anio, m, 1),
    cierraEn: medianocheEspana(anio, m + 1, 1 + GRACIA_DIAS),
  };
}

/**
 * Lo que se escribe en bingos/{mes}: el cartón más los campos derivados.
 * Las fechas van como Date; el script las convierte a Timestamp.
 * @param {object} c Cartón ya validado.
 * @param {number} version Versión que toca.
 * @return {object}
 */
export function documentoPublicable(c, version) {
  return {
    mes: c.mes,
    titulo: c.titulo.trim(),
    tamano: c.tamano,
    maxCasillasPorLibro: c.maxCasillasPorLibro,
    casillas: c.casillas.map(({ id, texto }) => ({ id, texto: texto.trim() })),
    idsCasillas: c.casillas.map(({ id }) => id),
    ...fechasDelMes(c.mes),
    version,
  };
}

/**
 * Qué impide republicar un cartón que ya está a la vista. Una vez abierto,
 * el progreso de cada usuaria guarda "id de casilla → libro": cambiar los
 * ids, su orden o el tamaño movería marcas ya hechas o las dejaría
 * apuntando a casillas que ya no existen. Los
 * textos y el título sí se pueden corregir.
 * @param {object|null} anterior Documento publicado (con idsCasillas y
 *     publicaDesde como Date), o null si no hay.
 * @param {object} nuevo Documento que se quiere publicar.
 * @param {Date} ahora Instante de referencia.
 * @return {string[]} Motivos; vacío si se puede publicar.
 */
export function cambiosNoPermitidos(anterior, nuevo, ahora) {
  if (!anterior || ahora < anterior.publicaDesde) return [];
  const motivos = [];
  if (anterior.tamano !== nuevo.tamano) motivos.push(`el tamaño (${anterior.tamano} → ${nuevo.tamano})`);
  const a = anterior.idsCasillas || [];
  const b = nuevo.idsCasillas;
  if (a.length !== b.length || a.some((id, i) => id !== b[i])) motivos.push('los ids de las casillas o su orden');
  return motivos;
}
