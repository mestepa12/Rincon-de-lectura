/* eslint-env serviceworker */
// Service Worker de "Mi Rincón de Lectura".
// 1) Notificaciones push de Firebase Cloud Messaging (segundo plano).
// 2) Caché del App Shell para que la PWA funcione offline.
// Nota: los service workers no pasan por Vite, por lo que la configuración
// va inline (son credenciales públicas de cliente, las mismas del bundle).

importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyDGgrJwBRmz5hAqkgx3A6CnNRZuR_YtLfc',
    authDomain: 'mi-rincon-de-lectura.firebaseapp.com',
    projectId: 'mi-rincon-de-lectura',
    storageBucket: 'mi-rincon-de-lectura.appspot.com',
    messagingSenderId: '333643518949',
    appId: '1:333643518949:web:322ec9b7ab1c3bc267d50c'
});

const messaging = firebase.messaging();

// ============================================================
// CACHÉ OFFLINE (App Shell)
// ============================================================
const CACHE_NAME = 'rincon-shell-v6';

// App Shell: páginas y estáticos con nombre fijo. Los bundles de Vite
// (/assets/*.js, *.css) llevan hash en el nombre y se cachean en runtime.
const APP_SHELL = [
    '/',
    '/index.html',
    '/biblioteca.html',
    '/login.html',
    '/register.html',
    '/manifest.json',
    '/cookies.js',
    '/favicon.png',
    '/google-logo.png',
    '/mascota_racha.png'
];

// CDNs de librerías estáticas que la app necesita offline.
const CDN_HOSTS = [
    'www.gstatic.com'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// Navegación (HTML): red primero, caché si no hay conexión.
async function handleNavigation(request) {
    try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, fresh.clone());
        return fresh;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        // La raíz (start_url de la PWA) siempre responde con el index cacheado
        const url = new URL(request.url);
        if (url.pathname === '/' || url.pathname === '/index.html') {
            const index = (await caches.match('/')) || (await caches.match('/index.html'));
            if (index) return index;
        }
        // Fallback: shell principal de la app
        return (await caches.match('/biblioteca.html')) ||
               (await caches.match('/')) ||
               (await caches.match('/index.html')) ||
               Response.error();
    }
}

// Estáticos: stale-while-revalidate (sirve caché al instante y
// actualiza en segundo plano para la próxima visita).
async function handleStatic(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const networkFetch = fetch(request)
        .then((fresh) => {
            if (fresh && (fresh.ok || fresh.type === 'opaque')) {
                cache.put(request, fresh.clone());
            }
            return fresh;
        })
        .catch(() => null);
    return cached || (await networkFetch) || Response.error();
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;

    // APIs dinámicas (Firestore, Auth, FCM, analytics, Google Books...):
    // no interceptar — Firestore ya tiene su propia persistencia local.
    if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return;

    if (request.mode === 'navigate') {
        event.respondWith(handleNavigation(request));
        return;
    }

    // Bundles de Vite, CSS, JS, imágenes y CDNs de librerías.
    event.respondWith(handleStatic(request));
});

// ============================================================
// NOTIFICACIONES PUSH (FCM)
// ============================================================

// Notificaciones recibidas con la app en segundo plano.
// Si el mensaje trae payload `notification`, el SDK ya la muestra solo
// (imprescindible en iOS): mostrarla aquí también la duplicaría.
// Solo pintamos manualmente los mensajes solo-data.
messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const title = payload.data?.title || 'Rincón de Lectura';
    const body = payload.data?.body || '';

    self.registration.showNotification(title, {
        body,
        icon: '/favicon.png',
        badge: '/favicon.png',
        data: { url: payload.data?.url || '/' }
    });
});

// Al pulsar la notificación: enfocar la app y NAVEGAR a la URL del deep
// link (p. ej. /biblioteca.html?chat=<uid> abre el chat con esa persona).
// Si la notificación la auto-mostró el SDK, la URL viene en FCM_MSG.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const d = event.notification.data || {};
    const targetUrl = d.url || d.FCM_MSG?.data?.url || '/biblioteca.html';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if ('focus' in client) {
                    return client.focus().then((focused) => {
                        const c = focused || client;
                        if (c && 'navigate' in c) return c.navigate(targetUrl);
                        return c;
                    });
                }
            }
            return clients.openWindow(targetUrl);
        })
    );
});
