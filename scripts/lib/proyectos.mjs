// Los IDs de los proyectos de Firebase salen SIEMPRE de .firebaserc.
//
// Un solo sitio donde estén escritos: si el proyecto de desarrollo acaba
// teniendo otro ID, se cambia esa línea y todos los scripts se enteran.
// Ninguno lleva un ID a mano ni lo lee de una variable de entorno.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const RC = resolve(process.cwd(), '.firebaserc');

/**
 * ID del proyecto de Firebase asociado a un alias de .firebaserc.
 * @param {'dev'|'prod'} alias Alias a resolver.
 * @return {string} ID del proyecto.
 */
export function proyecto(alias) {
  let rc;
  try {
    rc = JSON.parse(readFileSync(RC, 'utf8'));
  } catch (error) {
    throw new Error(`No se puede leer .firebaserc: ${error.message}`);
  }

  const id = rc?.projects?.[alias];
  if (!id) {
    throw new Error(
      `.firebaserc no tiene el alias "${alias}".\n` +
      `  Alias disponibles: ${Object.keys(rc?.projects || {}).join(', ') || '(ninguno)'}\n` +
      '  Añádelo con:  firebase use --add',
    );
  }
  return id;
}

/** ID del proyecto de producción. */
export const PROD = proyecto('prod');

// Variable que los scripts de despliegue ponen para que el guardia de
// predeploy sepa que la orden viene de un flujo con confirmación y no de
// un `firebase deploy` suelto. Ver scripts/guardia-produccion.mjs.
export const AUTORIZACION = 'RINCON_DESPLIEGUE_AUTORIZADO';

/**
 * Averigua contra qué proyecto se construyó el dist/ que hay en disco.
 * La config de Firebase se inlinea en tiempo de build (import.meta.env),
 * así que el bundle dice sin ambigüedad de dónde viene.
 *
 * Ojo con las comillas: el minificador de Vite 8 emite literales con
 * backtick (`projectId:\`mi-rincon-de-lectura\``), no con comillas, así que
 * hay que mirar las tres formas o esto no encuentra nada.
 * @param {string[]} candidatos IDs de proyecto a buscar, por prioridad.
 * @return {string|null} ID encontrado, o null si no hay build o no se ve.
 */
export function proyectoDelBundle(candidatos) {
  const dir = join('dist', 'assets');
  if (!existsSync(dir)) return null;

  const ficheros = readdirSync(dir).filter((f) => f.endsWith('.js'));
  const comillas = ['`', '"', "'"];

  // Primero la forma precisa (projectId: "..."), que no puede confundirse
  // con el dominio del proxy ni con authDomain.
  for (const fichero of ficheros) {
    const texto = readFileSync(join(dir, fichero), 'utf8');
    for (const id of candidatos.filter(Boolean)) {
      for (const c of comillas) {
        if (texto.includes(`projectId:${c}${id}${c}`)) return id;
        if (texto.includes(`projectId: ${c}${id}${c}`)) return id;
      }
    }
  }
  return null;
}
