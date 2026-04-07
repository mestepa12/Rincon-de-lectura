import { 
    initializeApp 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";

import { 
    getAuth, 
    onAuthStateChanged, 
    sendEmailVerification, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";

import { 
    getFirestore, 
    doc, 
    setDoc 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// Tu configuración integrada para que no falle el "No Firebase App"
const firebaseConfig = {
  apiKey: "AIzaSyDGgrJwBRmz5hAqkgx3A6CnNRZuR_YtLfc",
  authDomain: "mi-rincon-de-lectura.firebaseapp.com",
  projectId: "mi-rincon-de-lectura",
  storageBucket: "mi-rincon-de-lectura.appspot.com",
  messagingSenderId: "333643518949",
  appId: "1:333643518949:web:322ec9b7ab1c3bc267d50c"
};

// Inicializamos ANTES de cualquier otra cosa
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    // Referencias de Login
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password'); 
    const loginError = document.getElementById('login-error');
    const togglePasswordBtn = document.getElementById('toggle-password'); 

    // Referencias de Registro
    const registerForm = document.getElementById('register-form');
    const regUsernameInput = document.getElementById('username'); 
    const regPasswordInput = document.getElementById('register-password'); 
    const regTogglePasswordBtn = document.getElementById('toggle-register-password'); 
    const regConfirmInput = document.getElementById('register-password-confirm'); 
    const regConfirmToggleBtn = document.getElementById('toggle-register-password-confirm'); 
    
    // Referencias de Verificación
    const divAviso = document.getElementById('msg-verificacion');
    const btnReenviar = document.getElementById('btn-reenviar-correo');
    const textoEstado = document.getElementById('estado-envio');

    // --- MANEJO MOSTRAR/OCULTAR CONTRASEÑA ---
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
            signInWithPopup(auth, new GoogleAuthProvider())
                .then(() => window.location.href = 'biblioteca.html')
                .catch(err => console.error("Error Google:", err));
        });
    }
    
    // --- LOGIN EMAIL ---
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
                .then(userCred => {
                    if (userCred.user.emailVerified) {
                        window.location.href = 'biblioteca.html';
                    } else {
                        loginError.textContent = 'Verifica tu correo antes de entrar.';
                    }
                })
                .catch(err => {
                    loginError.textContent = 'Correo o contraseña incorrectos.';
                });
        });
    }

    // --- DETECTOR DE VERIFICACIÓN ---
    onAuthStateChanged(auth, (user) => {
        if (user && !user.emailVerified) {
            if (divAviso) divAviso.style.display = 'block'; 
        } else {
            if (divAviso) divAviso.style.display = 'none'; 
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
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('register-email').value;
            const pass = regPasswordInput.value;
            if (pass !== regConfirmInput.value) {
                document.getElementById('register-error').textContent = 'Las contraseñas no coinciden.';
                return;
            }

            createUserWithEmailAndPassword(auth, email, pass)
                .then(userCred => {
                    return setDoc(doc(db, "users", userCred.user.uid), {
                        username: regUsernameInput.value,
                        email: email,
                        uid: userCred.user.uid
                    }).then(() => sendEmailVerification(userCred.user));
                })
                .then(() => signOut(auth))
                .then(() => {
                    alert("Cuenta creada. Verifica tu correo.");
                    window.location.href = 'login.html';
                })
                .catch(err => console.error(err));
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