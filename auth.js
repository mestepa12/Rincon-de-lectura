import { notify } from './notify.js';
import {
    onAuthStateChanged,
    sendEmailVerification,
    signInWithPopup,
    GoogleAuthProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence
} from "firebase/auth";
import {
    doc,
    getDoc,
    setDoc
} from "firebase/firestore";
import { app, auth, db } from "./firebase-init.js";

// 1. LIMPIEZA DE CREDENCIALES ANTIGUAS
// Versiones anteriores guardaban email y contraseña en texto plano en
// localStorage para re-autenticar manualmente ("el salvavidas"). Eso era
// una vulnerabilidad: cualquier XSS o acceso al dispositivo podía leerla.
// La sesión ahora depende EXCLUSIVAMENTE de la persistencia nativa de
// Firebase Auth (browserLocalPersistence + onAuthStateChanged).
const limpiarCredencialesAntiguas = () => {
    localStorage.removeItem('rincon_user_email');
    localStorage.removeItem('rincon_user_pass');
};
limpiarCredencialesAntiguas();

// Si el usuario vino del muro del test de personalidad, tras autenticarse
// vuelve al quiz (que le espera con las respuestas guardadas) en vez de a
// la biblioteca. quiz.js limpia la marca al mostrar el resultado.
const destinoTrasAuth = () =>
    sessionStorage.getItem('quiz_retorno') ? 'quiz.html' : 'biblioteca.html';

// Traduce los códigos de error de Firebase Auth a mensajes útiles.
// Nota: distinguir "correo no registrado" de "contraseña incorrecta" facilita
// saber si un correo tiene cuenta (enumeración). Decisión de producto asumida.
const mensajeDeErrorAuth = (code) => {
    switch (code) {
        // Login
        case 'auth/user-not-found': return 'No existe ninguna cuenta con este correo. ¿Quieres crear una?';
        case 'auth/wrong-password': return 'La contraseña no es correcta. Puedes restablecerla en "¿Has olvidado tu contraseña?".';
        case 'auth/invalid-credential': return 'Correo o contraseña incorrectos.';
        case 'auth/invalid-email': return 'El formato del correo no es válido.';
        case 'auth/user-disabled': return 'Esta cuenta está deshabilitada. Contacta con soporte.';
        case 'auth/too-many-requests': return 'Demasiados intentos fallidos. Espera unos minutos o restablece tu contraseña.';
        // Registro
        case 'auth/email-already-in-use': return 'Ya existe una cuenta con este correo. Prueba a iniciar sesión.';
        case 'auth/weak-password': return 'La contraseña es demasiado débil. Usa al menos 8 caracteres con letras y números.';
        // Genéricos
        case 'auth/network-request-failed': return 'Sin conexión. Comprueba tu red e inténtalo de nuevo.';
        case 'auth/popup-blocked': return 'El navegador ha bloqueado la ventana de Google. Permite ventanas emergentes e inténtalo otra vez.';
        default: return 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.';
    }
};

// Reglas de contraseña del registro: mínimo 8 caracteres con letras y números.
// Devuelve el mensaje de error o null si es válida.
const validarPassword = (pass) => {
    if (pass.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (!/[a-zA-Z]/.test(pass)) return 'La contraseña debe incluir al menos una letra.';
    if (!/[0-9]/.test(pass)) return 'La contraseña debe incluir al menos un número.';
    return null;
};


// Ojo: este módulo se importa en diferido (idle) desde la landing, cuando
// DOMContentLoaded ya ha disparado. Registrar el listener a secas dejaría
// todo el módulo sin ejecutar — incluida la redirección de sesiones vivas —
// que es justo lo que pasaba en la PWA instalada.
const iniciarAuth = () => {
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password'); 
    const loginError = document.getElementById('login-error');
    const togglePasswordBtn = document.getElementById('toggle-password'); 

    const registerForm = document.getElementById('register-form');
    const regUsernameInput = document.getElementById('username') || document.getElementById('register-username');
    const regPasswordInput = document.getElementById('register-password'); 
    const regTogglePasswordBtn = document.getElementById('toggle-register-password'); 
    const regConfirmInput = document.getElementById('register-password-confirm'); 
    const regConfirmToggleBtn = document.getElementById('toggle-register-password-confirm'); 
    
    const divAviso = document.getElementById('msg-verificacion');
    const btnReenviar = document.getElementById('btn-reenviar-correo');
    const textoEstado = document.getElementById('estado-envio');

    const setupToggle = (btn, input) => {
        if (btn && input) {
            btn.addEventListener('click', () => {
                const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                input.setAttribute('type', type);
                btn.textContent = type === 'password' ? '👁️' : '🙈';
            });
        }
    };
    setupToggle(togglePasswordBtn, passwordInput);
    setupToggle(regTogglePasswordBtn, regPasswordInput);
    setupToggle(regConfirmToggleBtn, regConfirmInput);

    // --- LOGIN GOOGLE ---
    const googleSignInBtn = document.getElementById('google-signin-btn');
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', () => {
            setPersistence(auth, browserLocalPersistence).then(() => {
                return signInWithPopup(auth, new GoogleAuthProvider());
            })
            .then(async (userCred) => {
                // Comprobamos si el usuario ya existe en Firestore
                const profileSnap = await getDoc(doc(db, "users", userCred.user.uid));

                // Si es nuevo, lo creamos en la base de datos.
                // PRIVACIDAD: el email NO se guarda en Firestore — Firebase
                // Auth ya lo custodia y la colección users es legible por
                // otros usuarios autenticados.
                if (!profileSnap.exists()) {
                    // Truncado a 26 chars: las reglas de Firestore limitan username a 30
                    const nombreGoogle = userCred.user.displayName ? userCred.user.displayName.replace(/\s+/g, '').slice(0, 26) : 'Lector';
                    const usernameGenerado = nombreGoogle + Math.floor(Math.random() * 1000);

                    await setDoc(doc(db, "users", userCred.user.uid), {
                        username: usernameGenerado,
                        searchKey: usernameGenerado.toLowerCase(),
                        uid: userCred.user.uid
                    });
                    // Reservar el username (uniqueness + chequeo público de registro)
                    await setDoc(doc(db, "usernames", usernameGenerado.toLowerCase()), {
                        uid: userCred.user.uid
                    });
                }
                localStorage.setItem('rincon_logged_in', '1');
                window.location.href = destinoTrasAuth();
            })
            .catch(err => {
                console.error("Error Google:", err.code);
                // Cerrar la ventana de Google a propósito no es un error
                if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
                if (loginError) loginError.textContent = mensajeDeErrorAuth(err.code);
            });
        });
    }
    
    // --- LOGIN EMAIL ---
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = emailInput.value;
            const pass = passwordInput.value;

            setPersistence(auth, browserLocalPersistence)
                .then(() => signInWithEmailAndPassword(auth, email, pass))
                .then(userCred => {
                    if (userCred.user.emailVerified) {
                        // Solo un flag de UI para redirigir rápido; la sesión
                        // real la gestiona Firebase Auth. NUNCA guardar
                        // credenciales en localStorage.
                        localStorage.setItem('rincon_logged_in', '1');
                        window.location.href = destinoTrasAuth();
                    } else {
                        loginError.textContent = 'Verifica tu correo antes de entrar.';
                    }
                })
                .catch(err => {
                    console.error('Login error code:', err.code);
                    loginError.textContent = mensajeDeErrorAuth(err.code);
                });
        });
    }

    // --- DETECTOR DE SESIÓN Y REDIRECCIÓN ---
    // Nota: con cleanUrls la ruta es "/biblioteca" (sin .html), por eso los
    // checks van sin extensión.
    onAuthStateChanged(auth, (user) => {
        const path = window.location.pathname;
        if (user && user.emailVerified) {
            // Auto-reparar el flag de redirección rápida: las sesiones
            // iniciadas antes de que existiera no lo tienen y sin él cada
            // apertura de la PWA aterriza en la landing.
            localStorage.setItem('rincon_logged_in', '1');
            if (path === '/' || path.includes('index') || path.includes('login') || path.includes('register')) {
                window.location.href = destinoTrasAuth();
            }
        } else if (user && !user.emailVerified) {
            // Sin verificar no hay biblioteca: de vuelta al login con el banner
            if (path.includes('biblioteca')) {
                window.location.href = 'login.html';
                return;
            }
            if (divAviso) {
                divAviso.style.display = 'block';
                const emailSpan = document.getElementById('verif-email');
                const emailWrap = document.getElementById('verif-email-wrap');
                if (emailSpan && user.email) {
                    emailSpan.textContent = user.email;
                    if (emailWrap) emailWrap.style.display = 'inline';
                }
                // Recién llegado del registro: tono de éxito en el titular
                if (sessionStorage.getItem('registro_recien_creado')) {
                    sessionStorage.removeItem('registro_recien_creado');
                    const titulo = document.getElementById('verif-titulo');
                    if (titulo) titulo.textContent = '✅ ¡Cuenta creada! Solo falta confirmar tu correo.';
                }
                // Facilitar el reintento de login tras verificar
                if (emailInput && !emailInput.value && user.email) emailInput.value = user.email;
            }
        } else {
            // Sesión muerta con el flag puesto = bucle de redirecciones
            // index ↔ biblioteca. Limpiarlo antes de mandar a la landing.
            localStorage.removeItem('rincon_logged_in');
            if (divAviso) divAviso.style.display = 'none';
            if (path.includes('biblioteca')) {
                window.location.href = 'index.html';
            }
        }
    });

    // --- REENVIAR CORREO ---
    if (btnReenviar) {
        let reenvioBloqueadoHasta = 0; // cooldown para no chocar con el rate limit de Firebase
        btnReenviar.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!auth.currentUser) return;
            if (Date.now() < reenvioBloqueadoHasta) {
                textoEstado.innerText = "⏳ Espera un momento antes de volver a reenviar.";
                textoEstado.style.display = "block";
                return;
            }
            try {
                await sendEmailVerification(auth.currentUser);
                reenvioBloqueadoHasta = Date.now() + 60000;
                textoEstado.innerText = `✅ Correo reenviado a ${auth.currentUser.email}. Si no llega, mira en spam.`;
                textoEstado.style.display = "block";
            } catch (err) {
                reenvioBloqueadoHasta = Date.now() + 60000;
                textoEstado.innerText = err.code === 'auth/too-many-requests'
                    ? "❌ Demasiados reenvíos seguidos. Espera unos minutos."
                    : "❌ No se pudo reenviar. Inténtalo de nuevo en un rato.";
                textoEstado.style.display = "block";
            }
        });
    }
 
    // --- REGISTRO ---
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('register-email').value;
            const pass = regPasswordInput.value;
            const usernameInputVal = regUsernameInput.value.trim();
            const registerError = document.getElementById('register-error');

            if (!/^[a-zA-Z0-9_]{3,30}$/.test(usernameInputVal)) {
                registerError.textContent = 'El nombre de usuario debe tener entre 3 y 30 caracteres, solo letras, números y guion bajo.';
                return;
            }

            const errorPass = validarPassword(pass);
            if (errorPass) {
                registerError.textContent = errorPass;
                return;
            }

            if (pass !== regConfirmInput.value) {
                registerError.textContent = 'Las contraseñas no coinciden.';
                return;
            }

            try {
                // Chequeo de nombre libre contra la colección pública `usernames`
                // (un doc por nombre, ID = username en minúsculas). La colección
                // `users` ya no es legible sin autenticar.
                const usernameKey = usernameInputVal.toLowerCase();
                const nameSnap = await getDoc(doc(db, "usernames", usernameKey));

                if (nameSnap.exists()) {
                    registerError.textContent = 'Este nombre de usuario ya está en uso. Por favor, elige otro.';
                    return;
                }

                const userCred = await createUserWithEmailAndPassword(auth, email, pass);

                // PRIVACIDAD: el email NO se guarda en Firestore (Auth lo custodia)
                await setDoc(doc(db, "users", userCred.user.uid), {
                    username: usernameInputVal,
                    searchKey: usernameKey,
                    uid: userCred.user.uid
                });
                // Reservar el username: las reglas solo permiten create (no
                // sobrescribir), así que dos registros simultáneos no chocan.
                await setDoc(doc(db, "usernames", usernameKey), {
                    uid: userCred.user.uid
                });
                
                await sendEmailVerification(userCred.user);

                // La sesión se queda iniciada a propósito: sin verificar no se
                // puede entrar a la biblioteca, y así el banner de login puede
                // mostrar el correo y reenviar el enlace sin volver a loguear.
                limpiarCredencialesAntiguas();
                // Desde el muro del test: directo al resultado (la sesión queda
                // iniciada); el aviso de verificación le esperará en el login.
                if (sessionStorage.getItem('quiz_retorno')) {
                    window.location.href = 'quiz.html';
                    return;
                }
                sessionStorage.setItem('registro_recien_creado', '1');
                window.location.href = 'login.html';

            } catch (error) {
                console.error("Error en el registro:", error.code);
                registerError.textContent = mensajeDeErrorAuth(error.code);
            }
        });
    }

    // --- RECUPERAR CONTRASEÑA ---
    const forgotLink = document.getElementById('forgot-password-link');
    const resetModal = document.getElementById('reset-password-modal');
    if (forgotLink && resetModal) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            resetModal.showModal();
        });
        document.getElementById('reset-password-form').addEventListener('submit', (e) => {
            e.preventDefault();
            sendPasswordResetEmail(auth, document.getElementById('reset-email').value)
                .then(() => {
                    notify("Enlace enviado. Revisa tu bandeja de entrada y la carpeta de spam.", 'success');
                    resetModal.close();
                })
                .catch(err => {
                    notify(mensajeDeErrorAuth(err.code), 'error');
                });
        });
        document.getElementById('cancel-reset-btn').addEventListener('click', () => resetModal.close());
    }


};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarAuth);
} else {
    iniciarAuth();
}