const {setGlobalOptions} = require("firebase-functions");
const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
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
 * Devuelve los tokens FCM registrados en un documento de usuario.
 * Acepta tanto el array `fcmTokens` como el campo simple `fcmToken`.
 * @param {object} userData Datos del documento del usuario.
 * @return {string[]} Lista de tokens (puede estar vacía).
 */
function getUserTokens(userData) {
  if (Array.isArray(userData.fcmTokens)) {
    return userData.fcmTokens.filter(Boolean);
  }
  if (typeof userData.fcmToken === "string" && userData.fcmToken) {
    return [userData.fcmToken];
  }
  return [];
}

/**
 * Envía una notificación push a todos los tokens de un usuario y
 * elimina de Firestore los tokens que ya no son válidos.
 * @param {string} uid UID del usuario destinatario.
 * @param {string[]} tokens Tokens FCM del usuario.
 * @param {string} title Título de la notificación.
 * @param {string} body Cuerpo de la notificación.
 * @return {Promise<void>}
 */
async function sendPushToUser(uid, tokens, title, body) {
  if (tokens.length === 0) return;

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {title, body},
    webpush: {
      notification: {icon: "/favicon.png"},
      fcmOptions: {link: "/"},
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
 * Registra en Cloud Logging cada vez que un usuario pierde su racha de
 * lectura (el contador de días pasa de un valor mayor que 0 a 0).
 * El documento de usuario usa el campo `rachaActual`; se acepta también
 * `streak` por compatibilidad.
 */
exports.onStreakLost = onDocumentUpdated("users/{uid}", (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  const previousStreak = before.streak ?? before.rachaActual ?? 0;
  const currentStreak = after.streak ?? after.rachaActual ?? 0;

  if (previousStreak > 0 && currentStreak === 0) {
    const lastRead = before.lastReadTimestamp ?? before.ultimaFechaLectura;

    logger.info("Racha finalizada", {
      uid: event.params.uid,
      username: after.username || null,
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
  const before = event.data.before.data();
  const after = event.data.after.data();

  const objetivo = after.objetivoPaginasDiarias || 0;
  if (objetivo <= 0) return null;

  // Si el día cambió entre escrituras, el contador anterior no cuenta.
  const sameDay = before.fechaDia === after.fechaDia;
  const beforePages = sameDay ? (before.paginasLeidasHoy || 0) : 0;
  const afterPages = after.paginasLeidasHoy || 0;

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
    username: after.username || null,
    objetivo,
    paginasLeidasHoy: afterPages,
  });

  return null;
});

/**
 * Cron diario (20:00 Europe/Madrid). Busca usuarios con racha activa
 * (`rachaActual` > 0) que todavía no han leído hoy (su
 * `lastReadTimestamp` no es de hoy) y les avisa de que su racha
 * está en peligro.
 */
exports.checkStreakAtRisk = onSchedule(
    {
      schedule: "0 20 * * *",
      timeZone: "Europe/Madrid",
      region: "europe-west1",
    },
    async () => {
      // El frontend guarda las fechas de día en UTC (toISOString),
      // así que comparamos contra la fecha UTC de hoy.
      const todayUtc = new Date().toISOString().split("T")[0];

      const snapshot = await db.collection("users")
          .where("rachaActual", ">", 0)
          .get();

      let notified = 0;
      const sends = snapshot.docs.map(async (docSnap) => {
        const userData = docSnap.data();
        const lastRead =
            userData.lastReadTimestamp ?? userData.ultimaFechaLectura;
        const lastReadDay = timestampToIso(lastRead)?.split("T")[0];

        // Ya ha leído hoy: racha a salvo.
        if (lastReadDay === todayUtc) return;

        const tokens = getUserTokens(userData);
        if (tokens.length === 0) return;

        await sendPushToUser(
            docSnap.id,
            tokens,
            "🔥 ¡Cuidado! Tu racha está en peligro",
            `Llevas ${userData.rachaActual} días seguidos leyendo y hoy ` +
            "todavía no has leído. ¡Unas páginas antes de dormir y " +
            "racha salvada!",
        );
        notified++;
      });

      await Promise.all(sends);
      logger.info("Revisión de rachas en peligro completada", {
        usuariosConRacha: snapshot.size,
        notificados: notified,
      });
    },
);
