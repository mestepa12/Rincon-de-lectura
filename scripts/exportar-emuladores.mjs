#!/usr/bin/env node
// Exporta los datos de los emuladores a .emuladores/ sin arriesgarlos.
//
//   npm run emu:exportar
//
// `firebase emulators:export --force` borra el directorio destino ANTES de
// pedir la exportación, así que si la exportación falla te quedas sin la
// copia vieja y sin la nueva. Pasó de verdad. Aquí se exporta primero a un
// directorio temporal y solo se sustituye el bueno si ha ido bien.
import { existsSync, rmSync, renameSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { ejecutar, color } from './lib/proc.mjs';
import { PROD } from './lib/proyectos.mjs';

// Rutas RELATIVAS al pasarlas a la CLI: con una ruta absoluta el emulador
// de Firestore responde "Export request failed" (comprobado). Para las
// operaciones de fichero se usan las absolutas de abajo.
const TEMPORAL_REL = './.emuladores-nuevo';
const DESTINO = resolve(process.cwd(), '.emuladores');
const TEMPORAL = resolve(process.cwd(), '.emuladores-nuevo');
const ANTERIOR = resolve(process.cwd(), '.emuladores-anterior');

const limpiar = (ruta) => { if (existsSync(ruta)) rmSync(ruta, { recursive: true, force: true }); };

limpiar(TEMPORAL);
limpiar(ANTERIOR);

try {
  // Sin entorno de JDK: exportar es una petición HTTP al hub, no arranca Java.
  await ejecutar('firebase', ['emulators:export', TEMPORAL_REL, '--project', PROD]);
} catch (error) {
  limpiar(TEMPORAL);
  console.error(color.rojo(`
✗ La exportación ha fallado. ${error.message}

  Los datos anteriores siguen intactos en .emuladores/
  ¿Están los emuladores levantados?  npm run dev:emu
`));
  process.exit(1);
}

// Llegados aquí la copia NUEVA ya está completa en TEMPORAL, así que
// sustituir la vieja es seguro: pase lo que pase, los datos existen.
// (Renombrar el destino a un ".anterior" no vale en Windows: el emulador
// mantiene abierto el directorio del que importó y el rename da EPERM.)
if (!existsSync(TEMPORAL)) {
  console.error(color.rojo('\n✗ La exportación dijo que fue bien pero no ha dejado ficheros.\n'));
  process.exit(1);
}

limpiar(DESTINO);
try {
  renameSync(TEMPORAL, DESTINO);
} catch {
  // Si el rename tampoco puede, se copia: más lento pero no deja al usuario
  // con los datos en un directorio con nombre raro.
  cpSync(TEMPORAL, DESTINO, { recursive: true });
  limpiar(TEMPORAL);
}

console.log(color.verde('\n✓ Datos exportados a .emuladores/\n'));
