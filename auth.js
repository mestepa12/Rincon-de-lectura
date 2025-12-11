document.addEventListener('DOMContentLoaded', () => {
    // --- REFERENCIAS DE ELEMENTOS (LOGIN) ---
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password'); 
    const loginError = document.getElementById('login-error');
    const togglePasswordBtn = document.getElementById('toggle-password'); 

    // --- REFERENCIAS DE ELEMENTOS (REGISTRO) ---
    const registerForm = document.getElementById('register-form');
    const regUsernameInput = document.getElementById('username'); // <--- NUEVO: Referencia al campo de usuario
    const regPasswordInput = document.getElementById('register-password'); 
    const regTogglePasswordBtn = document.getElementById('toggle-register-password'); 
    const regConfirmInput = document.getElementById('register-password-confirm'); 
    const regConfirmToggleBtn = document.getElementById('toggle-register-password-confirm'); 
    
    // --- MANEJO MOSTRAR/OCULTAR CONTRASEÑA (LOGIN) ---
    if (passwordInput && togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            togglePasswordBtn.textContent = type === 'password' ? '👁️' : '🙈';
            togglePasswordBtn.setAttribute('aria-label', type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
        });
    }

    // --- MANEJO MOSTRAR/OCULTAR CONTRASEÑA (REGISTRO - CAMPO 1) ---
    if (regPasswordInput && regTogglePasswordBtn) {
        regTogglePasswordBtn.addEventListener('click', () => {
            const type = regPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            regPasswordInput.setAttribute('type', type);
            regTogglePasswordBtn.textContent = type === 'password' ? '👁️' : '🙈';
        });
    }

    // --- MANEJO MOSTRAR/OCULTAR CONTRASEÑA (REGISTRO - CAMPO 2) ---
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
            const provider = new firebase.auth.GoogleAuthProvider();
            
            firebase.auth().signInWithPopup(provider)
                .then((result) => {
                    // OPCIONAL: Si quisieras guardar también el usuario de Google en la base de datos, iría aquí.
                    // Por ahora lo dejamos simple para el login.
                    console.log("Inicio de sesión con Google exitoso:", result.user.email);
                    window.location.href = 'index.html';
                })
                .catch((error) => {
                    console.error("Error al iniciar sesión con Google:", error);
                    const loginError = document.getElementById('login-error'); 
                    if(loginError) loginError.textContent = 'No se pudo iniciar sesión con Google.';
                });
        });
    }
    
    // --- MANEJADOR PARA EL FORMULARIO DE LOGIN ---
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = emailInput.value;
            const password = passwordInput.value; 

            firebase.auth().signInWithEmailAndPassword(email, password)
                .then(() => {
                    window.location.href = 'index.html';
                })
                .catch((error) => {
                    loginError.textContent = 'Correo o contraseña incorrectos.';
                    console.error("Error de inicio de sesión:", error);
                });
        });
    }
 
    // --- MANEJO DEL FORMULARIO DE REGISTRO (MODIFICADO) ---
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('register-email').value;
            const username = regUsernameInput.value; // <--- NUEVO: Capturamos el valor
            const password = regPasswordInput.value; 
            const confirmPassword = regConfirmInput.value; 
            const registerError = document.getElementById('register-error');

            if (password !== confirmPassword) {
                registerError.textContent = 'Las contraseñas no coinciden.';
                return;
            }

            // 1. Creamos el usuario en Authentication
            firebase.auth().createUserWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    const db = firebase.firestore(); // <--- Inicializamos Firestore

                    // 2. NUEVO: Guardamos la ficha pública en Firestore
                    return db.collection("users").doc(user.uid).set({
                        username: username,
                        email: email,
                        uid: user.uid,
                        searchKey: username.toLowerCase() // Para buscar fácil
                    }).then(() => {
                        // 3. Si se guarda bien en la BD, enviamos el correo
                        return user.sendEmailVerification();
                    });
                })
                .then(() => {
                    // 4. Cerramos sesión tras enviar el correo
                    return firebase.auth().signOut();
                })
                .then(() => {
                    // 5. Avisamos al usuario y redirigimos
                    alert(`Cuenta creada correctamente para "${username}".\n\nHemos enviado un correo de verificación a ${email}.\nPor favor, revisa tu bandeja de entrada.`);
                    window.location.href = 'login.html';
                })
                .catch((error) => {
                    // Manejo de errores
                    if (error.code == 'auth/weak-password') {
                        registerError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
                    } else if (error.code == 'auth/email-already-in-use') {
                        registerError.textContent = 'Este correo electrónico ya está registrado.';
                    } else {
                        registerError.textContent = 'Error al crear la cuenta: ' + error.message;
                    }
                    console.error("Error de registro:", error);
                });
        });
    }


    // --- MANEJO DE RECUPERACIÓN DE CONTRASEÑA ---
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const resetModal = document.getElementById('reset-password-modal');
    const resetForm = document.getElementById('reset-password-form');
    const cancelResetBtn = document.getElementById('cancel-reset-btn');
    const loginEmailInputForReset = document.getElementById('email'); 
    const resetEmailInput = document.getElementById('reset-email');

    if (forgotPasswordLink && resetModal) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (loginEmailInputForReset && loginEmailInputForReset.value) {
                resetEmailInput.value = loginEmailInputForReset.value;
            }
            resetModal.showModal();
        });

        cancelResetBtn.addEventListener('click', () => {
            resetModal.close();
        });

        resetForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = resetEmailInput.value;

            firebase.auth().sendPasswordResetEmail(email)
                .then(() => {
                    alert(`Hemos enviado un enlace de recuperación a ${email}.\n\n⚠️ IMPORTANTE: Por favor, revisa tu carpeta de SPAM.`);
                    resetModal.close();
                })
                .catch((error) => {
                    console.error("Error al enviar reset:", error);
                    if (error.code === 'auth/user-not-found') {
                        alert('No existe ninguna cuenta con este correo electrónico.');
                    } else {
                        alert('Error al enviar el correo. Inténtalo de nuevo.');
                    }
                });
        });
    }
});