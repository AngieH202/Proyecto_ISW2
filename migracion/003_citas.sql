-- =====================================================================
-- 003 - Tabla citas
-- =====================================================================
-- Solicitudes de cita y su estado. Las crea el paciente desde el paso 3
-- del flujo (patient.js -> enviarSolicitud) y la doctora las mueve de
-- estado desde su panel.
-- =====================================================================

create table if not exists public.citas (
  -- Entero correlativo, a diferencia de expedientes: la cita no es un
  -- dato sensible y el id aparece en los onclick que genera cargarCitas.
  id                bigint generated always as identity primary key,

  nombre_paciente   text        not null,

  -- Columna presente pero sin usar: enviarSolicitud() todavia no la
  -- manda. Es el camino para dejar de cruzar citas y expedientes por
  -- nombre, que es la deuda registrada en arquitectura.md. Ver la nota
  -- al final de este archivo.
  identidad         text,

  telefono_paciente text,

  -- Texto a proposito: guarda la etiqueta del slot, por ejemplo
  -- '9:15 AM'. Los horarios validos estan en config.js -> SLOTS_BASE.
  hora              text        not null,

  motivo            text,

  estado            text        not null default 'pendiente'
                    constraint citas_estado_valido
                    check (estado in ('pendiente','confirmada','atendida','cancelada','nopresento')),

  -- Tipo date, no text: el cliente solo escribe y consulta en formato
  -- ISO (patient.js -> formatoFechaKey) y PostgREST devuelve la columna
  -- como 'YYYY-MM-DD', que es exactamente lo que la vista espera.
  fecha             date,

  created_at        timestamptz default now()
);

-- ── Convergencia ─────────────────────────────────────────────────────
-- Ver la nota de 001. identidad es la que suele faltar en una base
-- creada antes de que existiera esa columna.
alter table public.citas
  add column if not exists nombre_paciente   text,
  add column if not exists identidad         text,
  add column if not exists telefono_paciente text,
  add column if not exists hora              text,
  add column if not exists motivo            text,
  add column if not exists estado            text        default 'pendiente',
  add column if not exists fecha             date,
  add column if not exists created_at        timestamptz default now();

alter table public.citas drop constraint if exists citas_estado_valido;
alter table public.citas add  constraint citas_estado_valido
  check (estado in ('pendiente','confirmada','atendida','cancelada','nopresento'));

comment on table  public.citas           is 'Solicitudes de cita y su estado.';
comment on column public.citas.identidad is 'Identidad del paciente. Reservada: el cliente todavia no la escribe.';
comment on column public.citas.hora      is 'Etiqueta del slot, no una hora real. Ver SLOTS_BASE en assets/js/modules/config.js.';
comment on column public.citas.estado    is 'pendiente | confirmada | atendida | cancelada | nopresento.';

-- ── Sobre la columna identidad ───────────────────────────────────────
-- Hoy la aplicacion cruza citas con expedientes comparando
-- nombre_paciente contra expedientes.nombre como texto exacto. Eso hace
-- que dos pacientes homonimos compartan expediente y que un nombre
-- escrito distinto no encuentre ninguno.
--
-- Esta columna ya existe para arreglarlo. El cambio en el cliente es de
-- una linea, en patient.js -> enviarSolicitud:
--
--     const { ok } = await sbPost('citas', {
--       nombre_paciente:   pacienteData.nombre,
--       identidad:         pacienteData.id,     // <- agregar
--       telefono_paciente: pacienteData.tel,
--       ...
--
-- pacienteData.id ya trae la identidad: la guarda setPacienteData()
-- cuando el paciente entra. Una vez que las citas nuevas la traigan, se
-- puede rellenar lo viejo por nombre y recien entonces poner la llave
-- foranea de verdad.
