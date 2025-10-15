document.addEventListener('DOMContentLoaded', () => {

    // --- MANEJO DEL FORMULARIO DE LOGIN ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const loginError = document.getElementById('login-error');

            firebase.auth().signInWithEmailAndPassword(email, password)
                .then(() => { window.location.href = 'index.html'; })
                .catch(() => { loginError.textContent = 'Correo o contraseña incorrectos.'; });
        });
    }

    // --- MANEJO DEL FORMULARIO DE REGISTRO ---
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-password-confirm').value;
            const registerError = document.getElementById('register-error');

            if (password !== confirmPassword) {
                registerError.textContent = 'Las contraseñas no coinciden.';
                return;
            }

            firebase.auth().createUserWithEmailAndPassword(email, password)
                .then(() => { window.location.href = 'index.html'; })
                .catch((error) => {
                    if (error.code == 'auth/weak-password') {
                        registerError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
                    } else if (error.code == 'auth/email-already-in-use') {
                        registerError.textContent = 'Este correo electrónico ya está registrado.';
                    } else {
                        registerError.textContent = 'Error al crear la cuenta.';
                    }
                });
        });
    }
    
    // --- MANEJO DEL INICIO DE SESIÓN CON GOOGLE (VERSIÓN COMPLETA) ---
    const googleSignInBtn = document.getElementById('google-signin-btn');
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            const auth = firebase.auth();
            const loginError = document.getElementById('login-error');

            // Forzamos que siempre pregunte qué cuenta usar
            provider.setCustomParameters({ prompt: 'select_account' });

            auth.signInWithPopup(provider)
                .then(() => {
                    window.location.href = 'index.html';
                })
                .catch((error) => {
                    // Si el error es porque ya existe una cuenta con ese email
                    if (error.code === 'auth/account-exists-with-different-credential') {
                        const pendingCred = error.credential;
                        const email = error.email;
                        
                        // Preguntamos al usuario si quiere vincular las cuentas
                        if (confirm(`Ya tienes una cuenta con ${email}. ¿Quieres vincularla a tu cuenta de Google?`)) {
                            // Pedimos la contraseña para verificar que es el dueño
                            const password = prompt('Por favor, introduce tu contraseña para confirmar la vinculación:');
                            if (password) {
                                const credential = firebase.auth.EmailAuthProvider.credential(email, password);
                                
                                // Autenticamos al usuario con su contraseña y luego vinculamos Google
                                auth.signInWithCredential(credential)
                                    .then((userCredential) => userCredential.user.linkWithCredential(pendingCred))
                                    .then(() => { window.location.href = 'index.html'; })
                                    .catch(() => { loginError.textContent = 'La contraseña era incorrecta. No se pudo vincular.'; });
                            }
                        }
                    } else {
                        loginError.textContent = 'No se pudo iniciar sesión con Google.';
                        console.error("Error al iniciar sesión con Google:", error);
                    }
                });
        });
    }
});