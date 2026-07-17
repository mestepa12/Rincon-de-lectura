// Carga diferida de librerías pesadas (Chart.js, html2canvas).
// No se incluyen en la carga inicial: Vite las separa en chunks propios que
// solo se descargan cuando el usuario abre las estadísticas o exporta una
// tarjeta. Así se reduce el JavaScript sin usar en el arranque y no dependemos
// de CDNs externos (bloqueados por la CSP).

// Devuelve el global Chart, cargando el chunk si aún no está disponible.
export async function loadChart() {
    if (typeof window.Chart === 'undefined') {
        const { default: Chart } = await import('chart.js/auto');
        window.Chart = Chart;
    }
    return window.Chart;
}

// Devuelve el global html2canvas, cargando el chunk si aún no está disponible.
export async function loadHtml2canvas() {
    if (typeof window.html2canvas === 'undefined') {
        const { default: html2canvas } = await import('html2canvas');
        window.html2canvas = html2canvas;
    }
    return window.html2canvas;
}
