const crypto = require("node:crypto");
const {setGlobalOptions} = require("firebase-functions");
const {
  onDocumentUpdated,
  onDocumentCreated,
} = require("firebase-functions/v2/firestore");
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");

// El emulador de Functions arranca con el ID de producción (ver
// scripts/dev-emuladores.mjs) y con las credenciales de `firebase login`, así
// que todo lo que no esté emulado sale a producción. FUNCTIONS_EMULATOR solo
// la define el emulador; en Cloud Functions y al desplegar no existe.
const EN_EMULADOR = process.env.FUNCTIONS_EMULATOR === "true";

// Sin el emulador de Firestore delante (p. ej. `firebase emulators:start
// --only functions`), el Admin SDK leería y escribiría en el Firestore de
// producción. Mejor no arrancar.
if (EN_EMULADOR && !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
      "Emulador de Functions sin el de Firestore: se usaría el Firestore " +
      "de producción. Arranca los emuladores con `npm run dev:emu`.");
}

initializeApp();
const db = getFirestore();

// FCM no tiene emulador: un envío de verdad saldría al FCM real y llegaría a
// cualquier dispositivo cuyo token estuviera en los datos del emulador. En el
// emulador no se envía nada (ver simularEnvio).
const messaging = EN_EMULADOR ? null : getMessaging();

// En el emulador, los tokens con este prefijo fallan como un token dado de
// baja, para poder probar que se limpian.
const PREFIJO_TOKEN_INVALIDO = "invalido-";

// For cost control, limit the maximum number of containers that can be
// running at the same time.
setGlobalOptions({maxInstances: 10});

/**
 * Convierte un Timestamp de Firestore a string ISO (YYYY-MM-DDTHH:mm:ssZ).
 * @param {object|undefined} ts Timestamp de Firestore.
 * @return {string|null} Fecha en formato ISO o null si no existe.
 */
function timestampToIso(ts) {
  if (ts && typeof ts.toDate === "function") {
    return ts.toDate().toISOString();
  }
  return null;
}

/**
 * Coerción defensiva: devuelve el valor solo si es un número finito.
 * @param {*} v Valor de origen (no confiable: lo escribe el cliente).
 * @return {number} El número, o 0 si no es válido.
 */
function asNumber(v) {
  return (typeof v === "number" && isFinite(v)) ? v : 0;
}

/**
 * Coerción defensiva: devuelve el valor solo si es string (recortado).
 * @param {*} v Valor de origen (no confiable: lo escribe el cliente).
 * @param {number} maxLen Longitud máxima permitida.
 * @return {string|null} El string acotado, o null si no es válido.
 */
function asString(v, maxLen = 100) {
  return typeof v === "string" ? v.slice(0, maxLen) : null;
}

/**
 * Filtra una lista de tokens FCM leída de Firestore: solo strings no vacíos
 * de menos de 4096 caracteres.
 * @param {*} lista Valor de origen (no confiable: lo escribe el cliente).
 * @return {string[]} Tokens válidos (puede estar vacía).
 */
function tokensValidos(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.filter((t) =>
    typeof t === "string" && t.length > 0 && t.length < 4096);
}

/**
 * Documento privado con los tokens FCM de una usuaria. Solo lo lee su
 * dueña (firestore.rules); el perfil lo puede leer cualquier registrada.
 * @param {string} uid UID de la usuaria.
 * @return {object} DocumentReference de users/{uid}/privado/notificaciones.
 */
function refNotificaciones(uid) {
  return db.collection("users").doc(uid)
      .collection("privado").doc("notificaciones");
}

/**
 * TRANSICIÓN: tokens que aún queden en el perfil, en `fcmTokens` o en el
 * antiguo `fcmToken`. Los mueve scripts/migrar-tokens-fcm.mjs; cuando su
 * recuento dé 0, esto se quita.
 * @param {object} perfil Datos de users/{uid}.
 * @return {string[]} Tokens válidos (puede estar vacía).
 */
function tokensDelPerfil(perfil) {
  if (!perfil || typeof perfil !== "object") return [];
  return tokensValidos([
    ...(Array.isArray(perfil.fcmTokens) ? perfil.fcmTokens : []),
    ...(perfil.fcmToken ? [perfil.fcmToken] : []),
  ]);
}

/**
 * Tokens FCM de una usuaria: los de su documento privado y, durante la
 * transición, los que aún queden en su perfil. Sin repetidos y como mucho
 * 500 (límite de un envío multicast).
 * @param {string} uid UID de la usuaria.
 * @param {object} perfil Datos de users/{uid} (TRANSICIÓN).
 * @return {Promise<{todos: string[], privados: string[]}>} Todos, y cuáles
 *   de ellos están en el documento privado.
 */
async function tokensDe(uid, perfil) {
  const snap = await refNotificaciones(uid).get();
  const privados = tokensValidos(snap.exists ? snap.data().tokens : []);
  const todos = [...new Set([...privados, ...tokensDelPerfil(perfil)])];
  return {todos: todos.slice(0, 500), privados};
}

/**
 * Quita tokens inválidos de donde estén: del documento privado y, durante
 * la transición, de los campos antiguos del perfil. Los campos antiguos
 * solo se tocan si el perfil los tiene: un arrayRemove sobre un campo que
 * no existe lo crearía vacío.
 * @param {string} uid UID de la usuaria.
 * @param {string[]} invalidos Tokens que FCM ha rechazado.
 * @param {string[]} privados Tokens que había en el documento privado.
 * @param {object} perfil Datos de users/{uid} (TRANSICIÓN).
 * @return {Promise<void>}
 */
async function quitarTokens(uid, invalidos, privados, perfil) {
  const batch = db.batch();
  const enPrivado = invalidos.filter((t) => privados.includes(t));
  if (enPrivado.length > 0) {
    batch.update(refNotificaciones(uid), {
      tokens: FieldValue.arrayRemove(...enPrivado),
    });
  }

  const enPerfil = {};
  if (Array.isArray(perfil?.fcmTokens) &&
      invalidos.some((t) => perfil.fcmTokens.includes(t))) {
    enPerfil.fcmTokens = FieldValue.arrayRemove(...invalidos);
  }
  if (invalidos.includes(perfil?.fcmToken)) {
    enPerfil.fcmToken = FieldValue.delete();
  }
  if (Object.keys(enPerfil).length > 0) {
    batch.update(db.collection("users").doc(uid), enPerfil);
  }

  await batch.commit();
}

/**
 * Lee el perfil de una usuaria.
 * @param {string} uid UID de la usuaria.
 * @return {Promise<object|null>} Sus datos, o null si no existe.
 */
async function leerPerfil(uid) {
  if (!uid) return null;
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? snap.data() || {} : null;
}

/**
 * Sustituto de FCM en el emulador: no envía nada. Apunta el envío en la
 * colección `_pushSimulados` (uid, número de tokens, título y URL; ni un
 * token ni el cuerpo, que puede llevar el texto de un mensaje de chat) y
 * responde con la misma forma que sendEachForMulticast.
 * @param {string} uid UID del usuario destinatario.
 * @param {object} message Mensaje multicast que se habría enviado.
 * @return {Promise<object>} Respuesta con la forma de un BatchResponse.
 */
async function simularEnvio(uid, message) {
  const responses = message.tokens.map((token) =>
    token.startsWith(PREFIJO_TOKEN_INVALIDO) ?
      {
        success: false,
        error: {code: "messaging/registration-token-not-registered"},
      } :
      {success: true});
  const failureCount = responses.filter((r) => !r.success).length;

  logger.info("[FCM simulado] Notificación no enviada", {
    uid,
    tokens: message.tokens.length,
    title: message.notification.title,
  });

  // Solo con el emulador de Firestore delante. Con `--only functions` el
  // Admin SDK hablaría con la base de datos de producción.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    await db.collection("_pushSimulados").add({
      uid,
      tokens: message.tokens.length,
      title: message.notification.title,
      url: message.data.url,
      at: FieldValue.serverTimestamp(),
    });
  }

  return {
    responses,
    successCount: responses.length - failureCount,
    failureCount,
  };
}

/**
 * Envía una notificación push a todos los tokens de un usuario y
 * elimina de Firestore los tokens que ya no son válidos.
 * @param {string} uid UID del usuario destinatario.
 * @param {object} perfil Datos de users/{uid}; hacen falta mientras dure
 *   la transición, porque aún puede haber tokens en el perfil.
 * @param {string} title Título de la notificación.
 * @param {string} body Cuerpo de la notificación.
 * @param {string} url Ruta a abrir al pulsar la notificación (deep link).
 * @return {Promise<boolean>} false si no tenía ningún token.
 */
async function sendPushToUser(uid, perfil, title, body,
    url = "/biblioteca.html") {
  const {todos: tokens, privados} = await tokensDe(uid, perfil);
  if (tokens.length === 0) return false;

  // Payload híbrido: `notification` es imprescindible para iOS (Safari no
  // entrega push solo-data a PWAs); el SDK del SW lo auto-muestra. `data`
  // lleva la URL para el click. El SW NO debe llamar a showNotification
  // cuando hay payload `notification` (duplicaría en escritorio).
  const message = {
    tokens,
    notification: {title, body},
    data: {url},
    webpush: {
      headers: {Urgency: "high"},
      notification: {icon: "/favicon.png", badge: "/favicon.png"},
      fcmOptions: {link: url},
    },
  };
  const response = EN_EMULADOR ?
    await simularEnvio(uid, message) :
    await messaging.sendEachForMulticast(message);

  const invalidTokens = [];
  response.responses.forEach((res, i) => {
    if (res.success) return;
    const code = res.error?.code;
    if (code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument") {
      invalidTokens.push(tokens[i]);
    } else {
      logger.warn("Error enviando push", {uid, code});
    }
  });

  if (invalidTokens.length > 0) {
    await quitarTokens(uid, invalidTokens, privados, perfil);
    logger.info("Tokens FCM inválidos eliminados", {
      uid,
      count: invalidTokens.length,
    });
  }
  return true;
}

/**
 * Proxy de búsqueda en Google Books. Los clientes (sobre todo en redes
 * móviles con CGNAT) sufren 503 sostenidos porque Google limita por IP;
 * desde la IP de salida de Google Cloud ese límite no aplica.
 * Se expone vía rewrite de Hosting en /api/buscar-libros, así el CDN
 * cachea cada consulta (la query forma parte de la clave de caché) y las
 * búsquedas repetidas ni siquiera invocan la función.
 */
exports.buscarLibros = onRequest(
    {region: "europe-west1", cors: true, maxInstances: 5},
    async (req, res) => {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length < 2 || q.length > 100) {
        res.status(400).json({error: "Parámetro q inválido"});
        return;
      }

      // country=ES es obligatorio desde datacenter: sin él Google responde
      // 403 "Cannot determine user location". Sin key, Google aplica 429 por
      // IP también a las IPs de salida de GCP (comprobado), así que se usa la
      // key del proyecto; como está restringida por referrer, hay que mandar
      // la cabecera Referer del hosting para que Google la acepte.
      // quotaUser (IP del cliente, hasheada): reparte el límite por-minuto de
      // Google entre usuarios finales en vez de contar todo el tráfico del
      // proxy como un solo consumidor — sin él, ráfagas concurrentes de
      // usuarios distintos se ahogaban en 503 (visto en prueba de carga).
      const ipCliente = String(req.headers["x-forwarded-for"] || "")
          .split(",")[0].trim() || req.ip || "anon";
      const quotaUser = crypto.createHash("sha1")
          .update(ipCliente).digest("hex").slice(0, 16);

      // Caché compartida en Firestore: el CDN cachea por nodo geográfico,
      // esto es global. Una búsqueda resuelta no vuelve a gastar cuota de
      // Google (capada a ~100-150/min por key) para ningún usuario en 7 días.
      const qNorm = q.toLowerCase();
      const cacheRef = db.collection("busquedas_cache")
          .doc(crypto.createHash("sha1").update(qNorm).digest("hex"));
      let cachePrevia = null;
      try {
        const snap = await cacheRef.get();
        if (snap.exists) {
          cachePrevia = snap.data();
          if (Date.now() - cachePrevia.ts < 7 * 86400000) {
            res.set("Cache-Control", "public, max-age=3600, s-maxage=604800");
            res.json({items: JSON.parse(cachePrevia.items)});
            return;
          }
        }
      } catch (error) {
        logger.warn("Caché de búsquedas no disponible", {error: error.message});
      }

      // En el emulador, sin key: el emulador carga functions/.env, que
      // tiene la de producción, y gastaría su cuota en pruebas locales. Sin
      // key, Google limita por IP, que en local basta.
      const key = EN_EMULADOR ? "" : process.env.GOOGLE_BOOKS_API_KEY || "";
      const url = "https://www.googleapis.com/books/v1/volumes?q=" +
          encodeURIComponent(q) + "&maxResults=5&country=ES&printType=books" +
          `&quotaUser=${quotaUser}` + (key ? `&key=${key}` : "");
      const opts = {
        headers: {"Referer": "https://mi-rincon-de-lectura.web.app/"},
      };
      try {
        let r = await fetch(url, opts);
        // Reintentos con jitter: si todas las peticiones de una ráfaga
        // reintentan al mismo tiempo fijo, vuelven a chocar juntas.
        for (let intento = 0; intento < 2 && !r.ok &&
            [429, 500, 502, 503, 504].includes(r.status); intento++) {
          const espera = 350 * (intento + 1) + Math.random() * 500;
          await new Promise((resolve) => setTimeout(resolve, espera));
          r = await fetch(url, opts);
        }
        if (!r.ok) {
          logger.warn("Google Books no disponible", {status: r.status});
          // Caché caducada disponible: mejor resultado viejo que un 502
          if (cachePrevia) {
            res.set("Cache-Control", "public, max-age=600");
            res.json({items: JSON.parse(cachePrevia.items)});
            return;
          }
          res.status(502).json({error: `google_books_${r.status}`});
          return;
        }
        const data = await r.json();
        const items = data.items || [];
        cacheRef.set({q: qNorm, items: JSON.stringify(items), ts: Date.now()})
            .catch((error) => logger.warn("No se pudo guardar la caché", {
              error: error.message,
            }));
        res.set("Cache-Control", "public, max-age=3600, s-maxage=604800");
        res.json({items});
      } catch (error) {
        logger.error("Error en proxy de Google Books", {error: error.message});
        if (cachePrevia) {
          res.set("Cache-Control", "public, max-age=600");
          res.json({items: JSON.parse(cachePrevia.items)});
          return;
        }
        res.status(502).json({error: "proxy_error"});
      }
    },
);

/**
 * Registra en Cloud Logging cada vez que un usuario pierde su racha de
 * lectura (el contador de días pasa de un valor mayor que 0 a 0).
 * El documento de usuario usa el campo `rachaActual`; se acepta también
 * `streak` por compatibilidad.
 */
exports.onStreakLost = onDocumentUpdated("users/{uid}", (event) => {
  // Payload defensivo: en borrados/estados raros los snapshots pueden faltar
  if (!event.data || !event.data.before || !event.data.after) return null;
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};

  const previousStreak = asNumber(before.streak ?? before.rachaActual);
  const currentStreak = asNumber(after.streak ?? after.rachaActual);

  if (previousStreak > 0 && currentStreak === 0) {
    const lastRead = before.lastReadTimestamp ?? before.ultimaFechaLectura;

    logger.info("Racha finalizada", {
      uid: event.params.uid,
      username: asString(after.username),
      previousStreak: previousStreak,
      lastReadDate: timestampToIso(lastRead),
      streakLostDate: event.time,
      message: "Racha finalizada",
    });
  }

  return null;
});

/**
 * Envía una notificación de felicitación cuando el usuario acaba de
 * alcanzar su objetivo diario de páginas (`objetivoPaginasDiarias`),
 * comparando `paginasLeidasHoy` antes y después de la actualización.
 */
exports.onReadingGoalMet = onDocumentUpdated("users/{uid}", async (event) => {
  // Payload defensivo: snapshots y tipos no son de fiar (cliente)
  if (!event.data || !event.data.before || !event.data.after) return null;
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};

  const objetivo = asNumber(after.objetivoPaginasDiarias);
  if (objetivo <= 0) return null;

  // Si el día cambió entre escrituras, el contador anterior no cuenta.
  const sameDay = typeof after.fechaDia === "string" &&
      before.fechaDia === after.fechaDia;
  const beforePages = sameDay ? asNumber(before.paginasLeidasHoy) : 0;
  const afterPages = asNumber(after.paginasLeidasHoy);

  const justMet = beforePages < objetivo && afterPages >= objetivo;
  if (!justMet) return null;

  const uid = event.params.uid;
  const enviada = await sendPushToUser(
      uid,
      after,
      "🎯 ¡Objetivo cumplido!",
      `¡Enhorabuena! Has leído ${afterPages} páginas hoy y has alcanzado ` +
      `tu objetivo diario de ${objetivo}. ¡Págino está orgulloso de ti!`,
  );
  if (!enviada) return null;

  logger.info("Notificación de objetivo cumplido enviada", {
    uid,
    username: asString(after.username),
    objetivo,
    paginasLeidasHoy: afterPages,
  });

  return null;
});

// Zona horaria de referencia de la app. Los cron corren en esta zona y el
// cliente cuenta días con la medianoche local (Madrid), así que el conteo de
// días del servidor debe usar la misma frontera civil, no la de UTC.
const MADRID_TZ = "Europe/Madrid";

/**
 * Componentes de fecha civil (año, mes, día) de un instante en Europe/Madrid.
 * @param {Date} date Instante a convertir.
 * @return {{y:number, m:number, d:number}} Fecha civil en Madrid.
 */
function madridYMD(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return {y: get("year"), m: get("month"), d: get("day")};
}

/**
 * Días de calendario (Europe/Madrid) transcurridos entre un Timestamp y ahora.
 * Cuenta fronteras civiles de Madrid para cuadrar con los cron (que corren en
 * esa zona) y con el cliente, que usa la medianoche local del dispositivo.
 * @param {object|undefined} ts Timestamp de Firestore.
 * @return {number|null} Días completos de diferencia, o null si no hay fecha.
 */
function calendarDaysSince(ts) {
  if (!ts || typeof ts.toDate !== "function") return null;
  const a = madridYMD(ts.toDate());
  const b = madridYMD(new Date());
  // Date.UTC sobre componentes civiles = número de serie de día estable para
  // restar, sin aritmética de husos ni saltos de horario de verano.
  const last = Date.UTC(a.y, a.m - 1, a.d);
  const today = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((today - last) / 86400000);
}

/**
 * Cron diario (20:00 Europe/Madrid). La racha se congela hasta 2 días
 * sin leer y muere al 3º, así que:
 *  - 1 día sin leer: aviso suave (racha congelada).
 *  - 2+ días sin leer: última oportunidad (a medianoche se reinicia).
 */
exports.checkStreakAtRisk = onSchedule(
    {
      schedule: "0 20 * * *",
      timeZone: "Europe/Madrid",
      region: "europe-west1",
    },
    async () => {
      const snapshot = await db.collection("users")
          .where("rachaActual", ">", 0)
          .get();

      let notified = 0;
      const sends = snapshot.docs.map(async (docSnap) => {
        // try/catch por usuario: un documento malformado no debe abortar
        // el aviso al resto de usuarios.
        try {
          const userData = docSnap.data() || {};
          const lastRead =
              userData.lastReadTimestamp ?? userData.ultimaFechaLectura;
          const days = calendarDaysSince(lastRead);

          // Sin fecha o ya ha leído hoy: racha a salvo.
          if (days === null || days === 0) return;

          const racha = asNumber(userData.rachaActual);
          const enviada = days === 1 ?
            await sendPushToUser(
                docSnap.id,
                userData,
                "🧊 Tu racha se ha congelado",
                `Tu racha de ${racha} días aguanta congelada, pero mañana ` +
                "es el último día para salvarla. ¡Unas páginas y listo!",
            ) :
            await sendPushToUser(
                docSnap.id,
                userData,
                "🔥 ¡Última oportunidad para tu racha!",
                `Llevas ${days} días sin leer y tu racha de ${racha} días ` +
                "se reinicia esta medianoche. ¡Sálvala con unas páginas!",
            );
          if (enviada) notified++;
        } catch (error) {
          logger.error("Error procesando usuario en checkStreakAtRisk", {
            uid: docSnap.id,
            error: error.message,
          });
        }
      });

      await Promise.all(sends);
      logger.info("Revisión de rachas en peligro completada", {
        usuariosConRacha: snapshot.size,
        notificados: notified,
      });
    },
);

/**
 * Cron diario (00:05 Europe/Madrid). Reinicia a 0 las rachas de quienes
 * llevan 3 o más días de calendario sin leer (la congelación cubre los
 * 2 primeros). El trigger onStreakLost registra cada reinicio en logs.
 */
exports.resetExpiredStreaks = onSchedule(
    {
      schedule: "5 0 * * *",
      timeZone: "Europe/Madrid",
      region: "europe-west1",
    },
    async () => {
      const snapshot = await db.collection("users")
          .where("rachaActual", ">", 0)
          .get();

      let resets = 0;
      const writes = snapshot.docs.map(async (docSnap) => {
        try {
          const userData = docSnap.data() || {};
          const lastRead =
              userData.lastReadTimestamp ?? userData.ultimaFechaLectura;
          const days = calendarDaysSince(lastRead);
          if (days === null || days < 3) return;

          await docSnap.ref.update({rachaActual: 0});
          resets++;
        } catch (error) {
          logger.error("Error reiniciando racha", {
            uid: docSnap.id,
            error: error.message,
          });
        }
      });

      await Promise.all(writes);
      logger.info("Reinicio de rachas caducadas completado", {
        usuariosConRacha: snapshot.size,
        rachasReiniciadas: resets,
      });
    },
);

/**
 * Felicita por push al dueño cuando termina un libro (la sección del
 * libro pasa a 'libros-terminados'). Le anima a valorarlo.
 */
exports.onBookFinished = onDocumentUpdated("books/{bookId}", async (event) => {
  if (!event.data || !event.data.before || !event.data.after) return null;
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};

  const justFinished = before.section !== "libros-terminados" &&
      after.section === "libros-terminados";
  if (!justFinished) return null;

  const uid = asString(after.userId, 128);
  if (!uid) return null;

  const perfil = await leerPerfil(uid);
  if (!perfil) return null;

  const title = asString(after.title, 80) || "tu libro";
  const enviada = await sendPushToUser(
      uid,
      perfil,
      "🎉 ¡Libro terminado!",
      `Has acabado "${title}". Págino está dando saltos de alegría. ` +
      "Entra y ponle nota mientras lo tienes fresco.",
  );
  if (!enviada) return null;

  logger.info("Notificación de libro terminado enviada", {uid});
  return null;
});

/**
 * Notifica por push cuando llega una solicitud de amistad nueva.
 * Trigger: creación en users/{uid}/friend_requests/{requesterId}.
 */
exports.onFriendRequestCreated = onDocumentCreated(
    "users/{uid}/friend_requests/{requesterId}",
    async (event) => {
      if (!event.data) return null;
      const req = event.data.data() || {};
      const uid = event.params.uid;
      if (uid === event.params.requesterId) return null;

      const perfil = await leerPerfil(uid);
      if (!perfil) return null;

      const fromName = asString(req.fromUsername, 30) || "Alguien";
      const enviada = await sendPushToUser(
          uid,
          perfil,
          "🤝 Nueva solicitud de amistad",
          `@${fromName} quiere ser tu amigo. ¡Échale un ojo a su biblioteca!`,
      );
      if (!enviada) return null;

      logger.info("Notificación de solicitud de amistad enviada", {uid});
      return null;
    },
);

/**
 * Coerción defensiva: devuelve el valor solo si es un objeto/mapa.
 * @param {*} v Valor de origen (no confiable: lo escribe el cliente).
 * @return {object} El objeto, o {} si no es válido.
 */
function asMap(v) {
  return (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
}

/**
 * Notifica al amigo invitado cuando alguien crea una lectura compartida
 * ("Leemos Juntos"). Trigger: creación en /buddy_reads.
 */
exports.onBuddyReadCreated = onDocumentCreated(
    "buddy_reads/{buddyId}",
    async (event) => {
      if (!event.data) return null;
      const br = event.data.data() || {};
      const participants = Array.isArray(br.participants) ?
          br.participants : [];
      const creator = asString(br.createdBy, 128);
      const invited = participants.find((p) => p !== creator);
      if (!creator || !invited) return null;

      const perfil = await leerPerfil(invited);
      if (!perfil) return null;

      const usernames = asMap(br.usernames);
      const creatorName = asString(usernames[creator], 30) || "un amigo";
      const title = asString(br.title, 80) || "un libro";

      const enviada = await sendPushToUser(
          invited,
          perfil,
          "🤝 ¡Reto de lectura!",
          `@${creatorName} te propone leer "${title}" a la vez. ` +
          "Veréis el progreso del otro. ¿Aceptas?",
      );
      if (!enviada) return null;

      logger.info("Notificación de lectura compartida enviada", {invited});
      return null;
    },
);

/**
 * Avisa por push en las lecturas compartidas cuando tu compañero te
 * adelanta o termina el libro. Solo notifica transiciones (no cada
 * actualización) para no hacer spam.
 */
exports.onBuddyReadUpdated = onDocumentUpdated(
    "buddy_reads/{buddyId}",
    async (event) => {
      if (!event.data || !event.data.before || !event.data.after) return null;
      const before = event.data.before.data() || {};
      const after = event.data.after.data() || {};

      const participants = Array.isArray(after.participants) ?
          after.participants : [];
      if (participants.length !== 2) return null;
      const usernames = asMap(after.usernames);
      const progBefore = asMap(before.progress);
      const progAfter = asMap(after.progress);
      const finBefore = asMap(before.finished);
      const finAfter = asMap(after.finished);
      const title = asString(after.title, 80) || "vuestro libro";

      const sends = [];
      for (const p of participants) {
        const other = participants.find((x) => x !== p);
        if (!other) continue;
        const pName = asString(usernames[p], 30) || "Tu compañero";

        const justFinished = !finBefore[p] && finAfter[p] === true;
        const overtook = !justFinished && !finAfter[p] &&
            asNumber(progBefore[p]) <= asNumber(progBefore[other]) &&
            asNumber(progAfter[p]) > asNumber(progAfter[other]);

        // El otro ya terminó: no hay carrera que avisar
        if (finAfter[other] === true) continue;

        if (justFinished) {
          sends.push((async () => {
            const perfil = await leerPerfil(other);
            if (!perfil) return;
            await sendPushToUser(
                other,
                perfil,
                `🏁 @${pName} ha terminado "${title}"`,
                "¡No te quedes atrás! Unas páginas hoy y cruzas " +
                "tú también la meta.",
            );
          })());
        } else if (overtook) {
          sends.push((async () => {
            const perfil = await leerPerfil(other);
            if (!perfil) return;
            await sendPushToUser(
                other,
                perfil,
                `👀 @${pName} te ha adelantado`,
                `Va por la página ${asNumber(progAfter[p])} de "${title}". ` +
                "¿Unas paginitas para recuperar el liderato?",
            );
          })());
        }
      }

      await Promise.all(sends);
      return null;
    },
);

/**
 * Notifica por push al receptor cuando llega un mensaje nuevo de chat.
 * Trigger: creación de documentos en chats/{chatId}/messages.
 * Los tokens inválidos del receptor se eliminan automáticamente
 * (lo hace sendPushToUser).
 */
exports.onNewChatMessage = onDocumentCreated(
    "chats/{chatId}/messages/{messageId}",
    async (event) => {
      if (!event.data) return null;
      const msg = event.data.data() || {};

      const to = asString(msg.to, 128);
      const from = asString(msg.from, 128);
      if (!to || !from || to === from) return null;

      const [toSnap, fromSnap] = await Promise.all([
        db.collection("users").doc(to).get(),
        db.collection("users").doc(from).get(),
      ]);
      if (!toSnap.exists) return null;

      const senderName =
          asString((fromSnap.data() || {}).username, 30) || "un amigo";
      const body = msg.type === "book" ?
          "Te ha enviado un libro 📖" :
          (asString(msg.text, 120) || "Nuevo mensaje");

      const enviada = await sendPushToUser(
          to,
          toSnap.data() || {},
          `💬 Nuevo mensaje de @${senderName}`,
          body,
          `/biblioteca.html?chat=${encodeURIComponent(from)}`,
      );
      if (!enviada) return null;

      logger.info("Notificación de chat enviada", {to, from});
      return null;
    },
);
