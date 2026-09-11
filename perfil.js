// Una sola definición de "perfil completo" para toda la app.
//
// Que exista el documento users/{uid} no basta: el muro del quiz llegó a
// crear perfiles con solo `quizResults` (sin username ni reserva en
// `usernames`). Esas cuentas tienen que pasar por el onboarding para elegir
// nombre, igual que un alta con Google que aún no lo ha hecho.

/**
 * ¿El perfil existe y tiene nombre de usuario?
 * @param {import('firebase/firestore').DocumentSnapshot} snap Perfil leído.
 * @return {boolean} true si la cuenta puede usar la app.
 */
export const perfilCompleto = (snap) =>
    snap.exists() && typeof snap.data().username === 'string' && snap.data().username.length > 0;
