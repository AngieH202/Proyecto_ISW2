import { SB_URL, SB_KEY } from './config.js';
import { clave, leer, guardar, invalidar, TTL_POR_DEFECTO } from './cache.js';

function cabeceras(extra = {}) {
  return { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, ...extra };
}

// Lectura cacheada. Dos opciones:
//
//   cache: false  -- salta la cache de memoria Y la del service worker,
//                    porque manda cache: 'no-store' en el fetch. Es
//                    obligatorio en las lecturas de las que depende una
//                    decision de escritura: una respuesta vieja ahi
//                    romperia la idempotencia, dejando pasar un
//                    duplicado o negando una cita que si es propia.
//   ttl           -- milisegundos de vida de la entrada.
export async function sbGet(tabla, query = '', opciones = {}) {
  const { cache: usarCache = true, ttl = TTL_POR_DEFECTO } = opciones;
  const k = clave(tabla, query);

  if (usarCache) {
    const guardado = leer(k);
    if (guardado !== undefined) return guardado;
  }

  const r = await fetch(`${SB_URL}/rest/v1/${tabla}?${query}`, {
    headers: cabeceras(),
    cache: usarCache ? 'default' : 'no-store'
  });
  const datos = await r.json();

  if (usarCache && r.ok) guardar(k, datos, ttl);
  return datos;
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
  if (r.ok) invalidar(tabla);
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
  if (r.ok) invalidar(tabla);
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
}

export async function sbPatch(tabla, query, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${tabla}?${query}`, {
    method: 'PATCH',
    headers: cabeceras({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
  if (r.ok) invalidar(tabla);
  return { ok: r.ok, status: r.status };
}

export async function authLogin(email, pass) {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
    cache: 'no-store'
  });
  return r.json();
}
