# Migración de la base de datos

Scripts para levantar desde cero la base de datos de DentaAgenda en un
proyecto de Supabase.

El esquema reproduce el que ya está en producción, con los tipos reales:
`uuid` en `expedientes` y `visitas_clinicas`, `bigint` correlativo en `citas`.
El diagrama entidad-relación está en [arquitectura.md](../arquitectura.md).

## Orden de ejecución

| # | Script | Qué hace | Obligatorio |
| --- | --- | --- | --- |
| 001 | [`001_perfiles.sql`](001_perfiles.sql) | Extensión `pgcrypto` y tabla `perfiles` | Sí |
| 002 | [`002_expedientes.sql`](002_expedientes.sql) | Tabla `expedientes` | Sí |
| 003 | [`003_citas.sql`](003_citas.sql) | Tabla `citas` | Sí |
| 004 | [`004_visitas_clinicas.sql`](004_visitas_clinicas.sql) | Tabla `visitas_clinicas` | Sí |
| 005 | [`005_indices.sql`](005_indices.sql) | Índices, uno por consulta de la app | Recomendado |
| 006 | [`006_evitar_doble_reserva.sql`](006_evitar_doble_reserva.sql) | Índice único que impide reservar dos veces el mismo horario | Recomendado |
| 007 | [`007_sincronizar_visitas.sql`](007_sincronizar_visitas.sql) | Trigger que mantiene cuadrado `expedientes.visitas` | Opcional |
| 008 | [`008_vistas_de_consulta.sql`](008_vistas_de_consulta.sql) | Tres vistas para consultas e informes | Opcional |
| 009 | [`009_datos_de_prueba.sql`](009_datos_de_prueba.sql) | Pacientes, citas y visitas de ejemplo | No |

Dependencias que fuerzan el orden:

- **001 primero** — instala `pgcrypto`, que 002 y 004 necesitan para `gen_random_uuid()`.
- **004 después de 002** — `visitas_clinicas.expediente_id` referencia `expedientes(id)`.
- **005 a 008 después de 001–004** — operan sobre tablas que ya deben existir.
- **009 al final** — respeta el índice único de 006 y dispara el trigger de 007.

## Si tu base ya existe

Sobre un proyecto que ya está andando, los scripts se comportan distinto: del
001 al 004 son `create table if not exists` y **no hacen nada**. Lo que falta
agregar es el bloque 005–008:

```
005_indices.sql  →  006_evitar_doble_reserva.sql  →  007_sincronizar_visitas.sql  →  008_vistas_de_consulta.sql
```

Antes de correr **006**, revisá si ya tenés horarios duplicados — el índice
único falla mientras exista un choque. La consulta que los lista está comentada
dentro de ese mismo archivo, junto con la forma menos destructiva de
resolverlos.

**No corras 009** sobre esa base: metería pacientes inventados junto a los
reales.

## Cómo ejecutarlos

**Desde el panel de Supabase** — SQL Editor → New query → pegar cada archivo en
orden y correrlo.

**Desde `psql`**, con la connection string del proyecto:

```bash
for f in migracion/0*.sql; do psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

Los scripts son re-ejecutables: las tablas usan `create table if not exists`,
los índices `create index if not exists`, las vistas y funciones `create or
replace`, el trigger hace `drop trigger if exists` antes de crearse, y la
semilla no duplica filas.

## Un paso que no es SQL

`perfiles` referencia `auth.users`, y ese usuario **no se puede crear desde
estos scripts** — vive en el esquema `auth`, que administra GoTrue. Hay que
darlo de alta a mano antes de insertar el perfil:

Panel de Supabase → Authentication → Users → Add user

- **Email:** `belki.den@dentaagenda.com` (constante `DOCTORA_EMAIL`)
- **Contraseña:** la que se vaya a usar en el formulario

Con el uuid que devuelve el panel se inserta la fila de `perfiles`; el `insert`
está comentado al final de [`001_perfiles.sql`](001_perfiles.sql).

El usuario que se escribe en la pantalla de login es `belki.den`
(`DOCTORA_USUARIO`); el cliente lo traduce al email. Las dos constantes están en
[`assets/js/modules/config.js`](../assets/js/modules/config.js).

## Decisiones de tipos

Cuatro cosas que se ven raras en el esquema y son deliberadas:

**`expedientes` y `visitas_clinicas` usan `uuid`, `citas` usa `bigint`.** El id
del expediente viaja al cliente y termina incrustado en el HTML que arma
`renderExpedientes()`, así que conviene que no sea adivinable ni deje ver
cuántos pacientes hay. El id de una cita no tiene ese problema.

**`citas.fecha` es `date`, pero `visitas_clinicas.fecha` es `text`.** No es un
descuido. `citas.fecha` la escribe `formatoFechaKey()` siempre en ISO
(`2026-09-03`), así que el tipo real funciona y permite filtrar y ordenar bien.
`visitas_clinicas.fecha` la escribe `fechaHoy()`, que produce una cadena en
español ya formateada para mostrar (`03 de septiembre de 2026`).

**`hora` es `text` en las dos tablas.** Guarda la etiqueta del slot (`9:15 AM`),
no una hora real. Los valores válidos están en `SLOTS_BASE`.

**`citas.identidad` existe pero está vacía.** El cliente todavía no la escribe.
Es el camino para dejar de cruzar citas y expedientes por nombre; el cambio es
de una línea y está explicado al final de
[`003_citas.sql`](003_citas.sql).

## Sobre el acceso a los datos

Estos scripts **no manejan Row Level Security**. La base en producción tiene RLS
activada en las cuatro tablas, con políticas `for all using (true)`, o sea
acceso completo para cualquiera.

Eso es lo que la aplicación necesita hoy, porque
[`api.js`](../assets/js/modules/api.js) firma todas las peticiones con la anon
key y nunca usa el token de sesión de la doctora. Como la anon key y la URL del
proyecto están en `config.js`, que es público, cualquiera puede leer y modificar
los expedientes clínicos.

Para la demo del proyecto no importa; antes de cargar datos reales de pacientes
hay que resolver las dos mitades: que el cliente mande el token de sesión, y
recién entonces restringir las políticas.

## Lo que estos scripts no incluyen

- **Script de reseteo.** Un `drop table` borraría expedientes clínicos sin
  vuelta atrás; si necesitás empezar de cero, es más seguro crear un proyecto
  nuevo de Supabase.
- **Llave foránea entre `citas` y `expedientes`.** Requiere primero que el
  cliente escriba `citas.identidad` y después rellenar lo viejo. Mientras tanto,
  `vista_agenda` (script 008) deja ver qué citas no cruzan con ningún
  expediente: son las que traen `expediente_id` en `NULL`.
