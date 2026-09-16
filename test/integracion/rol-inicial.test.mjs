// Con qué formulario abre el login (assets/js/modules/auth.js).
//
// El rol inicial lo fija el HTML y es paciente: quien entra por la
// landing viene a pedir una cita. La excepción se decide en el módulo,
// al cargarse, y es la única razón por la que este archivo existe
// aparte: el search de la URL hay que fijarlo antes del import, y cada
// archivo de test corre en su propio proceso.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, MODULOS } from '../entorno.mjs';

const { el } = instalarDom({ pathname: '/login', search: '?desde=admin' });

globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => null });

await import(MODULOS + 'app.js');

describe('el login cuando se rebota de /admin', () => {
  test('abre en el formulario de la doctora, no en el del paciente', () => {
    // api/admin.js redirige a /login?desde=admin cuando no hay cookie
    // válida. Mandarla al formulario del paciente la obligaría a buscar
    // la pestaña cada vez que se le vence la sesión.
    assert.equal(el('login-doctora').classList.contains('active'), true);
    assert.equal(el('login-paciente').classList.contains('active'), false);
  });

  test('y el de estado tampoco queda abierto', () => {
    assert.equal(el('login-estado').classList.contains('active'), false);
  });
});
