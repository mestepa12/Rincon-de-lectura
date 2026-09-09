// Localiza un JDK 21+ para los emuladores.
//
// El emulador de Firestore corre sobre Java y firebase-tools exige la
// versión 21 o superior. En esta máquina el `java` del PATH es un JRE 8,
// así que en vez de pedir que se toquen variables del sistema se busca un
// JDK válido entre los sitios habituales y se le pasa SOLO al proceso hijo.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MINIMA = 21;

/**
 * Versión mayor del JDK de un directorio, o 0 si no hay java utilizable.
 * @param {string} inicio Directorio raíz del JDK (el que contiene bin/).
 * @return {number} Versión mayor (21, 17, 8...) o 0.
 */
function version(inicio) {
  const exe = join(inicio, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!existsSync(exe)) return 0;
  return preguntarVersion(exe);
}

/**
 * Ejecuta `<exe> -version` y devuelve la versión mayor.
 * Ojo: java escribe la versión en stderr y sale con código 0, así que hay
 * que mirar los dos flujos (con execFileSync solo se veía stdout: vacío).
 * @param {string} exe Ruta del ejecutable java.
 * @return {number} Versión mayor, o 0.
 */
function preguntarVersion(exe) {
  const r = spawnSync(exe, ['-version'], { encoding: 'utf8' });
  if (r.error) return 0;
  return mayor(`${r.stdout || ''}${r.stderr || ''}`);
}

/**
 * Extrae la versión mayor de la salida de `java -version`.
 * Contempla el formato antiguo ("1.8.0_461" = 8) y el moderno ("21.0.10").
 * @param {string} texto Salida de java -version.
 * @return {number} Versión mayor, o 0 si no se reconoce.
 */
function mayor(texto) {
  const m = texto.match(/version "(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  const primero = Number(m[1]);
  return primero === 1 ? Number(m[2] || 0) : primero;
}

/**
 * Candidatos donde suele haber un JDK, en orden de preferencia.
 * @return {string[]} Rutas de directorios de JDK.
 */
function candidatos() {
  const lista = [];
  if (process.env.JAVA_HOME) lista.push(process.env.JAVA_HOME);

  const padres = process.platform === 'win32'
    ? [
      'C:/Program Files/Android/Android Studio/jbr',
      'C:/Program Files/Eclipse Adoptium',
      'C:/Program Files/Java',
      'C:/Program Files/Microsoft',
      'C:/Program Files/Zulu',
    ]
    : ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines'];

  for (const padre of padres) {
    if (!existsSync(padre)) continue;
    // El jbr de Android Studio ya es un JDK; los demás son directorios que
    // contienen uno por versión instalada.
    if (existsSync(join(padre, 'bin'))) {
      lista.push(padre);
      continue;
    }
    try {
      for (const hijo of readdirSync(padre)) {
        lista.push(join(padre, hijo));
        // macOS mete el JDK bajo Contents/Home.
        lista.push(join(padre, hijo, 'Contents', 'Home'));
      }
    } catch { /* directorio ilegible: se ignora */ }
  }
  return lista;
}

/**
 * Devuelve el entorno con el que lanzar los emuladores. Si el `java` del
 * PATH ya sirve, no se toca nada; si no, se antepone un JDK 21+ al PATH
 * del proceso hijo (nunca al del sistema).
 * @return {{env: object, aviso: string|null, ruta: string|null}}
 */
export function entornoConJdk() {
  const enPath = preguntarVersion('java');

  if (enPath >= MINIMA) return { env: process.env, aviso: null, ruta: null };

  for (const ruta of candidatos()) {
    if (version(ruta) < MINIMA) continue;
    const sep = process.platform === 'win32' ? ';' : ':';
    return {
      ruta,
      env: {
        ...process.env,
        JAVA_HOME: ruta,
        PATH: `${join(ruta, 'bin')}${sep}${process.env.PATH}`,
      },
      aviso: `Java del PATH: ${enPath || 'ninguno'} (hace falta ${MINIMA}+). Usando ${ruta}`,
    };
  }

  return {
    ruta: null,
    env: process.env,
    aviso: `No se ha encontrado ningún JDK ${MINIMA}+. El emulador de Firestore no arrancará.\n` +
      '   Instala uno (p. ej. Temurin 21) o define JAVA_HOME apuntando a él.',
  };
}
