// El panel de la doctora (assets/js/admin.js): confirmar o rechazar
// solicitudes, marcar una cita como atendida y registrar la visita en el
// expediente.
//
// Corre con sesión abierta, que es la única forma en que se carga: por
// eso las tablas se piden a /api/db y no a Supabase directo.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, instalarBaseFalsa, MODULOS } from '../entorno.mjs';

const { el, escribir, leerNotif, limpiarNotif } = instalarDom({ pathname: '/admin', search: '' });

// El proxy tiene el token; el navegador sólo tiene la cookie.
globalThis.__sesion = { email: 'belki.den@dentaagenda.com' };

// Con tablas: es lo único que ve el portal, y las pide por /api/db.
const { db, peticiones } = instalarBaseFalsa({ tablas: true });

// El día que abre la agenda: hoy, o el próximo hábil si cae fin de semana.
const diaDeAgenda = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const HOY = diaDeAgenda();

db.expedientes.push(
  { id: 'exp-1', nombre: 'María López', identidad: '0801-1990-12345', edad: 34, telefono: '9876-5432', visitas: 0, ultima_visita: '—' },
  { id: 'exp-2', nombre: 'Carlos Núñez', identidad: '0501-1985-54321', edad: 39, telefono: '3333-2222', visitas: 2, ultima_visita: '1 de mayo de 2030' }
);
db.citas.push(
  { id: 10, fecha: HOY, hora: '10:00 AM', estado: 'pendiente', nombre_paciente: 'María López', identidad: '0801-1990-12345', telefono_paciente: '9876-5432', motivo: 'Control de ortodoncia' },
  { id: 11, fecha: HOY, hora: '11:30 AM', estado: 'confirmada', nombre_paciente: 'Carlos Núñez', identidad: '0501-1985-54321', telefono_paciente: '3333-2222', motivo: 'Dolor de muela' },
  { id: 12, fecha: HOY, hora: '2:00 PM', estado: 'pendiente', nombre_paciente: 'Ana Reyes', identidad: '0102-2000-11111', telefono_paciente: '5555-4444', motivo: 'Limpieza' }
);

// admin.js carga la agenda al importarse: quien llega ahí ya tiene sesión.
await import(MODULOS + 'admin.js');
const { sbRpc } = await import(MODULOS + 'modules/api.js');

const cita = (id) => db.citas.find((c) => c.id === id);

describe('la agenda del día', () => {
  test('abre en un día hábil, nunca en sábado o domingo', () => {
    const d = new Date(HOY + 'T00:00:00');
    assert.ok(d.getDay() >= 1 && d.getDay() <= 5);
  });

  test('lista las citas de ese día con su estado', async () => {
    await globalThis.cargarCitas();
    const html = el('citas-lista').innerHTML;

    assert.match(html, /María López/);
    assert.match(html, /Carlos Núñez/);
    assert.match(html, /Pendiente/);
    assert.match(html, /Confirmada/);
  });

  test('cuenta bien el resumen del día', () => {
    const stats = el('stats-grid').innerHTML;
    assert.match(stats, /<div class="num">3<\/div>/, '3 citas en total');
    assert.match(stats, /">1<\/div><div class="lbl">Confirmadas/);
    assert.match(stats, /">2<\/div><div class="lbl">Pendientes/);
  });

  test('las pendientes se piden aparte, filtradas por estado', async () => {
    await globalThis.cargarPendientes();

    assert.equal(el('pend-count').textContent, 2);
    assert.match(el('pendientes-lista').innerHTML, /Control de ortodoncia/);
    assert.ok(
      peticiones.some((p) => p.busqueda.includes('estado=eq.pendiente')),
      'no se traen todas las citas para filtrarlas en el navegador'
    );
  });
});

describe('confirmar y rechazar solicitudes', () => {
  test('confirmar deja la cita confirmada', async () => {
    limpiarNotif();
    await globalThis.accionPendiente(10, 'confirmada');

    assert.equal(cita(10).estado, 'confirmada');
    assert.match(leerNotif(), /confirmada/i);
  });

  test('rechazar la cancela', async () => {
    limpiarNotif();
    await globalThis.accionPendiente(12, 'cancelada');

    assert.equal(cita(12).estado, 'cancelada');
    assert.match(leerNotif(), /rechazada/i);
  });

  test('y el horario rechazado vuelve a estar libre para los pacientes', async () => {
    // Es el otro lado de 006: el índice único deja fuera las canceladas.
    const ocupadas = await sbRpc('slots_ocupados', { p_fecha: HOY });
    const horas = ocupadas.data.map((c) => c.hora);

    assert.ok(!horas.includes('2:00 PM'), 'la cancelada libera su horario');
    assert.ok(horas.includes('10:00 AM'), 'la confirmada lo sigue ocupando');
  });

  test('la lista de pendientes queda vacía después de resolverlas', async () => {
    await globalThis.cargarPendientes();

    assert.equal(el('pend-count').textContent, '');
    assert.match(el('pendientes-lista').innerHTML, /Sin solicitudes pendientes/);
  });
});

describe('atender una cita', () => {
  test('marcarla atendida cambia el estado y abre el expediente del paciente', async () => {
    limpiarNotif();
    await globalThis.marcarAtendida(10, 'María López');

    assert.equal(cita(10).estado, 'atendida');
    assert.equal(globalThis.expedienteActual.identidad, '0801-1990-12345');
    assert.equal(el('modal-diag').classList.contains('open'), true, 'abre el registro de visita');
    assert.match(leerNotif(), /atendida/i);
  });

  test('marcar que no se presentó no toca el expediente', async () => {
    await globalThis.cambiarEstado(11, 'nopresento');

    assert.equal(cita(11).estado, 'nopresento');
    assert.equal(db.visitas_clinicas.length, 0);
  });
});

describe('registrar la visita en el expediente', () => {
  const DIAGNOSTICO = 'Gingivitis leve por acumulación de placa';

  test('sin diagnóstico no guarda nada', async () => {
    limpiarNotif();
    escribir('m-diagnostico', '');
    await globalThis.guardarDiagnostico();

    assert.equal(db.visitas_clinicas.length, 0);
    assert.match(leerNotif(), /ingresá un diagnóstico/i);
  });

  test('guarda la visita con su diagnóstico', async () => {
    escribir('m-diagnostico', DIAGNOSTICO);
    escribir('m-medicamentos', 'Clorhexidina 0.12%');
    escribir('m-plan', 'Control en 3 meses');
    await globalThis.guardarDiagnostico();

    assert.equal(db.visitas_clinicas.length, 1);
    assert.equal(db.visitas_clinicas[0].expediente_id, 'exp-1');
    assert.equal(db.visitas_clinicas[0].diagnostico, DIAGNOSTICO);
    assert.equal(db.visitas_clinicas[0].medicamentos, 'Clorhexidina 0.12%');
  });

  test('guardarla dos veces no la duplica', async () => {
    // Un doble clic o un reintento tras un timeout dejaría dos visitas
    // idénticas en el historial clínico.
    escribir('m-diagnostico', DIAGNOSTICO);
    await globalThis.guardarDiagnostico();

    assert.equal(db.visitas_clinicas.length, 1);
  });

  test('el contador del expediente queda en el conteo real, no en un incremento', async () => {
    assert.equal(db.expedientes[0].visitas, 1);

    escribir('m-diagnostico', 'Segunda consulta: revisión de encías');
    await globalThis.guardarDiagnostico();

    assert.equal(db.visitas_clinicas.length, 2);
    assert.equal(db.expedientes[0].visitas, 2);
    assert.notEqual(db.expedientes[0].ultima_visita, '—');
  });

  test('la visita queda en el historial del paciente y cierra el modal', async () => {
    await globalThis.abrirExpediente(db.expedientes[0]);
    // abrirExpediente no espera al historial: lo pide y sigue.
    await new Promise((listo) => setImmediate(listo));

    assert.equal(el('modal-diag').classList.contains('open'), false);
    assert.match(el('pac-header').innerHTML, /María López/);
    assert.match(el('pac-header').innerHTML, /2<\/div><div class="lbl">Visitas/);
    assert.match(el('historial-lista').innerHTML, new RegExp(DIAGNOSTICO));
  });
});

describe('buscar expedientes', () => {
  test('filtra por nombre', async () => {
    await globalThis.cargarExpedientes();
    globalThis.filtrarExpedientes('carlos');

    const html = el('expedientes-lista').innerHTML;
    assert.match(html, /Carlos Núñez/);
    assert.doesNotMatch(html, /María López/);
  });

  test('filtra por número de identidad', () => {
    globalThis.filtrarExpedientes('0801-1990');

    const html = el('expedientes-lista').innerHTML;
    assert.match(html, /María López/);
    assert.doesNotMatch(html, /Carlos Núñez/);
  });

  test('sin coincidencias avisa en vez de mostrar la lista entera', () => {
    globalThis.filtrarExpedientes('zzz');
    assert.match(el('expedientes-lista').innerHTML, /No se encontraron pacientes/);
  });

  test('el buscador vacío devuelve todos', () => {
    globalThis.filtrarExpedientes('');
    const html = el('expedientes-lista').innerHTML;
    assert.match(html, /María López/);
    assert.match(html, /Carlos Núñez/);
  });
});

describe('cuando el paciente cancela', () => {
  // La doctora tiene que poder distinguir una solicitud que ella rechazó
  // de un paciente que se dio de baja: lo segundo le deja un hueco en
  // una agenda que ya daba por llena.
  test('la cancelación le aparece diciendo que fue el paciente', async () => {
    db.citas.push({
      id: 80, fecha: HOY, hora: '7:45 AM', estado: 'cancelada_paciente',
      nombre_paciente: 'Rosa Medina', identidad: '0703-1995-22222',
      telefono_paciente: '7777-8888', motivo: 'Limpieza'
    });
    globalThis.cacheLimpiar();
    await globalThis.cargarCitas();
    const html = el('citas-lista').innerHTML;

    assert.match(html, /Cancelada por el paciente/);
    assert.match(html, /El paciente canceló esta cita/);
  });

  test('con el botón para habilitar ese horario', () => {
    assert.match(el('citas-lista').innerHTML, /onclick="liberarHorario\(80\)"/);
    assert.match(el('citas-lista').innerHTML, /Habilitar este horario/);
  });

  test('y contadas aparte en el resumen del día', () => {
    assert.match(el('stats-grid').innerHTML, /">1<\/div><div class="lbl">Canceladas por el paciente/);
  });

  test('al habilitarlo, el aviso desaparece de la agenda', async () => {
    limpiarNotif();
    await globalThis.liberarHorario(80);

    assert.equal(cita(80).estado, 'cancelada');
    assert.match(leerNotif(), /habilitado/i);
    assert.ok(!el('citas-lista').innerHTML.includes('Habilitar este horario'));
  });

  test('el horario estaba libre desde la cancelación, no desde el botón', async () => {
    // El botón es el acuse de la doctora; el slot se libera solo, porque
    // los dos estados cancelados salen del índice único de 006.
    const ocupadas = await sbRpc('slots_ocupados', { p_fecha: HOY });
    assert.ok(!ocupadas.data.map((c) => c.hora).includes('7:45 AM'));
  });
});

describe('los datos de la base no se ejecutan como código', () => {
  // El panel arma su HTML con innerHTML. Quien escribe un nombre o un
  // motivo elige texto, no marcado: si no se escapa, elige qué corre en
  // la pantalla de la doctora, que es la sesión con más permisos.
  const ATAQUE = '<img src=x onerror="alert(1)">';

  // Las citas se meten directo en la base falsa, sin pasar por una
  // escritura: hay que tirar la caché a mano para que se relean.
  const recargarCitas = async () => {
    globalThis.cacheLimpiar();
    await globalThis.cargarCitas();
  };

  test('un nombre con etiquetas dentro sale escapado, no como HTML', async () => {
    db.citas.push({
      id: 90, fecha: HOY, hora: '9:15 AM', estado: 'pendiente',
      nombre_paciente: ATAQUE, identidad: '0000-0000-00000',
      telefono_paciente: '0000-0000', motivo: 'Consulta'
    });
    await recargarCitas();
    const html = el('citas-lista').innerHTML;

    // El nombre entero aparece, pero con los signos neutralizados: es
    // texto que se lee, no una etiqueta que el navegador ejecute.
    assert.ok(!html.includes('<img'), 'la etiqueta no puede quedar viva');
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'), 'tiene que verse como texto');
  });

  test('el motivo tampoco', async () => {
    db.citas.push({
      id: 91, fecha: HOY, hora: '8:30 AM', estado: 'pendiente',
      nombre_paciente: 'Ana Reyes', identidad: '0102-2000-11111',
      telefono_paciente: '5555-4444', motivo: '<script>robar()</script>'
    });
    globalThis.cacheLimpiar();
    await globalThis.cargarPendientes();

    assert.ok(!el('pendientes-lista').innerHTML.includes('<script>'));
  });

  test('los botones de cada fila mandan el id, no el nombre', async () => {
    // Interpolar el nombre dentro del onclick metía el texto de la base
    // en medio de código: unas comillas bien puestas y se ejecuta.
    await recargarCitas();
    const html = el('citas-lista').innerHTML;

    assert.match(html, /onclick="marcarAtendida\(\d+\)"/);
    assert.ok(!html.includes('marcarAtendida(90,'), 'no viaja ningún texto en el onclick');
  });

  test('y aun así la doctora puede atender esa cita', async () => {
    // El nombre se resuelve por id contra lo ya cargado.
    await globalThis.marcarAtendida(90);

    assert.equal(cita(90).estado, 'atendida');
  });
});

describe('cuando el proxy responde algo que no son datos', () => {
  // Pasó de verdad: /api/db/citas devolvía el 404 de la plataforma, en
  // HTML. r.json() lanzaba, la carga moría a mitad y la pantalla se
  // quedaba en "Cargando..." para siempre, sin decir nada.
  const fetchReal = globalThis.fetch;

  test('la pantalla no se queda colgada en Cargando', async () => {
    globalThis.fetch = async () => ({
      ok: false, status: 404,
      json: async () => { throw new SyntaxError('Unexpected token T in JSON'); }
    });
    globalThis.cacheLimpiar();

    await globalThis.cargarCitas();
    globalThis.fetch = fetchReal;

    assert.ok(!el('citas-lista').innerHTML.includes('Cargando'), 'tiene que terminar de cargar');
    assert.match(el('citas-lista').innerHTML, /Sin citas para este día/);
  });

  test('y con la sesión vencida vuelve al login', async () => {
    globalThis.fetch = async () => ({
      ok: false, status: 401,
      json: async () => ({ error: 'Sesión requerida' })
    });
    globalThis.cacheLimpiar();
    globalThis.location.href = '';

    await globalThis.cargarPendientes();
    globalThis.fetch = fetchReal;

    assert.equal(globalThis.location.href, '/login', 'no tiene sentido mostrar un panel vacío');
  });
});

describe('el portal no baja el token al navegador', () => {
  test('todas las tablas se piden al proxy /api/db', () => {
    const aSupabase = peticiones.filter((p) => p.ruta.startsWith('/rest/v1/') && !p.ruta.includes('/rpc/'));
    assert.deepEqual(aSupabase, [], 'la doctora habla con las tablas sólo a través de /api/db');
    assert.ok(peticiones.some((p) => p.ruta.startsWith('/api/db/')));
  });

  test('las lecturas de las que depende una escritura no se cachean', () => {
    // Si se sirve una respuesta vieja, se cuela una visita duplicada o el
    // contador queda mal.
    const criticas = peticiones.filter((p) =>
      p.metodo === 'GET' && (p.busqueda.includes('diagnostico=eq.') || p.busqueda.includes('select=id')));

    assert.ok(criticas.length > 0);
    assert.ok(criticas.every((p) => p.modoCache === 'no-store'));
  });
});
