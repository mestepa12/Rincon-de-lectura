// Carga diferida de auth.js (y con él todo el SDK de Firebase, ~108 KB
// comprimidos) en la landing anónima: no hace falta para pintar nada del
// contenido, así que se saca del camino crítico de carga (LCP). El script
// inline del <head> ya cubre la redirección instantánea de usuarios con
// sesión marcada en localStorage; este import solo cubre el caso raro de
// sesión de Firebase viva sin ese flag, que puede esperar al idle.
const cargarAuth = () => import('./auth.js');

if ('requestIdleCallback' in window) {
    requestIdleCallback(cargarAuth, { timeout: 3000 });
} else {
    setTimeout(cargarAuth, 2000);
}
