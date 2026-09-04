-- =====================================================================
-- 008 - Vistas de consulta
-- =====================================================================
-- Tres vistas de solo lectura para trabajar desde el SQL Editor y para
-- sacar los numeros del informe sin escribir el join cada vez.
--
-- No cambian ninguna tabla y la aplicacion no las usa: se pueden crear y
-- borrar sin tocar el cliente.
--
-- Depende de 002, 003 y 004.
-- =====================================================================


-- ── vista_agenda ─────────────────────────────────────────────────────
-- Cada cita con el expediente que le corresponde, ya resuelto.
--
-- El join prefiere citas.identidad, que es unica y da siempre una sola
-- fila. Cuando esa columna viene vacia -- que es el caso de todo lo que
-- escribe el cliente hoy -- cae al nombre, que es el unico vinculo que
-- existe por ahora.
--
-- Dos cosas que la vista deja ver:
--   · expediente_id en NULL: la cita no cruza con ningun expediente.
--   · una misma cita repetida: dos expedientes homonimos cruzaron con
--     ella. Las dos son sintomas de la deuda descrita en arquitectura.md
--     y desaparecen cuando el cliente empiece a mandar identidad.

create or replace view public.vista_agenda as
select
  c.id             as cita_id,
  c.fecha,
  c.hora,
  c.estado,
  c.motivo,
  c.nombre_paciente,
  c.telefono_paciente,
  e.id             as expediente_id,
  e.identidad,
  e.edad,
  e.visitas,
  c.created_at
from public.citas c
left join public.expedientes e
  on  (c.identidad is not null and e.identidad = c.identidad)
   or (c.identidad is null     and e.nombre    = c.nombre_paciente);

comment on view public.vista_agenda is
  'Citas con su expediente resuelto por nombre. expediente_id nulo marca las citas que no cruzan con ningun expediente.';


-- ── vista_resumen_diario ─────────────────────────────────────────────
-- Una fila por dia con el desglose por estado. Es el equivalente en SQL
-- de las cuatro tarjetas que la doctora ve arriba de su agenda.

create or replace view public.vista_resumen_diario as
select
  fecha,
  count(*)                                          as total,
  count(*) filter (where estado = 'pendiente')      as pendientes,
  count(*) filter (where estado = 'confirmada')     as confirmadas,
  count(*) filter (where estado = 'atendida')       as atendidas,
  count(*) filter (where estado = 'cancelada')      as canceladas,
  count(*) filter (where estado = 'nopresento')     as no_se_presentaron
from public.citas
group by fecha;

comment on view public.vista_resumen_diario is
  'Conteo de citas por dia y por estado. Mismos numeros que las tarjetas del panel de la doctora.';


-- ── vista_expedientes_resumen ────────────────────────────────────────
-- Expediente con el conteo REAL de visitas, no el contador guardado, y
-- la fecha de la ultima visita tomada de created_at, que es el unico
-- campo temporal fiable de visitas_clinicas.
--
-- La columna contador_descuadrado deja ver de un vistazo si
-- expedientes.visitas se desincronizo. Con 007 aplicado deberia dar
-- false en todas las filas.

create or replace view public.vista_expedientes_resumen as
select
  e.id,
  e.nombre,
  e.identidad,
  e.edad,
  e.telefono,
  e.visitas                        as contador_guardado,
  count(v.id)                      as visitas_reales,
  e.visitas is distinct from count(v.id) as contador_descuadrado,
  max(v.created_at)                as ultima_visita_real,
  e.ultima_visita                  as ultima_visita_mostrada
from public.expedientes e
left join public.visitas_clinicas v
  on v.expediente_id = e.id
group by e.id, e.nombre, e.identidad, e.edad, e.telefono, e.visitas, e.ultima_visita;

comment on view public.vista_expedientes_resumen is
  'Expedientes con el conteo real de visitas frente al contador guardado. contador_descuadrado marca las filas fuera de sincronia.';


-- ── Consultas de ejemplo ─────────────────────────────────────────────
--
-- Agenda de hoy, en orden:
--   select hora, nombre_paciente, estado, motivo
--   from public.vista_agenda
--   where fecha = current_date
--   order by hora;
--
-- Citas que no cruzan con ningun expediente:
--   select cita_id, fecha, nombre_paciente
--   from public.vista_agenda
--   where expediente_id is null;
--
-- Como viene la semana:
--   select * from public.vista_resumen_diario
--   where fecha between current_date and current_date + 6
--   order by fecha;
--
-- Cuantas citas termina perdiendo la clinica:
--   select
--     count(*) filter (where estado = 'nopresento') as no_se_presento,
--     count(*) filter (where estado = 'cancelada')  as cancelada,
--     count(*)                                      as total
--   from public.citas
--   where fecha < current_date;
--
-- Contadores fuera de sincronia:
--   select nombre, contador_guardado, visitas_reales
--   from public.vista_expedientes_resumen
--   where contador_descuadrado;
