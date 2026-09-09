# Tests

Runner nativo de Node (`node:test`). **Sin dependencias**, como el resto del
proyecto.

```bash
npm test                  # todo
npm run test:unidad
npm run test:integracion
```

En Windows la forma `node --test test/unidad` falla; hay que pasar un glob, y
por eso los scripts de `package.json` los usan.

## Qué se prueba

Funciones de la app, no invariantes del repo. Cada archivo llama a las mismas
funciones que llama el HTML.

| Archivo | Funciones | Qué cuida |
| --- | --- | --- |
| `unidad/calendario.test.mjs` | `obtenerDiasSemana`, `formatoFechaKey`, `formatoFechaLabel`, `esPasado`, `cambiarSemana`, `selDia`, `labelEstado`, `iniciales` | Que el paciente vea los días hábiles correctos y mande una fecha que la base entienda |
| `unidad/cache.test.mjs` | `clave`, `leer`, `guardar`, `invalidar`, `limpiar`, `estado` | Que una escritura tire lo que quedó viejo, incluida la lista de expedientes cuando se guarda una visita |
| `integracion/doble-reserva.test.mjs` | `loginPaciente`, `enviarSolicitud`, `cargarSlotsDia` | **Dos personas no pueden agendar el mismo horario** |
| `integracion/formulario.test.mjs` | `loginPaciente`, `consultarEstado` | Que no pase un registro con un campo vacío, campo por campo |
| `integracion/horarios.test.mjs` | `irPaso1`, `irPaso2`, `irPaso3`, `cargarSlotsDia`, `enviarSolicitud` | Qué se puede pulsar: sin día no se avanza, y las horas tomadas o ya pasadas quedan bloqueadas |
| `integracion/paciente.test.mjs` | `loginPaciente`, `consultarEstado` | Alta sin duplicar expedientes y consulta que no filtra citas ajenas |
| `integracion/doctora.test.mjs` | `cargarCitas`, `cargarPendientes`, `accionPendiente`, `marcarAtendida`, `cambiarEstado`, `guardarDiagnostico`, `abrirExpediente`, `filtrarExpedientes` | El panel: confirmar, rechazar, atender y registrar la visita sin duplicarla |
| `integracion/login-doctora.test.mjs` | `loginDoctora`, `abrirSesion`, `cerrarSesion`, `haySesion` | La puerta del portal: sin credenciales buenas no se entra, y el token se cambia por una cookie en vez de quedarse en el navegador |

El caso central es `doble-reserva`: si dos pacientes agendan la misma fecha y
hora, la doctora tiene dos personas en la puerta a las 10:00 y ya no hay forma
de arreglarlo. Se prueba de las dos puntas — el paciente que llega segundo
recibe `ocupado` y vuelve al paso de horarios, y la cita que la doctora rechaza
libera el slot para los demás.

## Cómo está armado cada archivo

Todo lo común vive en **`entorno.mjs`** — un archivo suelto, no una carpeta, y
sin dependencias. Cada test empieza con dos líneas:

```js
const { el, escribir, leerNotif, limpiarNotif } = instalarDom();
const { db, peticiones } = instalarBaseFalsa();
```

1. **`instalarDom()`** monta un DOM mínimo. No pretende ser un navegador:
   sostiene lo que la app usa de verdad — `.value`, `.innerHTML`,
   `.textContent`, `.classList`. Tiene que quedar montado **antes** de importar
   nada de `assets/js`, porque los módulos publican sus handlers en `window` al
   cargarse. Devuelve los atajos para leer y escribir campos.
2. **`instalarBaseFalsa()`** pone una base en el `fetch` global: las cuatro RPC
   de `011_rls_endurecido.sql` con la misma semántica del SQL. Con
   `{ tablas: true }` sirve además las tablas por PostgREST —filtros `eq` y
   `neq`, insert, patch y el índice único parcial de `006`—, que es lo único que
   ve el portal. Sin esa opción, pedir una tabla responde 404: eso es lo que
   vuelve real el test de que el paciente sólo puede llamar funciones.

Devuelve `db` para preparar o revisar el estado, y `peticiones`, que es lo que
permite afirmar *qué* llamó el cliente —y con qué query— y no sólo en qué estado
quedó la base.

Lo que no se comparte queda en su archivo: el Supabase Auth falso de
`login-doctora.test.mjs`, por ejemplo, lo usa un solo test.

## Contra el sitio en vivo

Están aparte, en `scripts/`, porque se corren a mano contra producción:

```bash
npm run verificar:sitio   # los checks del entregable
npm run verificar:rls     # que anon no llegue a las tablas
```

## Al agregar un test

Los archivos van como `<tema>.test.mjs` en `unidad/` (funciones puras) o
`integracion/` (flujos contra la base falsa), y arrancan importando lo que
necesiten de `../entorno.mjs`. Cada archivo corre en su propio proceso, así que
se puede ensuciar `globalThis` sin afectar a los demás.
