// Formatos de CSV que maneja la app. Están aquí, y no sueltos dentro de
// script.js, para que se puedan comprobar solos: el CSV que exportamos y el
// que importamos son formatos DISTINTOS, y conviene que eso quede fijado por
// una prueba en vez de por la memoria de quien lo escribió.

/** Cabeceras del CSV que exporta la app (en su orden). */
export const COLUMNAS_EXPORTACION = [
    'Título', 'Autor', 'Estado', 'Páginas totales', 'Página actual',
    'Valoración', 'Género', 'Notas', 'Ritmo narrativo', 'Estados de ánimo',
    'Portada', 'Enlace',
];

/**
 * Columnas sin las cuales un CSV de Goodreads no se puede leer. Si falta el
 * título no hay libro que crear: el importador descarta esas filas.
 */
export const COLUMNAS_GOODREADS_REQUERIDAS = ['Title'];

/** Etiqueta de la columna Estado para los libros que están en la papelera. */
export const ESTADO_CSV_PAPELERA = 'En papelera';

/**
 * ¿Estas cabeceras son las de un export de Goodreads?
 * @param {string[]} cabeceras Cabeceras leídas del fichero.
 * @return {boolean} true si se puede importar.
 */
export function esCsvGoodreads(cabeceras) {
    const set = new Set((cabeceras || []).map((c) => String(c).trim()));
    return COLUMNAS_GOODREADS_REQUERIDAS.every((c) => set.has(c));
}

/**
 * ¿Estas cabeceras son las del CSV que exporta esta misma app?
 * Sirve para dar un mensaje útil en vez del genérico "no se encontraron
 * libros válidos" cuando alguien intenta reimportar su propia copia.
 * @param {string[]} cabeceras Cabeceras leídas del fichero.
 * @return {boolean} true si el fichero es nuestro.
 */
export function esCsvPropio(cabeceras) {
    const set = new Set((cabeceras || []).map((c) => String(c).trim()));
    // Con Título y Estado basta: son nuestras y no existen en Goodreads.
    return set.has('Título') && set.has('Estado');
}

/**
 * Etiqueta de la columna Estado para cada sección. Es lo que escribe la
 * exportación; el importador del formato propio lo lee al revés.
 */
export const SECCIONES_CSV = {
    'leyendo-ahora': 'Leyendo ahora',
    'proximas-lecturas': 'Próximas lecturas',
    'libros-terminados': 'Terminados',
    'lista-deseos': 'Lista de deseos',
    'libros-abandonados': 'Abandonados',
};

const POR_ETIQUETA = new Map(
    Object.entries(SECCIONES_CSV).map(([seccion, etiqueta]) => [etiqueta.toLowerCase(), seccion]),
);

/**
 * Sección a la que corresponde una etiqueta de la columna Estado.
 * @param {string} etiqueta Valor leído del CSV.
 * @return {string|null} Nombre de sección, 'papelera', o null si no se
 *   reconoce (la fila irá a Próximas lecturas, que es el destino neutro).
 */
export function seccionDesdeEstado(etiqueta) {
    const limpio = String(etiqueta || '').trim().toLowerCase();
    if (!limpio) return null;
    if (limpio === ESTADO_CSV_PAPELERA.toLowerCase()) return 'papelera';
    return POR_ETIQUETA.get(limpio) || null;
}

/**
 * Convierte una fila del CSV propio en un libro.
 * Devuelve null si la fila no sirve (sin título): quien llame lo cuenta
 * como "no se ha podido leer" y lo enseña antes de escribir nada.
 * @param {object} fila Objeto {cabecera: valor} de una fila.
 * @return {{libro: object, destino: string}|null} Libro y destino.
 */
export function filaPropiaALibro(fila) {
    const texto = (c, max) => String(fila[c] ?? '').trim().slice(0, max);
    const numero = (c) => {
        const n = parseInt(String(fila[c] ?? '').trim(), 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    };

    const title = texto('Título', 300);
    if (!title) return null;

    // Celda vacía = el campo no estaba, no "vale cero". Escribir rating: 0
    // donde antes no había valoración deja el libro distinto de como estaba,
    // que es justo lo que una restauración no debe hacer.
    const valoracion = parseInt(String(fila['Valoración'] ?? '').trim(), 10);
    const tieneValoracion = Number.isFinite(valoracion) && valoracion > 0;

    const destino = seccionDesdeEstado(fila['Estado']) || 'proximas-lecturas';
    const animos = texto('Estados de ánimo', 400);

    return {
        destino,
        libro: {
            title,
            author: texto('Autor', 200),
            // El destino 'papelera' no es una sección válida en /books ni en
            // /papelera: el libro guarda la sección que tenía al borrarse.
            section: destino === 'papelera' ? 'lista-deseos' : destino,
            totalPages: numero('Páginas totales'),
            currentPage: numero('Página actual'),
            ...(tieneValoracion ? { rating: Math.min(5, valoracion) } : {}),
            genre: texto('Género', 100) || 'Sin género',
            notes: texto('Notas', 5000),
            ritmoNarrativo: texto('Ritmo narrativo', 30),
            estadosDeAnimo: animos ? animos.split(';').map((s) => s.trim()).filter(Boolean).slice(0, 20) : [],
            cover: texto('Portada', 1000),
            googleLink: texto('Enlace', 500),
            importedFrom: 'csv-propio',
        },
    };
}
