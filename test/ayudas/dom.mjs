// DOM mínimo para poder importar los módulos de la app en Node.
//
// Los módulos tocan window y document al cargarse -- publican sus
// handlers en window -- así que instalarlo tiene que ir ANTES de
// cualquier import de assets/js.
//
// No pretende ser un navegador: sostiene lo que la app usa de verdad,
// que es leer y escribir .value, .innerHTML, .textContent y .classList.

export const campos = new Map();

function nuevoElemento(id) {
  const clases = new Set();
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    style: {},
    classList: {
      add: (c) => clases.add(c),
      remove: (c) => clases.delete(c),
      toggle: (c, forzar) => (forzar ?? !clases.has(c)) ? clases.add(c) : clases.delete(c),
      contains: (c) => clases.has(c)
    },
    querySelector: () => nuevoElemento('interno'),
    querySelectorAll: () => [],
    nextElementSibling: null
  };
}

export function instalarDom({ pathname = '/login', search = '?app=1' } = {}) {
  campos.clear();

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

  return campos;
}

export const el = (id) => globalThis.document.getElementById(id);
export const escribir = (id, valor) => { el(id).value = valor; };
export const leerNotif = () => (campos.get('notif')?.textContent ?? '');
export const limpiarNotif = () => { if (campos.has('notif')) campos.get('notif').textContent = ''; };

export const RAIZ = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
export const MODULOS = new URL('../../assets/js/', import.meta.url).href;
