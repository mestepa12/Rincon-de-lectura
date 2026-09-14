// Pruebas de la analítica (analitica-nucleo.js).
// Runner de Node (node:test), sin dependencias nuevas:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    EVENTOS, PAGINAS_ORIGEN, ORIGEN_OTRA, ORIGEN_DIRECTO, CLAVE_PENDIENTES,
    limpiarParametros, normalizarRuta, origenDesdeReferrer, analiticaPermitida,
    crearEmisor,
} from '../analitica-nucleo.js';

// ---------------------------------------------------------------------------
// Dobles de prueba
// ---------------------------------------------------------------------------

const almacenEnMemoria = () => {
    const datos = new Map();
    return {
        datos,
        getItem: (k) => (datos.has(k) ? datos.get(k) : null),
        setItem: (k, v) => { datos.set(k, String(v)); },
        removeItem: (k) => { datos.delete(k); },
    };
};

const almacenRoto = () => ({
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => { throw new Error('SecurityError'); },
});

// gtag falso que apunta cada llamada. `responde` decide si llama al
// event_callback (como hace gtag.js cuando el envío sale).
const gtagFalso = ({ responde = true } = {}) => {
    const llamadas = [];
    const gtag = (...args) => {
        llamadas.push(args);
        if (responde) args[2]?.event_callback?.();
    };
    return { gtag, llamadas };
};

const emisor = (extra = {}) => {
    const { gtag, llamadas } = gtagFalso(extra.gtagOpciones);
    const almacen = extra.almacen || almacenEnMemoria();
    const avisos = [];
    const temporizadores = [];
    const e = crearEmisor({
        activa: true,
        produccion: true,
        obtenerGtag: () => gtag,
        gtagCargado: () => true,
        almacen,
        paginaActual: () => 'https://rinconlectura.es/tropos-literarios',
        consentido: () => true,
        avisarDev: (...a) => avisos.push(a),
        programar: (fn, ms) => temporizadores.push({ fn, ms }),
        ...extra,
    });
    return { ...e, llamadas, almacen, avisos, temporizadores };
};

// Valores que no pueden salir nunca en un parámetro.
const PERSONALES = [
    'ana@prueba.test',
    'La sombra del viento',
    'Xk3pQ9vLmN2aB7cD8eF1gH4iJ5kL', // forma de UID de Firebase (28)
    'AnaPrueba',
    '/biblioteca?chat=Xk3pQ9vLmN2aB7cD8eF1gH4iJ5kL',
    { toString: () => 'objeto' },
    ['cozy'],
];

// ---------------------------------------------------------------------------
// Catálogo y parámetros
// ---------------------------------------------------------------------------

test('los nombres de eventos y parámetros cumplen las reglas de GA4', () => {
    const reservados = /^(_|firebase_|ga_|google_|gtag\.)/;
    for (const [evento, params] of Object.entries(EVENTOS)) {
        assert.match(evento, /^[a-z][a-z0-9_]{0,39}$/, evento);
        for (const p of Object.keys(params)) {
            assert.match(p, /^[a-z][a-z0-9_]{0,39}$/, `${evento}.${p}`);
            assert.doesNotMatch(p, reservados, `${evento}.${p}`);
        }
    }
});

test('un evento fuera del catálogo no se envía', () => {
    assert.equal(limpiarParametros('purchase', {}), null);
    assert.equal(limpiarParametros('__proto__', {}), null);
    assert.equal(limpiarParametros('toString', {}), null);
});

test('solo pasan los parámetros declarados y válidos', () => {
    assert.deepEqual(
        limpiarParametros('sign_up', { method: 'email', origin_page: '/vs-goodreads', email: 'ana@prueba.test', uid: 'x' }),
        { method: 'email', origin_page: '/vs-goodreads' },
    );
    assert.deepEqual(limpiarParametros('sign_up', { method: 'facebook' }), {});
    assert.deepEqual(limpiarParametros('reading_session_start', { title: 'Dune' }), {});
    assert.deepEqual(limpiarParametros('quiz_complete', { quiz_result: 'grismoral' }), { quiz_result: 'grismoral' });
});

test('ningún dato personal pasa ningún validador', () => {
    for (const [evento, params] of Object.entries(EVENTOS)) {
        for (const p of Object.keys(params)) {
            for (const valor of PERSONALES) {
                assert.deepEqual(limpiarParametros(evento, { [p]: valor }), {}, `${evento}.${p} = ${String(valor)}`);
            }
        }
    }
});

test('book_count solo admite enteros no negativos', () => {
    assert.deepEqual(limpiarParametros('goodreads_import_complete', { book_count: 312 }), { book_count: 312 });
    assert.deepEqual(limpiarParametros('goodreads_import_complete', { book_count: 0 }), { book_count: 0 });
    for (const malo of [-1, 2.5, '312', NaN, Infinity, null]) {
        assert.deepEqual(limpiarParametros('goodreads_import_complete', { book_count: malo }), {}, String(malo));
    }
});

// ---------------------------------------------------------------------------
// Rutas de origen
// ---------------------------------------------------------------------------

test('la ruta del dev server y la de Hosting dan el mismo origen', () => {
    assert.equal(normalizarRuta('/tropos-literarios.html'), '/tropos-literarios');
    assert.equal(normalizarRuta('/tropos-literarios'), '/tropos-literarios');
    assert.equal(normalizarRuta('/tropos-literarios/'), '/tropos-literarios');
    assert.equal(normalizarRuta('/index.html'), '/');
    assert.equal(normalizarRuta('/'), '/');
    assert.equal(normalizarRuta('/quiz.html'), '/quiz');
});

test('todas las páginas con CTA de registro son orígenes válidos', () => {
    for (const p of ['/', '/tropos-literarios', '/app-registro-lecturas', '/importar-goodreads',
        '/cuantas-paginas-leer-al-dia', '/estadisticas-de-lectura', '/vs-goodreads']) {
        assert.ok(PAGINAS_ORIGEN.includes(p), p);
    }
});

test('una ruta fuera de la lista se queda en "(otra)"', () => {
    assert.equal(normalizarRuta('/biblioteca'), ORIGEN_OTRA);
    assert.equal(normalizarRuta('/register.html'), ORIGEN_OTRA);
    assert.equal(normalizarRuta(''), ORIGEN_OTRA);
    assert.equal(normalizarRuta(undefined), ORIGEN_OTRA);
});

test('el referrer solo cuenta si es del mismo sitio, y sin query', () => {
    const propio = 'https://rinconlectura.es';
    assert.equal(origenDesdeReferrer('https://rinconlectura.es/vs-goodreads?utm_source=x', propio), '/vs-goodreads');
    assert.equal(origenDesdeReferrer('https://rinconlectura.es/login', propio), ORIGEN_OTRA);
    assert.equal(origenDesdeReferrer('https://www.google.com/', propio), null);
    assert.equal(origenDesdeReferrer('', propio), null);
});

// ---------------------------------------------------------------------------
// Candado de entorno
// ---------------------------------------------------------------------------

test('solo se envía con build de producción, sin emuladores y fuera de localhost', () => {
    for (const dev of [true, false]) {
        for (const emuladores of [true, false]) {
            for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'rinconlectura.es', 'rincon-lectura-dev-1d818.web.app']) {
                const esperado = !dev && !emuladores && !['localhost', '127.0.0.1', '[::1]'].includes(hostname);
                assert.equal(analiticaPermitida({ dev, emuladores, hostname }), esperado, `${dev} ${emuladores} ${hostname}`);
            }
        }
    }
});

// ---------------------------------------------------------------------------
// Emisor
// ---------------------------------------------------------------------------

test('inactivo (desarrollo o emuladores): no llama a gtag y avisa', async () => {
    const e = emisor({ activa: false });
    await e.enviar('quiz_complete', { quiz_result: 'cozy' });
    await e.enviar('sign_up', { method: 'email' }, { antesDeNavegar: true });
    assert.equal(e.llamadas.length, 0);
    assert.equal(e.almacen.datos.size, 0, 'tampoco deja nada pendiente');
    assert.equal(e.avisos.length, 2);
});

test('envía el evento con sus parámetros y la página sin query', async () => {
    const e = emisor();
    await e.enviar('goodreads_import_complete', { book_count: 40, titulo: 'Dune' });
    assert.deepEqual(e.llamadas, [['event', 'goodreads_import_complete',
        { book_count: 40, page_location: 'https://rinconlectura.es/tropos-literarios' }]]);
});

test('debug_mode solo fuera de producción (y nunca con valor false)', async () => {
    const prod = emisor({ produccion: true });
    await prod.enviar('reading_session_start');
    assert.equal('debug_mode' in prod.llamadas[0][2], false);

    const dev = emisor({ produccion: false });
    await dev.enviar('reading_session_start');
    assert.equal(dev.llamadas[0][2].debug_mode, true);
});

test('sin gtag (bloqueador) no lanza y la promesa se resuelve', async () => {
    const e = emisor({ obtenerGtag: () => undefined });
    await e.enviar('add_first_book');
    await e.enviar('sign_up', { method: 'google' }, { antesDeNavegar: true });
    assert.equal(e.llamadas.length, 0);
});

test('un gtag que lanza no rompe nada', async () => {
    const e = emisor({ obtenerGtag: () => () => { throw new Error('gtag roto'); } });
    await assert.doesNotReject(e.enviar('add_first_book'));
    await assert.doesNotReject(e.enviar('sign_up', { method: 'email' }, { antesDeNavegar: true }));
});

test('antes de navegar: espera al event_callback de gtag', async () => {
    const e = emisor();
    await e.enviar('sign_up', { method: 'email', origin_page: '/' }, { antesDeNavegar: true });
    const datos = e.llamadas[0][2];
    assert.equal(typeof datos.event_callback, 'function');
    assert.equal(datos.event_timeout, 1000);
    assert.equal(e.temporizadores[0].ms, 1000, 'hay tope propio por si gtag no responde');
});

test('antes de navegar: si gtag no responde, el tope resuelve la espera', async () => {
    const e = emisor({ gtagOpciones: { responde: false } });
    let resuelta = false;
    const p = e.enviar('sign_up', { method: 'email' }, { antesDeNavegar: true }).then(() => { resuelta = true; });
    await Promise.resolve();
    assert.equal(resuelta, false, 'sigue esperando');
    e.temporizadores[0].fn();
    await p;
    assert.equal(resuelta, true);
});

test('antes de navegar sin gtag.js cargado: se guarda y lo envía la página siguiente, una vez', async () => {
    const almacen = almacenEnMemoria();
    const origen = emisor({ almacen, gtagCargado: () => false });
    await origen.enviar('sign_up_cta_click', { origin_page: '/vs-goodreads' }, { antesDeNavegar: true });
    assert.equal(origen.llamadas.length, 0, 'no toca el dataLayer de una página que va a morir');
    assert.ok(almacen.getItem(CLAVE_PENDIENTES));

    const siguiente = emisor({ almacen, paginaActual: () => 'https://rinconlectura.es/register' });
    siguiente.enviarPendientes();
    siguiente.enviarPendientes();
    assert.deepEqual(siguiente.llamadas, [['event', 'sign_up_cta_click',
        { origin_page: '/vs-goodreads', page_location: 'https://rinconlectura.es/tropos-literarios' }]]);
    assert.equal(almacen.getItem(CLAVE_PENDIENTES), null);
});

test('los pendientes se revisan otra vez al enviarlos', () => {
    const almacen = almacenEnMemoria();
    almacen.setItem(CLAVE_PENDIENTES, JSON.stringify([
        { nombre: 'sign_up', params: { method: 'email', email: 'ana@prueba.test' }, pagina: 'https://rinconlectura.es/register?chat=abc#x' },
        { nombre: 'purchase', params: {}, pagina: 'https://rinconlectura.es/' },
        { nombre: 'add_first_book', params: {}, pagina: 'no es una url' },
        null,
    ]));
    const e = emisor({ almacen });
    e.enviarPendientes();
    assert.deepEqual(e.llamadas, [['event', 'sign_up',
        { method: 'email', page_location: 'https://rinconlectura.es/register' }]]);
});

test('pendientes corruptos o sin sessionStorage: ni lanza ni envía', async () => {
    const almacen = almacenEnMemoria();
    almacen.setItem(CLAVE_PENDIENTES, '{no es json');
    const e = emisor({ almacen });
    assert.doesNotThrow(() => e.enviarPendientes());
    assert.equal(e.llamadas.length, 0);

    const roto = emisor({ almacen: almacenRoto(), gtagCargado: () => false });
    await assert.doesNotReject(roto.enviar('sign_up', { method: 'email' }, { antesDeNavegar: true }));
    assert.doesNotThrow(() => roto.enviarPendientes());
});

test('la cola de pendientes no crece sin límite', async () => {
    const almacen = almacenEnMemoria();
    const e = emisor({ almacen, gtagCargado: () => false });
    for (let i = 0; i < 25; i++) await e.enviar('sign_up_cta_click', { origin_page: '/' }, { antesDeNavegar: true });
    assert.equal(JSON.parse(almacen.getItem(CLAVE_PENDIENTES)).length, 10);
});

test('sin "antes de navegar" nunca se guarda nada, aunque gtag.js no haya cargado', async () => {
    const e = emisor({ gtagCargado: () => false });
    await e.enviar('reading_session_start');
    assert.equal(e.llamadas.length, 1, 'va al dataLayer: gtag.js lo enviará al cargar en esta página');
    assert.equal(e.almacen.datos.size, 0);
});

test('origen por defecto de un alta sin página previa', () => {
    assert.deepEqual(limpiarParametros('sign_up', { method: 'email', origin_page: ORIGEN_DIRECTO }),
        { method: 'email', origin_page: ORIGEN_DIRECTO });
});

// ---------------------------------------------------------------------------
// Consentimiento
// ---------------------------------------------------------------------------

test('sin consentimiento no se envía nada, ni se guarda para la página siguiente', async () => {
    const e = emisor({ consentido: () => false, gtagCargado: () => false });
    await e.enviar('quiz_complete', { quiz_result: 'cozy' });
    await e.enviar('sign_up', { method: 'email' }, { antesDeNavegar: true });
    assert.equal(e.llamadas.length, 0);
    assert.equal(e.almacen.datos.size, 0);
    assert.equal(e.avisos.length, 2);
});

test('si no se dice nada del consentimiento, cuenta como un no', async () => {
    const { gtag, llamadas } = gtagFalso();
    const e = crearEmisor({
        activa: true, produccion: true, obtenerGtag: () => gtag, gtagCargado: () => true,
        almacen: almacenEnMemoria(), paginaActual: () => 'https://rinconlectura.es/',
    });
    await e.enviar('add_first_book');
    e.enviarPendientes();
    assert.equal(llamadas.length, 0);
});

test('el consentimiento se mira en cada envío: aceptar sin recargar mide desde ese momento', async () => {
    let si = false;
    const e = emisor({ consentido: () => si });
    await e.enviar('quiz_gate_view');
    si = true;
    await e.enviar('quiz_complete', { quiz_result: 'cozy' });
    assert.deepEqual(e.llamadas.map((l) => l[1]), ['quiz_complete'], 'lo de antes del sí no se recupera');
});

test('pendientes guardados con consentimiento y revocado después: se tiran sin enviar', async () => {
    const almacen = almacenEnMemoria();
    const origen = emisor({ almacen, gtagCargado: () => false });
    await origen.enviar('sign_up', { method: 'email' }, { antesDeNavegar: true });
    assert.ok(almacen.getItem(CLAVE_PENDIENTES));

    const siguiente = emisor({ almacen, consentido: () => false });
    siguiente.enviarPendientes();
    assert.equal(siguiente.llamadas.length, 0);
    assert.equal(almacen.getItem(CLAVE_PENDIENTES), null);
});

// ---------------------------------------------------------------------------
// Tráfico interno
// ---------------------------------------------------------------------------

test('tráfico interno: los eventos llevan traffic_type=internal, también los pendientes', async () => {
    const e = emisor({ interno: () => true });
    await e.enviar('reading_session_start');
    assert.equal(e.llamadas[0][2].traffic_type, 'internal');

    const almacen = almacenEnMemoria();
    const origen = emisor({ almacen, gtagCargado: () => false, interno: () => true });
    await origen.enviar('sign_up', { method: 'email' }, { antesDeNavegar: true });
    const siguiente = emisor({ almacen, interno: () => true });
    siguiente.enviarPendientes();
    assert.equal(siguiente.llamadas[0][2].traffic_type, 'internal');
});

test('sin marca, traffic_type no aparece', async () => {
    const e = emisor();
    await e.enviar('reading_session_start');
    assert.equal('traffic_type' in e.llamadas[0][2], false);
});

test('marcado pero sin consentimiento: no sale nada', async () => {
    const e = emisor({ interno: () => true, consentido: () => false });
    await e.enviar('add_first_book');
    await e.enviar('sign_up', { method: 'google' }, { antesDeNavegar: true });
    assert.equal(e.llamadas.length, 0);
    assert.equal(e.almacen.datos.size, 0);
});
