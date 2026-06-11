// Inicialización compartida de Firebase (app, auth y Firestore).
// auth.js y script.js se cargan en la misma página: la inicialización debe
// vivir en un único módulo para que initializeFirestore() se llame una sola
// vez y antes de cualquier getFirestore().
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { firebaseConfig } from './config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Caché local persistente (IndexedDB): los datos de Firestore sobreviven
// recargas y permiten usar la app sin conexión. El tabManager multi-pestaña
// evita el error "failed-precondition" si hay varias pestañas abiertas.
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Registrar el Service Worker siempre (no solo al activar notificaciones):
// cachea el App Shell para que la web cargue offline.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}firebase-messaging-sw.js`)
        .catch((err) => console.warn('No se pudo registrar el Service Worker:', err));
}
