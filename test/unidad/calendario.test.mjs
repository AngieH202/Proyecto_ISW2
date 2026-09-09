// Funciones del calendario del paciente (assets/js/modules/patient.js) y
// las etiquetas que usan las dos pantallas (modules/utils.js).
//
// Son puras: no tocan la red. Si se rompen, el paciente ve mal los días o
// manda una fecha que la base no entiende.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── DOM mínimo ────────────────────────────────────────────────────────
// Los módulos publican sus handlers en window al cargarse, así que esto
// tiene que quedar montado ANTES de importarlos.
const campos = new Map();

function nuevoElemento(id) {
  const clases = new Set();
  return {
    id, value: '', textContent: '', innerHTML: '', disabled: false, style: {},
    classList: {
      add: (c) => clases.add(c),
      remove: (c) => clases.delete(c),
      toggle: (c, forzar) => ((forzar ?? !clases.has(c)) ? clases.add(c) : clases.delete(c)),
      contains: (c) => clases.has(c)
    },
    querySelector: () => nuevoElemento('interno'),
    querySelectorAll: () => [],
    nextElementSibling: null
  };
}

globalThis.document = {
  getElementById(id) {
    if (!campos.has(id)) campos.set(id, nuevoElemento(id));
    return campos.get(id);
  },
  querySelectorAll: () => [],
  querySelector: () => nuevoElemento('interno')
};
globalThis.window = globalThis;
globalThis.location = { pathname: '/login', search: '?app=1', href: '', replace() {} };

const el = (id) => globalThis.document.getElementById(id);

// Estas funciones no hablan con la base, pero alguna dispara de paso un
// refresco de horarios. Un fetch que no devuelve nada alcanza.
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [] });

const MODULOS = new URL('../../assets/js/', import.meta.url).href;

const patient = await import(MODULOS + 'modules/patient.js');
const {
  obtenerDiasSemana, formatoFechaKey, formatoFechaLabel, esPasado,
  cambiarSemana, selDia, resetSeleccion
} = patient;
const { labelEstado, iniciales } = await import(MODULOS + 'modules/utils.js');

describe('obtenerDiasSemana()', () => {
  test('devuelve cinco días', () => {
    assert.equal(obtenerDiasSemana().length, 5);
  });

  test('van de lunes a viernes: la clínica no atiende fin de semana', () => {
    const dias = obtenerDiasSemana().map((d) => d.getDay());
    assert.deepEqual(dias, [1, 2, 3, 4, 5]);
  });

  test('son cinco días consecutivos', () => {
    const dias = obtenerDiasSemana();
    for (let i = 1; i < dias.length; i++) {
      const horas = (dias[i] - dias[i - 1]) / 3_600_000;
      assert.equal(horas, 24, `entre el día ${i - 1} y el ${i} debería haber 24 h`);
    }
  });
});

describe('formatoFechaKey()', () => {
  test('arma la fecha como la espera Postgres, con ceros a la izquierda', () => {
    assert.equal(formatoFechaKey(new Date(2030, 4, 7)), '2030-05-07');
    assert.equal(formatoFechaKey(new Date(2030, 11, 25)), '2030-12-25');
  });

  test('usa la fecha local, no UTC: si no, la cita se corre un día', () => {
    // 23:30 local del 7 es el 8 en UTC. La clave tiene que decir 7.
    assert.equal(formatoFechaKey(new Date(2030, 4, 7, 23, 30)), '2030-05-07');
  });
});

describe('formatoFechaLabel()', () => {
  test('lo que lee el paciente en el botón del día', () => {
    assert.equal(formatoFechaLabel(new Date(2030, 4, 7)), '7 may 2030');
  });
});

describe('esPasado()', () => {
  const hoy = new Date();

  test('el día de hoy todavía se puede elegir', () => {
    assert.equal(esPasado(hoy), false);
  });

  test('ayer no', () => {
    const ayer = new Date(hoy);
    ayer.setDate(hoy.getDate() - 1);
    assert.equal(esPasado(ayer), true);
  });

  test('mañana sí', () => {
    const manana = new Date(hoy);
    manana.setDate(hoy.getDate() + 1);
    assert.equal(esPasado(manana), false);
  });
});

describe('cambiarSemana()', () => {
  test('avanza a la semana siguiente', () => {
    const antes = obtenerDiasSemana()[0].getTime();
    cambiarSemana(1);
    const despues = obtenerDiasSemana()[0].getTime();
    assert.equal((despues - antes) / 3_600_000, 24 * 7);
  });

  test('no deja retroceder antes de la semana en curso', () => {
    cambiarSemana(-1);                      // vuelve a la semana actual
    const actual = obtenerDiasSemana()[0].getTime();
    cambiarSemana(-1);                      // este no debería hacer nada
    assert.equal(obtenerDiasSemana()[0].getTime(), actual);
    assert.equal(patient.semanaOffset, 0);
  });

  test('cambiar de semana borra el día que estaba elegido', () => {
    selDia('2030-05-07', '7 may 2030', 'Mar');
    cambiarSemana(1);
    assert.equal(patient.diaSel, null, 'el día de otra semana no puede seguir elegido');
    cambiarSemana(-1);
  });

  test('deshabilita el botón de semana anterior cuando ya está en la actual', () => {
    assert.equal(el('btn-sem-ant').disabled, true);
    assert.equal(el('label-semana').textContent, '📅 Esta semana');
  });
});

describe('selDia() / resetSeleccion()', () => {
  test('elegir un día limpia el horario elegido antes', () => {
    patient.selSlot(3);
    selDia('2030-05-07', '7 may 2030', 'Mar');
    assert.equal(patient.slotSel, null, 'el horario de otro día no sirve');
    assert.deepEqual(patient.diaSel, { key: '2030-05-07', label: '7 may 2030', nombreDia: 'Mar' });
  });

  test('resetSeleccion() deja todo sin elegir', () => {
    resetSeleccion();
    assert.equal(patient.diaSel, null);
    assert.equal(patient.slotSel, null);
  });
});

describe('labelEstado()', () => {
  test('traduce los estados de la base a lo que ve la gente', () => {
    assert.equal(labelEstado('pendiente'), 'Pendiente');
    assert.equal(labelEstado('nopresento'), 'No se presentó');
    assert.equal(labelEstado('cancelada'), 'Cancelada');
  });

  test('un estado desconocido se muestra tal cual, sin romper la pantalla', () => {
    assert.equal(labelEstado('reprogramada'), 'reprogramada');
  });
});

describe('iniciales()', () => {
  test('toma las dos primeras del nombre', () => {
    assert.equal(iniciales('María López'), 'ML');
    assert.equal(iniciales('Juan Carlos Pérez Díaz'), 'JC');
    assert.equal(iniciales('Belkis'), 'B');
  });

  test('sin nombre devuelve un signo, no rompe el avatar', () => {
    assert.equal(iniciales(''), '?');
    assert.equal(iniciales(null), '?');
  });
});
