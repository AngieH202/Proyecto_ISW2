// PostgREST falso, en memoria.
//
// Implementa lo que la app realmente usa: filtros eq y neq, insert,
// patch, upsert con merge-duplicates, el índice único parcial de 006 y
// las cuatro funciones RPC de 011, con la misma semántica del SQL.
//
// Sirve para probar el comportamiento del cliente -- que llame lo que
// corresponde y trate bien cada respuesta -- sin tocar la base real.

export function instalarPostgrest({ conIndiceUnico = true } = {}) {
  const db = { expedientes: [], citas: [], visitas_clinicas: [], perfiles: [] };
  const peticiones = [];
  let seq = 1;

  const filtrar = (filas, params) => filas.filter((f) => {
    for (const [k, v] of params) {
      if (['select', 'order', 'on_conflict', 'limit'].includes(k)) continue;
      const [op, ...resto] = v.split('.');
      const val = resto.join('.');
      if (op === 'eq' && String(f[k]) !== val) return false;
      if (op === 'neq' && String(f[k]) === val) return false;
    }
    return true;
  });

  // ── Las RPC, espejo de migracion/011_rls_endurecido.sql ──
  const RPC = {
    registrar_paciente({ p_nombre, p_identidad, p_edad, p_telefono }) {
      if (!p_nombre?.trim() || !p_identidad?.trim()) throw new Error('nombre e identidad son obligatorios');
      let e = db.expedientes.find((x) => x.identidad === p_identidad);
      if (e) {
        // No toca visitas ni ultima_visita: pisarlas borraría el historial.
        Object.assign(e, { nombre: p_nombre, edad: p_edad, telefono: p_telefono });
      } else {
        e = { id: 'exp-' + seq++, nombre: p_nombre, identidad: p_identidad, edad: p_edad, telefono: p_telefono, visitas: 0, ultima_visita: '—' };
        db.expedientes.push(e);
      }
      return e.id;
    },

    slots_ocupados({ p_fecha }) {
      return db.citas
        .filter((c) => c.fecha === p_fecha && c.estado !== 'cancelada')
        .map((c) => ({ hora: c.hora }));
    },

    crear_solicitud({ p_identidad, p_nombre, p_telefono, p_fecha, p_hora, p_motivo }) {
      const ocupante = db.citas.find((c) => c.fecha === p_fecha && c.hora === p_hora && c.estado !== 'cancelada');
      if (ocupante) {
        const propia = ocupante.identidad
          ? ocupante.identidad === p_identidad
          : ocupante.nombre_paciente === p_nombre;
        return propia ? 'ya_existia' : 'ocupado';
      }
      db.citas.push({
        id: seq++, nombre_paciente: p_nombre, identidad: p_identidad,
        telefono_paciente: p_telefono, fecha: p_fecha, hora: p_hora,
        motivo: p_motivo, estado: 'pendiente', created_at: new Date().toISOString()
      });
      return 'creada';
    },

    estado_de_mis_citas({ p_identidad }) {
      const e = db.expedientes.find((x) => x.identidad === p_identidad);
      if (!e) return [];
      return db.citas.filter((c) => (c.identidad ? c.identidad === p_identidad : c.nombre_paciente === e.nombre));
    }
  };

  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url), 'https://falso.local');
    const metodo = opts.method ?? 'GET';
    const cuerpo = opts.body ? JSON.parse(opts.body) : null;
    peticiones.push({ ruta: u.pathname, metodo, modoCache: opts.cache, cuerpo });

    const responder = (status, data) => ({
      ok: status < 300, status,
      json: async () => data,
      text: async () => JSON.stringify(data),
      headers: new Map()
    });

    const esRpc = u.pathname.match(/\/rpc\/(\w+)$/);
    if (esRpc) {
      const fn = RPC[esRpc[1]];
      if (!fn) return responder(404, { code: 'PGRST202', message: 'función inexistente' });
      try {
        return responder(200, fn(cuerpo ?? {}));
      } catch (e) {
        return responder(400, { message: String(e.message) });
      }
    }

    const tabla = u.pathname.split('/').filter(Boolean).pop();
    if (!db[tabla]) return responder(404, { message: 'tabla inexistente' });
    const params = [...u.searchParams.entries()];

    if (metodo === 'GET') return responder(200, filtrar(db[tabla], params));

    if (metodo === 'POST') {
      const onConflict = u.searchParams.get('on_conflict');
      if (onConflict && (opts.headers?.Prefer ?? '').includes('merge-duplicates')) {
        const existente = db[tabla].find((f) => f[onConflict] === cuerpo[onConflict]);
        if (existente) { Object.assign(existente, cuerpo); return responder(200, [existente]); }
      }
      // Índice único parcial de 006: (fecha, hora) entre las no canceladas.
      if (conIndiceUnico && tabla === 'citas' &&
          db.citas.some((c) => c.fecha === cuerpo.fecha && c.hora === cuerpo.hora && c.estado !== 'cancelada')) {
        return responder(409, { code: '23505', message: 'duplicate key' });
      }
      const fila = { id: seq++, visitas: 0, ...cuerpo };
      db[tabla].push(fila);
      return responder(201, [fila]);
    }

    if (metodo === 'PATCH') {
      for (const f of filtrar(db[tabla], params)) Object.assign(f, cuerpo);
      return responder(204, null);
    }

    return responder(405, null);
  };

  return {
    db,
    peticiones,
    contar: (filtro = () => true) => peticiones.filter(filtro).length,
    reiniciarContador: () => { peticiones.length = 0; },
    rpcLlamadas: () => peticiones.filter((p) => p.ruta.includes('/rpc/')).map((p) => p.ruta.split('/rpc/')[1])
  };
}
