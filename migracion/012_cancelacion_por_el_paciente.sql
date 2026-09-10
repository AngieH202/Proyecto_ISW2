-- =====================================================================
-- 012 - El paciente puede cancelar su propia cita
-- =====================================================================
-- Hasta ahora, cancelar era cosa de la doctora: el paciente que no podia
-- venir tenia que llamar a la clinica, y mientras tanto su horario
-- seguia bloqueado para todos los demas.
--
-- Se agrega el estado 'cancelada_paciente', separado de 'cancelada'. Los
-- dos liberan el horario, pero decir quien cancelo importa: la doctora
-- necesita distinguir una solicitud que ella rechazo de un paciente que
-- se dio de baja, porque lo segundo le deja un hueco en una agenda que
-- ya daba por llena.
--
-- Re-ejecutable: el check se rehace, el indice se recrea y las funciones
-- van con or replace.
-- =====================================================================

-- ── 1. El nuevo estado ───────────────────────────────────────────────
alter table public.citas drop constraint if exists citas_estado_valido;
alter table public.citas add  constraint citas_estado_valido
  check (estado in ('pendiente','confirmada','atendida','cancelada','cancelada_paciente','nopresento'));

comment on column public.citas.estado is
  'pendiente, confirmada, atendida, nopresento, cancelada (la rechazo la doctora) o cancelada_paciente (se dio de baja el paciente).';


-- ── 2. Los dos estados cancelados liberan el horario ─────────────────
-- El indice unico parcial de 006 dejaba fuera solo 'cancelada'. Si no se
-- amplia, una cita que el paciente da de baja sigue reservando su slot y
-- nadie mas puede tomarlo, que es justo lo que esta migracion viene a
-- resolver.
drop index if exists public.citas_slot_unico_idx;

create unique index if not exists citas_slot_unico_idx
  on public.citas (fecha, hora)
  where estado not in ('cancelada', 'cancelada_paciente');

comment on index public.citas_slot_unico_idx is
  'Un solo paciente por combinacion de fecha y hora. Las canceladas quedan fuera --las cancele la doctora o el paciente-- para que su horario vuelva a estar disponible.';


-- ── 3. Las funciones que miran horarios ocupados ─────────────────────
create or replace function public.slots_ocupados(p_fecha date)
returns table (hora text)
language sql security definer set search_path = public stable as $$
  select c.hora from public.citas c
  where c.fecha = p_fecha
    and c.estado not in ('cancelada', 'cancelada_paciente');
$$;

create or replace function public.crear_solicitud(
  p_identidad text, p_nombre text, p_telefono text,
  p_fecha date, p_hora text, p_motivo text
) returns text
language plpgsql security definer set search_path = public as $$
declare v_duena text;
begin
  select case when c.identidad is not null and c.identidad = p_identidad then 'propia'
              when c.identidad is null and c.nombre_paciente = p_nombre then 'propia'
              else 'ajena' end
  into v_duena
  from public.citas c
  where c.fecha = p_fecha and c.hora = p_hora
    and c.estado not in ('cancelada', 'cancelada_paciente')
  order by case when c.identidad = p_identidad then 0 else 1 end
  limit 1;

  if v_duena = 'propia' then return 'ya_existia'; end if;
  if v_duena = 'ajena'  then return 'ocupado';    end if;

  begin
    insert into public.citas (nombre_paciente, identidad, telefono_paciente, fecha, hora, motivo, estado)
    values (p_nombre, p_identidad, p_telefono, p_fecha, p_hora, p_motivo, 'pendiente');
  exception when unique_violation then
    return 'ocupado';
  end;

  return 'creada';
end $$;


-- ── 4. La cancelacion ────────────────────────────────────────────────
-- El paciente no toca la tabla: llama esta funcion, que solo puede
-- cancelar una cita que sea suya. La identidad no viaja como filtro sino
-- como condicion dentro del update, asi que no hay forma de pedir la
-- baja de una cita ajena.
--
-- Idempotente: volver a cancelar lo ya cancelado devuelve
-- 'ya_cancelada', no un error. Un doble clic o un reintento tras un
-- timeout terminan igual.
--
-- Una cita ya atendida no se cancela: paso, y borrarla del historial
-- seria falsear lo que ocurrio.
-- El nombre se usa de respaldo para las citas viejas, creadas antes de
-- que el cliente guardara identidad: esas tienen identidad nula y sin
-- este respaldo se ven en la consulta de estado --que ya cruza por
-- nombre-- pero no se pueden cancelar. Es el mismo criterio que ya usa
-- crear_solicitud.
--
-- El nombre no se recibe como parametro: sale del expediente de esa
-- identidad. Asi sigue haciendo falta la identidad correcta, y no
-- alcanza con saber como se llama alguien.
create or replace function public.cancelar_mi_cita(
  p_identidad text, p_fecha date, p_hora text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id     bigint;
  v_estado text;
  v_nombre text;
begin
  if p_identidad is null or btrim(p_identidad) = '' then
    return 'no_encontrada';
  end if;

  select e.nombre into v_nombre
  from public.expedientes e
  where e.identidad = p_identidad
  limit 1;

  select c.id, c.estado into v_id, v_estado
  from public.citas c
  where c.fecha = p_fecha
    and c.hora = p_hora
    and (
      c.identidad = p_identidad
      or (c.identidad is null and v_nombre is not null and c.nombre_paciente = v_nombre)
    )
  -- Si hubiera dos, la que tiene identidad manda: es la unica que
  -- identifica al paciente sin lugar a dudas.
  order by case when c.identidad = p_identidad then 0 else 1 end,
           case when c.estado in ('pendiente','confirmada') then 0 else 1 end
  limit 1;

  if v_id is null                                    then return 'no_encontrada'; end if;
  if v_estado in ('cancelada', 'cancelada_paciente') then return 'ya_cancelada';   end if;
  if v_estado in ('atendida', 'nopresento')          then return 'no_se_puede';    end if;

  update public.citas
  set estado = 'cancelada_paciente'
  where id = v_id;

  return 'cancelada';
end $$;

comment on function public.cancelar_mi_cita(text, date, text) is
  'Da de baja la cita de esa identidad en ese horario y libera el slot. Devuelve cancelada, ya_cancelada, no_se_puede o no_encontrada.';


-- ── 5. Permisos ──────────────────────────────────────────────────────
revoke all on function public.cancelar_mi_cita(text, date, text) from public;
grant execute on function public.cancelar_mi_cita(text, date, text) to anon, authenticated;


-- ── Comprobacion ─────────────────────────────────────────────────────
-- Con una cita de prueba en 2030-01-02 a las 9:15 AM:
--
--   select public.cancelar_mi_cita('0801-1990-12345', '2030-01-02', '9:15 AM');
--   -- 'cancelada'
--   select public.cancelar_mi_cita('0801-1990-12345', '2030-01-02', '9:15 AM');
--   -- 'ya_cancelada'
--   select public.cancelar_mi_cita('0000-0000-00000', '2030-01-02', '9:15 AM');
--   -- 'no_encontrada'  (la identidad no coincide)
--   select * from public.slots_ocupados('2030-01-02');
--   -- 9:15 AM ya no aparece
