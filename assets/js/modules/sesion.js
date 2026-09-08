// Sesion de la doctora, del lado del cliente.
//
// El access_token que emite Supabase se manda una sola vez a
// /api/session, que lo valida y lo guarda en una cookie HttpOnly. Desde
// ahi el JS no vuelve a verlo: es lo que impide que un XSS se lo lleve.
//
// Antes el token se comprobaba y se tiraba, y todas las peticiones iban
// firmadas con la anon key. El login existia, pero no cambiaba nada.

export async function abrirSesion(accessToken, expiresIn) {
  const r = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, expires_in: expiresIn }),
    cache: 'no-store'
  });
  return r.ok;
}

export async function cerrarSesion() {
  try {
    await fetch('/api/session', { method: 'DELETE', cache: 'no-store' });
  } catch {
    // Si la red falla igual se sale: la cookie vence sola.
  }
  window.location.href = '/login';
}

export async function haySesion() {
  try {
    const r = await fetch('/api/session', { cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}
