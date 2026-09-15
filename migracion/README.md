# Migración de la base de datos

Scripts para levantar desde cero la base de datos de DentaAgenda en un
proyecto de Supabase.

El esquema reproduce el que ya está en producción, con los tipos reales:
`uuid` en `expedientes` y `visitas_clinicas`, `bigint` correlativo en `citas`.
El diagrama entidad-relación está en [arquitectura.md](../docs/arquitectura.md).

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
| 010 | [`010_comprobaciones.sql`](010_comprobaciones.sql) | Solo `SELECT`: busca duplicados y contadores torcidos | No |
| 011 | [`011_rls_endurecido.sql`](011_rls_endurecido.sql) | Cierra las tablas a `anon` y expone al paciente sólo cuatro funciones RPC | Sí |
| 012 | [`012_cancelacion_por_el_paciente.sql`](012_cancelacion_por_el_paciente.sql) | Estado `cancelada_paciente` y función `cancelar_mi_cita` | Sí |
| 013 | [`013_horarios_y_relaciones.sql`](013_horarios_y_relaciones.sql) | Catálogo `horarios`, y las llaves foráneas de `citas` hacia `expedientes` y `horarios` | Sí |

Dependencias que fuerzan el orden:

- **001 primero** — instala `pgcrypto`, que 002 y 004 necesitan para `gen_random_uuid()`.
- **004 después de 002** — `visitas_clinicas.expediente_id` referencia `expedientes(id)`.
- **005 a 008 después de 001–004** — operan sobre tablas que ya deben existir.
- **009 al final** — respeta el índice único de 006 y dispara el trigger de 007.
- **012 después de 006 y 011** — rehace el índice único de 006 para que las
  citas que cancela el paciente también liberen su horario, y reemplaza dos de
  las funciones que crea 011.
- **013 después de 002 y 003** — rellena `citas.expediente_id` cruzando contra
  `expedientes`, y no puede aplicar la llave foránea hasta que ese relleno
  terminó.

## Si tu base ya existe

Sobre un proyecto que ya está andando, los scripts se comportan distinto: del
001 al 004 son `create table if not exists` y **no hacen nada**. Lo que falta
agregar es todo lo que viene después:

```
005_indices.sql  →  006_evitar_doble_reserva.sql  →  007_sincronizar_visitas.sql  →  008_vistas_de_consulta.sql
        →  011_rls_endurecido.sql  →  012_cancelacion_por_el_paciente.sql  →  013_horarios_y_relaciones.sql
```

Antes de correr **006**, revisá si ya tenés horarios duplicados — el índice
único falla mientras exista un choque. La consulta que los lista está comentada
dentro de ese mismo archivo, junto con la forma menos destructiva de
resolverlos.

**011 a 013 no son opcionales**, aunque la base ya funcione sin ellos: 011 es lo
que cierra las tablas (ver [Sobre el acceso a los datos](#sobre-el-acceso-a-los-datos)),
012 es de donde salen las funciones que usa el flujo del paciente, y 013 agrega
la quinta tabla y dos de las cuatro llaves foráneas. Una forma rápida de ver
cuáles te faltan es exportar el esquema real y compararlo — está más abajo, en
[Comprobar qué hay aplicado de verdad](#comprobar-qué-hay-aplicado-de-verdad).

**No corras 009** sobre esa base: metería pacientes inventados junto a los
reales.

## Cómo ejecutarlos

**Desde el panel de Supabase** — SQL Editor → New query → pegar cada archivo en
orden y correrlo.

**Desde `psql`**, con la connection string del proyecto:

```bash
for f in migracion/0*.sql; do psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

## Idempotencia

Los scripts no solo son seguros de re-ejecutar: **convergen**. Correrlos sobre
una base que ya existe la deja al día en vez de no hacer nada.

| Qué | Cómo |
| --- | --- |
| Tablas | `create table if not exists`, y detrás un `alter table ... add column if not exists` por cada columna |
| Restricciones y FK | Postgres no tiene `add constraint if not exists`, así que va el par `drop constraint if exists` + `add constraint`, con nombres explícitos |
| Índices y vistas | `create index if not exists`, `create or replace view` |
| Trigger y función | `create or replace function`, y `drop trigger if exists` antes de crearlo |
| Semilla | Guard **por fila**, no todo-o-nada: si falta una sola, la repone sin tocar el resto |

Un detalle de las columnas: se agregan **anulables** aunque en el `create` sean
`not null`. Un `add column` con `not null` y sin default falla si la tabla ya
tiene filas; endurecerlas va aparte, después de rellenar.

Para comprobarlo, corré [`010_comprobaciones.sql`](010_comprobaciones.sql)
después de aplicar la secuencia y otra vez después de repetirla: los resultados
tienen que ser idénticos, y todos los conteos en cero.

La aplicación también es idempotente en sus tres caminos de escritura; está
documentado en [arquitectura.md](../docs/arquitectura.md).

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
no una hora real. Desde 013 los valores válidos ya no viven en la constante
`SLOTS_BASE` del navegador sino en la tabla `horarios`, y `citas.hora` los
referencia con una llave foránea contra `horarios.etiqueta` — por eso es la
única FK del esquema que apunta a un texto y no a un id, y por eso lleva
`on update cascade`. `visitas_clinicas.hora` sigue siendo texto libre: es parte
del registro histórico de la visita, no un horario reservable.

**`citas.identidad` es nula sólo en las citas viejas.** Desde 012 la escribe
`crear_solicitud`, que es por donde pasa todo el flujo del paciente. Las filas
creadas antes de ese cambio quedaron con `identidad` nula, y por eso
`crear_solicitud` y `cancelar_mi_cita` todavía cruzan por nombre como respaldo.
013 usó esta misma columna para rellenar `citas.expediente_id`, y dejó en nulo
las que no pudo resolver sin adivinar (homónimos).

## Sobre el acceso a los datos

Hasta 010 los scripts no manejaban Row Level Security, y la base quedaba con
políticas `for all using (true)`: cualquiera con la anon key —que es pública,
está en `config.js`— podía leer y modificar los expedientes clínicos.

**011 cierra eso.** Las tablas no se exponen a `anon`; el paciente entra sólo
por cuatro funciones RPC `security definer`, que son las únicas que atraviesan
la frontera:

| Función | Para qué |
| --- | --- |
| `registrar_paciente` | Alta idempotente del expediente, por identidad |
| `crear_solicitud` | Pedir una cita sin poder pisar la de otro |
| `slots_ocupados` | Qué horas de un día están tomadas, sin decir de quién |
| `estado_de_mis_citas` | El historial de una identidad, y sólo de esa |

012 agrega la quinta, `cancelar_mi_cita`. El panel de la doctora no pasa por
ahí: va por [`api/db/[tabla].js`](../api/db/[tabla].js), que firma con el token
de sesión guardado en una cookie `HttpOnly`.

`horarios` es la excepción deliberada: 013 le da lectura pública (`horarios_lectura`),
porque el paciente necesita ver los horarios para poder elegir uno. Escribirlos
queda para la doctora (`horarios_doctora`).

Para comprobar desde afuera que quedó bien aplicado:

```bash
npm run verificar:rls
```

Consulta el proyecto real con la anon key: las tablas tienen que responder 401 y
las RPC 200. Antes de correr 011 falla, y está bien que falle.

## Comprobar qué hay aplicado de verdad

El repo no es prueba de nada: un script commiteado puede no haberse corrido
nunca. Para leer el esquema que existe de verdad, con los conteos reales:

1. Pegar [`../scripts/exportar-esquema.sql`](../scripts/exportar-esquema.sql) en
   el SQL Editor de Supabase y correrlo.
2. Guardar el contenido de la única celda del resultado en
   [`../docs/db-export.json`](../docs/db-export.json).
3. `npm run verificar:esquema`

No inventa nada: lee los catálogos del sistema y cuenta las filas con
`query_to_xml`, tabla por tabla. El estado que dejó 013 son cinco tablas, todas
con llave primaria, y cuatro llaves foráneas:

```
citas.expediente_id            -> expedientes.id
citas.hora                     -> horarios.etiqueta
visitas_clinicas.expediente_id -> expedientes.id
perfiles.id                    -> auth.users.id
```

Si tu export muestra menos, te falta correr algo.

## Lo que estos scripts no incluyen

- **Script de reseteo.** Un `drop table` borraría expedientes clínicos sin
  vuelta atrás; si necesitás empezar de cero, es más seguro crear un proyecto
  nuevo de Supabase.
- **Expediente para toda cita.** 013 agregó la llave foránea, pero las citas
  viejas cuyo nombre no identifica a una sola persona quedaron con
  `expediente_id` en `NULL` antes que mezclar dos historiales clínicos.
  `vista_agenda` (script 008) deja ver cuáles son.
