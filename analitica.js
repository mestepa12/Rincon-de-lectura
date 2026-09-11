// Analítica (GA4): el único sitio de la app que llama a gtag.
//
//   enviarEvento('quiz_complete', { quiz_result: 'cozy' })
//
// No envía nada en desarrollo ni con emuladores, nunca lanza y nunca rompe
// la acción que lo dispara: si gtag no está (bloqueador, carga diferida que
// no llegó), sale en silencio. La lógica vive en analitica-nucleo.js, que es
// lo que cubren las pruebas; aquí solo se conecta con el navegador.
import {
    analiticaPermitida, crearEmisor, HOSTS_PRODUCCION, normalizarRuta,
    origenDesdeReferrer, ORIGEN_DIRECTO, ORIGEN_OTRA,
} from './analitica-nucleo.js';

// Mismo triple candado que firebase-init.js. Vite sustituye
// import.meta.env.DEV por el literal false al compilar: en el build el
// primero siempre deja pasar y el aviso de desarrollo desaparece del bundle.
const activa = analiticaPermitida({
    dev: import.meta.env.DEV,                                  // 1. dev server de Vite
    emuladores: import.meta.env.VITE_USE_EMULATORS === 'true', // 2. npm run dev:emu
    hostname: window.location.hostname,                        // 3. red de seguridad
});

// sessionStorage puede lanzar solo con tocarlo (cookies bloqueadas): este
// módulo lo importan auth.js y script.js, y un fallo aquí los tumbaría.
const almacen = {
    getItem: (k) => { try { return window.sessionStorage.getItem(k); } catch { return null; } },
    setItem: (k, v) => { try { window.sessionStorage.setItem(k, v); } catch { /* sin almacén */ } },
    removeItem: (k) => { try { window.sessionStorage.removeItem(k); } catch { /* sin almacén */ } },
};

const emisor = crearEmisor({
    activa,
    produccion: HOSTS_PRODUCCION.includes(window.location.hostname),
    obtenerGtag: () => window.gtag,
    // gtag.js define google_tag_manager al cargar. Antes solo existe el stub
    // del <head>, que encola en un dataLayer que muere si se cambia de página.
    gtagCargado: () => Boolean(window.google_tag_manager),
    almacen,
    // Sin query: a la biblioteca se llega con ?chat=<uid> desde las
    // notificaciones, y eso no debe salir en ningún evento.
    paginaActual: () => `${window.location.origin}${window.location.pathname}`,
    avisarDev: import.meta.env.DEV ? (...args) => console.debug('[analítica]', ...args) : undefined,
});

/**
 * Envía un evento del catálogo (analitica-nucleo.js → EVENTOS).
 * @param {string} nombre
 * @param {object} [params]
 * @param {{antesDeNavegar?: boolean}} [opciones] Esperar (≤1 s) a que salga
 *     porque detrás viene un cambio de página.
 * @return {Promise<void>} Nunca se rechaza.
 */
export const enviarEvento = emisor.enviar;

// --- Página de origen del registro (origin_page) ----------------------------
// La última página de contenido vista antes de registro/login en esta
// pestaña. Se apunta al pulsar un CTA y al llegar a registro/login (por el
// referrer, que con strict-origin-when-cross-origin trae la ruta completa
// entre páginas del mismo sitio).
const CLAVE_ORIGEN = 'rincon_origen_registro';

/** Registro y login: apunta la página de la que se viene. */
export const recordarOrigenDesdeReferrer = () => {
    const desde = origenDesdeReferrer(document.referrer, window.location.origin);
    if (!desde) return; // de fuera o sin referrer: vale lo que hubiera
    // Ir y volver entre registro y login da "(otra)": no pisa un origen real.
    if (desde !== ORIGEN_OTRA || !almacen.getItem(CLAVE_ORIGEN)) almacen.setItem(CLAVE_ORIGEN, desde);
};

/**
 * sign_up, con la página de origen apuntada (que se consume).
 * @param {'email'|'google'} method
 * @param {{origen?: string, navega?: boolean}} [opciones] origen fuerza la
 *     página (el muro del quiz); navega=false si no hay redirección detrás.
 * @return {Promise<void>}
 */
export const enviarAlta = (method, { origen, navega = true } = {}) => {
    const apuntado = almacen.getItem(CLAVE_ORIGEN);
    almacen.removeItem(CLAVE_ORIGEN);
    return enviarEvento('sign_up', { method, origin_page: origen || apuntado || ORIGEN_DIRECTO },
        { antesDeNavegar: navega });
};

/** Home y páginas de contenido: mide los clics en enlaces a /register. */
export const vigilarCtasRegistro = () => {
    const origen = normalizarRuta(window.location.pathname);
    document.addEventListener('click', (e) => {
        try {
            const enlace = e.target instanceof Element ? e.target.closest('a[href]') : null;
            if (!enlace) return;
            const destino = new URL(enlace.href, window.location.href);
            if (destino.origin !== window.location.origin) return;
            if (destino.pathname.replace(/\.html$/, '') !== '/register') return;
            almacen.setItem(CLAVE_ORIGEN, origen);
            // Con Ctrl/Cmd/Mayús o target=_blank el enlace abre otra pestaña
            // y esta se queda: el evento va por el camino normal.
            const navegaAqui = e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey &&
                (!enlace.target || enlace.target === '_self');
            enviarEvento('sign_up_cta_click', { origin_page: origen }, { antesDeNavegar: navegaAqui });
        } catch { /* nunca bloquea el enlace */ }
    });
};

// Lo que dejó a medias la página anterior (ver antesDeNavegar).
emisor.enviarPendientes();
