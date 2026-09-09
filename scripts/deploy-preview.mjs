#!/usr/bin/env node
// Despliega el build a un canal de preview de Firebase Hosting.
//
//   npm run deploy:preview            -> canal con el nombre de la rama
//   npm run deploy:preview -- mi-test -> canal "mi-test"
//
// El canal caduca solo (CADUCIDAD) para que no se acumulen. Al terminar
// imprime la URL generada en grande, que es lo que se va a abrir.
import { ejecutar, ramaActual, idCanal, color } from './lib/proc.mjs';
import { PROD, AUTORIZACION } from './lib/proyectos.mjs';

// 7 días: el máximo que admite Hosting son 30. Una semana sobra para
// revisar un cambio y evita tener que limpiar canales a mano.
const CADUCIDAD = '7d';

const argumento = process.argv[2];
const canal = idCanal(argumento || ramaActual() || 'preview');

console.log(color.negrita(`\n▶ Canal de preview: ${canal} (caduca en ${CADUCIDAD})\n`));

try {
  await ejecutar('npm', ['run', 'build']);

  const salida = await ejecutar(
    'firebase',
    ['hosting:channel:deploy', canal, '--project', PROD, '--expires', CADUCIDAD],
    // Un canal de preview vive en el proyecto de producción pero no toca el
    // sitio en vivo, así que se autoriza al guardia de predeploy.
    { capturar: true, env: { ...process.env, [AUTORIZACION]: '1' } },
  );

  // La CLI imprime la URL en una línea de resumen; se extrae para poder
  // repetirla al final, cuando ya no hay que buscarla entre el ruido.
  const url = salida.match(/https:\/\/[a-z0-9-]+--[a-z0-9-]+\.web\.app/i)?.[0];

  const marco = '─'.repeat(60);
  console.log(`\n${color.verde(marco)}`);
  if (url) {
    console.log(color.verde(color.negrita('  URL del preview:')));
    console.log(color.verde(color.negrita(`  ${url}`)));
  } else {
    console.log(color.amarillo('  Despliegue correcto, pero no se pudo leer la URL'));
    console.log(color.amarillo(`  de la salida. Recupérala con:  firebase hosting:channel:open ${canal}`));
  }
  console.log(color.verde(`${marco}\n`));

  console.log(color.amarillo(
    'Recuerda: el canal usa el backend REAL (Firestore, Auth y Functions de\n' +
    'producción). Lo que crees o borres ahí toca datos de verdad.\n',
  ));
} catch (error) {
  console.error(color.rojo(`\n✗ ${error.message}\n`));
  process.exit(1);
}
