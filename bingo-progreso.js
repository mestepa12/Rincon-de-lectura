// Bingo de lectura: el progreso de una usuaria frente a un cartón.
//
// Puro como bingo-carton.js: ni DOM ni Firestore, para probarlo solo
// (tests/bingo-progreso.test.mjs). bingo.js lo pinta y lo guarda.
//
// Formas que maneja:
//   carton:   { mes, titulo, tamano, maxCasillasPorLibro, casillas: [{id, texto}],
//               idsCasillas, publicaDesde: Date, cierraEn: Date }
//   casillas: { cXX: { bookId, titulo } }  (solo las marcadas)
import { fechaLocal } from './fecha-local.js';
import { GRACIA_DIAS, ZONA } from './bingo-carton.js';

// Lo que se puede asignar a una casilla: lo que se está leyendo y lo
// terminado. Ni deseos, ni próximas, ni abandonados: eso no se ha leído.
export const SECCIONES_ASIGNABLES = ['leyendo-ahora', 'libros-terminados'];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "AAAA-MM" del mes local de un instante (reloj del dispositivo). */
export const mesDe = (fecha = new Date()) => fechaLocal(fecha).slice(0, 7);

/** Mes anterior a "AAAA-MM". */
export const mesAnterior = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
};

/** "diciembre", o "diciembre de 2026" con conAnio. */
export const nombreMes = (mes, { conAnio = false } = {}) => {
  const [a, m] = mes.split('-').map(Number);
  return conAnio ? `${MESES[m - 1]} de ${a}` : MESES[m - 1];
};

/** ¿Se puede marcar ahora? Entre la apertura y el final de la gracia. */
export const estaAbierto = (carton, ahora) =>
  Boolean(carton) && ahora >= carton.publicaDesde && ahora < carton.cierraEn;

/**
 * Día del mes siguiente (en España) que es el último en que se puede marcar.
 * @param {Date} cierraEn Cierre del cartón (00:00 del día siguiente).
 * @return {number} Por ejemplo 3.
 */
export const ultimoDiaDeGracia = (cierraEn) => Number(new Intl.DateTimeFormat('es-ES', {
  timeZone: ZONA, day: 'numeric',
}).format(new Date(cierraEn.getTime() - 1)));

/**
 * ¿Merece la pena leer también el cartón del mes anterior? Solo los
 * primeros días del mes, que es cuando puede seguir abierto. Un día de
 * margen para quien va por delante de la hora de España.
 * @param {Date} ahora Instante.
 * @return {boolean}
 */
export const mirarMesAnterior = (ahora) => ahora.getDate() <= GRACIA_DIAS + 1;

/**
 * Las líneas de una cuadrícula: filas, columnas y las dos diagonales.
 * @param {number} tamano Lado.
 * @return {number[][]} Índices de casilla de cada línea.
 */
export function lineasDe(tamano) {
  const r = Array.from({ length: tamano }, (_, i) => i);
  return [
    ...r.map((f) => r.map((c) => f * tamano + c)),
    ...r.map((c) => r.map((f) => f * tamano + c)),
    r.map((i) => i * tamano + i),
    r.map((i) => i * tamano + (tamano - 1 - i)),
  ];
}

/**
 * Resumen del cartón: cuántas marcadas, líneas hechas, cuánto falta.
 * Las marcas con ids que ya no están en el cartón no cuentan.
 * @param {object} carton Cartón.
 * @param {object} casillas Marcas de la usuaria.
 * @return {{marcadas: number, total: number, lineas: number, completo: boolean,
 *     faltanParaLinea: number, enLinea: Set<string>}}
 */
export function resumen(carton, casillas = {}) {
  const ids = carton.casillas.map((c) => c.id);
  const marcada = ids.map((id) => Boolean(casillas[id]));
  const lineas = lineasDe(carton.tamano);
  const hechas = lineas.filter((l) => l.every((i) => marcada[i]));
  const enLinea = new Set(hechas.flat().map((i) => ids[i]));
  const marcadas = marcada.filter(Boolean).length;
  return {
    marcadas,
    total: ids.length,
    lineas: hechas.length,
    completo: marcadas === ids.length,
    faltanParaLinea: Math.min(...lineas.map((l) => l.filter((i) => !marcada[i]).length)),
    enLinea,
  };
}

/**
 * Qué hito se acaba de alcanzar al pasar de unas marcas a otras, si alguno.
 * Solo cuenta si no se había apuntado ya (lineaEn / completoEn).
 * @param {object} carton Cartón.
 * @param {object} progreso Documento de progreso ANTES del cambio.
 * @param {object} casillasDespues Marcas después del cambio.
 * @return {'line'|'full'|null}
 */
export function hitoNuevo(carton, progreso, casillasDespues) {
  const r = resumen(carton, casillasDespues);
  if (r.completo && !progreso?.completoEn) return 'full';
  if (r.lineas > 0 && !progreso?.lineaEn) return 'line';
  return null;
}

/** En cuántas casillas está cada libro. */
export function usosPorLibro(casillas = {}) {
  const usos = new Map();
  for (const c of Object.values(casillas)) {
    if (c?.bookId) usos.set(c.bookId, (usos.get(c.bookId) || 0) + 1);
  }
  return usos;
}

/**
 * Libros que se le pueden ofrecer a una casilla, en orden: primero lo que se
 * está leyendo, luego lo terminado, cada grupo por título.
 * @param {object[]} libros Biblioteca ({id, title, author, section, cover}).
 * @param {object} casillas Marcas actuales.
 * @param {string} casillaId Casilla que se está rellenando.
 * @param {number} max maxCasillasPorLibro del cartón.
 * @return {{libro: object, usos: number, actual: boolean, disponible: boolean}[]}
 */
export function opcionesParaCasilla(libros, casillas, casillaId, max) {
  const usos = usosPorLibro(casillas);
  const actualId = casillas[casillaId]?.bookId;
  return libros
    .filter((l) => SECCIONES_ASIGNABLES.includes(l.section))
    .sort((a, b) => SECCIONES_ASIGNABLES.indexOf(a.section) - SECCIONES_ASIGNABLES.indexOf(b.section)
      || String(a.title).localeCompare(String(b.title), 'es'))
    .map((libro) => {
      const n = usos.get(libro.id) || 0;
      const actual = libro.id === actualId;
      // El libro que ya está en esta casilla no "gasta" otra al reelegirlo.
      return { libro, usos: n, actual, disponible: actual || n < max };
    });
}

/** Filtro de búsqueda del selector: título o autor, sin acentos ni mayúsculas. */
export function coincide(libro, texto) {
  const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = norm(texto).trim();
  return !q || norm(libro.title).includes(q) || norm(libro.author).includes(q);
}

// ---------------------------------------------------------------------------
// Tarjeta compartible: textos partidos a mano. html2canvas no entiende
// line-clamp ni text-overflow en varias líneas, así que cada línea se decide
// aquí y se pinta como un bloque. `medir(texto)` devuelve el ancho en px con
// la fuente de la tarjeta (en el navegador, measureText de un canvas).
// ---------------------------------------------------------------------------

/**
 * Parte un texto en líneas que caben en `ancho`. Una palabra más larga que
 * la línea se corta por caracteres.
 * @param {string} texto
 * @param {number} ancho
 * @param {function(string): number} medir
 * @return {string[]}
 */
export function partirEnLineas(texto, ancho, medir) {
  const anchoDe = typeof ancho === 'function' ? ancho : () => ancho;
  const lineas = [];
  let actual = '';
  for (const palabra of String(texto).trim().split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (medir(prueba) <= anchoDe(lineas.length)) { actual = prueba; continue; }
    if (actual) lineas.push(actual);
    actual = '';
    let resto = palabra;
    while (medir(resto) > anchoDe(lineas.length) && resto.length > 1) {
      let n = resto.length - 1;
      while (n > 1 && medir(resto.slice(0, n)) > anchoDe(lineas.length)) n--;
      lineas.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    actual = resto;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * Como partirEnLineas, pero con un máximo: si sobra texto, la última línea
 * acaba en "…" y se acorta hasta que quepa. `ancho` puede ser un número o
 * una función del índice de línea.
 */
export function recortarALineas(texto, ancho, maxLineas, medir) {
  if (maxLineas <= 0) return [];
  const anchoDe = typeof ancho === 'function' ? ancho : () => ancho;
  const lineas = partirEnLineas(texto, anchoDe, medir);
  if (lineas.length <= maxLineas) return lineas;
  const fuera = lineas.slice(0, maxLineas);
  const cabe = (s) => medir(`${s}…`) <= anchoDe(maxLineas - 1);
  const limpia = (s) => s.replace(/[\s,.;:«(]+$/, '');
  // Por palabras enteras: "menos de 20…" engañaría (el reto dice 200).
  let ultima = fuera[maxLineas - 1];
  const palabras = ultima.split(' ');
  while (palabras.length > 1 && !cabe(limpia(palabras.join(' ')))) palabras.pop();
  ultima = limpia(palabras.join(' '));
  // Solo si ni una palabra cabe, por letras.
  while (ultima.length > 0 && !cabe(ultima)) ultima = ultima.slice(0, -1);
  fuera[maxLineas - 1] = `${limpia(ultima)}…`;
  return fuera;
}

/**
 * Título del libro en su hueco: 1 a 3 líneas pegadas abajo, con el sello a
 * su derecha. Las dos líneas de abajo comparten altura con el sello y son
 * estrechas; la de arriba (si hace falta) tiene el ancho entero. Se busca el
 * menor número de líneas en que cabe; si con 3 sobran huecos, la última va
 * vacía (el título sube y deja el sitio del sello). Si no cabe ni en 3, se
 * recorta con "…".
 * @return {string[]} De 1 a 3 líneas, de arriba abajo.
 */
export function lineasDeTitulo(titulo, { ancho, estrecho, medir }) {
  const reparto = (n) => {
    const lineas = partirEnLineas(titulo, (i) => (i >= n - 2 ? estrecho : ancho), medir);
    return lineas.length <= n ? [...lineas, ...Array(n - lineas.length).fill('')] : null;
  };
  // Sin cortar palabras, si se puede en 3 líneas: "Mujercitas" entera en la
  // línea ancha antes que "Mujercit / as" en las dos estrechas.
  const palabras = String(titulo).trim().split(/\s+/).join(' ');
  const entero = (lineas) => lineas.filter(Boolean).join(' ') === palabras;
  for (let n = 1; n <= 3; n++) {
    const r = reparto(n);
    if (r && entero(r)) return r;
  }
  for (let n = 1; n <= 3; n++) {
    const r = reparto(n);
    if (r) return r;
  }
  return recortarALineas(titulo, (i) => (i >= 1 ? estrecho : ancho), 3, medir);
}

/**
 * Líneas de una casilla de la tarjeta. Sin libro, el reto entero (con un
 * tope). Con libro, manda el título (hasta 3 líneas, ver lineasDeTitulo) y
 * el reto va en 3 líneas como mucho, con "…". Si con el título no quedara
 * alto para 3, el reto cede (al menos 1).
 * @param {{reto: string, titulo?: string}} casilla
 * @param {{anchoReto: number, anchoTitulo: number, anchoTituloEstrecho: number,
 *     medirReto: function, medirTitulo: function,
 *     alto: number, altoLineaReto: number, altoLineaTitulo: number}} m
 *     alto: alto útil de la celda, en px.
 * @return {{reto: string[], titulo: string[]}}
 */
export function lineasDeCasilla({ reto, titulo }, m) {
  if (!titulo) return { reto: recortarALineas(reto, m.anchoReto, 7, m.medirReto), titulo: [] };
  const lineasTitulo = lineasDeTitulo(titulo, {
    ancho: m.anchoTitulo, estrecho: m.anchoTituloEstrecho, medir: m.medirTitulo,
  });
  const caben = Math.floor((m.alto - lineasTitulo.length * m.altoLineaTitulo) / m.altoLineaReto);
  const huecoReto = Math.max(1, Math.min(3, caben));
  return { reto: recortarALineas(reto, m.anchoReto, huecoReto, m.medirReto), titulo: lineasTitulo };
}

/**
 * Giro del sello de una casilla, entre -22 y 22 grados: parece puesto a mano
 * y es siempre el mismo para la misma casilla del mismo mes (la imagen no
 * cambia cada vez que se genera).
 * @param {string} semilla Por ejemplo "2026-12/c05".
 * @return {number} Grados.
 */
export function giroSello(semilla) {
  let h = 2166136261;
  for (const ch of String(semilla)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 45) - 22;
}

/**
 * Qué cartón va en la biblioteca y si hay que avisar de la gracia del
 * anterior.
 *  - principal: el del mes actual; si no hay (o aún no se ve desde aquí,
 *    por la hora), el del anterior mientras siga abierto.
 *  - gracia: el anterior, si sigue abierto, hay un principal distinto y la
 *    usuaria lo empezó sin completarlo. Un cartón que no tocó no se recuerda.
 * @param {{actual: object|null, anterior: object|null,
 *     progresoAnterior: object|null, ahora: Date}} datos
 * @return {{principal: object|null, gracia: object|null}}
 */
export function elegirCartones({ actual, anterior, progresoAnterior, ahora }) {
  const anteriorAbierto = estaAbierto(anterior, ahora);
  const principal = actual || (anteriorAbierto ? anterior : null);
  const empezado = Object.keys(progresoAnterior?.casillas || {}).length > 0;
  const gracia = actual && anteriorAbierto && empezado && !progresoAnterior?.completoEn
    ? anterior
    : null;
  return { principal, gracia };
}
