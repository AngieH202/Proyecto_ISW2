import { sbGet, sbPost, sbPatch } from './modules/api.js';
import { notif, showScreen, labelEstado, iniciales, fechaHoy, horaAhora } from './modules/utils.js';
import { estado as estadoCache, limpiar as limpiarCache } from './modules/cache.js';

// Importados por su efecto: cada módulo expone en window las funciones
// que el HTML necesita en sus atributos onclick.
import './modules/auth.js';
import './modules/patient.js';

// showScreen se usa en onclick del HTML y ningún módulo lo expone.
window.showScreen = showScreen;

// Para inspeccionar la caché desde la consola del navegador:
// cacheEstado() devuelve entradas, aciertos, fallos y tasa de aciertos.
window.cacheEstado = estadoCache;
window.cacheLimpiar = limpiarCache;

const DIAS_DOC = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES_DOC = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
let fechaDoc = new Date();
fechaDoc.setHours(0, 0, 0, 0);
while (fechaDoc.getDay() === 0 || fechaDoc.getDay() === 6) {
  fechaDoc.setDate(fechaDoc.getDate() + 1);
}

function formatoKeyDoc(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function actualizarNavDoc() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const esHoy = fechaDoc.getTime() === hoy.getTime();
  const texto = document.getElementById('cal-nav-texto');
  const sub = document.getElementById('cal-nav-sub');
  if (texto) texto.textContent = DIAS_DOC[fechaDoc.getDay()] + ', ' + fechaDoc.getDate() + ' de ' + MESES_DOC[fechaDoc.getMonth()] + ' ' + fechaDoc.getFullYear();
  if (sub) sub.textContent = esHoy ? '📅 Hoy' : '';
}

window.cambiarDiaDoc = function (dir) {
  fechaDoc.setDate(fechaDoc.getDate() + dir);
  while (fechaDoc.getDay() === 0 || fechaDoc.getDay() === 6) {
    fechaDoc.setDate(fechaDoc.getDate() + dir);
  }
  actualizarNavDoc();
  window.cargarCitas();
};

window.switchTab = function (t) {
  document.querySelectorAll('.tab-panel').forEach((el) => el.classList.remove('active'));
  const panel = document.getElementById('tab-' + t);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.nav-switch button').forEach((b, i) => b.classList.toggle('active', ['hoy', 'pendientes', 'expedientes'][i] === t));
  if (t === 'expedientes') window.cargarExpedientes();
};

window.cargarCitas = async function () {
  actualizarNavDoc();
  const lista = document.getElementById('citas-lista');
  if (lista) lista.innerHTML = '<div class="loading">Cargando citas...</div>';
  const key = formatoKeyDoc(fechaDoc);
  const citas = await sbGet('citas', 'fecha=eq.' + key + '&order=hora.asc');
  const conf = citas.filter((c) => c.estado === 'confirmada').length;
  const atend = citas.filter((c) => c.estado === 'atendida').length;
  const pend = citas.filter((c) => c.estado === 'pendiente').length;
  const stats = document.getElementById('stats-grid');
  if (stats) {
    stats.innerHTML = `
      <div class="stat"><div class="num">${citas.length}</div><div class="lbl">Citas hoy</div></div>
      <div class="stat"><div class="num" style="color:#0077B6">${conf}</div><div class="lbl">Confirmadas</div></div>
      <div class="stat"><div class="num" style="color:#065f46">${atend}</div><div class="lbl">Atendidas</div></div>
      <div class="stat"><div class="num" style="color:#856404">${pend}</div><div class="lbl">Pendientes</div></div>`;
  }
  if (!citas.length) {
    if (lista) lista.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>Sin citas para este día</p></div>';
    return;
  }
  if (lista) {
    lista.innerHTML = citas.map((c) => `
      <div class="card"><div class="cita-row">
        <div class="hora-badge">${c.hora}</div>
        <div class="cita-info">
          <div class="cita-nombre">${c.nombre_paciente}</div>
          <div class="cita-motivo">${c.fecha ? c.fecha + ' · ' : ''} ${c.motivo || ''}</div>
          ${(c.estado === 'confirmada' || c.estado === 'pendiente') ? `<div class="action-btns">
            <button class="btn-sm btn-atendida" onclick="marcarAtendida(${c.id},'${c.nombre_paciente.replace(/'/g, "\\'") }')">✓ Atendida</button>
            <button class="btn-sm btn-nopresento" onclick="cambiarEstado(${c.id},'nopresento')">No se presentó</button>
          </div>` : ''}
          ${c.estado === 'atendida' ? `<div class="action-btns"><button class="btn-sm btn-exp" onclick="verExpedienteDesde('${encodeURIComponent(c.nombre_paciente)}')">📋 Ver expediente</button></div>` : ''}
        </div>
        <span class="badge ${c.estado === 'nopresento' ? 'nopresento' : c.estado}">${labelEstado(c.estado)}</span>
      </div></div>`).join('');
  }
};

window.marcarAtendida = async function (citaId, nombrePaciente) {
  await sbPatch('citas', 'id=eq.' + citaId, { estado: 'atendida' });
  const exps = await sbGet('expedientes', `nombre=eq.${encodeURIComponent(nombrePaciente)}`);
  if (exps.length) {
    window.expedienteActual = exps[0];
    abrirModalDiagnostico();
  }
  notif('Cita marcada como atendida');
  window.cargarCitas();
};

window.cambiarEstado = async function (id, nuevo) {
  await sbPatch('citas', 'id=eq.' + id, { estado: nuevo });
  notif('Estado actualizado');
  window.cargarCitas();
};

window.verExpedienteDesde = async function (nombreEnc) {
  const nombre = decodeURIComponent(nombreEnc);
  const exps = await sbGet('expedientes', `nombre=eq.${encodeURIComponent(nombre)}`);
  if (exps.length) abrirExpediente(exps[0]);
  else notif('Expediente no encontrado');
};

window.cargarPendientes = async function () {
  const lista = document.getElementById('pendientes-lista');
  const pc = document.getElementById('pend-count');
  if (lista) lista.innerHTML = '<div class="loading">Cargando...</div>';
  const pendientes = await sbGet('citas', 'estado=eq.pendiente&order=hora.asc');
  if (pc) {
    pc.textContent = pendientes.length || '';
    pc.style.display = pendientes.length ? 'inline' : 'none';
  }
  if (!pendientes.length) {
    if (lista) lista.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div><p>Sin solicitudes pendientes</p></div>';
    return;
  }
  if (lista) {
    lista.innerHTML = pendientes.map((p) => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:15px;font-weight:700;color:#03045E">${p.nombre_paciente}</div>
            <div style="font-size:12px;color:#0096C7;margin-top:2px">${p.fecha ? p.fecha + ' · ' : ''} ${p.hora} · Tel: ${p.telefono_paciente || '—'}</div>
            <div style="font-size:12px;color:#0077B6;margin-top:4px;font-style:italic">"${p.motivo || ''}"</div>
          </div>
          <span class="badge pendiente">Pendiente</span>
        </div>
        <div class="action-btns" style="margin-top:12px">
          <button class="btn-sm btn-confirmar" onclick="accionPendiente(${p.id},'confirmada')">✓ Confirmar</button>
          <button class="btn-sm btn-rechazar" onclick="accionPendiente(${p.id},'cancelada')">✗ Rechazar</button>
        </div>
      </div>`).join('');
  }
};

window.accionPendiente = async function (id, estado) {
  await sbPatch('citas', 'id=eq.' + id, { estado });
  notif(estado === 'confirmada' ? '✓ Cita confirmada' : 'Solicitud rechazada');
  window.cargarPendientes();
  window.cargarCitas();
};

let allExpedientes = [];
window.cargarExpedientes = async function () {
  const data = await sbGet('expedientes', 'order=nombre.asc');
  allExpedientes = data || [];
  renderExpedientes(allExpedientes);
};

function renderExpedientes(lista) {
  const el = document.getElementById('expedientes-lista');
  if (!el) return;
  if (!lista.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>No se encontraron pacientes</p></div>';
    return;
  }
  el.innerHTML = lista.map((e) => `
    <div class="card" style="cursor:pointer" onclick="abrirExpediente(${JSON.stringify(e).replace(/"/g, '&quot;')})">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="avatar">${iniciales(e.nombre)}</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:700;color:#03045E">${e.nombre}</div>
          <div style="font-size:12px;color:#0096C7">${e.edad} años · ${e.telefono || '—'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;font-weight:700;color:#0077B6">${e.visitas || 0} visitas</div>
          <div style="font-size:11px;color:#adb5bd;margin-top:2px">Ver →</div>
        </div>
      </div>
    </div>`).join('');
}

window.filtrarExpedientes = function (v) {
  const value = (v || '').trim();
  const filtro = value ? allExpedientes.filter((e) => e.nombre.toLowerCase().includes(value.toLowerCase()) || (e.identidad || '').includes(value)) : allExpedientes;
  renderExpedientes(filtro);
};

window.abrirExpediente = async function (exp) {
  window.expedienteActual = exp;
  // Sin cache: el sentido de esta lectura es traer el expediente al dia,
  // no repetir lo que ya se mostro en el listado.
  const fresco = await sbGet('expedientes', 'id=eq.' + exp.id, { cache: false });
  if (fresco.length) window.expedienteActual = fresco[0];
  renderPacHeader(window.expedienteActual);
  showScreen('expediente');
  cargarHistorial(window.expedienteActual.id);
};

function renderPacHeader(exp) {
  const target = document.getElementById('pac-header');
  if (!target) return;
  target.innerHTML = `
    <div class="pac-header-row">
      <div class="pac-avatar-lg">${iniciales(exp.nombre)}</div>
      <div>
        <div class="pac-nombre">${exp.nombre}</div>
        <div class="pac-sub">${exp.edad} años · ${exp.identidad || '—'} · 📞 ${exp.telefono || '—'}</div>
      </div>
    </div>
    <div class="pac-stats">
      <div class="pac-stat"><div class="num">${exp.visitas || 0}</div><div class="lbl">Visitas</div></div>
      <div class="pac-stat"><div class="num" style="font-size:14px">${exp.ultima_visita || '—'}</div><div class="lbl">Última visita</div></div>
    </div>`;
}

async function cargarHistorial(expId) {
  const lista = document.getElementById('historial-lista');
  if (lista) lista.innerHTML = '<div class="loading">Cargando historial...</div>';
  const visitas = await sbGet('visitas_clinicas', `expediente_id=eq.${expId}&order=created_at.desc`);
  if (!visitas || !visitas.length) {
    if (lista) lista.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Sin visitas registradas aún</p></div>';
    return;
  }
  if (lista) lista.innerHTML = visitas.map((v, i) => renderVisita(v, i === 0)).join('');
}

function renderVisita(v, abierta) {
  const tratamientos = v.tratamientos ? v.tratamientos.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const medicamentos = v.medicamentos ? v.medicamentos.split(',').map((m) => m.trim()).filter(Boolean) : [];
  return `<div class="visita-card">
    <div class="visita-header" onclick="toggleVisita(this)">
      <div>
        <div class="visita-fecha">${v.fecha || 'Sin fecha'}</div>
        <div class="visita-hora">${v.hora || ''} · ${tratamientos[0] || 'Consulta'}</div>
      </div>
      <span style="font-size:18px;color:#adb5bd">${abierta ? '▲' : '▼'}</span>
    </div>
    <div class="visita-body${abierta ? ' open' : ''}">
      ${v.diagnostico ? `<div class="visita-section"><div class="visita-section-title">Diagnóstico</div><div class="visita-text">${v.diagnostico}</div></div>` : ''}
      ${tratamientos.length ? `<div class="visita-section"><div class="visita-section-title">Tratamientos</div><div>${tratamientos.map((t) => `<span class="visita-chip chip-trat">${t}</span>`).join('')}</div></div>` : ''}
      ${medicamentos.length ? `<div class="visita-section"><div class="visita-section-title">Medicamentos</div><div>${medicamentos.map((m) => `<span class="visita-chip chip-med">${m}</span>`).join('')}</div></div>` : ''}
      ${v.plan ? `<div class="visita-section"><div class="visita-section-title">Plan / próxima cita</div><div class="visita-text">${v.plan}</div></div>` : ''}
      ${v.notas ? `<div class="visita-section"><div class="visita-section-title">Notas</div><div class="exp-nota">${v.notas}</div></div>` : ''}
    </div>
  </div>`;
}

window.toggleVisita = function (header) {
  const body = header.nextElementSibling;
  if (!body) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  header.querySelector('span:last-child').textContent = isOpen ? '▼' : '▲';
};

window.volverExpedientes = function () {
  showScreen('doctora');
  window.switchTab('expedientes');
  window.cargarExpedientes();
};

window.abrirModalNuevaVisita = function () { abrirModalDiagnostico(); };

function abrirModalDiagnostico() {
  if (!window.expedienteActual) return;
  const nombre = document.getElementById('modal-pac-nombre');
  const sub = document.getElementById('modal-pac-sub');
  if (nombre) nombre.textContent = 'Registrar visita — ' + window.expedienteActual.nombre;
  if (sub) sub.textContent = fechaHoy() + ' · ' + horaAhora();
  ['m-diagnostico', 'm-medicamentos', 'm-plan', 'm-notas', 'm-trat-otro'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('.trat-tag').forEach((t) => t.classList.remove('sel'));
  const modal = document.getElementById('modal-diag');
  if (modal) modal.classList.add('open');
}

window.cerrarModal = function (e) {
  const modal = document.getElementById('modal-diag');
  if (modal && e.target === modal) modal.classList.remove('open');
};

window.toggleTrat = function (btn) {
  btn.classList.toggle('sel');
};

// Bandera de en-vuelo: el boton se deshabilita solo, pero esto tambien
// corta una segunda llamada que no venga del boton.
let guardandoDiagnostico = false;

window.guardarDiagnostico = async function () {
  if (guardandoDiagnostico) return;

  const diagnostico = document.getElementById('m-diagnostico').value.trim();
  if (!diagnostico) {
    notif('Por favor ingresá un diagnóstico.');
    return;
  }
  const tratSel = [...document.querySelectorAll('.trat-tag.sel')].map((t) => t.textContent);
  const tratOtro = document.getElementById('m-trat-otro').value.trim();
  if (tratOtro) tratSel.push(tratOtro);
  const medicamentos = document.getElementById('m-medicamentos').value.trim();
  const plan = document.getElementById('m-plan').value.trim();
  const notas = document.getElementById('m-notas').value.trim();
  const btn = document.getElementById('btn-guardar-diag');
  guardandoDiagnostico = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Guardando...';
  }

  const expId = window.expedienteActual.id;
  const hoy = fechaHoy();

  try {
    // Clave natural de una visita: expediente, dia y diagnostico. No
    // entra hora porque horaAhora() cambia a cada minuto y volveria el
    // chequeo inutil justo frente a un reintento.
    // Sin cache: de esta lectura depende si se inserta o no.
    const duplicada = await sbGet(
      'visitas_clinicas',
      `expediente_id=eq.${expId}` +
      `&fecha=eq.${encodeURIComponent(hoy)}` +
      `&diagnostico=eq.${encodeURIComponent(diagnostico)}` +
      '&select=id',
      { cache: false }
    );

    let ok = Array.isArray(duplicada) && duplicada.length > 0;

    if (!ok) {
      ({ ok } = await sbPost('visitas_clinicas', {
        expediente_id: expId,
        fecha: hoy,
        hora: horaAhora(),
        diagnostico,
        tratamientos: tratSel.join(', '),
        medicamentos,
        plan,
        notas
      }));
    }

    if (ok) {
      // Recuento absoluto contra la tabla, no un incremento sobre la
      // copia local: repetirlo da siempre el mismo numero y no puede
      // pisar el valor bueno con uno viejo. Coincide con el trigger de
      // 007 cuando este aplicado, porque los dos cuentan filas.
      // Sin cache: este numero se escribe. Contarlo sobre una respuesta
      // vieja dejaria el contador mal, que es justo lo que se arreglo.
      const visitas = await sbGet(
        'visitas_clinicas',
        `expediente_id=eq.${expId}&select=id`,
        { cache: false }
      );
      const total = Array.isArray(visitas) ? visitas.length : 0;

      await sbPatch('expedientes', 'id=eq.' + expId, { visitas: total, ultima_visita: hoy });
      window.expedienteActual.visitas = total;
      window.expedienteActual.ultima_visita = hoy;

      const modal = document.getElementById('modal-diag');
      if (modal) modal.classList.remove('open');
      notif('✓ Visita registrada correctamente');
      if (document.getElementById('screen-expediente').classList.contains('active')) {
        renderPacHeader(window.expedienteActual);
        cargarHistorial(expId);
      }
    } else {
      notif('Error al guardar. Verificá tu conexión.');
    }
  } finally {
    guardandoDiagnostico = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Guardar registro de visita';
    }
  }
};

