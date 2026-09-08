import { leerCookie, validar, COOKIE, SB_URL, SB_KEY } from './_sesion.js';

// Proxy de datos del portal.
//
//   /api/db/citas?fecha=eq.2026-09-10&order=hora.asc
//
// Reenvia a PostgREST firmando con el token de la doctora, que vive en
// una cookie HttpOnly y por eso nunca baja al navegador. Sin esto habria
// que inyectar el token en la pagina, y la app arma HTML con innerHTML a
// partir de nombres y diagnosticos: un XSS se lo llevaria.
//
// Solo lo usa el panel. El flujo del paciente no pasa por aqui: va por
// las funciones RPC, que son publicas a proposito.

// Lista blanca: el proxy no es una puerta abierta a la base.
const TABLAS = new Set(['citas', 'expedientes', 'visitas_clinicas']);
const METODOS = new Set(['GET', 'POST', 'PATCH']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const usuario = await validar(leerCookie(req, COOKIE));
  if (!usuario) return res.status(401).json({ error: 'Sesión requerida' });

  if (!METODOS.has(req.method)) {
    res.setHeader('Allow', [...METODOS].join(', '));
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // /api/db/<tabla>?<query>
  const url = new URL(req.url, 'http://local');
  const tabla = url.pathname.replace(/^\/api\/db\/?/, '').split('/')[0];

  if (!TABLAS.has(tabla)) {
    return res.status(403).json({ error: 'Tabla no permitida' });
  }

  const token = leerCookie(req, COOKIE);
  const destino = `${SB_URL}/rest/v1/${tabla}${url.search}`;

  const cabeceras = {
    apikey: SB_KEY,
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json'
  };
  if (req.headers.prefer) cabeceras.Prefer = req.headers.prefer;

  try {
    const r = await fetch(destino, {
      method: req.method,
      headers: cabeceras,
      body: req.method === 'GET' ? undefined
        : JSON.stringify(typeof req.body === 'string' ? JSON.parse(req.body) : req.body),
      cache: 'no-store'
    });

    const texto = await r.text();
    res.status(r.status);
    res.setHeader('Content-Type', r.headers.get('content-type') ?? 'application/json');
    return res.send(texto);
  } catch (e) {
    return res.status(502).json({ error: 'No se pudo contactar la base', detalle: String(e.message ?? e) });
  }
}
