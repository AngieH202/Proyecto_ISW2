# Tests

Runner nativo de Node (`node:test`). **Sin dependencias**, como el resto del
proyecto.

```bash
npm test                  # todo lo que no toca la red
npm run test:unidad
npm run test:integracion
npm run test:estructura
```

En Windows la forma `node --test test/unidad` falla; hay que pasar un glob, y
por eso los scripts de `package.json` los usan.

## Cómo está dividido

| Carpeta | Qué prueba | Toca la red |
| --- | --- | --- |
| `unidad/` | Funciones puras: caché, formato, fechas | No |
| `integracion/` | Flujos completos contra un PostgREST falso | No |
| `estructura/` | Invariantes del repo: aislamiento, PWA, SQL | No |

Las comprobaciones **contra el sitio en vivo** están aparte, en `scripts/`,
porque son herramientas que se corren a mano contra producción:

```bash
npm run verificar:sitio   # los 64 checks del entregable
npm run verificar:rls     # que anon no llegue a las tablas
```

## Las ayudas

`ayudas/dom.mjs` monta un DOM mínimo. Hay que instalarlo **antes** de importar
nada de `assets/js`: los módulos publican sus handlers en `window` al cargarse.

`ayudas/postgrest.mjs` es un PostgREST en memoria. Implementa filtros `eq` y
`neq`, upsert con `merge-duplicates`, el índice único parcial de `006` y las
cuatro funciones RPC de `011` con la misma semántica del SQL. Devuelve además
el registro de peticiones, que es lo que permite afirmar *qué* llamó el cliente
y no sólo en qué estado quedó la base.

## Qué se está cuidando

Los tests de `estructura/` no miran comportamiento sino invariantes que, si se
rompen, no fallan de forma visible:

- **`index.html` no lleva nada del portal.** Se sirve sin sesión. Si alguien
  vuelve a meter el panel ahí, el marcado privado se filtra otra vez.
- **El lado público no toca ninguna tabla.** `011` le quita a `anon` el acceso
  directo; una llamada a `sbGet` en `auth.js` o `patient.js` rompería el flujo
  del paciente en producción.
- **Las lecturas críticas no se cachean.** De cuatro de ellas depende si se
  escribe o no: servir una respuesta vieja dejaría pasar un duplicado.
- **`api/admin.js` no manda el token al navegador.** La cookie es HttpOnly
  porque la app arma HTML con `innerHTML` a partir de nombres y diagnósticos.
- **Los scripts SQL son re-ejecutables.** `if not exists`, `or replace`, y el
  par `drop constraint` + `add constraint`.

## Al agregar un test

Los archivos van como `<tema>.test.mjs` en la carpeta que corresponda. Cada
archivo corre en su propio proceso, así que se puede ensuciar `globalThis` sin
afectar a los demás.
