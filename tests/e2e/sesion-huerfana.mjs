// La barra del reproductor siempre se puede cerrar.
//
// Con los emuladores y el dev server en marcha:
//   npm run dev:emu          (en otra terminal)
//   npm run emu:semilla      (la primera vez)
//   node tests/e2e/sesion-huerfana.mjs
//
// Reproduce el fallo de producción: una usuaria con la barra del reproductor
// minimizada marcando 42:57:17 y el libro de esa sesión en la papelera. Con el
// fallo, el ⏹ se escondía (pintarReproductor hacía `hidden = !book`), el clic
// en la barra no abría nada y Guardar hacía un `return` mudo, así que no había
// ningún camino en la interfaz para soltar la sesión. Y aunque lo hubiera
// habido, 2577 minutos pasan del tope de 1440 de las reglas, así que el create
// se habría rechazado igualmente.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const APP = 'http://localhost:5173';
const CUENTA = { email: 'ana@prueba.test', password: 'prueba1234' };
const CLAVE = 'rincon_session_v1';

// El cronómetro exacto del caso real.
const MS_PRODUCCION = (42 * 3600 + 57 * 60 + 17) * 1000;

const fallos = [];
const errores = [];
const comprobar = (ok, texto) => {
    console.log(`  ${ok ? '✓' : '✗'} ${texto}`);
    if (!ok) fallos.push(texto);
};

/**
 * Deja una sesión activa a medida en localStorage y recarga, que es como
 * llega la usuaria: la sesión sobrevive a cerrar la PWA.
 * @param {object} page Página de Playwright.
 * @param {object} sesion Contenido de la clave.
 * @return {Promise<void>}
 */
const plantarSesion = async (page, sesion) => {
    await page.evaluate(([clave, valor]) => {
        localStorage.setItem(clave, JSON.stringify(valor));
    }, [CLAVE, sesion]);
    await page.reload();
    await page.waitForSelector('.book', { timeout: 20000 });
};

/** @return {Promise<?object>} La sesión que hay guardada, o null. */
const sesionGuardada = (page) => page.evaluate((clave) => {
    const bruto = localStorage.getItem(clave);
    try { return bruto ? JSON.parse(bruto) : null; } catch { return bruto; }
}, CLAVE);

/** @return {Promise<boolean>} ¿La barra del reproductor está a la vista? */
const barraVisible = (page) => page.evaluate(() => {
    const pill = document.getElementById('session-pill');
    return !!pill && !pill.hidden && getComputedStyle(pill).display !== 'none';
});

/**
 * Saca un libro de la papelera por la interfaz. El id se conserva al
 * restaurar, así que el resto de la prueba puede seguir usándolo.
 * @param {object} page Página de Playwright.
 * @param {string} titulo Título del libro a restaurar.
 * @return {Promise<void>}
 */
const restaurarDeLaPapelera = async (page, titulo) => {
    await page.evaluate(() => document.getElementById('papelera-btn').click());
    await page.waitForSelector('#papelera-modal[open]', { timeout: 10000 });
    await page.evaluate((t) => {
        const fila = [...document.querySelectorAll('#papelera-lista > *')]
            .find((f) => (f.textContent || '').includes(t));
        fila?.querySelector('.papelera-restaurar')?.click();
    }, titulo);
    await page.waitForTimeout(1500);
    await page.click('#close-papelera-btn');
    await page.waitForTimeout(300);
};

/** @return {Promise<?string>} Título del diálogo de encima, o null. */
const dialogoAbierto = (page) => page.evaluate(() => {
    const d = [...document.querySelectorAll('dialog.app-dialog[open]')].pop();
    return d ? (d.querySelector('.app-dialog-title')?.textContent || '') : null;
});

/**
 * Pulsa un botón del diálogo efímero de notify.js.
 * @param {object} page Página de Playwright.
 * @param {string} cual 'confirm' o 'cancel'.
 * @return {Promise<void>}
 */
const pulsarEnDialogo = async (page, cual) => {
    await page.click(`dialog.app-dialog[open] .app-dialog-${cual}`);
    await page.waitForTimeout(400);
};

// Los emuladores se leen por REST con el token "owner", que se salta las
// reglas. Es la forma de comprobar lo que se escribió de verdad sin montar
// otro cliente de Firebase dentro de la página.
const PROYECTO = 'mi-rincon-de-lectura';
const FIRESTORE = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const COMO_DUENO = { headers: { Authorization: 'Bearer owner' } };

/** @return {Promise<?string>} Uid de la cuenta de pruebas en el emulador. */
const uidDePruebas = async () => {
    const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROYECTO}/accounts:query`, {
        method: 'POST',
        headers: { ...COMO_DUENO.headers, 'Content-Type': 'application/json' },
        body: '{}',
    });
    if (!r.ok) return null;
    const { userInfo = [] } = await r.json();
    return userInfo.find((u) => u.email === CUENTA.email)?.localId || null;
};

/**
 * Sesiones escritas en Firestore, resumidas como "95min/<bookId>".
 * @param {string} uid Cuenta a mirar.
 * @return {Promise<string[]>}
 */
const sesionesEnFirestore = async (uid) => {
    const r = await fetch(`${FIRESTORE}/v1/projects/${PROYECTO}/databases/(default)/documents/users/${uid}/sessions`, COMO_DUENO);
    if (!r.ok) return [];
    const { documents = [] } = await r.json();
    return documents.map((d) => {
        const f = d.fields || {};
        return `${f.durationMin?.integerValue ?? f.durationMin?.doubleValue}min/${f.bookId?.stringValue}`;
    });
};

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
// Los cortes de red los provoca la propia prueba (setOffline), así que no
// cuentan como errores: lo que se vigila es que no salte nada más.
const RUIDO_ESPERADO = /ERR_INTERNET_DISCONNECTED|net::ERR_FAILED/;
page.on('console', (m) => { if (m.type() === 'error' && !RUIDO_ESPERADO.test(m.text())) errores.push(m.text()); });
page.on('pageerror', (e) => errores.push(e.message));

await page.goto(`${APP}/login.html`);
await page.fill('#email', CUENTA.email);
await page.fill('#password', CUENTA.password);
await page.click('#login-form button[type=submit]');
await page.waitForURL(/biblioteca/, { timeout: 20000 });
await page.waitForSelector('.book', { timeout: 20000 });

// El libro de la semilla que está en "Leyendo ahora".
const libro = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.book')]
        .find((b) => /Dune/i.test(b.textContent || ''));
    return el ? { id: el.dataset.id, titulo: 'Dune' } : null;
});
if (!libro) {
    console.log('  ✗ no está el libro de la semilla ("Dune" en Leyendo ahora)');
    await browser.close();
    process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. El caso de producción: más de 24 h y el libro en la papelera.
// ---------------------------------------------------------------------------
console.log('\n▶ Sesión de 42:57:17 con el libro borrado\n');

// Primero, la sesión con el libro todavía en su sitio.
await plantarSesion(page, {
    bookId: libro.id,
    startAt: Date.now() - MS_PRODUCCION,
    startPage: 245,
});

comprobar(await barraVisible(page), 'la barra del reproductor está a la vista');
const marcado = await page.textContent('#reproductor-tiempo');
comprobar(/^42:5[67]:/.test(marcado || ''), `el contador marca 42:57:xx (marca "${marcado}")`);

// Ahora se borra el libro, que es lo que hizo la usuaria.
await page.click(`.book[data-id="${libro.id}"]`);
await page.waitForSelector('#book-detail-modal[open]', { timeout: 10000 });
await page.click('#delete-book-modal-btn');
await page.waitForSelector('dialog.app-dialog[open] .app-dialog-input', { timeout: 10000 });

const detalles = await page.evaluate(() => [...document.querySelectorAll('dialog.app-dialog[open] .app-dialog-detalles li')].map((li) => li.textContent));
comprobar(detalles.some((d) => /sesión de lectura en curso/i.test(d)),
    `el diálogo de borrar avisa de la sesión en curso (detalles: ${detalles.join(' | ') || 'ninguno'})`);

await page.fill('dialog.app-dialog[open] .app-dialog-input', libro.titulo);
await pulsarEnDialogo(page, 'confirm');
await page.waitForTimeout(1500);

comprobar(!(await barraVisible(page)), 'al borrar el libro la barra desaparece');
comprobar((await sesionGuardada(page)) === null, 'y la sesión ya no está en localStorage');

// ---------------------------------------------------------------------------
// 2. El estado heredado: sesión que apunta a un libro que ya no existe.
//    Es donde se quedó atascada la usuaria, así que hay que poder salir.
// ---------------------------------------------------------------------------
console.log('\n▶ Sesión huérfana: el bookId ya no está en la biblioteca\n');

await plantarSesion(page, {
    bookId: 'libro-fantasma',
    startAt: Date.now() - MS_PRODUCCION,
    startPage: 0,
});
await page.waitForTimeout(1500);   // que llegue el snapshot de /books

comprobar(await barraVisible(page), 'la barra se pinta igual, sin libro');
comprobar(await page.isVisible('#reproductor-terminar'),
    'el ⏹ sigue visible aunque falte el libro (con el fallo se escondía)');
comprobar(await page.isVisible('#reproductor-descartar'),
    'el ✕ de descartar está siempre');
comprobar(/no disponible/i.test(await page.textContent('#reproductor-titulo') || ''),
    'la barra dice que el libro no está disponible');

// Al cargar ya se avisa solo, sin tener que pulsar nada.
const avisoAlCargar = await dialogoAbierto(page);
comprobar(/ya no está/i.test(avisoAlCargar || ''),
    `avisa al cargar de que el libro ya no está (diálogo: ${avisoAlCargar || 'ninguno'})`);
await pulsarEnDialogo(page, 'cancel');   // "Ahora no": la barra debe seguir ahí
comprobar(await barraVisible(page), 'si dice "ahora no", la sesión sigue ahí');

// El ⏹ tiene que llevar al mismo aviso, no morir en silencio.
await page.click('#reproductor-terminar');
await page.waitForTimeout(500);
const avisoAlPulsar = await dialogoAbierto(page);
comprobar(/ya no está/i.test(avisoAlPulsar || ''),
    `el ⏹ abre el aviso en vez de no hacer nada (diálogo: ${avisoAlPulsar || 'ninguno'})`);
await pulsarEnDialogo(page, 'confirm');   // "Descartar la sesión"

comprobar(!(await barraVisible(page)), 'descartar quita la barra');
comprobar((await sesionGuardada(page)) === null, 'y borra la clave de localStorage');
comprobar(!errores.some((e) => /PERMISSION_DENIED|permission-denied/i.test(e)),
    'sin rechazos de las reglas por el camino');

// ---------------------------------------------------------------------------
// 3. El ✕ es la salida de emergencia: no depende de nada.
// ---------------------------------------------------------------------------
console.log('\n▶ El ✕ descarta pase lo que pase (también sin red)\n');

await plantarSesion(page, {
    bookId: 'otro-fantasma',
    startAt: Date.now() - MS_PRODUCCION,
    startPage: 0,
});
await page.waitForTimeout(1200);
if (await dialogoAbierto(page)) await pulsarEnDialogo(page, 'cancel');

await page.context().setOffline(true);
await page.click('#reproductor-descartar');
await page.waitForTimeout(400);
const confirmacion = await dialogoAbierto(page);
comprobar(/descartar/i.test(confirmacion || ''),
    `el ✕ pide confirmación antes de tirar la sesión (diálogo: ${confirmacion || 'ninguno'})`);
await pulsarEnDialogo(page, 'confirm');
comprobar(!(await barraVisible(page)), 'descarta sin red: no toca Firestore');
comprobar((await sesionGuardada(page)) === null, 'la clave se borra sin red');
await page.context().setOffline(false);

// ---------------------------------------------------------------------------
// 4. Por encima del umbral con el libro delante: se pregunta, no se rechaza.
// ---------------------------------------------------------------------------
console.log('\n▶ Sesión de 9 h sobre un libro que sí existe\n');

// El libro de la semilla volvió a la papelera en el paso 1: se restaura, que
// además comprueba que el id sobrevive al viaje de ida y vuelta.
await page.reload();
await page.waitForSelector('.book', { timeout: 20000 });
await restaurarDeLaPapelera(page, libro.titulo);
const otroLibro = await page.evaluate((id) => {
    const el = document.querySelector(`.book[data-id="${id}"]`);
    return el ? el.dataset.id : null;
}, libro.id);
comprobar(otroLibro === libro.id, 'el libro vuelve de la papelera con el mismo id');
if (!otroLibro) {
    comprobar(false, 'sin libro en "Leyendo ahora" no se puede seguir');
} else {
    await plantarSesion(page, {
        bookId: otroLibro,
        startAt: Date.now() - 9 * 3600 * 1000,
        startPage: 88,
    });
    await page.waitForTimeout(1200);

    await page.click('#reproductor-terminar');
    await page.waitForTimeout(800);
    const pregunta = await dialogoAbierto(page);
    comprobar(/cuánto tiempo anotamos/i.test(pregunta || ''),
        `pide confirmar el tiempo (diálogo: ${pregunta || 'ninguno'})`);

    const textoPregunta = await page.textContent('dialog.app-dialog[open] .app-dialog-text');
    comprobar(!/de verdad|se quedó abierto|mal/i.test(textoPregunta || ''),
        `el texto no da por hecho que hizo algo mal (texto: "${(textoPregunta || '').slice(0, 90)}…")`);

    // Quien lee nueve horas seguidas confirma sus 540 de una pulsación: el
    // valor de partida es el tiempo real, no uno inventado.
    const porDefecto = await page.inputValue('dialog.app-dialog[open] .app-dialog-input');
    comprobar(porDefecto === '540', `propone los 540 minutos del cronómetro (propone "${porDefecto}")`);

    // Un valor imposible no se recorta en silencio: se vuelve a preguntar.
    await page.fill('dialog.app-dialog[open] .app-dialog-input', '99999');
    await pulsarEnDialogo(page, 'confirm');
    const reintento = await dialogoAbierto(page);
    comprobar(/cuánto tiempo anotamos/i.test(reintento || ''),
        `un valor imposible se vuelve a preguntar (diálogo: ${reintento || 'ninguno'})`);

    // Y se confirman los 540 tal cual, que es lo que de verdad leyó.
    await page.fill('dialog.app-dialog[open] .app-dialog-input', '540');
    await pulsarEnDialogo(page, 'confirm');
    await page.waitForSelector('#session-end-form', { state: 'visible', timeout: 10000 });
    comprobar(true, 'tras confirmar se abre el formulario de página final');

    await page.fill('#session-end-page', '120');
    await page.click('#session-save-btn');
    await page.waitForTimeout(2500);

    comprobar(!(await barraVisible(page)), 'guardar cierra la barra');
    comprobar((await sesionGuardada(page)) === null, 'y suelta la sesión local');
    comprobar(!errores.some((e) => /PERMISSION_DENIED|permission-denied/i.test(e)),
        'la sesión de 540 minutos no la rechazan las reglas');

    const uid = await uidDePruebas();
    if (!uid) {
        comprobar(false, 'no se pudo leer el uid del emulador de Auth');
    } else {
        const enFirestore = await sesionesEnFirestore(uid);
        comprobar(enFirestore.some((s) => s.startsWith('540min/')),
            `se guardaron las 9 horas enteras (guardado: ${enFirestore.join(', ') || 'nada'})`);
    }
}

// ---------------------------------------------------------------------------
// 5. Mover el libro fuera de "Leyendo ahora" no deja la sesión sin sitio.
// ---------------------------------------------------------------------------
console.log('\n▶ Mover el libro fuera de "Leyendo ahora" con la sesión en curso\n');

await page.reload();
await page.waitForSelector('.book', { timeout: 20000 });
const paraMover = await page.evaluate((id) => {
    const el = document.querySelector(`.book[data-id="${id}"]`);
    return el && /página \d+ de/i.test(el.textContent || '') ? el.dataset.id : null;
}, libro.id);
if (!paraMover) {
    comprobar(false, 'el libro restaurado no está en "Leyendo ahora"');
} else {
    await plantarSesion(page, {
        bookId: paraMover,
        startAt: Date.now() - 30 * 60 * 1000,
        startPage: 88,
    });
    await page.waitForTimeout(1200);

    await page.click(`.book[data-id="${paraMover}"]`);
    await page.waitForSelector('#book-detail-modal[open]', { timeout: 10000 });
    await page.selectOption('#move-book-select', 'libros-abandonados');
    await page.click('#save-details-btn');
    await page.waitForTimeout(600);

    const avisoMover = await dialogoAbierto(page);
    comprobar(/sesión en curso/i.test(avisoMover || ''),
        `avisa antes de mover el libro (diálogo: ${avisoMover || 'ninguno'})`);
    await pulsarEnDialogo(page, 'confirm');
    await page.waitForTimeout(2000);

    comprobar(!(await barraVisible(page)), 'al mover el libro la barra desaparece');
    comprobar((await sesionGuardada(page)) === null, 'y la sesión se descarta');
}

// ---------------------------------------------------------------------------
// 6. Una sesión corrupta no puede pintar un contador en NaN.
// ---------------------------------------------------------------------------
console.log('\n▶ Sesión corrupta en localStorage\n');

await plantarSesion(page, { bookId: libro.id });   // sin startAt
await page.waitForTimeout(800);
comprobar(!(await barraVisible(page)), 'una sesión sin startAt no pinta barra');
comprobar((await sesionGuardada(page)) === null, 'y la clave inservible se limpia sola');

await page.evaluate((clave) => localStorage.setItem(clave, '{roto'), CLAVE);
await page.reload();
await page.waitForSelector('.book', { timeout: 20000 });
comprobar(!(await barraVisible(page)), 'un JSON roto tampoco pinta barra');

comprobar(!errores.some((e) => /NaN/.test(e)), 'sin NaN por consola');

// Dejar la semilla como estaba: el libro vuelve a "Leyendo ahora" con su
// página, para que la prueba se pueda repetir sin volver a sembrar.
await page.evaluate(async ([proyecto, id]) => {
    await fetch(`http://127.0.0.1:8080/v1/projects/${proyecto}/databases/(default)/documents/books/${id}?updateMask.fieldPaths=section&updateMask.fieldPaths=currentPage`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {
            section: { stringValue: 'leyendo-ahora' },
            currentPage: { integerValue: '245' },
        } }),
    });
}, [PROYECTO, libro.id]);

await browser.close();
if (errores.length) console.log(`\n  errores de consola:\n${errores.map((e) => `    ${e}`).join('\n')}`);
console.log(`\n  ${fallos.length === 0 ? 'TODO OK' : `${fallos.length} FALLOS`}\n`);
process.exit(fallos.length === 0 ? 0 : 1);
