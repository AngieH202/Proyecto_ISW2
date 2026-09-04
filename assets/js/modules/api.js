import { SB_URL, SB_KEY } from './config.js';

function cabeceras(extra = {}) {
  return { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, ...extra };
}

export async function sbGet(tabla, query = '') {
  const r = await fetch(`${SB_URL}/rest/v1/${tabla}?${query}`, {
    headers: cabeceras()
  });
  return r.json();
}

// status viaja en el resultado para que quien llama pueda distinguir un
// 409 -- horario ya tomado, contra el indice unico de 006 -- de un error
// de red cualquiera.
export async function sbPost(tabla, body, prefer = 'return=representation') {
  const r = await fetch(`${SB_URL}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: cabeceras({ 'Content-Type': 'application/json', Prefer: prefer }),
    body: JSON.stringify(body)
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
}

// Insertar o actualizar en una sola ida, resolviendo el choque contra la
// columna unica que se le indique. Es lo que vuelve idempotente el alta
// del paciente: sin esto hay que leer y despues escribir, y entre las dos
// cosas se cuela otra pestana.
//
// merge-duplicates actualiza las columnas que se manden. Ojo con eso:
// mandar de mas pisa datos buenos del que ya existia.
export async function sbUpsert(tabla, body, onConflict, resolution = 'merge-duplicates') {
  const r = await fetch(`${SB_URL}/rest/v1/${tabla}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: cabeceras({
      'Content-Type': 'application/json',
      Prefer: `resolution=${resolution},return=representation`
    }),
    body: JSON.stringify(body)
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
}

export async function sbPatch(tabla, query, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${tabla}?${query}`, {
    method: 'PATCH',
    headers: cabeceras({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
  return { ok: r.ok, status: r.status };
}

export async function authLogin(email, pass) {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  });
  return r.json();
}
