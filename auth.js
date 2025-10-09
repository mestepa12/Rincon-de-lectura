document.addEventListener('DOMContentLoaded', () => {
    // Referencias a los elementos del formulario de LOGIN
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');

    // Referencias a los elementos del formulario de REGISTRO
    const registerForm = document.getElementById('register-form');
    const registerEmailInput = document.getElementById('register-email');
    const registerPasswordInput = document.getElementById('register-password');
    const registerError = document.getElementById('register-error');
    
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

    // Manejador para el formulario de REGISTRO
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = registerEmailInput.value;
            const password = registerPasswordInput.value;

            firebase.auth().createUserWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    // Si el registro es correcto, redirigimos a la página principal
                    console.log('Usuario creado exitosamente. Redirigiendo...');
                    window.location.href = 'index.html';
                })
                .catch((error) => {
                    // Manejo de errores de registro
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