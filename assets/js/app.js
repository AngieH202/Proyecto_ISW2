// Entrypoint publico: login y flujo del paciente.
//
// El panel de la doctora ya no esta aqui. Vive en assets/js/admin.js y
// lo carga /admin, detras de la sesion.

import { showScreen } from './modules/utils.js';
import { estado as estadoCache, limpiar as limpiarCache } from './modules/cache.js';

// Importados por su efecto: cada modulo expone en window las funciones
// que el HTML necesita en sus atributos onclick.
import './modules/auth.js';
import './modules/patient.js';

// showScreen se usa en onclick del HTML y ningun modulo lo expone.
window.showScreen = showScreen;

// Para inspeccionar la cache desde la consola del navegador:
// cacheEstado() devuelve entradas, aciertos, fallos y tasa de aciertos.
window.cacheEstado = estadoCache;
window.cacheLimpiar = limpiarCache;
