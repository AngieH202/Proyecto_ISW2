// Sella los estaticos con el hash de su contenido.
//
//   node scripts/versionar.mjs
//
// Reescribe el ?v= de index.html y la VERSION de sw.js con un hash
// calculado sobre el CSS y todo el JS. Correrlo antes de publicar es lo
// que evita que un navegador siga sirviendo la version anterior.
//
// Es idempotente: si nada cambio, no toca ningun archivo y lo dice.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (r) => join(raiz, r);

// El hash sale del contenido que el navegador realmente descarga.
// index.html queda fuera a proposito: es donde se escribe el hash, y
// meterlo se muerde la cola.
const SELLADOS = [
  'assets/css/app.css',
  'assets/js/app.js',
  'assets/js/modules/config.js',
  'assets/js/modules/cache.js',
  'assets/js/modules/api.js',
  'assets/js/modules/utils.js',
  'assets/js/modules/auth.js',
  'assets/js/modules/patient.js'
];

const suma = createHash('sha256');
for (const r of SELLADOS) suma.update(readFileSync(ruta(r)));
const version = suma.digest('hex').slice(0, 8);

let cambios = 0;

function reescribir(archivo, patron, reemplazo) {
  const p = ruta(archivo);
  const antes = readFileSync(p, 'utf8');
  const despues = antes.replace(patron, reemplazo);
  if (antes === despues) return false;
  writeFileSync(p, despues);
  cambios++;
  console.log(`  actualizado  ${archivo}`);
  return true;
}

// ?v=<lo que sea> en el link del CSS y en el script de entrada.
reescribir('index.html', /(assets\/css\/app\.css\?v=)[^"']*/g, `$1${version}`);
reescribir('index.html', /(assets\/js\/app\.js\?v=)[^"']*/g, `$1${version}`);

// La VERSION del service worker nombra sus caches; cambiarla hace que
// activate borre las viejas.
reescribir('sw.js', /(const VERSION = ')[^']*(')/, `$1${version}$2`);

console.log(`\nversion: ${version}`);
console.log(cambios ? `${cambios} archivo(s) modificados.` : 'Ya estaba al dia, no se toco nada.');
