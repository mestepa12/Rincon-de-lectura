document.addEventListener('DOMContentLoaded', () => {
    // --- REFERENCIAS DE ELEMENTOS (LOGIN) ---
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password'); // Campo de contraseña de login
    const loginError = document.getElementById('login-error');
    const togglePasswordBtn = document.getElementById('toggle-password'); // Botón de ojo de login

    // --- REFERENCIAS DE ELEMENTOS (REGISTRO) ---
    const registerForm = document.getElementById('register-form');
    const regPasswordInput = document.getElementById('register-password'); // Campo de contraseña de registro
    const regTogglePasswordBtn = document.getElementById('toggle-register-password'); // Botón de ojo 1 de registro
    const regConfirmInput = document.getElementById('register-password-confirm'); // Campo de conf. de contraseña
    const regConfirmToggleBtn = document.getElementById('toggle-register-password-confirm'); // Botón de ojo 2 de registro
    
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
            // ... (resto de tu lógica de Google) ...
            firebase.auth().signInWithPopup(provider)
                .then((result) => {
                    console.log("Inicio de sesión con Google exitoso:", result.user.email);
                    window.location.href = 'index.html';
                })
                .catch((error) => {
                    console.error("Error al iniciar sesión con Google:", error);
                    const loginError = document.getElementById('login-error'); // Asegúrate de que loginError esté definido si este botón está en login.html
                    if(loginError) loginError.textContent = 'No se pudo iniciar sesión con Google.';
                });
        });
    }
    
    // --- MANEJADOR PARA EL FORMULARIO DE LOGIN ---
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = emailInput.value;
            const password = passwordInput.value; // 'passwordInput' ya está definido arriba

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

    // --- MANEJO DEL FORMULARIO DE REGISTRO ---
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('register-email').value;
            const password = regPasswordInput.value; // Usa la variable definida arriba
            const confirmPassword = regConfirmInput.value; // Usa la variable definida arriba
            const registerError = document.getElementById('register-error');

            if (password !== confirmPassword) {
                registerError.textContent = 'Las contraseñas no coinciden.';
                return;
            }

            firebase.auth().createUserWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    // ¡AQUÍ ESTÁ EL CAMBIO!
                    // Envía el correo de verificación al usuario recién creado
                    userCredential.user.sendEmailVerification().then(() => {
                        // Opcional: Informa al usuario antes de redirigir
                        alert('¡Cuenta creada! Revisa tu bandeja de entrada para verificar tu correo.');
                        // Redirige al usuario a la página principal
                        window.location.href = 'index.html';
                    });
                })
                .catch((error) => {
                    if (error.code == 'auth/weak-password') {
                        registerError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
                    } else if (error.code == 'auth/email-already-in-use') {
                        registerError.textContent = 'Este correo electrónico ya está registrado.';
                    } else {
                        registerError.textContent = 'Error al crear la cuenta.';
                    }
                    console.error("Error de registro:", error);
                });
        });
    }
});