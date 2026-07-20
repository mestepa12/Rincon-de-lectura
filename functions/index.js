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

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

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
 * Devuelve los tokens FCM registrados en un documento de usuario.
 * Acepta tanto el array `fcmTokens` como el campo simple `fcmToken`.
 * Valida tipo y longitud de cada token y acota a 500 (límite multicast).
 * @param {object} userData Datos del documento del usuario.
 * @return {string[]} Lista de tokens (puede estar vacía).
 */
function getUserTokens(userData) {
  if (!userData || typeof userData !== "object") return [];
  let tokens = [];
  if (Array.isArray(userData.fcmTokens)) {
    tokens = userData.fcmTokens;
  } else if (userData.fcmToken) {
    tokens = [userData.fcmToken];
  }
  return tokens
      .filter((t) => typeof t === "string" && t.length > 0 && t.length < 4096)
      .slice(0, 500);
}

/**
 * Envía una notificación push a todos los tokens de un usuario y
 * elimina de Firestore los tokens que ya no son válidos.
 * @param {string} uid UID del usuario destinatario.
 * @param {string[]} tokens Tokens FCM del usuario.
 * @param {string} title Título de la notificación.
 * @param {string} body Cuerpo de la notificación.
 * @param {string} url Ruta a abrir al pulsar la notificación (deep link).
 * @return {Promise<void>}
 */
async function sendPushToUser(uid, tokens, title, body,
    url = "/biblioteca.html") {
  if (tokens.length === 0) return;

  // Payload híbrido: `notification` es imprescindible para iOS (Safari no
  // entrega push solo-data a PWAs); el SDK del SW lo auto-muestra. `data`
  // lleva la URL para el click. El SW NO debe llamar a showNotification
  // cuando hay payload `notification` (duplicaría en escritorio).
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {title, body},
    data: {url},
    webpush: {
      headers: {Urgency: "high"},
      notification: {icon: "/favicon.png", badge: "/favicon.png"},
      fcmOptions: {link: url},
    },
  });

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
    await db.collection("users").doc(uid).update({
      fcmTokens: FieldValue.arrayRemove(...invalidTokens),
    });
    logger.info("Tokens FCM inválidos eliminados", {
      uid,
      count: invalidTokens.length,
    });
  }
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
      const key = process.env.GOOGLE_BOOKS_API_KEY || "";
      const url = "https://www.googleapis.com/books/v1/volumes?q=" +
          encodeURIComponent(q) + "&maxResults=5&country=ES&printType=books" +
          (key ? `&key=${key}` : "");
      const opts = {
        headers: {"Referer": "https://mi-rincon-de-lectura.web.app/"},
      };
      try {
        let r = await fetch(url, opts);
        if (!r.ok && [429, 500, 502, 503, 504].includes(r.status)) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          r = await fetch(url, opts);
        }
        if (!r.ok) {
          logger.warn("Google Books no disponible", {status: r.status});
          res.status(502).json({error: `google_books_${r.status}`});
          return;
        }
        const data = await r.json();
        res.set("Cache-Control", "public, max-age=3600, s-maxage=604800");
        res.json({items: data.items || []});
      } catch (error) {
        logger.error("Error en proxy de Google Books", {error: error.message});
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
  const tokens = getUserTokens(after);
  if (tokens.length === 0) return null;

  await sendPushToUser(
      uid,
      tokens,
      "🎯 ¡Objetivo cumplido!",
      `¡Enhorabuena! Has leído ${afterPages} páginas hoy y has alcanzado ` +
      `tu objetivo diario de ${objetivo}. ¡Págino está orgulloso de ti!`,
  );

  logger.info("Notificación de objetivo cumplido enviada", {
    uid,
    username: asString(after.username),
    objetivo,
    paginasLeidasHoy: afterPages,
  });

  return null;
});

/**
 * Días de calendario (UTC) transcurridos entre un Timestamp y ahora.
 * @param {object|undefined} ts Timestamp de Firestore.
 * @return {number|null} Días completos de diferencia, o null si no hay fecha.
 */
function calendarDaysSince(ts) {
  if (!ts || typeof ts.toDate !== "function") return null;
  const d = ts.toDate();
  const last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const now = new Date();
  const today = Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
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

          const tokens = getUserTokens(userData);
          if (tokens.length === 0) return;

          const racha = asNumber(userData.rachaActual);
          if (days === 1) {
            await sendPushToUser(
                docSnap.id,
                tokens,
                "🧊 Tu racha se ha congelado",
                `Tu racha de ${racha} días aguanta congelada, pero mañana ` +
                "es el último día para salvarla. ¡Unas páginas y listo!",
            );
          } else {
            await sendPushToUser(
                docSnap.id,
                tokens,
                "🔥 ¡Última oportunidad para tu racha!",
                `Llevas ${days} días sin leer y tu racha de ${racha} días ` +
                "se reinicia esta medianoche. ¡Sálvala con unas páginas!",
            );
          }
          notified++;
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

  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) return null;
  const tokens = getUserTokens(userSnap.data() || {});
  if (tokens.length === 0) return null;

  const title = asString(after.title, 80) || "tu libro";
  await sendPushToUser(
      uid,
      tokens,
      "🎉 ¡Libro terminado!",
      `Has acabado "${title}". Págino está dando saltos de alegría. ` +
      "Entra y ponle nota mientras lo tienes fresco.",
  );

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

      const userSnap = await db.collection("users").doc(uid).get();
      if (!userSnap.exists) return null;
      const tokens = getUserTokens(userSnap.data() || {});
      if (tokens.length === 0) return null;

      const fromName = asString(req.fromUsername, 30) || "Alguien";
      await sendPushToUser(
          uid,
          tokens,
          "🤝 Nueva solicitud de amistad",
          `@${fromName} quiere ser tu amigo. ¡Échale un ojo a su biblioteca!`,
      );

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
 * Devuelve los tokens FCM de un usuario leyendo su documento.
 * @param {string} uid UID del usuario.
 * @return {Promise<string[]>} Tokens (vacío si no hay usuario/tokens).
 */
async function fetchTokens(uid) {
  if (!uid) return [];
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return [];
  return getUserTokens(snap.data() || {});
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

      const tokens = await fetchTokens(invited);
      if (tokens.length === 0) return null;

      const usernames = asMap(br.usernames);
      const creatorName = asString(usernames[creator], 30) || "un amigo";
      const title = asString(br.title, 80) || "un libro";

      await sendPushToUser(
          invited,
          tokens,
          "🤝 ¡Reto de lectura!",
          `@${creatorName} te propone leer "${title}" a la vez. ` +
          "Veréis el progreso del otro. ¿Aceptas?",
      );

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
            const tokens = await fetchTokens(other);
            if (tokens.length === 0) return;
            await sendPushToUser(
                other,
                tokens,
                `🏁 @${pName} ha terminado "${title}"`,
                "¡No te quedes atrás! Unas páginas hoy y cruzas " +
                "tú también la meta.",
            );
          })());
        } else if (overtook) {
          sends.push((async () => {
            const tokens = await fetchTokens(other);
            if (tokens.length === 0) return;
            await sendPushToUser(
                other,
                tokens,
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

      const tokens = getUserTokens(toSnap.data() || {});
      if (tokens.length === 0) return null;

      const senderName =
          asString((fromSnap.data() || {}).username, 30) || "un amigo";
      const body = msg.type === "book" ?
          "Te ha enviado un libro 📖" :
          (asString(msg.text, 120) || "Nuevo mensaje");

      await sendPushToUser(
          to,
          tokens,
          `💬 Nuevo mensaje de @${senderName}`,
          body,
          `/biblioteca.html?chat=${encodeURIComponent(from)}`,
      );

      logger.info("Notificación de chat enviada", {to, from});
      return null;
    },
);
