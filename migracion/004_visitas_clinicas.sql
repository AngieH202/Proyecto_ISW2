-- =====================================================================
-- 004 - Tabla visitas_clinicas
-- =====================================================================
-- Historial clinico. La doctora registra una fila cada vez que marca una
-- cita como atendida y llena el modal de diagnostico
-- (app.js -> guardarDiagnostico).
--
-- Depende de 002: referencia expedientes(id), que es uuid.
-- =====================================================================

create table if not exists public.visitas_clinicas (
  id            uuid primary key default gen_random_uuid(),

  expediente_id uuid
                constraint visitas_clinicas_expediente_fk
                references public.expedientes (id)
                on delete cascade,

  -- Igual que expedientes.ultima_visita: son cadenas ya formateadas por
  -- fechaHoy() y horaAhora(), no valores temporales. Para ordenar el
  -- historial la aplicacion usa created_at, no estas dos columnas.
  fecha         text,
  hora          text,

  diagnostico   text,

  -- Lista separada por comas armada desde los botones de tratamiento
  -- mas el campo libre "Otro tratamiento".
  tratamientos  text,

  medicamentos  text,
  plan          text,
  notas         text,

  created_at    timestamptz default now()
);

-- ── Convergencia ─────────────────────────────────────────────────────
-- Ver la nota de 001.
alter table public.visitas_clinicas
  add column if not exists expediente_id uuid,
  add column if not exists fecha         text,
  add column if not exists hora          text,
  add column if not exists diagnostico   text,
  add column if not exists tratamientos  text,
  add column if not exists medicamentos  text,
  add column if not exists plan          text,
  add column if not exists notas         text,
  add column if not exists created_at    timestamptz default now();

-- La llave foranea tampoco tiene add ... if not exists. El drop + add
-- es idempotente; sobre esta tabla el revalidado es barato.
alter table public.visitas_clinicas
  drop constraint if exists visitas_clinicas_expediente_fk;
alter table public.visitas_clinicas
  add  constraint visitas_clinicas_expediente_fk
  foreign key (expediente_id) references public.expedientes (id) on delete cascade;

comment on table  public.visitas_clinicas              is 'Historial clinico: una fila por visita atendida.';
comment on column public.visitas_clinicas.fecha        is 'Cadena ya formateada para mostrar. Para ordenar se usa created_at.';
comment on column public.visitas_clinicas.tratamientos is 'Lista separada por comas; la vista la parte para dibujar los chips.';
