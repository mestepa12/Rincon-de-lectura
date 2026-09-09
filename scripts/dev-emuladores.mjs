#!/usr/bin/env node
// Levanta los emuladores de Firebase y el dev server de Vite a la vez.
//
//   npm run dev:emu
//
// Vite arranca en modo "emulador", que es lo único que define
// VITE_USE_EMULATORS=true (ver .env.emulador y firebase-init.js). Con
// `npm run dev` a secas la app sigue hablando con el backend real.
//
// Los datos viven en .emuladores/ (ignorado por git): se importan al
// arrancar y se exportan al salir, así las cuentas de prueba sobreviven a
// los reinicios. `npm run emu:limpiar` los borra.
import { mkdirSync, existsSync } from 'node:fs';
import { ejecutar, color } from './lib/proc.mjs';
import { entornoConJdk } from './lib/java.mjs';
import { PROD } from './lib/proyectos.mjs';

const DATOS = './.emuladores';

// --import falla si el directorio no existe, y la primera vez nunca existe.
if (!existsSync(DATOS)) {
  mkdirSync(DATOS, { recursive: true });
  console.log(color.amarillo(`\ni  Creado ${DATOS} (vacío: primera ejecución).`));
  console.log(color.amarillo('   Cuando arranque, siembra datos con:  npm run emu:semilla\n'));
}

// El emulador de Firestore necesita Java 21+. Si el del PATH no llega, se
// usa otro JDK instalado solo para este proceso.
const jdk = entornoConJdk();
if (jdk.aviso) console.log(color.amarillo(`i  ${jdk.aviso}
`));

console.log(color.negrita(`
  Emuladores        Auth :9099 · Firestore :8080 · Functions :5001
  Panel             http://127.0.0.1:4000
  App (Vite)        la URL que imprima Vite aquí abajo

  Ctrl+C para parar: los datos se exportan solos a ${DATOS}
`));

try {
  // emulators:exec mantiene los emuladores vivos mientras dure el comando
  // que se le pasa; al salir Vite, exporta los datos y los apaga. Hosting
  // queda fuera a propósito: el dev server de Vite ya sirve la app.
  await ejecutar('firebase', [
    'emulators:exec',
    // .firebaserc ya no tiene alias "default" (ver punto 3), así que el
    // proyecto va explícito. Se usa el ID de producción porque tiene que
    // coincidir con VITE_FIREBASE_PROJECT_ID de .env para que el cliente
    // encuentre los emuladores. Es solo una etiqueta local: nada sale de
    // esta máquina.
    '--project', PROD,
    '--only', 'auth,firestore,functions',
    `--import=${DATOS}`,
    // Con "=" a la fuerza: --export-on-exit admite valor opcional y, suelto,
    // se traga el comando siguiente ("missing required argument 'script'").
    `--export-on-exit=${DATOS}`,
    'vite --mode emulador',
  ], { env: jdk.env });
} catch (error) {
  // Ctrl+C hace que el comando salga con código != 0; no es un fallo.
  console.log(color.amarillo(`\n${error.message}\n`));
}
