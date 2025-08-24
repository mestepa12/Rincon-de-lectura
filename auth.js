document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');

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
});