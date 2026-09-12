-- =====================================================================
-- 013 - Catalogo de horarios y las relaciones que faltaban
-- =====================================================================
-- Dos cosas que el modelo venia debiendo, y que estaban anotadas como
-- deuda tecnica en docs/arquitectura.md:
--
-- 1. Los horarios de atencion vivian solamente en una constante del
--    navegador (SLOTS_BASE, en assets/js/modules/config.js). La clinica
--    no podia cambiar sus horarios sin tocar codigo, y la base aceptaba
--    cualquier texto en citas.hora: un '25:00 XM' entraba sin chistar.
--
-- 2. citas y expedientes no tenian llave foranea. El cruce se hacia
--    comparando nombre_paciente contra nombre, como texto: dos pacientes
--    homonimos compartian expediente y un nombre escrito distinto no
--    encontraba ninguno.
--
-- Re-ejecutable: todo va con if not exists, y las constraints se
-- rehacen. El relleno de datos usa on conflict do nothing.
-- =====================================================================

-- ── 1. El catalogo de horarios ───────────────────────────────────────
create table if not exists public.horarios (
  id         smallint generated always as identity primary key,

  -- El texto tal como lo escribe y lo lee la aplicacion: '9:15 AM'.
  -- Es la clave natural, y por eso unica: citas.hora la referencia.
  etiqueta   text     not null unique,

  -- Para ordenarlos sin tener que parsear la etiqueta.
  orden      smallint not null,

  -- Un horario que se deja de atender se desactiva, no se borra: las
  -- citas viejas que lo usaron tienen que seguir siendo validas.
  activo     boolean  not null default true,

  created_at timestamptz default now()
);

comment on table  public.horarios          is 'Horarios de atencion de la clinica. Antes vivian en una constante del navegador.';
comment on column public.horarios.etiqueta is 'Texto exacto que usa la aplicacion, por ejemplo 9:15 AM. Lo referencia citas.hora.';
comment on column public.horarios.activo   is 'Un horario retirado se desactiva; borrarlo invalidaria las citas que ya lo usaron.';

-- Los nueve slots de la clinica, en el orden en que se muestran.
insert into public.horarios (etiqueta, orden) values
  ('7:00 AM', 1), ('7:45 AM', 2), ('8:30 AM', 3), ('9:15 AM', 4),
  ('10:00 AM', 5), ('10:45 AM', 6), ('11:30 AM', 7), ('12:15 PM', 8),
  ('2:00 PM', 9)
on conflict (etiqueta) do nothing;

-- Cualquier hora que ya exista en citas y no este en el catalogo entra
-- tambien, desactivada. Sin esto la llave foranea de mas abajo no se
-- puede aplicar sobre una base con datos.
insert into public.horarios (etiqueta, orden, activo)
select distinct c.hora, 99, false
from public.citas c
where c.hora is not null
  and not exists (select 1 from public.horarios h where h.etiqueta = c.hora)
on conflict (etiqueta) do nothing;


-- ── 2. citas.hora referencia el catalogo ─────────────────────────────
alter table public.citas drop constraint if exists citas_hora_fk;
alter table public.citas add  constraint citas_hora_fk
  foreign key (hora) references public.horarios (etiqueta)
  on update cascade;

comment on constraint citas_hora_fk on public.citas is
  'La hora de una cita tiene que existir en el catalogo. Antes se aceptaba cualquier texto.';


-- ── 3. citas.expediente_id: la relacion que faltaba ──────────────────
alter table public.citas
  add column if not exists expediente_id uuid;

-- Relleno por identidad, que es la clave fiable.
update public.citas c
set expediente_id = e.id
from public.expedientes e
where c.expediente_id is null
  and c.identidad is not null
  and c.identidad = e.identidad;

-- Y por nombre para las citas viejas, que se crearon antes de que el
-- cliente guardara identidad. Solo cuando el nombre identifica a una
-- sola persona: si hay homonimos, se deja en null antes que adivinar
-- mal y mezclar dos historiales clinicos.
update public.citas c
set expediente_id = e.id
from public.expedientes e
where c.expediente_id is null
  and c.identidad is null
  and c.nombre_paciente = e.nombre
  and (select count(*) from public.expedientes x where x.nombre = c.nombre_paciente) = 1;

alter table public.citas drop constraint if exists citas_expediente_fk;
alter table public.citas add  constraint citas_expediente_fk
  foreign key (expediente_id) references public.expedientes (id)
  on delete set null;

comment on column public.citas.expediente_id is
  'Expediente del paciente. Nulo solo en citas viejas cuyo nombre no identifica a una sola persona.';

create index if not exists citas_expediente_idx
  on public.citas (expediente_id);


-- ── 4. Politicas de acceso del catalogo ──────────────────────────────
-- Los horarios de atencion no son un dato privado: el paciente necesita
-- verlos para poder elegir. Escribirlos, en cambio, es cosa de la
-- doctora.
alter table public.horarios enable row level security;

drop policy if exists horarios_lectura  on public.horarios;
drop policy if exists horarios_doctora  on public.horarios;

create policy horarios_lectura on public.horarios
  for select to anon, authenticated using (true);

create policy horarios_doctora on public.horarios
  for all to authenticated using (true) with check (true);

grant select on public.horarios to anon, authenticated;
grant insert, update, delete on public.horarios to authenticated;


-- ── Comprobacion ─────────────────────────────────────────────────────
-- Las cinco tablas, cada una con su llave primaria:
--
--   select c.relname,
--          exists (select 1 from pg_constraint k
--                  where k.conrelid = c.oid and k.contype = 'p') as tiene_pk
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'r'
--   order by 1;
--
-- Las tres llaves foraneas:
--
--   select conname, conrelid::regclass as tabla, confrelid::regclass as referencia
--   from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace;
--
-- Citas que quedaron sin expediente (homonimos o pacientes borrados):
--
--   select id, nombre_paciente, fecha, hora from public.citas
--   where expediente_id is null;
