#!/usr/bin/env node
// Pruebas que necesitan los emuladores (reglas, triggers de Functions).
//
//   npm run test:emu
//
// Arranca Auth, Firestore y Functions EN LIMPIO: sin --import ni --export,
// así que ni lee ni toca los datos de .emuladores/ que usa `npm run dev:emu`.
// Al terminar las pruebas, emulators:exec apaga los emuladores solo.
//
// Las pruebas (tests/emulador/) se niegan a correr si no las lanza este
// script: RINCON_TEST_EMULADOR es la señal. Así no acaban escribiendo en los
// datos guardados de un `dev:emu` que esté abierto.
//
// Van aparte de `npm test` porque sin emuladores fallarían.
import { ejecutar, color } from './lib/proc.mjs';
import { entornoConJdk } from './lib/java.mjs';
import { PROD } from './lib/proyectos.mjs';

// El emulador de Firestore necesita Java 21+ (ver scripts/lib/java.mjs).
const jdk = entornoConJdk();
if (jdk.aviso) console.log(color.amarillo(`i  ${jdk.aviso}\n`));

try {
  await ejecutar('firebase', [
    'emulators:exec',
    // Mismo ID que dev:emu: es solo una etiqueta local.
    '--project', PROD,
    '--only', 'auth,firestore,functions',
    'node --test tests/emulador/*.test.mjs',
  ], { env: { ...jdk.env, RINCON_TEST_EMULADOR: '1' } });
} catch (error) {
  console.error(color.rojo(`\n✗ ${error.message}\n`));
  process.exit(1);
}
