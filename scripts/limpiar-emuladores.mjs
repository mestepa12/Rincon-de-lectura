#!/usr/bin/env node
// Borra los datos persistidos de los emuladores (.emuladores/).
//
//   npm run emu:limpiar
//
// Solo toca ese directorio local. No hay ninguna ruta configurable ni
// variable de entorno que pueda apuntarlo a otro sitio.
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { color } from './lib/proc.mjs';

const DATOS = resolve(process.cwd(), '.emuladores');

if (!existsSync(DATOS)) {
  console.log(color.amarillo('\ni  No hay datos que borrar (.emuladores/ no existe).\n'));
  process.exit(0);
}

rmSync(DATOS, { recursive: true, force: true });
console.log(color.verde(`
✓ Borrado ${DATOS}

  La próxima vez que arranques con  npm run dev:emu  los emuladores
  saldrán vacíos. Vuelve a sembrar con  npm run emu:semilla
`));
