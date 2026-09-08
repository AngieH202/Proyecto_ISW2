import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, escribir, MODULOS } from '../ayudas/dom.mjs';
import { instalarPostgrest } from '../ayudas/postgrest.mjs';

// El flujo del paciente no debe tocar ninguna tabla: 011 le quita a anon
// el acceso directo, y todo pasa por las cuatro funciones RPC.

instalarDom();
const pg = instalarPostgrest();

await import(MODULOS + 'app.js');
const patient = await import(MODULOS + 'modules/patient.js');

const rutasDeTabla = () => pg.peticiones.filter(
  (p) => p.ruta.includes('/rest/v1/') && !p.ruta.includes('/rpc/')
);

describe('el paciente sólo habla por RPC', () => {
  test('registrarse llama a registrar_paciente', async () => {
    pg.reiniciarContador();
    escribir('p-nombre', 'Carlos Mendoza');
    escribir('p-id', '0501-1985-06789');
    escribir('p-edad', '39');
    escribir('p-tel', '9123-4567');
    await globalThis.loginPaciente();

    assert.deepEqual(pg.rpcLlamadas(), ['registrar_paciente']);
    assert.equal(rutasDeTabla().length, 0, 'no debería tocar tablas');
  });

  test('ver los horarios llama a slots_ocupados', async () => {
    pg.reiniciarContador();
    patient.selDia('2026-09-15', '15 sep 2026', 'Mar');
    await patient.cargarSlotsDia();

    assert.ok(pg.rpcLlamadas().includes('slots_ocupados'));
    assert.equal(rutasDeTabla().length, 0);
  });

  test('enviar la solicitud llama a crear_solicitud', async () => {
    pg.reiniciarContador();
    patient.selSlot(2);
    escribir('cf-motivo', 'Dolor en molar');
    await globalThis.enviarSolicitud();

    assert.ok(pg.rpcLlamadas().includes('crear_solicitud'));
    assert.equal(rutasDeTabla().length, 0);
  });

  test('consultar el estado llama a estado_de_mis_citas', async () => {
    pg.reiniciarContador();
    escribir('e-id', '0501-1985-06789');
    await globalThis.consultarEstado();

    assert.deepEqual(pg.rpcLlamadas(), ['estado_de_mis_citas']);
    assert.equal(rutasDeTabla().length, 0);
  });
});

describe('los argumentos van con el prefijo p_ que espera Postgres', () => {
  test('registrar_paciente recibe los cuatro campos', async () => {
    pg.reiniciarContador();
    escribir('p-nombre', 'Ana Gutiérrez');
    escribir('p-id', '0801-2001-55555');
    escribir('p-edad', '23');
    escribir('p-tel', '8899-1122');
    await globalThis.loginPaciente();

    const llamada = pg.peticiones.find((p) => p.ruta.includes('registrar_paciente'));
    assert.deepEqual(Object.keys(llamada.cuerpo).sort(),
      ['p_edad', 'p_identidad', 'p_nombre', 'p_telefono']);
    assert.equal(llamada.cuerpo.p_edad, 23, 'la edad debe ir como número');
  });

  test('crear_solicitud recibe los seis campos', async () => {
    pg.reiniciarContador();
    patient.selDia('2026-09-16', '16 sep 2026', 'Mié');
    patient.selSlot(1);
    escribir('cf-motivo', 'Limpieza');
    await globalThis.enviarSolicitud();

    const llamada = pg.peticiones.find((p) => p.ruta.includes('crear_solicitud'));
    assert.deepEqual(Object.keys(llamada.cuerpo).sort(),
      ['p_fecha', 'p_hora', 'p_identidad', 'p_motivo', 'p_nombre', 'p_telefono']);
    assert.match(llamada.cuerpo.p_fecha, /^\d{4}-\d{2}-\d{2}$/, 'la fecha debe ir en ISO');
  });
});

describe('respuestas de crear_solicitud', () => {
  test('«creada» y «ya_existia» terminan igual para el paciente', async () => {
    // Esa equivalencia es justo lo que vuelve seguro el reintento.
    patient.selDia('2026-09-17', '17 sep 2026', 'Jue');
    patient.selSlot(4);
    escribir('cf-motivo', 'Control');

    await globalThis.enviarSolicitud();
    const despuesDeCrear = pg.db.citas.length;

    await globalThis.enviarSolicitud();
    assert.equal(pg.db.citas.length, despuesDeCrear);
  });
});
