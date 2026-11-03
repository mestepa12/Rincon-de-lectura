// AVISO TEMPORAL: encuesta "¿para qué usas la app?" (noviembre de 2026).
//
// Tarjeta pequeña arriba de /biblioteca con un enlace a un formulario de
// Google. Sale hasta que la usuaria la cierra con la X o pulsa "Responder";
// a partir de ahí no vuelve en ese navegador. La marca vive en localStorage:
// es una preferencia por navegador y no escribe nada en Firestore.
//
// PARA RETIRARLO, borrar:
//   - este fichero y aviso-encuesta.css
//   - en script.js, el import de mostrarAvisoEncuesta y su llamada
//   - en analitica-nucleo.js, survey_prompt_view y survey_prompt_click
// La clave de localStorage puede quedarse en los navegadores: nadie la lee.
import './aviso-encuesta.css';
import { enviarEvento } from './analitica.js';

const URL_ENCUESTA = 'https://forms.gle/TQiJThm3kHSZihtT8';
const CLAVE = 'aviso-encuesta-2026-11';

const yaDescartado = () => {
    try { return localStorage.getItem(CLAVE) !== null; } catch { return false; }
};
const descartar = (como) => {
    try { localStorage.setItem(CLAVE, como); } catch { /* sin almacén: volverá a salir */ }
};

/**
 * Pinta la tarjeta al principio de <main>, salvo que ya se haya descartado.
 * Llamar una vez, con la sesión ya confirmada.
 * @return {void}
 */
export function mostrarAvisoEncuesta() {
    const main = document.getElementById('main-content');
    if (!main || yaDescartado() || document.querySelector('.aviso-encuesta')) return;

    const aviso = document.createElement('aside');
    aviso.className = 'aviso-encuesta';
    aviso.setAttribute('aria-label', 'Encuesta');

    const texto = document.createElement('p');
    texto.className = 'aviso-encuesta-texto';
    // Espacios de no separación en la segunda mitad: si en móvil no cabe en
    // una línea, parte tras la pregunta y no en "3 preguntas, / 1 minuto".
    texto.textContent = '¿Nos ayudas? 3 preguntas, 1 minuto.';

    const enlace = document.createElement('a');
    enlace.className = 'aviso-encuesta-enlace';
    enlace.href = URL_ENCUESTA;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    enlace.textContent = 'Responder';
    enlace.addEventListener('click', () => {
        descartar('respondido');
        enviarEvento('survey_prompt_click');
        aviso.remove();
    });

    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'aviso-encuesta-cerrar';
    cerrar.setAttribute('aria-label', 'Cerrar aviso de la encuesta');
    cerrar.textContent = '✕';
    cerrar.addEventListener('click', () => {
        descartar('cerrado');
        aviso.remove();
    });

    aviso.append(texto, enlace, cerrar);
    main.prepend(aviso);
    enviarEvento('survey_prompt_view');
}
