// Núcleo de la analítica: todo lo que se puede probar sin navegador.
// analitica.js lo conecta con gtag, sessionStorage y el entorno de Vite.
//
// Lo importante está en EVENTOS: un catálogo cerrado. Un evento que no está
// no sale, y de cada evento solo salen los parámetros listados, cada uno con
// su validador (lista cerrada de valores o entero). Así no hay forma de colar
// por descuido un correo, un título de libro o un UID: ninguno pasa ningún
// validador.

// Páginas desde las que se llega al registro. Rutas limpias, como las sirve
// Hosting con cleanUrls.
export const PAGINAS_ORIGEN = [
    '/',
    '/tropos-literarios',
    '/app-registro-lecturas',
    '/importar-goodreads',
    '/cuantas-paginas-leer-al-dia',
    '/estadisticas-de-lectura',
    '/vs-goodreads',
    '/quiz',
];
export const ORIGEN_OTRA = '(otra)';       // página interna fuera de la lista
export const ORIGEN_DIRECTO = '(directo)'; // se llegó a registro/login desde fuera

const tiene = (obj, clave) => Object.prototype.hasOwnProperty.call(obj, clave);
const esOrigen = (v) => PAGINAS_ORIGEN.includes(v) || v === ORIGEN_OTRA || v === ORIGEN_DIRECTO;
const esEntero = (v) => Number.isSafeInteger(v) && v >= 0;
// Ids de perfil del quiz: enemies, familia, cozy... Un UID (28 caracteres,
// mayúsculas) no cabe.
const esPerfilQuiz = (v) => typeof v === 'string' && /^[a-z0-9_]{1,20}$/.test(v);

export const EVENTOS = {
    sign_up: { method: (v) => v === 'email' || v === 'google', origin_page: esOrigen },
    sign_up_cta_click: { origin_page: esOrigen },
    add_first_book: {},
    goodreads_import_complete: { book_count: esEntero },
    quiz_gate_view: {},
    quiz_complete: { quiz_result: esPerfilQuiz },
    reading_session_start: {},
};

/**
 * Filtra los parámetros de un evento contra el catálogo.
 * @param {string} nombre Nombre del evento.
 * @param {object} params Parámetros propuestos.
 * @return {object|null} Solo los parámetros válidos, o null si el evento no
 *     está en el catálogo.
 */
export const limpiarParametros = (nombre, params = {}) => {
    if (!tiene(EVENTOS, nombre)) return null;
    const limpios = {};
    for (const [clave, valido] of Object.entries(EVENTOS[nombre])) {
        if (params && tiene(params, clave) && valido(params[clave])) limpios[clave] = params[clave];
    }
    return limpios;
};

/**
 * Pasa una ruta a su forma limpia y la cierra contra PAGINAS_ORIGEN.
 * "/tropos-literarios.html" (dev server) y "/tropos-literarios" (Hosting)
 * dan lo mismo.
 * @param {string} ruta pathname.
 * @return {string} Una de PAGINAS_ORIGEN u ORIGEN_OTRA.
 */
export const normalizarRuta = (ruta) => {
    if (typeof ruta !== 'string' || !ruta.startsWith('/')) return ORIGEN_OTRA;
    let r = ruta.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    if (r.length > 1) r = r.replace(/\/+$/, '');
    return PAGINAS_ORIGEN.includes(r) ? r : ORIGEN_OTRA;
};

/**
 * Página de origen a partir del referrer, solo si es de este mismo sitio.
 * @param {string} referrer document.referrer.
 * @param {string} origenPropio location.origin.
 * @return {string|null} Ruta normalizada, o null si viene de fuera o no hay.
 */
export const origenDesdeReferrer = (referrer, origenPropio) => {
    try {
        const url = new URL(referrer);
        return url.origin === origenPropio ? normalizarRuta(url.pathname) : null;
    } catch {
        return null;
    }
};

// Mismo criterio que firebase-init.js para decidir si se habla con los
// emuladores, pero al revés: aquí cualquiera de los tres cierra el envío.
export const HOSTS_LOCALES = ['localhost', '127.0.0.1', '[::1]'];

/**
 * ¿Se pueden enviar eventos desde este entorno?
 * @param {{dev: boolean, emuladores: boolean, hostname: string}} entorno
 * @return {boolean}
 */
export const analiticaPermitida = ({ dev, emuladores, hostname }) =>
    !dev && !emuladores && !HOSTS_LOCALES.includes(hostname);

// Dominios que sirven la web de verdad (la app Android también se presenta
// como rinconlectura.es). Cualquier otro host desplegado —canales de
// preview, proyecto de dev— envía con debug_mode: sale en DebugView y el
// filtro de tráfico de desarrolladores lo quita de los informes.
export const HOSTS_PRODUCCION = [
    'rinconlectura.es',
    'www.rinconlectura.es',
    'mi-rincon-de-lectura.web.app',
    'mi-rincon-de-lectura.firebaseapp.com',
];

// Propiedad de GA4. consentimiento.js la recibe del plugin de vite.config.js.
export const ID_MEDICION = 'G-C3LTR2R6B5';

export const CLAVE_PENDIENTES = 'rincon_ga_pendientes';
const MAX_PENDIENTES = 10;

/**
 * Crea el emisor de eventos. Todas las dependencias del navegador entran
 * por parámetro para poder probarlo en Node.
 *
 * @param {object} d
 * @param {boolean} d.activa Resultado de analiticaPermitida().
 * @param {boolean} d.produccion El host es de producción.
 * @param {() => Function|undefined} d.obtenerGtag Devuelve window.gtag.
 * @param {() => boolean} d.gtagCargado gtag.js ya se ha descargado y
 *     procesa la cola (no basta con el stub del <head>).
 * @param {Storage} d.almacen sessionStorage.
 * @param {() => string} d.paginaActual URL sin query ni hash.
 * @param {() => boolean} [d.consentido] Hay un "sí" vigente a Analytics.
 *     Se mira en cada envío (se puede aceptar o revocar sin recargar); sin
 *     él no sale ni se guarda nada. Si falta, cuenta como un no.
 * @param {Function} [d.avisarDev] Solo en desarrollo: registra lo que se
 *     habría enviado.
 * @param {number} [d.esperaMaxima] Tope de espera antes de navegar (ms).
 * @param {Function} [d.programar] setTimeout.
 * @return {{enviar: Function, enviarPendientes: Function}}
 */
export function crearEmisor({
    activa, produccion, obtenerGtag, gtagCargado, almacen, paginaActual,
    consentido = () => false,
    avisarDev = () => {}, esperaMaxima = 1000, programar = setTimeout,
}) {
    const datosDeEnvio = (params, pagina) => {
        const datos = { ...params, page_location: pagina };
        // debug_mode activa la depuración con CUALQUIER valor, false
        // incluido: en producción la clave no puede aparecer.
        if (!produccion) datos.debug_mode = true;
        return datos;
    };

    const leerPendientes = () => {
        try {
            const lista = JSON.parse(almacen.getItem(CLAVE_PENDIENTES) || '[]');
            return Array.isArray(lista) ? lista : [];
        } catch {
            return [];
        }
    };
    const guardarPendientes = (lista) => {
        try {
            if (lista.length) almacen.setItem(CLAVE_PENDIENTES, JSON.stringify(lista.slice(-MAX_PENDIENTES)));
            else almacen.removeItem(CLAVE_PENDIENTES);
        } catch { /* sin sessionStorage: el evento se pierde, la acción no */ }
    };

    /**
     * Envía un evento. Nunca lanza y la promesa nunca se rechaza.
     *
     * Con antesDeNavegar, la promesa espera a que gtag confirme el envío
     * (como mucho esperaMaxima) para poder cambiar de página detrás. Si
     * gtag.js todavía no ha cargado, el evento no se mete en el dataLayer
     * de esta página, que va a desaparecer: se guarda y lo envía la
     * siguiente. Nunca van por los dos caminos, así que no hay duplicados.
     *
     * @param {string} nombre Evento del catálogo.
     * @param {object} [params] Parámetros; los no permitidos se descartan.
     * @param {{antesDeNavegar?: boolean}} [opciones]
     * @return {Promise<void>}
     */
    const enviar = (nombre, params = {}, { antesDeNavegar = false } = {}) => new Promise((resolver) => {
        try {
            const limpios = limpiarParametros(nombre, params);
            if (!limpios) {
                avisarDev('evento fuera del catálogo, descartado:', nombre);
                resolver();
                return;
            }
            if (!activa) {
                avisarDev('no enviado (desarrollo):', nombre, limpios);
                resolver();
                return;
            }
            // Ni al dataLayer ni a pendientes: si se acepta luego en esta
            // página, gtag.js no debe encontrarse eventos de antes del sí.
            if (!consentido()) {
                avisarDev('no enviado (sin consentimiento):', nombre, limpios);
                resolver();
                return;
            }
            const pagina = paginaActual();
            if (antesDeNavegar && !gtagCargado()) {
                guardarPendientes([...leerPendientes(), { nombre, params: limpios, pagina }]);
                resolver();
                return;
            }
            const gtag = obtenerGtag();
            if (typeof gtag !== 'function') {
                resolver();
                return;
            }
            const datos = datosDeEnvio(limpios, pagina);
            if (antesDeNavegar) {
                datos.event_callback = () => resolver();
                datos.event_timeout = esperaMaxima;
                programar(resolver, esperaMaxima); // por si gtag no llama nunca
            }
            gtag('event', nombre, datos);
            if (!antesDeNavegar) resolver();
        } catch {
            resolver();
        }
    });

    /** Envía los eventos que dejó guardados la página anterior. */
    const enviarPendientes = () => {
        try {
            if (!activa) return;
            // Se guardaron con consentimiento y se ha revocado después.
            if (!consentido()) {
                guardarPendientes([]);
                return;
            }
            const lista = leerPendientes();
            if (!lista.length) return;
            guardarPendientes([]); // antes de enviar: un fallo no los repite
            const gtag = obtenerGtag();
            if (typeof gtag !== 'function') return;
            for (const p of lista) {
                try {
                    const limpios = limpiarParametros(p?.nombre, p?.params);
                    if (!limpios) continue;
                    // La página de origen, otra vez sin query ni hash: lo que
                    // hay en sessionStorage no se da por bueno sin mirarlo.
                    const url = new URL(p.pagina);
                    gtag('event', p.nombre, datosDeEnvio(limpios, `${url.origin}${url.pathname}`));
                } catch { /* uno roto no se lleva por delante a los demás */ }
            }
        } catch { /* nunca rompe la carga de la página */ }
    };

    return { enviar, enviarPendientes };
}
