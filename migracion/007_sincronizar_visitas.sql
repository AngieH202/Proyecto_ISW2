-- =====================================================================
-- 007 - Mantener sincronizado el contador expedientes.visitas
-- =====================================================================
-- expedientes.visitas es un contador denormalizado: hoy lo lleva la
-- aplicacion, sumando uno sobre la copia que tiene en memoria cada vez
-- que se guarda un diagnostico (app.js -> guardarDiagnostico).
--
-- Eso se desincroniza en cuanto la copia local esta vieja: si mientras
-- tanto se registro otra visita, el PATCH pisa el valor bueno con uno
-- viejo mas uno. Tampoco baja si se borra una visita.
--
-- Este trigger recalcula el contador contra la tabla real, asi que el
-- valor siempre cuadra sin importar quien haya escrito ni por que via.
--
-- Depende de 002 y 004.
-- =====================================================================

create or replace function public.recontar_visitas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- uuid, no bigint: expedientes.id y visitas_clinicas.expediente_id son
  -- uuid. Declararlos bigint aborta el trigger en cuanto se dispara.
  objetivo uuid;
  anterior uuid;
begin
  -- En un trigger de DELETE la variable new no esta asignada, y tocar
  -- new.expediente_id ahi aborta la sentencia. Por eso se elige la
  -- fuente segun la operacion en vez de con un coalesce.
  if tg_op = 'DELETE' then
    objetivo := old.expediente_id;
  else
    objetivo := new.expediente_id;
  end if;

  -- Si un update movio la visita de expediente, hay que recontar los dos.
  if tg_op = 'UPDATE' and old.expediente_id is distinct from new.expediente_id then
    anterior := old.expediente_id;
  end if;

  -- Recuento absoluto, no un incremento: es lo que lo hace idempotente y
  -- correcto tambien al borrar o al mover una visita de expediente.
  update public.expedientes e
  set visitas = (
    select count(*)
    from public.visitas_clinicas v
    where v.expediente_id = e.id
  )
  where e.id = objetivo
     or e.id = anterior;   -- anterior nulo no agrega ninguna fila

  return null;   -- trigger after: el valor de retorno se ignora
end;
$$;

drop trigger if exists visitas_clinicas_recontar on public.visitas_clinicas;

create trigger visitas_clinicas_recontar
  after insert or update or delete on public.visitas_clinicas
  for each row
  execute function public.recontar_visitas();

comment on function public.recontar_visitas() is
  'Recalcula expedientes.visitas contra visitas_clinicas. Lo dispara el trigger visitas_clinicas_recontar.';

-- ── Cuadrar lo que ya existe ─────────────────────────────────────────
-- El trigger solo actua sobre filas nuevas, asi que la primera vez hay
-- que emparejar los contadores que ya estaban torcidos.
update public.expedientes e
set visitas = (
  select count(*)
  from public.visitas_clinicas v
  where v.expediente_id = e.id
)
where e.visitas is distinct from (
  select count(*)
  from public.visitas_clinicas v
  where v.expediente_id = e.id
);

-- ── Un cambio que hay que hacer en el cliente ────────────────────────
-- Con el trigger puesto, la base ya lleva el contador sola. El PATCH que
-- manda la aplicacion pasa de redundante a peligroso: escribe un numero
-- calculado sobre una copia que puede estar vieja.
--
-- En app.js -> guardarDiagnostico, sacar visitas del PATCH y dejar solo
-- la fecha:
--
--     await sbPatch('expedientes', 'id=eq.' + window.expedienteActual.id,
--       { ultima_visita: fechaHoy() });
--
-- El contador se relee al reabrir el expediente, que ya hace un sbGet
-- fresco (app.js -> abrirExpediente).
--
-- Nota: ultima_visita la sigue escribiendo la aplicacion a proposito.
-- Guarda una cadena ya formateada en espanol, no una fecha, asi que
-- derivarla aqui obligaria a repetir ese formato dentro de la base.
