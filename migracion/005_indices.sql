-- =====================================================================
-- 005 - Indices
-- =====================================================================
-- Uno por cada consulta que la aplicacion realmente hace. Las lineas de
-- referencia apuntan al codigo que dispara cada una.
-- =====================================================================

-- app.js -> cargarCitas: agenda de un dia, "fecha=eq.<key>&order=hora.asc"
create index if not exists citas_fecha_idx
  on public.citas (fecha);

-- app.js -> cargarPendientes: bandeja de solicitudes, "estado=eq.pendiente"
-- Indice parcial: solo interesan las pendientes, que son pocas frente al
-- total historico.
create index if not exists citas_pendientes_idx
  on public.citas (created_at desc)
  where estado = 'pendiente';

-- patient.js -> cargarSlotsDia: slots ocupados de un dia,
-- "estado=neq.cancelada&fecha=eq.<key>&select=hora"
create index if not exists citas_fecha_estado_idx
  on public.citas (fecha, estado);

-- auth.js -> consultarEstado: historial del paciente,
-- "nombre_paciente=eq.<nombre>&order=created_at.desc"
create index if not exists citas_nombre_paciente_idx
  on public.citas (nombre_paciente, created_at desc);

-- app.js -> marcarAtendida y verExpedienteDesde: cruce por nombre exacto.
-- expedientes.identidad ya viene indexada por la restriccion unique de 002.
create index if not exists expedientes_nombre_idx
  on public.expedientes (nombre);

-- app.js -> cargarHistorial: visitas de un expediente,
-- "expediente_id=eq.<id>&order=created_at.desc"
create index if not exists visitas_clinicas_expediente_idx
  on public.visitas_clinicas (expediente_id, created_at desc);
