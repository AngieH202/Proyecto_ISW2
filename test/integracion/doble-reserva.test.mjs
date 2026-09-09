// Dos pacientes, un solo horario.
//
// Es el caso que más importa del sistema: si dos personas agendan la
// misma fecha y hora, la doctora tiene dos pacientes en la puerta a las
// 10:00 y no hay forma de arreglarlo después.
//
// Se prueba el flujo completo del paciente -- loginPaciente() y
// enviarSolicitud() de assets/js -- contra una base falsa que aplica las
// mismas reglas que migracion/006 y 011: la decisión de si el horario
// está libre se toma dentro de crear_solicitud(), en una sola sentencia,
// no en el navegador.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, instalarBaseFalsa, MODULOS } from '../entorno.mjs';

const { el, escribir, leerNotif, limpiarNotif } = instalarDom();

// Sin tablas: el paciente no puede tocarlas, sólo llamar funciones.
const { db, peticiones } = instalarBaseFalsa();

await import(MODULOS + 'app.js');
const patient = await import(MODULOS + 'modules/patient.js');
const { SLOTS_BASE } = await import(MODULOS + 'modules/config.js');

const DIA = '2030-05-15';
const LABEL = '15 may 2030';
const SLOT = 4;                       // '10:00 AM'
const HORA = SLOTS_BASE[SLOT];

const MARIA = { nombre: 'María López', id: '0801-1990-12345', edad: '34', tel: '9876-5432' };
const CARLOS = { nombre: 'Carlos Núñez', id: '0501-1985-54321', edad: '39', tel: '3333-2222' };

// Entra al sistema como lo haría una persona: llena el formulario y pulsa.
async function entrarComo(p) {
  escribir('p-nombre', p.nombre);
  escribir('p-id', p.id);
  escribir('p-edad', p.edad);
  escribir('p-tel', p.tel);
  await globalThis.loginPaciente();
}

async function agendar({ dia = DIA, slot = SLOT, motivo = 'Control' } = {}) {
  patient.selDia(dia, LABEL, 'Mié');
  patient.selSlot(slot);
  escribir('cf-motivo', motivo);
  limpiarNotif();
  await globalThis.enviarSolicitud();
}

const citasDe = (identidad) => db.citas.filter((c) => c.identidad === identidad);
const enPaso = (n) => el('pstep-' + n).classList.contains('active');

describe('el primer paciente toma el horario', () => {
  test('la cita queda creada, pendiente y a su nombre', async () => {
    await entrarComo(MARIA);
    await agendar({ motivo: 'Control de ortodoncia' });

    assert.equal(db.citas.length, 1);
    assert.deepEqual(
      { ...db.citas[0], id: undefined, created_at: undefined },
      {
        id: undefined, created_at: undefined,
        nombre_paciente: MARIA.nombre, identidad: MARIA.id,
        telefono_paciente: MARIA.tel, fecha: DIA, hora: HORA,
        motivo: 'Control de ortodoncia', estado: 'pendiente'
      }
    );
  });

  test('la cita guarda la identidad, no sólo el nombre', () => {
    // Es la única clave fiable: dos pacientes pueden llamarse igual.
    assert.equal(db.citas[0].identidad, MARIA.id);
  });

  test('llega a la pantalla de confirmación', () => {
    assert.equal(enPaso(4), true);
    assert.match(el('confirm-detail').innerHTML, /Pendiente de confirmación/);
  });
});

describe('el segundo paciente NO puede tomar el mismo horario', () => {
  test('no se crea una segunda cita para esa fecha y hora', async () => {
    await entrarComo(CARLOS);
    await agendar({ motivo: 'Dolor de muela' });

    const enEseSlot = db.citas.filter((c) => c.fecha === DIA && c.hora === HORA && c.estado !== 'cancelada');
    assert.equal(enEseSlot.length, 1, 'sólo puede haber una cita por horario');
    assert.equal(enEseSlot[0].identidad, MARIA.id, 'el horario sigue siendo de quien llegó primero');
    assert.equal(citasDe(CARLOS.id).length, 0);
  });

  test('se le avisa que el horario acaba de ocuparse', () => {
    assert.match(leerNotif(), /acaba de ocuparse/);
  });

  test('lo devuelve al paso de horarios en vez de dejarlo en el aire', () => {
    assert.equal(enPaso(2), true);
    assert.equal(enPaso(4), false, 'no puede ver una confirmación de una cita que no existe');
  });

  test('al recargar, ese horario ya aparece ocupado y sin poder pulsarse', async () => {
    await patient.cargarSlotsDia();
    const html = el('horarios-grid').innerHTML;

    assert.match(html, new RegExp(`class="slot ocupado" disabled>${HORA}<`), 'el horario tomado debe estar deshabilitado');
    assert.match(html, new RegExp(`onclick="selSlot\\(5\\)">${SLOTS_BASE[5]}<`), 'los demás siguen libres');
  });

  test('sí puede tomar otro horario del mismo día', async () => {
    await agendar({ slot: 5, motivo: 'Dolor de muela' });

    assert.equal(citasDe(CARLOS.id).length, 1);
    assert.equal(citasDe(CARLOS.id)[0].hora, SLOTS_BASE[5]);
    assert.equal(enPaso(4), true);
  });
});

describe('un homónimo no se lleva la cita ajena', () => {
  test('mismo nombre y otra identidad recibe "ocupado", no la confirmación', async () => {
    // Comparar por nombre le mostraría a esta persona la confirmación de
    // una cita que no es suya.
    await entrarComo({ ...CARLOS, nombre: MARIA.nombre, id: '0999-0000-99999' });
    const antes = db.citas.length;
    await agendar({ motivo: 'Limpieza' });

    assert.equal(db.citas.length, antes, 'no debería crear nada');
    assert.match(leerNotif(), /acaba de ocuparse/);
  });
});

describe('reintentar la propia cita no la duplica', () => {
  test('mandar dos veces la misma solicitud deja una sola cita', async () => {
    await entrarComo(MARIA);
    const antes = db.citas.length;

    for (let i = 0; i < 2; i++) await agendar({ motivo: 'Control de ortodoncia' });

    assert.equal(db.citas.length, antes, 'un doble clic o un reintento no puede duplicar');
  });

  test('y aun así ve su confirmación, sin mensaje de error', () => {
    assert.equal(enPaso(4), true);
    assert.equal(leerNotif(), '', 'su cita está puesta: no hay nada que avisar');
  });
});

describe('una cita cancelada libera el horario', () => {
  test('otro paciente puede tomar el hueco que dejó una cancelación', async () => {
    db.citas.push({
      id: 900, fecha: '2030-05-16', hora: HORA, estado: 'cancelada',
      nombre_paciente: 'Paciente que canceló', identidad: '0777-0000-11111'
    });

    await entrarComo(CARLOS);
    await agendar({ dia: '2030-05-16', motivo: 'Limpieza' });

    const activas = db.citas.filter((c) => c.fecha === '2030-05-16' && c.hora === HORA && c.estado !== 'cancelada');
    assert.equal(activas.length, 1);
    assert.equal(activas[0].identidad, CARLOS.id);
  });

  test('el horario cancelado tampoco se pinta como ocupado', async () => {
    db.citas.push({
      id: 901, fecha: '2030-05-17', hora: HORA, estado: 'cancelada',
      nombre_paciente: 'Paciente que canceló', identidad: '0777-0000-11111'
    });
    patient.selDia('2030-05-17', '17 may 2030', 'Vie');
    await patient.cargarSlotsDia();

    assert.match(el('horarios-grid').innerHTML, new RegExp(`onclick="selSlot\\(${SLOT}\\)">${HORA}<`));
  });
});

describe('el paciente nunca toca las tablas', () => {
  test('todo su flujo pasa por funciones RPC', () => {
    // 011_rls_endurecido.sql le quita a anon el acceso directo: si alguna
    // pantalla del paciente leyera una tabla, en producción fallaría.
    const directas = peticiones.filter((p) => !p.ruta.includes('/rpc/'));
    assert.deepEqual(directas, [], 'el lado público sólo puede llamar RPC');
  });

  test('y son sólo las tres que necesita', () => {
    assert.deepEqual(
      [...new Set(peticiones.map((p) => p.funcion))].sort(),
      ['crear_solicitud', 'registrar_paciente', 'slots_ocupados']
    );
  });

  test('la lectura de horarios nunca sale de la caché', () => {
    // Mostrar como libre un horario que otro acaba de tomar es el peor
    // error posible en esta pantalla.
    const slots = peticiones.filter((p) => p.ruta.endsWith('/slots_ocupados'));
    assert.ok(slots.length > 0);
    assert.ok(slots.every((p) => p.modoCache === 'no-store'), 'slots_ocupados no se cachea');
  });
});
