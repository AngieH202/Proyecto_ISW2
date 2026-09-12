-- =====================================================================
-- Exporta el esquema REAL de la base a JSON
-- =====================================================================
-- Como usarlo:
--
--   1. Pegar todo esto en el editor SQL de Supabase y ejecutarlo.
--   2. Copiar el contenido de la unica celda del resultado.
--   3. Guardarlo tal cual en docs/db-export.json.
--
-- No inventa nada: lee los catalogos del sistema, cuenta las filas de
-- verdad con query_to_xml y arma el JSON con el formato pedido.
-- =====================================================================

with tablas as (
  select c.oid, c.relname as nombre
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
),

-- Conteo real de filas, tabla por tabla. query_to_xml permite armar la
-- consulta con el nombre de la tabla sin salir de SQL.
conteos as (
  select
    t.oid,
    t.nombre,
    (xpath(
      '/row/cnt/text()',
      query_to_xml(format('select count(*) as cnt from public.%I', t.nombre), false, true, '')
    ))[1]::text::bigint as filas
  from tablas t
),

columnas as (
  select
    a.attrelid as oid,
    jsonb_agg(
      jsonb_build_object(
        'nombre', a.attname,
        'tipo',   format_type(a.atttypid, a.atttypmod),
        'pk',     coalesce(pk.es_pk, false),
        'nulo',   not a.attnotnull
      )
      order by a.attnum
    ) as cols
  from pg_attribute a
  join tablas t on t.oid = a.attrelid
  left join (
    select conrelid, unnest(conkey) as attnum, true as es_pk
    from pg_constraint
    where contype = 'p'
  ) pk on pk.conrelid = a.attrelid and pk.attnum = a.attnum
  where a.attnum > 0
    and not a.attisdropped
  group by a.attrelid
),

indices as (
  select
    t.oid,
    coalesce(
      jsonb_agg(to_jsonb(i.indexname) order by i.indexname) filter (where i.indexname is not null),
      '[]'::jsonb
    ) as idx
  from tablas t
  left join pg_indexes i on i.schemaname = 'public' and i.tablename = t.nombre
  group by t.oid
),

relaciones as (
  select
    t.oid,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'columna',    att.attname,
          'referencia', ref.relname || '.' || refatt.attname
        )
      ) filter (where con.oid is not null),
      '[]'::jsonb
    ) as rels
  from tablas t
  left join pg_constraint con
    on con.conrelid = t.oid and con.contype = 'f'
  left join lateral unnest(con.conkey, con.confkey) as k(origen, destino) on true
  left join pg_attribute att
    on att.attrelid = con.conrelid and att.attnum = k.origen
  left join pg_class ref
    on ref.oid = con.confrelid
  left join pg_attribute refatt
    on refatt.attrelid = con.confrelid and refatt.attnum = k.destino
  group by t.oid
),

politicas as (
  select
    t.oid,
    coalesce(
      jsonb_agg(to_jsonb(p.policyname) order by p.policyname) filter (where p.policyname is not null),
      '[]'::jsonb
    ) as pols
  from tablas t
  left join pg_policies p on p.schemaname = 'public' and p.tablename = t.nombre
  group by t.oid
)

select jsonb_pretty(
  jsonb_build_object(
    'generado_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'motor',       'postgres',
    'tablas',      jsonb_agg(
                     jsonb_build_object(
                       'nombre',        c.nombre,
                       'filas',         c.filas,
                       'columnas',      col.cols,
                       'indices',       i.idx,
                       'relaciones',    r.rels,
                       'politicas_rls', p.pols
                     )
                     order by c.nombre
                   )
  )
) as db_export
from conteos c
join columnas   col on col.oid = c.oid
join indices    i   on i.oid   = c.oid
join relaciones r   on r.oid   = c.oid
join politicas  p   on p.oid   = c.oid;
