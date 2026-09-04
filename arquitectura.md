# Arquitectura — DentaAgenda

Sistema de citas odontológicas para la clínica de la Dra. Belkis Suisse.
Proyecto ISW II.

---

## Nivel 1 — Contexto

Quién usa el sistema y con qué se apoya.

```mermaid
C4Context
    title Nivel 1 - Contexto del sistema DentaAgenda

    Person(paciente, "Paciente", "Registra sus datos, elige día y hora, y consulta el estado de su cita con su número de identidad")
    Person(doctora, "Doctora", "Revisa la agenda del día, confirma o rechaza solicitudes y lleva el expediente clínico de cada paciente")

    System(dentaagenda, "DentaAgenda", "Aplicación web estática de agendamiento de citas odontológicas")

    System_Ext(supabase, "Supabase", "Backend como servicio: PostgREST sobre PostgreSQL más autenticación GoTrue")

    Rel(paciente, dentaagenda, "Solicita cita y consulta su estado", "HTTPS")
    Rel(doctora, dentaagenda, "Administra agenda, solicitudes y expedientes", "HTTPS")
    Rel(dentaagenda, supabase, "Lee y escribe citas, expedientes y visitas clínicas", "REST / JSON")

    UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

---

## Nivel 2 — Contenedores

Las piezas desplegables. No hay servidor de aplicación: todo se sirve como
archivos estáticos y el navegador es el único entorno de ejecución propio.

```mermaid
C4Container
    title Nivel 2 - Contenedores de DentaAgenda

    Person(paciente, "Paciente", "Agenda y consulta citas")
    Person(doctora, "Doctora", "Gestiona agenda y expedientes")

    Container_Boundary(cliente, "Navegador - sitio estático") {
        Container(landing, "Landing", "landing.html", "Página de presentación con estilos embebidos. Sus enlaces de entrada apuntan a index.html con el parámetro app igual a 1")
        Container(spa, "Aplicación", "index.html", "Marcado de las cuatro pantallas. Un script clásico en el head redirige a la landing si falta el parámetro app")
        Container(css, "Hoja de estilos", "assets/css/app.css", "Estilos de la aplicación")
        Container(js, "Lógica de la aplicación", "assets/js - módulos ES", "Entrypoint app.js más seis módulos. Sin bundler ni dependencias")
        Container(sw, "Service worker", "sw.js", "Precarga los estáticos y guarda las últimas respuestas de datos. Es lo que deja la app usable sin conexión")
    }

    System_Boundary(sb, "Supabase") {
        Container(gotrue, "Auth API", "GoTrue - auth/v1", "Login por email y contraseña de la cuenta de la doctora")
        Container(postgrest, "REST API", "PostgREST - rest/v1", "CRUD sobre las tablas, autenticado con la anon key")
        ContainerDb(pg, "Base de datos", "PostgreSQL", "Tablas citas, expedientes y visitas_clinicas")
    }

    Rel(paciente, landing, "Entra al sitio", "HTTPS")
    Rel(doctora, landing, "Entra al sitio", "HTTPS")
    Rel(landing, spa, "Entrar a la app", "enlace con app igual a 1")
    Rel(spa, css, "Carga", "link rel stylesheet")
    Rel(spa, js, "Carga y expone handlers en window", "script type module")
    Rel(spa, sw, "Registra", "navigator.serviceWorker")
    Rel(js, sw, "Sus peticiones pasan por acá", "intercepta fetch")
    Rel(sw, gotrue, "Deja pasar sin tocar", "nunca se cachea")
    Rel(sw, postgrest, "Red primero, caché de respaldo", "solo GET")
    Rel(js, gotrue, "Autentica a la doctora", "POST token")
    Rel(js, postgrest, "Consulta y modifica registros", "GET, POST, PATCH")
    Rel(postgrest, pg, "Lee y escribe", "SQL")

    UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

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
        Component(app, "app.js", "Entrypoint", "Panel de la doctora: agenda del día, bandeja de pendientes, listado de expedientes, historial de visitas y modal de diagnóstico")
        Component(auth, "auth.js", "Módulo", "setRole, loginDoctora, loginPaciente, consultarEstado y logout")
        Component(patient, "patient.js", "Módulo", "Calendario semanal, slots por día, pasos 1 a 4 del flujo y envío de la solicitud")
        Component(api, "api.js", "Módulo", "sbGet, sbPost, sbPatch, sbUpsert y authLogin sobre fetch. Cachea las lecturas e invalida al escribir")
        Component(cache, "cache.js", "Módulo", "Caché en memoria con vencimiento por entrada, invalidación por tabla y métricas de aciertos")
        Component(utils, "utils.js", "Módulo", "notif, showError, hideError, showScreen, labelEstado, iniciales, fechaHoy y horaAhora")
        Component(config, "config.js", "Módulo", "URL y anon key de Supabase, usuario y email de la doctora, horarios base y nombres de días y meses")
    }

    System_Ext(supabase, "Supabase", "REST API y Auth API")

    Rel(app, auth, "Importa por efecto", "registra handlers")
    Rel(app, patient, "Importa por efecto", "registra handlers")
    Rel(app, api, "Consulta datos")
    Rel(app, utils, "Usa helpers")
    Rel(auth, patient, "setPacienteData y resetSeleccion")
    Rel(auth, api, "Autentica y consulta")
    Rel(auth, utils, "Usa helpers")
    Rel(auth, config, "Lee credenciales")
    Rel(patient, api, "Consulta y crea citas")
    Rel(patient, utils, "Usa helpers")
    Rel(patient, config, "Lee horarios base")
    Rel(api, config, "Lee URL y anon key")
    Rel(api, cache, "Guarda lecturas e invalida al escribir")
    Rel(api, supabase, "fetch", "HTTPS")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

### Tamaño de cada componente

| Archivo | Líneas | Responsabilidad |
| --- | ---: | --- |
| `assets/js/app.js` | 337 | Entrypoint y todo el panel de la doctora |
| `assets/js/modules/patient.js` | 267 | Flujo de agendamiento del paciente |
| `assets/js/modules/auth.js` | 164 | Login, roles y consulta de estado |
| `assets/js/modules/utils.js` | 47 | Helpers de UI y formato |
| `assets/js/modules/api.js` | 44 | Cliente HTTP de Supabase |
| `assets/js/modules/config.js` | 9 | Constantes |

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

| Decisión | Motivo | Costo que acepta |
| --- | --- | --- |
| Sitio estático, sin backend propio | Nada que desplegar ni mantener; publicable en GitHub Pages | Toda la lógica y las credenciales quedan del lado del cliente |
| Módulos ES nativos, sin bundler | Cero dependencias y cero paso de build | Ya no se puede abrir con doble clic: los módulos exigen `http://`, no `file://` |
| Handlers en `onclick` dentro del HTML | Es el marcado original, migrarlo era un cambio aparte | Obliga al puente hacia `window` descrito arriba |
| Landing y app en archivos separados | La landing carga sin esperar la lógica de la app | Hace falta el parámetro `app=1` y el redirect en el `<head>` |
| Supabase como backend | Base de datos y API REST sin escribir servidor | El acceso a datos depende por completo de cómo estén las políticas RLS |

---

## Deuda técnica conocida

Puntos abiertos, en orden de importancia:

1. **El control de acceso es decorativo.** `loginDoctora()` valida el usuario
   contra una constante en el cliente y luego autentica de verdad contra
   GoTrue — pero el token que devuelve no se usa: *todas* las lecturas y
   escrituras posteriores van con la anon key. Si las políticas RLS de las
   tablas no están restringidas, cualquiera con la URL del proyecto puede leer
   y modificar los expedientes clínicos completos. Es lo primero que conviene
   revisar antes de usar esto con datos reales de pacientes.
2. **`citas` y `expedientes` todavía no tienen llave foránea.** Las citas nuevas
   ya guardan `identidad`, así que cruzan bien; las viejas siguen cruzándose por
   nombre. Falta rellenar lo histórico y recién ahí poner la FK.
3. **Fechas y horas se guardan como texto.** `hora` es un literal de slot
   (`'9:15 AM'`), lo que fuerza el parseo manual que hace `cargarSlotsDia()`
   para decidir si un horario ya pasó.
4. **`app.js` mezcla dos responsabilidades**: es el entrypoint y a la vez todo
   el panel de la doctora. Partirlo en `doctora.js` y `expedientes.js` dejaría
   los seis módulos parejos.
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

## Estructura de archivos

```
Proyecto_ISW2/
├── landing.html              página de presentación
├── index.html                marcado de la app y redirect a la landing
├── sw.js                     service worker: offline y caché de datos
├── manifest.json             metadatos de la PWA
├── package.json              solo { "type": "module" }
├── arquitectura.md           este documento
├── scripts/
│   └── versionar.mjs         sella los estáticos con el hash del contenido
├── migracion/                scripts SQL de la base
└── assets/
    ├── icono.svg             icono de la app
    ├── icono-maskable.svg    variante con zona segura para Android
    ├── css/
    │   └── app.css           estilos de la app
    └── js/
        ├── app.js            entrypoint y panel de la doctora
        └── modules/
            ├── config.js     constantes y credenciales
            ├── cache.js      caché en memoria con vencimiento
            ├── api.js        cliente HTTP de Supabase
            ├── utils.js      helpers de UI y formato
            ├── auth.js       login, roles y consulta de estado
            └── patient.js    flujo de agendamiento
```

> Los módulos ES no cargan por `file://`. Para abrir la app hay que servirla
> por HTTP desde la raíz del proyecto y entrar por `landing.html`, o
> directamente a `index.html?app=1`.
