// Pruebas del consentimiento de cookies (consentimiento.js).
// El script va inline en cada página, así que se prueba tal cual: se lee el
// fichero y se ejecuta en un contexto de vm con un navegador de mentira.
// Runner de Node (node:test), sin dependencias nuevas:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const RAIZ = new URL('../', import.meta.url);
const FUENTE = readFileSync(new URL('consentimiento.js', RAIZ), 'utf8');
const ID = 'G-PRUEBA123';
const DESACTIVAR = `ga-disable-${ID}`;
const AHORA = Date.UTC(2026, 8, 14, 10, 0, 0);
const DIA = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Dobles de prueba
// ---------------------------------------------------------------------------

// Tarro de cookies con lo justo de las reglas del navegador: una cookie de
// dominio (.rinconlectura.es) y otra solo del host son entradas distintas, y
// para borrar hay que acertar con el dominio.
const tarroDeCookies = (host) => {
    const tarro = new Map();
    const escribir = (texto) => {
        const [par, ...atributos] = texto.split(';');
        const i = par.indexOf('=');
        const nombre = par.slice(0, i).trim();
        const valor = par.slice(i + 1);
        let dominio = '';
        let caducada = false;
        for (const a of atributos) {
            const [k, v = ''] = a.trim().split('=');
            const clave = k.toLowerCase();
            if (clave === 'domain') dominio = v.replace(/^\./, '').toLowerCase();
            if (clave === 'max-age' && Number(v) <= 0) caducada = true;
            if (clave === 'expires' && Date.parse(v) < AHORA) caducada = true;
        }
        if (dominio && (!dominio.includes('.') || !(host === dominio || host.endsWith(`.${dominio}`)))) return;
        const id = `${nombre}|${dominio || '(host)'}`;
        if (caducada) tarro.delete(id);
        else tarro.set(id, { nombre, valor });
    };
    return {
        escribir,
        leer: () => [...tarro.values()].map((c) => `${c.nombre}=${c.valor}`).join('; '),
        nombres: () => [...tarro.values()].map((c) => c.nombre).sort(),
    };
};

const almacenLocal = (inicial) => {
    const datos = new Map(Object.entries(inicial));
    return {
        datos,
        getItem: (k) => (datos.has(k) ? datos.get(k) : null),
        setItem: (k, v) => { datos.set(k, String(v)); },
        removeItem: (k) => { datos.delete(k); },
    };
};

function navegador({ url = 'https://rinconlectura.es/', guardado = {}, cookies = [], almacenRoto = false, antes } = {}) {
    const direccion = new URL(url);
    const clases = new Set();
    const tarro = tarroDeCookies(direccion.hostname);
    cookies.forEach(tarro.escribir);
    const scripts = [];
    const oyentes = {};
    const escuchar = (tipo, fn) => { (oyentes[tipo] ||= []).push(fn); };

    const document = {
        documentElement: {
            classList: {
                add: (c) => clases.add(c),
                remove: (c) => clases.delete(c),
                contains: (c) => clases.has(c),
                toggle: (c, poner) => (poner ? clases.add(c) : clases.delete(c)),
            },
        },
        get cookie() { return tarro.leer(); },
        set cookie(texto) { tarro.escribir(texto); },
        createElement: (etiqueta) => ({ etiqueta }),
        head: { appendChild: (el) => { scripts.push(el); } },
        addEventListener: escuchar,
        getElementById: () => null,
    };
    const almacen = almacenLocal(guardado);
    const window = {
        location: direccion,
        history: { state: null, replaceState() {} },
        addEventListener: escuchar,
    };
    Object.defineProperty(window, 'localStorage', {
        get() {
            if (almacenRoto) throw new Error('SecurityError');
            return almacen;
        },
    });
    if (antes) antes(window);

    class Fecha extends Date {
        constructor(...args) { super(...(args.length ? args : [AHORA])); }
        static now() { return AHORA; }
    }
    const codigo = FUENTE.replace('__CONFIG_CONSENTIMIENTO__', JSON.stringify({ idMedicion: ID }));
    vm.runInContext(codigo, vm.createContext({ window, document, Date: Fecha }));

    return {
        window, clases, tarro, scripts, almacen,
        api: window.rinconConsentimiento,
        // Lo que hay en el dataLayer, pasado a este realm para poder comparar.
        cola: () => JSON.parse(JSON.stringify((window.dataLayer || []).map((a) => Array.from(a)))),
        otraPestana: (clave) => oyentes.storage.forEach((fn) => fn({ key: clave })),
    };
}

const decision = (analitica, fecha = AHORA, v = 1) =>
    ({ rincon_consentimiento: JSON.stringify({ v, analitica, fecha }) });

// Lo que deja en el navegador la versión anterior: cookies de GA puestas sin
// consentimiento, en el dominio padre y solo en el host.
const COOKIES_VIEJAS = [
    '_ga=GA1.1.111.222; path=/; domain=.rinconlectura.es',
    '_ga_C3LTR2R6B5=GS1.1.333; path=/; domain=.rinconlectura.es',
    '_ga=GA1.1.999.888; path=/',
    '_gid=GA1.1.555; path=/; domain=.rinconlectura.es',
    'otra=1; path=/',
];

const registrar = (api) => {
    const llamadas = [];
    api.alAceptar((cargar, aceptadoAhora) => llamadas.push({ cargar, aceptadoAhora }));
    return llamadas;
};

// ---------------------------------------------------------------------------
// Sin decisión
// ---------------------------------------------------------------------------

test('sin decisión: banner pendiente y nada de Analytics', () => {
    const n = navegador();
    assert.equal(n.api.estado(), null);
    assert.ok(n.clases.has('consentimiento-pendiente'));
    const llamadas = registrar(n.api);
    assert.equal(llamadas.length, 0, 'el snippet de la página no arranca');
    assert.equal(n.window.gtag, undefined);
    assert.equal(n.window.dataLayer, undefined);
    assert.equal(n.scripts.length, 0);
});

test('sin decisión se borran las cookies de Analytics viejas, también las del dominio padre', () => {
    const n = navegador({ cookies: COOKIES_VIEJAS });
    assert.deepEqual(n.tarro.nombres(), ['otra']);
});

test('con un no, lo mismo que sin decisión, pero sin banner', () => {
    const n = navegador({ guardado: decision(false), cookies: COOKIES_VIEJAS });
    assert.equal(n.api.estado(), 'no');
    assert.equal(n.clases.has('consentimiento-pendiente'), false);
    assert.equal(registrar(n.api).length, 0);
    assert.equal(n.window.gtag, undefined);
    assert.deepEqual(n.tarro.nombres(), ['otra']);
});

test('también se borran en un subdominio de web.app', () => {
    const n = navegador({
        url: 'https://mi-rincon-de-lectura.web.app/',
        cookies: ['_ga=1; domain=.mi-rincon-de-lectura.web.app', '_ga_X=2'],
    });
    assert.deepEqual(n.tarro.nombres(), []);
});

// ---------------------------------------------------------------------------
// Con un sí
// ---------------------------------------------------------------------------

test('con un sí vigente: gtag preparado, cookies intactas y la página decide cuándo pedir gtag.js', () => {
    const n = navegador({ guardado: decision(true), cookies: COOKIES_VIEJAS });
    assert.equal(n.api.estado(), 'si');
    assert.equal(n.clases.has('consentimiento-pendiente'), false);
    assert.equal(n.tarro.nombres().length, 5, 'con consentimiento no se toca nada');

    const llamadas = registrar(n.api);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].aceptadoAhora, false);
    assert.deepEqual(n.cola(), [
        ['js', new Date(AHORA).toISOString()],
        ['config', ID, { allow_google_signals: false, allow_ad_personalization_signals: false }],
    ]);
    assert.equal(n.scripts.length, 0, 'gtag.js espera a que la página lo pida');

    llamadas[0].cargar();
    llamadas[0].cargar();
    assert.equal(n.scripts.length, 1, 'se pide una sola vez');
    assert.equal(n.scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${ID}`);
    assert.equal(n.scripts[0].async, true);
});

test('aceptar en la página: se guarda, se quita el banner y el snippet arranca al momento', () => {
    const n = navegador({ guardado: { cookie_consent: 'true' } });
    const llamadas = registrar(n.api);
    n.api.aceptar();

    assert.deepEqual(JSON.parse(n.almacen.getItem('rincon_consentimiento')), { v: 1, analitica: true, fecha: AHORA });
    assert.equal(n.almacen.getItem('cookie_consent'), null);
    assert.equal(n.clases.has('consentimiento-pendiente'), false);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].aceptadoAhora, true);
    assert.equal(n.cola()[1][0], 'config');

    n.api.aceptar();
    assert.equal(llamadas.length, 1, 'aceptar otra vez no repite el arranque');
});

test('rechazar: se guarda el no, no arranca nada y se borran las cookies', () => {
    const n = navegador();
    const llamadas = registrar(n.api);
    n.tarro.escribir('_ga=GA1.1.1.1; domain=.rinconlectura.es');
    n.api.rechazar();

    assert.deepEqual(JSON.parse(n.almacen.getItem('rincon_consentimiento')), { v: 1, analitica: false, fecha: AHORA });
    assert.equal(n.api.estado(), 'no');
    assert.equal(n.clases.has('consentimiento-pendiente'), false);
    assert.equal(llamadas.length, 0);
    assert.equal(n.window.gtag, undefined);
    assert.deepEqual(n.tarro.nombres(), []);
});

// ---------------------------------------------------------------------------
// Validez de lo guardado
// ---------------------------------------------------------------------------

test('la decisión vale 24 meses, sea sí o no', () => {
    assert.equal(navegador({ guardado: decision(true, AHORA - 729 * DIA) }).api.estado(), 'si');
    assert.equal(navegador({ guardado: decision(false, AHORA - 729 * DIA) }).api.estado(), 'no');
    const caducada = navegador({ guardado: decision(true, AHORA - 731 * DIA), cookies: COOKIES_VIEJAS });
    assert.equal(caducada.api.estado(), null);
    assert.ok(caducada.clases.has('consentimiento-pendiente'));
    assert.deepEqual(caducada.tarro.nombres(), ['otra'], 'caducada: cuenta como sin decisión');
});

test('una fecha futura, otra versión o basura no cuentan como decisión', () => {
    const invalidos = [
        decision(true, AHORA + 2 * DIA),
        decision(true, AHORA, 2),
        { rincon_consentimiento: '{roto' },
        { rincon_consentimiento: JSON.stringify({ v: 1, analitica: 'true', fecha: AHORA }) },
        { rincon_consentimiento: JSON.stringify({ v: 1, analitica: true, fecha: String(AHORA) }) },
        { rincon_consentimiento: 'null' },
    ];
    for (const guardado of invalidos) {
        assert.equal(navegador({ guardado }).api.estado(), null, JSON.stringify(guardado));
    }
});

test('el cookie_consent del banner anterior no vale y se borra al cargar', () => {
    const n = navegador({ guardado: { cookie_consent: 'true' }, cookies: COOKIES_VIEJAS });
    assert.equal(n.api.estado(), null);
    assert.equal(n.almacen.getItem('cookie_consent'), null);
    assert.deepEqual(n.tarro.nombres(), ['otra']);
});

test('sin localStorage: se pregunta en cada página y la elección vale para esa página', () => {
    const n = navegador({ almacenRoto: true });
    assert.equal(n.api.estado(), null);
    const llamadas = registrar(n.api);
    assert.doesNotThrow(() => n.api.aceptar());
    assert.equal(n.api.estado(), 'si');
    assert.equal(llamadas.length, 1);
});

// ---------------------------------------------------------------------------
// Cambiar de opinión
// ---------------------------------------------------------------------------

test('revocar con gtag.js ya cargado lo corta y borra las cookies', () => {
    const n = navegador({ guardado: decision(true) });
    registrar(n.api)[0].cargar();
    n.tarro.escribir('_ga=GA1.1.1.1; domain=.rinconlectura.es');
    n.tarro.escribir('_ga_C3LTR2R6B5=GS1.1.1; domain=.rinconlectura.es');

    n.api.rechazar();
    assert.equal(n.window[DESACTIVAR], true);
    assert.deepEqual(n.cola().at(-1), ['consent', 'update', { analytics_storage: 'denied' }]);
    assert.deepEqual(n.tarro.nombres(), []);
    assert.equal(n.api.estado(), 'no');
});

test('revocar antes de pedir gtag.js impide pedirlo; volver a aceptar lo pide y reactiva', () => {
    const n = navegador({ guardado: decision(true) });
    const [{ cargar }] = registrar(n.api);
    n.api.rechazar();
    cargar();
    assert.equal(n.scripts.length, 0, 'tras revocar ya no se pide');

    n.api.aceptar();
    assert.equal(n.scripts.length, 1);
    assert.equal(n.window[DESACTIVAR], false);
    assert.deepEqual(n.cola().at(-1), ['consent', 'update', { analytics_storage: 'granted' }]);
});

test('aceptar no quita el ga-disable que pone el dev server', () => {
    const n = navegador({ antes: (w) => { w[DESACTIVAR] = true; } });
    registrar(n.api);
    n.api.aceptar();
    assert.equal(n.window[DESACTIVAR], true);
    n.api.rechazar();
    n.api.aceptar();
    assert.equal(n.window[DESACTIVAR], true);
});

test('si otra pestaña revoca, esta deja de medir', () => {
    const n = navegador({ guardado: decision(true) });
    registrar(n.api)[0].cargar();
    n.tarro.escribir('_ga=GA1.1.1.1; domain=.rinconlectura.es');
    n.almacen.setItem('rincon_consentimiento', decision(false).rincon_consentimiento);
    n.otraPestana('rincon_consentimiento');
    assert.equal(n.window[DESACTIVAR], true);
    assert.deepEqual(n.tarro.nombres(), []);
});

test('si otra pestaña acepta, esta arranca; otras claves no la afectan', () => {
    const n = navegador();
    const llamadas = registrar(n.api);
    n.almacen.setItem('theme', 'dark');
    n.otraPestana('theme');
    assert.equal(llamadas.length, 0);

    n.almacen.setItem('rincon_consentimiento', decision(true).rincon_consentimiento);
    n.otraPestana('rincon_consentimiento');
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].aceptadoAhora, true);
    assert.equal(n.clases.has('consentimiento-pendiente'), false);
});

test('un snippet de página que lanza no rompe el consentimiento', () => {
    const n = navegador({ guardado: decision(true) });
    assert.doesNotThrow(() => n.api.alAceptar(() => { throw new Error('roto'); }));
    const otro = navegador();
    otro.api.alAceptar(() => { throw new Error('roto'); });
    assert.doesNotThrow(() => otro.api.aceptar());
    assert.equal(otro.api.estado(), 'si');
});

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

const PAGINAS = readdirSync(RAIZ).filter((f) => f.endsWith('.html'));
const leerPagina = (f) => readFileSync(new URL(f, RAIZ), 'utf8');

test('todas las páginas salvo el 404 llevan la marca del consentimiento, después de <meta charset>', () => {
    for (const f of PAGINAS.filter((p) => p !== '404.html')) {
        const html = leerPagina(f);
        const marca = html.indexOf('<!--consentimiento-->');
        assert.ok(marca > -1, `${f}: falta <!--consentimiento-->`);
        assert.ok(marca > html.search(/<meta charset/i), `${f}: la marca va después de <meta charset>`);
    }
});

test('ninguna página carga Analytics por su cuenta ni el banner antiguo', () => {
    for (const f of PAGINAS) {
        const html = leerPagina(f);
        assert.doesNotMatch(html, /googletagmanager\.com\/gtag|dataLayer|gtag\(\s*['"]config/, f);
        assert.doesNotMatch(html, /cookies\.js|cookie-banner/, f);
    }
});
