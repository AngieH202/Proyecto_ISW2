// Llenar el formulario: qué pasa cuando falta un campo.
//
// Es la primera pantalla que toca cualquiera. Si deja pasar un registro
// a medias, queda un expediente sin teléfono al que la doctora no puede
// llamar, o sin identidad, que es la clave con la que después se cruzan
// las citas.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, instalarBaseFalsa, MODULOS } from '../entorno.mjs';

const { el, escribir } = instalarDom();
const { db, peticiones } = instalarBaseFalsa();

await import(MODULOS + 'app.js');

const COMPLETO = {
  'p-nombre': 'María López',
  'p-id': '0801-1990-12345',
  'p-edad': '34',
  'p-tel': '9876-5432'
};

const ETIQUETAS = {
  'p-nombre': 'el nombre',
  'p-id': 'el número de identidad',
  'p-edad': 'la edad',
  'p-tel': 'el teléfono'
};

// Llena el formulario entero y después pisa lo que se le indique.
async function registrar(cambios = {}) {
  for (const [campo, valor] of Object.entries({ ...COMPLETO, ...cambios })) escribir(campo, valor);
  el('form-error').textContent = '';
  el('form-error').style.display = 'none';
  await globalThis.loginPaciente();
}

describe('faltando un campo no se registra a nadie', () => {
  for (const [campo, etiqueta] of Object.entries(ETIQUETAS)) {
    test(`sin ${etiqueta} avisa y no guarda`, async () => {
      const antes = peticiones.length;
      await registrar({ [campo]: '' });

      assert.equal(db.expedientes.length, 0, 'no puede crear un expediente a medias');
      assert.equal(peticiones.length, antes, 'ni siquiera llama a la base');
      assert.equal(el('form-error').style.display, 'block');
      assert.match(el('form-error').textContent, /completá todos los campos/i);
    });
  }

  test('un campo con sólo espacios tampoco cuenta como lleno', async () => {
    await registrar({ 'p-nombre': '     ' });

    assert.equal(db.expedientes.length, 0);
    assert.match(el('form-error').textContent, /completá todos los campos/i);
  });

  test('el botón queda utilizable para volver a intentar', () => {
    assert.equal(el('btn-pac').disabled, false);
  });
});

describe('con los cuatro campos llenos', () => {
  test('crea el expediente y entra a agendar', async () => {
    await registrar();

    assert.equal(db.expedientes.length, 1);
    assert.equal(el('screen-paciente').classList.contains('active'), true);
  });

  test('guarda cada campo donde corresponde', () => {
    const exp = db.expedientes[0];
    assert.equal(exp.nombre, 'María López');
    assert.equal(exp.identidad, '0801-1990-12345');
    assert.equal(exp.edad, 34, 'la edad va como número, no como texto');
    assert.equal(exp.telefono, '9876-5432');
  });

  test('el aviso de error desaparece', () => {
    assert.equal(el('form-error').style.display, 'none');
  });

  test('recorta los espacios de más que se escapan al escribir', async () => {
    await registrar({ 'p-nombre': '  Ana Reyes  ', 'p-id': '  0102-2000-11111  ' });

    const exp = db.expedientes.find((e) => e.identidad === '0102-2000-11111');
    assert.ok(exp, 'la identidad se guarda sin espacios alrededor');
    assert.equal(exp.nombre, 'Ana Reyes');
  });

  test('copia los datos al formulario de la cita, para no reescribirlos', () => {
    assert.equal(el('cf-nombre').value, 'Ana Reyes');
    assert.equal(el('cf-id').value, '0102-2000-11111');
    assert.equal(el('cf-tel').value, '9876-5432');
  });
});

describe('el formulario de consultar el estado', () => {
  test('sin identidad avisa y no consulta nada', async () => {
    escribir('e-id', '');
    el('form-error').textContent = '';
    const antes = peticiones.length;

    await globalThis.consultarEstado();

    assert.equal(peticiones.length, antes);
    assert.match(el('form-error').textContent, /ingresá tu número de identidad/i);
  });

  test('con la identidad puesta sí consulta', async () => {
    escribir('e-id', '0102-2000-11111');
    const antes = peticiones.length;

    await globalThis.consultarEstado();

    assert.equal(peticiones.length, antes + 1);
    assert.equal(peticiones.at(-1).funcion, 'estado_de_mis_citas');
  });
});
