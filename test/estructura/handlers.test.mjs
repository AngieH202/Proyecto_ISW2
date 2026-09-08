import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { instalarDom, RAIZ, MODULOS } from '../ayudas/dom.mjs';
import { instalarPostgrest } from '../ayudas/postgrest.mjs';

// El HTML llama funciones desde atributos onclick, pero un
// <script type="module"> tiene scope propio y no crea globales. Cada
// módulo publica en window lo que su marcado nombra; si alguien renombra
// una función y olvida el puente, el botón deja de hacer nada en
// silencio. Esto lo detecta.

instalarDom();
instalarPostgrest();

const leer = (r) => readFileSync(RAIZ + r, 'utf8');

// Acepta onclick="fn(  y  onclick=\"fn(  -- la segunda forma aparece
// dentro de las cadenas JSON de _portal.js y de las plantillas de JS.
const RE = /on(?:click|input|change)=\\?"([A-Za-z_][A-Za-z0-9_]*)\(/g;
const handlers = (txt) => [...new Set([...txt.matchAll(RE)].map((m) => m[1]))].sort();

await import(MODULOS + 'app.js');

describe('entrypoint público', () => {
  const usados = handlers(leer('index.html'));

  test('index.html invoca handlers', () => {
    assert.ok(usados.length >= 10, `sólo se encontraron ${usados.length}`);
  });

  for (const nombre of usados) {
    test(`app.js define ${nombre}`, () => {
      assert.equal(typeof globalThis[nombre], 'function');
    });
  }
});

await import(MODULOS + 'admin.js');

describe('entrypoint del portal', () => {
  // Los del marcado, más los que admin.js genera dentro de sus plantillas
  // de HTML: esos también terminan como onclick en el DOM.
  const delMarcado = handlers(leer('api/_portal.js'));
  const generados = handlers(leer('assets/js/admin.js'));
  const todos = [...new Set([...delMarcado, ...generados])].sort();

  test('el portal invoca handlers', () => {
    assert.ok(todos.length >= 10, `sólo se encontraron ${todos.length}`);
  });

  for (const nombre of todos) {
    test(`admin.js define ${nombre}`, () => {
      assert.equal(typeof globalThis[nombre], 'function');
    });
  }
});

describe('el puente hacia window es mínimo', () => {
  test('cada global público corresponde a un onclick que existe', () => {
    const declarados = [
      ...leer('assets/js/modules/auth.js').matchAll(/^window\.(\w+)\s*=/gm),
      ...leer('assets/js/modules/patient.js').matchAll(/^window\.(\w+)\s*=/gm)
    ].map((m) => m[1]);

    // No alcanza con mirar index.html: selDia y selSlot salen en los
    // onclick que patient.js genera al dibujar el calendario y los
    // horarios, y son igual de reales que los del marcado.
    const usados = new Set([
      ...handlers(leer('index.html')),
      ...handlers(leer('assets/js/modules/patient.js'))
    ]);

    const sobrantes = declarados.filter((d) => !usados.has(d));
    assert.deepEqual(sobrantes, [],
      'estos globales ya no los llama nadie y se pueden quitar');
  });
});
