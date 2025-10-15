document.addEventListener('DOMContentLoaded', () => {
    const banner = document.getElementById('cookie-banner');
    const acceptBtn = document.getElementById('accept-cookies-btn');

    // Comprueba si el consentimiento ya fue guardado
    if (localStorage.getItem('cookie_consent') === 'true') {
        // Si ya aceptó, oculta el banner inmediatamente
        banner.classList.add('hidden');
    } else {
        // Si no ha aceptado, nos aseguramos de que el banner sea visible
        banner.classList.remove('hidden');
    }

    // Cuando el usuario hace clic en "Aceptar"
    acceptBtn.addEventListener('click', () => {
        // 1. Guardamos la preferencia en el almacenamiento local del navegador
        localStorage.setItem('cookie_consent', 'true');
        // 2. Ocultamos el banner con una transición
        banner.classList.add('hidden');
    });
});