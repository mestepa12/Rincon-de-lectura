// Utilidades compartidas por los scripts de despliegue.
// Sin dependencias: solo Node. El proyecto es vanilla a propósito.
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';

const esWindows = process.platform === 'win32';

// En Windows los ejecutables de npm/firebase son .cmd, y desde Node 20
// spawn() se niega a lanzarlos sin shell (lanza EINVAL). Con shell los
// argumentos pasan por cmd.exe, así que antes se rechaza cualquiera que
// lleve metacaracteres: nada de lo que se pase puede encadenar comandos.
const METACARACTERES = [
  '&', '|', '<', '>', '^', '"', "'", '`', '$',
  '(', ')', '{', '}', '[', ']', '!', ';', '\n', '\r',
];

/**
 * Comprueba que los argumentos son seguros para pasar por el shell de
 * Windows. Lanza si alguno lleva metacaracteres.
 * @param {string[]} args Argumentos a validar.
 */
function validarArgumentos(args) {
  for (const a of args) {
    const texto = String(a);
    const malo = METACARACTERES.find((c) => texto.includes(c));
    if (malo) {
      throw new Error(`Argumento no permitido (metacaracter de shell "${malo}"): ${texto}`);
    }
  }
}

const binario = (nombre) => (esWindows ? `${nombre}.cmd` : nombre);

/**
 * Ejecuta un comando heredando stdin/stdout. Rechaza si el código != 0.
 * @param {string} cmd Nombre del ejecutable (sin extensión).
 * @param {string[]} args Argumentos.
 * @param {{capturar?: boolean, env?: object}} opciones capturar: además de
 *   mostrarla en vivo, devuelve la salida como string (para extraer la URL
 *   del canal). env: entorno del hijo (por defecto, el del proceso).
 * @return {Promise<string>} Salida capturada, o '' si capturar es false.
 */
export function ejecutar(cmd, args, { capturar = false, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    if (esWindows) {
      try {
        validarArgumentos(args);
      } catch (error) {
        reject(error);
        return;
      }
    }

    // Con shell:true spawn concatena los argumentos con espacios, así que un
    // argumento que lleve espacios (p. ej. el comando de `emulators:exec`)
    // se partiría en varios. Se entrecomilla. Es seguro: validarArgumentos()
    // ya ha rechazado cualquier comilla o metacaracter.
    const argsFinales = esWindows
      ? args.map((a) => (String(a).includes(' ') ? `"${a}"` : String(a)))
      : args;

    const hijo = spawn(binario(cmd), argsFinales, {
      stdio: capturar ? ['inherit', 'pipe', 'pipe'] : 'inherit',
      env,
      // En Windows hace falta shell para poder lanzar los .cmd (ver arriba);
      // en Linux/macOS no, y así los argumentos ni rozan el intérprete.
      shell: esWindows,
    });

    let salida = '';
    if (capturar) {
      // Tee: se muestra en vivo (el deploy tarda) y se guarda para parsear.
      hijo.stdout.on('data', (d) => { salida += d; process.stdout.write(d); });
      hijo.stderr.on('data', (d) => { salida += d; process.stderr.write(d); });
    }

    hijo.on('error', reject);
    hijo.on('close', (codigo) => {
      if (codigo === 0) resolve(salida);
      else reject(new Error(`${cmd} ${args.join(' ')} terminó con código ${codigo}`));
    });
  });
}

/**
 * Rama de git actual, o null si no se puede determinar.
 * @return {string|null}
 */
export function ramaActual() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Convierte un texto libre en un ID de canal válido para Firebase Hosting:
 * minúsculas, solo [a-z0-9-], sin guiones al principio ni al final, <= 63.
 * @param {string} texto Texto de origen (rama de git o argumento).
 * @return {string} ID de canal saneado.
 */
export function idCanal(texto) {
  return String(texto)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '') || 'preview';
}

export const color = {
  verde: (t) => `\x1b[32m${t}\x1b[0m`,
  rojo: (t) => `\x1b[31m${t}\x1b[0m`,
  amarillo: (t) => `\x1b[33m${t}\x1b[0m`,
  negrita: (t) => `\x1b[1m${t}\x1b[0m`,
};
