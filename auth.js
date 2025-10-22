document.addEventListener('DOMContentLoaded', () => {
    // Referencias a los elementos del formulario de LOGIN
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');    
    const loginError = document.getElementById('login-error');

    // Referencias a los elementos del formulario de REGISTRO
    const registerForm = document.getElementById('register-form');
    const registerEmailInput = document.getElementById('register-email');
    const registerPasswordInput = document.getElementById('register-password');
    const registerError = document.getElementById('register-error');


    // --- MANEJO DEL BOTÓN MOSTRAR/OCULTAR CONTRASEÑA ---
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('toggle-password');

    if (passwordInput && togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
            // Cambia el tipo del input
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);

            // Cambia el icono del botón (opcional, puedes usar iconos diferentes)
            togglePasswordBtn.textContent = type === 'password' ? '👁️' : '🙈'; 
            // Cambia la etiqueta aria para accesibilidad
            togglePasswordBtn.setAttribute('aria-label', type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
        });
    }


    // --- MANEJADOR PARA EL INICIO DE SESIÓN CON GOOGLE ---
    const googleSignInBtn = document.getElementById('google-signin-btn');
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', () => {
            // 1. Crea una instancia del proveedor de Google.
            const provider = new firebase.auth.GoogleAuthProvider();

            // 2. Inicia el proceso de inicio de sesión con una ventana emergente.
            firebase.auth().signInWithPopup(provider)
                .then((result) => {
                    // Si el inicio de sesión es exitoso, redirigimos a la página principal.
                    console.log("Inicio de sesión con Google exitoso:", result.user.email);
                    window.location.href = 'index.html';
                })
                .catch((error) => {
                    // Manejo de errores (por ejemplo, si el usuario cierra la ventana emergente).
                    console.error("Error al iniciar sesión con Google:", error);
                    const loginError = document.getElementById('login-error');
                    loginError.textContent = 'No se pudo iniciar sesión con Google.';
                });
        });
    }
    
    // Manejador para el formulario de LOGIN
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = emailInput.value;
            const password = passwordInput.value;

            firebase.auth().signInWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    // Si el inicio de sesión es correcto, redirigimos a la página principal
                    window.location.href = 'index.html';
                })
                .catch((error) => {
                    // Si hay un error, lo mostramos
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
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-password-confirm').value; // Obtenemos la confirmación
            const registerError = document.getElementById('register-error');

            // --- VERIFICACIÓN DE CONTRASEÑAS ---
            if (password !== confirmPassword) {
                registerError.textContent = 'Las contraseñas no coinciden.';
                return; // Detenemos la ejecución si no coinciden
            }
            // --- FIN DE LA VERIFICACIÓN ---

            firebase.auth().createUserWithEmailAndPassword(email, password)
                .then(() => {
                    window.location.href = 'index.html';
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
