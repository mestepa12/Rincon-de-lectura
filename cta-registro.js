// Entrada de la home y de las páginas de contenido: mide los clics en
// "Crear cuenta" (sign_up_cta_click). Va aparte porque las páginas de
// contenido no cargan nada más de la app: así solo se llevan la analítica.
import { vigilarCtasRegistro } from './analitica.js';

vigilarCtasRegistro();
