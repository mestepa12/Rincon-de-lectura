// Pruebas del plan de aislamiento para capturar tarjetas (captura-aislada.js).
// Runner de Node (node:test), sin dependencias nuevas:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';

import { esDialogoModal, planDeAislamiento } from '../captura-aislada.js';

// ---------------------------------------------------------------------------
// Dobles de prueba: lo justo de la API de Element que usa el módulo.
// `modal` imita :modal, que solo es cierto para los diálogos del top layer.
// ---------------------------------------------------------------------------

const elemento = (id, { tag = 'DIV', hijos = [], abierto = false, modal = false } = {}) => {
    const el = {
        id,
        tagName: tag,
        hijos,
        abierto,
        contains(otro) {
            return otro === el || hijos.some((h) => h.contains(otro));
        },
        matches(selector) {
            if (selector === ':modal') return modal;
            return selector.toUpperCase() === tag;
        },
    };
    return el;
};

const tarjeta = elemento('export-stats-card');
const dialogoModal = (id) => elemento(id, { tag: 'DIALOG', abierto: true, modal: true });

// ---------------------------------------------------------------------------
// esDialogoModal
// ---------------------------------------------------------------------------

test('un diálogo abierto con showModal cuenta como modal', () => {
    assert.equal(esDialogoModal(dialogoModal('stats-modal')), true);
});

test('un diálogo abierto como NO modal no cuenta', () => {
    // Es justo el estado en el que quedaba tras la captura: con el atributo
    // open puesto pero fuera del top layer. No hay que reabrirlo como modal.
    const suelto = elemento('stats-modal', { tag: 'DIALOG', abierto: true, modal: false });
    assert.equal(esDialogoModal(suelto), false);
});

test('un diálogo cerrado no cuenta', () => {
    assert.equal(esDialogoModal(elemento('add-book-modal', { tag: 'DIALOG' })), false);
});

test('lo que no es un diálogo no cuenta', () => {
    assert.equal(esDialogoModal(elemento('main', { tag: 'MAIN' })), false);
});

// ---------------------------------------------------------------------------
// planDeAislamiento
// ---------------------------------------------------------------------------

test('los ancestros de la tarjeta se quedan montados', () => {
    const contenedor = elemento('export-stats-card-wrap', { hijos: [tarjeta] });
    const plan = planDeAislamiento([contenedor, elemento('main', { tag: 'MAIN' })], tarjeta);
    assert.deepEqual(plan.map((p) => p.el.id), ['main']);
});

test('la propia tarjeta se queda montada', () => {
    const plan = planDeAislamiento([tarjeta, elemento('header', { tag: 'HEADER' })], tarjeta);
    assert.deepEqual(plan.map((p) => p.el.id), ['header']);
});

test('un diálogo modal se desmonta y queda marcado para reabrirlo', () => {
    const plan = planDeAislamiento([dialogoModal('stats-modal'), tarjeta], tarjeta);
    assert.deepEqual(plan, [{ el: plan[0].el, eraModal: true }]);
    assert.equal(plan[0].el.id, 'stats-modal');
});

test('los dos diálogos del caso de producción se marcan los dos', () => {
    // La ficha del libro quedó abierta al compartir la reseña y estadísticas
    // se abre encima: al capturar, los dos tienen que volver como modales.
    const plan = planDeAislamiento(
        [dialogoModal('book-detail-modal'), dialogoModal('stats-modal'), tarjeta],
        tarjeta,
    );
    assert.deepEqual(plan.map((p) => [p.el.id, p.eraModal]), [
        ['book-detail-modal', true],
        ['stats-modal', true],
    ]);
});

test('lo que no es un diálogo se desmonta sin marcar', () => {
    const plan = planDeAislamiento([elemento('main', { tag: 'MAIN' }), tarjeta], tarjeta);
    assert.deepEqual(plan.map((p) => p.eraModal), [false]);
});

test('el plan respeta el orden del body', () => {
    const plan = planDeAislamiento(
        [elemento('header', { tag: 'HEADER' }), tarjeta, dialogoModal('stats-modal')],
        tarjeta,
    );
    assert.deepEqual(plan.map((p) => p.el.id), ['header', 'stats-modal']);
});

test('sin nada que desmontar, plan vacío', () => {
    assert.deepEqual(planDeAislamiento([tarjeta], tarjeta), []);
    assert.deepEqual(planDeAislamiento([], tarjeta), []);
});
