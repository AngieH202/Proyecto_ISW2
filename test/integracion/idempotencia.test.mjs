import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, escribir, leerNotif, limpiarNotif, MODULOS } from '../ayudas/dom.mjs';
import { instalarPostgrest } from '../ayudas/postgrest.mjs';

// Idempotencia: repetir una operación deja el mismo estado que hacerla
// una vez. Es lo que vuelve seguro un reintento tras un timeout, un
// doble clic o una segunda pestaña.

instalarDom();
const pg = instalarPostgrest();

await import(MODULOS + 'app.js');
const patient = await import(MODULOS + 'modules/patient.js');

describe('alta del paciente', () => {
  test('registrarse dos veces deja un solo expediente', async () => {
    for (const tel of ['9876-5432', '8888-1111']) {
      escribir('p-nombre', 'María López');
      escribir('p-id', '0801-1990-12345');
      escribir('p-edad', '34');
      escribir('p-tel', tel);
      await globalThis.loginPaciente();
    }
    assert.equal(pg.db.expedientes.length, 1);
  });

  test('el segundo registro actualiza los datos', () => {
    assert.equal(pg.db.expedientes[0].telefono, '8888-1111');
  });

  test('no pisa el contador de visitas ni la última visita', () => {
    // registrar_paciente manda sólo lo que el paciente escribe: incluir
    // estas columnas le borraría el historial a quien vuelve.
    assert.equal(pg.db.expedientes[0].visitas, 0);
    assert.equal(pg.db.expedientes[0].ultima_visita, '—');
  });
});

describe('solicitud de cita', () => {
  test('enviar dos veces la misma crea una sola', async () => {
    patient.selDia('2026-09-10', '10 sep 2026', 'Jue');
    patient.selSlot(3);
    for (let i = 0; i < 2; i++) {
      escribir('cf-motivo', 'Control de ortodoncia');
      await globalThis.enviarSolicitud();
    }
    assert.equal(pg.db.citas.length, 1);
  });

  test('la cita guarda la identidad, no sólo el nombre', () => {
    // Es la clave de cruce fiable contra expedientes.
    assert.equal(pg.db.citas[0].identidad, '0801-1990-12345');
  });

  test('un homónimo no recibe la confirmación de una cita ajena', async () => {
    pg.db.citas.push({
      id: 999, fecha: '2026-09-12', hora: '9:15 AM', estado: 'pendiente',
      nombre_paciente: 'María López', identidad: '0999-0000-99999'
    });
    patient.selDia('2026-09-12', '12 sep 2026', 'Sáb');
    patient.selSlot(3);
    escribir('cf-motivo', 'Consulta');
    limpiarNotif();

    const antes = pg.db.citas.length;
    await globalThis.enviarSolicitud();

    assert.equal(pg.db.citas.length, antes, 'no debería crear nada');
    assert.match(leerNotif(), /acaba de ocuparse/);
  });

  test('reintentar la propia cita muestra la confirmación sin duplicar', async () => {
    pg.db.citas.push({
      id: 1000, fecha: '2026-09-13', hora: '9:15 AM', estado: 'pendiente',
      nombre_paciente: 'María López', identidad: '0801-1990-12345'
    });
    patient.selDia('2026-09-13', '13 sep 2026', 'Dom');
    patient.selSlot(3);
    escribir('cf-motivo', 'Control');
    limpiarNotif();

    const antes = pg.db.citas.length;
    await globalThis.enviarSolicitud();

    assert.equal(pg.db.citas.length, antes);
    assert.equal(leerNotif(), '', 'no debería avisar de un error');
  });

  test('una cita cancelada libera su horario', async () => {
    pg.db.citas.push({
      id: 1001, fecha: '2026-09-14', hora: '9:15 AM', estado: 'cancelada',
      nombre_paciente: 'Otro Paciente', identidad: '0777-0000-11111'
    });
    patient.selDia('2026-09-14', '14 sep 2026', 'Lun');
    patient.selSlot(3);
    escribir('cf-motivo', 'Limpieza');

    const antes = pg.db.citas.length;
    await globalThis.enviarSolicitud();

    assert.equal(pg.db.citas.length, antes + 1, 'debería poder reservarlo');
  });
});

describe('registro de diagnóstico', () => {
  test('guardar dos veces el mismo deja una sola visita', async () => {
    await import(MODULOS + 'admin.js');
    globalThis.expedienteActual = pg.db.expedientes[0];

    for (let i = 0; i < 2; i++) {
      escribir('m-diagnostico', 'Gingivitis leve por acumulación de placa');
      await globalThis.guardarDiagnostico();
    }
    assert.equal(pg.db.visitas_clinicas.length, 1);
  });

  test('el contador queda en el recuento real, no en un incremento', () => {
    // Escribe un conteo absoluto: repetirlo da siempre el mismo número
    // y no puede pisar el valor bueno con uno calculado sobre una copia
    // vieja.
    assert.equal(pg.db.expedientes[0].visitas, 1);
  });
});
