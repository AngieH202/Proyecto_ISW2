// Service worker de DentaAgenda.
//
// VERSION la reescribe scripts/versionar.mjs a partir del hash del
// contenido de los estaticos. Cambiarla renombra las caches, y activate
// borra las viejas: eso es todo el mecanismo de invalidacion tras un
// deploy.
const VERSION = 'ebf89ca3';

const CACHE_ESTATICOS = `dentaagenda-estaticos-${VERSION}`;
const CACHE_DATOS = `dentaagenda-datos-${VERSION}`;

const PRECARGA = [
  './',
  './index.html',
  './landing.html',
  './manifest.json',
  './assets/icono.svg',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/modules/config.js',
  './assets/js/modules/cache.js',
  './assets/js/modules/api.js',
  './assets/js/modules/utils.js',
  './assets/js/modules/auth.js',
  './assets/js/modules/patient.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_ESTATICOS);
    // addAll aborta entero si un archivo falla; se piden de a uno para
    // que un 404 suelto no deje la instalacion sin nada.
    await Promise.all(PRECARGA.map((u) => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const vivas = [CACHE_ESTATICOS, CACHE_DATOS];
    for (const n of await caches.keys()) {
      if (n.startsWith('dentaagenda-') && !vivas.includes(n)) await caches.delete(n);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Solo GET. Un POST o un PATCH nunca se cachean ni se reintentan solos:
  // repetir una escritura a espaldas del usuario es exactamente lo que el
  // trabajo de idempotencia trata de evitar.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // El login de la doctora nunca pasa por cache.
  if (url.pathname.includes('/auth/v1/')) return;

  // La aplicacion marca asi las lecturas de las que depende una escritura
  // (ver sbGet con cache:false en assets/js/modules/api.js). Dejarlas
  // pasar a la red es lo que impide que el service worker devuelva una
  // respuesta vieja y rompa la deduplicacion.
  if (req.cache === 'no-store' || req.cache === 'reload') return;

  // Datos de Supabase: red primero, cache como respaldo.
  //
  // No es stale-while-revalidate a proposito. Esta app lee las mismas
  // tablas que escribe, asi que servir datos viejos a alguien que si
  // tiene conexion mostraria horarios libres que ya no lo estan. Con red
  // se ve lo ultimo; sin red, lo ultimo que se vio.
  if (url.pathname.includes('/rest/v1/')) {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(CACHE_DATOS)).put(req, r.clone());
        return r;
      } catch (err) {
        const guardada = await caches.match(req);
        if (guardada) return guardada;
        return new Response(JSON.stringify([]), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
    return;
  }

  // Estaticos propios: cache primero, y si no esta, red guardando copia.
  // El versionado de VERSION es lo que evita servir una version vieja.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const guardada = await caches.match(req, { ignoreSearch: false });
      if (guardada) return guardada;
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(CACHE_ESTATICOS)).put(req, r.clone());
        return r;
      } catch (err) {
        // Navegacion sin red y sin copia exacta: se cae al index.
        if (req.mode === 'navigate') {
          const index = await caches.match('./index.html');
          if (index) return index;
        }
        throw err;
      }
    })());
  }
});
