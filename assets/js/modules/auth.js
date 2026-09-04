import { sbGet, sbUpsert, authLogin } from './api.js';
import { hideError, showError, showScreen, labelEstado } from './utils.js';
import { renderDias, setPaso, setPacienteData, resetSeleccion } from './patient.js';
import { DOCTORA_USUARIO, DOCTORA_EMAIL } from './config.js';

export function setRole(r) {
  document.querySelectorAll('.role-tab').forEach((b, i) => b.classList.toggle('active', (i === 0 && r === 'doctora') || (i === 1 && r === 'paciente')));
  document.getElementById('login-doctora').classList.toggle('active', r === 'doctora');
  document.getElementById('login-paciente').classList.toggle('active', r === 'paciente');
  document.getElementById('login-estado').classList.toggle('active', r === 'estado');
  hideError();
}

export async function loginDoctora() {
  const usuario = document.getElementById('d-usuario').value.trim();
  const pass = document.getElementById('d-pass').value.trim();
  if (!usuario || !pass) {
    showError('Completá todos los campos.');
    return;
  }
  if (usuario !== DOCTORA_USUARIO) {
    showError('Usuario o contraseña incorrectos.');
    return;
  }
  const btn = document.getElementById('btn-doc');
  btn.disabled = true;
  btn.textContent = 'Ingresando...';
  hideError();
  const res = await authLogin(DOCTORA_EMAIL, pass);
  if (res.access_token) {
    showScreen('doctora');
    if (typeof window.cargarCitas === 'function') window.cargarCitas();
    if (typeof window.cargarPendientes === 'function') window.cargarPendientes();
    if (typeof window.cargarExpedientes === 'function') window.cargarExpedientes();
  } else {
    showError('Usuario o contraseña incorrectos.');
  }
  btn.disabled = false;
  btn.textContent = 'Ingresar';
}

export async function loginPaciente() {
  const nombre = document.getElementById('p-nombre').value.trim();
  const id = document.getElementById('p-id').value.trim();
  const edad = document.getElementById('p-edad').value.trim();
  const tel = document.getElementById('p-tel').value.trim();

  if (!nombre || !id || !edad || !tel) {
    showError('Por favor completá todos los campos.');
    return;
  }

  const btn = document.getElementById('btn-pac');
  btn.disabled = true;
  btn.textContent = 'Cargando...';
  hideError();

  // Un solo viaje en vez de leer y despues escribir: la unicidad de
  // identidad la resuelve Postgres, asi que dos pestanas a la vez ya no
  // crean dos fichas del mismo paciente.
  //
  // Se mandan solo los datos que el paciente escribe. visitas,
  // ultima_visita y notas quedan fuera a proposito: merge-duplicates
  // actualiza lo que se manda, e incluirlas le borraria el historial a
  // un paciente que vuelve. Las tres tienen default en el esquema, asi
  // que al crear la ficha se llenan igual.
  const alta = await sbUpsert('expedientes', {
    nombre,
    identidad: id,
    edad: parseInt(edad),
    telefono: tel
  }, 'identidad');

  if (!alta.ok) {
    showError('No pudimos guardar tus datos. Revisá tu conexión.');
    btn.disabled = false;
    btn.textContent = 'Agendar cita';
    return;
  }

  setPacienteData({ nombre, id, edad, tel });
  document.getElementById('cf-nombre').value = nombre;
  document.getElementById('cf-id').value = id;
  document.getElementById('cf-edad').value = edad;
  document.getElementById('cf-tel').value = tel;
  document.getElementById('cf-motivo').value = '';
  resetSeleccion();

  showScreen('paciente');
  renderDias();
  setPaso(1);
  btn.disabled = false;
  btn.textContent = 'Agendar cita';
}

export async function consultarEstado() {
  const id = document.getElementById('e-id').value.trim();
  if (!id) {
    showError('Por favor ingresá tu número de identidad.');
    return;
  }

  const btn = document.getElementById('btn-estado');
  btn.disabled = true;
  btn.textContent = 'Consultando...';
  hideError();

  const expediente = await sbGet('expedientes', `identidad=eq.${encodeURIComponent(id)}`);
  if (!expediente.length) {
    showError('No encontramos citas con ese número de identidad.');
    btn.disabled = false;
    btn.textContent = 'Consultar';
    return;
  }

  const nombre = expediente[0].nombre;
  const citas = await sbGet('citas', `nombre_paciente=eq.${encodeURIComponent(nombre)}&order=created_at.desc`);
  showScreen('estado');
  const el = document.getElementById('estado-resultado');
  if (!citas.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No tenés citas registradas</p></div>';
    btn.disabled = false;
    btn.textContent = 'Consultar';
    return;
  }

  const colores = {
    pendiente: { bg: '#fff3cd', color: '#856404', icon: '⏳', msg: 'Tu cita está pendiente de confirmación por la doctora.' },
    confirmada: { bg: '#d0f0fd', color: '#0077B6', icon: '✅', msg: '¡Tu cita fue confirmada! Recordá llegar a tiempo.' },
    atendida: { bg: '#d1fae5', color: '#065f46', icon: '✓', msg: 'Esta cita ya fue atendida.' },
    cancelada: { bg: '#fee2e2', color: '#991b1b', icon: '✗', msg: 'Tu cita fue rechazada. Podés agendar una nueva.' },
    nopresento: { bg: '#f3f4f6', color: '#6b7280', icon: '—', msg: 'Se registró que no te presentaste a esta cita.' }
  };

  el.innerHTML = citas.map((c) => {
    const col = colores[c.estado] || colores.pendiente;
    return `<div class="estado-card" style="background:${col.bg};border:1.5px solid ${col.color}">
      <div class="estado-icon">${col.icon}</div>
      <div class="estado-titulo" style="color:${col.color}">${labelEstado(c.estado)}</div>
      <div class="estado-msg" style="color:${col.color}">${col.msg}</div>
      <div style="background:#fff;border-radius:10px;padding:12px;text-align:left;font-size:13px">
        <div class="exp-row"><span>Paciente</span><span>${nombre}</span></div>
        <div class="exp-row"><span>Fecha</span><span>${c.fecha || '—'}</span></div>
        <div class="exp-row"><span>Horario</span><span>${c.hora}</span></div>
        <div class="exp-row"><span>Motivo</span><span>${c.motivo || '—'}</span></div>
      </div>
    </div>`;
  }).join('');

  btn.disabled = false;
  btn.textContent = 'Consultar';
}

export function logout() {
  setPacienteData({});
  resetSeleccion();
  window.expedienteActual = null;
  document.getElementById('d-usuario').value = '';
  document.getElementById('d-pass').value = '';
  ['p-nombre', 'p-id', 'p-edad', 'p-tel'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  hideError();
  setRole('paciente');
  showScreen('login');
}

// Sólo lo que el HTML invoca desde atributos onclick.
window.setRole = setRole;
window.loginDoctora = loginDoctora;
window.loginPaciente = loginPaciente;
window.consultarEstado = consultarEstado;
window.logout = logout;
