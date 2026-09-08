import { cookieSesion, validar, leerCookie, COOKIE } from './_sesion.js';

// Cambia la sesion de la doctora.
//
//   POST   { access_token, expires_in }  -> valida y deja la cookie
//   DELETE                               -> la borra
//   GET                                  -> dice si hay sesion, sin revelar el token
//
// El token llega una sola vez desde el cliente, apenas Supabase lo emite.
// De ahi en mas vive en una cookie HttpOnly, fuera del alcance del JS.

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const usuario = await validar(leerCookie(req, COOKIE));
    return res.status(usuario ? 200 : 401).json({
      sesion: Boolean(usuario),
      email: usuario?.email ?? null
    });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookieSesion('', 0));
    return res.status(200).json({ sesion: false });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const cuerpo = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const token = cuerpo?.access_token;

  if (!token) {
    return res.status(400).json({ error: 'Falta access_token' });
  }

  // Se valida contra Supabase antes de guardarla: sin esto, cualquiera
  // podria mandar una cadena inventada y quedarse con una cookie.
  const usuario = await validar(token);
  if (!usuario) {
    return res.status(401).json({ error: 'Token inválido o vencido' });
  }

  const segundos = Number(cuerpo.expires_in) > 0 ? Math.min(Number(cuerpo.expires_in), 86400) : 3600;
  res.setHeader('Set-Cookie', cookieSesion(token, segundos));
  return res.status(200).json({ sesion: true, email: usuario.email });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
