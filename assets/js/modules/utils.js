export function notif(msg) {
  const n = document.getElementById('notif');
  if (!n) return;
  n.textContent = msg;
  n.classList.add('show');
  setTimeout(() => n.classList.remove('show'), 2500);
}

export function showError(msg) {
  const e = document.getElementById('form-error');
  if (!e) return;
  e.textContent = msg;
  e.style.display = 'block';
}

export function hideError() {
  const e = document.getElementById('form-error');
  if (e) e.style.display = 'none';
}

export function showScreen(s) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  const target = document.getElementById('screen-' + s);
  if (target) target.classList.add('active');
}

// Neutraliza el texto que viene de la base antes de meterlo en un
// innerHTML. Sin esto, un nombre o un diagnostico con etiquetas dentro
// se interpreta como marcado: quien escribe el dato elige que codigo
// corre en la pantalla de la doctora.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapar(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function labelEstado(e) {
  return {
    pendiente: 'Pendiente',
    confirmada: 'Confirmada',
    atendida: 'Atendida',
    cancelada: 'Cancelada',
    nopresento: 'No se presentó'
  }[e] || e;
}

export function iniciales(nombre) {
  return (nombre || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

export function fechaHoy() {
  return new Date().toLocaleDateString('es-HN', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function horaAhora() {
  return new Date().toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
}
