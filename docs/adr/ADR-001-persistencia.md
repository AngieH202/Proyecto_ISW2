# ADR-001 — Usar Postgres gestionado con RLS y funciones RPC en vez de un backend propio

- **Estado:** aceptada
- **Fecha:** 2026-09-10
- **Ámbito:** persistencia y acceso a datos
- **Relacionada:** [ADR-002 — autenticación](ADR-002-auth.md)

## Contexto

DentaAgenda es el sistema de citas de una clínica odontológica de **una sola
profesional**, la Dra. Belkis Suisse. Los datos que guarda son expedientes
clínicos: nombre, identidad, teléfono, diagnósticos, tratamientos y
medicamentos de cada paciente.

Las restricciones reales del proyecto, y no las que uno querría tener:

- **No hay quién opere un servidor.** No existe un área de sistemas: la
  clínica es la doctora y su asistente. Cualquier cosa que haya que
  monitorear, respaldar o parchear a mano queda sin hacer.
- **No hay presupuesto de infraestructura**, ni para una VM ni para un
  servicio administrado caro.
- **Los datos son sensibles.** Un expediente clínico filtrado no se puede
  deshacer, y la clínica responde por él.
- **Hay concurrencia real, aunque poca.** Dos pacientes pueden abrir el mismo
  día a la misma hora y elegir el mismo horario. Con una sola odontóloga, dos
  citas en el mismo slot significan una persona esperando en la puerta sin
  turno.
- **El equipo es una estudiante.** Todo lo que haya que escribir a mano es
  tiempo que no se dedica al producto, y superficie donde equivocarse.

Las opciones que se consideraron:

1. **Base embebida en el cliente** (SQLite vía WASM, o IndexedDB). Cero
   infraestructura, pero los datos viven en el navegador de cada quien: la
   doctora no vería lo que agenda un paciente desde su casa. Rompe el caso de
   uso central, que es justamente que las dos partes vean la misma agenda.
2. **Backend propio** (Node más Postgres en una VM). Control total, pero
   alguien tiene que desplegarlo, respaldarlo, renovar el certificado y
   aplicar parches de seguridad. Ese alguien no existe.
3. **Postgres gestionado con API generada** (Supabase). Sin servidor propio,
   con la base de datos real y sus garantías, y el control de acceso declarado
   en la propia base.

## Decisión

**Usar Postgres gestionado con RLS y funciones RPC en vez de un backend
propio.** El proveedor es Supabase.

En concreto:

- **PostgREST** expone la base como API REST, sin escribir un servidor.
- **Row Level Security** decide quién ve qué, declarado en SQL
  ([`migracion/011_rls_endurecido.sql`](../../migracion/011_rls_endurecido.sql)).
  El rol `anon` no llega a ninguna tabla.
- **El paciente entra sólo por funciones RPC**: `registrar_paciente`,
  `slots_ocupados`, `crear_solicitud` y `estado_de_mis_citas`. Cada una expone
  exactamente lo que esa pantalla necesita y nada más. `slots_ocupados`
  devuelve las horas tomadas del día sin decir de quién es cada una.
- **Las reglas que no pueden fallar viven en la base, no en el navegador.** El
  índice único parcial de
  [`006`](../../migracion/006_evitar_doble_reserva.sql) garantiza un solo
  paciente por combinación de fecha y hora, y `crear_solicitud` comprueba e
  inserta dentro de la misma sentencia: entre una cosa y la otra no queda
  ventana para que se cuele otro.
- **Las migraciones son scripts SQL numerados y re-ejecutables**, versionados
  en el repo.

## Consecuencias

### A favor

- **Nadie tiene que operar nada.** Respaldos, parches y disponibilidad son del
  proveedor. Para una clínica sin área de sistemas, esto no es comodidad: es
  la diferencia entre que exista el sistema o no.
- **La regla crítica es infalsificable.** Que dos pacientes no compartan
  horario lo garantiza un índice único, no un `if` del cliente. Aunque el
  navegador esté desactualizado, tenga la caché sucia o alguien llame a la API
  directamente, la base rechaza el segundo.
- **El control de acceso es declarativo y auditable.** Está en un archivo SQL
  que se lee entero en cinco minutos, no repartido en middlewares.
- **Se puede comprobar desde afuera.** `npm run verificar:rls` intenta leer las
  tablas con la anon key y falla si alguna responde datos.
- **Superficie mínima.** El paciente no tiene acceso a tablas: tiene acceso a
  cuatro funciones. Aunque se filtre la anon key —y se filtra, va en el
  JavaScript— lo peor que se puede hacer con ella es pedir los horarios
  ocupados de un día.

### En contra

- **Dependencia de un proveedor.** El esquema es Postgres estándar y las
  migraciones son SQL corriente, pero PostgREST, GoTrue y las políticas RLS
  son de Supabase. Mudarse implica reescribir la capa de acceso.
- **La seguridad depende de escribir bien el SQL.** Una política RLS mal
  puesta abre los expedientes sin que nada falle de forma visible. Es un
  riesgo silencioso, y por eso existe el verificador externo.
- **Menos flexibilidad que un backend propio.** Toda lógica de servidor tiene
  que caber en una función de Postgres o en una función serverless de `/api`.
- **Los datos viven fuera del país de la clínica**, en la región del
  proveedor.
- **Hay un límite de uso en el plan gratuito.** Para una clínica con una
  odontóloga queda lejísimos, pero existe.

### Qué se sacrificó

**Control y portabilidad.** Un backend propio habría dejado la lógica de
acceso en código revisable, con tests, en el idioma del equipo, y sin quedar
atada a las decisiones de producto de un tercero.

**Por qué valió la pena para esta clínica:** ese control sólo sirve si hay
alguien que lo ejerza, y acá no lo hay. Un servidor propio sin nadie que lo
mantenga no es más seguro que uno gestionado: es menos, porque los parches no
se aplican y los respaldos no se prueban. Cambiar código propio por SQL
declarativo concentra el riesgo en un archivo corto que se puede leer, probar
y verificar desde afuera —y deja la garantía que de verdad importa para el
negocio, un paciente por horario, escrita como un índice único que nadie puede
saltarse desde el navegador.
