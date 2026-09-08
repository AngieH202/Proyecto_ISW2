-- =====================================================================
-- 011 - Row Level Security endurecido
-- =====================================================================
--
--   CORRELO DESPUES de que el sitio nuevo este publicado y funcionando.
--   Cambia los permisos que la aplicacion usa: si se aplica antes, la
--   version vieja del cliente deja de leer y la app en vivo se rompe.
--
-- ── El problema que cierra ───────────────────────────────────────────
--
-- Hasta ahora las politicas eran `for all using (true)`: la anon key
-- -- que esta en config.js, publico, en un repositorio publico --
-- alcanzaba para leer y modificar todos los expedientes clinicos.
--
-- El login de la doctora existia pero no cambiaba nada: para Postgres,
-- ella y un desconocido eran el mismo rol.
--
-- ── El modelo que queda ──────────────────────────────────────────────
--
--   authenticated (la doctora, con su token de Supabase)
--       acceso completo a las cuatro tablas.
--
--   anon (el paciente, que no tiene cuenta)
--       ningun acceso directo a las tablas. Todo lo que necesita pasa
--       por las cuatro funciones security definer de abajo, que exponen
--       exactamente lo que hace falta y nada mas.
--
-- Depende de 001 a 004.
-- =====================================================================


-- ── Politicas ────────────────────────────────────────────────────────
alter table public.perfiles         enable row level security;
alter table public.expedientes      enable row level security;
alter table public.citas            enable row level security;
alter table public.visitas_clinicas enable row level security;

-- Fuera las permisivas, sin importar como se llamen. Se recorren desde
-- el catalogo porque los nombres cambiaron entre versiones del proyecto.
do $$
declare p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('perfiles','expedientes','citas','visitas_clinicas')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- La doctora: acceso total a las cuatro tablas.
create policy perfiles_doctora    on public.perfiles         for all to authenticated using (true) with check (true);
create policy expedientes_doctora on public.expedientes      for all to authenticated using (true) with check (true);
create policy citas_doctora       on public.citas            for all to authenticated using (true) with check (true);
create policy visitas_doctora     on public.visitas_clinicas for all to authenticated using (true) with check (true);

-- anon no lleva ninguna politica: sin politica, RLS no deja pasar nada.
-- Sus permisos de tabla tambien se revocan, para que el bloqueo no
-- dependa solo de RLS.
revoke all on public.perfiles         from anon;
revoke all on public.expedientes      from anon;
revoke all on public.citas            from anon;
revoke all on public.visitas_clinicas from anon;


-- ── Lo que el paciente sigue necesitando ─────────────────────────────
-- Cuatro funciones security definer: corren con los permisos del dueno,
-- asi que atraviesan RLS, pero solo hacen y devuelven lo que se les
-- programo. Reemplazan uno a uno los accesos que anon acaba de perder.


-- registrar_paciente <- auth.js, loginPaciente
-- Mantiene el upsert idempotente sobre identidad. No toca visitas,
-- ultima_visita ni notas: pisarlas le borraria el historial a quien
-- vuelve.
create or replace function public.registrar_paciente(
  p_nombre text, p_identidad text, p_edad integer, p_telefono text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_identidad), '') = '' then
    raise exception 'nombre e identidad son obligatorios';
  end if;

  insert into public.expedientes (nombre, identidad, edad, telefono)
  values (trim(p_nombre), trim(p_identidad), p_edad, p_telefono)
  on conflict (identidad) do update
    set nombre = excluded.nombre,
        edad = excluded.edad,
        telefono = excluded.telefono
  returning id into v_id;

  return v_id;
end $$;


-- slots_ocupados <- patient.js, cargarSlotsDia
-- Devuelve solo las horas tomadas. No filtra por paciente a proposito:
-- saber que un horario esta ocupado no revela de quien es.
create or replace function public.slots_ocupados(p_fecha date)
returns table (hora text)
language sql security definer set search_path = public stable as $$
  select c.hora from public.citas c
  where c.fecha = p_fecha and c.estado <> 'cancelada';
$$;


-- crear_solicitud <- patient.js, enviarSolicitud
-- Mueve la garantia de idempotencia del cliente a la base: aqui el
-- chequeo y la insercion ocurren en la misma sentencia, sin la ventana
-- de carrera que queda entre dos peticiones HTTP.
--
-- Devuelve 'ya_existia', 'ocupado' o 'creada', que es justo lo que la
-- interfaz ya sabe distinguir.
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
  where c.fecha = p_fecha and c.hora = p_hora and c.estado <> 'cancelada'
  order by case when c.identidad = p_identidad then 0 else 1 end
  limit 1;

  if v_duena = 'propia' then return 'ya_existia'; end if;
  if v_duena = 'ajena'  then return 'ocupado';    end if;

  begin
    insert into public.citas (nombre_paciente, identidad, telefono_paciente, fecha, hora, motivo, estado)
    values (p_nombre, p_identidad, p_telefono, p_fecha, p_hora, p_motivo, 'pendiente');
  exception when unique_violation then
    -- El indice unico de 006 gano la carrera: alguien reservo entre el
    -- select y el insert.
    return 'ocupado';
  end;

  return 'creada';
end $$;


-- estado_de_mis_citas <- auth.js, consultarEstado
-- Reemplaza los dos SELECT que hacia el cliente. Solo devuelve las citas
-- que corresponden a esa identidad.
create or replace function public.estado_de_mis_citas(p_identidad text)
returns table (nombre_paciente text, fecha date, hora text, motivo text, estado text)
language sql security definer set search_path = public stable as $$
  select c.nombre_paciente, c.fecha, c.hora, c.motivo, c.estado
  from public.citas c
  join public.expedientes e
    on (c.identidad is not null and c.identidad = e.identidad)
    or (c.identidad is null and c.nombre_paciente = e.nombre)
  where e.identidad = p_identidad
  order by c.created_at desc;
$$;


-- ── Permisos de ejecucion ────────────────────────────────────────────
-- Se revoca a public y se concede explicito, para no depender del
-- default de la base.
do $$
declare f text;
begin
  foreach f in array array[
    'registrar_paciente(text,text,integer,text)',
    'slots_ocupados(date)',
    'crear_solicitud(text,text,text,date,text,text)',
    'estado_de_mis_citas(text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;


-- ── Comprobacion ─────────────────────────────────────────────────────
-- Despues de aplicar, esto tiene que devolver cero filas: es la prueba
-- de que anon ya no llega a las tablas.
--
--   select tablename, policyname, roles
--   from pg_policies
--   where schemaname = 'public' and 'anon' = any(roles);
--
-- Y desde afuera, con la anon key, un GET a /rest/v1/expedientes debe
-- devolver [] o 401, nunca los expedientes.
