-- =====================================================================
-- 002 - Tabla expedientes
-- =====================================================================
-- Ficha del paciente. Se crea sola la primera vez que alguien se
-- registra desde la pantalla de paciente (auth.js -> loginPaciente).
--
-- Debe correr antes que 004: visitas_clinicas la referencia por llave
-- foranea.
-- =====================================================================

create table if not exists public.expedientes (
  -- uuid, no un entero correlativo: el id viaja al cliente y termina
  -- incrustado en el HTML que arma renderExpedientes(), asi que conviene
  -- que no sea adivinable ni deje ver cuantos pacientes hay.
  id            uuid primary key default gen_random_uuid(),

  nombre        text        not null,

  -- El cliente busca por identidad exacta antes de insertar, asi que la
  -- unicidad es parte del contrato de la aplicacion, no solo una ayuda.
  identidad     text        not null unique,

  edad          integer,
  telefono      text,

  -- Contador denormalizado: hoy lo lleva la aplicacion sumando uno al
  -- guardar un diagnostico. El script 007 pasa esa tarea a la base.
  visitas       integer     default 0,

  -- Texto, no fecha: el cliente escribe el resultado de fechaHoy(), que
  -- es una cadena en espanol como "03 de septiembre de 2026", y para un
  -- expediente nuevo guarda un guion largo.
  ultima_visita text        default '—',

  notas         text        default 'Sin notas aún.',
  created_at    timestamptz default now()
);

-- ── Convergencia ─────────────────────────────────────────────────────
-- Ver la nota de 001: create table if not exists no alcanza una tabla
-- que ya existe. Las columnas se agregan anulables a proposito.
alter table public.expedientes
  add column if not exists nombre        text,
  add column if not exists identidad     text,
  add column if not exists edad          integer,
  add column if not exists telefono      text,
  add column if not exists visitas       integer     default 0,
  add column if not exists ultima_visita text        default '—',
  add column if not exists notas         text        default 'Sin notas aún.',
  add column if not exists created_at    timestamptz default now();

-- La unicidad de identidad es lo que sostiene el upsert de
-- loginPaciente: sin ella, PostgREST no tiene sobre que resolver el
-- conflicto y dos pestanas crean dos fichas del mismo paciente.
--
-- Una restriccion unique se implementa como un indice del mismo nombre,
-- asi que si la tabla ya la trae, este create la encuentra y no hace
-- nada.
create unique index if not exists expedientes_identidad_key
  on public.expedientes (identidad);

comment on table  public.expedientes               is 'Ficha de cada paciente de la clinica.';
comment on column public.expedientes.identidad     is 'Documento de identidad. Es la llave con la que el paciente consulta el estado de su cita.';
comment on column public.expedientes.visitas       is 'Contador denormalizado. Ver 007_sincronizar_visitas.sql.';
comment on column public.expedientes.ultima_visita is 'Cadena ya formateada para mostrar, no una fecha.';
