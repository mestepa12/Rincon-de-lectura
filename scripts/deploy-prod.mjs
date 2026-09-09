#!/usr/bin/env node
// Despliegue a PRODUCCIÓN con confirmación escrita obligatoria.
//
//   npm run deploy                 -> hosting + functions + reglas (como antes)
//   npm run deploy -- --only hosting
//
// El código de confirmación es aleatorio en cada ejecución: no se puede
// teclear de memoria ni recuperar con la flecha arriba de la terminal.
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ejecutar, ramaActual, color } from './lib/proc.mjs';

// El proyecto real, escrito aquí a propósito: el despliegue pasa --project
// con este valor, así que da igual a qué apunte `firebase use` en ese
// momento. Ni un alias mal puesto ni un .firebaserc editado lo desvían.
const PROYECTO_PROD = 'mi-rincon-de-lectura';
const RAMA_ESPERADA = 'main';

/** @return {string[]} Argumentos extra para firebase deploy (p. ej. --only). */
function argumentosExtra() {
  return process.argv.slice(2);
}

/** @return {string} Resumen del estado del árbol de trabajo. */
function estadoGit() {
  try {
    const sucio = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
    if (!sucio) return color.verde('limpio');
    const n = sucio.split('\n').length;
    return color.amarillo(`${n} fichero(s) sin commitear`);
  } catch {
    return 'desconocido';
  }
}

// Sin terminal interactiva no hay confirmación posible: se aborta en vez de
// dar por buena una respuesta vacía. Evita `echo si | npm run deploy`.
if (!process.stdin.isTTY) {
  console.error(color.rojo(
    '\n✗ Este script exige confirmación interactiva y no hay terminal.\n' +
    '  No se puede automatizar el despliegue a producción a propósito.\n',
  ));
  process.exit(1);
}

const rama = ramaActual();
const extra = argumentosExtra();
const objetivos = extra.length ? extra.join(' ') : 'TODO (hosting + functions + firestore)';
const codigo = randomBytes(3).toString('hex');

console.log(`
${color.rojo('╔══════════════════════════════════════════════════════════════╗')}
${color.rojo('║')}            ${color.negrita('DESPLIEGUE A PRODUCCIÓN')}                           ${color.rojo('║')}
${color.rojo('╚══════════════════════════════════════════════════════════════╝')}

  Proyecto ....... ${color.negrita(PROYECTO_PROD)}
  Sitio .......... https://rinconlectura.es
  Se despliega ... ${color.negrita(objetivos)}
  Rama ........... ${rama === RAMA_ESPERADA ? color.verde(rama) : color.amarillo(`${rama} (se esperaba ${RAMA_ESPERADA})`)}
  Git ............ ${estadoGit()}
  ${color.amarillo('Esto lo ven las usuarias reales en cuanto termine.')}
  ${color.amarillo('Si solo quieres revisarlo tú:  npm run deploy:preview')}
`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const respuesta = await rl.question(
  `  Para continuar, escribe ${color.negrita(`desplegar ${codigo}`)}\n  > `,
);
rl.close();

if (respuesta.trim() !== `desplegar ${codigo}`) {
  console.log(color.verde('\n✓ Cancelado. No se ha tocado producción.\n'));
  process.exit(1);
}

try {
  await ejecutar('npm', ['run', 'build']);
  await ejecutar('firebase', ['deploy', '--project', PROYECTO_PROD, ...extra]);
  console.log(color.verde('\n✓ Desplegado a producción.\n'));
} catch (error) {
  console.error(color.rojo(`\n✗ ${error.message}\n`));
  process.exit(1);
}
