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

comment on table  public.visitas_clinicas              is 'Historial clinico: una fila por visita atendida.';
comment on column public.visitas_clinicas.fecha        is 'Cadena ya formateada para mostrar. Para ordenar se usa created_at.';
comment on column public.visitas_clinicas.tratamientos is 'Lista separada por comas; la vista la parte para dibujar los chips.';
