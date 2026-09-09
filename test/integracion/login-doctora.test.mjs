// El login de la doctora y su sesión (assets/js/modules/auth.js y
// modules/sesion.js).
//
// Es la puerta del portal. Lo que se cuida acá es que no se entre sin
// credenciales buenas y, sobre todo, que el token que emite Supabase no
// se quede en el navegador: se cambia una sola vez por una cookie
// HttpOnly que el JS no puede leer, y por eso un XSS no se lo lleva.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, MODULOS } from '../entorno.mjs';

const { el, escribir } = instalarDom();

// ── Supabase Auth y /api/session, falsos ──────────────────────────────
// Acá no hace falta la base: lo que se prueba es la puerta, no lo que
// hay adentro.
const CLAVE_BUENA = 'la-clave-de-belkis';
const TOKEN = 'access-token-de-la-doctora';

const peticiones = [];
let servidorAbreSesion = true;   // qué responde POST /api/session
let hayCookie = true;            // qué responde GET  /api/session
let redCaida = false;

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url), 'https://falso.local');
  const metodo = opts.method ?? 'GET';
  const cuerpo = opts.body ? JSON.parse(opts.body) : null;
  peticiones.push({ ruta: u.pathname, metodo, cuerpo, modoCache: opts.cache });

  if (redCaida) throw new Error('sin conexión');

  const responder = (status, data) => ({ ok: status < 300, status, json: async () => data });

  // Supabase devuelve 400 con un json de error cuando la clave no va.
  if (u.pathname === '/auth/v1/token') {
    return cuerpo.password === CLAVE_BUENA
      ? responder(200, { access_token: TOKEN, expires_in: 3600 })
      : responder(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
  }

  if (u.pathname === '/api/session') {
    if (metodo === 'POST') return responder(servidorAbreSesion ? 200 : 500, null);
    if (metodo === 'DELETE') return responder(200, null);
    return responder(hayCookie ? 200 : 401, null);   // GET
  }

  return responder(404, null);
};

await import(MODULOS + 'app.js');
const { cerrarSesion, haySesion } = await import(MODULOS + 'modules/sesion.js');
const { DOCTORA_USUARIO, DOCTORA_EMAIL } = await import(MODULOS + 'modules/config.js');

async function ingresar(usuario, pass) {
  escribir('d-usuario', usuario);
  escribir('d-pass', pass);
  el('form-error').textContent = '';
  globalThis.location.href = '';
  peticiones.length = 0;
  await globalThis.loginDoctora();
}

const aRuta = (ruta) => peticiones.filter((p) => p.ruta === ruta);

describe('el login de la doctora', () => {
  test('con un campo vacío no intenta nada', async () => {
    await ingresar(DOCTORA_USUARIO, '');

    assert.equal(peticiones.length, 0, 'ni siquiera sale a la red');
    assert.match(el('form-error').textContent, /completá todos los campos/i);
    assert.equal(globalThis.location.href, '', 'no entra al panel');
  });

  test('un usuario que no es el de la doctora no llega a la base', async () => {
    await ingresar('otra.persona', CLAVE_BUENA);

    assert.equal(peticiones.length, 0);
    // Mismo mensaje que con la clave mala: no le dice a nadie si ese
    // usuario existe.
    assert.match(el('form-error').textContent, /usuario o contraseña incorrectos/i);
    assert.equal(globalThis.location.href, '');
  });

  test('con la contraseña equivocada avisa y deja reintentar', async () => {
    await ingresar(DOCTORA_USUARIO, 'clave-inventada');

    assert.equal(aRuta('/auth/v1/token').length, 1, 'la clave la valida Supabase, no el navegador');
    assert.equal(aRuta('/api/session').length, 0, 'no abre ninguna sesión');
    assert.match(el('form-error').textContent, /usuario o contraseña incorrectos/i);
    assert.equal(globalThis.location.href, '');
    assert.equal(el('btn-doc').disabled, false, 'el botón vuelve a estar disponible');
    assert.equal(el('btn-doc').textContent, 'Ingresar');
  });

  test('con las credenciales correctas entra al panel', async () => {
    await ingresar(DOCTORA_USUARIO, CLAVE_BUENA);

    assert.equal(globalThis.location.href, '/admin');
  });

  test('pide el token con el correo de la doctora, no con el usuario que se escribe', () => {
    const login = aRuta('/auth/v1/token')[0];

    assert.equal(login.cuerpo.email, DOCTORA_EMAIL);
    assert.equal(login.cuerpo.password, CLAVE_BUENA);
    assert.equal(login.modoCache, 'no-store', 'un login no se cachea');
  });

  test('el token se cambia por una cookie del servidor y no vuelve a viajar', () => {
    // Si el JS se quedara con el token, cualquier XSS podría leerlo y
    // hablar con la base como la doctora.
    const conToken = peticiones.filter((p) => JSON.stringify(p.cuerpo ?? '').includes(TOKEN));

    assert.equal(conToken.length, 1, 'el token viaja una sola vez');
    assert.equal(conToken[0].ruta, '/api/session');
    assert.equal(conToken[0].metodo, 'POST');
    assert.equal(conToken[0].modoCache, 'no-store');
  });

  test('si el servidor no abre la sesión, no entra al panel', async () => {
    servidorAbreSesion = false;
    await ingresar(DOCTORA_USUARIO, CLAVE_BUENA);
    servidorAbreSesion = true;

    assert.equal(globalThis.location.href, '', 'sin cookie válida no tiene sentido ir a /admin');
    assert.match(el('form-error').textContent, /no pudimos iniciar la sesión/i);
    assert.equal(el('btn-doc').disabled, false);
  });
});

describe('cerrar la sesión', () => {
  test('borra la cookie en el servidor y vuelve al login', async () => {
    peticiones.length = 0;
    globalThis.location.href = '';

    await cerrarSesion();

    const salida = aRuta('/api/session');
    assert.equal(salida.length, 1);
    assert.equal(salida[0].metodo, 'DELETE', 'la cookie la borra el servidor, no el navegador');
    assert.equal(globalThis.location.href, '/login');
  });

  test('aunque falle la red, igual sale', async () => {
    // La cookie vence sola; dejar a alguien dentro del portal porque no
    // hubo señal sería peor.
    globalThis.location.href = '';
    redCaida = true;

    await cerrarSesion();
    redCaida = false;

    assert.equal(globalThis.location.href, '/login');
  });
});

describe('haySesion()', () => {
  test('dice que sí cuando el servidor reconoce la cookie', async () => {
    hayCookie = true;
    assert.equal(await haySesion(), true);
  });

  test('dice que no cuando el servidor la rechaza', async () => {
    hayCookie = false;
    assert.equal(await haySesion(), false);
  });

  test('y tampoco la da por buena si no hay red', async () => {
    redCaida = true;
    const resultado = await haySesion();
    redCaida = false;

    assert.equal(resultado, false, 'ante la duda, no hay sesión');
  });
});
