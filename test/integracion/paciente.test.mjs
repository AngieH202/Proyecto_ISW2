// Lo que hace el paciente antes y después de agendar:
// loginPaciente() y consultarEstado() (assets/js/modules/auth.js).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, instalarBaseFalsa, MODULOS } from '../entorno.mjs';

const { el, escribir } = instalarDom();
const { db } = instalarBaseFalsa();

await import(MODULOS + 'app.js');
const patient = await import(MODULOS + 'modules/patient.js');

const MARIA = { nombre: 'María López', id: '0801-1990-12345', edad: '34', tel: '9876-5432' };

async function registrar({ nombre = '', id = '', edad = '', tel = '' } = {}) {
  escribir('p-nombre', nombre);
  escribir('p-id', id);
  escribir('p-edad', edad);
  escribir('p-tel', tel);
  el('form-error').textContent = '';
  await globalThis.loginPaciente();
}

// La validación campo por campo está en formulario.test.mjs; acá va lo
// que pasa con el expediente una vez que los datos están completos.
describe('loginPaciente()', () => {
  test('con los datos completos crea el expediente y abre la pantalla del paciente', async () => {
    await registrar(MARIA);

    assert.equal(db.expedientes.length, 1);
    assert.equal(db.expedientes[0].identidad, MARIA.id);
    assert.equal(db.expedientes[0].edad, 34, 'la edad va como número, no como texto');
    assert.equal(el('screen-paciente').classList.contains('active'), true);
    assert.equal(el('form-error').textContent, '');
  });

  test('deja el formulario de la cita listo con sus datos', () => {
    assert.equal(el('cf-nombre').value, MARIA.nombre);
    assert.equal(el('cf-id').value, MARIA.id);
    assert.equal(el('cf-motivo').value, '', 'el motivo empieza en blanco');
    assert.equal(patient.diaSel, null, 'sin día elegido de una sesión anterior');
  });

  test('volver a registrarse no crea un segundo expediente', async () => {
    await registrar({ ...MARIA, tel: '8888-1111' });

    assert.equal(db.expedientes.length, 1, 'la identidad es única');
    assert.equal(db.expedientes[0].telefono, '8888-1111', 'actualiza lo que el paciente corrigió');
  });

  test('y no le borra el historial a quien vuelve', async () => {
    // registrar_paciente manda sólo lo que el paciente escribe: incluir
    // visitas o ultima_visita pisaría el trabajo de la doctora.
    db.expedientes[0].visitas = 3;
    db.expedientes[0].ultima_visita = '1 de mayo de 2030';

    await registrar({ ...MARIA, tel: '7777-0000' });

    assert.equal(db.expedientes[0].visitas, 3);
    assert.equal(db.expedientes[0].ultima_visita, '1 de mayo de 2030');
  });
});

describe('consultarEstado()', () => {
  const consultar = async (id) => {
    escribir('e-id', id);
    el('form-error').textContent = '';
    el('estado-resultado').innerHTML = '';
    await globalThis.consultarEstado();
  };

  test('pide la identidad antes de consultar nada', async () => {
    await consultar('');
    assert.match(el('form-error').textContent, /ingresá tu número de identidad/i);
  });

  test('avisa cuando esa identidad no tiene citas', async () => {
    await consultar('0000-0000-00000');
    assert.match(el('form-error').textContent, /no encontramos citas/i);
  });

  test('muestra el estado de las citas propias', async () => {
    db.citas.push({
      id: 1, fecha: '2030-05-15', hora: '10:00 AM', estado: 'confirmada',
      nombre_paciente: MARIA.nombre, identidad: MARIA.id, motivo: 'Control de ortodoncia'
    });

    await consultar(MARIA.id);
    const html = el('estado-resultado').innerHTML;

    assert.equal(el('screen-estado').classList.contains('active'), true);
    assert.match(html, /Confirmada/);
    assert.match(html, /Control de ortodoncia/);
    assert.match(html, /10:00 AM/);
  });

  test('no deja ver las citas de otra persona', async () => {
    db.citas.push({
      id: 2, fecha: '2030-05-15', hora: '11:30 AM', estado: 'pendiente',
      nombre_paciente: 'Carlos Núñez', identidad: '0501-1985-54321', motivo: 'Extracción'
    });

    await consultar(MARIA.id);
    const html = el('estado-resultado').innerHTML;

    assert.doesNotMatch(html, /Carlos Núñez/, 'la consulta filtra por identidad, del lado de la base');
    assert.doesNotMatch(html, /Extracción/);
  });

  test('un homónimo tampoco ve la cita de la otra persona', async () => {
    // Cruzar por nombre mostraría datos clínicos ajenos.
    db.expedientes.push({
      id: 'exp-99', nombre: MARIA.nombre, identidad: '0999-0000-99999',
      edad: 51, telefono: '2222-3333', visitas: 0, ultima_visita: '—'
    });

    await consultar('0999-0000-99999');

    assert.match(el('form-error').textContent, /no encontramos citas/i);
    assert.equal(el('estado-resultado').innerHTML, '');
  });
});
