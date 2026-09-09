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

Cada test es **autocontenido**: no hay carpeta de ayudas ni dependencias. Arriba
de cada archivo hay dos bloques y después las pruebas.

1. **DOM mínimo.** No pretende ser un navegador: sostiene lo que la app usa de
   verdad — `.value`, `.innerHTML`, `.textContent`, `.classList`. Tiene que
   quedar montado **antes** de importar nada de `assets/js`, porque los módulos
   publican sus handlers en `window` al cargarse.
2. **Base falsa**, en el `fetch` global, con sólo lo que ese archivo necesita:
   las RPC de `011_rls_endurecido.sql` para el paciente, y los filtros `eq`,
   `insert` y `patch` de PostgREST más el índice único de `006` para el panel.
   Guarda además el registro de peticiones, que es lo que permite afirmar *qué*
   llamó el cliente —y con qué query— y no sólo en qué estado quedó la base.

Se repite algo de código entre archivos y está bien: cada uno corre en su propio
proceso y se lee entero sin saltar a otro lado.

## Contra el sitio en vivo

Están aparte, en `scripts/`, porque se corren a mano contra producción:

```bash
npm run verificar:sitio   # los checks del entregable
npm run verificar:rls     # que anon no llegue a las tablas
```

## Al agregar un test

Los archivos van como `<tema>.test.mjs` en `unidad/` (funciones puras) o
`integracion/` (flujos contra la base falsa). Lo más rápido es copiar la
cabecera de un archivo parecido. Cada archivo corre en su propio proceso, así
que se puede ensuciar `globalThis` sin afectar a los demás.
