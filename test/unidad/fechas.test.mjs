import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, MODULOS } from '../ayudas/dom.mjs';

// patient.js publica handlers en window al cargarse.
instalarDom();
const { formatoFechaKey, formatoFechaLabel, esPasado, obtenerDiasSemana } =
  await import(MODULOS + 'modules/patient.js');

describe('formatoFechaKey', () => {
  test('devuelve ISO, que es lo que citas.fecha espera', () => {
    assert.equal(formatoFechaKey(new Date(2026, 8, 3)), '2026-09-03');
  });

  test('rellena mes y día con cero', () => {
    assert.equal(formatoFechaKey(new Date(2026, 0, 5)), '2026-01-05');
  });

  test('usa la fecha local, no UTC', () => {
    // Con getUTCDate, una fecha de la noche en Honduras saldría corrida
    // un día y la cita quedaría agendada en el día equivocado.
    const d = new Date(2026, 8, 3, 23, 30);
    assert.equal(formatoFechaKey(d), '2026-09-03');
  });
});

describe('formatoFechaLabel', () => {
  test('arma la etiqueta que ve el paciente', () => {
    assert.equal(formatoFechaLabel(new Date(2026, 8, 3)), '3 sep 2026');
  });
});

describe('esPasado', () => {
  test('ayer es pasado', () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    assert.equal(esPasado(ayer), true);
  });

  test('hoy no es pasado', () => {
    // Un paciente tiene que poder agendar hoy; el filtro por hora lo
    // hace después cargarSlotsDia.
    assert.equal(esPasado(new Date()), false);
  });

  test('mañana no es pasado', () => {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    assert.equal(esPasado(manana), false);
  });
});

describe('obtenerDiasSemana', () => {
  const dias = obtenerDiasSemana();

  test('devuelve cinco días', () => {
    assert.equal(dias.length, 5);
  });

  test('van de lunes a viernes', () => {
    // La clínica no atiende fines de semana.
    assert.deepEqual(dias.map((d) => d.getDay()), [1, 2, 3, 4, 5]);
  });

  test('son consecutivos', () => {
    for (let i = 1; i < dias.length; i++) {
      const horas = (dias[i] - dias[i - 1]) / 36e5;
      assert.ok(horas >= 23 && horas <= 25, `hay ${horas} h entre el día ${i - 1} y el ${i}`);
    }
  });

  test('arrancan a medianoche', () => {
    for (const d of dias) {
      assert.equal(d.getHours(), 0);
      assert.equal(d.getMinutes(), 0);
    }
  });
});
