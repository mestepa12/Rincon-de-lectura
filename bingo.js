// Bingo de lectura: el bloque de la biblioteca y su panel.
//
// Lo que sabe hacer cada fichero:
//   bingo-carton.js   — el cartón: validación y fechas (lo usa también el
//                       script de publicación)
//   bingo-progreso.js — líneas, límites por libro, qué cartón toca: puro y
//                       probado aparte
//   bingo.js (este)   — leer y escribir en Firestore y pintar
//
// Datos (ver firestore.rules, 4c y E):
//   bingos/{AAAA-MM}             el cartón, el mismo para todas
//   users/{uid}/bingo/{AAAA-MM}  las marcas de esta usuaria, solo suyas
//
// Lecturas por carga de la biblioteca: el cartón del mes y el progreso
// (2), y los primeros días del mes también los del anterior (2 más). Con
// getDoc, sin escuchas: solo escribe esta pestaña y se actualiza en local.
//
// Si no hay cartón publicado (o aún no se ha abierto), el bloque no se
// pinta: ni hueco, ni aviso. «Más → Bingo de lectura» sigue entrando, al
// historial.
import './bingo.css';
import {
    doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp, collection, getDocs,
} from 'firebase/firestore';
import { db } from './firebase-init.js';
import { notify } from './notify.js';
import { enviarEvento } from './analitica.js';
import {
    mesDe, mesAnterior, nombreMes, estaAbierto, ultimoDiaDeGracia, mirarMesAnterior,
    resumen, hitoNuevo, opcionesParaCasilla, coincide, elegirCartones,
} from './bingo-progreso.js';

const TITULO_MAX = 300; // el mismo tope que el título de un libro

let uid = null;
let leerLibros = () => [];
const cartones = new Map();   // mes → cartón o null (no hay / no se ve)
const progresos = new Map();  // mes → { mes, casillas, lineaEn?, completoEn? }
let principal = null;
let gracia = null;
let enVistaDeAmiga = false;

// Lo que enseña el panel: qué mes, qué vista y, en el selector, qué casilla.
// desdeHistorial: se mira un mes que no es el actual; volverA dice adónde
// lleva el botón de volver (al historial o al mes actual).
const panel = { mes: null, vista: 'carton', casilla: null, desdeHistorial: false, volverA: 'historial', celebrar: null };

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

const aCarton = (d) => ({
    ...d,
    publicaDesde: d.publicaDesde.toDate(),
    cierraEn: d.cierraEn.toDate(),
});

/**
 * El cartón de un mes, o null si no hay o aún no se puede ver. Los dos casos
 * llegan igual (permission-denied): las reglas no dejan distinguirlos.
 */
async function leerCarton(mes) {
    if (cartones.has(mes)) return cartones.get(mes);
    let carton = null;
    try {
        const snap = await getDoc(doc(db, 'bingos', mes));
        carton = snap.exists() ? aCarton(snap.data()) : null;
    } catch (error) {
        if (error?.code !== 'permission-denied') throw error;
    }
    cartones.set(mes, carton);
    return carton;
}

async function leerProgreso(mes) {
    if (progresos.has(mes)) return progresos.get(mes);
    const snap = await getDoc(doc(db, 'users', uid, 'bingo', mes));
    const progreso = snap.exists() ? { casillas: {}, ...snap.data() } : { mes, casillas: {} };
    progresos.set(mes, progreso);
    return progreso;
}

/**
 * Pone a una casilla un libro (o se lo quita, con libro = null). Primero en
 * pantalla y luego en Firestore; si Firestore lo rechaza, se deshace.
 */
async function guardarCasilla(mes, casillaId, libro) {
    const carton = cartones.get(mes);
    const progreso = progresos.get(mes);
    const antes = { ...progreso, casillas: { ...progreso.casillas } };
    const casillas = { ...progreso.casillas };
    if (libro) casillas[casillaId] = { bookId: libro.id, titulo: String(libro.title || '').slice(0, TITULO_MAX) };
    else delete casillas[casillaId];

    const hito = libro ? hitoNuevo(carton, progreso, casillas) : null;
    const ref = doc(db, 'users', uid, 'bingo', mes);
    const ahora = serverTimestamp();
    let escritura;
    if (libro) {
        const datos = {
            mes,
            casillas: { [casillaId]: { ...casillas[casillaId], marcadoEn: ahora } },
            actualizadoEn: ahora,
        };
        if (hito && !progreso.lineaEn) datos.lineaEn = ahora;
        if (hito === 'full') datos.completoEn = ahora;
        // merge: los mapas se funden, así que solo se toca esta casilla.
        escritura = setDoc(ref, datos, { merge: true });
    } else {
        escritura = updateDoc(ref, { [`casillas.${casillaId}`]: deleteField(), actualizadoEn: ahora });
    }

    // En local, ya: la escritura puede tardar (o quedarse en cola sin red).
    const local = new Date();
    progresos.set(mes, {
        ...progreso,
        casillas,
        ...(hito && !progreso.lineaEn ? { lineaEn: local } : {}),
        ...(hito === 'full' ? { completoEn: local } : {}),
    });
    panel.celebrar = hito;
    refrescar();

    try {
        await escritura;
    } catch (error) {
        progresos.set(mes, antes);
        panel.celebrar = null;
        if (error?.code === 'permission-denied' && !estaAbierto(carton, new Date())) {
            notify('Este cartón ya se ha cerrado: no se puede cambiar.', 'info');
        } else {
            console.error('No se pudo guardar la casilla del bingo:', error);
            notify('No se ha podido guardar. Inténtalo de nuevo.', 'error');
        }
        refrescar();
        return;
    }

    const marcadas = Object.keys(casillas).length;
    if (libro) enviarEvento('bingo_square_mark', { bingo_month: mes, filled_count: marcadas });
    else enviarEvento('bingo_square_unmark', { bingo_month: mes });
    if (hito) enviarEvento('bingo_milestone', { bingo_month: mes, milestone: hito, day_of_month: local.getDate() });
}

// ---------------------------------------------------------------------------
// Utilidades de pintado (sin innerHTML: todo lo que viene de datos va como
// textContent)
// ---------------------------------------------------------------------------

function el(etiqueta, atributos = {}, ...hijos) {
    const nodo = document.createElement(etiqueta);
    for (const [k, v] of Object.entries(atributos)) {
        if (v === false || v === null || v === undefined) continue;
        if (k === 'class') nodo.className = v;
        else if (k === 'text') nodo.textContent = v;
        else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
        else nodo.setAttribute(k, v === true ? '' : v);
    }
    nodo.append(...hijos.filter(Boolean));
    return nodo;
}

const SVG = 'http://www.w3.org/2000/svg';
/** Marca de casilla hecha: un trazo, del color de acento (no es un emoji). */
function iconoMarca() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('class', 'bingo-marca');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', 'M3.5 8.5l3 3 6-7');
    svg.append(p);
    return svg;
}

const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "5/16 · te falta 1 para línea", "¡Línea! · 6/16", "¡Cartón completo!" */
function textoProgreso(r) {
    if (r.completo) return '¡Cartón completo!';
    if (r.lineas > 0) return `¡Línea! · ${r.marcadas}/${r.total}`;
    if (r.marcadas === 0) return `0/${r.total} · empieza por la casilla que quieras`;
    return `${r.marcadas}/${r.total} · te ${r.faltanParaLinea === 1 ? 'falta 1' : `faltan ${r.faltanParaLinea}`} para línea`;
}

const textoGracia = (carton, progreso) => {
    const r = resumen(carton, progreso.casillas);
    return `${mayuscula(nombreMes(carton.mes))} se cierra el día ${ultimoDiaDeGracia(carton.cierraEn)}: llevas ${r.marcadas}/${r.total}.`;
};

// ---------------------------------------------------------------------------
// Bloque de la biblioteca
// ---------------------------------------------------------------------------

function pintarBloque() {
    document.querySelector('.bingo-bloque')?.remove();
    const main = document.getElementById('main-content');
    if (!main || !principal || enVistaDeAmiga) return;

    const progreso = progresos.get(principal.mes);
    if (!progreso) return;
    const r = resumen(principal, progreso.casillas);

    const mini = el('span', { class: 'bingo-mini', 'aria-hidden': 'true', style: `--lado:${principal.tamano}` },
        ...principal.casillas.map((c) => el('span', {
            class: `bingo-mini-celda${progreso.casillas[c.id] ? ' bingo-mini-hecha' : ''}`,
        })));

    const abrir = el('button', {
        type: 'button',
        class: 'bingo-bloque-abrir',
        onclick: () => abrirPanel(principal.mes),
    },
    mini,
    el('span', { class: 'bingo-bloque-textos' },
        el('span', { class: 'bingo-bloque-titulo', text: principal.titulo }),
        el('span', { class: 'bingo-bloque-progreso', text: textoProgreso(r) })),
    el('span', { class: 'bingo-bloque-flecha', 'aria-hidden': 'true', text: '›' }));

    const bloque = el('section', { class: 'bingo-bloque', 'aria-label': 'Bingo de lectura' }, abrir);

    if (gracia) {
        bloque.append(el('p', { class: 'bingo-bloque-gracia' },
            el('span', { text: `${textoGracia(gracia, progresos.get(gracia.mes))} ` }),
            el('button', {
                type: 'button',
                class: 'bingo-enlace',
                text: `Terminar ${nombreMes(gracia.mes)}`,
                onclick: () => abrirPanel(gracia.mes),
            })));
    }

    main.insertBefore(bloque, document.getElementById('leyendo-ahora'));
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

let dialogo = null;
let cuerpo = null;
let tituloPanel = null;
let subtituloPanel = null;
let pestanas = null;

function crearDialogo() {
    if (dialogo) return;
    tituloPanel = el('h2', { id: 'bingo-titulo', class: 'bingo-titulo' });
    subtituloPanel = el('p', { class: 'bingo-sub' });
    const cerrar = el('button', {
        type: 'button', class: 'bingo-cerrar', 'aria-label': 'Cerrar el bingo', text: '✕',
        onclick: () => dialogo.close(),
    });
    pestanas = el('div', { class: 'bingo-pestanas' },
        el('button', { type: 'button', 'data-vista': 'carton', text: 'Este mes', onclick: () => abrirVista('carton', { mes: principal?.mes || null, desdeHistorial: false }) }),
        el('button', { type: 'button', 'data-vista': 'historial', text: 'Meses anteriores', onclick: () => abrirVista('historial') }));
    cuerpo = el('div', { class: 'bingo-cuerpo' });
    dialogo = el('dialog', { id: 'bingo-modal', class: 'bingo-modal', 'aria-labelledby': 'bingo-titulo' },
        el('header', { class: 'bingo-cabecera' }, el('div', {}, tituloPanel, subtituloPanel), cerrar),
        pestanas,
        cuerpo);
    // Tocar el fondo cierra, como en el resto de diálogos.
    dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });
    dialogo.addEventListener('close', () => { panel.celebrar = null; });
    document.body.append(dialogo);
}

/**
 * Abre el panel en un mes (el principal si no se dice cuál).
 * @param {string} [mes]
 */
async function abrirPanel(mes = principal?.mes) {
    crearDialogo();
    panel.mes = mes || null;
    panel.vista = 'carton';
    panel.casilla = null;
    // Desde el aviso de la gracia se abre el mes anterior: con vuelta al actual.
    panel.desdeHistorial = Boolean(panel.mes && principal && panel.mes !== principal.mes);
    panel.volverA = 'principal';
    panel.celebrar = null;
    if (panel.mes) {
        try {
            await Promise.all([leerCarton(panel.mes), leerProgreso(panel.mes)]);
        } catch (error) {
            console.error('No se pudo cargar el bingo:', error);
            notify('No se ha podido cargar el bingo. Revisa la conexión.', 'error');
            return;
        }
    }
    refrescar();
    if (!dialogo.open) dialogo.showModal();
    const progreso = panel.mes && progresos.get(panel.mes);
    if (progreso && cartones.get(panel.mes)) {
        enviarEvento('bingo_view', { bingo_month: panel.mes, filled_count: Object.keys(progreso.casillas).length });
    }
}

function abrirVista(vista, extra = {}) {
    Object.assign(panel, { vista, ...extra });
    if (vista === 'historial') {
        panel.desdeHistorial = false;
        enviarEvento('bingo_archive_view');
    }
    refrescar();
    // El foco al principio de la vista nueva: si se queda en un botón que ya
    // no existe, el lector de pantalla se pierde.
    cuerpo.querySelector('[data-foco]')?.focus();
}

function refrescar() {
    pintarBloque();
    if (!dialogo?.open && !dialogo) return;
    pestanas.querySelectorAll('button').forEach((b) => {
        const activa = b.dataset.vista === (panel.vista === 'historial' ? 'historial' : 'carton') && !panel.desdeHistorial;
        b.setAttribute('aria-pressed', String(activa));
    });
    cuerpo.replaceChildren();
    if (panel.vista === 'historial') return pintarHistorial();
    if (panel.vista === 'selector') return pintarSelector();
    return pintarCarton();
}

function pintarCabecera(carton, progreso) {
    if (!carton) {
        tituloPanel.textContent = 'Bingo de lectura';
        subtituloPanel.textContent = '';
        return;
    }
    tituloPanel.textContent = carton.titulo;
    subtituloPanel.textContent = textoProgreso(resumen(carton, progreso.casillas));
}

function pintarCarton() {
    const carton = panel.mes ? cartones.get(panel.mes) : null;
    if (!carton) {
        pintarCabecera(null);
        cuerpo.append(
            el('p', { class: 'bingo-vacio', text: 'Este mes no hay cartón.', tabindex: '-1', 'data-foco': true }),
            el('button', { type: 'button', class: 'bingo-enlace', text: 'Ver meses anteriores', onclick: () => abrirVista('historial') }));
        return;
    }
    const progreso = progresos.get(carton.mes);
    const r = resumen(carton, progreso.casillas);
    const editable = estaAbierto(carton, new Date());
    pintarCabecera(carton, progreso);

    if (panel.desdeHistorial) {
        const alActual = panel.volverA === 'principal' && principal;
        cuerpo.append(el('button', {
            type: 'button', class: 'bingo-volver', 'data-foco': true,
            text: alActual ? `‹ Volver a ${nombreMes(principal.mes)}` : '‹ Meses anteriores',
            onclick: () => (alActual
                ? abrirVista('carton', { mes: principal.mes, desdeHistorial: false })
                : abrirVista('historial')),
        }));
    }

    if (panel.celebrar) {
        cuerpo.append(el('p', {
            class: 'bingo-celebra', role: 'status',
            text: panel.celebrar === 'full'
                ? '¡Cartón completo! Menudo mes de lecturas.'
                : '¡Bingo! Has hecho tu primera línea.',
        }));
    }

    if (!editable) {
        cuerpo.append(el('p', { class: 'bingo-nota', text: 'Este cartón ya está cerrado: se puede mirar, pero no cambiar.' }));
    }

    const grid = el('ol', { class: 'bingo-grid', style: `--lado:${carton.tamano}`, 'aria-label': `Cartón de ${nombreMes(carton.mes)}` });
    for (const c of carton.casillas) {
        const marca = progreso.casillas[c.id];
        const enLinea = r.enLinea.has(c.id);
        const etiqueta = marca ? `${c.texto}. Marcada con ${marca.titulo}` : `${c.texto}. Sin marcar`;
        const contenido = [
            el('span', { class: 'bingo-casilla-texto', text: c.texto }),
            marca && el('span', { class: 'bingo-casilla-libro' }, iconoMarca(), el('span', { text: marca.titulo })),
        ];
        const clase = `bingo-casilla${marca ? ' bingo-casilla-hecha' : ''}${enLinea ? ' bingo-casilla-linea' : ''}`;
        grid.append(el('li', {}, editable
            ? el('button', {
                type: 'button', class: clase, 'aria-label': etiqueta,
                onclick: () => abrirVista('selector', { casilla: c.id }),
            }, ...contenido)
            : el('div', { class: clase, 'aria-label': etiqueta, role: 'group' }, ...contenido)));
    }
    cuerpo.append(grid);

    if (editable) {
        const max = carton.maxCasillasPorLibro;
        cuerpo.append(el('p', {
            class: 'bingo-nota',
            text: `Toca una casilla y elige el libro de este mes que la cumple. Cada libro vale para ${max === 1 ? 'una casilla' : `${max} casillas`} como mucho.`,
        }));
    }

    if (gracia && carton.mes === principal?.mes && !panel.desdeHistorial) {
        cuerpo.append(el('p', { class: 'bingo-nota' },
            el('span', { text: `${textoGracia(gracia, progresos.get(gracia.mes))} ` }),
            el('button', {
                type: 'button', class: 'bingo-enlace', text: `Terminar ${nombreMes(gracia.mes)}`,
                onclick: () => abrirVista('carton', { mes: gracia.mes, desdeHistorial: true, volverA: 'principal' }),
            })));
    }
    if (!panel.desdeHistorial) {
        // Sin "volver", el foco va a la primera casilla.
        grid.querySelector('button, [role="group"]')?.setAttribute('data-foco', '');
    }
}

function pintarSelector() {
    const carton = cartones.get(panel.mes);
    const progreso = progresos.get(panel.mes);
    const casilla = carton.casillas.find((c) => c.id === panel.casilla);
    const actual = progreso.casillas[casilla.id];
    pintarCabecera(carton, progreso);

    const volver = el('button', {
        type: 'button', class: 'bingo-volver', text: '‹ Volver al cartón', 'data-foco': true,
        onclick: () => abrirVista('carton', { mes: panel.mes, desdeHistorial: panel.desdeHistorial }),
    });
    cuerpo.append(volver, el('h3', { class: 'bingo-reto', text: casilla.texto }));

    if (actual) {
        cuerpo.append(el('p', { class: 'bingo-actual' },
            el('span', { text: `Ahora: ${actual.titulo}` }),
            el('button', {
                type: 'button', class: 'bingo-quitar', text: 'Quitar de esta casilla',
                onclick: () => {
                    guardarCasilla(panel.mes, casilla.id, null);
                    abrirVista('carton', { mes: panel.mes, desdeHistorial: panel.desdeHistorial });
                },
            })));
    }

    const libros = leerLibros();
    if (!libros) {
        cuerpo.append(el('p', { class: 'bingo-vacio', text: 'Cargando tu biblioteca…' }));
        return;
    }
    const opciones = opcionesParaCasilla(libros, progreso.casillas, casilla.id, carton.maxCasillasPorLibro);
    if (opciones.length === 0) {
        cuerpo.append(el('p', {
            class: 'bingo-vacio',
            text: 'Aquí salen los libros que estás leyendo y los terminados. Todavía no tienes ninguno.',
        }));
        return;
    }

    const lista = el('ul', { class: 'bingo-libros' });
    const vacio = el('p', { class: 'bingo-vacio', text: 'Ningún libro coincide.', hidden: true });
    const buscar = el('input', {
        type: 'search', class: 'bingo-buscar', placeholder: 'Buscar por título o autor',
        'aria-label': 'Buscar libro', autocomplete: 'off',
    });
    const pintarLista = () => {
        const visibles = opciones.filter((o) => coincide(o.libro, buscar.value));
        lista.replaceChildren(...visibles.map(({ libro, usos, actual: esActual, disponible }) => {
            const nota = esActual ? 'En esta casilla'
                : !disponible ? `Ya está en ${usos} casillas`
                    : usos ? `En ${usos === 1 ? 'otra casilla' : `${usos} casillas`}` : '';
            const portada = /^(https:\/\/|data:image\/)/i.test(libro.cover || '')
                ? el('img', { class: 'bingo-libro-portada', src: libro.cover, alt: '', loading: 'lazy', decoding: 'async' })
                : el('span', { class: 'bingo-libro-portada bingo-libro-sin-portada', 'aria-hidden': 'true' });
            return el('li', {}, el('button', {
                type: 'button',
                class: `bingo-libro${esActual ? ' bingo-libro-actual' : ''}`,
                disabled: !disponible,
                onclick: () => {
                    if (!esActual) guardarCasilla(panel.mes, casilla.id, libro);
                    abrirVista('carton', { mes: panel.mes, desdeHistorial: panel.desdeHistorial });
                },
            },
            portada,
            el('span', { class: 'bingo-libro-datos' },
                el('span', { class: 'bingo-libro-titulo', text: libro.title }),
                libro.author && el('span', { class: 'bingo-libro-autor', text: libro.author }),
                nota && el('span', { class: 'bingo-libro-nota', text: nota }))));
        }));
        vacio.hidden = visibles.length > 0;
    };
    buscar.addEventListener('input', pintarLista);
    pintarLista();
    // El buscador solo cuando la lista es larga. (Ojo: append(null) pinta
    // el texto "null"; por eso se filtra.)
    cuerpo.append(...[opciones.length > 6 && buscar, lista, vacio].filter(Boolean));
}

async function pintarHistorial() {
    tituloPanel.textContent = 'Bingo de lectura';
    subtituloPanel.textContent = 'Tus cartones de otros meses';
    const contenedor = el('div', { class: 'bingo-historial', tabindex: '-1', 'data-foco': true },
        el('p', { class: 'bingo-vacio', text: 'Cargando…' }));
    cuerpo.append(contenedor);

    let meses;
    try {
        const snap = await getDocs(collection(db, 'users', uid, 'bingo'));
        snap.docs.forEach((d) => { if (!progresos.has(d.id)) progresos.set(d.id, { casillas: {}, ...d.data() }); });
        meses = snap.docs.map((d) => d.id).filter((m) => m !== principal?.mes).sort().reverse();
        await Promise.all(meses.map(leerCarton));
    } catch (error) {
        console.error('No se pudo cargar el historial del bingo:', error);
        contenedor.replaceChildren(el('p', { class: 'bingo-vacio', text: 'No se ha podido cargar. Revisa la conexión.' }));
        return;
    }
    if (panel.vista !== 'historial') return; // se cambió de vista mientras cargaba

    const conCarton = meses.filter((m) => cartones.get(m));
    if (conCarton.length === 0) {
        contenedor.replaceChildren(el('p', { class: 'bingo-vacio', text: 'Todavía no tienes cartones de otros meses.' }));
        return;
    }
    contenedor.replaceChildren(el('ul', { class: 'bingo-meses' }, ...conCarton.map((mes) => {
        const carton = cartones.get(mes);
        const r = resumen(carton, progresos.get(mes).casillas);
        const estado = r.completo ? 'completo' : r.lineas ? 'con línea' : 'a medias';
        return el('li', {}, el('button', {
            type: 'button', class: 'bingo-mes',
            onclick: () => abrirVista('carton', { mes, desdeHistorial: true, volverA: 'historial' }),
        },
        el('span', { class: 'bingo-mes-nombre', text: mayuscula(nombreMes(mes, { conAnio: true })) }),
        el('span', { class: 'bingo-mes-estado', text: `${r.marcadas}/${r.total} · ${estado}` })));
    })));
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/**
 * Carga el cartón del mes y pinta el bloque. Llamar una vez, con la sesión
 * ya confirmada.
 * @param {{uid: string, libros: function(): (object[]|null)}} opciones
 *     libros devuelve la biblioteca propia, o null si aún no ha cargado.
 */
export async function iniciarBingo(opciones) {
    uid = opciones.uid;
    leerLibros = opciones.libros;
    document.getElementById('bingo-btn')?.addEventListener('click', () => abrirPanel());

    const ahora = new Date();
    const mes = mesDe(ahora);
    const previo = mesAnterior(mes);
    try {
        const [actual, anterior] = await Promise.all([
            leerCarton(mes),
            mirarMesAnterior(ahora) ? leerCarton(previo) : null,
        ]);
        const progresoAnterior = anterior && estaAbierto(anterior, ahora) ? await leerProgreso(previo) : null;
        const elegidos = elegirCartones({ actual, anterior, progresoAnterior, ahora });
        if (elegidos.principal) await leerProgreso(elegidos.principal.mes);
        // Solo ahora, con el progreso ya en memoria: mientras tanto, el
        // onSnapshot de libros puede llamar a bingoEnVistaDeAmiga() y pintar.
        ({ principal, gracia } = elegidos);
    } catch (error) {
        // Sin red o sin permisos: sin bloque. No es un fallo de la biblioteca.
        console.warn('No se pudo cargar el bingo:', error);
        principal = null;
        gracia = null;
    }
    pintarBloque();
}

/**
 * Al mirar la biblioteca de una amiga, el bloque se esconde: es el tuyo.
 * Se llama desde el onSnapshot de libros: si algo del bingo falla, no puede
 * llevarse por delante el pintado de la biblioteca.
 */
export function bingoEnVistaDeAmiga(si) {
    enVistaDeAmiga = si;
    try {
        pintarBloque();
    } catch (error) {
        console.error('No se pudo pintar el bloque del bingo:', error);
    }
}
