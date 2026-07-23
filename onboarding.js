// Pantalla de captura de nombre de usuario tras el primer login con Google.
// Firebase Auth ya tiene la cuenta (email verificado por Google), pero el
// usuario todavía no tiene documento de perfil ni username en Firestore.
// Aquí lo elige, se valida que esté libre y se crea el perfil.
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase-init.js";

// Misma lógica de destino que auth.js: si venía del muro del quiz, vuelve
// al quiz; si no, a la biblioteca.
const destinoTrasAuth = () =>
    sessionStorage.getItem('quiz_retorno') ? 'quiz.html' : 'biblioteca.html';

const form = document.getElementById('onboarding-form');
const input = document.getElementById('username');
const errorEl = document.getElementById('onboarding-error');
const submitBtn = document.getElementById('onboarding-submit');

// --- Guard de sesión ---
// Sin sesión no hay nada que configurar → al login.
// Si el perfil YA existe (p. ej. recargó la página o llegó aquí de rebote),
// no repetimos onboarding → directo al destino.
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('login.html');
        return;
    }
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    if (profileSnap.exists()) {
        window.location.replace(destinoTrasAuth());
        return;
    }
    // Sugerencia inicial a partir del nombre de Google, saneada al patrón.
    if (!input.value && user.displayName) {
        const sugerido = user.displayName.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
        if (sugerido.length >= 3) input.value = sugerido;
    }
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
        await setDoc(doc(db, "users", user.uid), {
            username: username,
            searchKey: usernameKey,
            uid: user.uid
        });

        localStorage.setItem('rincon_logged_in', '1');
        window.location.href = destinoTrasAuth();
    } catch (err) {
        console.error("Error en onboarding:", err.code || err);
        // Choque por carrera al reservar el nombre → pídele otro.
        errorEl.textContent = 'No se pudo guardar el nombre. Puede que se acabe de ocupar; prueba con otro.';
        submitBtn.disabled = false;
    }
});
