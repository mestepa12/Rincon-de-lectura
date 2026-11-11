// Progreso del bingo frente al cartón (bingo-progreso.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mesDe, mesAnterior, nombreMes, estaAbierto, ultimoDiaDeGracia, mirarMesAnterior,
  lineasDe, resumen, hitoNuevo, usosPorLibro, opcionesParaCasilla, coincide, elegirCartones,
  partirEnLineas, recortarALineas, lineasDeTitulo, lineasDeCasilla, giroSello,
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

// --- Tarjeta: líneas partidas a mano -------------------------------------
// Medidor de mentira: 10 px por carácter.
const medir = (s) => s.length * 10;

test('partirEnLineas: por palabras, y corta las que no caben', () => {
  assert.deepEqual(partirEnLineas('Un misterio para leer bajo la manta', 120, medir),
    ['Un misterio', 'para leer', 'bajo la', 'manta']);
  assert.deepEqual(partirEnLineas('Supercalifragilístico', 80, medir), ['Supercal', 'ifragilí', 'stico']);
  assert.deepEqual(partirEnLineas('   ', 80, medir), []);
});

test('recortarALineas: elipsis en la última línea, que sigue cabiendo', () => {
  const r = recortarALineas('Un libro que te regalaron o que te encantaría regalar', 120, 2, medir);
  assert.equal(r.length, 2);
  assert.ok(r[1].endsWith('…'));
  assert.ok(r.every((l) => medir(l) <= 120), JSON.stringify(r));
  // Corta por palabra entera: nada de "menos de 20…" si el reto dice 200.
  assert.deepEqual(recortarALineas('Un libro de menos de 200 páginas', 120, 2, medir), ['Un libro de', 'menos de…']);
  // Una sola palabra que no cabe con la elipsis: por letras.
  assert.deepEqual(recortarALineas('Supercalifragilístico espialidoso', 80, 1, medir), ['Superca…']);
  assert.deepEqual(recortarALineas('Corto', 120, 2, medir), ['Corto']);
  assert.deepEqual(recortarALineas('Lo que sea', 120, 0, medir), []);
});

test('lineasDeTitulo: abajo, junto al sello, estrecho; arriba, ancho entero', () => {
  const g = { ancho: 130, estrecho: 70, medir };
  assert.deepEqual(lineasDeTitulo('Momo', g), ['Momo']);
  assert.deepEqual(lineasDeTitulo('Dune Mesías', g), ['Dune', 'Mesías']);
  // Entera en la línea ancha antes que cortada en las dos estrechas.
  assert.deepEqual(lineasDeTitulo('Mujercitas', g), ['Mujercitas', '', '']);
  // En 2 líneas estrechas no cabe; en 3, la de arriba es ancha y sobra un
  // hueco: la última va vacía, al lado del sello.
  assert.deepEqual(lineasDeTitulo('La sombra del viento', g), ['La sombra del', 'viento', '']);
  const enorme = lineasDeTitulo('Un título larguísimo que no cabe ni a la de tres', g);
  assert.equal(enorme.length, 3);
  assert.ok(enorme[2].endsWith('…'));
  assert.ok(medir(enorme[0]) <= 130 && medir(enorme[1]) <= 70 && medir(enorme[2]) <= 70, JSON.stringify(enorme));
});

test('lineasDeCasilla: el título manda; el reto, hasta 3 líneas, y cede si no cabe', () => {
  const m = {
    anchoReto: 120, anchoTitulo: 130, anchoTituloEstrecho: 70, medirReto: medir, medirTitulo: medir,
    alto: 125, altoLineaReto: 16.47, altoLineaTitulo: 16,
  };
  const reto = 'Un libro que te regalaron o que te encantaría regalar';

  const corto = lineasDeCasilla({ reto, titulo: 'Momo' }, m);
  assert.deepEqual(corto.titulo, ['Momo']);
  assert.equal(corto.reto.length, 3);
  assert.ok(corto.reto[2].endsWith('…'));
  assert.ok(corto.reto.every((l) => medir(l) <= 120));

  // Con alto de sobra, el reto sigue en 3 aunque el título ocupe 3.
  const tres = lineasDeCasilla({ reto, titulo: 'La sombra del viento' }, m);
  assert.equal(tres.titulo.length, 3);
  assert.equal(tres.reto.length, 3);

  // Alto para el título y 2 de reto, no 3: el reto cede una.
  const ajustado = lineasDeCasilla({ reto, titulo: 'La sombra del viento' }, { ...m, alto: 85 });
  assert.equal(ajustado.titulo.length, 3);
  assert.equal(ajustado.reto.length, 2);

  // Sin alto para los dos, el reto cede (y nunca baja de 1).
  const justo = lineasDeCasilla({ reto, titulo: 'La sombra del viento' }, { ...m, alto: 60 });
  assert.equal(justo.titulo.length, 3);
  assert.equal(justo.reto.length, 1, 'el reto cede ante el título');
  assert.ok(justo.reto[0].endsWith('…'));

  const sinLibro = lineasDeCasilla({ reto }, m);
  assert.deepEqual(sinLibro.titulo, []);
  assert.equal(sinLibro.reto.join(' '), reto, 'sin libro, el reto entero');
});

test('giroSello: entre -22 y 22, distinto entre casillas y estable', () => {
  const giros = Array.from({ length: 16 }, (_, i) => giroSello(`2026-12/c${String(i + 1).padStart(2, '0')}`));
  assert.ok(giros.every((g) => Number.isInteger(g) && g >= -22 && g <= 22));
  assert.ok(new Set(giros).size >= 10, 'variados');
  assert.equal(giroSello('2026-12/c05'), giroSello('2026-12/c05'));
});
