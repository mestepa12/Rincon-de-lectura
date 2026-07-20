// Notificaciones tipo toast que sustituyen a alert().
// Uso: notify(mensaje, tipo) con tipo 'success' | 'error' | 'warning' | 'info'.
// El contenedor usa el Popover API (popover="manual") para pintarse en el
// top layer: así los avisos se ven por encima de los <dialog> abiertos,
// que es donde saltan la mayoría (formularios, amigos, importación...).

const ICONS = { success: '✓', error: '✕', warning: '!', info: 'i' };
const DURATION_MS = { success: 4000, info: 5000, warning: 6000, error: 7000 };

let container = null;

const getContainer = () => {
    if (!container || !document.body.contains(container)) {
        container = document.createElement('div');
        container.className = 'notify-container';
        if ('showPopover' in container) container.setAttribute('popover', 'manual');
        document.body.appendChild(container);
    }
    if (container.hasAttribute('popover') && !container.matches(':popover-open')) {
        try { container.showPopover(); } catch { /* ya abierto o no soportado */ }
    }
    return container;
};

export function notify(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `notify-toast notify-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'notify-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = ICONS[type] || ICONS.info;

    const text = document.createElement('div');
    text.className = 'notify-text';
    text.textContent = message; // los \n se respetan con white-space: pre-line

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'notify-close';
    close.setAttribute('aria-label', 'Cerrar aviso');
    close.textContent = '×';

    toast.append(icon, text, close);
    getContainer().appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('notify-visible'));

    const hide = () => {
        clearTimeout(timer);
        toast.classList.remove('notify-visible');
        setTimeout(() => toast.remove(), 350);
    };
    const timer = setTimeout(hide, DURATION_MS[type] || DURATION_MS.info);
    close.addEventListener('click', hide);
    return hide;
}

// Crea un <dialog> efímero con la estética de la web. Se destruye al cerrarse,
// así funciona en cualquier página sin tocar el HTML. showModal() lo pinta en
// el top layer, por encima de otros modales abiertos (detalle de libro, etc.).
const buildDialog = ({ title, message, danger }) => {
    const dialog = document.createElement('dialog');
    dialog.className = `app-dialog${danger ? ' app-dialog-danger' : ''}`;

    if (title) {
        const h = document.createElement('h2');
        h.className = 'app-dialog-title';
        h.textContent = title;
        dialog.appendChild(h);
    }
    if (message) {
        const p = document.createElement('p');
        p.className = 'app-dialog-text';
        p.textContent = message; // los \n se respetan con white-space: pre-line
        dialog.appendChild(p);
    }

    const actions = document.createElement('div');
    actions.className = 'app-dialog-actions';
    dialog.appendChild(actions);

    // Clic fuera del diálogo (en el backdrop) lo cierra como cancelación.
    dialog.addEventListener('click', (e) => {
        const r = dialog.getBoundingClientRect();
        const fuera = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (fuera) dialog.close();
    });

    dialog.addEventListener('close', () => dialog.remove());
    return { dialog, actions };
};

const makeButton = (text, className) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    return btn;
};

// Sustituto de confirm(): resuelve true/false. ESC o clic fuera cuentan como "no".
export function confirmDialog({ title = '¿Seguro?', message = '', confirmText = 'Aceptar', cancelText = 'Cancelar', danger = false } = {}) {
    return new Promise((resolve) => {
        const { dialog, actions } = buildDialog({ title, message, danger });

        const confirmBtn = makeButton(confirmText, 'app-dialog-confirm');
        const cancelBtn = makeButton(cancelText, 'app-dialog-cancel');
        actions.append(confirmBtn, cancelBtn);

        let result = false;
        confirmBtn.addEventListener('click', () => { result = true; dialog.close(); });
        cancelBtn.addEventListener('click', () => dialog.close());
        dialog.addEventListener('cancel', () => { result = false; });
        dialog.addEventListener('close', () => resolve(result), { once: true });

        document.body.appendChild(dialog);
        dialog.showModal();
        // En acciones destructivas el foco arranca en "Cancelar" para evitar
        // confirmar sin querer con Enter.
        (danger ? cancelBtn : confirmBtn).focus();
    });
}

// Sustituto de prompt(): resuelve el texto introducido, o null si se cancela.
export function promptDialog({ title = '', message = '', value = '', placeholder = '', confirmText = 'Aceptar', cancelText = 'Cancelar' } = {}) {
    return new Promise((resolve) => {
        const { dialog, actions } = buildDialog({ title, message, danger: false });

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'app-dialog-input';
        input.value = value;
        input.placeholder = placeholder;
        dialog.insertBefore(input, actions);

        const confirmBtn = makeButton(confirmText, 'app-dialog-confirm');
        const cancelBtn = makeButton(cancelText, 'app-dialog-cancel');
        actions.append(confirmBtn, cancelBtn);

        let result = null;
        const accept = () => { result = input.value; dialog.close(); };
        confirmBtn.addEventListener('click', accept);
        cancelBtn.addEventListener('click', () => dialog.close());
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); accept(); } });
        dialog.addEventListener('cancel', () => { result = null; });
        dialog.addEventListener('close', () => resolve(result), { once: true });

        document.body.appendChild(dialog);
        dialog.showModal();
        input.focus();
        input.select();
    });
}
