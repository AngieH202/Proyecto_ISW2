import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { RAIZ } from '../ayudas/dom.mjs';

const leer = (r) => readFileSync(RAIZ + r, 'utf8');
const existe = (r) => existsSync(RAIZ + r);

describe('manifest', () => {
  const manifest = JSON.parse(leer('manifest.json'));

  for (const campo of ['name', 'short_name', 'description', 'start_url',
                       'scope', 'display', 'theme_color', 'background_color', 'lang']) {
    test(`declara ${campo}`, () => {
      assert.ok(manifest[campo], `falta ${campo}`);
    });
  }

  test('tiene icono de 192 y de 512', () => {
    const tam = manifest.icons.map((i) => i.sizes);
    assert.ok(tam.some((s) => s.includes('192')));
    assert.ok(tam.some((s) => s.includes('512')));
  });

  test('tiene un icono maskable', () => {
    // Sin él, Android recorta el icono sobre el propio dibujo.
    assert.ok(manifest.icons.some((i) => i.purpose?.includes('maskable')));
  });

  test('todos los iconos existen en el repo', () => {
    for (const icono of manifest.icons) {
      assert.ok(existe(icono.src), `falta ${icono.src}`);
    }
  });

  test('start_url apunta a la ruta del login', () => {
    assert.equal(manifest.start_url, '/login');
  });
});

describe('iconos PNG', () => {
  const png = (r) => readFileSync(RAIZ + r);

  const esperados = [
    ['assets/icono-192.png', 192],
    ['assets/icono-512.png', 512],
    ['assets/icono-512-maskable.png', 512],
    ['assets/img/og.png', 1200]
  ];

  for (const [ruta, ancho] of esperados) {
    test(`${ruta} es un PNG de ${ancho}px de ancho`, () => {
      const b = png(ruta);
      assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'firma PNG inválida');
      assert.equal(b.readUInt32BE(16), ancho);
    });
  }

  test('la imagen social mide 1200x630', () => {
    // Es la proporción que esperan Open Graph y Twitter.
    const b = png('assets/img/og.png');
    assert.equal(b.readUInt32BE(16), 1200);
    assert.equal(b.readUInt32BE(20), 630);
  });
});

describe('service worker', () => {
  const sw = leer('sw.js');

  test('escucha install, activate y fetch', () => {
    for (const ev of ['install', 'activate', 'fetch']) {
      assert.ok(sw.includes(`addEventListener('${ev}'`), `falta ${ev}`);
    }
  });

  test('todo lo que precarga existe', () => {
    const precarga = sw.match(/const PRECARGA = \[([\s\S]*?)\];/)[1];
    const rutas = [...precarga.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
    for (const r of rutas) {
      // '/login' es una reescritura de Vercel, no un archivo.
      if (r === 'login') continue;
      assert.ok(existe(r), `precarga ${r}, que no existe`);
    }
  });

  test('la versión de las cachés la sella versionar.mjs', () => {
    assert.match(sw, /const VERSION = '[0-9a-f]{8}'/,
      'debería tener el hash, no «dev»');
  });
});

describe('SEO y Open Graph', () => {
  for (const pagina of ['index.html', 'landing.html']) {
    const html = leer(pagina);

    test(`${pagina} declara description`, () => {
      assert.match(html, /name="description" content="[^"]{50,}"/);
    });

    test(`${pagina} declara canonical`, () => {
      assert.match(html, /rel="canonical"/);
    });

    for (const og of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image']) {
      test(`${pagina} declara ${og}`, () => {
        assert.ok(html.includes(`property="${og}"`), `falta ${og}`);
      });
    }

    test(`${pagina} declara twitter:card`, () => {
      assert.ok(html.includes('name="twitter:card"'));
    });

    test(`${pagina} publica el código de verificación`, () => {
      assert.match(html, /name="verificacion" content="LEARN-CAP-[A-Z0-9]+"/);
    });
  }
});

describe('responsive', () => {
  test('app.css tiene al menos tres breakpoints', () => {
    const css = leer('assets/css/app.css');
    const cortes = css.match(/@media[^{]*\((min|max)-width/g) ?? [];
    assert.ok(cortes.length >= 3, `sólo hay ${cortes.length}`);
  });

  test('respeta prefers-reduced-motion', () => {
    assert.match(leer('assets/css/app.css'), /prefers-reduced-motion/);
  });

  test('el foco de teclado es visible', () => {
    assert.match(leer('assets/css/app.css'), /:focus-visible/);
  });
});

describe('archivos de sitio', () => {
  test('robots.txt declara el sitemap y bloquea el portal', () => {
    const robots = leer('robots.txt');
    assert.match(robots, /Sitemap:\s*https:/);
    assert.match(robots, /Disallow:\s*\/admin/);
  });

  test('el sitemap usa el namespace correcto', () => {
    assert.ok(leer('sitemap.xml').includes('http://www.sitemaps.org/schemas/sitemap/0.9'));
  });

  test('el sitemap no lista el portal privado', () => {
    assert.ok(!leer('sitemap.xml').includes('/admin'));
  });

  test('la 404 lleva la marca del sitio', () => {
    assert.ok(leer('404.html').includes('DentaAgenda'));
  });

  test('verificacion.txt tiene el código solo en la primera línea', () => {
    const primera = leer('verificacion.txt').split(/\r?\n/)[0].trim();
    assert.match(primera, /^LEARN-CAP-[A-Z0-9]+$/);
  });
});

describe('headers de seguridad', () => {
  const vercel = JSON.parse(leer('vercel.json'));
  const globales = vercel.headers.find((h) => h.source === '/(.*)').headers;
  const nombres = globales.map((h) => h.key);

  for (const h of ['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options',
                   'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security']) {
    test(`declara ${h}`, () => {
      assert.ok(nombres.includes(h), `falta ${h}`);
    });
  }

  test('la CSP permite hablar con Supabase', () => {
    const csp = globales.find((h) => h.key === 'Content-Security-Policy').value;
    assert.match(csp, /connect-src[^;]*supabase\.co/);
  });

  test('la CSP prohíbe que el sitio se meta en un iframe', () => {
    const csp = globales.find((h) => h.key === 'Content-Security-Policy').value;
    assert.match(csp, /frame-ancestors 'none'/);
  });

  test('/admin está reescrito a la función', () => {
    assert.ok(vercel.rewrites.some((r) => r.source === '/admin' && r.destination === '/api/admin'));
  });

  test('/login sirve el index', () => {
    assert.ok(vercel.rewrites.some((r) => r.source === '/login'));
  });
});
