// Genera los PNG que el manifest y las meta de Open Graph necesitan.
//
//   node scripts/generar-imagenes.mjs
//
// Escribe los PNG a mano: cabecera, IHDR, IDAT comprimido con el zlib de
// Node y IEND. Sin dependencias, que es la regla del proyecto.
//
// Es idempotente: si el archivo ya existe con el mismo contenido, no lo
// vuelve a escribir.

import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── PNG ──────────────────────────────────────────────────────────────
function crc32(buf) {
  let c, tabla = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = tabla[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

// pixeles: Uint8Array RGBA de ancho*alto*4
function png(ancho, alto, pixeles) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 6;   // RGBA
  // 10, 11, 12 quedan en 0: deflate, filtro adaptativo, sin entrelazado

  // Cada fila lleva delante su byte de filtro; 0 = sin filtro.
  const crudo = Buffer.alloc(alto * (ancho * 4 + 1));
  for (let y = 0; y < alto; y++) {
    const destino = y * (ancho * 4 + 1);
    crudo[destino] = 0;
    pixeles.copy
      ? pixeles.copy(crudo, destino + 1, y * ancho * 4, (y + 1) * ancho * 4)
      : Buffer.from(pixeles.subarray(y * ancho * 4, (y + 1) * ancho * 4)).copy(crudo, destino + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(crudo, { level: 9 })),
    trozo('IEND', Buffer.alloc(0))
  ]);
}

// ── Dibujo ───────────────────────────────────────────────────────────
// Paleta de la marca, la misma de assets/css/app.css.
const AZUL = [0x00, 0x77, 0xb6];
const CIAN = [0x00, 0xb4, 0xd8];
const BLANCO = [0xff, 0xff, 0xff];

const mezclar = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// Silueta de diente: dos lobulos arriba y dos raices abajo. Se resuelve
// con distancias a circulos y una interpolacion, en vez de rasterizar el
// trazo SVG -- a mano es fragil y a este tamano no se nota la diferencia.
function dentroDelDiente(x, y) {
  // x, y normalizados a [-1, 1]
  const lobuloIzq = Math.hypot((x + 0.42) / 0.62, (y + 0.34) / 0.60) < 1;
  const lobuloDer = Math.hypot((x - 0.42) / 0.62, (y + 0.34) / 0.60) < 1;
  const cuerpo = Math.hypot(x / 0.86, (y + 0.10) / 0.78) < 1;

  if (!(lobuloIzq || lobuloDer || cuerpo)) return false;

  // Muesca entre las dos raices: se abre a medida que baja.
  if (y > 0.18) {
    const apertura = 0.20 * ((y - 0.18) / 0.82);
    if (Math.abs(x) < apertura) return false;
  }
  // No hace falta afinar los costados a mano: la elipse del cuerpo ya
  // lo hace. Una regla extra ahi cortaba en seco donde la elipse aun era
  // mas ancha, y dejaba dos escalones visibles a media altura.
  return true;
}

function dibujar(lado, escalaDiente, radioEsquina) {
  const px = Buffer.alloc(lado * lado * 4);
  const r = radioEsquina * lado;

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const i = (y * lado + x) * 4;

      // Esquinas redondeadas: fuera del radio, transparente.
      let dentro = true;
      if (r > 0) {
        const cx = Math.min(Math.max(x, r), lado - r);
        const cy = Math.min(Math.max(y, r), lado - r);
        if (Math.hypot(x - cx, y - cy) > r) dentro = false;
      }
      if (!dentro) { px[i + 3] = 0; continue; }

      // Degradado diagonal azul -> cian.
      const t = (x / lado + y / lado) / 2;
      let [rr, gg, bb] = mezclar(AZUL, CIAN, t);

      // Diente centrado.
      const nx = (x - lado / 2) / (lado / 2) / escalaDiente;
      const ny = (y - lado / 2) / (lado / 2) / escalaDiente;
      if (Math.abs(nx) <= 1.2 && Math.abs(ny) <= 1.2 && dentroDelDiente(nx, ny)) {
        [rr, gg, bb] = BLANCO;
      }

      px[i] = rr; px[i + 1] = gg; px[i + 2] = bb; px[i + 3] = 255;
    }
  }
  return png(lado, lado, px);
}

// Imagen social 1200x630: degradado, el diente a la izquierda y una
// banda mas clara abajo para que el texto del recorte no compita.
function dibujarOg() {
  const A = 1200, H = 630;
  const px = Buffer.alloc(A * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < A; x++) {
      const i = (y * A + x) * 4;
      const t = (x / A) * 0.75 + (y / H) * 0.25;
      let [rr, gg, bb] = mezclar(AZUL, CIAN, t);

      const nx = (x - 300) / 190;
      const ny = (y - H / 2) / 190;
      if (Math.abs(nx) <= 1.2 && Math.abs(ny) <= 1.2 && dentroDelDiente(nx, ny)) {
        [rr, gg, bb] = BLANCO;
      }
      px[i] = rr; px[i + 1] = gg; px[i + 2] = bb; px[i + 3] = 255;
    }
  }
  return png(A, H, px);
}

// ── Escritura ────────────────────────────────────────────────────────
function escribir(ruta, buffer) {
  const p = join(raiz, ruta);
  mkdirSync(dirname(p), { recursive: true });
  const nuevo = createHash('sha256').update(buffer).digest('hex');
  if (existsSync(p)) {
    const viejo = createHash('sha256').update(readFileSync(p)).digest('hex');
    if (viejo === nuevo) { console.log(`  sin cambios  ${ruta}`); return 0; }
  }
  writeFileSync(p, buffer);
  console.log(`  escrito      ${ruta}  (${(buffer.length / 1024).toFixed(1)} kB)`);
  return 1;
}

let n = 0;
n += escribir('assets/icono-192.png', dibujar(192, 0.62, 0.22));
n += escribir('assets/icono-512.png', dibujar(512, 0.62, 0.22));
// Maskable: el diente mas chico, sin esquinas, para sobrevivir el recorte.
n += escribir('assets/icono-512-maskable.png', dibujar(512, 0.45, 0));
n += escribir('assets/img/og.png', dibujarOg());

console.log(n ? `\n${n} imagen(es) generadas.` : '\nTodo estaba al dia.');
