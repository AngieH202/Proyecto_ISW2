// Utilidades de sesion compartidas por las funciones de api/.
// El guion bajo del nombre evita que Vercel la publique como ruta.

export const COOKIE = 'da_sesion';

const SB_URL = process.env.SUPABASE_URL || 'https://otdetmadixxmdoupqvdc.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90ZGV0bWFkaXh4bWRvdXBxdmRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMDQ5ODgsImV4cCI6MjEwMzc4MDk4OH0.hRkxl1tN17U96WqDX8vpZSS_anwNg6eGTFiVu7WV6Q0';

export { SB_URL, SB_KEY };

export function leerCookie(req, nombre) {
  const crudo = req.headers.cookie;
  if (!crudo) return null;
  for (const parte of crudo.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nombre) {
      return decodeURIComponent(parte.slice(i + 1).trim());
    }
  }
  return null;
}

// HttpOnly para que un XSS no pueda leer el token, Secure porque el sitio
// es HTTPS, y SameSite=Strict porque nada externo necesita enviarla.
export function cookieSesion(token, segundos) {
  const base = `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
  return segundos > 0 ? `${base}; Max-Age=${segundos}` : `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// Unica fuente de verdad sobre si hay sesion: se le pregunta a Supabase.
// No se decodifica el JWT del lado nuestro -- eso solo diria que el token
// tiene forma valida, no que siga vigente.
export async function validar(token) {
  if (!token) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token }
    });
    if (!r.ok) return null;
    const usuario = await r.json();
    return usuario && usuario.id ? usuario : null;
  } catch {
    return null;
  }
}
