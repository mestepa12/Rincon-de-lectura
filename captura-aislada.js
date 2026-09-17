// Qué se desmonta del body para capturar una tarjeta con html2canvas y qué
// hay que volver a abrir al restaurarlo.
//
// Este módulo NO toca el DOM ni html2canvas a propósito: recibe elementos y
// devuelve decisiones, así que se puede probar solo
// (tests/captura-aislada.test.mjs). El desmontaje y el restaurado siguen en
// renderTarjetaAislada, en script.js.

/**
 * ¿Es un <dialog> abierto con showModal(), es decir, pintado en el top
 * layer del navegador?
 *
 * Importa porque al desmontar un diálogo así, el navegador lo saca del top
 * layer pero le deja puesto el atributo open. Al devolverlo al DOM queda
 * abierto como NO modal: invisible para quien mira (se coloca en el flujo
 * de la página) y con showModal() lanzando InvalidStateError.
 * @param {Element} el Elemento a examinar.
 * @return {boolean} true si es un diálogo modal.
 */
export const esDialogoModal = (el) =>
    el.tagName === 'DIALOG' && typeof el.matches === 'function' && el.matches(':modal');

/**
 * Hijos del body que estorban a la captura, cada uno con la nota de si era
 * un diálogo modal y hay que volver a abrirlo después.
 *
 * Los que contienen la tarjeta se quedan: son sus ancestros.
 * @param {Element[]} hijos Hijos del body, en orden.
 * @param {Element} tarjeta Tarjeta que se va a capturar.
 * @return {{el: Element, eraModal: boolean}[]} Plan de desmontaje.
 */
export const planDeAislamiento = (hijos, tarjeta) => hijos
    .filter((el) => !el.contains(tarjeta))
    .map((el) => ({ el, eraModal: esDialogoModal(el) }));
