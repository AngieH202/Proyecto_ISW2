# ADR-002 — Guardar la sesión de la doctora en una cookie HttpOnly emitida por el servidor, en vez del token en el navegador

- **Estado:** aceptada
- **Fecha:** 2026-09-10
- **Ámbito:** autenticación y sesión
- **Relacionada:** [ADR-001 — persistencia](ADR-001-persistencia.md)

## Contexto

Hay dos clases de usuario con necesidades opuestas:

- El **paciente** no tiene cuenta. Entra, escribe su nombre e identidad, y
  agenda. Pedirle que se registre con contraseña sería perder pacientes: la
  mitad llama por teléfono justamente para no lidiar con eso.
- La **doctora** sí tiene cuenta, y detrás de ella está todo: la agenda
  completa, los teléfonos y los expedientes clínicos.

La primera versión del sistema tenía un login que **no cambiaba nada**.
`loginDoctora()` comparaba el usuario contra una constante del cliente,
autenticaba contra GoTrue, comprobaba que el token existiera… y lo tiraba.
Todas las peticiones posteriores iban firmadas con la anon key, la misma que
usa cualquier visitante. El login era una puerta pintada en la pared.

Además, el panel de la doctora vivía dentro de `index.html`, que se sirve sin
sesión: el marcado privado se descargaba a cualquiera que abriera el sitio.

Y hay un agravante propio de esta app: **arma su HTML con `innerHTML`** a
partir de nombres, motivos y diagnósticos que escriben los pacientes. Eso
significa que la posibilidad de un XSS no es teórica, y cualquier cosa que el
JavaScript pueda leer, un XSS también.

Las opciones consideradas:

1. **Token en `localStorage`.** Es lo más común y lo más simple de escribir.
   Pero `localStorage` es legible por cualquier script de la página: un XSS se
   lleva el token y con él la sesión completa de la doctora.
2. **Token en memoria.** No sobrevive a recargar la página, así que la doctora
   tendría que volver a entrar cada vez. Y un XSS que corre en la misma página
   igual lo alcanza.
3. **Cookie HttpOnly emitida por el servidor**, con las peticiones a las tablas
   firmadas del lado del servidor.

## Decisión

Guardar la sesión de la doctora en una **cookie HttpOnly emitida por el
servidor**, y que el token de Supabase no baje nunca al navegador.

El recorrido completo:

1. `loginDoctora()` autentica contra GoTrue y recibe el `access_token`.
2. Lo manda **una sola vez** a `POST /api/session`
   ([`api/session.js`](../../api/session.js)), que lo valida y responde con una
   cookie **HttpOnly**. Desde ahí el JavaScript no vuelve a ver el token.
3. `/admin` lo sirve [`api/admin.js`](../../api/admin.js), que entrega el
   marcado del panel **sólo** si la cookie es válida. El HTML privado no viaja
   a quien no inició sesión.
4. El panel consulta las tablas a través de [`api/db.js`](../../api/db.js), un
   proxy que verifica la cookie y **firma la petición del lado del servidor**,
   contra una lista fija de tablas permitidas.
5. Salir es `DELETE /api/session`: la cookie la borra quien la emitió.

Como complemento, todo dato que entre al HTML pasa por `escapar()`
([`utils.js`](../../assets/js/modules/utils.js)), y los botones de cada fila
mandan sólo el id, nunca texto de la base dentro de un `onclick`.

## Consecuencias

### A favor

- **Un XSS ya no se lleva la sesión.** Una cookie HttpOnly no es accesible
  desde JavaScript. Es exactamente la defensa que corresponde a una app que
  arma HTML con datos que escriben terceros.
- **El login por fin hace algo.** Antes, entrar o no entrar daba el mismo
  acceso a los datos. Ahora las tablas exigen una sesión válida.
- **El marcado privado no se filtra.** Quien no tiene cookie recibe el login,
  no el panel.
- **Superficie acotada.** El proxy acepta una lista fija de tablas y de
  métodos; no es un pasaje libre a la base.
- **Es verificable.** Doce tests en
  [`test/integracion/login-doctora.test.mjs`](../../test/integracion/login-doctora.test.mjs)
  comprueban, entre otras cosas, que el token viaje **una sola vez** y sólo a
  `/api/session`, y que sin sesión válida no se entre al panel.

### En contra

- **El sitio dejó de ser puramente estático.** Ahora depende de funciones
  serverless, y con ellas de una plataforma que las ejecute (Vercel). Ya no se
  puede publicar en cualquier hosting de archivos.
- **Un salto más en cada consulta de la doctora.** El navegador habla con el
  proxy y el proxy con Supabase. Son milisegundos, pero es una pieza más que
  puede fallar.
- **Hay un secreto que cuidar de verdad.** El token del lado del servidor vive
  en variables de entorno; si se filtran, se filtra todo.
- **La sesión vence y hay que volver a entrar.** Es lo correcto para datos
  clínicos, pero es fricción para quien usa el panel todo el día.
- **El usuario de la doctora sigue comparándose contra una constante del
  cliente.** Ya no da acceso a nada por sí solo —la contraseña la valida
  GoTrue— pero es una comprobación que no aporta seguridad y conviene sacar.

### Qué se sacrificó

**La simplicidad de un sitio 100% estático**, que era una de las virtudes
originales del proyecto: nada que desplegar, publicable en cualquier lado.

**Por qué valió la pena:** lo que había antes no era simple, era inseguro.
Cualquiera con la URL podía leer expedientes clínicos completos, y el login no
lo impedía. Cambiar «se publica en cualquier hosting» por «los datos de los
pacientes están detrás de una sesión real» es un intercambio que, tratándose
de historias clínicas, no admite mucha discusión.
