// Comprueba, desde afuera y con la anon key, que 011_rls_endurecido.sql
// quedo bien aplicado.
//
//   node scripts/verificar-rls.mjs
//
// Antes de aplicar el SQL falla, y esta bien que falle: es la prueba de
// que hoy cualquiera puede leer los expedientes.

const SB_URL = 'https://otdetmadixxmdoupqvdc.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90ZGV0bWFkaXh4bWRvdXBxdmRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMDQ5ODgsImV4cCI6MjEwMzc4MDk4OH0.hRkxl1tN17U96WqDX8vpZSS_anwNg6eGTFiVu7WV6Q0';
const h = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };

let fallos = 0;
const ok = (t, d = '') => console.log(`  ✓ ${t}${d ? '  — ' + d : ''}`);
const mal = (t, d = '') => { fallos++; console.log(`  ✗ ${t}${d ? '  — ' + d : ''}`); };

// ── 1. anon no debe leer las tablas ──────────────────────────────────
console.log('\nLectura directa con la anon key');
for (const tabla of ['expedientes', 'citas', 'visitas_clinicas', 'perfiles']) {
  const r = await fetch(`${SB_URL}/rest/v1/${tabla}?select=*&limit=5`, { headers: h });
  const cuerpo = await r.json().catch(() => null);
  const filas = Array.isArray(cuerpo) ? cuerpo.length : null;

  if (r.status === 401 || r.status === 403) ok(`${tabla} bloqueada`, `${r.status}`);
  else if (filas === 0) ok(`${tabla} no devuelve filas`, 'RLS sin política para anon');
  else mal(`${tabla} sigue expuesta`, `devolvió ${filas} fila(s)`);
}

// ── 2. anon no debe escribir directo ─────────────────────────────────
//
// Esta comprobacion escribe de verdad -- es la unica forma de saber si
// anon puede -- asi que borra lo que crea, incluso si algo falla en el
// medio. La identidad lleva marca y fecha para poder rastrear cualquier
// resto.
console.log('\nEscritura directa con la anon key');
const marca = 'PRUEBA-RLS-BORRAR';
const identidadPrueba = 'rls-' + Date.now();
try {
  const r = await fetch(`${SB_URL}/rest/v1/expedientes`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ nombre: marca, identidad: identidadPrueba, edad: 1 })
  });
  [401, 403, 404].includes(r.status)
    ? ok('insert en expedientes rechazado', `${r.status}`)
    : mal('insert en expedientes aceptado', `${r.status} — anon todavía escribe`);
} finally {
  const borrado = await fetch(
    `${SB_URL}/rest/v1/expedientes?identidad=eq.${encodeURIComponent(identidadPrueba)}`,
    { method: 'DELETE', headers: h }
  );
  if (borrado.status === 204 || borrado.status === 200) {
    console.log('    (fila de prueba borrada)');
  } else if (![401, 403].includes(borrado.status)) {
    console.log(`    OJO: no se pudo borrar la fila de prueba (${borrado.status}).`);
    console.log(`    Borrala a mano: expedientes donde identidad = '${identidadPrueba}'`);
  }
}

// ── 3. las RPC del paciente deben existir y responder ────────────────
console.log('\nFunciones que el flujo del paciente necesita');
const rpc = async (fn, args) => {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: h, body: JSON.stringify(args)
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const hoy = new Date().toISOString().slice(0, 10);
const slots = await rpc('slots_ocupados', { p_fecha: hoy });
slots.status === 200 && Array.isArray(slots.data)
  ? ok('slots_ocupados', `${slots.data.length} hora(s) tomada(s) hoy`)
  : mal('slots_ocupados', `${slots.status} — ¿falta correr 011?`);

const estado = await rpc('estado_de_mis_citas', { p_identidad: 'no-existe-' + Date.now() });
estado.status === 200 && Array.isArray(estado.data)
  ? ok('estado_de_mis_citas', 'responde con lista vacía')
  : mal('estado_de_mis_citas', `${estado.status}`);

// Estas dos escriben, así que solo se comprueba que existan: un 404 de
// PostgREST significa que la función no está; un error de argumentos
// significa que sí está.
for (const [fn, args] of [
  ['registrar_paciente', {}],
  ['crear_solicitud', {}]
]) {
  const res = await rpc(fn, args);
  res.status === 404
    ? mal(`${fn} existe`, 'no encontrada — ¿falta correr 011?')
    : ok(`${fn} existe`, `responde ${res.status} a argumentos vacíos`);
}

console.log('\n' + '─'.repeat(56));
if (fallos) {
  console.log(`${fallos} comprobación(es) fallaron.`);
  console.log('Si todavía no corriste migracion/011_rls_endurecido.sql, es lo esperado.');
} else {
  console.log('anon no llega a las tablas y las cuatro RPC responden.');
}
process.exit(fallos ? 1 : 0);
