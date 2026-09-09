#!/usr/bin/env node
// Guardia de predeploy: corta cualquier despliegue a PRODUCCIÓN que no
// venga del flujo con confirmación.
//
// Se engancha en firebase.json como `predeploy` de hosting, firestore y
// functions, así que corre antes de subir nada. Un `firebase deploy
// --project prod` tecleado a mano falla aquí; `npm run deploy` pasa porque
// pone la variable de autorización después de que confirmes por escrito.
//
// Si alguna vez hace falta saltárselo (emergencia, CI), basta con:
//   RINCON_DESPLIEGUE_AUTORIZADO=1 firebase deploy --project prod
// Es deliberadamente algo que hay que escribir a conciencia.
import { PROD, AUTORIZACION } from './lib/proyectos.mjs';

// firebase-tools expone el proyecto de destino a los hooks de predeploy.
const objetivo = process.env.GCLOUD_PROJECT || process.env.PROJECT || '';

if (objetivo !== PROD) {
  // Destino que no es producción (o no se ha podido determinar): adelante.
  process.exit(0);
}

if (process.env[AUTORIZACION] === '1') {
  process.exit(0);
}

const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
console.error(rojo(`
╔══════════════════════════════════════════════════════════════╗
║  DESPLIEGUE A PRODUCCIÓN BLOQUEADO                            ║
╚══════════════════════════════════════════════════════════════╝

  Destino: ${objetivo}  (el proyecto real, con usuarias reales)

  Los despliegues a producción van por el flujo con confirmación:

      npm run deploy                  todo
      npm run deploy -- --only hosting

  Si querías desplegar al proyecto de desarrollo:

      npm run deploy:dev
      npm run reglas:dev
      npm run indices:dev
`));
process.exit(1);
