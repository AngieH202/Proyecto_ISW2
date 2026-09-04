import { sbGet, sbPost } from './api.js';
import { SLOTS_BASE, DIAS_NOMBRES, MESES } from './config.js';
import { notif, showError } from './utils.js';

export let pacienteData = {};
export let slotSel = null;
export let diaSel = null;
export let semanaOffset = 0;

// Único punto de escritura del estado del paciente desde otros módulos.
export function setPacienteData(datos) {
  pacienteData = datos || {};
}

export function resetSeleccion() {
  diaSel = null;
  slotSel = null;
}

export function setPaso(n) {
  [1, 2, 3, 4].forEach((i) => {
    const p = document.getElementById('pstep-' + i);
    if (p) p.classList.toggle('active', i === n);
    const s = document.getElementById('si' + i);
    if (s) s.classList.toggle('active', i <= n);
  });
}

export function obtenerDiasSemana() {
  const hoy = new Date();
  const diaSemana = hoy.getDay();
  const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + diffLunes + (semanaOffset * 7));
  lunes.setHours(0, 0, 0, 0);

  const dias = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    dias.push(d);
  }
  return dias;
}

export function formatoFechaKey(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatoFechaLabel(fecha) {
  return `${fecha.getDate()} ${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`;
}

export function esPasado(fecha) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return fecha < hoy;
}

export function renderDias() {
  const dias = obtenerDiasSemana();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const html = dias.map((d, i) => {
    const pasado = esPasado(d);
    const esHoy = d.getTime() === hoy.getTime();
    const key = formatoFechaKey(d);
    const seleccionado = diaSel && diaSel.key === key;

    let clase = 'dia-btn';
    if (pasado) clase += ' pasado';
    else if (seleccionado) clase += ' seleccionado';
    else clase += ' disponible';

    return `<button class="${clase}" ${pasado ? 'disabled' : ''} onclick="selDia('${key}','${formatoFechaLabel(d)}','${DIAS_NOMBRES[i]}')">
      <div class="dia-nombre">${DIAS_NOMBRES[i]}</div>
      <div class="dia-num">${d.getDate()}</div>
      <div class="dia-mes">${esHoy ? 'Hoy' : MESES[d.getMonth()]}</div>
    </button>`;
  }).join('');

  const target = document.getElementById('dias-grid');
  if (target) target.innerHTML = html;
}

export function selDia(key, label, nombreDia) {
  diaSel = { key, label, nombreDia };
  slotSel = null;
  const err = document.getElementById('dia-err');
  if (err) err.style.display = 'none';
  renderDias();
}

export function cambiarSemana(dir) {
  if (semanaOffset + dir < 0) return;
  semanaOffset += dir;
  diaSel = null;
  slotSel = null;

  const btnAnt = document.getElementById('btn-sem-ant');
  const label = document.getElementById('label-semana');
  if (semanaOffset <= 0) {
    btnAnt.disabled = true;
    btnAnt.style.background = '#e0f0f8';
    btnAnt.style.color = '#adb5bd';
    btnAnt.style.cursor = 'not-allowed';
  } else {
    btnAnt.disabled = false;
    btnAnt.style.background = 'linear-gradient(135deg,#0077B6,#00B4D8)';
    btnAnt.style.color = '#fff';
    btnAnt.style.cursor = 'pointer';
  }

  if (label) {
    label.textContent = semanaOffset === 0 ? '📅 Esta semana' : semanaOffset === 1 ? 'Próxima semana' : 'Semana +' + semanaOffset;
  }

  renderDias();
}

export async function cargarSlotsDia() {
  if (!diaSel) return;
  const target = document.getElementById('horarios-grid');
  if (target) target.innerHTML = '<div class="loading">Cargando horarios...</div>';

  const ocupadas = await sbGet('citas', `estado=neq.cancelada&fecha=eq.${diaSel.key}&select=hora`);
  const horasOcupadas = new Set((ocupadas || []).map((c) => c.hora));

  const ahora = new Date();
  const esHoy = diaSel.key === formatoFechaKey(ahora);

  const html = SLOTS_BASE.map((h, i) => {
    const ocupado = horasOcupadas.has(h);
    let yaP = false;

    if (esHoy) {
      let hNum = parseInt(h.split(':')[0]);
      const mNum = parseInt(h.split(':')[1]) || 0;
      if (h.includes('PM') && hNum !== 12) hNum += 12;
      if (h.includes('AM') && hNum === 12) hNum = 0;
      const slotMin = hNum * 60 + mNum;
      const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
      yaP = slotMin <= ahoraMin;
    }

    const libre = !ocupado && !yaP;
    const sel = slotSel === i;

    let clase = 'slot';
    if (yaP) clase += ' pasado';
    else if (ocupado) clase += ' ocupado';
    else if (sel) clase += ' seleccionado';
    else clase += ' libre';

    return `<button class="${clase}" ${libre ? `onclick="selSlot(${i})"` : 'disabled'}>${h}</button>`;
  }).join('');

  if (target) target.innerHTML = html;
}

export function selSlot(i) {
  slotSel = i;
  const err = document.getElementById('slot-err');
  if (err) err.style.display = 'none';
  cargarSlotsDia();
}

export function irPaso1() {
  resetSeleccion();
  renderDias();
  setPaso(1);
}

export function irPaso2() {
  if (!diaSel) {
    const err = document.getElementById('dia-err');
    if (err) err.style.display = 'block';
    return;
  }
  const err = document.getElementById('dia-err');
  if (err) err.style.display = 'none';
  const label = document.getElementById('dia-seleccionado-label');
  if (label) label.textContent = '📅 ' + diaSel.nombreDia + ', ' + diaSel.label;
  cargarSlotsDia();
  setPaso(2);
}

export function irPaso3() {
  if (slotSel === null) {
    const err = document.getElementById('slot-err');
    if (err) err.style.display = 'block';
    return;
  }
  const label = document.getElementById('slot-resumen');
  if (label) {
    label.innerHTML = `
      <small>Cita seleccionada</small>
      <strong>${diaSel.nombreDia}, ${diaSel.label} · ${SLOTS_BASE[slotSel]} · Clínica Dra. Belkis Suisse</strong>`;
  }
  setPaso(3);
}

export async function enviarSolicitud() {
  const motivo = document.getElementById('cf-motivo').value.trim();
  if (!motivo) {
    const err = document.getElementById('motivo-err');
    if (err) err.style.display = 'block';
    return;
  }
  const err = document.getElementById('motivo-err');
  if (err) err.style.display = 'none';

  const btn = document.getElementById('btn-enviar');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const hora = SLOTS_BASE[slotSel];

  const mostrarConfirmacion = () => {
    const detail = document.getElementById('confirm-detail');
    if (detail) {
      detail.innerHTML = `
        <div><span>Paciente</span><span style="font-weight:600">${pacienteData.nombre}</span></div>
        <div><span>Fecha</span><span style="font-weight:600">${diaSel.nombreDia}, ${diaSel.label}</span></div>
        <div><span>Hora</span><span style="font-weight:600">${hora}</span></div>
        <div><span>Motivo</span><span style="font-weight:600">${motivo}</span></div>
        <div><span>Estado</span><span style="color:#856404;font-weight:700;background:#fff3cd;padding:2px 8px;border-radius:8px">Pendiente de confirmación</span></div>`;
    }
    setPaso(4);
  };

  // Una sola consulta por el horario, y la decision se toma en JS. Se
  // evita a proposito un or=() de PostgREST: ahi los valores van dentro
  // de la expresion y una coma en un nombre rompe el filtro.
  const enEseSlot = await sbGet(
    'citas',
    `fecha=eq.${encodeURIComponent(diaSel.key)}` +
    `&hora=eq.${encodeURIComponent(hora)}` +
    '&estado=neq.cancelada&select=id,identidad,nombre_paciente'
  );
  const ocupantes = Array.isArray(enEseSlot) ? enEseSlot : [];

  // Propia si coincide la identidad, que es unica. El nombre solo sirve
  // de respaldo para las citas viejas, creadas antes de que se guardara
  // identidad: comparar por nombre a secas le mostraria a un homonimo la
  // confirmacion de una cita ajena.
  const esPropia = ocupantes.some((c) => (
    c.identidad
      ? c.identidad === pacienteData.id
      : c.nombre_paciente === pacienteData.nombre
  ));

  // Ya entro: un reintento tras un timeout, o el boton de atras. Se
  // muestra la confirmacion en vez de crear una segunda cita identica.
  if (esPropia) {
    mostrarConfirmacion();
    btn.disabled = false;
    btn.textContent = 'Enviar solicitud';
    return;
  }

  // El horario es de otra persona. Se corta antes de intentar el insert,
  // sin depender de que el indice unico de 006 este puesto.
  if (ocupantes.length) {
    notif('Ese horario acaba de ocuparse. Elegí otro.');
    await cargarSlotsDia();
    setPaso(2);
    btn.disabled = false;
    btn.textContent = 'Enviar solicitud';
    return;
  }

  const { ok, status } = await sbPost('citas', {
    nombre_paciente: pacienteData.nombre,
    // La columna ya existia sin usarse. Mandarla da una clave de cruce
    // fiable contra expedientes, en vez del nombre escrito a mano.
    identidad: pacienteData.id,
    telefono_paciente: pacienteData.tel,
    fecha: diaSel.key,
    hora,
    motivo,
    estado: 'pendiente'
  });

  if (ok) {
    mostrarConfirmacion();
  } else if (status === 409) {
    // Choca contra el indice unico de 006: alguien reservo ese horario
    // entre que se eligio y se confirmo.
    notif('Ese horario acaba de ocuparse. Elegí otro.');
    await cargarSlotsDia();
    setPaso(2);
  } else {
    notif('Error al enviar. Intentá de nuevo.');
  }

  btn.disabled = false;
  btn.textContent = 'Enviar solicitud';
}

export function nuevaCita() {
  semanaOffset = 0;
  resetSeleccion();
  const motivo = document.getElementById('cf-motivo');
  if (motivo) motivo.value = '';
  renderDias();
  setPaso(1);
}

// Sólo lo que el HTML invoca desde atributos onclick.
window.selDia = selDia;
window.selSlot = selSlot;
window.cambiarSemana = cambiarSemana;
window.irPaso1 = irPaso1;
window.irPaso2 = irPaso2;
window.irPaso3 = irPaso3;
window.enviarSolicitud = enviarSolicitud;
window.nuevaCita = nuevaCita;
