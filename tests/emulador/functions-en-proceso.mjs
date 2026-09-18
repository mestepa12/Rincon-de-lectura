// Carga functions/index.js dentro del proceso de la prueba, con FCM
// sustituido por un doble que cuenta las llamadas. Sirve para comprobar QUÉ
// camino toma el código según el entorno, sin que ninguno de los dos pueda
// llegar al FCM real: el módulo firebase-admin/messaging de verdad no se
// llega a cargar.
//
// Las variables de entorno se leen al cargar el módulo, así que cada
// fichero de prueba lo carga una sola vez, en un entorno: node --test corre
// cada fichero en su propio proceso.
//
// Importar después de entorno.mjs: ese fija los hosts del emulador, y el
// Firestore de functions/index.js los usa igual que el Admin de las pruebas.
import Module, { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { PROYECTO } from './entorno.mjs';

const require = createRequire(resolve(process.cwd(), 'functions', 'package.json'));
const RUTA_MESSAGING = require.resolve('firebase-admin/messaging');

/**
 * Carga functions/index.js con un FCM falso.
 * @param {{emulador: boolean}} opciones emulador: si se define
 *   FUNCTIONS_EMULATOR, como hace el emulador de Functions.
 * @return {{funciones: object, fcm: {instancias: number, envios: object[]},
 *   messagingRealCargado: function(): boolean}}
 */
export function cargarFunctions({ emulador }) {
  if (emulador) process.env.FUNCTIONS_EMULATOR = 'true';
  else delete process.env.FUNCTIONS_EMULATOR;
  process.env.GCLOUD_PROJECT = PROYECTO;

  const fcm = { instancias: 0, envios: [] };
  const falso = new Module(RUTA_MESSAGING);
  falso.filename = RUTA_MESSAGING;
  falso.loaded = true;
  falso.exports = {
    getMessaging() {
      fcm.instancias++;
      return {
        async sendEachForMulticast(message) {
          fcm.envios.push({ tokens: message.tokens.length, title: message.notification.title });
          const responses = message.tokens.map(() => ({ success: true }));
          return { responses, successCount: responses.length, failureCount: 0 };
        },
      };
    },
  };
  require.cache[RUTA_MESSAGING] = falso;

  const funciones = require(resolve(process.cwd(), 'functions', 'index.js'));
  return {
    funciones,
    fcm,
    // El SDK de verdad vive en lib/messaging/; si algo lo hubiera cargado
    // saltándose el doble, aparecería en la caché de require.
    messagingRealCargado: () => Object.keys(require.cache).some(
      (ruta) => ruta !== RUTA_MESSAGING && /firebase-admin[\\/]lib[\\/]messaging[\\/]/.test(ruta)),
  };
}

/**
 * Evento mínimo de Firestore para llamar a un trigger con .run().
 * @param {object} datos Contenido del documento.
 * @param {object} params Parámetros de la ruta.
 * @return {object}
 */
export const evento = (datos, params) => ({ data: { data: () => datos }, params });

/** Cierra la app por defecto que abre functions/index.js. */
export async function cerrarFunctions() {
  const { getApp, deleteApp } = require('firebase-admin/app');
  await deleteApp(getApp());
}
