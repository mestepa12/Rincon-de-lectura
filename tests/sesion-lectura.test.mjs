// Pruebas de la sesión de lectura activa: saneado, duración y cierre.
// Runner de Node (node:test), sin dependencias nuevas:  npm test
//
// El caso que originó todo esto está en "el caso de producción": una sesión
// de 42:57:17 sobre un libro que se había mandado a la papelera.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    MAX_DURACION_MIN, UMBRAL_REVISION_MIN, MINUTOS_PROPUESTOS,
    normalizarSesion, duracionMin, evaluarCierre, minutosValidos,
    clasificarFalloGuardado, duracionEnTexto,
} from '../sesion-lectura.js';

const AHORA = Date.UTC(2026, 8, 22, 12, 0, 0);
const MIN = 60 * 1000;
const sesionDe = (minutos, extra = {}) => ({
    bookId: 'libro-1',
    startAt: AHORA - minutos * MIN,
    startPage: 10,
    ...extra,
});

// El cronómetro de producción: 42 h 57 min 17 s.
const MS_PRODUCCION = (42 * 3600 + 57 * 60 + 17) * 1000;

// ---------------------------------------------------------------------------
// normalizarSesion
// ---------------------------------------------------------------------------

test('una sesión correcta sale entera y sin campos de más', () => {
    const limpia = normalizarSesion(
        { bookId: 'abc', startAt: AHORA - 5 * MIN, startPage: 42, basura: 'x' },
        { ahoraMs: AHORA },
    );
    assert.deepEqual(limpia, { bookId: 'abc', startAt: AHORA - 5 * MIN, startPage: 42, uid: null });
});

test('lo que no es un objeto de sesión no es una sesión', () => {
    for (const raro of [null, undefined, 0, 7, 'sesion', [], [{ bookId: 'a' }], true]) {
        assert.equal(normalizarSesion(raro, { ahoraMs: AHORA }), null);
    }
});

test('sin un bookId utilizable no hay sesión', () => {
    const casos = [
        {},
        { bookId: '', startAt: AHORA - MIN },
        { bookId: 'x'.repeat(129), startAt: AHORA - MIN },
        { bookId: 123, startAt: AHORA - MIN },
        { bookId: null, startAt: AHORA - MIN },
    ];
    for (const caso of casos) assert.equal(normalizarSesion(caso, { ahoraMs: AHORA }), null);
});

test('un bookId de justo 128 caracteres todavía vale', () => {
    const limite = 'x'.repeat(128);
    const limpia = normalizarSesion({ bookId: limite, startAt: AHORA - MIN }, { ahoraMs: AHORA });
    assert.equal(limpia.bookId, limite);
});

test('un startAt que no sirve tira la sesión en vez de pintar NaN', () => {
    const casos = [
        { bookId: 'a' },                                  // ausente
        { bookId: 'a', startAt: NaN },
        { bookId: 'a', startAt: 0 },
        { bookId: 'a', startAt: -1 },
        { bookId: 'a', startAt: '1758542400000' },        // string, aunque parezca fecha
        { bookId: 'a', startAt: Infinity },
        { bookId: 'a', startAt: null },
    ];
    for (const caso of casos) assert.equal(normalizarSesion(caso, { ahoraMs: AHORA }), null);
});

test('una sesión que empieza en el futuro no vale: daría duración negativa', () => {
    assert.equal(normalizarSesion({ bookId: 'a', startAt: AHORA + MIN }, { ahoraMs: AHORA }), null);
});

test('una sesión que empieza justo ahora sí vale', () => {
    assert.ok(normalizarSesion({ bookId: 'a', startAt: AHORA }, { ahoraMs: AHORA }));
});

test('una startPage rara vale 0, pero no tira la sesión', () => {
    const página = (v) => normalizarSesion({ bookId: 'a', startAt: AHORA - MIN, startPage: v }, { ahoraMs: AHORA }).startPage;
    assert.equal(página(undefined), 0);
    assert.equal(página(-30), 0);
    assert.equal(página('nada'), 0);
    assert.equal(página(12.9), 12);
    assert.equal(página('25'), 25);
});

test('la sesión de otra cuenta no se hereda en un navegador compartido', () => {
    const ajena = { bookId: 'a', startAt: AHORA - MIN, uid: 'uid-ana' };
    assert.equal(normalizarSesion(ajena, { uid: 'uid-berta', ahoraMs: AHORA }), null);
    assert.ok(normalizarSesion(ajena, { uid: 'uid-ana', ahoraMs: AHORA }));
});

test('las sesiones de antes de este cambio, sin uid, se siguen aceptando', () => {
    const vieja = { bookId: 'a', startAt: AHORA - MIN, startPage: 3 };
    const limpia = normalizarSesion(vieja, { uid: 'uid-ana', ahoraMs: AHORA });
    assert.ok(limpia);
    assert.equal(limpia.uid, null);
});

// ---------------------------------------------------------------------------
// duracionMin
// ---------------------------------------------------------------------------

test('una sesión de nada dura un minuto, nunca cero', () => {
    assert.equal(duracionMin({ startAt: AHORA }, AHORA), 1);
    assert.equal(duracionMin({ startAt: AHORA - 20 * 1000 }, AHORA), 1);
    assert.equal(duracionMin({ startAt: AHORA - 59 * 1000 }, AHORA), 1);
});

test('los segundos se redondean, no se truncan', () => {
    assert.equal(duracionMin({ startAt: AHORA - 90 * 1000 }, AHORA), 2);
    assert.equal(duracionMin({ startAt: AHORA - 89 * 1000 }, AHORA), 1);
});

test('el caso de producción son 2577 minutos', () => {
    assert.equal(duracionMin({ startAt: AHORA - MS_PRODUCCION }, AHORA), 2577);
    assert.ok(2577 > MAX_DURACION_MIN, 'por encima del tope: las reglas lo rechazarían');
});

// ---------------------------------------------------------------------------
// evaluarCierre
// ---------------------------------------------------------------------------

test('sin sesión no hay nada que decidir', () => {
    const d = evaluarCierre({ sesion: null, libroExiste: false, librosCargados: true, ahoraMs: AHORA });
    assert.equal(d.estado, 'sin-sesion');
});

test('con la biblioteca sin cargar no se acusa a nadie de haber borrado el libro', () => {
    const d = evaluarCierre({
        sesion: sesionDe(2577), libroExiste: false, librosCargados: false, ahoraMs: AHORA,
    });
    assert.equal(d.estado, 'esperando');
});

test('el umbral son 8 horas: una maratón de lectura real no se cuestiona', () => {
    assert.equal(UMBRAL_REVISION_MIN, 480);
    const maraton = evaluarCierre({
        sesion: sesionDe(360), libroExiste: true, librosCargados: true, ahoraMs: AHORA,
    });
    assert.equal(maraton.estado, 'ok', 'seis horas se guardan sin preguntar');
});

test('justo en el umbral todavía se guarda sin preguntar', () => {
    const d = evaluarCierre({
        sesion: sesionDe(UMBRAL_REVISION_MIN), libroExiste: true, librosCargados: true, ahoraMs: AHORA,
    });
    assert.equal(d.estado, 'ok');
    assert.equal(d.minutos, UMBRAL_REVISION_MIN);
});

test('un minuto por encima del umbral ya se pregunta, proponiendo ese mismo tiempo', () => {
    const d = evaluarCierre({
        sesion: sesionDe(UMBRAL_REVISION_MIN + 1), libroExiste: true, librosCargados: true, ahoraMs: AHORA,
    });
    assert.equal(d.estado, 'revisar');
    assert.equal(d.minutosPropuestos, UMBRAL_REVISION_MIN + 1);
    assert.equal(d.cabe, true);
});

test('nueve horas seguidas se pueden confirmar tal cual: 540 se propone y se guarda', () => {
    const d = evaluarCierre({
        sesion: sesionDe(540), libroExiste: true, librosCargados: true, ahoraMs: AHORA,
    });
    assert.equal(d.estado, 'revisar');
    assert.equal(d.minutos, 540);
    assert.equal(d.minutosPropuestos, 540, 'el valor de partida es el tiempo real, no uno inventado');
    assert.equal(d.cabe, true);
    assert.equal(minutosValidos(String(d.minutosPropuestos)), 540, 'y 540 es un valor aceptable');
});

test('justo en el tope de las reglas todavía se propone el tiempo real', () => {
    const d = evaluarCierre({
        sesion: sesionDe(MAX_DURACION_MIN), libroExiste: true, librosCargados: true, ahoraMs: AHORA,
    });
    assert.equal(d.minutosPropuestos, MAX_DURACION_MIN);
    assert.equal(d.cabe, true);
});

test('pasado el tope hace falta otro número: el del cronómetro no es guardable', () => {
    const d = evaluarCierre({
        sesion: sesionDe(MAX_DURACION_MIN + 1), libroExiste: true, librosCargados: true, ahoraMs: AHORA,
    });
    assert.equal(d.minutosPropuestos, MINUTOS_PROPUESTOS);
    assert.equal(d.cabe, false);
});

test('una sesión normal se guarda tal cual', () => {
    const d = evaluarCierre({
        sesion: sesionDe(45), libroExiste: true, librosCargados: true, ahoraMs: AHORA,
    });
    assert.deepEqual(d, { estado: 'ok', minutos: 45 });
});

test('el caso de producción: sin libro manda, aunque además pase del tope', () => {
    const d = evaluarCierre({
        sesion: { bookId: 'borrado', startAt: AHORA - MS_PRODUCCION, startPage: 0 },
        libroExiste: false, librosCargados: true, ahoraMs: AHORA,
    });
    assert.equal(d.estado, 'sin-libro');
    assert.equal(d.minutos, 2577);
});

test('sin libro se avisa aunque la sesión sea cortita', () => {
    const d = evaluarCierre({
        sesion: sesionDe(30), libroExiste: false, librosCargados: true, ahoraMs: AHORA,
    });
    assert.equal(d.estado, 'sin-libro');
});

test('la propuesta nunca es el tiempo del cronómetro recortado al tope', () => {
    const d = evaluarCierre({
        sesion: sesionDe(2577), libroExiste: true, librosCargados: true, ahoraMs: AHORA,
    });
    assert.equal(d.minutos, 2577);
    assert.equal(d.minutosPropuestos, MINUTOS_PROPUESTOS);
    assert.notEqual(d.minutosPropuestos, MAX_DURACION_MIN, 'recortar a 1440 sería avalar 24 h que nadie ha dicho');
    assert.equal(minutosValidos(String(d.minutosPropuestos)), MINUTOS_PROPUESTOS);
});

// ---------------------------------------------------------------------------
// minutosValidos
// ---------------------------------------------------------------------------

test('se acepta un número de minutos con sentido', () => {
    assert.equal(minutosValidos('60'), 60);
    assert.equal(minutosValidos(' 45 '), 45);
    assert.equal(minutosValidos(90), 90);
    assert.equal(minutosValidos('1'), 1);
});

test('el tope de las reglas es el tope del diálogo', () => {
    assert.equal(minutosValidos(String(MAX_DURACION_MIN)), MAX_DURACION_MIN);
    assert.equal(minutosValidos(String(MAX_DURACION_MIN + 1)), null);
    assert.equal(minutosValidos('2577'), null);
});

test('lo que no es un número de minutos se vuelve a preguntar, no se adivina', () => {
    for (const malo of ['', '   ', '0', '-5', 'abc', '45 min', '45.7', '1e3', null, undefined, {}, []]) {
        assert.equal(minutosValidos(malo), null, `debería rechazar ${JSON.stringify(malo)}`);
    }
});

// ---------------------------------------------------------------------------
// clasificarFalloGuardado
// ---------------------------------------------------------------------------

test('cada fallo al guardar tiene su explicación', () => {
    assert.equal(clasificarFalloGuardado({ code: 'permission-denied' }), 'permisos');
    assert.equal(clasificarFalloGuardado({ code: 'unavailable' }), 'sin-red');
    assert.equal(clasificarFalloGuardado({ code: 'deadline-exceeded' }), 'sin-red');
    assert.equal(clasificarFalloGuardado({ code: 'not-found' }), 'otro');
    assert.equal(clasificarFalloGuardado(new Error('vaya')), 'otro');
    assert.equal(clasificarFalloGuardado(null), 'otro');
    assert.equal(clasificarFalloGuardado(undefined), 'otro');
});

// ---------------------------------------------------------------------------
// duracionEnTexto
// ---------------------------------------------------------------------------

test('la duración se lee de corrido dentro de una frase', () => {
    assert.equal(duracionEnTexto(0), '0 min');
    assert.equal(duracionEnTexto(59), '59 min');
    assert.equal(duracionEnTexto(60), '1 h');
    assert.equal(duracionEnTexto(90), '1 h 30 min');
    assert.equal(duracionEnTexto(2577), '42 h 57 min');
    assert.equal(duracionEnTexto('mal'), '0 min');
});

// ---------------------------------------------------------------------------
// Guarda: el tope de aquí y el de las reglas tienen que ser el mismo número.
// Si no, se guardan sesiones que el servidor rechaza (o se rechazan aquí
// sesiones que el servidor aceptaría), que es justo el fallo de producción.
// ---------------------------------------------------------------------------

test('el tope de duración coincide con el de firestore.rules', () => {
    const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    const m = reglas.match(/request\.resource\.data\.durationMin\s*<=\s*(\d+)/);
    assert.ok(m, 'no se encontró el tope de durationMin en firestore.rules');
    assert.equal(Number(m[1]), MAX_DURACION_MIN);
});
