// Llenar el formulario: qué pasa cuando falta un campo.
//
// Es la primera pantalla que toca cualquiera. Si deja pasar un registro
// a medias, queda un expediente sin teléfono al que la doctora no puede
// llamar, o sin identidad, que es la clave con la que después se cruzan
// las citas.

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
const escribir = (id, valor) => { el(id).value = valor; };

// ── Las RPC que puede llamar esta pantalla ────────────────────────────
const db = { expedientes: [], citas: [] };
const peticiones = [];
let seq = 1;

const RPC = {
  registrar_paciente({ p_nombre, p_identidad, p_edad, p_telefono }) {
    if (!p_nombre?.trim() || !p_identidad?.trim()) throw new Error('nombre e identidad son obligatorios');
    let e = db.expedientes.find((x) => x.identidad === p_identidad);
    if (e) Object.assign(e, { nombre: p_nombre, edad: p_edad, telefono: p_telefono });
    else {
      e = { id: 'exp-' + seq++, nombre: p_nombre, identidad: p_identidad, edad: p_edad, telefono: p_telefono, visitas: 0, ultima_visita: '—' };
      db.expedientes.push(e);
    }
    return e.id;
  },

  estado_de_mis_citas({ p_identidad }) {
    const e = db.expedientes.find((x) => x.identidad === p_identidad);
    if (!e) return [];
    return db.citas.filter((c) => c.identidad === p_identidad);
  }
};

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url), 'https://falso.local');
  const cuerpo = opts.body ? JSON.parse(opts.body) : {};
  const funcion = u.pathname.split('/rpc/')[1];
  peticiones.push({ funcion, cuerpo });

  const responder = (status, data) => ({ ok: status < 300, status, json: async () => data });
  const fn = RPC[funcion];
  if (!fn) return responder(404, { message: 'función inexistente' });
  try {
    return responder(200, fn(cuerpo));
  } catch (e) {
    return responder(400, { message: String(e.message) });
  }
};

const MODULOS = new URL('../../assets/js/', import.meta.url).href;

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
