import { SB_URL, SB_KEY } from './_sesion.js';

// Healthcheck de la API.
//
//   200 + status "ok"        todo responde
//   200 + status "degradado" responde, pero algo tarda o falla parcial
//   503 + status "caido"     la base no contesta
//
// Consulta Supabase de verdad y mide la latencia: un JSON fijo diciendo
// "ok" no comprueba nada.

const VERSION = 'b3d50ec9';
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
    // La sonda va por slots_ocupados y no por una lectura de citas.
    //
    // Antes leia citas con la anon key. Desde 011 anon no llega a las
    // tablas, asi que PostgREST devolvia 401 y el healthcheck lo
    // reportaba como base caida: justo al reves de lo que pasaba, porque
    // ese 401 es la prueba de que las politicas funcionan.
    //
    // slots_ocupados es la RPC que usa el paciente para ver que horas
    // estan tomadas. Atraviesa lo mismo --PostgREST, las politicas,
    // Postgres-- y ademas devuelve datos, asi que comprueba el camino
    // real y no solo que el servicio conteste.
    const hoy = new Date().toISOString().slice(0, 10);
    const r = await fetch(`${SB_URL}/rest/v1/rpc/slots_ocupados`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_fecha: hoy }),
      cache: 'no-store'
    });
    if (!r.ok) throw new Error(`PostgREST respondió ${r.status}`);
    if (!Array.isArray(await r.json())) throw new Error('slots_ocupados no devolvió una lista');
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
