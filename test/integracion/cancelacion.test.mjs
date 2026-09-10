// El paciente cancela su propia cita.
//
// El recorrido completo: el paciente se da de baja, el horario vuelve a
// estar disponible para cualquiera, y a la doctora le aparece que fue el
// paciente quien canceló —no ella— con el botón para habilitar ese hueco.
//
// Lo que se cuida es que la baja libere el slot de verdad y que nadie
// pueda cancelar una cita ajena.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, instalarBaseFalsa, MODULOS } from '../entorno.mjs';

const { el, escribir, leerNotif, limpiarNotif } = instalarDom();
const { db } = instalarBaseFalsa();

await import(MODULOS + 'app.js');
const patient = await import(MODULOS + 'modules/patient.js');
const { sbRpc } = await import(MODULOS + 'modules/api.js');

const DIA = '2030-05-15';
const HORA = '10:00 AM';
const SLOT = 4;                       // '10:00 AM' en SLOTS_BASE

const MARIA = { nombre: 'María López', id: '0801-1990-12345', edad: '34', tel: '9876-5432' };
const CARLOS = { nombre: 'Carlos Núñez', id: '0501-1985-54321', edad: '39', tel: '3333-2222' };

async function entrarComo(p) {
  escribir('p-nombre', p.nombre);
  escribir('p-id', p.id);
  escribir('p-edad', p.edad);
  escribir('p-tel', p.tel);
  await globalThis.loginPaciente();
}

async function agendar({ slot = SLOT, motivo = 'Control' } = {}) {
  patient.selDia(DIA, '15 may 2030', 'Mié');
  patient.selSlot(slot);
  escribir('cf-motivo', motivo);
  await globalThis.enviarSolicitud();
}

async function consultarEstadoDe(identidad) {
  escribir('e-id', identidad);
  await globalThis.consultarEstado();
}

// Un horario puede acumular varias citas: las canceladas quedan como
// registro y encima de ellas se agenda de nuevo. Por eso hay que decir
// cuál se busca.
const citaEn = (hora) => db.citas.find((c) => c.fecha === DIA && c.hora === hora);
const citaActivaEn = (hora) =>
  db.citas.find((c) => c.fecha === DIA && c.hora === hora && c.estado !== 'cancelada_paciente' && c.estado !== 'cancelada');
const horasOcupadas = async () => (await sbRpc('slots_ocupados', { p_fecha: DIA })).data.map((c) => c.hora);

describe('el paciente cancela su cita', () => {
  test('primero agenda y el horario queda tomado', async () => {
    await entrarComo(MARIA);
    await agendar({ motivo: 'Control de ortodoncia' });

    assert.equal(citaEn(HORA).estado, 'pendiente');
    assert.ok((await horasOcupadas()).includes(HORA));
  });

  test('en su consulta le aparece el botón para cancelar', async () => {
    await consultarEstadoDe(MARIA.id);

    assert.match(el('estado-resultado').innerHTML, /onclick="cancelarCita\(0\)"/);
    assert.match(el('estado-resultado').innerHTML, /Cancelar esta cita/);
  });

  test('al cancelar, la cita queda a nombre suyo pero dada de baja', async () => {
    limpiarNotif();
    await globalThis.cancelarCita(0);

    assert.equal(citaEn(HORA).estado, 'cancelada_paciente');
    assert.equal(citaEn(HORA).identidad, MARIA.id, 'la cita no se borra: queda el registro');
    assert.match(leerNotif(), /cancelada/i);
  });

  test('y el horario se desbloquea en el acto', async () => {
    assert.ok(!(await horasOcupadas()).includes(HORA), 'ya no figura entre los ocupados');
  });

  test('la pantalla se actualiza sola y ya no ofrece cancelar', () => {
    const html = el('estado-resultado').innerHTML;

    assert.match(html, /Cancelada por el paciente/);
    assert.ok(!html.includes('Cancelar esta cita'), 'no se cancela dos veces lo mismo');
  });

  test('cancelar de nuevo no rompe ni cambia nada', async () => {
    // Un doble clic o un reintento tras un timeout terminan igual.
    const r = await sbRpc('cancelar_mi_cita', { p_identidad: MARIA.id, p_fecha: DIA, p_hora: HORA });

    assert.equal(r.data, 'ya_cancelada');
    assert.equal(citaEn(HORA).estado, 'cancelada_paciente');
  });
});

describe('otra persona puede tomar ese horario', () => {
  test('el slot vuelve a aparecer libre en el calendario', async () => {
    patient.selDia(DIA, '15 may 2030', 'Mié');
    await patient.cargarSlotsDia();

    assert.match(el('horarios-grid').innerHTML, new RegExp(`onclick="selSlot\\(${SLOT}\\)">${HORA}<`));
  });

  test('y otro paciente lo reserva sin problema', async () => {
    await entrarComo(CARLOS);
    await agendar({ motivo: 'Dolor de muela' });

    const activas = db.citas.filter((c) => c.fecha === DIA && c.hora === HORA && c.estado !== 'cancelada_paciente');
    assert.equal(activas.length, 1);
    assert.equal(activas[0].identidad, CARLOS.id);
    assert.equal(activas[0].estado, 'pendiente');
  });
});

describe('nadie cancela la cita de otro', () => {
  test('un tercero no puede dar de baja la cita de Carlos', async () => {
    const r = await sbRpc('cancelar_mi_cita', {
      p_identidad: '0999-0000-99999',   // alguien que no tiene esa cita
      p_fecha: DIA,
      p_hora: HORA
    });

    assert.equal(r.data, 'no_encontrada');
    assert.equal(citaActivaEn(HORA).estado, 'pendiente', 'la cita de Carlos sigue en pie');
    assert.equal(citaActivaEn(HORA).identidad, CARLOS.id);
  });

  test('sin identidad tampoco', async () => {
    const r = await sbRpc('cancelar_mi_cita', { p_identidad: '', p_fecha: DIA, p_hora: HORA });

    assert.equal(r.data, 'no_encontrada');
    assert.equal(citaActivaEn(HORA).estado, 'pendiente');
  });
});

describe('cancelar desde el propio flujo de agendamiento', () => {
  const enPaso = (n) => el('pstep-' + n).classList.contains('active');
  const enLogin = () => el('screen-login').classList.contains('active');

  test('en los pasos previos no hay nada que dar de baja: sólo vuelve al login', async () => {
    await entrarComo(MARIA);
    patient.selDia(DIA, '15 may 2030', 'Mié');
    patient.selSlot(2);
    const citasAntes = db.citas.length;
    limpiarNotif();

    globalThis.cancelarAgendamiento();

    assert.equal(db.citas.length, citasAntes, 'la cita todavía no existía');
    assert.equal(patient.diaSel, null, 'suelta lo que había elegido');
    assert.equal(patient.slotSel, null);
    assert.equal(enLogin(), true, 'vuelve al formulario');
  });

  test('desde la confirmación sí da de baja la cita recién enviada', async () => {
    await entrarComo(MARIA);
    await agendar({ slot: 2, motivo: 'Extracción' });
    const hora = citaEn('8:30 AM')?.hora;

    assert.equal(enPaso(4), true, 'primero llega a la confirmación');
    assert.equal(citaActivaEn(hora).estado, 'pendiente');

    limpiarNotif();
    await globalThis.cancelarCitaAgendada();

    assert.equal(citaEn('8:30 AM').estado, 'cancelada_paciente');
    assert.match(leerNotif(), /cancelada/i);
  });

  test('y lo devuelve al login con el formulario limpio', () => {
    assert.equal(enLogin(), true);
    assert.equal(el('p-nombre').value, '', 'el formulario queda en blanco');
    assert.equal(patient.diaSel, null);
  });

  test('ese horario queda libre para otro paciente', async () => {
    assert.ok(!(await horasOcupadas()).includes('8:30 AM'));
  });
});

describe('una cita ya atendida no se cancela', () => {
  test('devuelve no_se_puede y el historial queda intacto', async () => {
    // Borrarla del historial sería falsear lo que ocurrió.
    db.citas.push({
      id: 500, fecha: DIA, hora: '7:00 AM', estado: 'atendida',
      nombre_paciente: MARIA.nombre, identidad: MARIA.id, motivo: 'Limpieza'
    });

    const r = await sbRpc('cancelar_mi_cita', { p_identidad: MARIA.id, p_fecha: DIA, p_hora: '7:00 AM' });

    assert.equal(r.data, 'no_se_puede');
    assert.equal(citaEn('7:00 AM').estado, 'atendida');
  });
});
