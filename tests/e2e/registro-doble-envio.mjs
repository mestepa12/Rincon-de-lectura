// Un doble toque en "Crear cuenta" lanza un solo alta.
//
// Con los emuladores y el dev server en marcha:
//   npm run dev:emu          (en otra terminal)
//   node tests/e2e/registro-doble-envio.mjs
//
// El caso de producción (23/09): dos cuentas con el mismo correo creadas en
// el mismo segundo. El botón no se desactivaba y nada impedía un segundo
// envío mientras el primero esperaba a la red.
//
// OJO: el emulador de Auth rechaza el segundo signUp con EMAIL_EXISTS (en
// producción no lo hizo), así que contar cuentas no basta para ver el fallo.
// Lo que se cuenta es cuántas peticiones accounts:signUp salen del
// navegador: tiene que ser exactamente una.
//
// También comprueba que una cuenta de correo sin verificar que termina el
// onboarding (lo que pasa si falla guardar el nombre en el registro) acaba
// en el aviso de verificación y no en un bucle login ↔ biblioteca.
//
// Las cuentas que crea las borra al terminar, con su perfil y su reserva.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { PROD } from '../../scripts/lib/proyectos.mjs';

const requireRaiz = createRequire(new URL('../../package.json', import.meta.url));
const { chromium, devices } = requireRaiz('@playwright/test');

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const requireAdmin = createRequire(resolve(process.cwd(), 'functions', 'package.json'));
const { initializeApp } = requireAdmin('firebase-admin/app');
const { getFirestore } = requireAdmin('firebase-admin/firestore');
const { getAuth } = requireAdmin('firebase-admin/auth');
const admin = initializeApp({ projectId: PROD });
const adminDb = getFirestore(admin);
const adminAuth = getAuth(admin);

const APP = 'http://localhost:5173';
const CLAVE = 'prueba1234';
const marca = Date.now().toString(36);

const fallos = [];
const errores = [];
const comprobar = (ok, texto) => {
    console.log(`  ${ok ? '✓' : '✗'} ${texto}`);
    if (!ok) fallos.push(texto);
};

const creadas = [];

/** Cuentas del emulador con ese correo. */
async function cuentasCon(email) {
    const { users } = await adminAuth.listUsers(1000);
    return users.filter((u) => u.email === email);
}

/**
 * Abre el registro en un móvil táctil, rellena el formulario y cuenta las
 * peticiones de alta que salen hacia Auth.
 * @param {object} browser Navegador.
 * @param {string} email Correo nuevo.
 * @param {string} nombre Nombre de usuario nuevo.
 * @return {Promise<{page: object, contexto: object, altas: function(): number}>}
 */
async function registroListo(browser, email, nombre) {
    const contexto = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await contexto.newPage();
    page.on('pageerror', (e) => errores.push(e.message));
    let altas = 0;
    page.on('request', (r) => { if (r.url().includes('accounts:signUp')) altas++; });

    await page.goto(`${APP}/register.html`);
    // auth.js es un módulo: hasta que carga, el formulario no tiene su
    // manejador y un envío recargaría la página a secas.
    await page.waitForLoadState('networkidle');
    await page.fill('#register-email', email);
    await page.fill('#register-username', nombre);
    await page.fill('#register-password', CLAVE);
    await page.fill('#register-password-confirm', CLAVE);
    return { page, contexto, altas: () => altas };
}

/** Espera a salir del registro (o a que pasen 15 s). */
const esperarSalida = (page) =>
    page.waitForURL((u) => !u.pathname.includes('register'), { timeout: 15000 }).catch(() => {});

/** Lo que tiene que quedar tras un alta buena. */
async function comprobarAlta(page, altas, email, nombre) {
    await esperarSalida(page);
    // Margen por si un segundo envío saliera tarde.
    await page.waitForTimeout(1500);
    comprobar(altas() === 1, `sale UNA petición de alta (salieron ${altas()})`);
    const cuentas = await cuentasCon(email);
    comprobar(cuentas.length === 1, `una cuenta con ese correo (hay ${cuentas.length})`);
    const uid = cuentas[0]?.uid;
    if (uid) creadas.push({ uid, clave: nombre.toLowerCase() });
    const reserva = (await adminDb.doc(`usernames/${nombre.toLowerCase()}`).get()).data();
    comprobar(!!uid && reserva?.uid === uid, 'la reserva del nombre apunta a esa cuenta');
    const perfil = (await adminDb.doc(`users/${uid}`).get()).data();
    comprobar(perfil?.username === nombre, 'tiene perfil con su nombre');
    comprobar(new URL(page.url()).pathname.includes('login'), `acaba en el login (está en ${new URL(page.url()).pathname})`);
    const aviso = await page.textContent('#login-error').catch(() => '');
    comprobar(!/ya existe/i.test(aviso || ''), 'no aparece "Ya existe una cuenta con este correo"');
}

const browser = await chromium.launch();

try {
    console.log('\n▶ Doble toque en "Crear cuenta" (pantalla táctil)\n');
    {
        const email = `doble-toque-${marca}@prueba.test`;
        const nombre = `Toque_${marca}`;
        const { page, contexto, altas } = await registroListo(browser, email, nombre);
        const caja = await page.locator('#register-form button[type=submit]').boundingBox();
        const x = caja.x + caja.width / 2;
        const y = caja.y + caja.height / 2;
        // Dos toques seguidos sobre el botón, sin esperar a nada entre medias.
        await page.touchscreen.tap(x, y);
        await page.touchscreen.tap(x, y);
        comprobar(await page.locator('#register-form button[type=submit]').isDisabled().catch(() => true),
            'el botón queda desactivado mientras se crea la cuenta');
        await comprobarAlta(page, altas, email, nombre);
        await contexto.close();
    }

    console.log('\n▶ Enter y toque a la vez (dos envíos en el mismo instante)\n');
    {
        const email = `doble-envio-${marca}@prueba.test`;
        const nombre = `Envio_${marca}`;
        const { page, contexto, altas } = await registroListo(browser, email, nombre);
        // requestSubmit() sin botón no mira si está desactivado: esto prueba
        // la guarda de "en curso", no solo el botón.
        await page.evaluate(() => {
            const f = document.getElementById('register-form');
            f.requestSubmit();
            f.requestSubmit();
            f.requestSubmit();
        });
        await comprobarAlta(page, altas, email, nombre);
        await contexto.close();
    }

    console.log('\n▶ Tras un error de validación se puede volver a enviar\n');
    {
        const email = `reintento-${marca}@prueba.test`;
        const nombre = `Reint_${marca}`;
        const { page, contexto, altas } = await registroListo(browser, email, nombre);
        await page.fill('#register-password-confirm', 'otraclave99');
        await page.click('#register-form button[type=submit]');
        const aviso = await page.textContent('#register-error');
        comprobar(/no coinciden/.test(aviso || ''), 'avisa de que las contraseñas no coinciden');
        comprobar(await page.locator('#register-form button[type=submit]').isEnabled(), 'el botón sigue activo');
        await page.fill('#register-password-confirm', CLAVE);
        await page.click('#register-form button[type=submit]');
        await comprobarAlta(page, altas, email, nombre);
        await contexto.close();
    }

    console.log('\n▶ Correo ya registrado: aviso y se puede corregir\n');
    {
        // El correo del primer caso ya tiene cuenta.
        const email = `doble-toque-${marca}@prueba.test`;
        const nombre = `Repe_${marca}`;
        const { page, contexto, altas } = await registroListo(browser, email, nombre);
        await page.click('#register-form button[type=submit]');
        await page.waitForFunction(() => /Ya existe/.test(document.getElementById('register-error')?.textContent || ''), null, { timeout: 10000 })
            .catch(() => {});
        comprobar(/Ya existe/.test(await page.textContent('#register-error') || ''), 'avisa de que ya hay una cuenta con ese correo');
        comprobar(await page.locator('#register-form button[type=submit]').isEnabled(), 'el botón vuelve a estar activo');
        comprobar(altas() === 1, `un solo intento de alta (${altas()})`);
        comprobar(!(await adminDb.doc(`usernames/${nombre.toLowerCase()}`).get()).exists, 'no reserva el nombre');
        await contexto.close();
    }

    console.log('\n▶ El nombre se ocupa mientras se crea la cuenta\n');
    {
        const email = `carrera-${marca}@prueba.test`;
        const nombre = `Carrera_${marca}`;
        const clave = nombre.toLowerCase();
        const { page, contexto, altas } = await registroListo(browser, email, nombre);
        // Se retiene el alta en Auth y, entre medias, otra cuenta se queda
        // el nombre: la comprobación ya dijo que estaba libre.
        const ajena = await adminAuth.createUser({ email: `ajena-${marca}@prueba.test` });
        creadas.push({ uid: ajena.uid, clave });
        await page.route('**/accounts:signUp**', async (ruta) => {
            await adminDb.doc(`usernames/${clave}`).set({ uid: ajena.uid });
            await ruta.continue();
        });
        await page.click('#register-form button[type=submit]');
        await page.waitForURL((u) => u.pathname.includes('onboarding'), { timeout: 15000 }).catch(() => {});
        comprobar(new URL(page.url()).pathname.includes('onboarding'), `la lleva a elegir otro nombre (está en ${new URL(page.url()).pathname})`);
        comprobar(altas() === 1, `un solo alta (${altas()})`);
        const [cuenta] = await cuentasCon(email);
        if (cuenta) creadas.push({ uid: cuenta.uid, clave: '' });
        const perfil = cuenta && (await adminDb.doc(`users/${cuenta.uid}`).get()).data();
        comprobar(!perfil, 'no queda un perfil con un nombre que no es suyo');
        comprobar((await adminDb.doc(`usernames/${clave}`).get()).get('uid') === ajena.uid, 'la reserva sigue siendo de la otra cuenta');
        await contexto.close();
    }

    console.log('\n▶ Cuenta de correo sin verificar que termina el onboarding\n');
    {
        const email = `sin-perfil-${marca}@prueba.test`;
        const nombre = `SinPerf_${marca}`;
        // Lo que deja un registro al que le falló guardar el nombre: cuenta
        // sin verificar, sin perfil y sin reserva.
        const { uid } = await adminAuth.createUser({ email, password: CLAVE });
        creadas.push({ uid, clave: nombre.toLowerCase() });

        const contexto = await browser.newContext();
        const page = await contexto.newPage();
        page.on('pageerror', (e) => errores.push(e.message));
        let navegaciones = 0;
        page.on('framenavigated', (f) => { if (f === page.mainFrame()) navegaciones++; });

        await page.goto(`${APP}/login.html`);
        await page.fill('#email', email);
        await page.fill('#password', CLAVE);
        await page.click('#login-form button[type=submit]');
        await page.waitForFunction(() => /Verifica/.test(document.getElementById('login-error')?.textContent || ''), null, { timeout: 10000 });

        await page.goto(`${APP}/onboarding.html`);
        await page.waitForSelector('#cuenta-activa:not([hidden])', { timeout: 10000 });
        await page.fill('#username', nombre);
        navegaciones = 0;
        await page.click('#onboarding-submit');
        await page.waitForURL((u) => u.pathname.includes('login'), { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(3000); // si hubiera bucle, seguiría navegando
        comprobar(new URL(page.url()).pathname.includes('login'), `acaba en el login (está en ${new URL(page.url()).pathname})`);
        comprobar(navegaciones <= 2, `sin bucle de redirecciones (${navegaciones} navegaciones)`);
        comprobar(await page.isVisible('#msg-verificacion'), 've el aviso de verificación');
        const marcaPuesta = await page.evaluate(() => localStorage.getItem('rincon_logged_in'));
        comprobar(marcaPuesta !== '1', 'no queda la marca de sesión que dispara el bucle');
        const reserva = (await adminDb.doc(`usernames/${nombre.toLowerCase()}`).get()).data();
        comprobar(reserva?.uid === uid, 'el nombre elegido queda reservado para ella');
        await contexto.close();
    }
} finally {
    await browser.close();
    for (const { uid, clave } of creadas) {
        await adminDb.doc(`users/${uid}`).delete();
        const r = clave ? await adminDb.doc(`usernames/${clave}`).get() : null;
        if (r?.exists && r.get('uid') === uid) await r.ref.delete();
        await adminAuth.deleteUser(uid).catch(() => {});
    }
}

if (errores.length) console.log(`\n  errores de página:\n${errores.map((e) => `    ${e}`).join('\n')}`);
console.log(`\n  ${fallos.length === 0 ? 'TODO OK' : `${fallos.length} FALLOS`}\n`);
process.exit(fallos.length === 0 ? 0 : 1);
