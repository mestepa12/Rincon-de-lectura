import {
    onAuthStateChanged,
    sendEmailVerification,
    signInWithPopup,
    GoogleAuthProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
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

console.log('auth.js cargado');

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


document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded disparado');
    const loginForm = document.getElementById('login-form');
    console.log('loginForm encontrado:', loginForm);
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
                window.location.href = 'biblioteca.html';
            })
            .catch(err => console.error("Error Google:", err));
        });
    }
    
    // --- LOGIN EMAIL ---
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = emailInput.value;
            const pass = passwordInput.value;
            console.log('Login submit — email:', email);

            setPersistence(auth, browserLocalPersistence)
                .then(() => {
                    console.log('Persistence OK, llamando signIn...');
                    return signInWithEmailAndPassword(auth, email, pass);
                })
                .then(userCred => {
                    console.log('Login OK:', userCred.user.email);
                    if (userCred.user.emailVerified) {
                        // Solo un flag de UI para redirigir rápido; la sesión
                        // real la gestiona Firebase Auth. NUNCA guardar
                        // credenciales en localStorage.
                        localStorage.setItem('rincon_logged_in', '1');
                        window.location.href = 'biblioteca.html';
                    } else {
                        loginError.textContent = 'Verifica tu correo antes de entrar.';
                    }
                })
                .catch(err => {
                    console.error('Login error code:', err.code);
                    console.error('Login error msg:', err.message);
                    loginError.textContent = 'Correo o contraseña incorrectos.';
                });
        });
    }

    // --- DETECTOR DE SESIÓN Y REDIRECCIÓN ---
    onAuthStateChanged(auth, (user) => {
        if (user && user.emailVerified) {
            const path = window.location.pathname;
            if (path === '/' || path.includes('index.html') || path.includes('login.html') || path.includes('register.html')) {
                window.location.href = 'biblioteca.html';
            }
        } else if (user && !user.emailVerified) {
            if (divAviso) divAviso.style.display = 'block'; 
        } else {
            if (divAviso) divAviso.style.display = 'none';
            const path = window.location.pathname;
            if (path.includes('biblioteca.html')) {
                window.location.href = 'index.html';
            }
        }
    });

    // --- REENVIAR CORREO ---
    if (btnReenviar) {
        btnReenviar.addEventListener('click', async (e) => {
            e.preventDefault();
            if (auth.currentUser) {
                try {
                    await sendEmailVerification(auth.currentUser);
                    textoEstado.innerText = "✅ Enviado. Revisa SPAM.";
                    textoEstado.style.display = "block";
                } catch (err) {
                    textoEstado.innerText = "❌ Error. Espera un poco.";
                    textoEstado.style.display = "block";
                }
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

            if (pass !== regConfirmInput.value) {
                document.getElementById('register-error').textContent = 'Las contraseñas no coinciden.';
                return;
            }

            try {
                // Chequeo de nombre libre contra la colección pública `usernames`
                // (un doc por nombre, ID = username en minúsculas). La colección
                // `users` ya no es legible sin autenticar.
                const usernameKey = usernameInputVal.toLowerCase();
                const nameSnap = await getDoc(doc(db, "usernames", usernameKey));

                if (nameSnap.exists()) {
                    document.getElementById('register-error').textContent = 'Este nombre de usuario ya está en uso. Por favor, elige otro.';
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
                await signOut(auth); // Nos aseguramos de desloguear aquí para que verifique el email
                
                // Limpiar restos de credenciales antiguas por si acaso
                limpiarCredencialesAntiguas();

                alert("Cuenta creada. Verifica tu correo.");
                window.location.href = 'login.html';

            } catch (error) {
                console.error("Error en el registro:", error);
                document.getElementById('register-error').textContent = 'Error al crear la cuenta. Inténtalo de nuevo.';
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
                    alert("Enlace enviado.");
                    resetModal.close();
                });
        });
        document.getElementById('cancel-reset-btn').addEventListener('click', () => resetModal.close());
    }
    
    
});