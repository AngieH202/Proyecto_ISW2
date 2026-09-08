import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { clave, leer, guardar, invalidar, limpiar, estado, TTL_POR_DEFECTO }
  from '../../assets/js/modules/cache.js';

describe('cache: guardar y leer', () => {
  beforeEach(() => limpiar());

  test('una entrada guardada se lee', () => {
    guardar(clave('citas', 'fecha=eq.2026-09-10'), [{ id: 1 }]);
    assert.deepEqual(leer(clave('citas', 'fecha=eq.2026-09-10')), [{ id: 1 }]);
  });

  test('una clave que no existe da undefined, no null', () => {
    // La distinción importa: null puede ser un valor cacheado legítimo.
    assert.equal(leer(clave('citas', 'nada')), undefined);
  });

  test('la clave incluye la consulta, no sólo la tabla', () => {
    guardar(clave('citas', 'a=1'), ['a']);
    assert.equal(leer(clave('citas', 'b=2')), undefined);
  });

  test('vence al pasar el TTL', async () => {
    guardar(clave('citas', 'x'), ['dato'], 30);
    assert.deepEqual(leer(clave('citas', 'x')), ['dato']);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(leer(clave('citas', 'x')), undefined);
  });

  test('el TTL por defecto es de 30 segundos', () => {
    assert.equal(TTL_POR_DEFECTO, 30_000);
  });
});

describe('cache: invalidación', () => {
  beforeEach(() => limpiar());

  test('escribir una tabla borra sus claves', () => {
    guardar(clave('citas', 'a=1'), ['x']);
    guardar(clave('citas', 'b=2'), ['y']);
    invalidar('citas');
    assert.equal(leer(clave('citas', 'a=1')), undefined);
    assert.equal(leer(clave('citas', 'b=2')), undefined);
  });

  test('no toca las claves de otras tablas', () => {
    guardar(clave('citas', 'a=1'), ['x']);
    guardar(clave('expedientes', 'a=1'), ['y']);
    invalidar('citas');
    assert.deepEqual(leer(clave('expedientes', 'a=1')), ['y']);
  });

  test('escribir visitas_clinicas también invalida expedientes', () => {
    // Dependencia cruzada: el trigger de 007 mueve el contador del lado
    // de la base, así que la lista de expedientes queda vieja.
    guardar(clave('expedientes', 'order=nombre.asc'), ['ficha']);
    guardar(clave('visitas_clinicas', 'expediente_id=eq.1'), ['visita']);
    invalidar('visitas_clinicas');
    assert.equal(leer(clave('expedientes', 'order=nombre.asc')), undefined);
    assert.equal(leer(clave('visitas_clinicas', 'expediente_id=eq.1')), undefined);
  });

  test('invalidar expedientes no arrastra visitas_clinicas', () => {
    guardar(clave('visitas_clinicas', 'x'), ['visita']);
    invalidar('expedientes');
    assert.deepEqual(leer(clave('visitas_clinicas', 'x')), ['visita']);
  });

  test('una tabla sin dependencias declaradas se invalida a sí misma', () => {
    guardar(clave('perfiles', 'x'), ['p']);
    invalidar('perfiles');
    assert.equal(leer(clave('perfiles', 'x')), undefined);
  });
});

describe('cache: métricas', () => {
  test('estado() informa entradas y tasa de aciertos', () => {
    limpiar();
    const antes = estado();
    guardar(clave('citas', 'm'), ['x']);
    leer(clave('citas', 'm'));          // acierto
    leer(clave('citas', 'no-esta'));    // fallo

    const ahora = estado();
    assert.equal(ahora.entradas, 1);
    assert.ok(ahora.aciertos > antes.aciertos);
    assert.ok(ahora.fallos > antes.fallos);
    assert.match(ahora.tasaAciertos, /^\d+%$|^—$/);
  });
});
