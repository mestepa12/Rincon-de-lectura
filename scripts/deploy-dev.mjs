#!/usr/bin/env node
// Despliegue al proyecto de DESARROLLO.
//
//   npm run deploy:dev                     hosting + functions + firestore
//   npm run deploy:dev -- --only hosting
//   npm run reglas:dev                     solo las reglas de Firestore
//   npm run indices:dev                    solo los índices
//
// Sin confirmación: aquí no hay usuarias. Lo que sí hay es una comprobación
// de que el build que se va a subir apunta de verdad al proyecto de
// desarrollo, para que un dist/ viejo construido contra producción no acabe
// desplegado aquí (ni al revés).
import { ejecutar, color } from './lib/proc.mjs';
import { proyecto, PROD, proyectoDelBundle } from './lib/proyectos.mjs';

const DEV = proyecto('dev');
const extra = process.argv.slice(2);

// Reglas e índices no llevan front. Exigir un build para desplegarlos
// obligaría a tener .env.dev con credenciales que ahí no pintan nada, así
// que solo se construye si el despliegue incluye hosting.
const iOnly = extra.indexOf('--only');
const objetivos = iOnly === -1 ? null : (extra[iOnly + 1] || '');
const necesitaBuild = objetivos === null
    || objetivos.split(',').some((o) => o === 'hosting' || o.startsWith('hosting:'));

console.log(color.negrita(`\n▶ Desplegando a DESARROLLO: ${DEV}`));
console.log(color.negrita(`  ${objetivos || 'todo (hosting + functions + firestore)'}\n`));

try {
  if (necesitaBuild) {
    // El build de dev carga .env y encima .env.dev, que es donde viven las
    // credenciales del proyecto de desarrollo.
    await ejecutar('npm', ['run', 'build:dev']);
  }

  const enBundle = necesitaBuild ? proyectoDelBundle([DEV, PROD]) : null;
  if (enBundle === PROD) {
    console.error(color.rojo(`
✗ El build apunta a PRODUCCIÓN (${PROD}) pero ibas a desplegarlo a ${DEV}.

  Falta .env.dev con la configuración del proyecto de desarrollo, o sus
  valores VITE_FIREBASE_* siguen siendo los de producción.
  Copia .env.dev.example y rellénalo con los datos de ${DEV}.
`));
    process.exit(1);
  }
  if (necesitaBuild && enBundle === null) {
    console.log(color.amarillo('i  No se ha podido leer el projectId del bundle; se continúa.'));
  }

  await ejecutar('firebase', ['deploy', '--project', DEV, ...extra]);
  console.log(color.verde(`\n✓ Desplegado a ${DEV}.\n`));
} catch (error) {
  console.error(color.rojo(`\n✗ ${error.message}\n`));
  process.exit(1);
}
