import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { labelEstado, iniciales, fechaHoy, horaAhora }
  from '../../assets/js/modules/utils.js';

describe('labelEstado', () => {
  test('traduce los cinco estados del CHECK de citas', () => {
    assert.equal(labelEstado('pendiente'), 'Pendiente');
    assert.equal(labelEstado('confirmada'), 'Confirmada');
    assert.equal(labelEstado('atendida'), 'Atendida');
    assert.equal(labelEstado('cancelada'), 'Cancelada');
    assert.equal(labelEstado('nopresento'), 'No se presentó');
  });

  test('devuelve el valor crudo si no lo conoce', () => {
    // Un estado nuevo en la base no debe romper la interfaz.
    assert.equal(labelEstado('reprogramada'), 'reprogramada');
  });
});

describe('iniciales', () => {
  test('toma la primera letra de las dos primeras palabras', () => {
    assert.equal(iniciales('María López'), 'ML');
  });

  test('con tres o más nombres se queda con dos', () => {
    assert.equal(iniciales('Ana María Gutiérrez Paz'), 'AM');
  });

  test('con un solo nombre devuelve una letra', () => {
    assert.equal(iniciales('Roberto'), 'R');
  });

  test('sin nombre no revienta', () => {
    // Un expediente puede llegar con el nombre vacío.
    assert.equal(iniciales(''), '?');
    assert.equal(iniciales(null), '?');
    assert.equal(iniciales(undefined), '?');
  });

  test('siempre en mayúsculas', () => {
    assert.equal(iniciales('juan ramon'), 'JR');
  });
});

describe('fechaHoy y horaAhora', () => {
  test('fechaHoy devuelve texto, no una fecha', () => {
    // Es la razón de que visitas_clinicas.fecha sea text y no date.
    const f = fechaHoy();
    assert.equal(typeof f, 'string');
    assert.ok(f.length > 0);
  });

  test('fechaHoy no usa formato ISO', () => {
    // Si algún día pasara a ISO habría que revisar el esquema y las
    // claves naturales que la usan.
    assert.doesNotMatch(fechaHoy(), /^\d{4}-\d{2}-\d{2}$/);
  });

  test('horaAhora devuelve una hora con dos partes', () => {
    assert.match(horaAhora(), /\d{1,2}[:.]\d{2}/);
  });
});
