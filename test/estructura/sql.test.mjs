import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { RAIZ } from '../ayudas/dom.mjs';

const DIR = RAIZ + 'migracion/';
const archivos = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const leer = (f) => readFileSync(DIR + f, 'utf8');

describe('la secuencia está completa', () => {
  test('los scripts van numerados sin huecos', () => {
    const numeros = archivos.map((f) => Number(f.slice(0, 3)));
    for (let i = 0; i < numeros.length; i++) {
      assert.equal(numeros[i], i + 1, `falta el ${String(i + 1).padStart(3, '0')}`);
    }
  });

  test('cada uno explica qué hace en su cabecera', () => {
    for (const f of archivos) {
      assert.match(leer(f).slice(0, 400), /^-- =+\r?\n-- \d{3} - .+/m, `${f} sin cabecera`);
    }
  });
});

describe('idempotencia de los scripts', () => {
  test('las tablas usan create table if not exists', () => {
    for (const f of archivos) {
      const src = leer(f);
      const creaciones = src.match(/create table[^(]*/gi) ?? [];
      for (const c of creaciones) {
        assert.match(c, /if not exists/i, `${f}: ${c.trim()}`);
      }
    }
  });

  test('los índices usan create index if not exists', () => {
    for (const f of archivos) {
      const creaciones = leer(f).match(/create (unique )?index[^(]*/gi) ?? [];
      for (const c of creaciones) {
        assert.match(c, /if not exists/i, `${f}: ${c.trim()}`);
      }
    }
  });

  test('las funciones usan create or replace', () => {
    for (const f of archivos) {
      const creaciones = leer(f).match(/create[^;]{0,40}function/gi) ?? [];
      for (const c of creaciones) {
        assert.match(c, /or replace/i, `${f}: ${c.trim()}`);
      }
    }
  });

  test('las vistas usan create or replace', () => {
    for (const f of archivos) {
      const creaciones = leer(f).match(/create[^;]{0,20}view/gi) ?? [];
      for (const c of creaciones) {
        assert.match(c, /or replace/i, `${f}: ${c.trim()}`);
      }
    }
  });

  test('los triggers se borran antes de crearse', () => {
    for (const f of archivos) {
      if (!/create trigger/i.test(leer(f))) continue;
      assert.match(leer(f), /drop trigger if exists/i, `${f}: falta el drop`);
    }
  });

  test('las restricciones nombradas se borran antes de agregarse', () => {
    // Postgres no tiene add constraint if not exists: el par drop + add
    // es lo que permite re-ejecutar.
    for (const f of archivos) {
      const src = leer(f);
      const agregadas = [...src.matchAll(/add\s+constraint\s+(\w+)/gi)].map((m) => m[1]);
      for (const nombre of agregadas) {
        assert.ok(src.includes(`drop constraint if exists ${nombre}`),
          `${f}: ${nombre} se agrega sin borrarse antes`);
      }
    }
  });
});

describe('el esquema cubre lo que usa el código', () => {
  const columnas = (archivo, tabla) => {
    const src = leer(archivo);
    const i = src.indexOf(`create table if not exists public.${tabla}`);
    assert.ok(i > 0, `no se encontró ${tabla}`);
    const cuerpo = src.slice(i, src.indexOf(');', i));
    return [...cuerpo.matchAll(/^\s{2}(\w+)\s+\S/gm)].map((m) => m[1]);
  };

  const esperado = {
    '001_perfiles.sql': ['perfiles', ['id', 'nombre', 'rol', 'telefono', 'created_at']],
    '002_expedientes.sql': ['expedientes', ['id', 'nombre', 'identidad', 'edad', 'telefono', 'visitas', 'ultima_visita', 'notas']],
    '003_citas.sql': ['citas', ['id', 'nombre_paciente', 'identidad', 'telefono_paciente', 'hora', 'motivo', 'estado', 'fecha', 'created_at']],
    '004_visitas_clinicas.sql': ['visitas_clinicas', ['id', 'expediente_id', 'fecha', 'hora', 'diagnostico', 'tratamientos', 'medicamentos', 'plan', 'notas', 'created_at']]
  };

  for (const [archivo, [tabla, campos]] of Object.entries(esperado)) {
    test(`${tabla} tiene las columnas que el cliente lee o escribe`, () => {
      const reales = columnas(archivo, tabla);
      for (const c of campos) {
        assert.ok(reales.includes(c), `${tabla} no declara ${c}`);
      }
    });
  }
});

describe('011 cierra el acceso de anon', () => {
  const src = leer('011_rls_endurecido.sql');

  test('activa RLS en las cuatro tablas', () => {
    for (const t of ['perfiles', 'expedientes', 'citas', 'visitas_clinicas']) {
      assert.ok(src.includes(`alter table public.${t}         enable row level security`) ||
                src.includes(`alter table public.${t}      enable row level security`) ||
                src.includes(`alter table public.${t}            enable row level security`) ||
                src.includes(`alter table public.${t} enable row level security`),
        `falta enable row level security en ${t}`);
    }
  });

  test('revoca los permisos de tabla de anon', () => {
    for (const t of ['perfiles', 'expedientes', 'citas', 'visitas_clinicas']) {
      assert.match(src, new RegExp(`revoke all on public\\.${t}\\s+from anon`),
        `no revoca ${t} a anon`);
    }
  });

  test('define las cuatro funciones que el paciente necesita', () => {
    for (const fn of ['registrar_paciente', 'slots_ocupados', 'crear_solicitud', 'estado_de_mis_citas']) {
      assert.ok(src.includes(`function public.${fn}`), `falta ${fn}`);
    }
  });

  test('las funciones son security definer con search_path fijo', () => {
    // Sin search_path fijo, una función security definer se puede
    // secuestrar creando objetos en un esquema que venga antes.
    const definiciones = src.match(/security definer[\s\S]{0,80}/gi) ?? [];
    assert.equal(definiciones.length, 4, 'deberían ser cuatro');
    for (const d of definiciones) {
      assert.match(d, /set search_path\s*=\s*public/i);
    }
  });

  test('las funciones se conceden explícitamente a anon', () => {
    assert.match(src, /grant execute on function[\s\S]{0,60}to anon/i);
  });
});

describe('la semilla es idempotente', () => {
  const src = leer('009_datos_de_prueba.sql');

  test('los expedientes usan on conflict do nothing', () => {
    assert.match(src, /on conflict \(identidad\) do nothing/i);
  });

  test('las citas y las visitas llevan guard correlacionado', () => {
    // Un «select 1 from citas» global saltearía toda la siembra con que
    // existiera una sola fila.
    const guards = src.match(/where not exists \([\s\S]*?\)/gi) ?? [];
    assert.ok(guards.length >= 2, `sólo hay ${guards.length} guards`);
    for (const g of guards) {
      assert.match(g, /where\s+\w+\.\w+\s*=/i, 'el guard debería correlacionar, no ser global');
    }
  });

  test('ningún par fecha+hora se repite entre las citas no canceladas', () => {
    // Si se repitiera, la semilla chocaría contra el índice único de 006.
    const filas = [...src.matchAll(/\(\s*'[^']*',\s*'[^']*',\s*'[^']*',\s*(current_date[^,]*),\s*'([^']+)',\s*'[^']*',\s*'(\w+)'\)/g)];
    const activas = filas.filter((m) => m[3] !== 'cancelada');
    const pares = activas.map((m) => `${m[1].replace(/\s+/g, '')}|${m[2]}`);
    assert.equal(new Set(pares).size, pares.length, 'hay horarios repetidos en la semilla');
  });
});
