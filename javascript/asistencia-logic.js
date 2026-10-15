// ===== asistencia-logic.js =====
// Reglas de la asistencia por cámara. Este archivo NO depende de Firebase
// ni del navegador (solo funciones puras), así se puede probar fácilmente
// y es el único lugar donde se cambian los horarios.
//
// Horario acordado:
//   - Llegada normal: 06:45 a 07:30  -> estado "presente"
//   - Después de 07:30                -> estado "tarde"
//   - Después de HORA_CIERRE          -> la cámara ya no marca; quien no
//                                        tenga registro ese día cuenta como FALTA
// La asistencia se toma UNA sola vez por día (el primer reconocimiento).

export const ASISTENCIA_CONFIG = {
    HORA_INICIO: '06:45',
    HORA_LIMITE: '07:30',
    HORA_CIERRE: '14:00',
    DIAS_CLASE: [1, 2, 3, 4, 5],
    UMBRAL: 0.5,
    MIN_ROSTRO: 0.07,
    CONFIRMACIONES: 3,
    VENTANA_MS: 5000,
    MAX_ROSTROS: 4,
    COOLDOWN_MS: 60000,
    MUESTRAS: 8,
    MUESTRAS_MIN: 5
};

function pad2(n) {
    return String(n).padStart(2, '0');
}

export function fechaISO(date) {
    const d = date || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

export function horaHHMM(date) {
    const d = date || new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

export function minutos(hhmm) {
    const p = String(hhmm).split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || '0', 10);
}

function minutosDe(date) {
    return date.getHours() * 60 + date.getMinutes();
}

export function parseISO(fecha) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || ''));
    if (!m) return null;
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return isNaN(d.getTime()) ? null : d;
}

// Mismo criterio que slugColegio() de config.js (las rutas de asistencia
// usan este texto, por eso tiene que dar EXACTAMENTE el mismo resultado).
export function slugTexto(nombre) {
    return String(nombre || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'sin-nombre';
}

function comoSet(diasSinClase) {
    if (diasSinClase instanceof Set) return diasSinClase;
    return new Set(diasSinClase || []);
}

export function estadoPorHora(date, cfg) {
    const c = cfg || ASISTENCIA_CONFIG;
    return minutosDe(date) <= minutos(c.HORA_LIMITE) ? 'presente' : 'tarde';
}

export function esDiaDeClase(date, diasSinClase, cfg) {
    const c = cfg || ASISTENCIA_CONFIG;
    if (c.DIAS_CLASE.indexOf(date.getDay()) === -1) return false;
    return !comoSet(diasSinClase).has(fechaISO(date));
}

// Dice si la cámara puede tomar asistencia en este momento.
// fase: 'sin-clase' | 'antes' | 'a-tiempo' | 'tarde' | 'cerrado'
export function estadoDeToma(date, diasSinClase, cfg) {
    const c = cfg || ASISTENCIA_CONFIG;
    if (!esDiaDeClase(date, diasSinClase, c)) return { puede: false, fase: 'sin-clase' };
    const m = minutosDe(date);
    if (m >= minutos(c.HORA_CIERRE)) return { puede: false, fase: 'cerrado' };
    if (m < minutos(c.HORA_INICIO)) return { puede: true, fase: 'antes' };
    if (m <= minutos(c.HORA_LIMITE)) return { puede: true, fase: 'a-tiempo' };
    return { puede: true, fase: 'tarde' };
}

// Estado que se muestra hoy para un alumno, según su registro del día.
// 'presente' | 'tarde' | 'justificada' | 'falta' | 'pendiente'
export function estadoEfectivo(registro, ahora, diasSinClase, cfg) {
    const c = cfg || ASISTENCIA_CONFIG;
    if (registro && registro.estado) return registro.estado;
    const hoy = ahora || new Date();
    if (esDiaDeClase(hoy, diasSinClase, c) && minutosDe(hoy) >= minutos(c.HORA_CIERRE)) return 'falta';
    return 'pendiente';
}

// Lista de fechas (YYYY-MM-DD) con falta: días de clase, desde "desde",
// sin ningún registro (presente, tarde o justificada) y que no estén en
// la lista de días sin clase. El día de hoy solo cuenta cuando ya pasó
// la hora de cierre.
export function calcularFaltas(opciones) {
    const o = opciones || {};
    const c = o.cfg || ASISTENCIA_CONFIG;
    const ahora = o.ahora || new Date();
    const registros = o.registros || {};
    const festivos = comoSet(o.diasSinClase);
    const faltas = new Set();

    Object.keys(registros).forEach(function(f) {
        if (registros[f] && registros[f].estado === 'falta') faltas.add(f);
    });

    const inicio = parseISO(o.desde);
    if (inicio) {
        const fin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
        if (minutosDe(ahora) < minutos(c.HORA_CIERRE)) fin.setDate(fin.getDate() - 1);
        const cursor = new Date(inicio);
        for (let i = 0; i < 800 && cursor <= fin; i++) {
            const f = fechaISO(cursor);
            const reg = registros[f];
            if (c.DIAS_CLASE.indexOf(cursor.getDay()) !== -1 && !festivos.has(f) && !(reg && reg.estado)) {
                faltas.add(f);
            }
            cursor.setDate(cursor.getDate() + 1);
        }
    }
    return Array.from(faltas).sort();
}

export function contarEstados(registros) {
    const r = { presente: 0, tarde: 0, justificada: 0, falta: 0 };
    Object.keys(registros || {}).forEach(function(f) {
        const e = registros[f] && registros[f].estado;
        if (e === 'tarde') r.tarde++;
        else if (e === 'justificada') r.justificada++;
        else if (e === 'falta') r.falta++;
        else r.presente++;
    });
    return r;
}

// Evita marcar por un reconocimiento suelto: la misma persona tiene que
// ser vista varias veces seguidas dentro de una ventana de tiempo.
export class ConfirmadorRostros {
    constructor(minimo, ventanaMs) {
        this.minimo = minimo || ASISTENCIA_CONFIG.CONFIRMACIONES;
        this.ventana = ventanaMs || ASISTENCIA_CONFIG.VENTANA_MS;
        this.vistos = new Map();
    }

    registrarVisto(id, ahoraMs) {
        const lista = (this.vistos.get(id) || []).filter(function(t) { return ahoraMs - t <= this.ventana; }, this);
        lista.push(ahoraMs);
        this.vistos.set(id, lista);
        return lista.length >= this.minimo;
    }

    reiniciar(id) {
        this.vistos.delete(id);
    }

    limpiar(ahoraMs) {
        const ventana = this.ventana;
        this.vistos.forEach(function(lista, id, mapa) {
            const vigentes = lista.filter(function(t) { return ahoraMs - t <= ventana; });
            if (vigentes.length) mapa.set(id, vigentes);
            else mapa.delete(id);
        });
    }
}
