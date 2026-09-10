import { SB_URL, SB_KEY } from './config.js';
import { clave, leer, guardar, invalidar, TTL_POR_DEFECTO } from './cache.js';

// Dos modos, segun donde corra el modulo:
//
//   portal   window.__sesion existe -> las tablas se piden a /api/db,
//            que firma con el token de la doctora sin bajarlo al
//            navegador.
//   publico  no hay sesion -> se habla directo con Supabase, y solo a
//            traves de las funciones RPC. El paciente no toca las
//            tablas: 011_rls_endurecido.sql se las cierra a anon.
const enPortal = () => typeof window !== 'undefined' && Boolean(window.__sesion);

const baseTablas = () => (enPortal() ? '/api/db' : `${SB_URL}/rest/v1`);

function cabeceras(extra = {}) {
  // El proxy pone su propia autorizacion; mandarle la anon key no
  // aportaria nada y confundiria el origen del permiso.
  if (enPortal()) return { ...extra };
  return { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, ...extra };
}

// Llama una funcion de Postgres. Es la unica via por la que el paciente
// escribe o lee: cada RPC expone exactamente lo que necesita esa
// pantalla y nada mas.
export async function sbRpc(funcion, args = {}, opciones = {}) {
  const { cache: usarCache = false, ttl = TTL_POR_DEFECTO } = opciones;
  const k = clave('rpc:' + funcion, JSON.stringify(args));

  if (usarCache) {
    const guardado = leer(k);
    if (guardado !== undefined) return guardado;
  }

  const r = await fetch(`${SB_URL}/rest/v1/rpc/${funcion}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    cache: usarCache ? 'default' : 'no-store'
  });

  const datos = await r.json().catch(() => null);
  if (usarCache && r.ok) guardar(k, datos, ttl);
  return { ok: r.ok, status: r.status, data: datos };
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

  const r = await fetch(`${baseTablas()}/${tabla}?${query}`, {
    headers: cabeceras(),
    cache: usarCache ? 'default' : 'no-store'
  });

  // Una lectura de tabla devuelve una lista. Cualquier otra cosa es un
  // error --un 401 con su json, o el HTML de un 404 de la plataforma, que
  // ni siquiera parsea-- y quien llama espera poder recorrer el
  // resultado. Devolver siempre un array evita que la pantalla se quede
  // colgada en "Cargando..." por una excepción a mitad de camino.
  const datos = await r.json().catch(() => null);

  // La cookie venció: no tiene sentido seguir mostrando un panel vacío,
  // hay que volver a entrar.
  if (r.status === 401 && enPortal()) {
    window.location.href = '/login';
    return [];
  }

  if (!r.ok || !Array.isArray(datos)) {
    console.error('sbGet', tabla, r.status, datos);
    return [];
  }

  if (usarCache) guardar(k, datos, ttl);
  return datos;
}

// status viaja en el resultado para que quien llama pueda distinguir un
// 409 -- horario ya tomado, contra el indice unico de 006 -- de un error
// de red cualquiera.
export async function sbPost(tabla, body, prefer = 'return=representation') {
  const r = await fetch(`${baseTablas()}/${tabla}`, {
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
  const r = await fetch(`${baseTablas()}/${tabla}?on_conflict=${encodeURIComponent(onConflict)}`, {
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
  const r = await fetch(`${baseTablas()}/${tabla}?${query}`, {
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
