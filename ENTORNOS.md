# Entornos

Tres sitios donde puede correr esto, de menos a más real:

| | Dónde | Backend | Para qué |
|---|---|---|---|
| **Emuladores** | tu máquina | falso, local | probar sin miedo: reglas, Functions, datos |
| **Canal de preview** | `*.web.app` temporal | **el real** | revisar el front antes de publicarlo |
| **Producción** | `rinconlectura.es` | el real | lo que ven las 40 usuarias |

---

## 1. Emuladores en local

```bash
npm run dev:emu       # emuladores + Vite, todo junto
npm run emu:semilla   # cuentas de prueba con libros (en otra terminal)
```

Deja abierto `npm run dev:emu` y abre la URL que imprima Vite (suele ser
`http://localhost:5173`). Abajo a la izquierda verás una etiqueta naranja
**EMULADORES**: si no está, estás hablando con el backend real.

- Panel de los emuladores: <http://127.0.0.1:4000>
- Auth `:9099` · Firestore `:8080` · Functions `:5001`

### Cuentas de prueba

| Correo | Contraseña |
|---|---|
| `ana@prueba.test` | `prueba1234` |
| `bea@prueba.test` | `prueba1234` |

Vienen con el email ya verificado (la app exige verificación para entrar a
la biblioteca) y con libros repartidos entre las secciones.

### Datos: guardar y limpiar

Los datos viven en `.emuladores/` (ignorado por git). Se importan al
arrancar y se exportan al salir con Ctrl+C.

```bash
npm run emu:exportar  # guardar ahora, sin cerrar
npm run emu:limpiar   # borrar todo y empezar de cero
```

Si cierras la terminal a lo bruto en vez de con Ctrl+C, el export no llega
a ejecutarse. `npm run emu:exportar` de vez en cuando cubre eso.

### Cómo sé que no estoy tocando lo real

Hacen falta **tres** condiciones a la vez para que el cliente hable con los
emuladores (`firebase-init.js`):

1. `import.meta.env.DEV` — solo cierto con el dev server de Vite.
2. `VITE_USE_EMULATORS=true` — solo lo define `.env.emulador`, que solo se
   carga con `vite --mode emulador`, que es lo que hace `npm run dev:emu`.
3. El `hostname` es local.

La primera es la que cierra la puerta de verdad: Vite sustituye
`import.meta.env.DEV` por el literal `false` al compilar, así que en un
build de producción todo ese bloque es código muerto y desaparece del
bundle. Se puede comprobar:

```bash
npm run build && grep -r "9099\|connectAuthEmulator" dist/
# sin resultados
```

Y al revés: `npm run dev` a secas **no** cumple la condición 2, así que
sigue apuntando al backend real, igual que siempre.

### Java

El emulador de Firestore necesita un JDK 21+. Si el `java` del PATH es más
viejo, `npm run dev:emu` busca uno válido entre los sitios habituales (entre
ellos el que trae Android Studio) y se lo pasa **solo a ese proceso**, sin
tocar ninguna variable del sistema. Te lo dice al arrancar. Si no encuentra
ninguno, instala Temurin 21 o define `JAVA_HOME`.

---

## 2. Canales de preview

```bash
npm run deploy:preview            # canal con el nombre de la rama
npm run deploy:preview -- mi-test # canal con nombre a mano
npm run canales                   # ver los que hay y cuándo caducan
npm run canal:borrar CANAL        # borrar uno
```

Imprime la URL al terminar. Los canales **caducan a los 7 días** solos.

### Qué reproduce y qué no

Reproduce igual que producción: `cleanUrls`, las cabeceras (CSP incluida),
las redirecciones y los rewrites — toda la config de `hosting` se despliega
por canal.

Lo que **no**:

- **El backend es el de producción.** Firestore, Auth y Functions son los
  reales. Si te logueas en un canal, entras con tu cuenta de verdad y lo
  que escribas se guarda de verdad. Para trastear con datos, emuladores.
- **Los cambios en Functions no se ven.** El rewrite de
  `/api/buscar-libros` apunta a la función ya desplegada en producción. Para
  poder previsualizar también la función haría falta `"pinTag": true` en el
  rewrite, y eso exige un despliegue a producción primero.
- **El buscador de libros usa el segundo escalón.** La key de Google Books
  está restringida por referrer a los dominios de producción, así que la
  llamada directa devuelve `403 API_KEY_HTTP_REFERRER_BLOCKED` y el cliente
  cae al proxy de la Cloud Function (que pone el `Referer` bueno desde el
  servidor). Funciona, pero por otra ruta que en producción.

Al desplegar un canal, la CLI añade su URL a los dominios autorizados de
Firebase Auth del proyecto real. Es necesario para que funcione el login;
se puede evitar con `--no-authorized-domains`, a cambio de no poder entrar.

---

## 3. Producción

```bash
npm run deploy
```

Pide una confirmación escrita con un código aleatorio distinto en cada
ejecución: no vale de memoria ni con la flecha arriba. Aborta si no hay
terminal interactiva, así que tampoco se puede automatizar.

Antes de pedirla enseña qué se va a desplegar, a qué proyecto, en qué rama
estás y si hay cambios sin commitear.

Para desplegar solo una parte:

```bash
npm run deploy -- --only hosting
```
