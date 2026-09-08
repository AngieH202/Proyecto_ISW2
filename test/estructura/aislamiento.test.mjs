import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RAIZ } from '../ayudas/dom.mjs';

// Estos tests cuidan el invariante más importante del proyecto: lo
// privado no viaja a quien no tiene sesión. Si alguien vuelve a meter el
// panel en index.html, o le devuelve a anon el acceso a las tablas, esto
// falla antes de llegar a producción.

const leer = (r) => readFileSync(RAIZ + r, 'utf8');

const MARCAS_PRIVADAS = [
  'screen-doctora', 'screen-expediente', 'modal-diag',
  'guardarDiagnostico', 'cargarExpedientes', 'switchTab',
  'toggleTrat', 'volverExpedientes', 'marcarAtendida'
];

describe('index.html no lleva nada del portal', () => {
  const html = leer('index.html');

  for (const marca of MARCAS_PRIVADAS) {
    test(`no contiene «${marca}»`, () => {
      assert.ok(!html.includes(marca),
        `index.html se sirve sin sesión: no puede contener ${marca}`);
    });
  }

  test('sí conserva el login y el flujo del paciente', () => {
    for (const publico of ['screen-login', 'screen-paciente', 'screen-estado', 'loginPaciente']) {
      assert.ok(html.includes(publico), `falta ${publico}`);
    }
  });
});

describe('el marcado del portal no es servible', () => {
  test('vive en api/, con guion bajo', () => {
    // Vercel no publica como ruta los archivos de api/ que empiezan con
    // guion bajo, así que este HTML no se puede descargar.
    const portal = leer('api/_portal.js');
    assert.ok(portal.includes('screen-doctora'));
    assert.ok(portal.includes('screen-expediente'));
  });

  test('api/admin.js corta antes de servirlo si no hay sesión', () => {
    const admin = leer('api/admin.js');
    // Se mira sólo el cuerpo del handler: PORTAL_HTML también aparece en
    // el import de la primera línea, que no dice nada sobre el orden.
    const cuerpo = admin.slice(admin.indexOf('export default'));
    const corte = cuerpo.indexOf('return res.status(302)');
    const sirve = cuerpo.indexOf('res.status(200).send');
    assert.ok(corte > 0, 'debería redirigir sin sesión');
    assert.ok(sirve > 0, 'debería servir la página con sesión');
    assert.ok(corte < sirve, 'la redirección tiene que ir antes de servir');
  });

  test('api/admin.js no manda el token al navegador', () => {
    // La cookie es HttpOnly a propósito: la app arma HTML con innerHTML
    // a partir de nombres y diagnósticos, así que un XSS se lo llevaría.
    const admin = leer('api/admin.js');
    const inyecta = admin.match(/const sesion = JSON\.stringify\(\{[\s\S]*?\}\)/);
    assert.ok(inyecta, 'no se encontró el objeto que se inyecta');
    assert.ok(!/token/i.test(inyecta[0]), 'el token no debe viajar a la página');
  });
});

describe('el lado público no toca ninguna tabla', () => {
  const publicos = [
    'assets/js/app.js',
    'assets/js/modules/auth.js',
    'assets/js/modules/patient.js'
  ];

  for (const archivo of publicos) {
    test(`${archivo} sólo usa RPC`, () => {
      const src = leer(archivo);
      const directas = src.match(/\b(sbGet|sbPost|sbPatch|sbUpsert)\s*\(/g) ?? [];
      assert.deepEqual(directas, [],
        `011 le quita a anon el acceso a las tablas: ${archivo} debe usar sbRpc`);
    });
  }

  test('el portal sí usa tablas, pero a través del proxy', () => {
    const src = leer('assets/js/admin.js');
    assert.ok(/\bsbGet\s*\(/.test(src), 'el panel lee tablas');

    const api = leer('assets/js/modules/api.js');
    assert.ok(api.includes("'/api/db'"), 'api.js debe enrutar por el proxy con sesión');
  });
});

describe('las lecturas críticas no se cachean', () => {
  // De estas depende si se escribe o no. Servir una respuesta vieja
  // dejaría pasar un duplicado y desharía la idempotencia.
  //
  // Las anclas son únicas a propósito: «const visitas = await sbGet»
  // aparece dos veces en admin.js, y la de cargarHistorial sí puede ir
  // cacheada porque sólo se muestra.
  const criticas = [
    ['assets/js/modules/patient.js', 'const ocupadas = await', 'los horarios libres'],
    ['assets/js/admin.js', 'const duplicada = await sbGet', 'el descarte de visita repetida'],
    ['assets/js/admin.js', '&select=id`,', 'el recuento que se escribe'],
    ['assets/js/admin.js', 'const fresco = await sbGet', 'la relectura del expediente']
  ];

  for (const [archivo, ancla, que] of criticas) {
    test(`${que} va sin caché`, () => {
      const src = leer(archivo);
      const i = src.indexOf(ancla);
      assert.ok(i > 0, `no se encontró «${ancla}» en ${archivo}`);
      const bloque = src.slice(Math.max(0, i - 200), i + 400);
      assert.ok(/cache:\s*false/.test(bloque) || /sbRpc/.test(bloque),
        `${que} debería llevar { cache: false } o pasar por RPC`);
    });
  }
});

describe('el service worker no cachea lo privado', () => {
  const sw = leer('sw.js');

  test('deja pasar /admin y /api sin tocarlos', () => {
    assert.ok(sw.includes("'/admin'") && sw.includes("'/api/'"),
      'deberían estar en la lista de rutas que nunca se cachean');
  });

  test('no precarga el portal', () => {
    const precarga = sw.match(/const PRECARGA = \[[\s\S]*?\];/)[0];
    assert.ok(!precarga.includes('admin'));
    assert.ok(!precarga.includes('_portal'));
  });

  test('sólo responde a GET', () => {
    assert.ok(/req\.method !== 'GET'/.test(sw),
      'un POST o PATCH nunca debe cachearse ni reintentarse solo');
  });
});
