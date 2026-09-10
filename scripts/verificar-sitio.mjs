// Audita el sitio en vivo con los mismos criterios del entregable.
//
//   node scripts/verificar-sitio.mjs
//   node scripts/verificar-sitio.mjs https://otro-dominio
//
// Sale con codigo 1 si algo falla, para poder encadenarlo. No modifica
// nada: son todas peticiones de lectura.

// El destino puede venir por argumento, asi que se valida antes de
// usarlo: sin esto, cualquier cadena termina en un fetch y el script
// sirve para pegarle a lo que sea desde donde corra.
const POR_DEFECTO = 'https://www.angiehernndz.lat';

function destino(valor) {
  if (!valor) return POR_DEFECTO;
  let url;
  try {
    url = new URL(valor);
  } catch {
    console.error(`No es una URL valida: ${String(valor).slice(0, 100)}`);
    process.exit(2);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    console.error(`Protocolo no permitido: ${url.protocol}`);
    process.exit(2);
  }
  return url.origin;
}

const BASE = destino(process.argv[2]).replace(/\/$/, '');

const resultados = [];
const ok = (g, n, d = '') => resultados.push({ g, n, bien: true, d });
const mal = (g, n, d = '') => resultados.push({ g, n, bien: false, d });

async function traer(ruta, opciones = {}) {
  try {
    const r = await fetch(BASE + ruta, { redirect: 'manual', ...opciones });
    const cuerpo = opciones.method === 'HEAD' ? '' : await r.text();
    return { status: r.status, headers: r.headers, cuerpo };
  } catch (e) {
    return { status: 0, headers: new Headers(), cuerpo: '', error: String(e.message ?? e) };
  }
}

// ── 1. Transporte ────────────────────────────────────────────────────
const raiz = await traer('/');
raiz.status === 200 ? ok('Transporte', 'La raíz responde 200')
                    : mal('Transporte', 'La raíz responde 200', `dio ${raiz.status}`);
BASE.startsWith('https://') ? ok('Transporte', 'El sitio es HTTPS')
                            : mal('Transporte', 'El sitio es HTTPS');

// ── 2. Headers de seguridad ──────────────────────────────────────────
const REQUERIDOS = {
  'strict-transport-security': /max-age=\d+/,
  'content-security-policy': /default-src/,
  'x-frame-options': /DENY|SAMEORIGIN/i,
  'x-content-type-options': /nosniff/i,
  'referrer-policy': /.+/,
  'permissions-policy': /.+/
};
for (const [h, re] of Object.entries(REQUERIDOS)) {
  const v = raiz.headers.get(h);
  if (v && re.test(v)) ok('Seguridad', h);
  else mal('Seguridad', h, v ? `valor inesperado: ${v.slice(0, 40)}` : 'ausente');
}

// ── 3. Archivos de sitio ─────────────────────────────────────────────
const robots = await traer('/robots.txt');
robots.status === 200 ? ok('Sitio', 'robots.txt') : mal('Sitio', 'robots.txt', `dio ${robots.status}`);
/sitemap:/i.test(robots.cuerpo) ? ok('Sitio', 'robots.txt declara el sitemap')
                                : mal('Sitio', 'robots.txt declara el sitemap');

const sitemap = await traer('/sitemap.xml');
sitemap.status === 200 && sitemap.cuerpo.includes('<urlset')
  ? ok('Sitio', 'sitemap.xml') : mal('Sitio', 'sitemap.xml', `dio ${sitemap.status}`);

const cuatroCuatro = await traer('/ruta-que-no-existe-' + Date.now());
cuatroCuatro.status === 404 ? ok('Sitio', '404 devuelve 404')
                            : mal('Sitio', '404 devuelve 404', `dio ${cuatroCuatro.status}`);
/DentaAgenda/i.test(cuatroCuatro.cuerpo)
  ? ok('Sitio', '404 es una página propia') : mal('Sitio', '404 es una página propia', 'sin la marca');

// ── 4. PWA ───────────────────────────────────────────────────────────
const man = await traer('/manifest.json');
let manifest = null;
try { manifest = JSON.parse(man.cuerpo); } catch { /* queda null */ }

if (!manifest) {
  mal('PWA', 'manifest.json parsea', `dio ${man.status}`);
} else {
  ok('PWA', 'manifest.json parsea');
  for (const campo of ['name', 'short_name', 'start_url', 'scope', 'display', 'theme_color', 'background_color', 'description']) {
    manifest[campo] ? ok('PWA', `manifest.${campo}`) : mal('PWA', `manifest.${campo}`, 'ausente');
  }
  const tam = (manifest.icons ?? []).map((i) => i.sizes);
  tam.some((s) => s?.includes('192')) ? ok('PWA', 'icono 192') : mal('PWA', 'icono 192');
  tam.some((s) => s?.includes('512')) ? ok('PWA', 'icono 512') : mal('PWA', 'icono 512');
  (manifest.icons ?? []).some((i) => i.purpose?.includes('maskable'))
    ? ok('PWA', 'icono maskable') : mal('PWA', 'icono maskable');

  for (const icono of manifest.icons ?? []) {
    const r = await traer(icono.src, { method: 'HEAD' });
    r.status === 200 ? ok('PWA', `icono existe ${icono.src}`)
                     : mal('PWA', `icono existe ${icono.src}`, `dio ${r.status}`);
  }
}

const sw = await traer('/sw.js');
sw.status === 200 && /addEventListener\(['"]fetch/.test(sw.cuerpo)
  ? ok('PWA', 'service worker con handler de fetch')
  : mal('PWA', 'service worker con handler de fetch', `dio ${sw.status}`);

// ── 5. SEO y Open Graph ──────────────────────────────────────────────
const paginas = { '/': raiz, '/login': await traer('/login') };
for (const [ruta, p] of Object.entries(paginas)) {
  const meta = (re) => re.test(p.cuerpo);
  meta(/<title>[^<]{10,}<\/title>/) ? ok('SEO', `title en ${ruta}`) : mal('SEO', `title en ${ruta}`);
  meta(/name=["']description["'][^>]*content=["'][^"']{50,}/) ? ok('SEO', `description en ${ruta}`) : mal('SEO', `description en ${ruta}`);
  meta(/rel=["']canonical["']/) ? ok('SEO', `canonical en ${ruta}`) : mal('SEO', `canonical en ${ruta}`);
  meta(/<html[^>]*lang=/) ? ok('SEO', `lang en ${ruta}`) : mal('SEO', `lang en ${ruta}`);
  meta(/name=["']viewport["']/) ? ok('SEO', `viewport en ${ruta}`) : mal('SEO', `viewport en ${ruta}`);
  for (const og of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image']) {
    meta(new RegExp(`property=["']${og}["']`)) ? ok('OG', `${og} en ${ruta}`) : mal('OG', `${og} en ${ruta}`);
  }
  meta(/name=["']twitter:card["']/) ? ok('OG', `twitter:card en ${ruta}`) : mal('OG', `twitter:card en ${ruta}`);
}
const ogImg = await traer('/assets/img/og.png', { method: 'HEAD' });
ogImg.status === 200 ? ok('OG', 'la imagen social existe') : mal('OG', 'la imagen social existe', `dio ${ogImg.status}`);

// ── 6. Responsive ────────────────────────────────────────────────────
const css = await traer('/assets/css/app.css');
const cortes = (css.cuerpo.match(/@media[^{]*\((min|max)-width/g) ?? []).length;
cortes >= 2 ? ok('Responsive', `${cortes} breakpoints con @media`)
            : mal('Responsive', 'al menos 2 breakpoints', `encontrados ${cortes}`);

// ── 7. Portal privado ────────────────────────────────────────────────
const admin = await traer('/admin');
[301, 302, 303, 307, 308, 401, 403].includes(admin.status)
  ? ok('Privado', `/admin sin sesión no da 200 (${admin.status})`)
  : mal('Privado', '/admin sin sesión no da 200', `dio ${admin.status}`);

const FUGAS = ['screen-doctora', 'screen-expediente', 'guardarDiagnostico', 'cargarExpedientes', 'modal-diag'];
const fugaAdmin = FUGAS.filter((f) => admin.cuerpo.includes(f));
fugaAdmin.length === 0
  ? ok('Privado', '/admin no filtra marcado privado')
  : mal('Privado', '/admin no filtra marcado privado', fugaAdmin.join(', '));

const login = paginas['/login'];
const fugaLogin = FUGAS.filter((f) => login.cuerpo.includes(f));
fugaLogin.length === 0
  ? ok('Privado', 'el login no filtra marcado privado')
  : mal('Privado', 'el login no filtra marcado privado', fugaLogin.join(', '));

// ── 8. Healthcheck ───────────────────────────────────────────────────
const salud = await traer('/api/health');
const tipo = salud.headers.get('content-type') ?? '';
tipo.includes('application/json') ? ok('API', 'health devuelve JSON')
                                  : mal('API', 'health devuelve JSON', `content-type: ${tipo || 'ninguno'}`);
let cuerpoSalud = null;
try { cuerpoSalud = JSON.parse(salud.cuerpo); } catch { /* queda null */ }
if (cuerpoSalud) {
  ok('API', 'health parsea');
  cuerpoSalud.status ? ok('API', 'health trae status') : mal('API', 'health trae status');
  cuerpoSalud.timestamp ? ok('API', 'health trae timestamp') : mal('API', 'health trae timestamp');
  cuerpoSalud.checks ? ok('API', 'health trae checks') : mal('API', 'health trae checks');
  [200, 503].includes(salud.status) ? ok('API', `health responde ${salud.status}`)
                                    : mal('API', 'health responde 200 o 503', `dio ${salud.status}`);
} else {
  mal('API', 'health parsea', `dio ${salud.status}`);
}

// ── 9. Código de verificación ────────────────────────────────────────
const ver = await traer('/verificacion.txt');
if (ver.status !== 200) {
  mal('Entrega', 'verificacion.txt', `dio ${ver.status}`);
} else if (/^\s*PENDIENTE/.test(ver.cuerpo)) {
  mal('Entrega', 'código de verificación cargado', 'todavía dice PENDIENTE');
} else {
  ok('Entrega', 'código de verificación cargado');
}

// ── Informe ──────────────────────────────────────────────────────────
const grupos = [...new Set(resultados.map((r) => r.g))];
let fallos = 0;
for (const g of grupos) {
  console.log(`\n${g}`);
  for (const r of resultados.filter((x) => x.g === g)) {
    if (!r.bien) fallos++;
    console.log(`  ${r.bien ? '✓' : '✗'} ${r.n}${r.d ? '  — ' + r.d : ''}`);
  }
}
const total = resultados.length;
console.log(`\n${'─'.repeat(58)}`);
console.log(`${total - fallos}/${total} checks OK en ${BASE}`);
if (fallos) console.log(`${fallos} pendiente(s).`);
process.exit(fallos ? 1 : 0);
