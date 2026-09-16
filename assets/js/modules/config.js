export const SB_URL = 'https://otdetmadixxmdoupqvdc.supabase.co';
export const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90ZGV0bWFkaXh4bWRvdXBxdmRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMDQ5ODgsImV4cCI6MjEwMzc4MDk4OH0.hRkxl1tN17U96WqDX8vpZSS_anwNg6eGTFiVu7WV6Q0';

export const DOCTORA_USUARIO = 'belki.den';
export const DOCTORA_EMAIL = 'belki.den@dentaagenda.com';

// Cuenta de demostracion para la evaluacion del entregable.
//
// Entra al mismo portal que la doctora: validar() en api/_sesion.js
// comprueba que el token sea de un usuario de Supabase, no de cual. No
// hay roles, asi que esta cuenta solo tiene sentido mientras la base
// lleve datos de prueba. Con pacientes reales adentro, borrala de
// Supabase y este mapa deja de abrirle la puerta.
export const DEMO_USUARIO = 'demo';
export const DEMO_EMAIL = 'demo@dentaagenda.com';

// Cuenta nominal para quien evalua el entregable. Mismo alcance que la
// demo: entra al portal completo.
//
// El correo no sigue el patron de las otras dos: es con el que esta
// dada de alta la cuenta en Supabase, que es lo unico que importa aca.
// En minusculas porque asi lo guarda GoTrue.
export const EVALUADOR_USUARIO = 'jaleman';
export const EVALUADOR_EMAIL = 'aleman@gmail.com';

// Usuario que se escribe en el formulario -> correo con el que se
// autentica contra Supabase. Lo que no esta aca no entra.
//
// Las claves van en minusculas: loginDoctora() normaliza lo que se
// escribe antes de buscarlo, asi que "JAleman" encuentra "jaleman".
export const CUENTAS = {
  [DOCTORA_USUARIO]: DOCTORA_EMAIL,
  [DEMO_USUARIO]: DEMO_EMAIL,
  [EVALUADOR_USUARIO]: EVALUADOR_EMAIL
};

export const SLOTS_BASE = ['7:00 AM', '7:45 AM', '8:30 AM', '9:15 AM', '10:00 AM', '10:45 AM', '11:30 AM', '12:15 PM', '2:00 PM'];
export const DIAS_NOMBRES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
