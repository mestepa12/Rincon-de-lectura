// Carga diferida de auth.js (y con él todo el SDK de Firebase) en la landing
// anónima. Además del SDK (~128 KB comprimidos), getAuth() arranca el iframe
// gapi de Firebase Auth, que arrastra apis.google.com y __/auth/iframe.js:
// ~260 KB en 6 peticiones sobre 3 orígenes extra. Nada de eso pinta la
// primera pantalla, así que se queda fuera del camino crítico (LCP).
//
// El script inline del <head> ya cubre la redirección instantánea de usuarios
// con sesión marcada en localStorage. Este módulo solo cubre el caso raro de
// sesión de Firebase viva sin ese flag, y para eso no hace falta cargar el
// SDK: Firebase Auth persiste la sesión en la base IndexedDB
// "firebaseLocalStorageDb", así que basta con comprobar si esa base existe.
// Si no existe, no hay sesión posible y nos ahorramos los 260 KB enteros.

const DB_SESION = 'firebaseLocalStorageDb';

// true solo si Firebase llegó a crear su base de sesión en este navegador.
async function haySesionPersistida() {
    if (!('indexedDB' in window)) return false;

    // indexedDB.databases() no existe en Firefox < 126 ni en Safari < 14.
    // Sin él no se puede listar, así que se asume que puede haber sesión y se
    // deja que el SDK lo resuelva: preferimos cargar de más antes que dejar a
    // un usuario con sesión sin redirigir.
    if (typeof indexedDB.databases !== 'function') return true;

    try {
        const bases = await indexedDB.databases();
        return bases.some((b) => b.name === DB_SESION);
    } catch {
        return true;
    }
}

async function cargarAuthSiHaySesion() {
    if (await haySesionPersistida()) {
        import('./auth.js');
    }
}

if ('requestIdleCallback' in window) {
    requestIdleCallback(cargarAuthSiHaySesion, { timeout: 3000 });
} else {
    setTimeout(cargarAuthSiHaySesion, 2000);
}
