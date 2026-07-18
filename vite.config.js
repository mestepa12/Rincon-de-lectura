import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.VITE_BASE || '/',
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
