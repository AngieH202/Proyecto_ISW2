import { sbRpc, authLogin } from './api.js';
import { hideError, showError, showScreen, labelEstado, escapar, notif } from './utils.js';
import { renderDias, setPaso, setPacienteData, resetSeleccion, pacienteData, diaSel, slotSel } from './patient.js';
import { DOCTORA_USUARIO, DOCTORA_EMAIL, SLOTS_BASE } from './config.js';
import { abrirSesion } from './sesion.js';

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

  if (!res.access_token) {
    showError('Usuario o contraseña incorrectos.');
    btn.disabled = false;
    btn.textContent = 'Ingresar';
    return;
  }

  // El token deja de descartarse: se cambia por una cookie HttpOnly que
  // el servidor pueda verificar. Sin este paso, /admin no abre.
  const abierta = await abrirSesion(res.access_token, res.expires_in);
  if (!abierta) {
    showError('No pudimos iniciar la sesión. Intentá de nuevo.');
    btn.disabled = false;
    btn.textContent = 'Ingresar';
    return;
  }

  // El panel ya no vive en esta página: está detrás de /admin.
  window.location.href = '/admin';
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

  // Por RPC y no contra la tabla: 011_rls_endurecido.sql le quita a anon
  // el acceso directo a expedientes.
  //
  // La funcion mantiene el upsert idempotente sobre identidad -- un solo
  // viaje, sin la carrera que deja leer y despues escribir -- y solo toca
  // los datos que el paciente escribe. visitas y ultima_visita quedan
  // fuera a proposito: pisarlas le borraria el historial a quien vuelve.
  const alta = await sbRpc('registrar_paciente', {
    p_nombre: nombre,
    p_identidad: id,
    p_edad: parseInt(edad),
    p_telefono: tel
  });

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

  // Una sola RPC en lugar de dos lecturas de tabla. La funcion resuelve
  // el cruce del lado de la base y devuelve solo las citas de esa
  // identidad, sin exponer expedientes ni citas de nadie mas.
  const consulta = await sbRpc('estado_de_mis_citas', { p_identidad: id });
  const citas = Array.isArray(consulta.data) ? consulta.data : [];

  if (!consulta.ok) {
    showError('No pudimos consultar tus citas. Revisá tu conexión.');
    btn.disabled = false;
    btn.textContent = 'Consultar';
    return;
  }

  if (!citas.length) {
    showError('No encontramos citas con ese número de identidad.');
    btn.disabled = false;
    btn.textContent = 'Consultar';
    return;
  }

  const nombre = citas[0].nombre_paciente;
  citasConsultadas = citas;
  showScreen('estado');
  const el = document.getElementById('estado-resultado');

  const colores = {
    pendiente: { bg: '#fff3cd', color: '#856404', icon: '⏳', msg: 'Tu cita está pendiente de confirmación por la doctora.' },
    confirmada: { bg: '#d0f0fd', color: '#0077B6', icon: '✅', msg: '¡Tu cita fue confirmada! Recordá llegar a tiempo.' },
    atendida: { bg: '#d1fae5', color: '#065f46', icon: '✓', msg: 'Esta cita ya fue atendida.' },
    cancelada: { bg: '#fee2e2', color: '#991b1b', icon: '✗', msg: 'Tu cita fue rechazada. Podés agendar una nueva.' },
    cancelada_paciente: { bg: '#fee2e2', color: '#991b1b', icon: '✗', msg: 'Cancelaste esta cita. El horario quedó libre y podés agendar otra.' },
    nopresento: { bg: '#f3f4f6', color: '#6b7280', icon: '—', msg: 'Se registró que no te presentaste a esta cita.' }
  };

  el.innerHTML = citas.map((c, i) => {
    const col = colores[c.estado] || colores.pendiente;
    // Sólo se cancela lo que todavía no ocurrió. Una cita atendida ya
    // pasó, y darla de baja falsearía el historial clínico.
    const sePuedeCancelar = c.estado === 'pendiente' || c.estado === 'confirmada';
    return `<div class="estado-card" style="background:${col.bg};border:1.5px solid ${col.color}">
      <div class="estado-icon">${col.icon}</div>
      <div class="estado-titulo" style="color:${col.color}">${labelEstado(c.estado)}</div>
      <div class="estado-msg" style="color:${col.color}">${col.msg}</div>
      <div style="background:#fff;border-radius:10px;padding:12px;text-align:left;font-size:13px">
        <div class="exp-row"><span>Paciente</span><span>${escapar(nombre)}</span></div>
        <div class="exp-row"><span>Fecha</span><span>${escapar(c.fecha || '—')}</span></div>
        <div class="exp-row"><span>Horario</span><span>${escapar(c.hora)}</span></div>
        <div class="exp-row"><span>Motivo</span><span>${escapar(c.motivo || '—')}</span></div>
      </div>
      ${sePuedeCancelar ? `<button class="btn-cancelar-cita" id="btn-cancelar-${i}" onclick="cancelarCita(${i})">Cancelar esta cita</button>` : ''}
    </div>`;
  }).join('');

  btn.disabled = false;
  btn.textContent = 'Consultar';
}

// Las citas que se están mostrando. El botón manda el índice y de acá
// sale la fecha y la hora: así no viaja texto de la base dentro de un
// onclick.
let citasConsultadas = [];

export async function cancelarCita(indice) {
  const cita = citasConsultadas[indice];
  if (!cita) return;

  const btn = document.getElementById('btn-cancelar-' + indice);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Cancelando...';
  }

  // La identidad es la que se consultó, no la que diga la tarjeta: la
  // función sólo cancela una cita que corresponda a esa identidad.
  const identidad = document.getElementById('e-id').value.trim();
  const r = await sbRpc('cancelar_mi_cita', {
    p_identidad: identidad,
    p_fecha: cita.fecha,
    p_hora: cita.hora
  });

  // 'cancelada' y 'ya_cancelada' terminan igual: la cita está dada de
  // baja. Esa equivalencia es lo que vuelve seguro el reintento.
  if (r.ok && (r.data === 'cancelada' || r.data === 'ya_cancelada')) {
    notif('Tu cita fue cancelada. El horario quedó libre.');
    await consultarEstado();
    return;
  }

  if (r.ok && r.data === 'no_se_puede') notif('Esa cita ya fue atendida y no se puede cancelar.');
  else if (r.ok && r.data === 'no_encontrada') notif('No encontramos esa cita a tu nombre.');
  else notif('No pudimos cancelar. Intentá de nuevo.');

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Cancelar esta cita';
  }
}

// Abandonar el agendamiento antes de enviarlo, desde los pasos 1 a 3.
// Todavía no hay ninguna cita creada --se crea recién al enviar la
// solicitud-- así que no hay nada que dar de baja en la base: alcanza
// con soltar lo elegido y volver al formulario.
export function cancelarAgendamiento() {
  resetSeleccion();
  notif('Cancelaste el agendamiento.');
  logout();
}

// Cancelar la cita que se acaba de enviar, desde la pantalla de
// confirmación. Acá sí existe en la base, así que hay que darla de baja
// para que el horario vuelva a quedar libre.
export async function cancelarCitaAgendada() {
  if (!diaSel || slotSel === null) {
    logout();
    return;
  }

  const btn = document.getElementById('btn-cancelar-agendada');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Cancelando...';
  }

  const r = await sbRpc('cancelar_mi_cita', {
    p_identidad: pacienteData.id,
    p_fecha: diaSel.key,
    p_hora: SLOTS_BASE[slotSel]
  });

  const restaurar = () => {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Cancelar esta cita';
    }
  };

  // 'cancelada' y 'ya_cancelada' terminan igual: la cita está dada de
  // baja. Esa equivalencia es lo que vuelve seguro el reintento.
  if (r.ok && (r.data === 'cancelada' || r.data === 'ya_cancelada')) {
    notif('Tu cita fue cancelada. El horario quedó libre.');
    resetSeleccion();
    restaurar();
    logout();
    return;
  }

  notif(r.ok && r.data === 'no_se_puede'
    ? 'Esa cita ya fue atendida y no se puede cancelar.'
    : 'No pudimos cancelar. Intentá de nuevo.');
  restaurar();
}

// Salida del lado publico: limpia el formulario y vuelve al login. El
// portal tiene la suya, que ademas borra la cookie de sesion -- ver
// cerrarSesion en sesion.js.
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
window.cancelarCita = cancelarCita;
window.cancelarAgendamiento = cancelarAgendamiento;
window.cancelarCitaAgendada = cancelarCitaAgendada;
window.logout = logout;
