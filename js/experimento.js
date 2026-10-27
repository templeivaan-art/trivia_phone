// =====================================================================
//  INTERFAZ, FLUJO Y GUARDADO DE DATOS (versión web / móvil)
//  El orden de rutinas y los nombres de columnas son los de trivia_completa.psyexp,
//  para que el CSV resultante sirva con el mismo clean.py.
// =====================================================================
(function () {
'use strict';

const CONF = window.CONFIG || {};
const L = window.Logica;
const CFG = L.CFG, E = L.E;
const URLP = new URLSearchParams(location.search);
const AUTO = URLP.get('auto') === '1';          // respuestas automáticas (solo pruebas)
const RAPIDO = URLP.get('rapido') === '1';
const app = document.getElementById('app');

// ------------------------------------------------------------------ reloj
const T0 = performance.now();
const ahora = () => (performance.now() - T0) / 1000;
L.setReloj(ahora);
const flip = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(ahora()))));
const dormir = s => new Promise(r => setTimeout(r, s * 1000));

// ------------------------------------------------------------------ utilidades
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt = s => esc(s).replace(/\n/g, '<br>');
function pinta(html, clase) {
  app.innerHTML = '<div class="pantalla ' + (clase || '') + '">' + html + '</div>';
  return app.firstElementChild;
}
function normTecla(k) { return k === ' ' ? 'space' : (k === 'Spacebar' ? 'space' : String(k).toLowerCase()); }
function fechaPsychoPy(d) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + 'h' +
         p(d.getMinutes()) + '.' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
}
function sistema() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'MacOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'otro';
}
function tipoDispositivo() {
  const tactil = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const lado = Math.min(screen.width, screen.height);
  if (tactil && lado < 600) return 'movil';
  if (tactil) return 'tablet';
  return 'ordenador';
}
function idAleatorio() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = '';
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

// ------------------------------------------------------------------ datos (formato PsychoPy)
const inicioFecha = new Date();
const participante = URLP.get('participant') || URLP.get('PROLIFIC_PID') || URLP.get('id') || idAleatorio();
const sesion = URLP.get('session') || '001';
const nombreArchivo = participante + '_' + (CONF.EXP_NAME || 'trivia_movil') + '_' + fechaPsychoPy(inicioFecha);
const CLAVE_RESPALDO = 'trivia_movil_respaldo';

const visib = { salidas: 0, fuera: 0, desde: null };
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { visib.salidas += 1; visib.desde = ahora(); }
  else if (visib.desde !== null) { visib.fuera += ahora() - visib.desde; visib.desde = null; pedirWakeLock(); }
});

const Datos = {
  filas: [], actual: {}, cols: [], comunes: {},
  add(k, v) { if (!this.cols.includes(k)) this.cols.push(k); this.actual[k] = v; },
  guardar(obj) { for (const k in obj) this.add(k, obj[k]); },
  next() {
    if (Object.keys(this.actual).length === 0) return;
    this.add('salidas_pagina', visib.salidas);
    this.add('tiempo_fuera_s', +visib.fuera.toFixed(3));
    this.filas.push(Object.assign({}, this.comunes, this.actual));
    this.actual = {};
    respaldo(false);
  },
  csv() {
    const cols = this.cols.slice();
    for (const k of Object.keys(this.comunes)) if (!cols.includes(k)) cols.push(k);
    const fmt = v => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'True' : 'False';
      if (typeof v === 'object') v = JSON.stringify(v);
      v = String(v);
      return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const filas = this.filas.concat(Object.keys(this.actual).length ? [Object.assign({}, this.comunes, this.actual)] : []);
    return [cols.map(fmt).join(',')].concat(filas.map(f => cols.map(c => fmt(f[c])).join(','))).join('\n') + '\n';
  },
};

function respaldo(terminado) {
  try { localStorage.setItem(CLAVE_RESPALDO, JSON.stringify({ archivo: nombreArchivo, csv: Datos.csv(), terminado })); } catch (e) { /* sin almacenamiento */ }
}

async function enviarDataPipe(nombre, csv) {
  if (!CONF.DATAPIPE_ID) return false;
  for (let intento = 0; intento < 4; intento++) {
    try {
      const r = await fetch('https://pipe.jspsych.org/api/data/', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: '*/*' },
        body: JSON.stringify({ experimentID: CONF.DATAPIPE_ID, filename: nombre, data: csv }),
      });
      if (r.ok) return true;
    } catch (e) { /* reintentar */ }
    await dormir(1.5 * (intento + 1));
  }
  return false;
}
function descargar(nombre, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
// Si una sesión anterior se cortó (se cerró la pestaña, se reinició el móvil...), se envía lo que hubiera.
(async function recuperarSesionAnterior() {
  let prev = null;
  try { prev = JSON.parse(localStorage.getItem(CLAVE_RESPALDO) || 'null'); } catch (e) { prev = null; }
  if (!prev || prev.terminado || !prev.csv) return;
  if (CONF.DATAPIPE_ID) {
    const ok = await enviarDataPipe(prev.archivo + '_INCOMPLETO.csv', prev.csv);
    if (ok) { try { localStorage.removeItem(CLAVE_RESPALDO); } catch (e) { /* nada */ } }
  }
})();

// ------------------------------------------------------------------ pantalla completa y pantalla encendida
let wakeLock = null;
async function pedirWakeLock() {
  try { if ('wakeLock' in navigator && !document.hidden) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* no disponible */ }
}
function pedirPantallaCompleta() {
  if (!CONF.PANTALLA_COMPLETA || AUTO) return;
  const el = document.documentElement;
  const f = el.requestFullscreen || el.webkitRequestFullscreen;
  if (f && !document.fullscreenElement) { try { const p = f.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) { /* nada */ } }
}
let enCurso = false;
window.addEventListener('beforeunload', e => { if (enCurso) { e.preventDefault(); e.returnValue = ''; } });

// ------------------------------------------------------------------ precarga de imágenes
const cacheImg = {};
function precargar(urls, progreso) {
  let hechas = 0;
  return Promise.all(urls.map(u => {
    if (cacheImg[u]) { hechas++; return cacheImg[u].p; }
    const img = new Image();
    const p = new Promise(res => {
      img.onload = () => { (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(res); };
      img.onerror = () => res();
    }).then(() => { hechas++; if (progreso) progreso(hechas, urls.length); });
    img.src = u; cacheImg[u] = { img, p };
    return p;
  }));
}

// ------------------------------------------------------------------ espera de respuesta (toque o tecla)
// Devuelve {resp, rt, modo} o null si se agota tmax.  rt relativo a `onset` - `desde`.
function esperar({ onset, tmax = Infinity, teclas = null, desde = 0, tick = null, raiz = app }) {
  return new Promise(resolve => {
    let fin = false;
    const autoT = AUTO ? desde + 0.05 + Math.random() * 0.25 * Math.max(0.2, Math.min(1, tmax === Infinity ? 1 : tmax)) : Infinity;
    function terminar(r) {
      if (fin) return; fin = true;
      raiz.removeEventListener('pointerdown', onPtr, true);
      window.removeEventListener('keydown', onKey, true);
      resolve(r);
    }
    function onPtr(e) {
      const b = e.target.closest('[data-r]');
      if (!b || b.disabled) return;
      const t = ahora() - onset; if (t < desde) return;
      e.preventDefault(); b.classList.add('pulsado');
      terminar({ resp: b.dataset.r, rt: t - desde, modo: e.pointerType || 'toque' });
    }
    function onKey(e) {
      if (e.repeat) return;
      const t = ahora() - onset; if (t < desde) return;
      const k = normTecla(e.key);
      if (teclas === 'cualquiera' || (Array.isArray(teclas) && teclas.includes(k))) {
        e.preventDefault(); terminar({ resp: k, rt: t - desde, modo: 'teclado' });
      }
    }
    raiz.addEventListener('pointerdown', onPtr, true);
    window.addEventListener('keydown', onKey, true);
    (function frame() {
      if (fin) return;
      const t = ahora() - onset;
      if (tick && tick(t) === false) return terminar(null);
      if (t >= tmax) return terminar(null);
      if (t >= autoT) {
        const bs = [...raiz.querySelectorAll('[data-r]')].filter(b => !b.disabled && b.offsetParent !== null);
        if (bs.length) { const b = bs[Math.floor(Math.random() * bs.length)]; return terminar({ resp: b.dataset.r, rt: t - desde, modo: 'auto' }); }
      }
      requestAnimationFrame(frame);
    })();
  });
}

// Pantalla de texto con botón «Continuar» (equivale a Text + Keyboard en PsychoPy).
async function pantallaTexto(rutina, comp, html, { boton = 'Continuar', teclas = 'cualquiera', desde = 0, fila = true, extra = '', alAparecer = null, tick = null, tmax = Infinity } = {}) {
  const nodo = pinta('<div class="centro scroll"><div class="texto">' + html + '</div>' + extra +
                     '<button class="btn btn-principal" data-r="toque"' + (desde > 0 ? ' disabled' : '') + '>' + esc(boton) + '</button></div>');
  const onset = await flip();
  Datos.add(rutina + '.started', onset);
  if (alAparecer) alAparecer(nodo, onset);
  const btn = nodo.querySelector('[data-r]');
  const r = await esperar({ onset, teclas, desde, tmax, tick: t => { if (desde > 0) btn.disabled = t < desde; return tick ? tick(t, nodo) : undefined; } });
  if (r) { Datos.add(comp + '.keys', r.modo === 'teclado' ? r.resp : 'toque'); Datos.add(comp + '.rt', r.rt); Datos.add(comp + '.modo', r.modo); }
  Datos.add(rutina + '.stopped', ahora());
  if (fila) Datos.next();
  return r;
}

function loopCols(nombre, i) {
  Datos.add(nombre + '.thisRepN', i); Datos.add(nombre + '.thisTrialN', 0);
  Datos.add(nombre + '.thisN', i); Datos.add(nombre + '.thisIndex', 0); Datos.add(nombre + '.ran', 1);
}

async function mostrarDurante(rutina, html, dur, clase) {
  pinta(html, clase);
  const onset = await flip();
  Datos.add(rutina + '.started', onset);
  await esperar({ onset, tmax: dur });
  Datos.add(rutina + '.stopped', ahora());
  return onset;
}

// ------------------------------------------------------------------ textos de instrucciones
const ESCALA = [
  '1 = Estoy seguro de que no la sé.',
  '2 = Creo que no la sé.',
  '3 = Dudo, pero me inclino a pensar que no la sé.',
  '4 = Dudo, pero me inclino a pensar que sí la sé.',
  '5 = Creo que la sé.',
  '6 = Estoy seguro de que sí la sé.',
];

// ------------------------------------------------------------------ rutinas
async function bienvenida() {
  await pantallaTexto('bienvenida', 'bienvenida_tecla',
    '<div class="titulo">¡Bienvenid@!</div>Esta tarea dura alrededor de 45 minutos.\n\nHazla en un lugar tranquilo, sin interrupciones, y con el móvil cargado. Si puedes, activa el modo «No molestar».',
    { boton: 'Comenzar' });
  pedirPantallaCompleta(); pedirWakeLock();
}

async function insertarCorreo() {
  const nodo = pinta('<div class="centro"><div class="texto">Añade un correo electrónico a continuación.\n\nLo usaremos para comunicarte tu posición final en la competición.</div>' +
    '<input class="correo" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="Escribe aquí tu correo...">' +
    '<div class="error oculto">Revisa el correo: parece incompleto.</div>' +
    '<button class="btn btn-principal">Continuar</button></div>');
  const onset = await flip();
  Datos.add('insertar_correo.started', onset);
  const inp = nodo.querySelector('input'), btn = nodo.querySelector('button'), err = nodo.querySelector('.error');
  const r = await new Promise(res => {
    const ok = modo => {
      const v = inp.value.trim();
      if (!AUTO && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { err.classList.remove('oculto'); return; }
      inp.blur(); res({ v: AUTO ? 'auto@prueba.es' : v, rt: ahora() - onset, modo });
    };
    btn.addEventListener('click', () => ok('toque'));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok('teclado'); } });
    if (AUTO) setTimeout(() => ok('auto'), 50);
  });
  Datos.add('correo.text', r.v);
  Datos.add('correo_tecla.keys', 'toque'); Datos.add('correo_tecla.rt', r.rt); Datos.add('correo_tecla.modo', r.modo);
  Datos.add('insertar_correo.stopped', ahora());
  Datos.next();
}

async function valorarPregunta(i) {
  const pregunta = E.orden_banco[i];
  const botones = ESCALA.map((t, k) => '<button class="btn" data-r="' + (k + 1) + '"><span class="num">' + (k + 1) + '</span><span>' + esc(t.slice(4)) + '</span></button>').join('');
  pinta('<div class="centro" style="flex:0 0 auto;min-height:22%"><div class="texto">' + txt(pregunta.Pregunta) + '</div></div>' +
        '<div class="texto peq" style="text-align:center;margin:8px 0 10px">¿Hasta qué punto crees que sabes la respuesta?</div>' +
        '<div class="escala scroll">' + botones + '</div>');
  const onset = await flip();
  Datos.add('valorar_pregunta.started', onset);
  const r = await esperar({ onset, teclas: ['1', '2', '3', '4', '5', '6'] });
  Datos.add('valoracion.keys', r.resp); Datos.add('valoracion.rt', r.rt); Datos.add('valoracion.modo', r.modo);
  Datos.guardar(L.valorar(pregunta, r.resp, r.rt));
  Datos.add('valorar_pregunta.stopped', ahora());
  loopCols('clasificacion_loop', i);
  Datos.next();
}

async function cuentaAtras() {
  const nodo = pinta('<div class="centro"><div class="cuenta">3</div></div>');
  const onset = await flip();
  Datos.add('cuenta_atras.started', onset);
  const el = nodo.querySelector('.cuenta');
  await esperar({ onset, tmax: 3 * CFG.FACTOR_TIEMPO, tick: t => { el.textContent = String(Math.max(1, 3 - Math.floor(t / CFG.FACTOR_TIEMPO))); } });
  Datos.add('cuenta_atras.stopped', ahora());
  Datos.next();
}

function fijacion(rutina, dur) {
  return mostrarDurante(rutina, '<div class="centro"><div class="fijacion">+</div></div>', dur);
}

async function rutinaFix(indice) {
  const fix_duration = 0.8 * CFG.FACTOR_TIEMPO + Math.random() * 0.4 * CFG.FACTOR_TIEMPO;
  const vista = L.cargar_ensayo(indice);
  Datos.add('fix_duration_requested', fix_duration);
  await fijacion('fix', fix_duration);
  return vista;
}

async function rutinaPregunta(vista, rutina = 'question_practice', conCuenta = true) {
  const nodo = pinta('<div class="barra" style="justify-content:center">' + esc(vista.texto_contador_pregunta) + '</div>' +
    '<div class="centro">' + (conCuenta ? '<div class="cuenta" style="font-size:clamp(28px,8vw,44px);margin-bottom:18px">' + Math.floor(CFG.DURACION_PREGUNTA / CFG.FACTOR_TIEMPO) + '</div>' : '') +
    '<div class="texto" style="font-size:clamp(20px,5.6vw,30px)">' + txt(vista.pregunta_txt) + '</div></div>');
  const onset = await flip();
  L.registrar_inicio('pregunta', onset);
  Datos.add(rutina + '.started', onset);
  const el = nodo.querySelector('.cuenta');
  const D = Math.floor(CFG.DURACION_PREGUNTA / CFG.FACTOR_TIEMPO);
  await esperar({ onset, tmax: CFG.DURACION_PREGUNTA, tick: t => { if (el) el.textContent = String(Math.max(1, D - Math.floor(t / CFG.FACTOR_TIEMPO))); } });
  Datos.add(rutina + '.stopped', ahora());
}

function htmlOpciones(vista) {
  return '<div class="opciones">' + ['a', 'b', 'c', 'd'].map((l, k) =>
    '<button class="opcion" data-r="' + (k + 1) + '">' + esc(vista['opcion_' + l]) + '</button>').join('') + '</div>';
}

function mdlite(s) {
  let pensado = '';
  s = String(s || '').replace(/^\[\[(.*?)\]\]/, (m, p) => { pensado = p; return ''; });
  let h = esc(s).replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
  return { pensado, html: h.replace(/\n/g, '<br>') };
}
function htmlGPT(ensayo) {
  if (CONF.GPT_MODO === 'imagen') return '<img class="gpt-img" alt="" src="' + esc(ensayo.GPT) + '">';
  const r = mdlite((window.GPT_TEXTO || {})[ensayo.GPT_archivo]);
  return '<div class="chat"><div class="cab">ChatGPT</div><div class="user">' + esc(ensayo.Pregunta) + '</div>' +
         (r.pensado ? '<div class="pensado">' + esc(r.pensado) + ' ›</div>' : '') +
         '<div class="resp">' + r.html + '</div></div>';
}

async function rutinaOpciones(vista) {
  const cuota = L.preparar_opciones();
  const nodo = pinta(
    '<div class="barra"><span class="cnt-gpt">' + esc(L.texto_ayudas()) + '</span><span>' + esc(vista.texto_contador_opciones) + '</span></div>' +
    '<div class="aviso">' + (cuota === 1 ? 'Debes consultar en todas las preguntas restantes' : '') + '</div>' +
    '<div class="zona-gpt"><button class="btn btn-gpt" data-gpt="1">💬 Consultar ChatGPT</button></div>' +
    htmlOpciones(vista));
  const onset = await flip();
  L.registrar_inicio('opciones', onset);
  Datos.add('answer_practice.started', onset);
  const zona = nodo.querySelector('.zona-gpt'), cnt = nodo.querySelector('.cnt-gpt');
  const gptKeys = [], gptRts = [];
  const consultar = (rt, modo) => {
    gptKeys.push(modo === 'teclado' ? 'space' : 'toque'); gptRts.push(rt);
    if (L.procesar_consulta(rt)) {
      zona.innerHTML = htmlGPT(E.ensayo);
      cnt.textContent = L.texto_ayudas();
      flip().then(t => L.registrar_inicio('gpt', t));
    }
  };
  const onPtr = e => { const b = e.target.closest('[data-gpt]'); if (!b) return; e.preventDefault(); consultar(ahora() - onset, e.pointerType || 'toque'); };
  const onKey = e => { if (!e.repeat && normTecla(e.key) === 'space') { e.preventDefault(); consultar(ahora() - onset, 'teclado'); } };
  nodo.addEventListener('pointerdown', onPtr, true);
  window.addEventListener('keydown', onKey, true);
  let autoGpt = AUTO && (cuota === 1 || Math.random() < 0.5) ? 0.02 + Math.random() * 0.1 : Infinity;
  const r = await esperar({ onset, tmax: CFG.DURACION_OPCIONES, teclas: ['1', '2', '3', '4'], raiz: nodo.querySelector('.opciones'),
    tick: t => { if (t >= autoGpt) { autoGpt = Infinity; consultar(t, 'auto'); } } });
  nodo.removeEventListener('pointerdown', onPtr, true);
  window.removeEventListener('keydown', onKey, true);
  const datos = L.cerrar_ensayo_trivia(r ? r.resp : null, r ? r.rt : null);
  Datos.guardar(datos);
  Datos.add('prueba_respuesta_2.keys', r ? r.resp : null); Datos.add('prueba_respuesta_2.rt', r ? r.rt : null);
  Datos.add('respuesta_modo', r ? r.modo : null);
  Datos.add('tecla_gpt.keys', gptKeys.length ? gptKeys : null); Datos.add('tecla_gpt.rt', gptRts.length ? gptRts : null);
  Datos.add('gpt_modo', CONF.GPT_MODO || 'texto');
  Datos.add('answer_practice.stopped', ahora());
}

async function rutinaFeedback() {
  const dur = 0.8 * CFG.FACTOR_TIEMPO + Math.random() * 0.4 * CFG.FACTOR_TIEMPO;
  await fijacion('blanco', dur);
  Datos.add('fix_pre_feedback_duracion_solicitada', dur);
  const t = E.t;
  await mostrarDurante('feedback_monedas',
    '<div class="centro"><div class="fb-monedas"><img src="IMAGES/moneda.png" alt=""><span>' + esc(L.formato_numero(E.monedas)) + '</span></div>' +
    '<div class="fb-texto" style="color:' + (t.feedback_color === 'green' ? 'var(--verde)' : 'var(--rojo)') + '">' + esc(t.feedback_msg) + '</div></div>',
    CFG.DURACION_FEEDBACK);
  await mostrarDurante('feedback_respuesta', '<div class="centro"><div class="fb-texto">' + txt('La respuesta correcta es:\n' + E.ensayo.Correct) + '</div></div>', CFG.DURACION_SOLUCION);
  if (E.fase === 'principal') L.registrar_fin_exposicion(E.memory_bank[E.memory_bank.length - 1], ahora());
}

async function ensayoTrivia(indice, loop) {
  const vista = await rutinaFix(indice);
  await rutinaPregunta(vista);
  await rutinaOpciones(vista);
  await rutinaFeedback();
  loopCols(loop, indice);
  Datos.next();
}

async function finBloque(b) {
  const resumen = L.cerrar_bloque();
  Datos.guardar(resumen);
  const pen = E.ayudas_restantes > 0
    ? '\nAyudas sin usar: ' + E.ayudas_restantes + '. Penalización: ' + L.formato_numero(resumen.penalizacion_ayudas) + ' monedas.'
    : '\nHas utilizado las ' + CFG.AYUDAS_POR_BLOQUE + ' ayudas.';
  let msg = 'Bloque ' + E.bloque + ' terminado.' + pen + '\n\nMonedas acumuladas: ' + L.formato_numero(E.monedas);
  const hay = E.bloque < CFG.N_BLOQUES;
  const minimo = hay ? CFG.DESCANSO_MINIMO : 0;
  if (hay) msg += '\n\nDescanso entre bloques.\nPodrás continuar a partir de ' + L.formato_mmss(CFG.DESCANSO_MINIMO / CFG.FACTOR_TIEMPO) +
                  '. Máximo: ' + L.formato_mmss(CFG.DESCANSO_MAXIMO / CFG.FACTOR_TIEMPO) + '.';
  let autoFin = 0, tFinal = 0;
  const r = await pantallaTexto('fin_bloque', 'fin_bloque_tecla', txt(msg), {
    teclas: ['space'], desde: minimo, fila: false, tmax: hay ? CFG.DESCANSO_MAXIMO : Infinity,
    extra: hay ? '<div class="texto peq cnt" style="margin-top:18px"></div>' : '',
    tick: (t, nodo) => {
      tFinal = t;
      if (!hay) return;
      const c = nodo.querySelector('.cnt');
      c.textContent = 'Tiempo transcurrido: ' + L.formato_mmss(t / CFG.FACTOR_TIEMPO) + ' / ' + L.formato_mmss(CFG.DESCANSO_MAXIMO / CFG.FACTOR_TIEMPO);
      c.style.color = t < minimo ? '#b00000' : '#006000';
    },
  });
  if (!r && hay) autoFin = 1;
  Datos.add('descanso_duracion', tFinal);
  Datos.add('descanso_fin_automatico', autoFin);
  Datos.add('descanso_entre_bloques', hay ? 1 : 0);
  loopCols('block_loop', b);
  Datos.next();
}

// ---------------- tarea de puntos
const INSTR_PUNTOS = [
  '<div class="titulo">Nueva tarea</div>⚠️ Lee <b>atentamente</b> las instrucciones. ⚠️\n\nAhora jugarás una breve <b>tarea visual</b>, tocando la pantalla.\n\nSi en algún momento la tarea no avanza, no toques nada más y <b>espera</b> un poco.',
  'En cada ronda aparecerá, muy brevemente, una cruz (+) que marca el centro de la pantalla. ¡Mantén tu <b>mirada ahí</b>!\n\nInmediatamente después aparecerá una <b>secuencia</b> de fotogramas. En cada fotograma hay una <b>nube de puntos</b>.\n\nCada nube tiene una <b>cantidad</b> de puntos variable. Además, cada nube puede ser o solo de puntos <b style="color:#0000ff">azules</b>, o solo de puntos <b style="color:#ff0000">rojos</b>.' +
    '<div class="demo-puntos"><img src="IMAGES/aBlue1.png" alt=""><img src="IMAGES/aRed1.png" alt=""></div>',
  'Tras la secuencia aparecerá una imagen con puntos <b style="color:#c8a000">amarillos</b>-<b style="color:#1a7f1a">verdes</b>. <b>No tiene relevancia</b> para ti: solo sirve para «contrarrestar» el ajuste que tus ojos hacen al azul y al rojo.' +
    '<div class="demo-puntos"><img src="IMAGES/mask.png" alt="" style="width:50%"></div>En cada ronda deberás averiguar de qué color (<b style="color:#0000ff">azul</b> o <b style="color:#ff0000">rojo</b>) ha habido <b>más puntos</b>.',
  'Tras la secuencia podrás responder de qué color crees que ha habido más puntos. Deberás <b>tocar dentro</b> de uno de los dos círculos blancos.' +
    '<div class="demo-puntos"><div style="position:relative;width:80%;max-width:320px;aspect-ratio:4/3;background:#808080;border:1px solid #666">' +
    '<i style="position:absolute;left:18%;top:50%;width:16px;height:16px;border-radius:50%;background:#fff;transform:translate(-50%,-50%)"></i>' +
    '<i style="position:absolute;left:82%;top:50%;width:16px;height:16px;border-radius:50%;background:#fff;transform:translate(-50%,-50%)"></i>' +
    '<b style="position:absolute;left:18%;top:66%;transform:translate(-50%,-50%);color:#0000ff;font-weight:normal;font-size:22px">Azul</b>' +
    '<b style="position:absolute;left:82%;top:66%;transform:translate(-50%,-50%);color:#ff0000;font-weight:normal;font-size:22px">Rojo</b></div></div>' +
    '¡¡No tendrás demasiado <b>tiempo para responder</b>!! Si te quedas sin tiempo, la ronda será <b>inválida</b> y pasará la siguiente automáticamente.',
  'Aquí puedes ver un resumen de cómo será cada ronda:<div class="demo-puntos"><img class="instr-img" src="IMAGES/instPre5.png" alt="" style="width:100%;max-width:520px"></div>',
  'Ahora, cuando estés list@, ¡toca «Comenzar» para empezar la tarea!',
];

async function escenaPuntos(i) {
  const vista = L.preparar_puntos(i);
  // Escena en «unidades de altura» de PsychoPy: imagen 0.8 x 0.6, círculos a ±0.255, diámetro 0.06.
  const W = app.clientWidth - 2, H = app.clientHeight - 2;
  let unidad = Math.min(H * 0.92 / 0.6, W / 0.8);     // píxeles por unidad dentro de la escena
  const ancho = 0.8 * unidad, alto = 0.6 * unidad;
  const radioToque = Math.max(28, 0.06 * unidad);       // zona táctil mínima de 56 px
  const pos = x => (50 + (x / 0.8) * 100) + '%';
  const yLbl = (50 + (0.09 / 0.6) * 100) + '%';
  const ax = vista.azul_izq ? -0.255 : 0.255, rx = -ax;
  const imgs = vista.imagenes.map(u => '<img alt="" src="' + esc(u) + '">').join('');
  const nodo = pinta('<div class="centro"><div class="escena" style="width:' + ancho + 'px;height:' + alto + 'px">' + imgs +
    '<div class="fix">+</div>' +
    '<div class="circ" data-c="circulo_izq" style="left:' + pos(-0.255) + ';top:50%;width:' + 2 * radioToque + 'px;height:' + 2 * radioToque + 'px"><i style="width:' + 0.06 * unidad + 'px;height:' + 0.06 * unidad + 'px"></i></div>' +
    '<div class="circ" data-c="circulo_der" style="left:' + pos(0.255) + ';top:50%;width:' + 2 * radioToque + 'px;height:' + 2 * radioToque + 'px"><i style="width:' + 0.06 * unidad + 'px;height:' + 0.06 * unidad + 'px"></i></div>' +
    '<div class="etq" style="left:' + pos(ax) + ';top:' + yLbl + ';color:#0000ff;font-size:' + 0.07 * unidad + 'px">Azul</div>' +
    '<div class="etq" style="left:' + pos(rx) + ';top:' + yLbl + ';color:#ff0000;font-size:' + 0.07 * unidad + 'px">Rojo</div>' +
    '</div></div>');
  const esc_ = nodo.querySelector('.escena');
  const capas = [...esc_.querySelectorAll('img')];
  const fix = esc_.querySelector('.fix');
  const circ = [...esc_.querySelectorAll('.circ')], etq = [...esc_.querySelectorAll('.etq')];
  const onset = await flip();
  Datos.add('ensayo_puntos.started', onset);
  fix.style.visibility = 'visible';
  const onsets = [];
  const nombres = [], tiempos = [], xs = [], ys = [];
  let tResp = null, terminado = false;
  const onPtr = e => {
    if (tResp === null || terminado) return;
    e.preventDefault();
    const t = ahora() - tResp;
    const c = e.target.closest('[data-c]');
    const rect = esc_.getBoundingClientRect();
    xs.push(+(((e.clientX - (rect.left + rect.width / 2)) / unidad)).toFixed(4));
    ys.push(+((-(e.clientY - (rect.top + rect.height / 2)) / unidad)).toFixed(4));
    nombres.push(c ? c.dataset.c : null); tiempos.push(t);
    if (c) terminado = true;
  };
  app.addEventListener('pointerdown', onPtr, true);
  const autoT = AUTO ? 0.1 + Math.random() * 0.5 : Infinity;
  await new Promise(res => {
    let actual = -1;
    (function frame() {
      const t = ahora() - onset;
      // fotogramas de nubes: [FIJACION + k*NUBE, FIJACION + (k+1)*NUBE)
      const k = t < CFG.PUNTOS_FIJACION ? -1 : Math.floor((t - CFG.PUNTOS_FIJACION) / CFG.PUNTOS_NUBE);
      if (k !== actual && k < capas.length) {
        if (actual === -1) fix.style.visibility = 'hidden';
        if (actual >= 0) capas[actual].style.visibility = 'hidden';
        if (k >= 0) { capas[k].style.visibility = 'visible'; onsets.push(+(t * 1000).toFixed(1)); }
        actual = k;
      }
      if (k >= capas.length && tResp === null) {
        if (actual >= 0 && actual < capas.length) capas[actual].style.visibility = 'hidden';
        actual = capas.length;
        circ.concat(etq).forEach(el => { el.style.visibility = 'visible'; });
        flip().then(tt => { tResp = tt; });
        tResp = ahora();
      }
      if (tResp !== null) {
        const tr = ahora() - tResp;
        if (AUTO && tr >= autoT && !terminado) { nombres.push(Math.random() < 0.5 ? 'circulo_izq' : 'circulo_der'); tiempos.push(tr); terminado = true; }
        if (terminado || tr >= CFG.PUNTOS_MAX_RESPUESTA) return res();
      }
      requestAnimationFrame(frame);
    })();
  });
  app.removeEventListener('pointerdown', onPtr, true);
  Datos.add('ensayo_puntos.stopped', ahora());
  const datos = L.cerrar_puntos(nombres, tiempos);
  Datos.guardar(datos);
  Datos.add('raton_puntos.x', xs.length ? xs : null); Datos.add('raton_puntos.y', ys.length ? ys : null);
  Datos.add('raton_puntos.time', tiempos.length ? tiempos : null);
  Datos.add('raton_puntos.clicked_name', nombres.length ? nombres : null);
  Datos.add('puntos_onsets_fotogramas_ms', onsets);
  const dif = onsets.slice(1).map((v, j) => v - onsets[j]);
  Datos.add('puntos_nube_real_media_ms', dif.length ? +(dif.reduce((a, b) => a + b, 0) / dif.length).toFixed(2) : null);
  // feedback
  await mostrarDurante('feedback_puntos', '<div class="centro"><img src="' + esc(E.p.feedback_pic) + '" alt="" style="width:' + Math.min(W, 1.0667 * unidad * 0.75) + 'px;height:auto"></div>', CFG.PUNTOS_FEEDBACK);
  loopCols('dots_loop', i);
  Datos.next();
}

// ---------------- memoria
async function rutinaMemoria(i) {
  const vista = await rutinaFix(i);
  await rutinaPregunta(vista, 'pregunta_memoria', false);
  const nodo = pinta('<div class="barra" style="justify-content:center">' + esc(vista.texto_contador_opciones) + '</div><div class="zona-gpt"></div>' + htmlOpciones(vista));
  const onset = await flip();
  L.registrar_inicio('opciones', onset);
  Datos.add('respuesta_memoria.started', onset);
  const r = await esperar({ onset, tmax: CFG.DURACION_OPCIONES, teclas: ['1', '2', '3', '4'], raiz: nodo });
  Datos.add('respuesta_memoria.stopped', ahora());
  Datos.guardar(L.cerrar_memoria(r ? r.resp : null, r ? r.rt : null));
  Datos.add('tecla_memoria.keys', r ? r.resp : null); Datos.add('tecla_memoria.rt', r ? r.rt : null);
  Datos.add('respuesta_modo', r ? r.modo : null);
  loopCols('memoria_loop', i);
  Datos.next();
}

// ------------------------------------------------------------------ final y guardado
async function finalizar(mensaje, completo) {
  enCurso = false;
  pinta('<div class="centro"><div class="texto">' + txt(mensaje) + '</div><div class="cargando">Guardando tus respuestas… no cierres esta página.</div></div>');
  const csv = Datos.csv();
  respaldo(true);
  const nombre = nombreArchivo + (completo ? '' : '_INCOMPLETO') + '.csv';
  let ok = false;
  if (CONF.DATAPIPE_ID) ok = await enviarDataPipe(nombre, csv);
  if (ok) {
    try { localStorage.removeItem(CLAVE_RESPALDO); } catch (e) { /* nada */ }
    const n = pinta('<div class="centro"><div class="texto">' + txt(mensaje) + '\n\n✅ Tus respuestas se han guardado correctamente.\nYa puedes cerrar esta página.</div></div>');
    window.__estado = 'guardado';
    if (CONF.URL_FINAL) setTimeout(() => { location.href = CONF.URL_FINAL; }, 2500);
    return n;
  }
  if (!CONF.DATAPIPE_ID) {
    descargar(nombre, csv);
    pinta('<div class="centro"><div class="texto">' + txt(mensaje) + '\n\n(Modo prueba: no hay DATAPIPE_ID configurado, así que el CSV se ha descargado en este dispositivo.)</div>' +
          '<button class="btn btn-principal" id="bajar">Descargar de nuevo</button></div>');
  } else {
    pinta('<div class="centro"><div class="texto">' + txt(mensaje) + '\n\n⚠️ No se han podido enviar tus respuestas (¿sin conexión?).</div>' +
          '<button class="btn btn-principal" id="reintentar">Reintentar envío</button>' +
          '<button class="btn btn-principal" id="bajar">Descargar archivo</button>' +
          (CONF.CORREO_CONTACTO ? '<div class="texto peq" style="margin-top:12px">Si no funciona, descarga el archivo y envíalo a ' + esc(CONF.CORREO_CONTACTO) + '</div>' : '') + '</div>');
    const re = document.getElementById('reintentar');
    re.addEventListener('click', async () => { re.disabled = true; re.textContent = 'Enviando…'; if (await enviarDataPipe(nombre, csv)) { try { localStorage.removeItem(CLAVE_RESPALDO); } catch (e) { /* */ } pinta('<div class="centro"><div class="texto">✅ Respuestas guardadas. ¡Gracias!</div></div>'); } else { re.disabled = false; re.textContent = 'Reintentar envío'; } });
  }
  const b = document.getElementById('bajar'); if (b) b.addEventListener('click', () => descargar(nombre, csv));
  window.__estado = 'descargado';
  window.__csv = csv;
}

// ------------------------------------------------------------------ flujo principal
async function main() {
  enCurso = true;
  Datos.comunes = {
    participant: participante, session: sesion, date: fechaPsychoPy(inicioFecha), expName: CONF.EXP_NAME || 'trivia_movil',
    psychopyVersion: 'web-movil-1.0', OS: sistema(), frameRate: null,
    dispositivo: tipoDispositivo(), userAgent: navigator.userAgent,
    pantalla_px: screen.width + 'x' + screen.height, ventana_px: innerWidth + 'x' + innerHeight,
    pixel_ratio: devicePixelRatio, tactil: (navigator.maxTouchPoints > 0) ? 1 : 0,
    gpt_modo: CONF.GPT_MODO || 'texto', modo_rapido: RAPIDO ? 1 : 0,
  };
  // medir la tasa de refresco (Hz) con 60 fotogramas
  const fr = await new Promise(res => { const ts = []; (function f(t) { ts.push(t); if (ts.length < 61) requestAnimationFrame(f); else res(1000 / ((ts[60] - ts[0]) / 60)); })(performance.now()); requestAnimationFrame(() => {}); });
  Datos.comunes.frameRate = +fr.toFixed(2);

  L.iniciar_estado(window.BANCO, window.PRACTICA, window.DISTRACTOR);
  const n_banco = E.orden_banco.length;
  precargar(['IMAGES/moneda.png']);

  await bienvenida();
  await insertarCorreo();
  await pantallaTexto('instr_clasificacion', 'instr_clasificacion_tecla',
    '<div class="titulo">PRIMERA PARTE</div>Verás preguntas de cultura general, una cada vez y sin opciones de respuesta.\n\n¿Hasta qué punto crees que sabes la respuesta?\n\n<div style="text-align:left;display:inline-block">' + ESCALA.join('\n') + '</div>\n\nValora lo que crees saber antes de ver opciones.\nNo tienes que escribir la respuesta.\n\nResponde tocando el botón del 1 al 6.',
    { boton: 'Comenzar', teclas: ['space'] });

  for (let i = 0; i < n_banco; i++) {
    await valorarPregunta(i);
    if (E.estado_clasificacion !== 'en_curso') break;
  }

  // fin_clasificacion
  const res = L.cerrar_clasificacion();
  Datos.guardar(res[0]);
  if (!E.continuar) {
    Datos.add('fin_clasificacion.started', ahora()); Datos.add('fin_clasificacion.stopped', ahora()); Datos.next();
    return finalizar(res[1] + '\n\nLa tarea ha terminado. Gracias por participar.', false);
  }
  // precarga en segundo plano: tarea de puntos (+ capturas de ChatGPT si se usan)
  const urlsPuntos = [...new Set(E.puntos.flatMap(f => CFG.COLUMNAS_PUNTOS.map(c => 'IMAGES/' + String(f[c]).trim())))]
    .concat(['IMAGES/feedbackCorrect.png', 'IMAGES/feedbackIncorrect.png', 'IMAGES/feedbackOmission.png', 'IMAGES/aBlue1.png', 'IMAGES/aRed1.png', 'IMAGES/instPre5.png']);
  const urlsGPT = CONF.GPT_MODO === 'imagen' ? E.practica.concat(...E.bloques).map(e => e.GPT) : [];
  const cargaGPT = precargar(urlsGPT);
  const cargaPuntos = cargaGPT.then(() => precargar(urlsPuntos));

  await pantallaTexto('fin_clasificacion', 'cerrar', txt(res[1]), { teclas: ['space'] });

  await pantallaTexto('instr_trivial_1', 'resp1_instr',
    '<div class="titulo">SEGUNDA PARTE</div>Ahora vas a jugar una partida de trivial.\n\nSe presentarán preguntas de varias categorías:\nCultura general, arte, deportes, geografía y ciencias.\n\nCompetirás contra otros jugadores. Cuando termine el reclutamiento de todos los participantes, se te enviará un correo comunicando tu posición final.\n\nEl ganador tendrá premio... ¡Así que intenta ganar!');
  await pantallaTexto('instructions_trivial2', 'pasar_trial',
    'Responderás ' + (CFG.N_BLOQUES * CFG.PREGUNTAS_POR_BLOQUE) + ' preguntas distribuidas en ' + CFG.N_BLOQUES + ' bloques de ' + CFG.PREGUNTAS_POR_BLOQUE + '.\n\nCada pregunta aparecerá durante 5 segundos. Después tendrás hasta 20 segundos para responder tocando una de las 4 opciones.');
  await pantallaTexto('instr_trivial3', 'pasar_rutina',
    'Toca el botón «💬 Consultar ChatGPT» para ver su respuesta mientras se muestran las opciones.\n\nDebes utilizar las ' + CFG.AYUDAS_POR_BLOQUE + ' ayudas disponibles en cada bloque. Si quedan tantas ayudas como preguntas, debes consultar en todas las restantes.\n\nGanas ' + CFG.MONEDAS_ACIERTO + ' monedas por acertar y pierdes ' + Math.abs(CFG.MONEDAS_ERROR) + ' por fallar o no responder. Si terminas un bloque con ayudas sin usar, perderás la mitad del saldo positivo obtenido en ese bloque.\n\nConsultar no reinicia los 20 segundos.');
  L.iniciar_practica();
  await pantallaTexto('instr_prueba', 'paso',
    'Primero harás ' + CFG.N_PRACTICA + ' preguntas de práctica.\n\nPrueba a tocar «Consultar ChatGPT» para ver la ayuda.\n\nLas monedas de práctica no cuentan para los bloques principales.', { boton: 'Comenzar' });
  await cuentaAtras();

  for (let i = 0; i < CFG.N_PRACTICA; i++) await ensayoTrivia(i, 'practice_loop');

  L.iniciar_fase_principal();
  await pantallaTexto('iniciar_principal', 'iniciar_principal_tecla', 'La práctica ha terminado.\n\nAhora comenzarán los bloques principales.', { teclas: ['space'] });

  for (let b = 0; b < CFG.N_BLOQUES; b++) {
    const numero = b + 1;
    L.iniciar_bloque(numero);
    await pantallaTexto('inicio_bloque', 'inicio_bloque_tecla',
      txt('Bloque ' + numero + ' de ' + CFG.N_BLOQUES + '\n\n' + CFG.PREGUNTAS_POR_BLOQUE + ' preguntas y ' + CFG.AYUDAS_POR_BLOQUE + ' ayudas de ChatGPT.\nDebes utilizar todas las ayudas.'),
      { boton: 'Comenzar', teclas: ['space'], fila: false });
    for (let i = 0; i < CFG.PREGUNTAS_POR_BLOQUE; i++) await ensayoTrivia(i, 'principal_loop');
    await finBloque(b);
  }
  await pantallaTexto('fin_trivia', 'fin_trivia_tecla', 'Los bloques de trivia han terminado.\n\nAhora realizarás otra tarea.', { teclas: ['space'] });

  // tarea de puntos: asegurar que las imágenes están cargadas
  let listo = false;
  cargaPuntos.then(() => { listo = true; });
  if (!listo) {
    const n = pinta('<div class="centro"><div class="texto">Cargando la siguiente tarea…</div></div>');
    await cargaPuntos; void n;
  }
  for (let k = 0; k < INSTR_PUNTOS.length; k++) {
    await pantallaTexto('instr_puntos', 'tecla_instr_puntos', INSTR_PUNTOS[k],
      { boton: k === INSTR_PUNTOS.length - 1 ? 'Comenzar' : 'Continuar', teclas: ['space'], desde: 0.5, fila: false });
    loopCols('instr_puntos_loop', k);
    Datos.next();
  }
  for (let i = 0; i < CFG.N_ENSAYOS_PUNTOS; i++) await escenaPuntos(i);

  // memoria
  const dm = L.preparar_memoria();
  Datos.guardar(dm);
  let msgMem;
  if (E.continuar) {
    const aparicion = E.memoria_hay_nuevas ? 'Algunas aparecieron antes y otras no.' : 'Todas han aparecido antes en la tarea.';
    msgMem = 'Ahora responderás ' + E.memoria.length + ' preguntas. ' + aparicion +
             '\n\nResponde tocando una de las 4 opciones. No dispondrás de ayudas de ChatGPT.' +
             '\n\nTendrás hasta 20 segundos para responder. No recibirás feedback ni monedas.';
  } else {
    msgMem = 'No hay suficientes preguntas con y sin ayuda de ChatGPT para la última fase.\n\nContacta con el equipo investigador.';
  }
  await pantallaTexto('inicio_memoria', 'comenzar_memoria', txt(msgMem), { boton: E.continuar ? 'Comenzar' : 'Finalizar', teclas: ['space'] });
  if (!E.continuar) return finalizar('La tarea ha terminado. Gracias por participar.', false);

  // espera_memoria
  {
    const nodo = pinta('<div class="centro"><div class="texto"></div></div>');
    const onset = await flip();
    Datos.add('espera_memoria.started', onset);
    const el = nodo.querySelector('.texto');
    const solicitada = Math.max(0, E.memoria_no_antes_de - onset);
    await esperar({ onset, tick: () => {
      const resta = E.memoria_no_antes_de - ahora();
      if (resta <= 0) return false;
      el.textContent = 'El siguiente bloque comienza en ' + L.formato_mmss(Math.ceil(resta / CFG.FACTOR_TIEMPO));
    } });
    Datos.add('espera_memoria.stopped', ahora());
    Datos.add('fase', 'espera_memoria');
    Datos.add('mem_espera_solicitada', solicitada);
    Datos.add('mem_espera_real', ahora() - onset);
    Datos.add('mem_intervalo_minimo_configurado', CFG.MIN_INTERVALO_MEMORIA);
    Datos.next();
  }
  for (let i = 0; i < E.memoria.length; i++) await rutinaMemoria(i);

  // fin_experimento
  Datos.guardar(L.cerrar_experimento());
  const msgFin = 'La tarea ha terminado.\n\nMonedas totales: ' + L.formato_numero(E.monedas) + '\n\n¡Gracias por participar!';
  await pantallaTexto('fin_experimento', 'salir_experimento', txt(msgFin), { boton: 'Finalizar', teclas: ['space'] });
  return finalizar(msgFin, true);
}

window.addEventListener('error', ev => { try { Datos.add('error_js', String(ev.message)); respaldo(false); } catch (e) { /* */ } });
main().catch(err => {
  console.error(err);
  try { Datos.add('error_js', String(err && err.stack || err)); Datos.next(); } catch (e) { /* */ }
  finalizar('Se ha producido un error inesperado.\n\n' + (err && err.message ? err.message : err), false);
});
})();
