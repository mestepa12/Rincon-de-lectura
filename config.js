export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const googleBooksApiKey = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;

export const fcmVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// Proxy de Google Books: la Cloud Function buscarLibros. URL absoluta porque
// en la app Android (Capacitor) el origen no es el hosting y una ruta
// relativa no llegaría.
//
// Con `npm run dev:emu` va al emulador de Functions. El de producción
// guardaría cada búsqueda hecha en local en la caché del Firestore real.
// Misma condición triple que firebase-init.js (ver allí por qué): en un build
// import.meta.env.DEV es el literal false y la URL del emulador desaparece
// del bundle.
const conEmuladores =
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_EMULATORS === 'true' &&
  ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

export const urlProxyLibros = conEmuladores
  ? `http://127.0.0.1:5001/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/europe-west1/buscarLibros`
  : 'https://mi-rincon-de-lectura.web.app/api/buscar-libros';
