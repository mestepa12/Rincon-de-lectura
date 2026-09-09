#!/usr/bin/env node
// ¿A qué proyecto apunta cada cosa ahora mismo?
//
//   npm run proyecto
//
// Existe porque la pregunta "¿esto va a tocar producción?" no debería
// contestarse de memoria. Ningún comando depende de un estado invisible:
// todos llevan --project explícito, y aquí se ve cuál.
import { existsSync } from 'node:fs';
import { proyecto, PROD, proyectoDelBundle } from './lib/proyectos.mjs';
import { color } from './lib/proc.mjs';

let DEV = null;
let errorDev = null;
try {
  DEV = proyecto('dev');
} catch (error) {
  errorDev = error.message;
}

const filas = [
  ['npm run dev', 'backend REAL', PROD],
  ['npm run dev:emu', 'emuladores locales', 'nada sale de esta máquina'],
  ['npm run build', 'build de producción', PROD],
  ['npm run build:dev', 'build de desarrollo', DEV || '(alias dev sin resolver)'],
  ['npm run deploy:preview', 'canal temporal', PROD],
  ['npm run deploy:dev', 'desarrollo', DEV || '(alias dev sin resolver)'],
  ['npm run reglas:dev', 'reglas a desarrollo', DEV || '(alias dev sin resolver)'],
  ['npm run indices:dev', 'índices a desarrollo', DEV || '(alias dev sin resolver)'],
  ['npm run deploy', 'PRODUCCIÓN (pide confirmación)', PROD],
];

const anchoCmd = Math.max(...filas.map((f) => f[0].length));
const anchoQue = Math.max(...filas.map((f) => f[1].length));

console.log(`
${color.negrita('  Alias en .firebaserc')}
    prod  ->  ${color.rojo(PROD)}
    dev   ->  ${DEV ? color.verde(DEV) : color.amarillo('sin definir')}
    ${color.amarillo('(no hay alias "default": un `firebase deploy` suelto no sabe a dónde ir)')}

${color.negrita('  Qué toca cada comando')}
${filas.map(([cmd, que, destino]) => {
    const pinta = destino === PROD ? color.rojo : color.verde;
    return `    ${cmd.padEnd(anchoCmd)}  ${que.padEnd(anchoQue)}  ${pinta(destino)}`;
  }).join('\n')}
`);

const bundle = proyectoDelBundle([DEV, PROD]);
console.log(`${color.negrita('  Estado')}
    .env.dev ................ ${existsSync('.env.dev') ? color.verde('presente') : color.amarillo('no existe (npm run deploy:dev fallará)')}
    firestore.indexes.json .. ${existsSync('firestore.indexes.json') ? color.verde('presente') : color.amarillo('no existe')}
    dist/ construido contra . ${bundle ? (bundle === PROD ? color.rojo(bundle) : color.verde(bundle)) : color.amarillo('no hay build')}
`);

if (errorDev) {
  console.log(color.amarillo(`  Aviso sobre el alias dev:\n  ${errorDev}\n`));
}
