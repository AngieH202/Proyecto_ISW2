# DentaAgenda

Sistema de citas odontológicas para la clínica de la Dra. Belkis Suisse.
Proyecto de Ingeniería de Software II.

**Código de verificación:** `LEARN-CAP-C72DC553`

---

## Entregable

| | URL |
| --- | --- |
| 🌐 Sitio | <https://www.angiehernndz.lat> |
| 🔑 Login | <https://www.angiehernndz.lat/login> |
| 🔒 Portal privado | <https://www.angiehernndz.lat/admin> |
| ❤️ Healthcheck | <https://www.angiehernndz.lat/api/health> |

El código de verificación está publicado además en
[`/verificacion.txt`](https://www.angiehernndz.lat/verificacion.txt) y en la
etiqueta `<meta name="verificacion">` de la landing y del login.

---

## Qué es

Una aplicación web para dos perfiles:

- **Paciente** — se registra con su número de identidad, elige día y horario
  entre los turnos libres, y consulta después el estado de su solicitud. No
  necesita cuenta.
- **Doctora** — entra con usuario y contraseña, revisa la agenda del día,
  confirma o rechaza solicitudes, y lleva el expediente clínico de cada
  paciente.

## Cómo está hecho

Sitio estático sin framework ni paso de compilación: HTML, CSS y **módulos ES
nativos**, con cuatro funciones serverless en Vercel y Supabase como base de
datos.

| Capa | Qué hay |
| --- | --- |
| Cliente | `index.html`, `landing.html`, `assets/js/` — sin bundler, sin dependencias |
| Serverless | `api/` — sesión, portal privado, proxy de datos y healthcheck |
| Base | PostgreSQL en Supabase, vía PostgREST |

La arquitectura completa, con diagramas C4, está en
[`arquitectura.md`](arquitectura.md).

### Decisiones que vale la pena conocer

**El portal privado no se sirve sin sesión.** El panel de la doctora vive en
`api/_portal.js` — los archivos con guion bajo en `api/` no se publican como
ruta — y sólo lo entrega `api/admin.js` tras validar una cookie HttpOnly contra
Supabase. Sin sesión responde 302 sin una línea de marcado privado.

**El token nunca baja al navegador.** El panel pide sus datos a `api/db.js`, que
reenvía a PostgREST firmando del lado del servidor. La app arma HTML con
`innerHTML` a partir de nombres y diagnósticos, así que exponer el token sería
regalárselo a un XSS.

**El paciente no toca ninguna tabla.** Sus cuatro operaciones pasan por
funciones `security definer` que exponen sólo lo de su pantalla.

**Todo es idempotente.** Repetir cualquier operación deja el mismo estado: un
reintento tras un timeout, un doble clic o una segunda pestaña no duplican nada.
`crear_solicitud` resuelve la comprobación y la inserción en una sola sentencia,
así que la garantía vive en la base y no en una convención del cliente.

**Tres niveles de caché.** Lecturas en memoria con vencimiento, service worker
para funcionar sin conexión, y estáticos sellados con el hash de su contenido.
Cinco lecturas van sin caché a propósito: de ellas depende si se escribe o no.

---

## Trabajar en el proyecto

Los módulos ES no cargan por `file://`. Hay que servirlo por HTTP desde la raíz:

```bash
npx http-server . -p 8080 -c-1
```

Y entrar por `http://localhost:8080/landing.html`. El service worker sólo se
registra sobre HTTPS o `localhost`.

### Scripts

Ninguno necesita dependencias: todo sale de la biblioteca estándar de Node.

| Comando | Qué hace |
| --- | --- |
| `node scripts/versionar.mjs` | Sella los estáticos con el hash de su contenido. **Correlo antes de publicar.** |
| `node scripts/generar-imagenes.mjs` | Regenera iconos PNG e imagen social |
| `node scripts/verificar-sitio.mjs` | Audita el sitio en vivo contra el checklist del entregable |
| `node scripts/verificar-rls.mjs` | Comprueba, con la anon key, que la base no esté expuesta |

Los cuatro son idempotentes: si nada cambió, no tocan nada.

### Base de datos

Los scripts SQL están en [`migracion/`](migracion/), numerados y con sus
dependencias documentadas en [`migracion/README.md`](migracion/README.md).

---

## Despliegue

Vercel, conectado al repositorio: cada push a `main` redespliega. La
configuración de headers y rutas está en `vercel.json`.

Para saber qué versión está publicada, mirá el campo `version` del healthcheck:
coincide con el hash que escribe `versionar.mjs`.
