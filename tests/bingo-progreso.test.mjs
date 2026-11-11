// Progreso del bingo frente al cartón (bingo-progreso.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mesDe, mesAnterior, nombreMes, estaAbierto, ultimoDiaDeGracia, mirarMesAnterior,
  lineasDe, resumen, hitoNuevo, usosPorLibro, opcionesParaCasilla, coincide, elegirCartones,
} from '../bingo-progreso.js';
import { fechasDelMes } from '../bingo-carton.js';

const IDS = Array.from({ length: 16 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`);
const carton = (mes = '2026-12') => ({
  mes, tamano: 4, maxCasillasPorLibro: 2,
  casillas: IDS.map((id) => ({ id, texto: id })), idsCasillas: IDS, ...fechasDelMes(mes),
});
const marcas = (...ids) => Object.fromEntries(ids.map((id, i) => [id, { bookId: `b${i}`, titulo: `L${i}` }]));

test('meses: actual local, anterior y nombre', () => {
  assert.equal(mesDe(new Date(2026, 11, 3, 10)), '2026-12');
  assert.equal(mesAnterior('2026-12'), '2026-11');
  assert.equal(mesAnterior('2027-01'), '2026-12');
  assert.equal(nombreMes('2026-12'), 'diciembre');
  assert.equal(nombreMes('2027-01', { conAnio: true }), 'enero de 2027');
});

test('abierto entre la apertura y el final de la gracia; último día = 3', () => {
  const c = carton();
  assert.equal(estaAbierto(c, new Date('2026-11-30T22:59:59Z')), false);
  assert.equal(estaAbierto(c, new Date('2026-11-30T23:00:00Z')), true);
  assert.equal(estaAbierto(c, new Date('2027-01-03T22:59:59Z')), true);
  assert.equal(estaAbierto(c, new Date('2027-01-03T23:00:00Z')), false);
  assert.equal(estaAbierto(null, new Date()), false);
  assert.equal(ultimoDiaDeGracia(c.cierraEn), 3);
  assert.equal(ultimoDiaDeGracia(fechasDelMes('2027-07').cierraEn), 3, 'también en verano');
});

test('el anterior solo se mira los primeros días', () => {
  assert.equal(mirarMesAnterior(new Date(2026, 11, 1)), true);
  assert.equal(mirarMesAnterior(new Date(2026, 11, 4)), true);
  assert.equal(mirarMesAnterior(new Date(2026, 11, 5)), false);
});

test('un 4×4 tiene 10 líneas: 4 filas, 4 columnas y 2 diagonales', () => {
  const l = lineasDe(4);
  assert.equal(l.length, 10);
  assert.deepEqual(l[0], [0, 1, 2, 3]);
  assert.deepEqual(l[4], [0, 4, 8, 12]);
  assert.deepEqual(l[8], [0, 5, 10, 15]);
  assert.deepEqual(l[9], [3, 6, 9, 12]);
  assert.equal(lineasDe(3).length, 8);
});

test('resumen: marcadas, líneas, lo que falta y qué casillas están en línea', () => {
  const vacio = resumen(carton(), {});
  assert.deepEqual([vacio.marcadas, vacio.total, vacio.lineas, vacio.completo, vacio.faltanParaLinea], [0, 16, 0, false, 4]);

  const casi = resumen(carton(), marcas('c01', 'c06', 'c11'));
  assert.equal(casi.faltanParaLinea, 1, 'a una de la diagonal');
  assert.equal(casi.lineas, 0);

  const diagonal = resumen(carton(), marcas('c01', 'c06', 'c11', 'c16', 'c02'));
  assert.equal(diagonal.lineas, 1);
  assert.equal(diagonal.faltanParaLinea, 0);
  assert.deepEqual([...diagonal.enLinea].sort(), ['c01', 'c06', 'c11', 'c16']);

  const todo = resumen(carton(), marcas(...IDS));
  assert.equal(todo.completo, true);
  assert.equal(todo.lineas, 10);

  // Una marca de una casilla que ya no existe no cuenta.
  assert.equal(resumen(carton(), marcas('c99')).marcadas, 0);
});

test('hitoNuevo: línea la primera vez, completo al final, nada si ya estaba', () => {
  const c = carton();
  const linea = marcas('c01', 'c02', 'c03', 'c04');
  assert.equal(hitoNuevo(c, {}, linea), 'line');
  assert.equal(hitoNuevo(c, { lineaEn: new Date() }, linea), null);
  assert.equal(hitoNuevo(c, { lineaEn: new Date() }, marcas(...IDS)), 'full');
  assert.equal(hitoNuevo(c, { lineaEn: new Date(), completoEn: new Date() }, marcas(...IDS)), null);
  assert.equal(hitoNuevo(c, {}, marcas('c01')), null);
});

test('usos por libro y opciones de una casilla con el máximo de 2', () => {
  const casillas = {
    c01: { bookId: 'dune', titulo: 'Dune' },
    c02: { bookId: 'dune', titulo: 'Dune' },
    c03: { bookId: 'solaris', titulo: 'Solaris' },
  };
  assert.deepEqual([...usosPorLibro(casillas)], [['dune', 2], ['solaris', 1]]);

  const libros = [
    { id: 'solaris', title: 'Solaris', section: 'libros-terminados' },
    { id: 'dune', title: 'Dune', section: 'libros-terminados' },
    { id: 'abismo', title: 'Ábside', section: 'leyendo-ahora' },
    { id: 'deseo', title: 'Deseado', section: 'lista-deseos' },
    { id: 'prox', title: 'Próximo', section: 'proximas-lecturas' },
    { id: 'aband', title: 'Abandonado', section: 'libros-abandonados' },
  ];
  const op = opcionesParaCasilla(libros, casillas, 'c05', 2);
  assert.deepEqual(op.map((o) => o.libro.id), ['abismo', 'dune', 'solaris'], 'leyendo primero; solo secciones leídas');
  assert.equal(op.find((o) => o.libro.id === 'dune').disponible, false, 'Dune ya está en 2');
  assert.equal(op.find((o) => o.libro.id === 'solaris').disponible, true);

  // En una casilla donde ya está Dune, Dune sigue disponible (es la actual).
  const enC01 = opcionesParaCasilla(libros, casillas, 'c01', 2).find((o) => o.libro.id === 'dune');
  assert.deepEqual([enC01.actual, enC01.disponible], [true, true]);
});

test('búsqueda sin acentos ni mayúsculas, por título o autor', () => {
  const l = { title: 'Cien años de soledad', author: 'Gabriel García Márquez' };
  assert.equal(coincide(l, 'AÑOS'), true);
  assert.equal(coincide(l, 'garcia'), true);
  assert.equal(coincide(l, 'dune'), false);
  assert.equal(coincide(l, '  '), true);
});

test('elegirCartones: principal y aviso de gracia', () => {
  const nov = carton('2026-11');
  const dic = carton('2026-12');
  const dia3 = new Date('2026-12-03T12:00:00Z');
  const dia5 = new Date('2026-12-05T12:00:00Z');
  const empezado = { casillas: marcas('c01') };

  // El 3 de diciembre con noviembre a medias: diciembre + aviso.
  assert.deepEqual(elegirCartones({ actual: dic, anterior: nov, progresoAnterior: empezado, ahora: dia3 }),
    { principal: dic, gracia: nov });
  // Noviembre sin tocar: sin aviso.
  assert.equal(elegirCartones({ actual: dic, anterior: nov, progresoAnterior: null, ahora: dia3 }).gracia, null);
  // Noviembre completo: sin aviso.
  assert.equal(elegirCartones({
    actual: dic, anterior: nov, progresoAnterior: { ...empezado, completoEn: new Date() }, ahora: dia3,
  }).gracia, null);
  // El 5, cerrado: sin aviso.
  assert.equal(elegirCartones({ actual: dic, anterior: nov, progresoAnterior: empezado, ahora: dia5 }).gracia, null);
  // Diciembre sin publicar: sigue noviembre mientras esté abierto, sin aviso.
  assert.deepEqual(elegirCartones({ actual: null, anterior: nov, progresoAnterior: empezado, ahora: dia3 }),
    { principal: nov, gracia: null });
  // Ni uno ni otro: no hay bloque.
  assert.deepEqual(elegirCartones({ actual: null, anterior: nov, progresoAnterior: null, ahora: dia5 }),
    { principal: null, gracia: null });
});
