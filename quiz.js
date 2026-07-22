// Test de personalidad literaria: preguntas públicas sin fricción, muro de
// conversión antes del resultado, e infografía compartible.
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    setPersistence,
    browserLocalPersistence
} from "firebase/auth";
import { auth, db } from './firebase-init.js';
import { loadHtml2canvas } from './lazy-libs.js';
import { exportarBlob } from './share-export.js';
import { QUIZ_TROPOS } from './quiz-data.js';

const QUIZ_ID = 'tropo-literario';
const CLAVE_RESPUESTAS = 'quiz_respuestas_' + QUIZ_ID; // sobrevive al viaje a login/registro
const CLAVE_RETORNO = 'quiz_retorno';

document.addEventListener('DOMContentLoaded', async () => {
    const vistas = {
        intro: document.getElementById('quiz-intro'),
        pregunta: document.getElementById('quiz-pregunta'),
        gate: document.getElementById('quiz-gate'),
        resultado: document.getElementById('quiz-resultado')
    };
    const mostrar = (nombre) => {
        Object.values(vistas).forEach(v => v.hidden = true);
        vistas[nombre].hidden = false;
        window.scrollTo({ top: 0, behavior: 'instant' });
    };

    // Con sesión iniciada, "Volver" lleva a la biblioteca en vez de a la landing
    if (localStorage.getItem('rincon_logged_in') === '1') {
        document.querySelector('.back-to-demo')?.setAttribute('href', 'biblioteca.html');
    }

    // ---------- 1. Cargar el test: Firestore -> fallback empaquetado ----------
    let quiz = QUIZ_TROPOS;
    try {
        const snap = await getDoc(doc(db, 'quizzes', QUIZ_ID));
        if (snap.exists()) quiz = snap.data();
    } catch { /* sin red o sin doc: el test empaquetado sirve igual */ }

    document.getElementById('quiz-titulo').textContent = quiz.titulo;
    document.getElementById('quiz-gancho').textContent = quiz.gancho;
    document.title = `${quiz.titulo} | Mi Rincón de Lectura`;

    // ---------- 2. Estado ----------
    let indice = 0;
    let respuestas = []; // índice de opción elegida por pregunta

    // Si volvemos de login/registro con respuestas guardadas, saltar al cálculo
    try {
        const guardadas = JSON.parse(sessionStorage.getItem(CLAVE_RESPUESTAS) || 'null');
        if (Array.isArray(guardadas) && guardadas.length === quiz.preguntas.length) {
            respuestas = guardadas;
        }
    } catch { /* respuestas corruptas: se empieza de cero */ }

    // ---------- 3. Render de pregunta con autoavance ----------
    const contadorEl = document.getElementById('quiz-contador');
    const textoEl = document.getElementById('quiz-texto-pregunta');
    const opcionesEl = document.getElementById('quiz-opciones');
    const progresoFill = document.getElementById('quiz-progreso-fill');

    const renderPregunta = () => {
        const p = quiz.preguntas[indice];
        contadorEl.textContent = `Pregunta ${indice + 1} de ${quiz.preguntas.length}`;
        textoEl.textContent = p.texto;
        progresoFill.style.transform = `scaleX(${indice / quiz.preguntas.length})`;
        opcionesEl.innerHTML = '';
        p.opciones.forEach((op, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'quiz-opcion';
            btn.textContent = op.texto;
            btn.addEventListener('click', () => elegir(i, btn));
            opcionesEl.appendChild(btn);
        });
    };

    let avanzando = false; // evita doble clic durante la transición
    const elegir = (i, btn) => {
        if (avanzando) return;
        avanzando = true;
        respuestas[indice] = i;
        btn.classList.add('elegida');
        progresoFill.style.transform = `scaleX(${(indice + 1) / quiz.preguntas.length})`;
        setTimeout(() => {
            avanzando = false;
            if (indice < quiz.preguntas.length - 1) {
                indice++;
                renderPregunta();
            } else {
                alTerminar();
            }
        }, 350);
    };

    // ---------- 4. Muro de conversión ----------
    const alTerminar = () => {
        sessionStorage.setItem(CLAVE_RESPUESTAS, JSON.stringify(respuestas));
        if (auth.currentUser) {
            calcularYMostrar();
        } else {
            sessionStorage.setItem(CLAVE_RETORNO, '1');
            mostrar('gate');
        }
    };

    // Google en un clic desde el propio muro (mismo alta de perfil que auth.js)
    document.getElementById('gate-google').addEventListener('click', () => {
        setPersistence(auth, browserLocalPersistence)
            .then(() => signInWithPopup(auth, new GoogleAuthProvider()))
            .then(async (userCred) => {
                const perfil = await getDoc(doc(db, 'users', userCred.user.uid));
                if (!perfil.exists()) {
                    const nombreGoogle = userCred.user.displayName ? userCred.user.displayName.replace(/\s+/g, '').slice(0, 26) : 'Lector';
                    const username = nombreGoogle + Math.floor(Math.random() * 1000);
                    await setDoc(doc(db, 'users', userCred.user.uid), {
                        username, searchKey: username.toLowerCase(), uid: userCred.user.uid
                    });
                    await setDoc(doc(db, 'usernames', username.toLowerCase()), { uid: userCred.user.uid });
                }
                localStorage.setItem('rincon_logged_in', '1');
                calcularYMostrar();
            })
            .catch(err => {
                if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
                console.error('Error Google:', err.code);
            });
    });

    // Si ya venimos autenticados con respuestas completas (retorno de registro/login)
    onAuthStateChanged(auth, (user) => {
        if (user && respuestas.length === quiz.preguntas.length && vistas.resultado.hidden) {
            calcularYMostrar();
        }
    });

    // ---------- 5. Puntuación y resultado ----------
    const puntuar = () => {
        const puntos = {};
        Object.keys(quiz.perfiles).forEach(id => puntos[id] = 0);
        respuestas.forEach((opcionIdx, pregIdx) => {
            const pesos = quiz.preguntas[pregIdx]?.opciones[opcionIdx]?.pesos || {};
            Object.entries(pesos).forEach(([id, pts]) => { puntos[id] = (puntos[id] || 0) + pts; });
        });
        const total = Object.values(puntos).reduce((s, v) => s + v, 0) || 1;
        const orden = Object.entries(puntos).sort((a, b) => b[1] - a[1]);
        return {
            ganadorId: orden[0][0],
            afinidades: orden.map(([id, pts]) => ({ id, pct: Math.round(pts / total * 100) }))
        };
    };

    const calcularYMostrar = async () => {
        sessionStorage.removeItem(CLAVE_RETORNO);
        const { ganadorId, afinidades } = puntuar();
        const perfil = quiz.perfiles[ganadorId];

        // Guardar el resultado en el perfil (merge: no toca el resto de campos)
        try {
            await setDoc(doc(db, 'users', auth.currentUser.uid), {
                quizResults: { [QUIZ_ID]: ganadorId }
            }, { merge: true });
        } catch (e) { console.error('No se pudo guardar el resultado:', e.code); }

        // Pintar la infografía teñida con el hue del perfil
        const h = perfil.hue ?? 350;
        const card = document.getElementById('resultado-card');
        card.style.background =
            `radial-gradient(130% 85% at 50% 0%, rgba(255, 240, 220, 0.12), transparent 55%), ` +
            `radial-gradient(140% 90% at 50% 115%, rgba(0, 0, 0, 0.5), transparent 60%), ` +
            `linear-gradient(160deg, hsl(${h}, 45%, 10%) 0%, hsl(${h}, 48%, 20%) 48%, hsl(${h}, 50%, 33%) 100%)`;
        document.getElementById('rc-emoji').textContent = perfil.emoji;
        document.getElementById('rc-nombre').textContent = perfil.nombre;
        document.getElementById('rc-tagline').textContent = perfil.tagline;
        document.getElementById('rc-descripcion').textContent = perfil.descripcion;
        // Cada perfil tiene varios libros: la combinación de respuestas decide
        // cuál sale (determinista al recargar, variado entre personas).
        const libros = perfil.libros || (perfil.libro ? [perfil.libro] : []);
        const semilla = respuestas.reduce((s, v) => s + v, 0);
        document.getElementById('rc-libro-titulo').textContent = libros.length ? libros[semilla % libros.length] : '';

        // Con 8 perfiles la tarjeta solo enseña el top 4 de afinidades
        const barras = document.getElementById('rc-afinidades');
        barras.innerHTML = '';
        afinidades.slice(0, 4).forEach(({ id, pct }) => {
            const p = quiz.perfiles[id];
            const fila = document.createElement('div');
            fila.className = 'rc-afinidad';
            const nombre = document.createElement('span');
            nombre.className = 'rc-afinidad-nombre';
            nombre.textContent = `${p.emoji} ${p.nombre}`;
            const barra = document.createElement('span');
            barra.className = 'rc-afinidad-barra';
            const fill = document.createElement('span');
            fill.style.transform = `scaleX(${pct / 100})`;
            barra.appendChild(fill);
            const num = document.createElement('span');
            num.className = 'rc-afinidad-pct';
            num.textContent = `${pct}%`;
            fila.append(nombre, barra, num);
            barras.appendChild(fila);
        });

        mostrar('resultado');
    };

    // ---------- 6. Compartir ----------
    const estadoEl = document.getElementById('share-estado');
    const generarImagen = async () => {
        const html2canvas = await loadHtml2canvas();
        const canvas = await html2canvas(document.getElementById('resultado-card'), { scale: 2, logging: false });
        return new Promise((res, rej) =>
            canvas.toBlob(b => (b ? res(b) : rej(new Error('canvas.toBlob devolvió null'))), 'image/png'));
    };

    // IG Stories y TikTok no tienen API web de publicación directa: el camino
    // nativo real es compartir la imagen por la hoja del sistema (el usuario
    // elige la app) y, en escritorio, descargar el PNG listo para subir.
    const compartirImagen = async (textoApp) => {
        estadoEl.textContent = 'Generando tu tarjeta...';
        try {
            const blob = await generarImagen();
            const resultado = await exportarBlob(blob, 'mi-tropo-literario.png',
                quiz.titulo, 'Mi tropo literario dominante 🎭 rinconlectura.es/quiz');
            estadoEl.textContent = resultado === 'descargado'
                ? `Imagen descargada: súbela a ${textoApp} desde tu galería.`
                : '';
        } catch (e) {
            if (e.name !== 'AbortError') estadoEl.textContent = 'No se pudo generar la imagen. Inténtalo de nuevo.';
        }
    };

    document.getElementById('share-stories').addEventListener('click', () => compartirImagen('Instagram Stories'));
    document.getElementById('share-tiktok').addEventListener('click', () => compartirImagen('TikTok'));
    document.getElementById('share-link').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText('https://rinconlectura.es/quiz');
            estadoEl.textContent = '¡Enlace copiado! Pásaselo a quien se atreva.';
        } catch {
            estadoEl.textContent = 'No se pudo copiar. El enlace es rinconlectura.es/quiz';
        }
    });

    // ---------- 7. Arranque (y repetición desde el resultado) ----------
    const empezarTest = () => {
        respuestas = [];
        sessionStorage.removeItem(CLAVE_RESPUESTAS);
        indice = 0;
        renderPregunta();
        mostrar('pregunta');
    };
    document.getElementById('quiz-empezar').addEventListener('click', empezarTest);
    document.getElementById('quiz-repetir').addEventListener('click', empezarTest);

    // Con respuestas completas pendientes (vuelta del muro), no repetir el test
    if (respuestas.length === quiz.preguntas.length) {
        if (auth.currentUser) calcularYMostrar();
        else mostrar('gate');
    } else {
        // Sin respuestas pendientes la marca de retorno no pinta nada: si se
        // quedara huérfana, auth.js redirigiría aquí en vez de a la biblioteca.
        sessionStorage.removeItem(CLAVE_RETORNO);
    }
});
