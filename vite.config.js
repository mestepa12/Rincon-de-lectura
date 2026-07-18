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
      .replace(/href="(login|register|quiz|privacidad|biblioteca)\.html"/g, 'href="/$1"')
      .replace(/location\.replace\('biblioteca\.html'\)/g, "location.replace('/biblioteca')")
  }
})

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [cleanInternalUrls()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        biblioteca: 'biblioteca.html',
        login: 'login.html',
        register: 'register.html',
        privacidad: 'privacidad.html',
        quiz: 'quiz.html',
        404: '404.html',
      }
    }
  }
})
