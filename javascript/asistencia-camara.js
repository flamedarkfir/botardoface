// ===== asistencia-camara.js =====
// Sección "Cámara" (solo profesores): muestra el video de la ESP32-CAM,
// reconoce a los alumnos registrados y marca su asistencia una vez al día.
//
// Datos en Realtime Database:
//   rostros/{botardoId}                          vectores faciales + colegio/grado (solo staff)
//   asistencias/{colegio}/{grado}/{botardoId}/{fecha}   lo que lee el Salón del alumno
//   asistenciaDia/{fecha}/{botardoId}            índice del día para la lista en vivo (solo staff)
//   asistencias_config/desde/{botardoId}         desde cuándo cuentan las faltas
//   asistencias_config/diasSinClase/{fecha}      festivos / días sin clase
//
// Los horarios y umbrales se cambian en asistencia-logic.js.

import { rtdb, db, ref, get, set, update, remove, push, onValue, collection, query, where, getDocs } from './firebase-config.js';
import { esCuentaStaff } from './badges.js';
import {
    ASISTENCIA_CONFIG as CFG,
    fechaISO,
    horaHHMM,
    estadoPorHora,
    estadoDeToma,
    estadoEfectivo,
    slugTexto,
    ConfirmadorRostros
} from './asistencia-logic.js';

const PORT = 81;
const KEY_IP = 'botardo_camara_ip';
const FACEAPI_SRC = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

const ETIQUETAS = {
    presente: 'Presente',
    tarde: 'Tarde',
    justificada: 'Justificada',
    falta: 'Falta',
    pendiente: 'Pendiente'
};

const COLORES = {
    presente: '#2e7d32',
    tarde: '#e65100',
    justificada: '#1565c0',
    falta: '#c62828',
    pendiente: '#6b7a8d'
};

const S = {
    init: false,
    started: false,
    user: null,
    userData: null,
    models: false,
    live: false,
    busy: false,
    capturando: false,
    auto: true,
    host: '',
    token: 0,
    fails: 0,
    miss: 0,
    ping80: false,
    retry: null,
    watch: null,
    rostros: {},
    hoy: {},
    fechaHoy: '',
    unsubHoy: null,
    diasSinClase: new Set(),
    matcher: null,
    alumno: null,
    marcando: new Set(),
    confirmador: new ConfirmadorRostros(),
    work: document.createElement('canvas'),
    crop: document.createElement('canvas'),
    hoyListo: false,
    ultimo: {},
    listaT: null,
    toastTimer: null
};

function $(id) {
    return document.getElementById(id);
}

function esc(texto) {
    return String(texto == null ? '' : texto).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function sleep(ms) {
    return new Promise(function(r) { setTimeout(r, ms); });
}

export function suscribirReconocimientos24h(cb) {
    let hoy = {};
    let ayer = {};
    let dia = '';
    let bajas = [];
    function calcular() {
        const limite = Date.now() - 86400000;
        let n = 0;
        [hoy, ayer].forEach(function(d) {
            Object.keys(d).forEach(function(k) { if (d[k] > limite) n++; });
        });
        cb(n);
    }
    function conectar() {
        const ahora = new Date();
        const f = fechaISO(ahora);
        if (f === dia) return;
        dia = f;
        bajas.forEach(function(b) { b(); });
        hoy = {};
        ayer = {};
        bajas = [
            onValue(ref(rtdb, 'reconocimientos/' + f), function(s) { hoy = s.val() || {}; calcular(); }, function() {}),
            onValue(ref(rtdb, 'reconocimientos/' + fechaISO(new Date(ahora.getTime() - 86400000))), function(s) { ayer = s.val() || {}; calcular(); }, function() {})
        ];
    }
    conectar();
    setInterval(function() { conectar(); calcular(); }, 60000);
}

// ---------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------
export function initAsistenciaCamara(opciones) {
    const o = opciones || {};
    if (S.init) return;
    if (!o.user || !o.userData || !esCuentaStaff(o.userData.email)) return;
    S.init = true;
    S.user = o.user;
    S.userData = o.userData;

    const navItem = $('navItemAsistencia');
    if (navItem) navItem.style.display = '';

    conectarInterfaz();

    const link = document.querySelector('.sidebar-nav a[data-section="asistencia"]');
    if (link) link.addEventListener('click', iniciar);
    if (window.location.hash === '#asistencia' && link) link.click();
}

async function iniciar() {
    if (S.started) return;
    S.started = true;
    avisoHttps();
    suscribirDatos();
    relojVentana();
    setInterval(relojVentana, 15000);
    setInterval(suscribirHoy, 30000);
    buscarCamara();
    await cargarModelos();
    bucleDeteccion();
}

function avisoHttps() {
    const el = $('asisHttpsAviso');
    if (el && window.location.protocol === 'https:') el.style.display = 'block';
}

// ---------------------------------------------------------------
// Datos en tiempo real
// ---------------------------------------------------------------
function errorDatos(err) {
    console.error('Asistencia: error leyendo datos', err);
    setEstado('error', 'Sin permiso para leer los datos. Revisa las Reglas de Firebase.');
}

function suscribirDatos() {
    onValue(ref(rtdb, 'rostros'), function(snap) {
        S.rostros = {};
        snap.forEach(function(hijo) {
            const v = hijo.val();
            if (v && v.descriptors) S.rostros[hijo.key] = v;
        });
        reconstruirMatcher();
        renderLista();
    }, errorDatos);

    onValue(ref(rtdb, 'asistencias_config/diasSinClase'), function(snap) {
        S.diasSinClase = new Set(Object.keys(snap.val() || {}));
        renderDias();
        relojVentana();
        renderLista();
    }, function() {});

    suscribirHoy();
}

function suscribirHoy() {
    const fecha = fechaISO(new Date());
    if (S.fechaHoy === fecha && S.unsubHoy) return;
    if (S.unsubHoy) S.unsubHoy();
    S.fechaHoy = fecha;
    S.hoy = {};
    S.hoyListo = false;
    S.unsubHoy = onValue(ref(rtdb, 'asistenciaDia/' + fecha), function(snap) {
        S.hoy = snap.val() || {};
        S.hoyListo = true;
        renderLista();
    }, errorDatos);
    relojVentana();
}

function normalizarDescriptores(d) {
    const lista = Array.isArray(d) ? d : Object.values(d || {});
    return lista.map(function(x) {
        return new Float32Array(Array.isArray(x) ? x : Object.values(x || {}));
    }).filter(function(a) { return a.length === 128; });
}

function reconstruirMatcher() {
    if (!S.models || !window.faceapi) return;
    const etiquetados = [];
    Object.keys(S.rostros).forEach(function(id) {
        const lista = normalizarDescriptores(S.rostros[id].descriptors);
        if (lista.length) etiquetados.push(new window.faceapi.LabeledFaceDescriptors(id, lista));
    });
    S.matcher = etiquetados.length ? new window.faceapi.FaceMatcher(etiquetados, CFG.UMBRAL) : null;
}

// ---------------------------------------------------------------
// Modelos de reconocimiento facial
// ---------------------------------------------------------------
function cargarScript(src) {
    return new Promise(function(resolve, reject) {
        if (window.faceapi) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = function() { reject(new Error('No se pudo cargar face-api')); };
        document.head.appendChild(s);
    });
}

async function cargarModelos() {
    try {
        mensajeCaptura('Cargando reconocimiento facial...');
        await cargarScript(FACEAPI_SRC);
        await window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
        await window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        S.models = true;
        reconstruirMatcher();
        mensajeCaptura('');
        renderLista();
    } catch (e) {
        console.error('Asistencia: modelos', e);
        mensajeCaptura('No se pudo cargar el reconocimiento facial. Este computador necesita internet.');
    }
}

function opcionesDetector() {
    return new window.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
}

function opcionesRecorte() {
    return new window.faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.3 });
}

async function descriptorDe(c, b) {
    const m = 0.35;
    const x = Math.max(0, b.x - b.width * m);
    const y = Math.max(0, b.y - b.height * m);
    const w = Math.min(c.width - x, b.width * (1 + 2 * m));
    const h = Math.min(c.height - y, b.height * (1 + 2 * m));
    const k = 192 / Math.max(w, h);
    S.crop.width = Math.max(32, Math.round(w * k));
    S.crop.height = Math.max(32, Math.round(h * k));
    S.crop.getContext('2d').drawImage(c, x, y, w, h, 0, 0, S.crop.width, S.crop.height);
    const r = await window.faceapi.detectSingleFace(S.crop, opcionesRecorte()).withFaceLandmarks(true).withFaceDescriptor();
    return r ? r.descriptor : null;
}

async function analizar(c) {
    const dets = await window.faceapi.detectAllFaces(c, opcionesDetector());
    dets.sort(function(a, b) { return b.box.width - a.box.width; });
    const salida = [];
    let usados = 0;
    for (let i = 0; i < dets.length; i++) {
        const b = dets[i].box;
        const info = { box: b, tipo: 'desconocido', id: null };
        if (b.width / c.width < CFG.MIN_ROSTRO) {
            info.tipo = 'lejos';
        } else if (usados >= CFG.MAX_ROSTROS) {
            info.tipo = 'espera';
        } else if (S.matcher) {
            usados++;
            const d = await descriptorDe(c, b);
            if (d) {
                const m = S.matcher.findBestMatch(d);
                if (m.label !== 'unknown' && S.rostros[m.label]) {
                    info.tipo = 'conocido';
                    info.id = m.label;
                }
            }
        }
        salida.push(info);
    }
    return salida;
}

function tomarFrame() {
    const vid = $('asisVid');
    const w = vid.naturalWidth;
    const h = vid.naturalHeight;
    if (!w || !h) return null;
    const escala = Math.min(1, 640 / w);
    S.work.width = Math.round(w * escala);
    S.work.height = Math.round(h * escala);
    S.work.getContext('2d').drawImage(vid, 0, 0, S.work.width, S.work.height);
    return S.work;
}

// ---------------------------------------------------------------
// Búsqueda y conexión automática de la cámara
// ---------------------------------------------------------------
function ipGuardada() {
    try { return localStorage.getItem(KEY_IP) || ''; } catch (e) { return ''; }
}

function guardarIp(ip) {
    try { localStorage.setItem(KEY_IP, ip); } catch (e) {}
}

async function probe80(host, ms) {
    const c = new AbortController();
    const t = setTimeout(function() { c.abort(); }, ms);
    try {
        const r = await fetch('http://' + host + '/ping', { cache: 'no-store', signal: c.signal });
        const x = await r.text();
        clearTimeout(t);
        return x.trim() === 'esp32cam';
    } catch (e) {
        clearTimeout(t);
        return false;
    }
}

async function probe81(host, ms) {
    const c = new AbortController();
    const t = setTimeout(function() { c.abort(); }, ms);
    try {
        await fetch('http://' + host + ':' + PORT + '/ping', { mode: 'no-cors', cache: 'no-store', signal: c.signal });
        clearTimeout(t);
        return true;
    } catch (e) {
        clearTimeout(t);
        return false;
    }
}

async function probe(host, ms) {
    const r = await Promise.all([probe80(host, ms), probe81(host, ms)]);
    return r[0] ? 2 : (r[1] ? 1 : 0);
}

function listaBusqueda() {
    const l = [];
    [1, 0, 43, 100, 10, 2, 68, 3, 4, 5].forEach(function(i) { l.push('192.168.' + i + '.200'); });
    for (let i = 0; i < 256; i++) l.push('192.168.' + i + '.200');
    ['10.0.0.200', '10.0.1.200', '10.1.1.200', '10.0.0.201', '172.16.0.200', '172.20.10.14'].forEach(function(x) { l.push(x); });
    return l.filter(function(v, i, a) { return a.indexOf(v) === i; });
}

async function encontrarCamara(mi) {
    const guardada = ipGuardada();
    if (guardada) {
        const r = await probe(guardada, 1500);
        if (r) { S.ping80 = r === 2; return guardada; }
        if (mi !== S.token) return '';
    }
    const m = await probe('esp32cam.local', 2500);
    if (m) { S.ping80 = m === 2; return 'esp32cam.local'; }
    const lista = listaBusqueda();
    for (let i = 0; i < lista.length; i += 48) {
        if (mi !== S.token) return '';
        const lote = lista.slice(i, i + 48);
        const res = await Promise.all(lote.map(function(ip) { return probe(ip, 800); }));
        const k = res.findIndex(function(v) { return v > 0; });
        if (k >= 0) { S.ping80 = res[k] === 2; return lote[k]; }
        setEstado('wait', 'Buscando cámara... ' + Math.min(i + 48, lista.length) + '/' + lista.length);
    }
    return '';
}

function reproducir(host) {
    const vid = $('asisVid');
    S.host = host;
    guardarIp(host);
    clearTimeout(S.watch);
    setEstado('wait', 'Conectando a ' + host + '...');
    vid.crossOrigin = 'anonymous';
    vid.removeAttribute('src');
    setTimeout(function() {
        vid.src = 'http://' + host + ':' + PORT + '/stream?' + Date.now();
    }, 80);
    S.watch = setTimeout(function() { if (!S.live) recuperar(); }, 8000);
}

function recuperar() {
    S.live = false;
    limpiarOverlay();
    clearTimeout(S.retry);
    clearTimeout(S.watch);
    S.fails++;
    if (S.host && S.fails <= 5) {
        setEstado('wait', 'Reconectando...');
        S.retry = setTimeout(function() { reproducir(S.host); }, 1200);
    } else {
        S.fails = 0;
        buscarCamara();
    }
}

async function buscarCamara() {
    const mi = ++S.token;
    clearTimeout(S.retry);
    clearTimeout(S.watch);
    S.live = false;
    S.fails = 0;
    limpiarOverlay();
    setEstado('wait', 'Buscando cámara...');
    const host = await encontrarCamara(mi);
    if (mi !== S.token) return;
    if (!host) {
        setEstado('off', 'Cámara no encontrada. Conéctala a la WiFi, la sigo buscando...');
        S.retry = setTimeout(buscarCamara, 3000);
        return;
    }
    reproducir(host);
}

function vigilarVideo() {
    const vid = $('asisVid');
    vid.onerror = recuperar;
    setInterval(function() {
        if (S.host && !S.live && vid.naturalWidth > 0) {
            S.live = true;
            S.fails = 0;
            S.miss = 0;
            clearTimeout(S.watch);
            setEstado('on', 'En vivo · ' + S.host);
        }
    }, 400);
    setInterval(async function() {
        if (!S.live || !S.ping80 || !S.host) return;
        const ok = await probe80(S.host, 2500);
        if (ok) S.miss = 0;
        else if (++S.miss >= 3) { S.miss = 0; recuperar(); }
    }, 5000);
}

function setEstado(tipo, texto) {
    const dot = $('asisDot');
    const est = $('asisEstado');
    const idle = $('asisIdle');
    const idleTxt = $('asisIdleText');
    if (dot) dot.className = 'asis-dot ' + tipo;
    if (est) est.textContent = texto;
    if (idle) idle.style.display = tipo === 'on' ? 'none' : 'flex';
    if (idleTxt) idleTxt.textContent = texto;
}

// ---------------------------------------------------------------
// Detección y marcado de asistencia
// ---------------------------------------------------------------
async function bucleDeteccion() {
    let espera = 250;
    if (S.models && S.live && !S.capturando) {
        const t0 = performance.now();
        try {
            const c = tomarFrame();
            if (c) procesarResultados(await analizar(c), c);
        } catch (e) {}
        espera = Math.max(150, Math.min(1200, performance.now() - t0));
    }
    setTimeout(bucleDeteccion, espera);
}

function procesarResultados(vistos, c) {
    const ahora = Date.now();
    const toma = estadoDeToma(new Date(), S.diasSinClase);
    vistos.forEach(function(v) {
        if (v.id && S.confirmador.registrarVisto(v.id, ahora)) {
            S.confirmador.reiniciar(v.id);
            reconocido(v.id, toma);
        }
    });
    S.confirmador.limpiar(ahora);
    dibujar(vistos, c, toma);
}

function notificar(rostro, titulo, mensaje) {
    if (!rostro || !rostro.uid) return;
    const nueva = push(ref(rtdb, 'users/' + rostro.uid + '/notificaciones'));
    set(nueva, { tipo: 'live', titulo: titulo, mensaje: mensaje, target: 'section-camara', fromUid: null, ts: Date.now(), leido: false })
        .catch(function(e) { console.error('Asistencia: notificación', e); });
}

function contarEvento() {
    set(push(ref(rtdb, 'reconocimientos/' + fechaISO(new Date()))), Date.now())
        .catch(function(e) { console.error('Asistencia: contador', e); });
}

async function reconocido(id, toma) {
    const rostro = S.rostros[id];
    if (!rostro) return;
    const ahora = Date.now();
    if (ahora - (S.ultimo[id] || 0) < CFG.COOLDOWN_MS) return;
    S.ultimo[id] = ahora;
    contarEvento();

    if (!S.hoy[id] && S.hoyListo && S.auto && toma.puede) {
        if (await marcar(id, 'camara')) return;
    }

    const hora = horaHHMM(new Date());
    const reg = S.hoy[id];
    let texto = 'Te reconocimos a las ' + hora + '.';
    if (reg) texto += ' Tu asistencia de hoy ya estaba registrada (' + ETIQUETAS[reg.estado || 'presente'].toLowerCase() + ').';
    else if (!toma.puede) texto += ' Fue fuera del horario de asistencia.';
    notificar(rostro, 'Rostro reconocido', texto);
}

async function marcar(id, fuente, estadoForzado) {
    const rostro = S.rostros[id];
    if (!rostro || S.marcando.has(id)) return false;
    if (!estadoForzado && S.hoy[id]) return false;
    S.marcando.add(id);

    const ahora = new Date();
    const fecha = fechaISO(ahora);
    const estado = estadoForzado || estadoPorHora(ahora);
    const registro = { estado: estado, hora: horaHHMM(ahora), fuente: fuente || 'camara', por: S.user.uid, ts: Date.now() };
    const rutaDia = 'asistenciaDia/' + fecha + '/' + id;
    const acts = {};
    acts['asistencias/' + slugTexto(rostro.colegio) + '/' + slugTexto(rostro.grado) + '/' + id + '/' + fecha] = registro;
    acts[rutaDia] = Object.assign({ nombre: rostro.nombre, colegio: rostro.colegio, grado: rostro.grado }, registro);

    let escrito = false;
    try {
        if (!estadoForzado) {
            const previo = await get(ref(rtdb, rutaDia));
            if (previo.exists()) {
                S.hoy[id] = previo.val();
                renderLista();
                S.marcando.delete(id);
                return false;
            }
        }
        await update(ref(rtdb), acts);
        escrito = true;
        S.hoy[id] = acts[rutaDia];
        mostrarToast('✓ ' + rostro.nombre + ' — ' + ETIQUETAS[estado].toLowerCase() + ' a las ' + registro.hora, estado);
        renderLista();
        if (fuente === 'manual') {
            notificar(rostro, 'Asistencia actualizada', 'Un profesor registró tu asistencia de hoy como: ' + ETIQUETAS[estado].toLowerCase() + '.');
        } else {
            notificar(rostro, 'Asistencia registrada', 'Llegaste a las ' + registro.hora + ' y quedaste como ' + ETIQUETAS[estado].toLowerCase() + '.');
        }
    } catch (e) {
        console.error('Asistencia: no se pudo guardar', e);
        mostrarToast('No se pudo guardar la asistencia de ' + rostro.nombre, 'falta');
    }
    S.marcando.delete(id);
    return escrito;
}

async function limpiarRegistro(id) {
    const rostro = S.rostros[id];
    if (!rostro) return;
    const fecha = fechaISO(new Date());
    const acts = {};
    acts['asistencias/' + slugTexto(rostro.colegio) + '/' + slugTexto(rostro.grado) + '/' + id + '/' + fecha] = null;
    acts['asistenciaDia/' + fecha + '/' + id] = null;
    try {
        await update(ref(rtdb), acts);
        delete S.hoy[id];
        renderLista();
        notificar(rostro, 'Asistencia actualizada', 'Un profesor quitó tu registro de asistencia de hoy.');
    } catch (e) {
        console.error('Asistencia: no se pudo limpiar', e);
        mostrarToast('No se pudo quitar el registro', 'falta');
    }
}

// ---------------------------------------------------------------
// Dibujo sobre el video
// ---------------------------------------------------------------
function limpiarOverlay() {
    const cv = $('asisOverlay');
    if (!cv) return;
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
}

function dibujar(vistos, c, toma) {
    const vid = $('asisVid');
    const stage = $('asisStage');
    const cv = $('asisOverlay');
    if (!vid || !stage || !cv) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    const vw = vid.naturalWidth;
    const vh = vid.naturalHeight;
    if (!vw || !vh) return;
    const sc = Math.min(W / vw, H / vh);
    const dw = vw * sc;
    const dh = vh * sc;
    const ox = (W - dw) / 2;
    const oy = (H - dh) / 2;

    vistos.forEach(function(v) {
        const x = ox + (v.box.x / c.width) * dw;
        const y = oy + (v.box.y / c.height) * dh;
        const w = (v.box.width / c.width) * dw;
        const h = (v.box.height / c.height) * dh;
        let texto = 'Desconocido';
        let color = '#f5a623';

        if (v.tipo === 'lejos') {
            texto = 'Acércate';
            color = '#8a97a8';
        } else if (v.tipo === 'espera') {
            texto = 'En espera...';
            color = '#8a97a8';
        } else if (v.tipo === 'conocido') {
            const rostro = S.rostros[v.id];
            const reg = S.hoy[v.id];
            if (reg) {
                texto = '✓ En lista · ' + rostro.nombre + ' · ' + ETIQUETAS[reg.estado || 'presente'].toLowerCase() + (reg.hora ? ' ' + reg.hora : '');
                color = COLORES[reg.estado || 'presente'];
            } else if (!S.auto) {
                texto = rostro.nombre + ' · toma en pausa';
                color = '#6b7a8d';
            } else if (!toma.puede) {
                texto = rostro.nombre + ' · fuera de horario';
                color = '#6b7a8d';
            } else {
                texto = rostro.nombre + ' · marcando...';
                color = '#1e88e5';
            }
        }

        g.lineWidth = 3;
        g.strokeStyle = color;
        g.strokeRect(x, y, w, h);
        g.font = '600 14px system-ui, sans-serif';
        const tw = g.measureText(texto).width + 14;
        const ty = Math.max(0, y - 28);
        g.fillStyle = color;
        g.fillRect(x, ty, tw, 26);
        g.fillStyle = '#ffffff';
        g.fillText(texto, x + 7, ty + 18);
    });
}

function mostrarToast(texto, tipo) {
    const el = $('asisToast');
    if (!el) return;
    el.textContent = texto;
    el.style.background = COLORES[tipo] || COLORES.presente;
    el.classList.add('show');
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(function() { el.classList.remove('show'); }, 4000);
}

// ---------------------------------------------------------------
// Lista del día y ventana de horario
// ---------------------------------------------------------------
function relojVentana() {
    const el = $('asisVentana');
    if (!el) return;
    const ahora = new Date();
    suscribirHoy();
    const toma = estadoDeToma(ahora, S.diasSinClase);
    const fechaTxt = ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
    let detalle = '';
    if (toma.fase === 'sin-clase') detalle = 'Hoy no es día de clase: la toma está desactivada.';
    else if (toma.fase === 'cerrado') detalle = 'Toma cerrada desde las ' + CFG.HORA_CIERRE + '. Quien no marcó tiene falta.';
    else if (toma.fase === 'tarde') detalle = 'Después de las ' + CFG.HORA_LIMITE + ': las llegadas quedan como tarde.';
    else detalle = 'Llegada a tiempo: ' + CFG.HORA_INICIO + ' a ' + CFG.HORA_LIMITE + '.';
    el.innerHTML = '<strong>' + esc(fechaTxt) + '</strong> · ' + esc(detalle);
}

function renderLista() {
    if (S.listaT) return;
    S.listaT = setTimeout(function() {
        S.listaT = null;
        renderListaYa();
    }, 150);
}

function renderListaYa() {
    const cont = $('asisLista');
    if (!cont) return;
    const ahora = new Date();
    const ids = Object.keys(S.rostros);

    const conteo = { presente: 0, tarde: 0, justificada: 0, falta: 0, pendiente: 0 };
    const grupos = {};

    ids.forEach(function(id) {
        const r = S.rostros[id];
        const estado = estadoEfectivo(S.hoy[id], ahora, S.diasSinClase);
        conteo[estado] = (conteo[estado] || 0) + 1;
        const clave = (r.colegio || 'Sin colegio') + ' · ' + (r.grado || 'Sin grado');
        if (!grupos[clave]) grupos[clave] = [];
        grupos[clave].push({ id: id, rostro: r, estado: estado, registro: S.hoy[id] });
    });

    const total = ids.length;
    const enLista = conteo.presente + conteo.tarde + conteo.justificada;
    const resumen = $('asisResumen');
    if (resumen) {
        resumen.innerHTML =
            chip('presente', conteo.presente, 'Presentes') +
            chip('tarde', conteo.tarde, 'Tarde') +
            chip('justificada', conteo.justificada, 'Justificadas') +
            chip(conteo.falta > 0 ? 'falta' : 'pendiente', conteo.falta > 0 ? conteo.falta : conteo.pendiente, conteo.falta > 0 ? 'Faltas' : 'Pendientes');
    }
    const barra = $('asisProgresoBarra');
    const textoBarra = $('asisProgresoTexto');
    if (barra) barra.style.width = (total ? Math.round((enLista / total) * 100) : 0) + '%';
    if (textoBarra) {
        textoBarra.textContent = total
            ? (enLista === total ? 'Lista completa: ' + enLista + ' de ' + total : 'En lista: ' + enLista + ' de ' + total + ' · faltan ' + (total - enLista))
            : 'Todavía no hay alumnos con rostro registrado';
    }

    if (!total) {
        cont.innerHTML = '<p class="asis-vacio">Registra el rostro de un alumno (con su ID) para que aparezca aquí.</p>';
        return;
    }

    const claves = Object.keys(grupos).sort();
    cont.innerHTML = claves.map(function(clave) {
        const filas = grupos[clave].sort(function(a, b) {
            return String(a.rostro.nombre).localeCompare(String(b.rostro.nombre), 'es');
        }).map(function(f) {
            const hora = f.registro && f.registro.hora ? ' ' + esc(f.registro.hora) : '';
            const manual = f.registro && f.registro.fuente === 'manual' ? ' · manual' : '';
            return '<div class="asis-fila" data-id="' + esc(f.id) + '">' +
                '<span class="asis-avatar">' + esc(String(f.rostro.nombre || '?').trim().charAt(0).toUpperCase()) + '</span>' +
                '<span class="asis-nombre">' + esc(f.rostro.nombre) + '</span>' +
                '<span class="asis-badge" style="background:' + COLORES[f.estado] + ';">' + ETIQUETAS[f.estado] + hora + esc(manual) + '</span>' +
                '<span class="asis-acciones">' +
                '<button type="button" data-accion="presente" title="Marcar presente"><i class="fas fa-check"></i></button>' +
                '<button type="button" data-accion="tarde" title="Marcar tarde"><i class="fas fa-clock"></i></button>' +
                '<button type="button" data-accion="justificada" title="Falta justificada"><i class="fas fa-file-medical"></i></button>' +
                '<button type="button" data-accion="falta" title="Marcar falta"><i class="fas fa-user-xmark"></i></button>' +
                '<button type="button" data-accion="limpiar" title="Quitar registro de hoy"><i class="fas fa-rotate-left"></i></button>' +
                '</span></div>';
        }).join('');
        return '<div class="asis-grupo"><div class="asis-grupo-titulo">' + esc(clave) + '</div>' + filas + '</div>';
    }).join('');
}

function chip(tipo, numero, texto) {
    return '<span class="asis-chip" style="--c:' + COLORES[tipo] + ';"><b>' + numero + '</b> ' + esc(texto) + '</span>';
}

// ---------------------------------------------------------------
// Días sin clase
// ---------------------------------------------------------------
function renderDias() {
    const cont = $('asisDiasLista');
    if (!cont) return;
    const dias = Array.from(S.diasSinClase).sort();
    if (!dias.length) {
        cont.innerHTML = '<p class="asis-vacio">No hay días sin clase marcados.</p>';
        return;
    }
    cont.innerHTML = dias.map(function(f) {
        return '<span class="asis-dia">' + esc(f) + ' <button type="button" data-fecha="' + esc(f) + '" title="Quitar">&times;</button></span>';
    }).join('');
}

async function agregarDia() {
    const input = $('asisDiaInput');
    const fecha = input ? input.value : '';
    if (!fecha) return;
    try {
        await set(ref(rtdb, 'asistencias_config/diasSinClase/' + fecha), true);
        input.value = '';
    } catch (e) {
        mostrarToast('No se pudo guardar el día sin clase', 'falta');
    }
}

async function quitarDia(fecha) {
    try {
        await remove(ref(rtdb, 'asistencias_config/diasSinClase/' + fecha));
    } catch (e) {
        mostrarToast('No se pudo quitar el día sin clase', 'falta');
    }
}

// ---------------------------------------------------------------
// Registro de rostros (solo con el ID del alumno)
// ---------------------------------------------------------------
function mensajeCaptura(texto) {
    const el = $('asisCapturaMsg');
    if (el) el.textContent = texto || '';
}

async function buscarAlumno() {
    const input = $('asisIdInput');
    const codigo = input ? input.value.trim() : '';
    const card = $('asisAlumnoCard');
    S.alumno = null;
    if (card) card.style.display = 'none';
    if (!codigo) { mensajeCaptura('Escribe el ID del alumno.'); return; }
    mensajeCaptura('Buscando alumno...');
    try {
        const snap = await getDocs(query(collection(db, 'users'), where('botardoId', '==', codigo)));
        if (snap.empty) { mensajeCaptura('No se encontró ningún alumno con ese ID.'); return; }
        const doc0 = snap.docs[0];
        const data = doc0.data();
        if (!data.colegio || !data.grado) {
            mensajeCaptura('Este alumno no tiene colegio y grado. Asígnalos primero en el Panel de profesores.');
            return;
        }
        S.alumno = { id: codigo, uid: doc0.id, data: data };
        $('asisAlumnoNombre').textContent = data.name || data.username || 'Alumno';
        $('asisAlumnoMeta').textContent = (data.colegio || '') + ' · ' + (data.grado || '') + (data.username ? ' · @' + data.username : '');
        const existente = S.rostros[codigo];
        $('asisCapturarBtn').textContent = existente ? 'Volver a capturar rostro' : 'Capturar rostro';
        $('asisEliminarRostroBtn').style.display = existente ? '' : 'none';
        if (card) card.style.display = '';
        mensajeCaptura(existente ? 'Este alumno ya tiene rostro registrado.' : 'Pídele al alumno que mire la cámara y pulsa "Capturar rostro".');
    } catch (e) {
        console.error('Asistencia: búsqueda de alumno', e);
        mensajeCaptura('No se pudo buscar al alumno (' + (e.code || e.message) + ').');
    }
}

async function capturarRostro() {
    if (!S.alumno) return;
    if (!S.models || !S.live) { mensajeCaptura('Espera a que la cámara y el reconocimiento estén listos.'); return; }
    const btn = $('asisCapturarBtn');
    S.capturando = true;
    btn.disabled = true;
    limpiarOverlay();

    const muestras = [];
    for (let intento = 0; intento < 70 && muestras.length < CFG.MUESTRAS; intento++) {
        try {
            const c = tomarFrame();
            if (c) {
                const dets = await window.faceapi.detectAllFaces(c, opcionesDetector());
                if (dets.length > 1) {
                    mensajeCaptura('Hay más de una persona frente a la cámara.');
                } else if (dets.length === 1 && dets[0].box.width / c.width >= CFG.MIN_ROSTRO) {
                    const d = await descriptorDe(c, dets[0].box);
                    if (d) {
                        muestras.push(Array.from(d, function(v) { return Math.round(v * 10000) / 10000; }));
                        mensajeCaptura('Capturando... ' + muestras.length + '/' + CFG.MUESTRAS);
                    }
                } else {
                    mensajeCaptura('Acerca el rostro a la cámara...');
                }
            }
        } catch (e) {}
        await sleep(350);
    }

    try {
        if (muestras.length < CFG.MUESTRAS_MIN) {
            mensajeCaptura('No se logró capturar el rostro. Mejora la luz, acércate y vuelve a intentar.');
            return;
        }
        const nombre = S.alumno.data.name || S.alumno.data.username || 'Alumno';

        if (S.matcher) {
            const m = S.matcher.findBestMatch(new Float32Array(muestras[0]));
            if (m.label !== 'unknown' && m.label !== S.alumno.id && m.distance < 0.45) {
                const otro = S.rostros[m.label];
                const seguir = window.confirm('Este rostro ya está registrado como ' + (otro ? otro.nombre : 'otro alumno') + '. ¿Guardarlo igualmente para ' + nombre + '?');
                if (!seguir) { mensajeCaptura('Registro cancelado.'); return; }
            }
        }

        await set(ref(rtdb, 'rostros/' + S.alumno.id), {
            nombre: nombre,
            username: S.alumno.data.username || '',
            uid: S.alumno.uid,
            colegio: S.alumno.data.colegio,
            grado: S.alumno.data.grado,
            descriptors: muestras,
            fecha: new Date().toISOString(),
            por: S.user.uid
        });

        const desdeRef = ref(rtdb, 'asistencias_config/desde/' + S.alumno.id);
        const desdeSnap = await get(desdeRef);
        if (!desdeSnap.exists()) await set(desdeRef, fechaISO(new Date()));

        const eraNuevo = !S.rostros[S.alumno.id];
        notificar({ uid: S.alumno.uid }, eraNuevo ? 'Rostro registrado' : 'Rostro actualizado', eraNuevo
            ? 'Un profesor registró tu rostro. Desde ahora la cámara marcará tu asistencia automáticamente.'
            : 'Un profesor actualizó tu rostro registrado para la asistencia.');
        mensajeCaptura('✓ Rostro de ' + nombre + ' registrado correctamente.');
        $('asisCapturarBtn').textContent = 'Volver a capturar rostro';
        $('asisEliminarRostroBtn').style.display = '';
        mostrarToast('Rostro registrado: ' + nombre, 'presente');
    } catch (e) {
        console.error('Asistencia: guardar rostro', e);
        mensajeCaptura('No se pudo guardar el rostro (' + (e.code || e.message) + ').');
    } finally {
        S.capturando = false;
        btn.disabled = false;
    }
}

async function eliminarRostro() {
    if (!S.alumno) return;
    const nombre = S.alumno.data.name || S.alumno.data.username || 'este alumno';
    if (!window.confirm('¿Eliminar el rostro registrado de ' + nombre + '? Dejará de marcarse con la cámara.')) return;
    try {
        await remove(ref(rtdb, 'rostros/' + S.alumno.id));
        notificar({ uid: S.alumno.uid }, 'Rostro eliminado', 'Tu rostro fue eliminado del sistema de asistencia.');
        $('asisCapturarBtn').textContent = 'Capturar rostro';
        $('asisEliminarRostroBtn').style.display = 'none';
        mensajeCaptura('Rostro eliminado.');
    } catch (e) {
        mensajeCaptura('No se pudo eliminar el rostro (' + (e.code || e.message) + ').');
    }
}

// ---------------------------------------------------------------
// Conexión de los botones de la interfaz
// ---------------------------------------------------------------
function conectarInterfaz() {
    vigilarVideo();

    const buscar = $('asisBuscarBtn');
    if (buscar) buscar.addEventListener('click', buscarCamara);

    const pantalla = $('asisFullBtn');
    if (pantalla) pantalla.addEventListener('click', function() {
        const stage = $('asisStage');
        if (document.fullscreenElement) document.exitFullscreen();
        else if (stage && stage.requestFullscreen) stage.requestFullscreen();
    });

    const auto = $('asisAutoBtn');
    if (auto) auto.innerHTML = '<i class="fas fa-circle-play"></i> Toma automática: activada';
    suscribirReconocimientos24h(function(n) {
        const el = $('asisReconocidos');
        if (el) el.textContent = n;
    });
    if (auto) auto.addEventListener('click', function() {
        S.auto = !S.auto;
        auto.innerHTML = S.auto
            ? '<i class="fas fa-circle-play"></i> Toma automática: activada'
            : '<i class="fas fa-circle-pause"></i> Toma automática: en pausa';
        auto.classList.toggle('asis-pausada', !S.auto);
    });

    const lista = $('asisLista');
    if (lista) lista.addEventListener('click', function(e) {
        const boton = e.target.closest('button[data-accion]');
        const fila = e.target.closest('.asis-fila');
        if (!boton || !fila) return;
        const id = fila.dataset.id;
        const accion = boton.dataset.accion;
        if (accion === 'limpiar') limpiarRegistro(id);
        else marcar(id, 'manual', accion);
    });

    const buscarAlumnoBtn = $('asisBuscarAlumnoBtn');
    if (buscarAlumnoBtn) buscarAlumnoBtn.addEventListener('click', buscarAlumno);
    const idInput = $('asisIdInput');
    if (idInput) idInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') buscarAlumno(); });
    const capturar = $('asisCapturarBtn');
    if (capturar) capturar.addEventListener('click', capturarRostro);
    const eliminar = $('asisEliminarRostroBtn');
    if (eliminar) eliminar.addEventListener('click', eliminarRostro);

    const diaBtn = $('asisDiaAddBtn');
    if (diaBtn) diaBtn.addEventListener('click', agregarDia);
    const diasLista = $('asisDiasLista');
    if (diasLista) diasLista.addEventListener('click', function(e) {
        const b = e.target.closest('button[data-fecha]');
        if (b) quitarDia(b.dataset.fecha);
    });

    renderDias();
    renderLista();
}
