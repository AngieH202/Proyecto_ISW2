import { SB_URL, SB_KEY } from './_sesion.js';

// Healthcheck de la API.
//
//   200 + status "ok"        todo responde
//   200 + status "degradado" responde, pero algo tarda o falla parcial
//   503 + status "caido"     la base no contesta
//
// Consulta Supabase de verdad y mide la latencia: un JSON fijo diciendo
// "ok" no comprueba nada.

const VERSION = 'd73ff984';
const LENTO_MS = 1500;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ status: 'error', error: 'Método no permitido' });
  }

  const arranque = Date.now();
  const checks = {};

  checks.base_de_datos = await medir(async () => {
    // select=id&limit=1 es la consulta mas barata que igual atraviesa
    // PostgREST, las politicas y Postgres.
    const r = await fetch(`${SB_URL}/rest/v1/citas?select=id&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      cache: 'no-store'
    });
    if (!r.ok) throw new Error(`PostgREST respondió ${r.status}`);
    await r.json();
  });

  checks.autenticacion = await medir(async () => {
    // Sin token, GoTrue devuelve 401: eso ya prueba que el servicio esta
    // en pie. Un 5xx o un timeout serian el problema real.
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY },
      cache: 'no-store'
    });
    if (r.status >= 500) throw new Error(`GoTrue respondió ${r.status}`);
  });

  const caidos = Object.values(checks).filter((c) => c.estado === 'caido').length;
  const lentos = Object.values(checks).filter((c) => c.estado === 'lento').length;

  const status = caidos ? 'caido' : lentos ? 'degradado' : 'ok';
  const codigo = caidos ? 503 : 200;

  return res.status(codigo).json({
    status,
    servicio: 'DentaAgenda API',
    version: VERSION,
    timestamp: new Date().toISOString(),
    latencia_ms: Date.now() - arranque,
    checks
  });
}

async function medir(fn) {
  const t = Date.now();
  try {
    await fn();
    const ms = Date.now() - t;
    return { estado: ms > LENTO_MS ? 'lento' : 'ok', latencia_ms: ms };
  } catch (e) {
    return { estado: 'caido', latencia_ms: Date.now() - t, detalle: String(e.message ?? e) };
  }
}
