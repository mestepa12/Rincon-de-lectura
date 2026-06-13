// Carga diferida de librerías pesadas (Chart.js, html2canvas).
// No se incluyen en la carga inicial: se inyectan desde su CDN solo cuando
// el usuario abre las estadísticas o exporta una tarjeta. Así se reduce el
// JavaScript sin usar en el arranque (Lighthouse: "Reduce unused JavaScript").

const CHART_SRC = 'https://cdn.jsdelivr.net/npm/chart.js';
const HTML2CANVAS_SRC = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';

// Cachea la promesa por URL para no inyectar el mismo script dos veces.
const loaded = new Map();

function injectScript(src) {
    if (loaded.has(src)) return loaded.get(src);
    const promise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
            loaded.delete(src); // permite reintentar tras un fallo de red
            reject(new Error('No se pudo cargar: ' + src));
        };
        document.head.appendChild(s);
    });
    loaded.set(src, promise);
    return promise;
}

// Devuelve el global Chart, cargándolo del CDN si aún no está disponible.
export async function loadChart() {
    if (typeof window.Chart === 'undefined') await injectScript(CHART_SRC);
    return window.Chart;
}

// Devuelve el global html2canvas, cargándolo del CDN si aún no está disponible.
export async function loadHtml2canvas() {
    if (typeof window.html2canvas === 'undefined') {
        await injectScript(HTML2CANVAS_SRC);
    }
    return window.html2canvas;
}
