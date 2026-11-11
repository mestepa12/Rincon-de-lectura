// Bingo de lectura: la tarjeta compartible (variante A, «cartón de papel»).
//
// 540×960, como la de estadísticas. Colores fijos, no los del tema: la
// imagen es la misma la saque quien la saque. Sin portadas a propósito: ni
// CORS, ni conversión a data URL, ni memoria de más en iOS.
//
// Pensada para html2canvas, que se queda corto con parte del CSS:
//   - los textos van partidos línea a línea desde aquí (bingo-progreso.js),
//     porque no entiende line-clamp ni elipsis en varias líneas;
//   - el sello es un <img> SVG con width/height en la raíz (Safari no
//     rasteriza en canvas un SVG que solo trae viewBox) y sin
//     mix-blend-mode, que no pinta;
//   - la estampa «¡BINGO!» es HTML y no SVG con <text>: dentro de una
//     imagen no llegan las fuentes de la página.
// Se monta en el body justo antes de capturar y se quita al terminar.
import { resumen, nombreMes, lineasDeCasilla, giroSello } from './bingo-progreso.js';

// Medidas de la tarjeta (bingo.css, .tarjeta-bingo). Si cambian allí, aquí.
// Contenido de una celda: (540 − 2·40 de margen − 3 huecos de 8) / 4 = 109,
// menos 2·1,5 de borde y 2·9 de relleno = 88 px. Las celdas en línea tienen
// borde de 2,5 y relleno de 8: también 88.
const ANCHO_TEXTO = 88;
// El sello (34 px, a 5 px del borde) se come los últimos 30 px del
// contenido; 4 de aire. Las dos líneas de abajo del título van a su lado.
const SELLO = 34;
const ANCHO_JUNTO_AL_SELLO = ANCHO_TEXTO - 30 - 4;
const FUENTE_RETO = '400 13.5px Lato';
const FUENTE_TITULO = '700 12.5px Lato';

const SELLO_SVG = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
    '<circle cx="50" cy="50" r="44" fill="none" stroke="#9A3B3B" stroke-width="5"/>' +
    '<circle cx="50" cy="50" r="35" fill="none" stroke="#9A3B3B" stroke-width="2"/>' +
    '<path d="M50 24 L56 44 L76 50 L56 56 L50 76 L44 56 L24 50 L44 44 Z" fill="#9A3B3B"/></svg>',
)}`;

let lienzo = null;
/** Medidor con la fuente de la tarjeta (measureText de un canvas suelto). */
function medidor(fuente) {
    lienzo ??= document.createElement('canvas').getContext('2d');
    return (texto) => {
        lienzo.font = fuente;
        return lienzo.measureText(texto).width;
    };
}

function nodo(etiqueta, clase, texto) {
    const n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
}

const lineas = (clase, textos) => {
    const caja = nodo('span', clase);
    // Una línea vacía (hueco junto al sello) necesita algo dentro para
    // ocupar su altura.
    textos.forEach((t) => caja.append(nodo('span', 'tb-linea', t || ' ')));
    return caja;
};

/**
 * Espera a que estén las fuentes de la tarjeta: si html2canvas pinta antes,
 * sale con la de sistema y las medidas de las líneas ya no valen.
 */
export async function fuentesListas() {
    if (!document.fonts?.load) return;
    await Promise.all([
        document.fonts.load('700 46px Lora'),
        document.fonts.load('italic 400 26px Lora'),
        document.fonts.load(FUENTE_RETO),
        document.fonts.load(FUENTE_TITULO),
    ]).catch(() => {});
}

/**
 * Monta la tarjeta (fuera de la pantalla) y la devuelve.
 * @param {object} carton Cartón (con mes, tamano, casillas).
 * @param {object} casillas Marcas: { cXX: { titulo } }.
 * @param {?string} nombre Nombre de usuaria, o null para no ponerlo.
 * @return {HTMLElement}
 */
export function montarTarjeta(carton, casillas, nombre = null) {
    const r = resumen(carton, casillas);
    const [anio] = carton.mes.split('-');
    const m = {
        anchoReto: ANCHO_TEXTO,
        anchoTitulo: ANCHO_TEXTO,
        anchoTituloEstrecho: ANCHO_JUNTO_AL_SELLO,
        // 146 de celda − 2·9 de relleno − 3 de bordes; líneas de 13,5·1,22
        // (reto) y 16 px (título), como en bingo.css.
        alto: 125,
        altoLineaReto: 16.47,
        altoLineaTitulo: 16,
        medirReto: medidor(FUENTE_RETO),
        medirTitulo: medidor(FUENTE_TITULO),
    };

    const tarjeta = nodo('div', 'tarjeta-bingo');
    tarjeta.setAttribute('aria-hidden', 'true');

    const estampa = nodo('div', 'tb-estampa');
    estampa.append(nodo('span', 'tb-estampa-dentro', '¡BINGO!'));

    const titulo = nodo('h1', 'tb-titulo');
    titulo.append(nodo('span', 'tb-linea', 'Mi bingo'), nodo('span', 'tb-linea', 'de lectura'));

    const rejilla = nodo('div', 'tb-rejilla');
    rejilla.style.setProperty('--lado', carton.tamano);
    for (const c of carton.casillas) {
        const marca = casillas[c.id];
        const enLinea = !r.completo && r.enLinea.has(c.id);
        const celda = nodo('div', `tb-celda${marca ? ' tb-hecha' : ''}${enLinea ? ' tb-en-linea' : ''}`);
        const texto = lineasDeCasilla({ reto: c.texto, titulo: marca?.titulo }, m);
        celda.append(lineas('tb-reto', texto.reto));
        if (marca) {
            celda.append(lineas('tb-libro', texto.titulo));
            const sello = nodo('img', 'tb-sello');
            sello.src = SELLO_SVG;
            sello.alt = '';
            sello.width = SELLO;
            sello.height = SELLO;
            sello.style.transform = `rotate(${giroSello(`${carton.mes}/${c.id}`)}deg)`;
            celda.append(sello);
        }
        rejilla.append(celda);
    }

    const plural = (n, una, varias) => (n === 1 ? `1 ${una}` : `${n} ${varias}`);
    const cuenta = nodo('div', 'tb-cuenta', r.completo ? 'Cartón completo' : `${r.marcadas} de ${r.total} casillas`);
    const detalle = r.completo
        ? `${r.total} casillas · ${plural(r.lineas, 'línea', 'líneas')}`
        : plural(r.lineas, 'línea', 'líneas');
    cuenta.append(nodo('small', '', nombre ? `${detalle} · @${nombre}` : detalle));
    const web = nodo('div', 'tb-web');
    web.append(nodo('b', '', '¿Juegas?'), document.createTextNode('rinconlectura.es'));
    const pie = nodo('div', 'tb-pie');
    pie.append(cuenta, web);

    tarjeta.append(
        nodo('div', 'tb-marca', 'Mi Rincón de Lectura'),
        titulo,
        nodo('p', 'tb-mes', `${nombreMes(carton.mes)} de ${anio}`),
        estampa,
        rejilla,
        pie,
    );
    document.body.append(tarjeta);
    return tarjeta;
}
