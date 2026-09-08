import { PORTAL_HTML } from './_portal.js';
import { leerCookie, validar, COOKIE, SB_URL, SB_KEY } from './_sesion.js';

// Portal privado de la doctora.
//
// Sin sesion valida responde 302 al login y NO manda una sola linea del
// marcado privado. Ese es el punto: antes el panel entero viajaba dentro
// de index.html, que se sirve a cualquiera.
//
// vercel.json reescribe /admin hacia aca.

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  const usuario = await validar(leerCookie(req, COOKIE));

  if (!usuario) {
    res.setHeader('Location', '/index.html?app=1&desde=admin');
    return res.status(302).end();
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(pagina(usuario));
}

function pagina(usuario) {
  // El token no se reenvia al cliente: la cookie es HttpOnly y asi se
  // queda. Lo que viaja es solo lo necesario para dibujar el encabezado.
  const sesion = JSON.stringify({
    email: usuario.email ?? null,
    id: usuario.id,
    sbUrl: SB_URL,
    sbKey: SB_KEY
  });

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0077B6">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>Portal de la doctora — DentaAgenda</title>
<link rel="stylesheet" href="/assets/css/app.css">
<link rel="icon" href="/assets/icono.svg" type="image/svg+xml">
</head>
<body>
<div class="app">

<div id="notif" class="notif"></div>

${PORTAL_HTML}

</div>

<script>window.__sesion = ${sesion};</script>
<script type="module" src="/assets/js/admin.js"></script>
</body>
</html>`;
}
