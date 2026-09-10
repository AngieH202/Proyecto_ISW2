// Entorno compartido de los tests: el DOM mínimo y la base falsa.
//
// No es un archivo de pruebas -- no termina en .test.mjs, así que el
// runner no lo levanta. Es lo que antes estaba copiado en la cabecera de
// cada test.

export const MODULOS = new URL('../assets/js/', import.meta.url).href;

// ── DOM mínimo ────────────────────────────────────────────────────────
// No pretende ser un navegador: sostiene lo que la app usa de verdad,
// que es leer y escribir .value, .innerHTML, .textContent y .classList.
//
// Hay que instalarlo ANTES de importar nada de assets/js: los módulos
// publican sus handlers en window al cargarse.
export function instalarDom({ pathname = '/login', search = '?app=1' } = {}) {
  const campos = new Map();

  function nuevoElemento(id) {
    const clases = new Set();
    return {
      id, value: '', textContent: '', innerHTML: '', disabled: false, style: {},
      classList: {
        add: (c) => clases.add(c),
        remove: (c) => clases.delete(c),
        toggle: (c, forzar) => ((forzar ?? !clases.has(c)) ? clases.add(c) : clases.delete(c)),
        contains: (c) => clases.has(c)
      },
      querySelector: () => nuevoElemento('interno'),
      querySelectorAll: () => [],
      nextElementSibling: null
    };
  }

  globalThis.document = {
    getElementById(id) {
      if (!campos.has(id)) campos.set(id, nuevoElemento(id));
      return campos.get(id);
    },
    querySelectorAll: () => [],
    querySelector: () => nuevoElemento('interno')
  };
  globalThis.window = globalThis;
  globalThis.location = { pathname, search, href: '', replace() {} };

  const el = (id) => globalThis.document.getElementById(id);

  return {
    el,
    escribir: (id, valor) => { el(id).value = valor; },
    leerNotif: () => el('notif').textContent,
    limpiarNotif: () => { el('notif').textContent = ''; }
  };
}

// ── Base falsa, en el fetch global ────────────────────────────────────
// Las cuatro RPC de 011_rls_endurecido.sql con la misma semántica del
// SQL. Con `tablas: true` sirve además las tablas por PostgREST -- eso
// es lo único que ve el portal, a través de /api/db.
//
// Sin esa opción, cualquier petición a una tabla responde 404: es lo que
// vuelve real el test de que el paciente sólo puede llamar funciones.
//
// Cada petición queda registrada en `peticiones`, y eso es lo que
// permite afirmar *qué* llamó el cliente -- y con qué query -- y no sólo
// en qué estado quedó la base.
export function instalarBaseFalsa({ tablas = false } = {}) {
  const db = { expedientes: [], citas: [], visitas_clinicas: [], perfiles: [] };
  const peticiones = [];
  let seq = 1;

  const filtrar = (filas, params) => filas.filter((f) => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const [op, ...resto] = v.split('.');
      const val = resto.join('.');
      if (op === 'eq' && String(f[k]) !== val) return false;
      if (op === 'neq' && String(f[k]) === val) return false;
    }
    return true;
  });

  // Los dos estados cancelados liberan el horario, igual que en el
  // índice único de 006 tras la migración 012.
  const CANCELADOS = ['cancelada', 'cancelada_paciente'];
  const ocupa = (c) => !CANCELADOS.includes(c.estado);

  const RPC = {
    // Upsert por identidad: un solo viaje, sin la carrera que deja leer
    // y después escribir.
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

    // Devuelve sólo las horas tomadas, sin decir de quién es cada una.
    slots_ocupados({ p_fecha }) {
      return db.citas
        .filter((c) => c.fecha === p_fecha && ocupa(c))
        .map((c) => ({ hora: c.hora }));
    },

    // Comprueba el horario e inserta dentro de la misma sentencia: entre
    // una cosa y otra no queda ventana para que se cuele otro paciente.
    crear_solicitud({ p_identidad, p_nombre, p_telefono, p_fecha, p_hora, p_motivo }) {
      const ocupante = db.citas.find((c) => c.fecha === p_fecha && c.hora === p_hora && ocupa(c));
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

    // El cruce lo resuelve la base: devuelve las citas de esa identidad
    // y nada más.
    estado_de_mis_citas({ p_identidad }) {
      const e = db.expedientes.find((x) => x.identidad === p_identidad);
      if (!e) return [];
      return db.citas.filter((c) => (c.identidad ? c.identidad === p_identidad : c.nombre_paciente === e.nombre));
    },

    // Sólo cancela una cita que sea de esa identidad. La identidad no es
    // un filtro sino una condición del update: no hay forma de pedir la
    // baja de una cita ajena.
    cancelar_mi_cita({ p_identidad, p_fecha, p_hora }) {
      if (!p_identidad?.trim()) return 'no_encontrada';

      // El nombre sale del expediente de esa identidad, y sólo sirve de
      // respaldo para las citas viejas que no la guardaron. Mismo
      // criterio que crear_solicitud.
      const nombre = db.expedientes.find((e) => e.identidad === p_identidad)?.nombre;
      const suya = (c) => c.identidad === p_identidad
        || (!c.identidad && nombre && c.nombre_paciente === nombre);

      const cita = db.citas
        .filter((c) => c.fecha === p_fecha && c.hora === p_hora && suya(c))
        .sort((a, b) => (a.identidad === p_identidad ? 0 : 1) - (b.identidad === p_identidad ? 0 : 1))[0];

      if (!cita) return 'no_encontrada';
      if (CANCELADOS.includes(cita.estado)) return 'ya_cancelada';
      if (['atendida', 'nopresento'].includes(cita.estado)) return 'no_se_puede';

      cita.estado = 'cancelada_paciente';
      return 'cancelada';
    }
  };

  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url), 'https://falso.local');
    const metodo = opts.method ?? 'GET';
    const cuerpo = opts.body ? JSON.parse(opts.body) : null;
    const funcion = u.pathname.match(/\/rpc\/(\w+)$/)?.[1];
    peticiones.push({ ruta: u.pathname, busqueda: u.search, metodo, cuerpo, modoCache: opts.cache, funcion });

    const responder = (status, data) => ({ ok: status < 300, status, json: async () => data });

    if (funcion) {
      const fn = RPC[funcion];
      if (!fn) return responder(404, { code: 'PGRST202', message: 'función inexistente' });
      try {
        return responder(200, fn(cuerpo ?? {}));
      } catch (e) {
        return responder(400, { message: String(e.message) });
      }
    }

    if (!tablas) return responder(404, { message: 'anon no puede tocar las tablas' });

    const tabla = u.pathname.split('/').filter(Boolean).pop();
    if (!db[tabla]) return responder(404, { message: 'tabla inexistente' });
    const params = [...u.searchParams.entries()];

    if (metodo === 'GET') return responder(200, filtrar(db[tabla], params));

    if (metodo === 'POST') {
      // Índice único parcial de 006: (fecha, hora) entre las no canceladas.
      if (tabla === 'citas' && db.citas.some((c) => c.fecha === cuerpo.fecha && c.hora === cuerpo.hora && c.estado !== 'cancelada')) {
        return responder(409, { code: '23505', message: 'duplicate key' });
      }
      const fila = { id: seq++, ...cuerpo };
      db[tabla].push(fila);
      return responder(201, [fila]);
    }

    if (metodo === 'PATCH') {
      for (const f of filtrar(db[tabla], params)) Object.assign(f, cuerpo);
      return responder(204, null);
    }

    return responder(405, null);
  };

  return { db, peticiones };
}
