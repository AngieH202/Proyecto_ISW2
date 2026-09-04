-- =====================================================================
-- 009 - Datos de prueba
-- =====================================================================
-- Opcional. Deja la agenda con algo que mostrar al abrir la app.
--
--   NO lo corras sobre la base que ya usas: mete pacientes inventados
--   junto a los reales.
--
-- Es idempotente fila por fila, no todo-o-nada: los expedientes usan
-- on conflict do nothing sobre identidad, y las citas y las visitas
-- llevan un where not exists correlacionado con su propia clave
-- natural. Correrlo diez veces deja lo mismo que correrlo una, y si
-- falta una sola fila, la repone sin tocar el resto.
--
-- Las horas salen de SLOTS_BASE (assets/js/modules/config.js); las fechas
-- son relativas a hoy para que la agenda del dia nunca quede vacia.
-- =====================================================================

-- ── Expedientes ──────────────────────────────────────────────────────
insert into public.expedientes (nombre, identidad, edad, telefono, visitas, ultima_visita, notas)
values
  ('María López',      '0801-1990-12345', 34, '9876-5432', 2, '20 de agosto de 2026',     'Alergia a la penicilina.'),
  ('Carlos Mendoza',   '0501-1985-06789', 39, '9123-4567', 1, '02 de septiembre de 2026', 'Bruxismo nocturno.'),
  ('Ana Gutiérrez',    '0801-2001-55555', 23, '8899-1122', 0, '—',                        'Paciente nuevo.'),
  ('Roberto Fajardo',  '0703-1978-33221', 46, '9555-7788', 0, '—',                        'Paciente nuevo.')
on conflict (identidad) do nothing;

-- ── Citas ────────────────────────────────────────────────────────────
-- Se siembra identidad ademas del nombre, aunque el cliente todavia no
-- la mande: asi vista_agenda cruza por identidad y se ve funcionando el
-- camino que describe 003_citas.sql.
--
-- Ningun par fecha+hora se repite entre las citas no canceladas, para
-- que la semilla pase el indice unico de 006.
insert into public.citas (nombre_paciente, identidad, telefono_paciente, fecha, hora, motivo, estado)
select *
from (
  values
    ('María López',     '0801-1990-12345', '9876-5432', current_date,     '7:45 AM',  'Control de ortodoncia',       'confirmada'),
    ('Carlos Mendoza',  '0501-1985-06789', '9123-4567', current_date,     '9:15 AM',  'Dolor en molar inferior',     'confirmada'),
    ('Ana Gutiérrez',   '0801-2001-55555', '8899-1122', current_date,     '10:45 AM', 'Primera consulta y limpieza', 'pendiente'),
    ('Roberto Fajardo', '0703-1978-33221', '9555-7788', current_date + 1, '8:30 AM',  'Extraccion de cordal',        'pendiente'),
    ('María López',     '0801-1990-12345', '9876-5432', current_date + 2, '2:00 PM',  'Revision post tratamiento',   'pendiente'),
    ('Carlos Mendoza',  '0501-1985-06789', '9123-4567', current_date - 7, '11:30 AM', 'Limpieza semestral',          'atendida'),
    ('Ana Gutiérrez',   '0801-2001-55555', '8899-1122', current_date - 3, '7:00 AM',  'Consulta general',            'cancelada')
) as semilla (nombre_paciente, identidad, telefono_paciente, fecha, hora, motivo, estado)
-- Clave natural de una cita: el horario. Correlacionado con la fila de
-- la semilla, no un "hay alguna cita" global, para que reponga solo lo
-- que falte.
where not exists (
  select 1 from public.citas c
  where c.fecha = semilla.fecha
    and c.hora  = semilla.hora
);

-- ── Visitas clinicas ─────────────────────────────────────────────────
-- Se enlazan al expediente por identidad, nunca por un uuid fijo: los
-- ids los genera gen_random_uuid() y cambian en cada base.
insert into public.visitas_clinicas
  (expediente_id, fecha, hora, diagnostico, tratamientos, medicamentos, plan, notas)
select
  e.id, s.fecha, s.hora, s.diagnostico, s.tratamientos, s.medicamentos, s.plan, s.notas
from (
  values
    ('0801-1990-12345', '20 de agosto de 2026',     '08:30',
     'Maloclusion clase II en tratamiento. Buena evolucion.',
     'Ortodoncia, Radiografía',
     'Ninguno',
     'Ajuste de brackets en 30 dias.',
     'La paciente refiere molestia leve los primeros dias tras cada ajuste.'),
    ('0801-1990-12345', '15 de julio de 2026',      '09:15',
     'Gingivitis leve por acumulacion de placa.',
     'Limpieza, Fluorización',
     'Enjuague con clorhexidina 0.12% por 14 dias',
     'Reforzar tecnica de cepillado. Control en un mes.',
     'Alergia a la penicilina registrada en el expediente.'),
    ('0501-1985-06789', '02 de septiembre de 2026', '11:30',
     'Desgaste oclusal compatible con bruxismo.',
     'Consulta general, Radiografía',
     'Ibuprofeno 400mg c/8h por 3 dias',
     'Confeccionar placa de descarga nocturna.',
     'Paciente reporta estres laboral y despertares con dolor mandibular.')
) as s (identidad, fecha, hora, diagnostico, tratamientos, medicamentos, plan, notas)
join public.expedientes e on e.identidad = s.identidad
-- Clave natural de una visita: el expediente, el dia y el diagnostico.
-- No entra hora: es una cadena que cambia a cada minuto y volveria el
-- chequeo inutil.
where not exists (
  select 1 from public.visitas_clinicas v
  where v.expediente_id = e.id
    and v.fecha         = s.fecha
    and v.diagnostico   = s.diagnostico
);
