// La caché de lecturas (assets/js/modules/cache.js).
//
// Guarda respuestas para no repetir peticiones, y las tira cuando algo
// se escribe. Lo delicado es lo segundo: si una escritura no invalida lo
// que corresponde, la doctora sigue viendo datos viejos —un expediente
// con el contador de visitas de antes, una cita ya confirmada que sigue
// figurando pendiente.
//
// Es un módulo puro: no toca window ni la red, así que no necesita DOM.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const MODULOS = new URL('../../assets/js/', import.meta.url).href;
const { clave, leer, guardar, invalidar, limpiar, estado, TTL_POR_DEFECTO } =
  await import(MODULOS + 'modules/cache.js');

describe('clave()', () => {
  test('arma la clave con la tabla y su query', () => {
    assert.equal(clave('citas', 'fecha=eq.2030-05-15'), 'citas?fecha=eq.2030-05-15');
  });

  test('dos queries distintas de la misma tabla no se pisan', () => {
    assert.notEqual(clave('citas', 'estado=eq.pendiente'), clave('citas', 'estado=eq.atendida'));
  });
});

describe('guardar() y leer()', () => {
  test('devuelve lo que se guardó', () => {
    limpiar();
    guardar('citas?hoy', [{ id: 1, hora: '10:00 AM' }]);

    assert.deepEqual(leer('citas?hoy'), [{ id: 1, hora: '10:00 AM' }]);
  });

  test('lo que nunca se guardó devuelve undefined', () => {
    assert.equal(leer('citas?nunca-pedido'), undefined);
  });

  test('null se puede cachear y no se confunde con "no hay nada"', () => {
    // Por eso el módulo usa undefined para el vacío: null puede ser una
    // respuesta legítima de la base.
    guardar('expedientes?sin-resultado', null);

    assert.equal(leer('expedientes?sin-resultado'), null);
    assert.notEqual(leer('expedientes?sin-resultado'), undefined);
  });
});

describe('vencimiento por TTL', () => {
  test('la entrada sirve mientras no venza', (t) => {
    t.mock.timers.enable({ apis: ['Date'] });
    limpiar();
    guardar('citas?hoy', ['fresco'], TTL_POR_DEFECTO);

    t.mock.timers.tick(TTL_POR_DEFECTO - 1000);
    assert.deepEqual(leer('citas?hoy'), ['fresco']);
  });

  test('pasado el TTL deja de servirse', (t) => {
    t.mock.timers.enable({ apis: ['Date'] });
    limpiar();
    guardar('citas?hoy', ['viejo'], TTL_POR_DEFECTO);

    t.mock.timers.tick(TTL_POR_DEFECTO + 1000);
    assert.equal(leer('citas?hoy'), undefined, 'una respuesta vencida no se devuelve');
  });

  test('cada entrada vence por su cuenta', (t) => {
    t.mock.timers.enable({ apis: ['Date'] });
    limpiar();
    guardar('citas?corta', ['a'], 1000);
    guardar('citas?larga', ['b'], 60_000);

    t.mock.timers.tick(2000);
    assert.equal(leer('citas?corta'), undefined);
    assert.deepEqual(leer('citas?larga'), ['b']);
  });
});

describe('invalidar()', () => {
  test('borra las entradas de la tabla que se escribió', () => {
    limpiar();
    guardar('citas?fecha=eq.2030-05-15', ['a']);
    guardar('citas?estado=eq.pendiente', ['b']);
    guardar('expedientes?order=nombre.asc', ['c']);

    invalidar('citas');

    assert.equal(leer('citas?fecha=eq.2030-05-15'), undefined);
    assert.equal(leer('citas?estado=eq.pendiente'), undefined, 'todas las queries de la tabla');
    assert.deepEqual(leer('expedientes?order=nombre.asc'), ['c'], 'lo de otras tablas se queda');
  });

  test('guardar una visita también invalida los expedientes', () => {
    // El trigger de 007_sincronizar_visitas.sql mueve el contador del
    // expediente desde la base: la lista guardada queda vieja aunque
    // nadie haya escrito en esa tabla desde el navegador.
    limpiar();
    guardar('visitas_clinicas?expediente_id=eq.exp-1', ['visita']);
    guardar('expedientes?order=nombre.asc', ['listado']);

    invalidar('visitas_clinicas');

    assert.equal(leer('visitas_clinicas?expediente_id=eq.exp-1'), undefined);
    assert.equal(leer('expedientes?order=nombre.asc'), undefined, 'el contador de visitas cambió');
  });

  test('pero escribir un expediente no borra el historial cacheado', () => {
    limpiar();
    guardar('expedientes?id=eq.exp-1', ['exp']);
    guardar('visitas_clinicas?expediente_id=eq.exp-1', ['visita']);

    invalidar('expedientes');

    assert.equal(leer('expedientes?id=eq.exp-1'), undefined);
    assert.deepEqual(leer('visitas_clinicas?expediente_id=eq.exp-1'), ['visita'], 'las visitas no cambian');
  });

  test('una tabla sin dependencias declaradas se invalida a sí misma', () => {
    limpiar();
    guardar('perfiles?id=eq.1', ['perfil']);

    invalidar('perfiles');

    assert.equal(leer('perfiles?id=eq.1'), undefined);
  });

  test('no confunde tablas cuyo nombre empieza igual', () => {
    limpiar();
    guardar('citas?hoy', ['citas']);
    guardar('citas_archivadas?2029', ['archivadas']);

    invalidar('citas');

    assert.equal(leer('citas?hoy'), undefined);
    assert.deepEqual(leer('citas_archivadas?2029'), ['archivadas'], 'otra tabla, aunque el nombre arranque igual');
  });
});

describe('limpiar() y estado()', () => {
  test('limpiar deja la caché vacía', () => {
    guardar('citas?hoy', ['a']);
    guardar('expedientes?todos', ['b']);

    limpiar();

    assert.equal(estado().entradas, 0);
    assert.equal(leer('citas?hoy'), undefined);
  });

  test('estado() informa aciertos, fallos y la tasa', () => {
    limpiar();
    guardar('citas?hoy', ['a']);

    leer('citas?hoy');            // acierto
    leer('citas?hoy');            // acierto
    leer('citas?manana');         // fallo

    const e = estado();
    assert.equal(e.entradas, 1);
    assert.ok(e.aciertos >= 2);
    assert.ok(e.fallos >= 1);
    assert.match(e.tasaAciertos, /^\d+%$/);
  });
});
