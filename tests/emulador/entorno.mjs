// Entorno común de las pruebas contra los emuladores (npm run test:emu).
//
// Los hosts van fijos aquí y se ponen antes de cargar firebase-admin: con
// FIRESTORE_EMULATOR_HOST y FIREBASE_AUTH_EMULATOR_HOST el Admin SDK no usa
// credenciales ni sale de la máquina. El Admin solo siembra y comprueba; lo
// que se prueba contra las reglas va con sesiones de cliente de verdad
// (sesion()), con el token de una usuaria del emulador de Auth.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { initializeApp as iniciarCliente, deleteApp as cerrarCliente } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore as firestoreCliente, connectFirestoreEmulator } from 'firebase/firestore';

if (process.env.RINCON_TEST_EMULADOR !== '1') {
  throw new Error('Estas pruebas se lanzan con `npm run test:emu`, que arranca unos emuladores en limpio.');
}

// El mismo ID que usan los emuladores (ver scripts/dev-emuladores.mjs).
export const PROYECTO = 'mi-rincon-de-lectura';
const HOST = '127.0.0.1';
const PUERTO_FIRESTORE = 8080;
const PUERTO_AUTH = 9099;
const CLAVE = 'prueba1234';

process.env.FIRESTORE_EMULATOR_HOST = `${HOST}:${PUERTO_FIRESTORE}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `${HOST}:${PUERTO_AUTH}`;

// firebase-admin se toma de functions/node_modules, como en los scripts.
const require = createRequire(resolve(process.cwd(), 'functions', 'package.json'));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth: authAdmin } = require('firebase-admin/auth');

const admin = initializeApp({ projectId: PROYECTO }, 'pruebas-admin');
export const adminDb = getFirestore(admin);
const adminAuth = authAdmin(admin);

/**
 * Crea una usuaria en el emulador de Auth, con el correo ya verificado.
 * @param {string} email Correo (único en toda la ejecución).
 * @return {Promise<string>} Su uid.
 */
export async function crearUsuaria(email) {
  const usuaria = await adminAuth.createUser({ email, password: CLAVE, emailVerified: true });
  return usuaria.uid;
}

/**
 * Inicia sesión como una usuaria con el SDK de cliente, igual que la app.
 * Todo lo que se haga con `db` pasa por las reglas con su token.
 * @param {string} email Correo de una usuaria creada con crearUsuaria().
 * @return {Promise<{db: object, auth: object, uid: string, cerrar: function(): Promise<void>}>}
 */
export async function sesion(email) {
  const app = iniciarCliente({ apiKey: 'fake-api-key', projectId: PROYECTO }, `cliente-${email}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:${PUERTO_AUTH}`, { disableWarnings: true });
  const db = firestoreCliente(app);
  connectFirestoreEmulator(db, HOST, PUERTO_FIRESTORE);
  const { user } = await signInWithEmailAndPassword(auth, email, CLAVE);
  return { db, auth, uid: user.uid, cerrar: () => cerrarCliente(app) };
}

/**
 * Cliente sin iniciar sesión, como la página de registro antes de crear la
 * cuenta. Todo lo que haga pasa por las reglas sin token.
 * @return {{db: object, cerrar: function(): Promise<void>}}
 */
export function clienteSinSesion() {
  const app = iniciarCliente({ apiKey: 'fake-api-key', projectId: PROYECTO }, `anonimo-${Math.random()}`);
  const db = firestoreCliente(app);
  connectFirestoreEmulator(db, HOST, PUERTO_FIRESTORE);
  return { db, cerrar: () => cerrarCliente(app) };
}

/**
 * Reintenta `fn` hasta que devuelva algo distinto de null/undefined/false.
 * Para esperar a los triggers de Functions, que llegan con retraso.
 * @param {function(): Promise<*>} fn Comprobación.
 * @param {{ms?: number, cada?: number, que?: string}} opciones
 * @return {Promise<*>} Lo que devolvió `fn` la primera vez que cumplió.
 */
export async function esperar(fn, { ms = 20000, cada = 250, que = 'la condición' } = {}) {
  const limite = Date.now() + ms;
  for (;;) {
    const valor = await fn();
    if (valor !== null && valor !== undefined && valor !== false) return valor;
    if (Date.now() > limite) throw new Error(`Pasaron ${ms} ms esperando ${que}.`);
    await new Promise((r) => setTimeout(r, cada));
  }
}

/** Cierra el Admin SDK para que el proceso de la prueba pueda terminar. */
export async function cerrarAdmin() {
  await adminDb.terminate();
  await deleteApp(admin);
}
