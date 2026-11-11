// Validación, fechas y republicación del cartón del bingo (bingo-carton.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  validarCarton, fechasDelMes, medianocheEspana, documentoPublicable, cambiosNoPermitidos,
  esMes, GRACIA_DIAS,
} from '../bingo-carton.js';

const casillas = (n) => Array.from({ length: n }, (_, i) => ({
  id: `c${String(i + 1).padStart(2, '0')}`,
  texto: `Reto número ${i + 1}`,
}));
const valido = () => ({
  mes: '2031-05', titulo: 'Bingo de mayo', tamano: 4, maxCasillasPorLibro: 2, casillas: casillas(16),
});
const conErrorQue = (c, re) => {
  const errores = validarCarton(c);
  assert.ok(errores.some((e) => re.test(e)), `se esperaba un error ${re}; hubo: ${JSON.stringify(errores)}`);
};

test('un cartón bien escrito no da errores', () => {
  assert.deepEqual(validarCarton(valido()), []);
  assert.deepEqual(validarCarton({ ...valido(), tamano: 3, casillas: casillas(9) }), []);
  assert.deepEqual(validarCarton({ ...valido(), tamano: 5, casillas: casillas(25) }), []);
});

test('los cartones de contenido/bingos/ son válidos y se llaman como su mes', () => {
  const dir = 'contenido/bingos';
  const ficheros = readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(ficheros.length > 0);
  for (const f of ficheros) {
    const c = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
    assert.deepEqual(validarCarton(c), [], f);
    assert.equal(`${c.mes}.json`, f);
  }
});

test('no es un objeto, campos que sobran y campos que faltan', () => {
  conErrorQue(null, /objeto JSON/);
  conErrorQue([], /objeto JSON/);
  conErrorQue({ ...valido(), publicaDesde: '2031-05-01' }, /no existen: publicaDesde/);
  const { titulo, ...sinTitulo } = valido();
  conErrorQue(sinTitulo, /Faltan campos: titulo/);
});

test('mes, título y tamaño', () => {
  conErrorQue({ ...valido(), mes: '2031-5' }, /AAAA-MM/);
  conErrorQue({ ...valido(), mes: '2031-13' }, /AAAA-MM/);
  conErrorQue({ ...valido(), titulo: '   ' }, /titulo/);
  conErrorQue({ ...valido(), titulo: 'x'.repeat(81) }, /titulo/);
  conErrorQue({ ...valido(), titulo: 'Bingo 🎄' }, /emojis/);
  conErrorQue({ ...valido(), tamano: 6, casillas: casillas(36) }, /tamano/);
  conErrorQue({ ...valido(), tamano: '4' }, /tamano/);
});

test('número de casillas y máximo por libro', () => {
  conErrorQue({ ...valido(), casillas: casillas(15) }, /lleva 16 casillas y hay 15/);
  conErrorQue({ ...valido(), casillas: 'c01' }, /lista/);
  conErrorQue({ ...valido(), maxCasillasPorLibro: 0 }, /maxCasillasPorLibro/);
  conErrorQue({ ...valido(), maxCasillasPorLibro: 17 }, /maxCasillasPorLibro/);
  conErrorQue({ ...valido(), maxCasillasPorLibro: 1.5 }, /maxCasillasPorLibro/);
});

test('cada casilla: id, texto, repetidos y emojis', () => {
  const con = (i, casilla) => {
    const c = valido();
    c.casillas[i] = casilla;
    return c;
  };
  conErrorQue(con(0, 'texto suelto'), /Casilla 1: tiene que ser un objeto/);
  conErrorQue(con(0, { id: 'a1', texto: 'Un reto' }), /Casilla 1: el id/);
  conErrorQue(con(1, { id: 'c01', texto: 'Otro reto' }), /Casilla 2: el id c01 está repetido/);
  conErrorQue(con(2, { id: 'c03', texto: 'ab' }), /Casilla 3 \(c03\): el texto/);
  conErrorQue(con(2, { id: 'c03', texto: 'x'.repeat(121) }), /Casilla 3 \(c03\): el texto/);
  conErrorQue(con(3, { id: 'c04', texto: 'Un libro con nieve ❄️' }), /sin emojis/);
  conErrorQue(con(4, { id: 'c05', texto: ' reto NÚMERO 1 ' }), /mismo texto que c01/);
  conErrorQue(con(5, { id: 'c06', texto: 'Un reto', pista: 'x' }), /campos que no existen: pista/);
});

test('las comillas latinas y los acentos no cuentan como emoji', () => {
  const c = valido();
  c.casillas[0].texto = 'Uno con «noche» en el título, ¿a que sí?';
  assert.deepEqual(validarCarton(c), []);
});

test('el mes se abre el día 1 a las 00:00 de España y se cierra tras la gracia', () => {
  assert.equal(GRACIA_DIAS, 3);
  // Invierno (UTC+1): diciembre de 2026 y su cierre el 4 de enero.
  const dic = fechasDelMes('2026-12');
  assert.equal(dic.publicaDesde.toISOString(), '2026-11-30T23:00:00.000Z');
  assert.equal(dic.cierraEn.toISOString(), '2027-01-03T23:00:00.000Z');
  // Verano (UTC+2).
  const jul = fechasDelMes('2027-07');
  assert.equal(jul.publicaDesde.toISOString(), '2027-06-30T22:00:00.000Z');
  assert.equal(jul.cierraEn.toISOString(), '2027-08-03T22:00:00.000Z');
  // Marzo se abre en invierno y se cierra ya en horario de verano (el
  // cambio es el último domingo de marzo).
  const mar = fechasDelMes('2027-03');
  assert.equal(mar.publicaDesde.toISOString(), '2027-02-28T23:00:00.000Z');
  assert.equal(mar.cierraEn.toISOString(), '2027-04-03T22:00:00.000Z');
  assert.throws(() => fechasDelMes('2027-3'), /no válido/);
});

test('medianocheEspana acepta pasarse de mes, como Date', () => {
  assert.equal(medianocheEspana(2026, 13, 4).toISOString(), '2027-01-03T23:00:00.000Z');
});

test('esMes', () => {
  assert.equal(esMes('2026-12'), true);
  assert.equal(esMes('2026-00'), false);
  assert.equal(esMes(202612), false);
});

test('documentoPublicable añade ids, fechas y versión, y recorta espacios', () => {
  const c = valido();
  c.casillas[0].texto = '  Reto número 1  ';
  const d = documentoPublicable(c, 3);
  assert.deepEqual(d.idsCasillas, c.casillas.map((x) => x.id));
  assert.equal(d.casillas[0].texto, 'Reto número 1');
  assert.equal(d.version, 3);
  assert.equal(d.publicaDesde.toISOString(), '2031-04-30T22:00:00.000Z');
  assert.equal(d.cierraEn.toISOString(), '2031-06-03T22:00:00.000Z');
});

test('republicar: antes de abrir se puede todo; después, solo textos', () => {
  const anterior = documentoPublicable(valido(), 1);
  const antesDeAbrir = new Date(anterior.publicaDesde.getTime() - 1);
  const despues = new Date(anterior.publicaDesde.getTime() + 1);

  const reordenado = valido();
  reordenado.casillas.reverse();
  const nuevo = documentoPublicable(reordenado, 2);
  assert.deepEqual(cambiosNoPermitidos(anterior, nuevo, antesDeAbrir), []);
  assert.deepEqual(cambiosNoPermitidos(anterior, nuevo, despues), ['los ids de las casillas o su orden']);

  const otroTamano = documentoPublicable({ ...valido(), tamano: 3, casillas: casillas(9) }, 2);
  assert.equal(cambiosNoPermitidos(anterior, otroTamano, despues).length, 2);

  const erratas = valido();
  erratas.casillas[4].texto = 'Texto corregido';
  erratas.titulo = 'Otro título';
  assert.deepEqual(cambiosNoPermitidos(anterior, documentoPublicable(erratas, 2), despues), []);

  assert.deepEqual(cambiosNoPermitidos(null, nuevo, despues), []);
});
