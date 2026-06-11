/* eslint-env serviceworker */
// Service Worker de Firebase Cloud Messaging.
// Maneja las notificaciones push cuando la PWA está en segundo plano o cerrada.
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

// Notificaciones recibidas con la app en segundo plano.
messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Rincón de Lectura';
    const body = payload.notification?.body || payload.data?.body || '';

    self.registration.showNotification(title, {
        body,
        icon: '/favicon.png',
        badge: '/favicon.png',
        data: { url: payload.data?.url || '/' }
    });
});

// Al pulsar la notificación, enfocar la app o abrirla.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if ('focus' in client) return client.focus();
            }
            return clients.openWindow(targetUrl);
        })
    );
});
