-- =====================================================================
-- 006 - Evitar doble reserva del mismo horario
-- =====================================================================
-- Cierra una condicion de carrera real del flujo de agendamiento.
--
-- Hoy la disponibilidad se decide en el cliente: cargarSlotsDia() lee las
-- horas ocupadas del dia y pinta los slots libres, y despues
-- enviarSolicitud() inserta. Entre esas dos cosas puede pasar cualquier
-- cosa. Si dos pacientes abren el mismo dia a la vez, los dos ven el slot
-- libre y los dos lo reservan.
--
-- Un indice unico parcial mueve esa regla a la base, que es el unico
-- lugar donde se puede garantizar.
--
-- El parcial importa: una cita cancelada libera el horario, tal como lo
-- interpreta el cliente, que filtra con estado=neq.cancelada. Una cita en
-- estado nopresento sigue bloqueando su slot, igual que hoy.
-- =====================================================================

create unique index if not exists citas_slot_unico_idx
  on public.citas (fecha, hora)
  where estado <> 'cancelada';

comment on index public.citas_slot_unico_idx is
  'Un solo paciente por combinacion de fecha y hora. Las citas canceladas quedan fuera para que su horario vuelva a estar disponible.';

-- ── Antes de aplicarlo ───────────────────────────────────────────────
-- Si la tabla ya tiene datos, el indice falla mientras exista un choque.
-- Esta consulta los lista:
--
--   select fecha, hora, count(*) as choques,
--          array_agg(id order by created_at) as ids
--   from public.citas
--   where estado <> 'cancelada'
--   group by fecha, hora
--   having count(*) > 1
--   order by fecha, hora;
--
-- La forma menos destructiva de resolverlos es cancelar las duplicadas y
-- quedarse con la que se creo primero:
--
--   update public.citas c
--   set estado = 'cancelada'
--   where c.estado <> 'cancelada'
--     and exists (
--       select 1 from public.citas anterior
--       where anterior.fecha = c.fecha
--         and anterior.hora  = c.hora
--         and anterior.estado <> 'cancelada'
--         and anterior.created_at < c.created_at
--     );

-- ── Que cambia para la aplicacion ────────────────────────────────────
-- Cuando el slot se ocupa entre que el paciente lo elige y lo confirma,
-- el insert deja de pasar silenciosamente y PostgREST responde 409 con
-- el codigo 23505 de Postgres. Hoy enviarSolicitud() solo distingue ok
-- de no ok y muestra "Error al enviar. Intenta de nuevo.", asi que el
-- caso queda cubierto aunque el mensaje sea generico.
--
-- Para que el aviso sea util conviene mirar el status en sbPost y avisar
-- que ese horario acaba de ocuparse, ademas de recargar los slots del dia.
