// Inicialización compartida de Firebase (app, auth y Firestore).
// auth.js y script.js se cargan en la misma página: la inicialización debe
// vivir en un único módulo para que initializeFirestore() se llame una sola
// vez y antes de cualquier getFirestore().
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { firebaseConfig } from './config.js';

// ---------------------------------------------------------------------------
// ¿Emuladores o backend real?
//
// Tres condiciones, y hacen falta LAS TRES. La primera es la que de verdad
// cierra la puerta: Vite sustituye `import.meta.env.DEV` por el literal
// `false` al compilar, así que en un build de producción todo este bloque es
// código muerto y Rollup lo borra entero — ni el `connectAuthEmulator` ni los
// puertos llegan al bundle. Compruébalo con:
//     npm run build && grep -r "9099" dist/assets
//
//  1. import.meta.env.DEV ......... solo cierto con el dev server de Vite.
//  2. VITE_USE_EMULATORS .......... solo lo define .env.emulador, que solo
//                                   se carga con `vite --mode emulador`
//                                   (es decir, `npm run dev:emu`).
//  3. hostname local .............. red de seguridad en tiempo de ejecución.
//
// Y al revés: `npm run dev` a secas no cumple la 2, así que sigue hablando
// con el backend real igual que siempre.
// ---------------------------------------------------------------------------
const usarEmuladores =
    import.meta.env.DEV &&
    import.meta.env.VITE_USE_EMULATORS === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Caché local persistente (IndexedDB): los datos de Firestore sobreviven
// recargas y permiten usar la app sin conexión. El tabManager multi-pestaña
// evita el error "failed-precondition" si hay varias pestañas abiertas.
//
// Con emuladores se usa caché en memoria a propósito: IndexedDB persistiría
// entre sesiones y acabaría mezclando datos de emulador con los reales que
// dejó una sesión anterior contra producción.
export const db = usarEmuladores
    ? initializeFirestore(app, {})
    : initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });

if (usarEmuladores) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);

    // Aviso imposible de pasar por alto: sin esto es fácil creerse que estás
    // mirando datos reales cuando no lo son (o al revés).
    console.warn(
        '%c EMULADORES ',
        'background:#b45309;color:#fff;font-weight:bold;border-radius:3px',
        'Auth :9099 · Firestore :8080 — no hay nada real detrás.',
    );
    document.addEventListener('DOMContentLoaded', () => {
        const aviso = document.createElement('div');
        aviso.textContent = 'EMULADORES';
        aviso.style.cssText = 'position:fixed;left:0;bottom:0;z-index:2147483647;' +
            'background:#b45309;color:#fff;font:700 11px/1 system-ui,sans-serif;' +
            'padding:5px 9px;border-top-right-radius:5px;letter-spacing:.06em;' +
            'pointer-events:none';
        document.body.appendChild(aviso);
    });
}

// Registrar el Service Worker siempre (no solo al activar notificaciones):
// cachea el App Shell para que la web cargue offline.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}firebase-messaging-sw.js`)
        .catch((err) => console.warn('No se pudo registrar el Service Worker:', err));
}
