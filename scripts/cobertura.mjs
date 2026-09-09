// Genera el reporte de cobertura de los tests.
//
//   npm run cobertura
//
// Deja dos archivos en coverage/, que van versionados porque el
// entregable se lee directo del repo:
//
//   lcov.info              lo que consume SonarCloud
//   coverage-summary.json  formato Istanbul, el resumen legible
//
// Sale con codigo 1 si la cobertura de lineas baja del minimo, asi que
// sirve igual como comprobacion y no solo como informe.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const MINIMO_LINEAS = 60;
const SALIDA = 'coverage';
const LCOV = `${SALIDA}/lcov.info`;

mkdirSync(SALIDA, { recursive: true });

// Solo se mide el codigo de la aplicacion. Incluir los propios tests
// inflaria el numero sin decir nada: se ejecutan enteros por definicion.
const { status } = spawnSync(process.execPath, [
  '--test',
  '--experimental-test-coverage',
  '--test-coverage-include=assets/js/**',
  '--test-reporter=lcov',
  `--test-reporter-destination=${LCOV}`,
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
  'test/unidad/*.test.mjs',
  'test/integracion/*.test.mjs'
], { stdio: 'inherit' });

if (status !== 0) {
  console.error('\nHay tests fallando: no se genera el reporte.');
  process.exit(status ?? 1);
}

// ── lcov -> resumen Istanbul ──────────────────────────────────────────
// lcov trae, por archivo: LF/LH lineas, FNF/FNH funciones, BRF/BRH ramas.
const vacio = () => ({ total: 0, covered: 0, skipped: 0, pct: 0 });
const porcentaje = (c, t) => (t === 0 ? 100 : Math.round((c / t) * 10000) / 100);

const resumen = {};
const acumulado = { lines: vacio(), functions: vacio(), branches: vacio() };
let archivo = null;

for (const linea of readFileSync(LCOV, 'utf8').split('\n')) {
  const [etiqueta, valor] = linea.trim().split(':');

  if (etiqueta === 'SF') {
    // Ruta relativa al proyecto y con barras normales: el reporte se lee
    // igual en Windows que en el runner de Linux.
    const ruta = relative(process.cwd(), resolve(valor)).replaceAll('\\', '/');
    archivo = ruta;
    resumen[ruta] = { lines: vacio(), functions: vacio(), branches: vacio() };
    continue;
  }
  if (!archivo) continue;

  const n = Number(valor);
  const campos = {
    LF: ['lines', 'total'], LH: ['lines', 'covered'],
    FNF: ['functions', 'total'], FNH: ['functions', 'covered'],
    BRF: ['branches', 'total'], BRH: ['branches', 'covered']
  }[etiqueta];

  if (campos) {
    const [metrica, campo] = campos;
    resumen[archivo][metrica][campo] = n;
    acumulado[metrica][campo] += n;
  }
  if (etiqueta === 'end_of_record') archivo = null;
}

for (const metricas of [...Object.values(resumen), acumulado]) {
  for (const m of Object.values(metricas)) m.pct = porcentaje(m.covered, m.total);
}

// lcov no distingue sentencias de lineas; el resumen las declara iguales
// en vez de inventar un numero.
const conSentencias = (m) => ({ ...m, statements: m.lines });

writeFileSync(
  `${SALIDA}/coverage-summary.json`,
  JSON.stringify(
    { total: conSentencias(acumulado), ...Object.fromEntries(Object.entries(resumen).map(([k, v]) => [k, conSentencias(v)])) },
    null,
    2
  ) + '\n'
);

const { lines, functions, branches } = acumulado;
console.log(`\nCobertura   lineas ${lines.pct}%  (${lines.covered}/${lines.total})`);
console.log(`            funciones ${functions.pct}%  ramas ${branches.pct}%`);
console.log(`Reportes    ${LCOV} y ${SALIDA}/coverage-summary.json`);

if (lines.pct < MINIMO_LINEAS) {
  console.error(`\nLa cobertura de lineas (${lines.pct}%) esta por debajo del minimo de ${MINIMO_LINEAS}%.`);
  process.exit(1);
}
