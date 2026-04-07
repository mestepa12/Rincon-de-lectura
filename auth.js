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

// Inicialización unificada usando el objeto global de config.js
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    // --- REFERENCIAS DE ELEMENTOS (LOGIN) ---
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password'); 
    const loginError = document.getElementById('login-error');
    const togglePasswordBtn = document.getElementById('toggle-password'); 

    // --- REFERENCIAS DE ELEMENTOS (REGISTRO) ---
    const registerForm = document.getElementById('register-form');
    const regUsernameInput = document.getElementById('username'); 
    const regPasswordInput = document.getElementById('register-password'); 
    const regTogglePasswordBtn = document.getElementById('toggle-register-password'); 
    const regConfirmInput = document.getElementById('register-password-confirm'); 
    const regConfirmToggleBtn = document.getElementById('toggle-register-password-confirm'); 
    
    // --- ELEMENTOS DE VERIFICACIÓN ---
    const divAviso = document.getElementById('msg-verificacion');
    const btnReenviar = document.getElementById('btn-reenviar-correo');
    const textoEstado = document.getElementById('estado-envio');

    // --- MANEJO MOSTRAR/OCULTAR CONTRASEÑA (LOGIN) ---
    if (passwordInput && togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            togglePasswordBtn.textContent = type === 'password' ? '👁️' : '🙈';
        });
    }

    // --- MANEJO MOSTRAR/OCULTAR CONTRASEÑA (REGISTRO) ---
    if (regPasswordInput && regTogglePasswordBtn) {
        regTogglePasswordBtn.addEventListener('click', () => {
            const type = regPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            regPasswordInput.setAttribute('type', type);
            regTogglePasswordBtn.textContent = type === 'password' ? '👁️' : '🙈';
        });
    }

    if (regConfirmInput && regConfirmToggleBtn) {
        regConfirmToggleBtn.addEventListener('click', () => {
            const type = regConfirmInput.getAttribute('type') === 'password' ? 'text' : 'password';
            regConfirmInput.setAttribute('type', type);
            regConfirmToggleBtn.textContent = type === 'password' ? '👁️' : '🙈';
        });
    }

    // --- MANEJADOR PARA EL INICIO DE SESIÓN CON GOOGLE ---
    const googleSignInBtn = document.getElementById('google-signin-btn');
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', () => {
            const provider = new GoogleAuthProvider();
            signInWithPopup(auth, provider)
                .then((result) => {
                    console.log("Inicio de sesión con Google exitoso:", result.user.email);
                    window.location.href = 'biblioteca.html';
                })
                .catch((error) => {
                    console.error("Error Google:", error);
                    if(loginError) loginError.textContent = 'No se pudo iniciar sesión con Google.';
                });
        });
    }
    
    // --- MANEJADOR PARA EL FORMULARIO DE LOGIN ---
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
                .then((userCredential) => {
                    const user = userCredential.user;
                    if (user.emailVerified) {
                        window.location.href = 'biblioteca.html';
                    } else {
                        loginError.textContent = 'Por favor, verifica tu correo antes de entrar.';
                    }
                })
                .catch((error) => {
                    loginError.textContent = 'Correo o contraseña incorrectos.';
                    console.error("Error login:", error);
                });
        });
    }

    // --- DETECTOR DE ESTADO (MENSAJE DE VERIFICACIÓN) ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (!user.emailVerified) {
                if (divAviso) divAviso.style.display = 'block'; 
            } else {
                if (divAviso) divAviso.style.display = 'none'; 
            }
        } else {
            if (divAviso) divAviso.style.display = 'none'; 
        }
    });

    // --- LÓGICA REENVIAR CORREO ---
    if (btnReenviar) {
        btnReenviar.addEventListener('click', async (e) => {
            e.preventDefault();
            const user = auth.currentUser;
            if (user) {
                try {
                    await sendEmailVerification(user);
                    if (textoEstado) {
                        textoEstado.innerText = "✅ Correo enviado. Revisa tu bandeja de SPAM.";
                        textoEstado.style.color = "green";
                        textoEstado.style.display = "block";
                    }
                } catch (error) {
                    if (textoEstado) {
                        textoEstado.innerText = error.code === 'auth/too-many-requests' 
                            ? "❌ Demasiados intentos. Espera unos minutos." 
                            : "❌ Error al enviar.";
                        textoEstado.style.color = "red";
                        textoEstado.style.display = "block";
                    }
                }
            }
        });
    }
 
    // --- MANEJO DEL FORMULARIO DE REGISTRO ---
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('register-email').value;
            const username = regUsernameInput.value;
            const password = regPasswordInput.value; 
            const confirmPassword = regConfirmInput.value; 
            const registerError = document.getElementById('register-error');

            if (password !== confirmPassword) {
                registerError.textContent = 'Las contraseñas no coinciden.';
                return;
            }

            createUserWithEmailAndPassword(auth, email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    return setDoc(doc(db, "users", user.uid), {
                        username: username,
                        email: email,
                        uid: user.uid,
                        searchKey: username.toLowerCase()
                    }).then(() => sendEmailVerification(user));
                })
                .then(() => signOut(auth))
                .then(() => {
                    alert(`Cuenta creada para "${username}". Verifica tu correo.`);
                    window.location.href = 'login.html';
                })
                .catch((error) => {
                    if (error.code == 'auth/weak-password') {
                        registerError.textContent = 'Contraseña débil (mín. 6 caracteres).';
                    } else if (error.code == 'auth/email-already-in-use') {
                        registerError.textContent = 'El correo ya está registrado.';
                    } else {
                        registerError.textContent = 'Error: ' + error.message;
                    }
                });
        });
    }

    // --- MANEJO DE RECUPERACIÓN DE CONTRASEÑA ---
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const resetModal = document.getElementById('reset-password-modal');
    const resetForm = document.getElementById('reset-password-form');
    const cancelResetBtn = document.getElementById('cancel-reset-btn');
    const resetEmailInput = document.getElementById('reset-email');

    if (forgotPasswordLink && resetModal) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (emailInput && emailInput.value) resetEmailInput.value = emailInput.value;
            resetModal.showModal();
        });

        cancelResetBtn.addEventListener('click', () => resetModal.close());

        resetForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendPasswordResetEmail(auth, resetEmailInput.value)
                .then(() => {
                    alert(`Enlace enviado a ${resetEmailInput.value}. Revisa SPAM.`);
                    resetModal.close();
                })
                .catch((error) => {
                    alert(error.code === 'auth/user-not-found' ? 'Correo no encontrado.' : 'Error al enviar.');
                });
        });
    }
});