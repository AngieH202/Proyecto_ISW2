# Arquitectura — DentaAgenda

Sistema de citas odontológicas para la clínica de la Dra. Belkis Suisse.
Proyecto ISW II.

Las decisiones estructurales están registradas aparte, en
[`docs/adr/`](adr/): [ADR-001 — evolución](adr/ADR-001-evolucion.md) y
[ADR-002 — autenticación](adr/ADR-002-auth.md).

---

## Nivel 1 — Contexto

Quién usa el sistema y con qué se apoya.

```mermaid
C4Context
    title Nivel 1 - Contexto del sistema DentaAgenda

    Person(paciente, "Paciente", "Registra sus datos, elige día y hora, y consulta el estado de su cita con su número de identidad")
    Person(doctora, "Doctora", "Revisa la agenda del día, confirma o rechaza solicitudes y lleva el expediente clínico de cada paciente")

    System(dentaagenda, "DentaAgenda", "Aplicación web de agendamiento de citas odontológicas: sitio estático más funciones serverless")

    System_Ext(supabase, "Supabase", "Backend como servicio: PostgREST sobre PostgreSQL más autenticación GoTrue")

    Rel(paciente, dentaagenda, "Solicita cita y consulta su estado", "HTTPS")
    Rel(doctora, dentaagenda, "Administra agenda, solicitudes y expedientes", "HTTPS")
    Rel(dentaagenda, supabase, "Funciones RPC para el paciente; tablas para la doctora, firmadas del lado del servidor", "REST / JSON")

    UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

---

## Nivel 2 — Contenedores

Las piezas desplegables. El sitio sigue siendo estático, pero ya no es lo
único: hay un puñado de funciones serverless que existen para que el token
de la doctora nunca baje al navegador.

```mermaid
C4Container
    title Nivel 2 - Contenedores de DentaAgenda

    Person(paciente, "Paciente", "Agenda y consulta citas")
    Person(doctora, "Doctora", "Gestiona agenda y expedientes")

    Container_Boundary(cliente, "Navegador - sitio estático") {
        Container(landing, "Landing", "landing.html", "Página de presentación. Sus enlaces de entrada apuntan a index.html con el parámetro app igual a 1")
        Container(spa, "Aplicación pública", "index.html", "Login, registro del paciente y flujo de agendamiento. Se sirve sin sesión, así que no lleva nada del portal")
        Container(js, "Lógica pública", "assets/js - app.js y módulos", "Flujo del paciente. Solo llama funciones RPC")
        Container(adminjs, "Panel de la doctora", "assets/js/admin.js", "Agenda, pendientes y expedientes. Solo se descarga detrás de la sesión")
        Container(sw, "Service worker", "sw.js", "Precarga los estáticos y guarda las últimas respuestas. Deja la app usable sin conexión")
    }

    Container_Boundary(serverless, "Funciones serverless - /api") {
        Container(sesion, "Sesión", "api/session.js", "Cambia el access_token por una cookie HttpOnly firmada, y la borra al salir")
        Container(portal, "Portal", "api/admin.js", "Sirve el marcado del panel solo si la cookie es válida")
        Container(proxy, "Proxy de datos", "api/db.js", "Firma con el token de la doctora las consultas a las tablas permitidas")
    }

    System_Boundary(sb, "Supabase") {
        Container(gotrue, "Auth API", "GoTrue - auth/v1", "Login por email y contraseña de la cuenta de la doctora")
        Container(postgrest, "REST API", "PostgREST - rest/v1", "Tablas y funciones RPC, con RLS por rol")
        ContainerDb(pg, "Base de datos", "PostgreSQL", "Tablas citas, expedientes y visitas_clinicas, más las funciones que usa el paciente")
    }

    Rel(paciente, spa, "Agenda y consulta", "HTTPS")
    Rel(doctora, spa, "Inicia sesión", "HTTPS")
    Rel(landing, spa, "Entrar a la app", "enlace con app igual a 1")
    Rel(spa, js, "Carga y expone handlers en window", "script type module")
    Rel(spa, sw, "Registra", "navigator.serviceWorker")
    Rel(js, gotrue, "Autentica a la doctora", "POST token")
    Rel(js, sesion, "Entrega el token una sola vez", "POST /api/session")
    Rel(doctora, portal, "Abre el panel", "GET /admin")
    Rel(portal, adminjs, "Sirve el marcado privado", "solo con cookie válida")
    Rel(adminjs, proxy, "Consulta y modifica registros", "GET, POST, PATCH /api/db")
    Rel(proxy, postgrest, "Reenvía firmado con el token de la doctora", "rol autenticado")
    Rel(js, postgrest, "Solo funciones RPC", "anon no toca tablas")
    Rel(postgrest, pg, "Lee y escribe", "SQL")

    UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

Las dos mitades no comparten nada más que el dominio: el paciente entra por
funciones RPC que exponen exactamente lo que esa pantalla necesita, y la
doctora entra por un proxy que firma del lado del servidor. Ninguna de las
dos manda credenciales de administración al navegador.

### Pantallas dentro de `index.html`

No hay router: las cuatro pantallas conviven en el DOM y `showScreen()` alterna
la clase `.active`.

| Pantalla | `id` | Para quién |
| --- | --- | --- |
| Login / registro / consulta de estado | `screen-login` | Ambos |
| Estado de la cita | `screen-estado` | Paciente |
| Panel de la doctora | `screen-doctora` | Doctora |
| Expediente de un paciente | `screen-expediente` | Doctora |

---

## Nivel 3 — Componentes

Dentro del contenedor `assets/js`. Las flechas son dependencias reales de
`import`; el grafo es acíclico y `config.js` y `utils.js` son las hojas.

```mermaid
C4Component
    title Nivel 3 - Componentes del contenedor assets/js

    Container_Boundary(js, "assets/js - módulos ES") {
        Component(app, "app.js", "Entrypoint público", "Carga los módulos del paciente por su efecto: cada uno publica en window lo que el HTML nombra")
        Component(admin, "admin.js", "Entrypoint privado", "Panel de la doctora: agenda del día, pendientes, expedientes, historial y registro de visitas")
        Component(auth, "auth.js", "Módulo", "setRole, loginDoctora, loginPaciente, consultarEstado y logout")
        Component(sesion, "sesion.js", "Módulo", "abrirSesion, cerrarSesion y haySesion contra /api/session")
        Component(patient, "patient.js", "Módulo", "Calendario semanal, slots por día, pasos 1 a 4 y envío de la solicitud")
        Component(api, "api.js", "Módulo", "sbRpc, sbGet, sbPost, sbPatch y authLogin. Elige destino según haya sesión o no")
        Component(cache, "cache.js", "Módulo", "Caché en memoria con vencimiento por entrada e invalidación por tabla")
        Component(utils, "utils.js", "Módulo", "notif, showError, showScreen, labelEstado, iniciales, fechas y escapar")
        Component(config, "config.js", "Módulo", "URL y anon key, usuario y email de la doctora, horarios base y nombres de días y meses")
    }

    System_Ext(supabase, "Supabase", "REST API y Auth API")
    System_Ext(proxy, "/api/db", "Proxy con sesión")

    Rel(app, auth, "Importa por efecto", "registra handlers")
    Rel(app, patient, "Importa por efecto", "registra handlers")
    Rel(admin, api, "Consulta y modifica registros")
    Rel(admin, utils, "Usa helpers y escapa datos")
    Rel(admin, sesion, "Cerrar sesión")
    Rel(auth, patient, "setPacienteData y resetSeleccion")
    Rel(auth, sesion, "Abre la sesión con el token")
    Rel(auth, api, "Autentica y llama RPC")
    Rel(auth, config, "Lee credenciales")
    Rel(patient, api, "Llama RPC de horarios y solicitud")
    Rel(patient, config, "Lee horarios base")
    Rel(api, cache, "Guarda lecturas e invalida al escribir")
    Rel(api, supabase, "RPC y login", "HTTPS")
    Rel(api, proxy, "Tablas, solo con sesión", "HTTPS")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

`api.js` tiene un solo interruptor: si existe `window.__sesion` habla con
`/api/db`, y si no, con Supabase y únicamente por RPC. Ese interruptor es lo
que mantiene separadas las dos mitades sin duplicar el cliente HTTP.

### Tamaño de cada componente

| Archivo | Líneas | Responsabilidad |
| --- | ---: | --- |
| `assets/js/admin.js` | 417 | Panel de la doctora, detrás de la sesión |
| `assets/js/modules/patient.js` | 293 | Flujo de agendamiento del paciente |
| `assets/js/modules/auth.js` | 191 | Login, roles y consulta de estado |
| `assets/js/modules/api.js` | 126 | Cliente HTTP: RPC, tablas y caché |
| `assets/js/modules/cache.js` | 73 | Caché en memoria con vencimiento |
| `assets/js/modules/utils.js` | 57 | Helpers de UI, formato y escapado |
| `assets/js/modules/sesion.js` | 36 | Ciclo de vida de la cookie de sesión |
| `assets/js/app.js` | 20 | Entrypoint público |
| `assets/js/modules/config.js` | 9 | Constantes |

Del lado serverless: `api/db.js` (67), `api/health.js` (73), `api/admin.js`
(61), `api/session.js` (54) y `api/_sesion.js` (47), que valida la cookie.

### El puente hacia `window`

El HTML invoca las funciones desde atributos `onclick`, pero un
`<script type="module">` tiene scope propio y no crea globales. Por eso cada
módulo publica en `window` **solo** las funciones que el marcado nombra:

- `auth.js` → `setRole`, `loginDoctora`, `loginPaciente`, `consultarEstado`, `logout`
- `patient.js` → `selDia`, `selSlot`, `cambiarSemana`, `irPaso1`, `irPaso2`, `irPaso3`, `enviarSolicitud`, `nuevaCita`
- `app.js` → los handlers del panel de la doctora, más `showScreen` reexportado desde `utils.js`

Estado compartido que también vive en `window`, con un solo módulo que lo
define: `cargarCitas`, `cargarPendientes`, `cargarExpedientes` y
`expedienteActual`.

---

## Modelo de datos

```mermaid
erDiagram
    expedientes ||--o{ visitas_clinicas : "registra"
    expedientes ||..o{ citas : "se vincula por nombre_paciente"

    expedientes {
        bigint id PK
        text nombre
        text identidad "documento de identidad del paciente"
        int edad
        text telefono
        int visitas "contador denormalizado"
        text ultima_visita
        text notas
    }

    visitas_clinicas {
        bigint id PK
        bigint expediente_id FK
        text fecha
        text hora
        text diagnostico
        text tratamientos "lista separada por comas"
        text medicamentos
        text plan
        text notas
        timestamptz created_at
    }

    citas {
        bigint id PK
        text nombre_paciente "sin FK, se cruza por nombre"
        text telefono_paciente
        text fecha "formato YYYY-MM-DD"
        text hora "slot, por ejemplo 9:15 AM"
        text motivo
        text estado
        timestamptz created_at
    }
```

La relación entre `citas` y `expedientes` está punteada a propósito: **no hay
llave foránea**. El código cruza las dos tablas comparando `nombre_paciente`
contra `nombre` como texto exacto, así que dos pacientes homónimos comparten
expediente y un nombre escrito distinto no encuentra ninguno.

### Ciclo de vida de una cita

```mermaid
stateDiagram-v2
    [*] --> pendiente : el paciente envía la solicitud

    pendiente --> confirmada : la doctora confirma
    pendiente --> cancelada : la doctora rechaza
    pendiente --> atendida : marcar atendida
    pendiente --> nopresento : marcar no se presentó

    confirmada --> atendida : marcar atendida
    confirmada --> nopresento : marcar no se presentó

    atendida --> [*] : abre el modal y registra una visita clínica
    cancelada --> [*]
    nopresento --> [*]
```

Los slots ocupados se calculan excluyendo únicamente el estado `cancelada`, así
que una cita `nopresento` sigue bloqueando su horario.

---

## Decisiones de arquitectura

Las dos estructurales están registradas como ADR, con su contexto y sus
consecuencias completas:

- [**ADR-001**](adr/ADR-001-evolucion.md) — Evolución de DentaAgenda para
  mejorar su facilidad de uso.
- [**ADR-002**](adr/ADR-002-auth.md) — Guardar la sesión de la doctora en una
  cookie HttpOnly emitida por el servidor, en vez del token en el navegador.

El resto son decisiones menores, que no ameritan un documento propio:

| Decisión | Motivo | Costo que acepta |
| --- | --- | --- |
| Módulos ES nativos, sin bundler | Cero dependencias y cero paso de build | No se puede abrir con doble clic: los módulos exigen `http://`, no `file://` |
| Handlers en `onclick` dentro del HTML | Es el marcado original, migrarlo era un cambio aparte | Obliga al puente hacia `window` descrito arriba |
| Landing y app en archivos separados | La landing carga sin esperar la lógica de la app | Hace falta el parámetro `app=1` y el redirect en el `<head>` |
| Panel en `admin.js`, fuera de `index.html` | `index.html` se sirve sin sesión; el marcado privado no debe viajar a quien no entró | Una petición más al abrir el portal |
| Tests con el runner nativo de Node | Cero dependencias, como el resto del proyecto | Hay que pasar globs en los scripts, y expandirlos pide Node 21 o más |

---

## Deuda técnica conocida

Puntos abiertos, en orden de importancia:

1. **`citas` y `expedientes` todavía no tienen llave foránea.** Las citas nuevas
   ya guardan `identidad`, así que cruzan bien; las viejas siguen cruzándose por
   nombre. Falta rellenar lo histórico y recién ahí poner la FK.
2. **Fechas y horas se guardan como texto.** `hora` es un literal de slot
   (`'9:15 AM'`), lo que fuerza el parseo manual que hace `cargarSlotsDia()`
   para decidir si un horario ya pasó. Es el origen del caso raro de las 12:15
   PM, que hay que probar aparte.
3. **`admin.js` hace de todo**: agenda, pendientes, expedientes, historial y
   modal de diagnóstico en un solo archivo de 417 líneas. Partirlo en
   `agenda.js` y `expedientes.js` dejaría los módulos parejos.
4. **El expediente se busca por nombre exacto.** `marcarAtendida` cruza
   `nombre_paciente` contra `nombre`; un nombre escrito distinto no encuentra
   expediente. El cruce por `identidad`, que las citas ya guardan, es lo que
   resolvería esto junto con el punto 1.
5. **`visitas` en `expedientes` sigue siendo un contador denormalizado.** Ya no
   se desincroniza —el cliente escribe un recuento absoluto— pero el dato sigue
   duplicado respecto de `visitas_clinicas`. El trigger de
   `migracion/007_sincronizar_visitas.sql` lo hace responsabilidad de la base.

---

## Caché

Tres niveles, cada uno resolviendo un problema distinto.

**Datos, en memoria** — [`assets/js/modules/cache.js`](assets/js/modules/cache.js).
`sbGet` guarda cada respuesta bajo la clave `tabla?query` con vencimiento de 30 s
por defecto, y toda escritura invalida las claves de la tabla afectada. Ataca la
redundancia medible: `cargarExpedientes()` trae la tabla entera y se dispara en
cada cambio a la pestaña Expedientes. Vive mientras viva la pestaña; al recargar
arranca vacía, a propósito — guardar expedientes clínicos en disco es una
decisión aparte, no un efecto secundario de querer menos peticiones.

Una dependencia cruzada que no es obvia: escribir en `visitas_clinicas` invalida
también `expedientes`, porque el trigger de `007` mueve el contador del lado de
la base.

**Lo que nunca se cachea.** Cinco lecturas van con `{ cache: false }`, y no es
una optimización sino una condición de correctitud: de ellas depende si se
escribe o no. Servir una respuesta vieja ahí dejaría pasar un duplicado y
desharía el trabajo de idempotencia. `cache: false` manda `no-store` en el
`fetch`, así que también saltea la caché del service worker.

| Lectura | Por qué debe ser fresca |
| --- | --- |
| `cargarSlotsDia` | Mostrar libre un horario ya tomado es el peor error de esa pantalla |
| `enviarSolicitud` · quién ocupa el slot | Decide si se crea la cita |
| `guardarDiagnostico` · visita duplicada | Decide si se inserta |
| `guardarDiagnostico` · conteo de visitas | Ese número se escribe |
| `abrirExpediente` · relectura | Su sentido es traer el expediente al día |

**Offline, con service worker** — [`sw.js`](sw.js). Precarga los estáticos y
sirve los datos con **red primero y caché de respaldo**. No es
stale-while-revalidate a propósito: esta app lee las mismas tablas que escribe,
así que servir datos viejos a alguien con conexión mostraría horarios libres que
ya no lo están. Con red se ve lo último; sin red, lo último que se vio. Nunca
toca `POST`, `PATCH` ni el login.

**Estáticos, por versionado** — `node scripts/versionar.mjs` sella el CSS y el JS
de entrada con el hash de su contenido y renombra las cachés del service worker.
Correrlo antes de publicar es lo que impide que un navegador siga sirviendo la
versión anterior. El script es idempotente: si nada cambió, no toca ningún
archivo.

Para inspeccionarla desde la consola del navegador: `cacheEstado()` devuelve
entradas, aciertos, fallos y tasa de aciertos; `cacheLimpiar()` la vacía.

---

## Idempotencia

Los tres caminos de escritura dejan el mismo estado se ejecuten una o diez
veces. Cada uno lo consigue distinto:

| Operación | Cómo se vuelve repetible |
| --- | --- |
| `loginPaciente` | `upsert` sobre `identidad` en una sola ida. Manda solo los datos que el paciente escribe: incluir `visitas` o `ultima_visita` le borraría el historial a quien vuelve |
| `enviarSolicitud` | Consulta quién ocupa el horario y decide por **identidad**, no por nombre: si la cita ya es suya muestra la confirmación, si es de otro avisa sin intentar crearla. El nombre solo se usa de respaldo para las citas viejas, creadas antes de que se guardara `identidad` |
| `guardarDiagnostico` | Descarta por clave natural —expediente, día y diagnóstico— y después escribe un recuento **absoluto** de visitas, no un incremento sobre la copia local |

`marcarAtendida`, `cambiarEstado` y `accionPendiente` ya lo eran: hacen `PATCH`
a un valor fijo.

Del lado de la base, los scripts de `migracion/` además **convergen**: correrlos
sobre una base que ya existe le agrega las columnas y restricciones que le
falten, en vez de no hacer nada. `migracion/010_comprobaciones.sql` verifica que
no haya quedado nada duplicado.

---

## Calidad

```mermaid
flowchart LR
    dev["git push"] --> ci["GitHub Actions<br/>.github/workflows/main.yml"]
    ci --> instalar["npm ci --ignore-scripts<br/>versiones fijadas por el lock"]
    instalar --> tests["npm test<br/>runner nativo de Node"]
    tests --> cob["npm run cobertura<br/>coverage/lcov.info"]
    cob --> sonar["SonarCloud<br/>bugs, vulnerabilidades y duplicación"]
```

**Tests** — 124 casos en [`test/`](../test/), sin dependencias. Cada archivo es
autocontenido: monta un DOM mínimo y una base falsa que aplica las mismas
reglas que el SQL, incluido el índice único de `006`. El caso central es
`doble-reserva`: dos personas no pueden quedarse con el mismo horario, y se
prueba de las dos puntas.

**Cobertura** — `npm run cobertura` deja `coverage/lcov.info` y
`coverage/coverage-summary.json`, ambos versionados. Hoy: **92.23% de líneas**
(1127/1222), 80.77% de funciones, 78.13% de ramas. El script sale con error si
las líneas bajan del 60%.

**Integración continua** — el workflow instala con `npm ci --ignore-scripts`
—versiones exactas del lock y sin ejecutar hooks de terceros— y corre la suite
en Node 24.

---

## Estructura de archivos

```
Proyecto_ISW2/
├── landing.html              página de presentación
├── index.html                app pública: login y flujo del paciente
├── sw.js                     service worker: offline y caché de datos
├── manifest.json             metadatos de la PWA
├── vercel.json               rutas: /login, /admin y las funciones
├── docs/
│   ├── arquitectura.md       este documento
│   └── adr/                  decisiones registradas
│       ├── ADR-001-evolucion.md
│       └── ADR-002-auth.md
├── api/                      funciones serverless
│   ├── session.js            emite y borra la cookie de sesión
│   ├── admin.js              sirve el portal solo con sesión válida
│   ├── db.js                 proxy firmado hacia las tablas
│   ├── health.js             chequeo de estado
│   └── _sesion.js            validación de la cookie
├── scripts/
│   ├── cobertura.mjs         genera coverage/ y exige el mínimo
│   ├── versionar.mjs         sella los estáticos con el hash del contenido
│   ├── verificar-sitio.mjs   audita el sitio en vivo
│   └── verificar-rls.mjs     comprueba que anon no llegue a las tablas
├── coverage/                 reportes de cobertura, versionados
├── test/                     unidad e integración, runner nativo
├── migracion/                scripts SQL de la base
└── assets/
    ├── css/app.css           estilos de la app
    └── js/
        ├── app.js            entrypoint público
        ├── admin.js          panel de la doctora
        └── modules/
            ├── config.js     constantes y credenciales públicas
            ├── cache.js      caché en memoria con vencimiento
            ├── api.js        cliente HTTP: RPC o proxy según la sesión
            ├── utils.js      helpers de UI, formato y escapado
            ├── sesion.js     ciclo de vida de la cookie
            ├── auth.js       login, roles y consulta de estado
            └── patient.js    flujo de agendamiento
```

> Los módulos ES no cargan por `file://`. Para abrir la app hay que servirla
> por HTTP desde la raíz del proyecto y entrar por `landing.html`, o
> directamente a `index.html?app=1`.
