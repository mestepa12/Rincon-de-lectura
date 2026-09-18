#!/usr/bin/env node
// Mueve los tokens de FCM del perfil (users/{uid}.fcmTokens y el antiguo
// fcmToken) a users/{uid}/privado/notificaciones, que solo lee su dueña.
//
//   node scripts/migrar-tokens-fcm.mjs --emulador   [--aplicar]
//   node scripts/migrar-tokens-fcm.mjs --proyecto prod [--aplicar]
//
// Es la fase 2 de 3, y el orden importa para que nadie pierda avisos:
//   1. Desplegar, en este orden: Functions (leen los tokens de los dos
//      sitios), reglas (el perfil deja de aceptar tokens) y hosting (el
//      cliente los guarda en el documento privado).
//   2. Este script, justo después.
//   3. Cuando el recuento dé 0, quitar de las Functions la lectura de los
//      campos antiguos (lo marcado como TRANSICIÓN en functions/index.js).
//
// SIN --aplicar NO ESCRIBE: solo cuenta, y se puede ejecutar en cualquier
// momento, también antes de la fase 1. Pinta números y nada más: ni tokens
// ni uids. Para contar tiene que leer los dos campos (select), así que los
// tokens pasan por memoria.
//
// CON --aplicar, por cada perfil que tenga alguno de los dos campos, en una
// transacción: junta sus tokens con los que ya haya en el documento privado
// y borra los dos campos del perfil. Así ningún token se queda en ningún
// momento fuera de los dos sitios. Es idempotente: una segunda pasada no
// cambia nada. Al terminar vuelve a contar. Contra un proyecto real pide
// una confirmación escrita, como el despliegue a producción.
//
// Tope de 20 tokens por usuaria, el mismo que ponen las reglas al documento
// privado: si al juntar salieran más, se quedan los del documento privado
// (los más nuevos) y después los del perfil, del más nuevo al más viejo.
//
// Mismas guardas que revisar-email-en-perfiles.mjs. firebase-admin se toma
// de functions/node_modules. Ejecutar desde la raíz del repo.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { proyecto, PROD } from './lib/proyectos.mjs';
import { color } from './lib/proc.mjs';

const EMULADOR = '127.0.0.1:8080';
const TOPE = 20;

const args = process.argv.slice(2);
const usarEmulador = args.includes('--emulador');
const aplicar = args.includes('--aplicar');
const iProyecto = args.indexOf('--proyecto');
const alias = iProyecto === -1 ? null : args[iProyecto + 1];

if (usarEmulador === Boolean(alias) || (alias && !['prod', 'dev'].includes(alias))) {
  console.error(color.rojo(`
✗ Indica UN destino:
    --emulador            emulador local (${EMULADOR})
    --proyecto prod|dev   proyecto real, con Application Default Credentials
  y --aplicar para escribir (sin él solo cuenta).
`));
  process.exit(1);
}

// Con la variable puesta, el Admin SDK hablaría con el emulador aunque se
// pida el proyecto real, y un "0" de ahí parecería la respuesta buena.
if (alias && process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(color.rojo(`
✗ FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST} está definida:
  se consultaría el emulador y no ${alias}. Quítala o usa --emulador.
`));
  process.exit(1);
}

// Antes de conectar a nada: sin terminal no hay confirmación posible.
if (aplicar && alias && !process.stdin.isTTY) {
  console.error(color.rojo(
    '\n✗ --aplicar contra un proyecto real exige confirmación interactiva y no hay terminal.\n',
  ));
  process.exit(1);
}
if (usarEmulador) process.env.FIRESTORE_EMULATOR_HOST = EMULADOR;

const require = createRequire(resolve(process.cwd(), 'functions', 'package.json'));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// En el emulador los datos viven bajo el ID de producción (ver
// scripts/dev-emuladores.mjs); es solo una etiqueta local.
const projectId = usarEmulador ? PROD : proyecto(alias);
const app = usarEmulador
  ? initializeApp({ projectId })
  : initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);

/**
 * Solo strings no vacíos de menos de 4096 caracteres (lo mismo que acepta
 * functions/index.js).
 * @param {*} lista Valor de origen.
 * @return {string[]}
 */
function tokensValidos(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.filter((t) => typeof t === 'string' && t.length > 0 && t.length < 4096);
}

/**
 * Tokens de los campos antiguos del perfil, sin repetidos.
 * @param {object} d Datos del perfil (o solo esos dos campos).
 * @return {string[]}
 */
function tokensDelPerfil(d) {
  return [...new Set(tokensValidos([
    ...(Array.isArray(d.fcmTokens) ? d.fcmTokens : []),
    ...(d.fcmToken ? [d.fcmToken] : []),
  ]))];
}

const tieneCamposAntiguos = (d) => 'fcmTokens' in d || 'fcmToken' in d;
const refPrivado = (refPerfil) => refPerfil.collection('privado').doc('notificaciones');

/**
 * Junta los tokens del documento privado y los del perfil, con el tope.
 * arrayUnion añade al final, así que en el perfil el más nuevo es el último.
 * @param {string[]} privados Los que ya hay en el documento privado.
 * @param {string[]} delPerfil Los de los campos antiguos.
 * @return {{tokens: string[], descartados: number}}
 */
function juntar(privados, delPerfil) {
  const todos = [...new Set([...privados, ...[...delPerfil].reverse()])];
  return { tokens: todos.slice(0, TOPE), descartados: Math.max(0, todos.length - TOPE) };
}

/**
 * Cuenta sin escribir. Devuelve también las referencias de los perfiles que
 * tienen campos antiguos, para no tener que recorrer la colección dos veces.
 * @return {Promise<{n: object, pendientes: object[]}>}
 */
async function contar() {
  const n = {
    perfiles: 0, conCampos: 0, conTokens: 0, conFcmTokens: 0, conFcmToken: 0,
    camposVacios: 0, tokens: 0, conPrivado: 0, porEncimaDelTope: 0,
  };
  const pendientes = [];
  for await (const snap of db.collection('users').select('fcmTokens', 'fcmToken').stream()) {
    n.perfiles++;
    const d = snap.data();
    if (!tieneCamposAntiguos(d)) continue;
    n.conCampos++;
    pendientes.push({ ref: snap.ref, tokens: tokensDelPerfil(d) });
    if (tokensValidos(d.fcmTokens).length > 0) n.conFcmTokens++;
    if (tokensValidos([d.fcmToken]).length > 0) n.conFcmToken++;
    const t = tokensDelPerfil(d);
    if (t.length === 0) n.camposVacios++;
    else { n.conTokens++; n.tokens += t.length; }
  }

  // Cuántos tienen ya documento privado y a cuántos les sobraría algún token
  // al juntar. Solo se leen los documentos privados de los pendientes.
  if (pendientes.length > 0) {
    const privados = await db.getAll(...pendientes.map((p) => refPrivado(p.ref)));
    privados.forEach((snap, i) => {
      if (snap.exists) n.conPrivado++;
      const ya = tokensValidos(snap.exists ? snap.data().tokens : []);
      if (juntar(ya, pendientes[i].tokens).descartados > 0) n.porEncimaDelTope++;
    });
  }
  return { n, pendientes };
}

/**
 * Pinta el recuento. Solo números.
 * @param {object} n Resultado de contar().
 */
function pintar(n) {
  console.log(`  Perfiles:                                  ${n.perfiles}`);
  console.log(`  Con fcmTokens o fcmToken:                  ${n.conCampos}`);
  console.log(`    con algún token (los que hay que mover): ${n.conTokens}`);
  console.log(`      con fcmTokens no vacío:                ${n.conFcmTokens}`);
  console.log(`      con fcmToken:                          ${n.conFcmToken}`);
  console.log(`    con el campo pero sin tokens:            ${n.camposVacios}`);
  console.log(`  Tokens en perfiles (sin repetir):          ${n.tokens}`);
  console.log(`  De esos perfiles, con documento privado:   ${n.conPrivado}`);
  console.log(`  Pasarían del tope de ${TOPE} al juntar:        ${n.porEncimaDelTope}`);
  console.log('');
}

/**
 * Pide la confirmación escrita (solo contra un proyecto real).
 * @return {Promise<boolean>}
 */
async function confirmar() {
  const codigo = randomBytes(3).toString('hex');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(
    `  ${color.amarillo(`Esto escribe en ${projectId}.`)} Para continuar, escribe ${color.negrita(`migrar ${codigo}`)}\n  > `,
  );
  rl.close();
  return respuesta.trim() === `migrar ${codigo}`;
}

/**
 * Migra un perfil en una transacción. Relee dentro de ella: entre el
 * recuento y aquí el cliente puede haber guardado un token nuevo.
 * @param {object} refPerfil DocumentReference de users/{uid}.
 * @return {Promise<{movido: boolean, tokens: number, descartados: number}>}
 */
function migrarPerfil(refPerfil) {
  return db.runTransaction(async (tx) => {
    const privRef = refPrivado(refPerfil);
    const [perfil, priv] = await tx.getAll(refPerfil, privRef, {
      fieldMask: ['fcmTokens', 'fcmToken', 'tokens'],
    });
    const d = perfil.exists ? perfil.data() : {};
    if (!tieneCamposAntiguos(d)) return { movido: false, tokens: 0, descartados: 0 };

    const ya = tokensValidos(priv.exists ? priv.data().tokens : []);
    const delPerfil = tokensDelPerfil(d);
    const { tokens, descartados } = juntar(ya, delPerfil);
    if (tokens.length > 0) tx.set(privRef, { tokens }, { merge: true });
    tx.update(refPerfil, { fcmTokens: FieldValue.delete(), fcmToken: FieldValue.delete() });
    return { movido: true, tokens: delPerfil.length, descartados };
  });
}

console.log(color.negrita(
  `\n▶ Tokens de FCM del perfil a privado/notificaciones · ${usarEmulador ? `EMULADOR ${EMULADOR}` : `PROYECTO ${projectId}`}` +
  ` · ${aplicar ? 'APLICAR' : 'solo contar'}\n`,
));

let codigoSalida = 0;
try {
  const { n, pendientes } = await contar();
  pintar(n);

  if (aplicar && pendientes.length > 0) {
    if (alias && !(await confirmar())) {
      console.log(color.verde('\n✓ Cancelado. No se ha escrito nada.\n'));
      codigoSalida = 1;
    } else {
      let perfiles = 0;
      let tokens = 0;
      let descartados = 0;
      for (const p of pendientes) {
        const r = await migrarPerfil(p.ref);
        if (!r.movido) continue;
        perfiles++;
        tokens += r.tokens;
        descartados += r.descartados;
      }
      console.log(`  Perfiles migrados:                         ${perfiles}`);
      console.log(`  Tokens movidos:                            ${tokens}`);
      console.log(`  Descartados por el tope:                   ${descartados}`);
      console.log('');

      const despues = await contar();
      console.log(`  Quedan perfiles con fcmTokens o fcmToken:  ${despues.n.conCampos}`);
      console.log('');
      if (despues.n.conCampos > 0) codigoSalida = 1;
    }
  } else if (aplicar) {
    console.log('  Nada que migrar.\n');
  }
} catch (error) {
  console.error(color.rojo(`✗ Falló: ${error.message}\n`));
  codigoSalida = 1;
}
await db.terminate();
process.exit(codigoSalida);
