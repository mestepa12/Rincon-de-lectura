// Consentimiento de cookies: Google Analytics solo con un "sí".
//
// No es un módulo. El plugin "consentimiento" de vite.config.js lo mete
// inline en el <head> de cada página, en la marca <!--consentimiento-->,
// antes del snippet de gtag. Tiene que ser así:
//   - La decisión se toma en síncrono, antes de que nada pueda pedir gtag.js.
//   - Inline viaja con el HTML, que Hosting sirve con no-cache y el service
//     worker con red primero. Un .js suelto en public/ (el cookies.js de
//     antes) lo servían viejo la caché HTTP y el propio service worker.
//   - Cero peticiones nuevas: un script más en las páginas SEO costó un punto
//     de Lighthouse (ver ctaRegistroDiferido en vite.config.js).
// tests/consentimiento.test.mjs lo ejecuta tal cual en un contexto de vm.
//
// Reglas (guía de cookies de la AEPD, 2023):
//   - Sin un "sí" vigente no se crea gtag, no se pide gtag.js y no se envía
//     nada. Ignorar el banner es lo mismo que rechazar.
//   - Sin "sí" se borran las cookies de Analytics que haya: las anteriores a
//     este banner se pusieron sin un consentimiento válido.
//   - Rechazar cuesta lo mismo que aceptar: dos botones iguales, un clic.
//   - La decisión vale 24 meses, sea sí o no.
//
// Aquí vive también la marca de tráfico interno, porque tiene que estar
// decidida antes del config de gtag. ?trafico_interno=si en cualquier URL
// marca este navegador y todo lo que envíe lleva traffic_type=internal, que
// el filtro de datos de GA4 excluye; ?trafico_interno=no, o pulsar la
// pastilla que se ve mientras está puesta, la quita. Los hosts que no son de
// producción van marcados siempre. La marca no abre ningún envío: sin
// consentimiento no sale nada, marcado o no.
(function (w, d, cfg) {
    'use strict';

    var CLAVE = 'rincon_consentimiento';
    // El banner anterior guardaba esto al pulsar "Aceptar" bajo un texto que
    // no nombraba Analytics y decía "al continuar, aceptas". No vale como
    // consentimiento: se tira y se vuelve a preguntar.
    var CLAVE_ANTIGUA = 'cookie_consent';
    var CLAVE_INTERNO = 'rincon_trafico_interno';
    var PARAMETRO_INTERNO = 'trafico_interno';
    var VERSION = 1;               // subirla vuelve a preguntar a todo el mundo
    var DIA = 24 * 60 * 60 * 1000;
    var VIGENCIA = 730 * DIA;      // 24 meses, el máximo que recomienda la AEPD
    var DESACTIVAR = 'ga-disable-' + cfg.idMedicion;
    var COOKIES_ANALITICA = /^(_ga|_ga_\w+|_gid|_gat\w*)$/;

    var raiz = d.documentElement;
    var enMemoria = null;          // la elección, si localStorage no deja guardarla
    var registrados = [];          // alAceptar() esperando a un sí
    var gtagPreparado = false;
    var gtagPedido = false;
    var desactivadoAqui = false;   // ga-disable puesto al revocar (no el del dev server)
    var denegadoAqui = false;      // analytics_storage denied puesto al revocar
    var abridor = null;

    function leer(clave) {
        try { return w.localStorage.getItem(clave); } catch (e) { return null; }
    }
    function guardar(clave, valor) {
        try { w.localStorage.setItem(clave, valor); return true; } catch (e) { return false; }
    }
    function quitar(clave) {
        try { w.localStorage.removeItem(clave); } catch (e) { /* sin almacén */ }
    }

    /** 'si', 'no' o null (sin decisión vigente). */
    function estado() {
        if (enMemoria) return enMemoria;
        var bruto = leer(CLAVE);
        if (!bruto) return null;
        try {
            var dato = JSON.parse(bruto);
            var ahora = Date.now();
            if (dato && dato.v === VERSION && typeof dato.analitica === 'boolean' &&
                typeof dato.fecha === 'number' && dato.fecha <= ahora + DIA &&
                ahora - dato.fecha < VIGENCIA) {
                return dato.analitica ? 'si' : 'no';
            }
        } catch (e) { /* corrupto: como si no hubiera decisión */ }
        return null;
    }

    /** Marca puesta a mano en este navegador (la de los hosts de dev no cuenta). */
    function marcado() {
        return leer(CLAVE_INTERNO) === '1';
    }

    /** ¿Lo que se envíe desde aquí es tráfico interno? */
    function interno() {
        return marcado() || cfg.hostsProduccion.indexOf(w.location.hostname) === -1;
    }

    // Solo los valores exactos. El parámetro se quita de la barra en el acto,
    // también con valores que no valen: un enlace copiado de aquí no marca a
    // quien lo abra.
    function leerParametroInterno() {
        try {
            var url = new URL(w.location.href);
            var valor = url.searchParams.get(PARAMETRO_INTERNO);
            if (valor === null) return;
            if (valor === 'si' || valor === 'sí') guardar(CLAVE_INTERNO, '1');
            else if (valor === 'no') quitar(CLAVE_INTERNO);
            url.searchParams.delete(PARAMETRO_INTERNO);
            w.history.replaceState(w.history.state, '', url.pathname + url.search + url.hash);
        } catch (e) { /* sin URL o sin history: la página sigue igual */ }
    }

    function borrarCookiesAnalitica() {
        var nombres = [];
        String(d.cookie || '').split(';').forEach(function (par) {
            var nombre = par.split('=')[0].trim();
            if (COOKIES_ANALITICA.test(nombre)) nombres.push(nombre);
        });
        if (!nombres.length) return;
        // gtag las pone en el dominio más alto que admite el navegador
        // (.rinconlectura.es), pero pudo quedar alguna solo del host: se borra
        // en cada nivel. Los que no aplican (.es) el navegador los ignora.
        var partes = w.location.hostname.split('.');
        var dominios = [''];
        for (var i = 0; i < partes.length - 1; i++) {
            dominios.push('; domain=.' + partes.slice(i).join('.'));
        }
        nombres.forEach(function (nombre) {
            dominios.forEach(function (dominio) {
                d.cookie = nombre + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=/' + dominio;
            });
        });
    }

    function prepararGtag() {
        if (gtagPreparado) return;
        gtagPreparado = true;
        w.dataLayer = w.dataLayer || [];
        // Empuja el objeto arguments, no un array: gtag.js solo reconoce eso.
        w.gtag = function () { w.dataLayer.push(arguments); };
        w.gtag('js', new Date());
        // Sin uso publicitario aunque alguien active Google Signals en la
        // propiedad: la política de privacidad lo promete.
        var ajustes = { allow_google_signals: false, allow_ad_personalization_signals: false };
        // En el config, traffic_type lo lleva todo lo que gtag.js envíe desde
        // esta página (page_view, session_start, scroll...), no solo los
        // eventos propios: las pruebas inflan sobre todo visitas y usuarios.
        if (interno()) ajustes.traffic_type = 'internal';
        w.gtag('config', cfg.idMedicion, ajustes);
    }

    function cargarGtag() {
        if (gtagPedido || estado() !== 'si') return;
        gtagPedido = true;
        var s = d.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + cfg.idMedicion;
        d.head.appendChild(s);
    }

    function ejecutar(fn, aceptadoAhora) {
        try { fn(cargarGtag, aceptadoAhora); } catch (e) { /* un snippet roto no tumba el resto */ }
    }

    /**
     * Para el snippet de gtag de cada página. fn(cargarGtag, aceptadoAhora)
     * se llama una sola vez: al momento si ya hay un sí, o cuando se acepte
     * en esta página. Sin sí no se llama nunca. Cada página decide con
     * cargarGtag cuándo se pide gtag.js; sin sí, cargarGtag no hace nada.
     */
    function alAceptar(fn) {
        if (estado() === 'si') {
            prepararGtag();
            ejecutar(fn, false);
        } else {
            registrados.push(fn);
        }
    }

    function activar() {
        if (desactivadoAqui) {
            w[DESACTIVAR] = false;
            desactivadoAqui = false;
        }
        if (denegadoAqui) {
            w.gtag('consent', 'update', { analytics_storage: 'granted' });
            denegadoAqui = false;
        }
        if (registrados.length) {
            prepararGtag();
            registrados.splice(0).forEach(function (fn) { ejecutar(fn, true); });
        } else if (gtagPreparado && !gtagPedido) {
            // Se revocó antes de que tocara pedir gtag.js y se ha vuelto a aceptar.
            cargarGtag();
        }
    }

    function desactivar() {
        // Con gtag.js ya en la página: ga-disable (el interruptor oficial)
        // corta todo envío y analytics_storage denied impide que reescriba
        // las cookies. Si aún no ha llegado, ya no llegará: cargarGtag mira
        // el estado.
        if (w[DESACTIVAR] !== true) {
            w[DESACTIVAR] = true;
            desactivadoAqui = true;
        }
        if (gtagPreparado && !denegadoAqui) {
            w.gtag('consent', 'update', { analytics_storage: 'denied' });
            denegadoAqui = true;
        }
        borrarCookiesAnalitica();
    }

    function textoMarca() {
        if (estado() !== 'si') return 'Tráfico interno · sin consentimiento, no se envía';
        if (w[DESACTIVAR] === true) return 'Tráfico interno · Analytics apagado, no se envía';
        return 'Tráfico interno · se envía marcado';
    }

    // Pastilla fija mientras el navegador esté marcado, para no creer que se
    // mide cuando no (ni al revés). Pulsarla quita la marca.
    function pintarMarca() {
        var pastilla = d.getElementById('marca-interna');
        if (!marcado()) {
            if (pastilla) pastilla.parentNode.removeChild(pastilla);
            return;
        }
        if (!d.body) {
            d.addEventListener('DOMContentLoaded', pintarMarca);
            return;
        }
        if (!pastilla) {
            pastilla = d.createElement('button');
            pastilla.type = 'button';
            pastilla.id = 'marca-interna';
            pastilla.className = 'marca-interna';
            pastilla.title = 'Este navegador está marcado como tráfico interno. Pulsa para quitar la marca.';
            pastilla.addEventListener('click', function () {
                if (!w.confirm('¿Quitar la marca de tráfico interno de este navegador? ' +
                    'Desde la próxima página se medirá como una visita más.')) return;
                quitar(CLAVE_INTERNO);
                pintarMarca();
            });
            d.body.appendChild(pastilla);
        }
        pastilla.textContent = textoMarca();
    }

    function banner() {
        return d.getElementById('consentimiento');
    }

    /** Reabre el banner para cambiar de opinión (pie de página, privacidad). */
    function abrir(desde) {
        var b = banner();
        if (!b) return;
        abridor = desde || null;
        var actual = b.querySelector('[data-consentimiento-actual]');
        var e = estado();
        if (actual) {
            actual.textContent = e === 'si' ? 'Tu elección actual: aceptar.'
                : e === 'no' ? 'Tu elección actual: rechazar.' : '';
            actual.hidden = !e;
        }
        raiz.classList.add('consentimiento-abierto');
        var boton = b.querySelector('button');
        if (boton) boton.focus();
    }

    function cerrar() {
        if (!raiz.classList.contains('consentimiento-abierto')) return;
        raiz.classList.remove('consentimiento-abierto');
        if (abridor && typeof abridor.focus === 'function') abridor.focus();
        abridor = null;
    }

    function decidir(acepta) {
        var valor = JSON.stringify({ v: VERSION, analitica: acepta, fecha: Date.now() });
        enMemoria = guardar(CLAVE, valor) ? null : (acepta ? 'si' : 'no');
        quitar(CLAVE_ANTIGUA);
        if (acepta) activar(); else desactivar();
        raiz.classList.remove('consentimiento-pendiente');
        cerrar();
        pintarMarca();
    }

    // Delegado y en captura: el banner y los botones del pie son HTML
    // estático que llega después de este script, y ningún manejador de la
    // app puede tragarse el clic antes.
    d.addEventListener('click', function (ev) {
        var el = ev.target && ev.target.closest
            ? ev.target.closest('[data-consentimiento], [data-abrir-consentimiento]') : null;
        if (!el) return;
        if (el.hasAttribute('data-abrir-consentimiento')) {
            ev.preventDefault();
            abrir(el);
            return;
        }
        decidir(el.getAttribute('data-consentimiento') === 'aceptar');
    }, true);

    d.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape' || !raiz.classList.contains('consentimiento-abierto')) return;
        var b = banner();
        if (b && b.contains(d.activeElement)) cerrar();
    });

    // Otra pestaña ha decidido o ha cambiado la marca: esta la sigue sin recargar.
    w.addEventListener('storage', function (ev) {
        if (ev.key === CLAVE_INTERNO) {
            pintarMarca();
            return;
        }
        if (ev.key !== CLAVE && ev.key !== null) return;
        enMemoria = null;
        var e = estado();
        raiz.classList.toggle('consentimiento-pendiente', e === null);
        if (e === 'si') activar(); else desactivar();
        pintarMarca();
    });

    quitar(CLAVE_ANTIGUA);
    leerParametroInterno();
    if (estado() !== 'si') borrarCookiesAnalitica();
    raiz.classList.toggle('consentimiento-pendiente', estado() === null);
    pintarMarca();

    w.rinconConsentimiento = {
        estado: estado,
        interno: interno,
        aceptar: function () { decidir(true); },
        rechazar: function () { decidir(false); },
        abrir: abrir,
        alAceptar: alAceptar
    };
})(window, document, __CONFIG_CONSENTIMIENTO__);
