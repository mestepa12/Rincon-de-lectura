import { readFileSync } from 'node:fs'
import { defineConfig, minifySync } from 'vite'
import { ID_MEDICION } from './analitica-nucleo.js'

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
    children: `window['ga-disable-${ID_MEDICION}'] = true;`,
    injectTo: 'head-prepend',
  }],
})

// Consentimiento de cookies (ver la cabecera de consentimiento.js). Cada
// página lleva en el <head> la marca <!--consentimiento-->, después de
// <meta charset>: un script largo delante sacaría la declaración de los
// primeros 1024 bytes, y Lighthouse lo penaliza. Aquí se cambia por el script
// inline (minificado en el build). El banner va como HTML estático al
// principio del <body>, así es lo primero al tabular; el CSS lo oculta salvo
// con html.consentimiento-pendiente, que pone ese script antes de pintar:
// aparece en el primer fotograma y no mueve nada.
const MARCA_CONSENTIMIENTO = '<!--consentimiento-->'
const consentimiento = () => {
  let esBuild = false
  return {
    name: 'consentimiento',
    configResolved(config) { esBuild = config.command === 'build' },
    transformIndexHtml(html) {
      if (!html.includes(MARCA_CONSENTIMIENTO)) {
        if (html.includes('rinconConsentimiento')) {
          throw new Error('Una página usa rinconConsentimiento sin la marca <!--consentimiento--> en el <head>')
        }
        return html
      }
      // Se lee en cada página: en dev, un cambio se ve al recargar.
      const fuente = readFileSync(new URL('./consentimiento.js', import.meta.url), 'utf8')
        .replace('__CONFIG_CONSENTIMIENTO__', JSON.stringify({ idMedicion: ID_MEDICION }))
      let script = fuente
      if (esBuild) {
        const { code, errors } = minifySync('consentimiento.js', fuente)
        if (errors?.length) throw new Error(`consentimiento.js no minifica: ${errors[0].message}`)
        script = code
      }
      // cleanInternalUrls no reescribe enlaces con ancla: aquí va ya la forma
      // de cada entorno.
      const politica = esBuild ? '/privacidad#cookies' : '/privacidad.html#cookies'
      const banner = `<div id="consentimiento" class="consentimiento" role="region" aria-label="Cookies de análisis">
    <div class="consentimiento-texto">
        <p>Usamos Google Analytics para entender qué partes de la web se usan. Solo se activa si lo aceptas. Lo necesario para iniciar sesión y guardar tus preferencias no depende de esto. <a href="${politica}">Leer la política de cookies</a></p>
        <p class="consentimiento-actual" data-consentimiento-actual hidden></p>
    </div>
    <div class="consentimiento-botones">
        <button type="button" class="consentimiento-boton" data-consentimiento="rechazar">Rechazar</button>
        <button type="button" class="consentimiento-boton" data-consentimiento="aceptar">Aceptar</button>
    </div>
</div>`
      return html
        .replace(MARCA_CONSENTIMIENTO, () => `<script>${script}</script>`)
        .replace(/<body[^>]*>/, (body) => `${body}\n${banner}`)
    },
  }
}

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
  plugins: [cleanInternalUrls(), analiticaApagadaEnDev(), consentimiento(), ctaRegistroDiferido()],
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
