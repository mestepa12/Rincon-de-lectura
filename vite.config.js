import { defineConfig } from 'vite'

// En producción Firebase Hosting sirve URLs limpias (cleanUrls: true) y
// redirige "X.html" -> "/X" con un 301. Los enlaces internos usan "X.html"
// para que funcionen en el dev server de Vite, así que en el build se
// reescriben a la forma limpia y se ahorra ese 301 en cada clic/rastreo.
const cleanInternalUrls = () => ({
  name: 'clean-internal-urls',
  apply: 'build',
  transformIndexHtml(html) {
    return html
      .replace(/href="index\.html"/g, 'href="/"')
      .replace(/href="(login|register|quiz|privacidad|biblioteca|vs-goodreads|tropos-literarios|app-registro-lecturas|importar-goodreads|cuantas-paginas-leer-al-dia|estadisticas-de-lectura)\.html"/g, 'href="/$1"')
      .replace(/location\.replace\('biblioteca\.html'\)/g, "location.replace('/biblioteca')")
  }
})

// El dev server (npm run dev y npm run dev:emu) sirve el mismo snippet de
// gtag que producción, así que cada visita a localhost mandaba page_view y
// session_start reales a la propiedad de Analytics. ga-disable-<ID> es el
// interruptor oficial de Google: con él puesto antes del snippet, gtag.js
// no envía nada. Solo en serve: el build no cambia. Los eventos propios ya
// los corta analitica.js por su cuenta.
const analiticaApagadaEnDev = () => ({
  name: 'analitica-apagada-en-dev',
  apply: 'serve',
  transformIndexHtml: () => [{
    tag: 'script',
    children: "window['ga-disable-G-C3LTR2R6B5'] = true;",
    injectTo: 'head-prepend',
  }],
})

// Las páginas de contenido solo cargan de la app cta-registro.js (el clic en
// "Crear cuenta"). Como <script type="module">, sea diferido, async o vaya al
// final, el navegador lo pide al leer el HTML y Lighthouse lo mete en su
// simulación del primer pintado: +150 ms y un punto menos en cada página SEO,
// medido. Así que se pide como gtag.js: cuando la página ya ha pintado y el
// hilo queda libre, o al primer toque. En el HTML fuente va la marca
// <!--cta-registro-->; en el build se cambia por el cargador con el nombre
// con hash del chunk, y en dev por el script normal.
const MARCA_CTA = '<!--cta-registro-->'
const ctaRegistroDiferido = () => {
  let esBuild = false
  return {
    name: 'cta-registro-diferido',
    configResolved(config) { esBuild = config.command === 'build' },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!html.includes(MARCA_CTA)) return html
        if (!esBuild) return html.replace(MARCA_CTA, '<script type="module" src="/cta-registro.js"></script>')
        const chunk = Object.values(ctx.bundle || {}).find((c) =>
          c.type === 'chunk' && c.isEntry && /[\\/]cta-registro\.js$/.test(c.facadeModuleId || ''))
        if (!chunk) throw new Error('cta-registro.js no está en el bundle: falta en rollupOptions.input')
        return html.replace(MARCA_CTA, `<script>
  (function () {
    var pedido = false;
    function cargar() {
      if (pedido) return;
      pedido = true;
      var s = document.createElement('script');
      s.type = 'module';
      s.src = '/${chunk.fileName}';
      document.head.appendChild(s);
    }
    function programar() {
      if ('requestIdleCallback' in window) requestIdleCallback(cargar, { timeout: 4000 });
      else setTimeout(cargar, 1500);
    }
    if (document.readyState === 'complete') programar();
    else window.addEventListener('load', programar, { once: true });
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      window.addEventListener(ev, cargar, { once: true, passive: true });
    });
  })();
</script>`)
      },
    },
  }
}

export default defineConfig({
  base: '/',
  plugins: [cleanInternalUrls(), analiticaApagadaEnDev(), ctaRegistroDiferido()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        biblioteca: 'biblioteca.html',
        login: 'login.html',
        register: 'register.html',
        onboarding: 'onboarding.html',
        privacidad: 'privacidad.html',
        quiz: 'quiz.html',
        vsgoodreads: 'vs-goodreads.html',
        tropos: 'tropos-literarios.html',
        appregistrolecturas: 'app-registro-lecturas.html',
        importargoodreads: 'importar-goodreads.html',
        cuantaspaginasleeraldia: 'cuantas-paginas-leer-al-dia.html',
        estadisticasdelectura: 'estadisticas-de-lectura.html',
        404: '404.html',
        // Entrada propia: las páginas de contenido la piden en diferido
        // (ver ctaRegistroDiferido) y necesitan su nombre con hash.
        ctaregistro: 'cta-registro.js',
      }
    }
  }
})
