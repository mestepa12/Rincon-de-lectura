// Red de seguridad contra el apaño que se acaba de quitar: usar el prefijo
// del correo como nombre de usuario. Es una prueba sobre el propio código,
// no sobre su comportamiento, porque el estado que hacía falta para
// reproducirlo en la interfaz (memoria sin perfil y una lectura que falla)
// no se puede montar desde fuera en todos los sitios donde estaba.
//
// Si algún día hiciera falta el correo para otra cosa, este es el sitio
// donde decidirlo a conciencia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Los módulos del cliente viven en la raíz del repo (script.js, auth.js...).
const ficheros = readdirSync(RAIZ)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.config.js'))
    .sort();

// `user.email.split('@')[0]`, `user.email?.split("@")[0]`, con o sin espacios.
const PREFIJO_DEL_CORREO = /email\s*\??\.\s*split\s*\(\s*['"`]@['"`]/;

test('ningún módulo del cliente saca un nombre del prefijo del correo', () => {
    assert.ok(ficheros.length > 5, 'no se han encontrado los módulos del cliente');
    const culpables = ficheros.filter((f) => PREFIJO_DEL_CORREO.test(readFileSync(join(RAIZ, f), 'utf8')));
    assert.deepEqual(culpables, [],
        'el prefijo del correo no es el nombre de nadie: el nombre sale de ' +
        'obtenerMiNombre() (nombre-usuario.js) y, si no se sabe, no se escribe');
});
