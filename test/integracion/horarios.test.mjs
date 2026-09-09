// Elegir día y horario: los pasos 1, 2 y 3 del paciente
// (assets/js/modules/patient.js).
//
// Es la parte que decide qué se puede pulsar. Si un horario que ya pasó
// o que otro tomó queda habilitado, el paciente cree que agendó algo que
// la base va a rechazar.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, instalarBaseFalsa, MODULOS } from '../entorno.mjs';

const { el, escribir } = instalarDom();
const { db, peticiones } = instalarBaseFalsa();
const citas = db.citas;

await import(MODULOS + 'app.js');
const patient = await import(MODULOS + 'modules/patient.js');
const { SLOTS_BASE } = await import(MODULOS + 'modules/config.js');

const DIA = '2030-05-15';                 // un miércoles
const LABEL = '15 may 2030';
const MEDIA_MANANA = new Date(2030, 4, 15, 10, 30);

const enPaso = (n) => el('pstep-' + n).classList.contains('active');
const grid = () => el('horarios-grid').innerHTML;
const botonDe = (hora) => grid().match(new RegExp(`<button[^>]*>${hora}</button>`))?.[0] ?? '';

const elegirDia = (dia = DIA, label = LABEL, nombre = 'Mié') => patient.selDia(dia, label, nombre);

describe('los pasos del paciente', () => {
  test('no deja pasar a los horarios sin haber elegido día', () => {
    patient.resetSeleccion();
    patient.irPaso2();

    assert.equal(el('dia-err').style.display, 'block', 'tiene que avisar qué falta');
    assert.equal(enPaso(2), false, 'no puede avanzar');
  });

  test('con un día elegido avanza y muestra cuál es', async () => {
    elegirDia();
    patient.irPaso2();

    assert.equal(enPaso(2), true);
    assert.equal(el('dia-err').style.display, 'none', 'el aviso anterior se va');
    assert.match(el('dia-seleccionado-label').textContent, /Mié, 15 may 2030/);
  });

  test('no deja confirmar sin haber elegido horario', () => {
    patient.irPaso3();

    assert.equal(el('slot-err').style.display, 'block');
    assert.equal(enPaso(3), false);
  });

  test('con el horario elegido arma el resumen de la cita', () => {
    patient.selSlot(4);                   // '10:00 AM'
    patient.irPaso3();

    assert.equal(enPaso(3), true);
    const resumen = el('slot-resumen').innerHTML;
    assert.match(resumen, /Mié, 15 may 2030/);
    assert.match(resumen, /10:00 AM/);
    assert.match(resumen, /Clínica Dra. Belkis Suisse/);
  });

  test('volver al paso 1 borra lo que estaba elegido', () => {
    patient.irPaso1();

    assert.equal(enPaso(1), true);
    assert.equal(patient.diaSel, null);
    assert.equal(patient.slotSel, null);
  });
});

describe('cargarSlotsDia()', () => {
  test('pinta los nueve horarios de la clínica', async () => {
    elegirDia();
    await patient.cargarSlotsDia();

    assert.equal(grid().match(/<button/g).length, SLOTS_BASE.length);
  });

  test('los horarios tomados salen deshabilitados', async () => {
    citas.push({ fecha: DIA, hora: '9:15 AM', estado: 'pendiente' });
    citas.push({ fecha: DIA, hora: '11:30 AM', estado: 'confirmada' });
    await patient.cargarSlotsDia();

    assert.match(botonDe('9:15 AM'), /class="slot ocupado" disabled/);
    assert.match(botonDe('11:30 AM'), /class="slot ocupado" disabled/);
  });

  test('los libres se pueden pulsar', async () => {
    assert.match(botonDe('10:45 AM'), /class="slot libre" onclick="selSlot\(5\)"/);
  });

  test('el que ya eligió se ve seleccionado', async () => {
    patient.selSlot(5);                   // '10:45 AM'
    await patient.cargarSlotsDia();

    assert.match(botonDe('10:45 AM'), /class="slot seleccionado"/);
  });

  test('una cita cancelada no ocupa su horario', async () => {
    citas.push({ fecha: DIA, hora: '8:30 AM', estado: 'cancelada' });
    await patient.cargarSlotsDia();

    assert.match(botonDe('8:30 AM'), /class="slot libre"/);
  });

  test('sólo pregunta por el día que se está mirando', () => {
    assert.ok(peticiones.every((p) => p.funcion === 'slots_ocupados'));
    assert.ok(peticiones.every((p) => p.cuerpo.p_fecha === DIA));
  });
});

describe('los horarios de hoy que ya pasaron', () => {
  test('no se pueden elegir aunque estén libres', async (t) => {
    // Reloj congelado a las 10:30 de ese mismo día.
    t.mock.timers.enable({ apis: ['Date'], now: MEDIA_MANANA });

    elegirDia();
    await patient.cargarSlotsDia();

    assert.match(botonDe('7:00 AM'), /class="slot pasado" disabled/);
    assert.match(botonDe('10:00 AM'), /class="slot pasado" disabled/, 'la hora en punto ya pasada tampoco');
  });

  test('los de más tarde siguen disponibles, incluidos los de la tarde', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: MEDIA_MANANA });

    elegirDia();
    await patient.cargarSlotsDia();

    assert.match(botonDe('10:45 AM'), /class="slot libre"/);
    // 12:15 PM es el caso raro: el mediodía no se le suman 12 horas.
    assert.match(botonDe('12:15 PM'), /class="slot libre"/);
    assert.match(botonDe('2:00 PM'), /class="slot libre"/, '2:00 PM son las 14:00, no las 2 de la madrugada');
  });

  test('mañana esos mismos horarios están libres', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: MEDIA_MANANA });

    elegirDia('2030-05-16', '16 may 2030', 'Jue');
    await patient.cargarSlotsDia();

    assert.match(botonDe('7:00 AM'), /class="slot libre"/, 'la hora sólo pasa en el día de hoy');
  });
});

describe('enviarSolicitud()', () => {
  test('sin motivo no manda nada a la base', async () => {
    elegirDia();
    patient.selSlot(4);
    escribir('cf-motivo', '   ');
    const antes = peticiones.length;

    await globalThis.enviarSolicitud();

    assert.equal(el('motivo-err').style.display, 'block');
    assert.equal(peticiones.length, antes, 'ni siquiera intenta crear la cita');
    assert.equal(el('btn-enviar').textContent, '', 'el botón no llega a decir "Enviando..."');
  });
});
