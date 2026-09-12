// Comprueba docs/db-export.json contra lo que exige el entregable, y de
// paso imprime los numeros que hay que declarar.
//
//   npm run verificar:esquema
//
// Se corre despues de exportar el esquema con scripts/exportar-esquema.sql.
// Sale con codigo 1 si algo no cumple: asi el numero que se declara sale
// del archivo y no de la memoria.

import { readFileSync } from 'node:fs';

const RUTA = 'docs/db-export.json';
const DIAS_MAXIMO = 45;

let db;
try {
  db = JSON.parse(readFileSync(RUTA, 'utf8'));
} catch (e) {
  console.error(`No se pudo leer ${RUTA}: ${e.message}`);
  console.error('Generalo con scripts/exportar-esquema.sql en el editor SQL de Supabase.');
  process.exit(1);
}

const tablas = db.tablas ?? [];
let fallos = 0;

const ok  = (t, d = '') => console.log(`  OK    ${t}${d ? '  — ' + d : ''}`);
const mal = (t, d = '') => { fallos++; console.log(`  FALLA ${t}${d ? '  — ' + d : ''}`); };

const comprobar = (condicion, titulo, detalle) => (condicion ? ok : mal)(titulo, detalle);

// ── Las exigencias, una por una ──────────────────────────────────────
console.log(`\nEsquema declarado en ${RUTA}\n`);

comprobar(tablas.length >= 5, 'Al menos 5 tablas', `hay ${tablas.length}`);

const sinPk = tablas.filter((t) => !(t.columnas ?? []).some((c) => c.pk));
comprobar(sinPk.length === 0, 'Todas las tablas con llave primaria',
  sinPk.length ? `sin PK: ${sinPk.map((t) => t.nombre).join(', ')}` : `las ${tablas.length} la tienen`);

const relaciones = tablas.flatMap((t) => (t.relaciones ?? []).map((r) => `${t.nombre}.${r.columna} -> ${r.referencia}`));
comprobar(relaciones.length >= 2, 'Al menos 2 relaciones entre tablas', `hay ${relaciones.length}`);

const indices = tablas.flatMap((t) => t.indices ?? []);
comprobar(indices.length >= 1, 'Al menos 1 indice', `hay ${indices.length}`);

const conDatos = tablas.filter((t) => Number(t.filas) > 0);
comprobar(conDatos.length >= 3, 'Al menos 3 tablas con datos reales',
  `con filas: ${conDatos.map((t) => `${t.nombre} (${t.filas})`).join(', ') || 'ninguna'}`);

const conRls = tablas.filter((t) => (t.politicas_rls ?? []).length > 0);
comprobar(conRls.length >= 2, 'Politicas de acceso en al menos 2 tablas',
  `${conRls.length}: ${conRls.map((t) => t.nombre).join(', ')}`);

const generado = new Date(db.generado_at);
const dias = Math.floor((Date.now() - generado.getTime()) / 86_400_000);
comprobar(!Number.isNaN(dias) && dias <= DIAS_MAXIMO, `Export de los ultimos ${DIAS_MAXIMO} dias`,
  Number.isNaN(dias) ? `generado_at invalido: ${db.generado_at}` : `generado hace ${dias} dia(s)`);

comprobar(db.motor === 'postgres', 'Motor declarado', String(db.motor));

// ── Lo que hay que declarar en el formulario ─────────────────────────
const conMasFilas = [...tablas].sort((a, b) => Number(b.filas) - Number(a.filas))[0];

console.log('\nPara copiar en el formulario:\n');
console.log(`  Cuantas tablas tiene tu base de datos ....... ${tablas.length}`);
console.log(`  Cuantas relaciones (llaves foraneas) ........ ${relaciones.length}`);
console.log(`  Tabla con mas filas ......................... ${conMasFilas?.nombre ?? '—'} (${conMasFilas?.filas ?? 0} filas)`);

console.log('\nDetalle de las tablas:\n');
for (const t of [...tablas].sort((a, b) => Number(b.filas) - Number(a.filas))) {
  const pk = (t.columnas ?? []).filter((c) => c.pk).map((c) => c.nombre).join(', ') || 'sin PK';
  console.log(`  ${t.nombre.padEnd(20)} ${String(t.filas).padStart(5)} filas   pk: ${pk}`);
}

if (relaciones.length) {
  console.log('\nRelaciones:\n');
  for (const r of relaciones) console.log(`  ${r}`);
}

console.log('');
if (fallos) {
  console.error(`${fallos} comprobacion(es) sin cumplir.`);
  process.exit(1);
}
console.log('Todo cumple.');
