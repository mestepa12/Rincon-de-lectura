# Entornos

Cuatro sitios donde puede correr esto, de menos a más real:

| | Dónde | Backend | Para qué |
|---|---|---|---|
| **Emuladores** | tu máquina | falso, local | probar sin miedo: reglas, Functions, datos |
| **Canal de preview** | `*.web.app` temporal | **el de producción** | revisar el front antes de publicarlo |
| **Proyecto dev** | `rincon-de-lectura-dev` | propio, de mentira | reglas, índices y Functions desplegados de verdad |
| **Producción** | `rinconlectura.es` | el real | lo que ven las 40 usuarias |

## ¿A qué proyecto apunto ahora mismo?

```bash
npm run proyecto
```

Saca una tabla con qué toca cada comando, si existe `.env.dev` y contra qué
proyecto se construyó el `dist/` que hay en disco.

La respuesta corta: **ninguno por defecto**. `.firebaserc` no tiene alias
`default` y la CLI no tiene proyecto activo, así que un `firebase deploy`
suelto no sabe a dónde ir. Todos los comandos de este repo pasan
`--project` explícito.

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
a ejecutarse. `npm run emu:exportar` de vez en cuando cubre eso. Ojo: un
`emulators:export --force` interrumpido borra el directorio destino antes
de escribir, así que puede dejarte sin nada.

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

Los emuladores arrancan con el ID de proyecto de producción porque tiene
que coincidir con `VITE_FIREBASE_PROJECT_ID` de `.env` para que el cliente
los encuentre. Es solo una etiqueta local; no sale nada de la máquina.

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
  que escribas se guarda de verdad. Para trastear con datos, emuladores;
  para trastear con reglas o Functions desplegadas, el proyecto dev.
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

## 3. Proyecto de desarrollo

Para cuando haya que cambiar reglas de Firestore, índices o Functions y
quieras probarlo desplegado de verdad antes de tocar producción.

### Crearlo (una vez, en la consola)

1. <https://console.firebase.google.com> → **Añadir proyecto**.
2. Nombre: `Rincon de lectura dev`. Debajo del nombre la consola enseña el
   **ID generado**: edítalo y ponlo en `rincon-de-lectura-dev`, que es el
   que espera `.firebaserc`. Si está cogido, elige otro y cambia esa línea
   de `.firebaserc` — es el único sitio donde está escrito.
3. Google Analytics: **desactivar**. No hace falta en dev y evita enganchar
   una propiedad de GA.
4. Ya dentro: **Compilación → Firestore Database → Crear base de datos**,
   modo producción, región `eur3 (europe-west)`. **La región no se puede
   cambiar después.**
5. **Compilación → Authentication → Comenzar** y habilitar los mismos
   proveedores que producción: **Correo electrónico/contraseña** y
   **Google** (`auth.js:110` usa `signInWithPopup` con `GoogleAuthProvider`).
6. **Configuración del proyecto → Tus apps → Web (`</>`)**, registra una app
   (`Rincon de lectura dev`) y copia los valores de `firebaseConfig`.
7. `cp .env.dev.example .env.dev` y pega ahí esos valores. `.env.dev` está
   ignorado por git.

**Sobre Cloud Functions:** desplegar Functions exige plan **Blaze** (pago
por uso) también en el proyecto de dev. Si solo vas a tocar reglas e
índices, con el plan Spark gratuito te vale y puedes saltarte esto. Si
quieres Functions en dev, hay que activar Blaze en ese proyecto: el uso
real de un entorno de pruebas cae de sobra dentro del nivel gratuito
(2 M invocaciones/mes), pero es una decisión de facturación tuya.

### Usarlo

```bash
npm run reglas:dev    # solo reglas de Firestore
npm run indices:dev   # solo índices
npm run deploy:dev    # todo (hosting + functions + firestore)
npm run deploy:dev -- --only functions
```

`build:dev` carga `.env` y **encima** `.env.dev`, así que basta con poner en
`.env.dev` lo que cambia entre proyectos. Antes de subir nada,
`deploy:dev` mira qué `projectId` quedó incrustado en el bundle y aborta si
resulta ser el de producción: un `dist/` viejo no se cuela.

`firestore.indexes.json` está vacío a propósito — producción tampoco tiene
índices compuestos. Cuando crees uno, captúralo con:

```bash
firebase firestore:indexes --project dev > firestore.indexes.json
```

---

## 4. Producción

```bash
npm run deploy
npm run deploy -- --only hosting
```

Pide una confirmación escrita con un código aleatorio distinto en cada
ejecución: no vale de memoria ni con la flecha arriba. Aborta si no hay
terminal interactiva, así que tampoco se puede automatizar.

Antes de pedirla enseña qué se va a desplegar, a qué proyecto, en qué rama
estás y si hay cambios sin commitear.

### Por qué no se puede desplegar a producción por error

Tres capas, y la tercera es la que de verdad cierra:

1. **`.firebaserc` sin alias `default`** y sin proyecto activo en la CLI.
   Un `firebase deploy` suelto no sabe a dónde ir.
2. **Todos los scripts pasan `--project`**, resuelto desde `.firebaserc`.
   Ninguno depende de un estado invisible.
3. **Un guardia de `predeploy`** (`scripts/guardia-produccion.mjs`),
   enganchado en hosting, firestore y functions. Corre antes de subir nada:
   si el destino es el proyecto de producción y no viene del flujo con
   confirmación, corta el despliegue.

La capa 3 hace falta porque las capas 1 y 2 no bastan: la CLI se guarda el
proyecto activo **fuera de `.firebaserc`**, en su propia configuración
global por directorio. Quitar `default` no lo borra — hay que hacer
`firebase use --clear`, y aun así alguien puede volver a fijarlo sin darse
cuenta. El guardia no depende de eso.

Para saltárselo en una emergencia (o en CI):

```bash
RINCON_DESPLIEGUE_AUTORIZADO=1 firebase deploy --project prod
```

Es a posta algo que hay que escribir a conciencia.
