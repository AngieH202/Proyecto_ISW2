import { sbRpc } from './api.js';
import { SLOTS_BASE, DIAS_NOMBRES, MESES } from './config.js';
import { notif, showError, escapar } from './utils.js';

// Estado de la reserva en curso. Va en un objeto y no en cuatro `let`
// exportados: exportar un `let` le entrega a quien importa un binding
// que cambia bajo sus pies, y deja el punto de escritura repartido.
// Con un objeto la referencia es fija y el dato sigue siendo uno solo.
export const estado = {
  pacienteData: {},
  slotSel: null,
  diaSel: null,
  semanaOffset: 0
};

// Único punto de escritura del estado del paciente desde otros módulos.
export function setPacienteData(datos) {
  estado.pacienteData = datos || {};
}

export function resetSeleccion() {
  estado.diaSel = null;
  estado.slotSel = null;
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
  lunes.setDate(hoy.getDate() + diffLunes + (estado.semanaOffset * 7));
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
    const seleccionado = estado.diaSel && estado.diaSel.key === key;

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
  estado.diaSel = { key, label, nombreDia };
  estado.slotSel = null;
  const err = document.getElementById('dia-err');
  if (err) err.style.display = 'none';
  renderDias();
}

export function cambiarSemana(dir) {
  if (estado.semanaOffset + dir < 0) return;
  estado.semanaOffset += dir;
  estado.diaSel = null;
  estado.slotSel = null;

  const btnAnt = document.getElementById('btn-sem-ant');
  const label = document.getElementById('label-semana');
  if (estado.semanaOffset <= 0) {
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
    label.textContent = estado.semanaOffset === 0 ? '📅 Esta semana' : estado.semanaOffset === 1 ? 'Próxima semana' : 'Semana +' + estado.semanaOffset;
  }

  renderDias();
}

export async function cargarSlotsDia() {
  if (!estado.diaSel) return;

  // El dia con el que arranca esta carga. Entre la peticion y la
  // respuesta el paciente puede cambiar de dia o cancelar: si para
  // entonces estado.diaSel ya no es este, esta respuesta quedo vieja y pintarla
  // mostraria los horarios de otro dia.
  const dia = estado.diaSel;

  const target = document.getElementById('horarios-grid');
  if (target) target.innerHTML = '<div class="loading">Cargando horarios...</div>';

  // Por RPC: anon ya no lee la tabla citas. La funcion devuelve solo las
  // horas tomadas de ese dia, sin decir de quien es cada una.
  //
  // Sin cache: mostrar como libre un horario que otro acaba de tomar es
  // el peor error posible en esta pantalla.
  const ocupadas = await sbRpc('slots_ocupados', { p_fecha: dia.key });
  if (estado.diaSel !== dia) return;

  const horasOcupadas = new Set(
    (Array.isArray(ocupadas.data) ? ocupadas.data : []).map((c) => c.hora)
  );

  const ahora = new Date();
  const esHoy = dia.key === formatoFechaKey(ahora);

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
    const sel = estado.slotSel === i;

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
  estado.slotSel = i;
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
  if (!estado.diaSel) {
    const err = document.getElementById('dia-err');
    if (err) err.style.display = 'block';
    return;
  }
  const err = document.getElementById('dia-err');
  if (err) err.style.display = 'none';
  const label = document.getElementById('dia-seleccionado-label');
  if (label) label.textContent = '📅 ' + estado.diaSel.nombreDia + ', ' + estado.diaSel.label;
  cargarSlotsDia();
  setPaso(2);
}

export function irPaso3() {
  if (estado.slotSel === null) {
    const err = document.getElementById('slot-err');
    if (err) err.style.display = 'block';
    return;
  }
  const label = document.getElementById('slot-resumen');
  if (label) {
    label.innerHTML = `
      <small>Cita seleccionada</small>
      <strong>${estado.diaSel.nombreDia}, ${estado.diaSel.label} · ${SLOTS_BASE[estado.slotSel]} · Clínica Dra. Belkis Suisse</strong>`;
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

  const hora = SLOTS_BASE[estado.slotSel];

  const mostrarConfirmacion = () => {
    const detail = document.getElementById('confirm-detail');
    if (detail) {
      detail.innerHTML = `
        <div><span>Paciente</span><span style="font-weight:600">${escapar(estado.pacienteData.nombre)}</span></div>
        <div><span>Fecha</span><span style="font-weight:600">${estado.diaSel.nombreDia}, ${estado.diaSel.label}</span></div>
        <div><span>Hora</span><span style="font-weight:600">${hora}</span></div>
        <div><span>Motivo</span><span style="font-weight:600">${escapar(motivo)}</span></div>
        <div><span>Estado</span><span style="color:#856404;font-weight:700;background:#fff3cd;padding:2px 8px;border-radius:8px">Pendiente de confirmación</span></div>`;
    }
    setPaso(4);
  };

  // Una sola llamada: la funcion comprueba el horario e inserta dentro de
  // la misma sentencia. Antes eran dos peticiones HTTP, y entre una y
  // otra quedaba una ventana en la que otro paciente podia tomar el slot.
  //
  // Distingue de quien es la cita por identidad, que es unica. El nombre
  // solo se usa de respaldo para las citas viejas, creadas antes de que
  // se guardara identidad: comparar por nombre a secas le mostraria a un
  // homonimo la confirmacion de una cita ajena.
  const r = await sbRpc('crear_solicitud', {
    p_identidad: estado.pacienteData.id,
    p_nombre: estado.pacienteData.nombre,
    p_telefono: estado.pacienteData.tel,
    p_fecha: estado.diaSel.key,
    p_hora: hora,
    p_motivo: motivo
  });

  // 'creada' o 'ya_existia' terminan igual: la cita del paciente esta
  // puesta. Esa equivalencia es lo que vuelve seguro el reintento.
  if (r.ok && (r.data === 'creada' || r.data === 'ya_existia')) {
    mostrarConfirmacion();
  } else if (r.ok && r.data === 'ocupado') {
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
  estado.semanaOffset = 0;
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
