-- =====================================================================
-- 010 - Comprobaciones de idempotencia
-- =====================================================================
-- Solo SELECT. No modifica nada, se puede correr cuando sea.
--
-- Responde una pregunta: ¿quedo duplicado algo que no deberia? Cada
-- bloque devuelve cero filas cuando esta todo bien; cualquier fila es
-- un duplicado real que hay que mirar.
--
-- Correlo despues de aplicar la secuencia, y de nuevo despues de
-- repetirla: los resultados tienen que ser identicos.
-- =====================================================================


-- ── 1. Citas duplicadas en el mismo horario ──────────────────────────
-- Es lo que impide el indice unico de 006 y lo que evita el chequeo
-- previo de enviarSolicitud. Las canceladas quedan fuera: liberan su
-- horario.
select
  'citas duplicadas' as comprobacion,
  fecha,
  hora,
  count(*)                         as veces,
  array_agg(id order by created_at) as ids
from public.citas
where estado <> 'cancelada'
group by fecha, hora
having count(*) > 1
order by fecha, hora;


-- ── 2. Expedientes con la identidad repetida ─────────────────────────
-- Deberia ser imposible con el unique de 002. Si aparece algo, es que
-- la restriccion no esta puesta en esta base.
select
  'identidad repetida' as comprobacion,
  identidad,
  count(*)             as veces,
  array_agg(nombre)    as nombres
from public.expedientes
group by identidad
having count(*) > 1
order by identidad;


-- ── 3. Contadores de visitas descuadrados ────────────────────────────
-- Lo que produce el incremento sobre una copia vieja, y lo que cierran
-- el contador absoluto del cliente y el trigger de 007.
select
  'contador descuadrado' as comprobacion,
  e.id,
  e.nombre,
  e.visitas    as guardado,
  count(v.id)  as real
from public.expedientes e
left join public.visitas_clinicas v on v.expediente_id = e.id
group by e.id, e.nombre, e.visitas
having coalesce(e.visitas, 0) <> count(v.id)
order by e.nombre;


-- ── 4. Visitas clinicas duplicadas ───────────────────────────────────
-- Misma clave natural que usa el guard de guardarDiagnostico:
-- expediente, dia y diagnostico.
select
  'visita duplicada' as comprobacion,
  expediente_id,
  fecha,
  left(diagnostico, 40) as diagnostico,
  count(*)              as veces
from public.visitas_clinicas
group by expediente_id, fecha, diagnostico
having count(*) > 1
order by expediente_id, fecha;


-- ── 5. Citas que no cruzan con ningun expediente ─────────────────────
-- No es un duplicado, pero es el otro sintoma de escribir sin clave:
-- el nombre no coincide con ninguna ficha. Deberia ir a cero a medida
-- que las citas nuevas traigan identidad.
select
  'cita huerfana' as comprobacion,
  c.id,
  c.fecha,
  c.nombre_paciente,
  c.identidad
from public.citas c
where not exists (
  select 1 from public.expedientes e
  where (c.identidad is not null and e.identidad = c.identidad)
     or (c.identidad is null     and e.nombre    = c.nombre_paciente)
)
order by c.fecha desc;


-- ── Resumen ──────────────────────────────────────────────────────────
-- Una sola fila con el conteo de cada problema. Todo en cero es lo
-- esperado.
select
  (select count(*) from (
     select 1 from public.citas where estado <> 'cancelada'
     group by fecha, hora having count(*) > 1) x)            as citas_duplicadas,
  (select count(*) from (
     select 1 from public.expedientes
     group by identidad having count(*) > 1) x)              as identidades_repetidas,
  (select count(*) from public.expedientes e
   where coalesce(e.visitas, 0) <> (
     select count(*) from public.visitas_clinicas v
     where v.expediente_id = e.id))                          as contadores_descuadrados,
  (select count(*) from (
     select 1 from public.visitas_clinicas
     group by expediente_id, fecha, diagnostico
     having count(*) > 1) x)                                 as visitas_duplicadas;
