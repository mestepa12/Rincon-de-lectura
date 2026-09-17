// Los diálogos sobreviven a una captura de imagen.
//
// Con los emuladores y el dev server en marcha:
//   npm run dev:emu          (en otra terminal)
//   npm run emu:semilla      (la primera vez)
//   node tests/e2e/dialogos-compartir.mjs
//
// Reproduce el fallo de producción: al compartir, html2canvas obliga a
// desmontar el body para no tumbar iOS (ver renderTarjetaAislada), y un
// <dialog> modal desmontado pierde el top layer pero conserva el atributo
// open: vuelve como diálogo NO modal —invisible, porque se coloca en el
// flujo de la página— y el siguiente showModal() lanza InvalidStateError.
//
// Con el fallo, además, la barra de navegación sigue respondiendo aunque
// haya un diálogo "abierto": así es como se llegaba a tener dos a la vez.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const APP = 'http://localhost:5173';
const CUENTA = { email: 'ana@prueba.test', password: 'prueba1234' };

const fallos = [];
const errores = [];
const comprobar = (ok, texto) => {
    console.log(`  ${ok ? '✓' : '✗'} ${texto}`);
    if (!ok) fallos.push(texto);
};

/** @return {Promise<{abiertos: string[], modales: string[]}>} Estado de los diálogos. */
const estadoDialogos = (page) => page.evaluate(() => ({
    abiertos: [...document.querySelectorAll('dialog[open]')].map((d) => `#${d.id}`),
    modales: [...document.querySelectorAll('dialog')].filter((d) => d.matches(':modal')).map((d) => `#${d.id}`),
}));

/**
 * Espera a que termine la captura. Las tarjetas empiezan ocultas, así que
 * primero hay que ver que se muestran: si no, la espera termina sola antes
 * de que la captura haya empezado siquiera.
 */
const esperarCaptura = async (page, idTarjeta) => {
    await page.waitForFunction(
        (id) => getComputedStyle(document.getElementById(id)).display !== 'none',
        idTarjeta, { timeout: 30000 },
    );
    await page.waitForFunction(
        (id) => getComputedStyle(document.getElementById(id)).display === 'none',
        idTarjeta, { timeout: 60000 },
    );
};

/**
 * Diálogo que está encima del todo, mirando qué responde en el centro de la
 * pantalla: el top layer es una pila y los diálogos van centrados, así que
 * el que conteste ahí es el de arriba.
 * @return {Promise<?string>} Id del diálogo, o null si no hay ninguno.
 */
const dialogoEncima = (page) => page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const dialogo = el?.closest('dialog');
    return dialogo ? `#${dialogo.id}` : null;
});

/** @return {Promise<boolean>} ¿Llega el clic, o lo tapa un diálogo modal? */
const sePuedePulsar = async (page, selector) => {
    try {
        await page.click(selector, { timeout: 3000 });
        return true;
    } catch {
        return false;
    }
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
page.on('pageerror', (e) => errores.push(e.message));

await page.goto(`${APP}/login.html`);
await page.fill('#email', CUENTA.email);
await page.fill('#password', CUENTA.password);
await page.click('#login-form button[type=submit]');
await page.waitForURL(/biblioteca/, { timeout: 20000 });
await page.waitForSelector('.book', { timeout: 20000 });

// ---------------------------------------------------------------------------
// 1. Estadísticas: abrir → compartir → cerrar → volver a abrir
// ---------------------------------------------------------------------------
console.log('\n▶ Estadísticas: abrir → compartir → cerrar → volver a abrir\n');

await page.click('#stats-btn');
await page.waitForSelector('#stats-modal[open]', { timeout: 10000 });
comprobar((await estadoDialogos(page)).modales.includes('#stats-modal'), 'se abre como diálogo modal');

await page.click('#share-stats-btn');
await esperarCaptura(page, 'export-stats-card');
const trasCompartir = await estadoDialogos(page);
comprobar(trasCompartir.modales.includes('#stats-modal'),
    `sigue siendo modal tras compartir (abiertos: ${trasCompartir.abiertos.join(', ') || 'ninguno'}; modales: ${trasCompartir.modales.join(', ') || 'ninguno'})`);

await page.click('#close-stats-btn');
await page.waitForTimeout(500);
const trasCerrar = await estadoDialogos(page);
comprobar(trasCerrar.abiertos.length === 0,
    `no queda ningún diálogo con open tras cerrar (abiertos: ${trasCerrar.abiertos.join(', ') || 'ninguno'})`);

await page.click('#stats-btn');
await page.waitForTimeout(500);
comprobar((await estadoDialogos(page)).modales.includes('#stats-modal'), 'se vuelve a abrir como modal');
await page.click('#close-stats-btn');
await page.waitForTimeout(300);

// ---------------------------------------------------------------------------
// 2. Ficha del libro: compartir la reseña no puede dejarla enganchada, ni
//    permitir que se abra estadísticas encima (así aparecían dos diálogos
//    con open en producción).
// ---------------------------------------------------------------------------
console.log('\n▶ Ficha del libro: compartir la reseña y abrir estadísticas\n');

await page.locator('.book').first().click();
await page.waitForSelector('#book-detail-modal[open]', { timeout: 10000 });
await page.click('#share-ig-btn');
await esperarCaptura(page, 'export-card');
const trasResena = await estadoDialogos(page);
comprobar(trasResena.modales.includes('#book-detail-modal'),
    `la ficha sigue siendo modal tras compartir la reseña (abiertos: ${trasResena.abiertos.join(', ') || 'ninguno'}; modales: ${trasResena.modales.join(', ') || 'ninguno'})`);

// Con la ficha abierta, la barra de navegación tiene que estar tapada.
const llegoElClic = await sePuedePulsar(page, '#stats-btn');
if (llegoElClic) await page.waitForTimeout(500);
const acumulados = await estadoDialogos(page);
comprobar(!llegoElClic,
    `la barra no responde con la ficha abierta (abiertos: ${acumulados.abiertos.join(', ') || 'ninguno'})`);
comprobar(acumulados.abiertos.length <= 1,
    `no se acumulan diálogos con open (abiertos: ${acumulados.abiertos.join(', ') || 'ninguno'})`);

// sePuedePulsar y no click: con el fallo, el diálogo enganchado tapa el
// botón de cerrar y el clic nunca llega. Interesa el informe, no un crash.
const cerroLaFicha = await sePuedePulsar(page, '#cancel-detail-modal');
await page.waitForTimeout(500);
comprobar(cerroLaFicha && (await estadoDialogos(page)).abiertos.length === 0, 'la ficha se cierra del todo');

// ---------------------------------------------------------------------------
// 3. Dos modales apilados: el top layer es una pila, así que el orden en que
//    se vuelven a abrir decide cuál queda encima.
// ---------------------------------------------------------------------------
console.log('\n▶ Dos modales apilados: estadísticas tiene que quedar sobre la ficha\n');

await page.locator('.book').first().click();
await page.waitForSelector('#book-detail-modal[open]', { timeout: 10000 });
// Por la barra ya no se puede abrir estadísticas encima (la tapa el modal de
// la ficha, que es justo el arreglo), así que se apila por código: el estado
// resultante es el mismo que veía la usuaria con el fallo.
await page.evaluate(() => document.getElementById('stats-modal').showModal());
await page.waitForTimeout(300);
comprobar(await dialogoEncima(page) === '#stats-modal',
    `estadísticas está encima antes de capturar (encima: ${await dialogoEncima(page)})`);

await page.click('#share-stats-btn');
await esperarCaptura(page, 'export-stats-card');
const apilados = await estadoDialogos(page);
comprobar(apilados.modales.includes('#book-detail-modal') && apilados.modales.includes('#stats-modal'),
    `los dos vuelven a ser modales (modales: ${apilados.modales.join(', ') || 'ninguno'})`);
const encima = await dialogoEncima(page);
comprobar(encima === '#stats-modal', `estadísticas sigue encima tras capturar (encima: ${encima})`);

await sePuedePulsar(page, '#close-stats-btn');
await sePuedePulsar(page, '#cancel-detail-modal');
await page.waitForTimeout(500);

comprobar(!errores.some((e) => /InvalidStateError|already open as a non-modal/i.test(e)),
    'sin InvalidStateError en consola');

// El atributo open vive solo en el DOM: recargar tiene que dejarlo todo
// limpio. Si algún día se persistiera el estado de los diálogos, esto avisa.
await page.reload();
await page.waitForSelector('.book', { timeout: 20000 });
const trasRecargar = await estadoDialogos(page);
comprobar(trasRecargar.abiertos.length === 0,
    `recargar limpia el estado (abiertos: ${trasRecargar.abiertos.join(', ') || 'ninguno'})`);

await browser.close();
if (errores.length) console.log(`\n  errores de consola:\n${errores.map((e) => `    ${e}`).join('\n')}`);
console.log(`\n  ${fallos.length === 0 ? 'TODO OK' : `${fallos.length} FALLOS`}\n`);
process.exit(fallos.length === 0 ? 0 : 1);
