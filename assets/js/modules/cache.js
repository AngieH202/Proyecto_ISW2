// Cache de lecturas en memoria, con vencimiento por entrada.
//
// Vive mientras viva la pestana: al recargar arranca vacia. Eso es a
// proposito -- guardar expedientes clinicos en disco es una decision
// aparte, no un efecto secundario de querer menos peticiones.

const entradas = new Map();

export const TTL_POR_DEFECTO = 30_000;

// Escribir en una tabla no siempre invalida solo esa tabla. Guardar una
// visita mueve el contador de su expediente -- lo hace el trigger de
// 007_sincronizar_visitas.sql, del lado de la base -- asi que la lista
// de expedientes tambien queda vieja.
const DEPENDENCIAS = {
  visitas_clinicas: ['visitas_clinicas', 'expedientes'],
  expedientes: ['expedientes'],
  citas: ['citas']
};

const metricas = { aciertos: 0, fallos: 0, invalidaciones: 0 };

export function clave(tabla, query) {
  return `${tabla}?${query}`;
}

// undefined = no hay nada util. Se distingue de null, que puede ser un
// valor cacheado legitimo.
export function leer(k) {
  const e = entradas.get(k);
  if (!e) {
    metricas.fallos++;
    return undefined;
  }
  if (Date.now() > e.vence) {
    entradas.delete(k);
    metricas.fallos++;
    return undefined;
  }
  metricas.aciertos++;
  return e.valor;
}

export function guardar(k, valor, ttl = TTL_POR_DEFECTO) {
  entradas.set(k, { valor, vence: Date.now() + ttl });
}

// Borra todo lo que dependa de la tabla escrita. Se llama desde api.js
// despues de cada POST, PATCH o upsert.
export function invalidar(tabla) {
  const afectadas = DEPENDENCIAS[tabla] ?? [tabla];
  for (const k of [...entradas.keys()]) {
    if (afectadas.some((t) => k.startsWith(t + '?'))) {
      entradas.delete(k);
      metricas.invalidaciones++;
    }
  }
}

export function limpiar() {
  entradas.clear();
}

// Para ver si la cache esta sirviendo de algo. window.cacheEstado() lo
// deja a mano desde la consola del navegador.
export function estado() {
  const total = metricas.aciertos + metricas.fallos;
  return {
    entradas: entradas.size,
    ...metricas,
    tasaAciertos: total ? Math.round((metricas.aciertos / total) * 100) + '%' : '—'
  };
}
