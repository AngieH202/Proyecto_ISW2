-- =====================================================================
-- 001 - Tabla perfiles
-- =====================================================================
-- Datos de la doctora colgados de su usuario de Supabase Auth. La fila
-- se enlaza uno a uno con auth.users, que es donde GoTrue guarda el
-- email y la contrasena.
--
-- Nota: el cliente todavia no lee esta tabla. loginDoctora() compara el
-- usuario escrito contra la constante DOCTORA_USUARIO de config.js y
-- autentica con DOCTORA_EMAIL. Mover ese dato aqui es lo que permitiria
-- sacar las credenciales del codigo, y es tambien lo que haria falta si
-- alguna vez hay mas de una doctora.
--
-- Necesita pgcrypto por gen_random_uuid(), que usan 002 y 004.
-- =====================================================================

create extension if not exists "pgcrypto";

create table if not exists public.perfiles (
  id         uuid primary key
             references auth.users on delete cascade,

  nombre     text        not null,

  -- El check deja un solo rol a proposito: hoy la unica cuenta del
  -- sistema es la de la doctora. Los pacientes no tienen usuario, se
  -- identifican con su numero de identidad.
  rol        text        not null check (rol in ('doctora')),

  telefono   text,
  created_at timestamptz default now()
);

comment on table  public.perfiles     is 'Datos de la doctora, enlazados a su usuario de Supabase Auth.';
comment on column public.perfiles.id  is 'Mismo uuid que auth.users.id.';
comment on column public.perfiles.rol is 'Solo "doctora": los pacientes no tienen cuenta.';

-- ── El usuario de Auth va primero ────────────────────────────────────
-- Esta tabla referencia auth.users, asi que la cuenta tiene que existir
-- antes de insertar el perfil. Se crea a mano desde el panel:
--
--   Authentication -> Users -> Add user
--   email: belki.den@dentaagenda.com   (constante DOCTORA_EMAIL)
--
-- Con el uuid que devuelve el panel:
--
--   insert into public.perfiles (id, nombre, rol, telefono)
--   values ('<uuid-de-auth.users>', 'Dra. Belkis Suisse', 'doctora', '9999-0000')
--   on conflict (id) do nothing;
