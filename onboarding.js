// Pantalla de captura de nombre de usuario tras el primer login con Google.
// Firebase Auth ya tiene la cuenta (email verificado por Google), pero el
// usuario todavía no tiene documento de perfil ni username en Firestore.
// Aquí lo elige, se valida que esté libre y se crea el perfil.
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase-init.js";
import { perfilCompleto } from "./perfil.js";
import { enviarAlta } from "./analitica.js";

// Misma lógica de destino que auth.js: si venía del muro del quiz, vuelve
// al quiz; si no, a la biblioteca.
const destinoTrasAuth = () =>
    sessionStorage.getItem('quiz_retorno') ? 'quiz.html' : 'biblioteca.html';

const form = document.getElementById('onboarding-form');
const input = document.getElementById('username');
const errorEl = document.getElementById('onboarding-error');
const submitBtn = document.getElementById('onboarding-submit');

// Un perfil que ya existía (sin username) es una cuenta antigua que se
// repara, no un alta: no cuenta como sign_up.
let perfilYaExistia = false;

// --- Guard de sesión ---
// Sin sesión no hay nada que configurar → al login.
// Si el perfil YA está completo (p. ej. recargó la página o llegó aquí de
// rebote), no repetimos onboarding → directo al destino. Un perfil que
// existe pero sin username (lo dejaba así el muro del quiz) sí se queda.
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('login.html');
        return;
    }
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    if (perfilCompleto(profileSnap)) {
        window.location.replace(destinoTrasAuth());
        return;
    }
    perfilYaExistia = profileSnap.exists();
    // Cuenta activa a la vista: esta pantalla ya está autenticada y conviene
    // que se vea con qué sesión se está entrando antes de elegir nombre.
    const lineaCuenta = document.getElementById('cuenta-activa');
    const huecoCuenta = document.getElementById('cuenta-activa-correo');
    if (lineaCuenta && huecoCuenta && user.email) {
        huecoCuenta.textContent = user.email;
        lineaCuenta.title = `Sesión iniciada como ${user.email}`;
        lineaCuenta.hidden = false;
    }

    // El campo se queda vacío a propósito: rellenarlo con el nombre de la
    // cuenta de Google empujaba a publicar el nombre real sin pensarlo, que
    // es justo lo que pasó con las cuentas creadas desde el muro del test.
    input.focus();
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    const user = auth.currentUser;
    if (!user) {
        window.location.replace('login.html');
        return;
    }

    const username = input.value.trim();
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        errorEl.textContent = 'El nombre debe tener entre 3 y 30 caracteres: solo letras, números y guion bajo.';
        return;
    }

    submitBtn.disabled = true;
    const usernameKey = username.toLowerCase();

    try {
        // ¿Nombre libre? La colección `usernames` es de lectura pública y
        // guarda un doc por nombre (ID = nombre en minúsculas).
        const nameSnap = await getDoc(doc(db, "usernames", usernameKey));
        if (nameSnap.exists()) {
            errorEl.textContent = 'Ese nombre ya está en uso. Prueba con otro.';
            submitBtn.disabled = false;
            return;
        }

        // Reservamos primero el nombre: las reglas solo permiten `create`
        // (no sobrescribir), así que dos altas simultáneas con el mismo
        // nombre no pueden chocar — la segunda falla aquí.
        await setDoc(doc(db, "usernames", usernameKey), { uid: user.uid });

        // PRIVACIDAD: el email NO se guarda en Firestore (lo custodia Auth).
        // Con merge: si el perfil ya existía sin nombre, conserva lo que
        // tuviera (p. ej. el resultado del quiz).
        await setDoc(doc(db, "users", user.uid), {
            username: username,
            searchKey: usernameKey,
            uid: user.uid
        }, { merge: true });

        localStorage.setItem('rincon_logged_in', '1');
        // El alta con Google acaba aquí: hasta ahora solo había cuenta de
        // Auth. También llega aquí una cuenta de correo cuyo perfil falló.
        if (!perfilYaExistia) {
            const conGoogle = user.providerData.some((p) => p.providerId === 'google.com');
            // Desde el muro del test el alta empieza allí, así que el origen
            // se fuerza: si no, aquí se perdería y contaría como directo.
            const desdeElTest = Boolean(sessionStorage.getItem('quiz_retorno'));
            await enviarAlta(conGoogle ? 'google' : 'email', desdeElTest ? { origen: '/quiz' } : {}); // ≤1 s, antes de salir
        }
        window.location.href = destinoTrasAuth();
    } catch (err) {
        console.error("Error en onboarding:", err.code || err);
        // Choque por carrera al reservar el nombre → pídele otro.
        errorEl.textContent = 'No se pudo guardar el nombre. Puede que se acabe de ocupar; prueba con otro.';
        submitBtn.disabled = false;
    }
});
