// ===== avatar-utils.js =====
// Todo lo relacionado con la ruleta de emoji y los "tiers" de rareza
// que definen el aro alrededor del avatar. Se separó de config.js
// porque no depende de nada más (ni del usuario actual, ni del DOM),
// así que lo puede usar tanto el perfil grande como los avatares
// miniatura de chats/notificaciones sin duplicar la lógica.

// '😶' = "sin reacción": el emoji por defecto hasta que la persona
// gire la ruleta al menos una vez. No es un premio posible de la
// ruleta, así que nunca tiene tier especial.
export const EMOJI_SIN_REACCION = '😶';

// Ruleta de emoji: entre más abajo en la lista, más raro (y más
// "exclusiva" hace ver la cuenta). El primero tiene ~70% de
// probabilidad; el resto va bajando cada vez más fuerte.
export const EMOJIS_RULETA = [
    { emoji: '😊', peso: 70 },
    { emoji: '😂', peso: 11 },
    { emoji: '😒', peso: 6 },
    { emoji: '😎', peso: 3.8 },
    { emoji: '😜', peso: 2.5 },
    { emoji: '🚗', peso: 1.7 },
    { emoji: '🚓', peso: 1.15 },
    { emoji: '✈️', peso: 0.8 },
    { emoji: '🪂', peso: 0.55 },
    { emoji: '🛩️', peso: 0.38 },
    { emoji: '🚀', peso: 0.27 },
    { emoji: '🛸', peso: 0.19 },
    { emoji: '🌅', peso: 0.14 },
    { emoji: '🌄', peso: 0.1 },
    { emoji: '🌆', peso: 0.075 },
    { emoji: '🌤️', peso: 0.056 },
    { emoji: '🌦️', peso: 0.042 },
    { emoji: '🌥️', peso: 0.032 },
    { emoji: '❄️', peso: 0.024 },
    { emoji: '🔥', peso: 0.018 },
    { emoji: '⛱️', peso: 0.013 },
    { emoji: '🌊', peso: 0.01 },
    { emoji: '🎈', peso: 0.008 },
    { emoji: '🧨', peso: 0.006 },
    { emoji: '✨', peso: 0.005 }
];

export const TIER_INFO = [
    { tier: 1, nombre: 'Común', color: '#94a3b8' },
    { tier: 2, nombre: 'Poco común', color: '#7dd3fc' },
    { tier: 3, nombre: 'Raro', color: '#a78bfa' },
    { tier: 4, nombre: 'Épico', color: '#fbbf24' },
    { tier: 5, nombre: 'Legendario', color: '#f43f5e' }
];

// Índice de rareza dentro de la ruleta (0 = el más común). El emoji
// por defecto ("sin reacción") no cuenta como premio, así que no
// tiene tier especial.
export function indiceRarezaEmoji(emoji) {
    return EMOJIS_RULETA.findIndex(function(e) { return e.emoji === emoji; });
}

// Traduce la posición en la ruleta a uno de 5 "tiers" visuales: entre
// más raro salió el emoji, más llamativo el aro alrededor del avatar.
// Se usa tanto en el perfil grande como en cualquier avatar miniatura
// (contactos de chat, notificaciones, toasts) para que el aro de
// exclusividad se vea SIEMPRE igual sin importar dónde aparezca.
//
// A propósito hay MUCHA variedad de emojis en el tier común (1) y CADA
// VEZ MENOS variedad a medida que sube la rareza (el legendario, tier
// 5, solo tiene 2 posibles) -- así, aunque te salga un emoji "común",
// se siente variado; y entre más raro el resultado, más se nota que es
// justo ESE emoji en particular el que te tocó, no uno cualquiera de un
// montón. La probabilidad real de cada tier sigue viniendo de los pesos
// de EMOJIS_RULETA (arriba), esto solo agrupa índices.
export function tierVisualEmoji(emoji) {
    const idx = indiceRarezaEmoji(emoji);
    if (idx < 0) return 0;
    if (idx <= 7) return 1;   // Común: 8 emojis distintos posibles
    if (idx <= 13) return 2;  // Poco común: 6 emojis distintos posibles
    if (idx <= 18) return 3;  // Raro: 5 emojis distintos posibles
    if (idx <= 22) return 4;  // Épico: 4 emojis distintos posibles
    return 5;                 // Legendario: solo 2 emojis distintos posibles
}

// Elige un emoji al azar respetando los pesos (el primero de la
// lista tiene ~70% de probabilidad, y va bajando fuerte desde ahí).
export function girarRuletaEmoji() {
    const pesoTotal = EMOJIS_RULETA.reduce(function(acc, e) { return acc + e.peso; }, 0);
    let punto = Math.random() * pesoTotal;
    for (let i = 0; i < EMOJIS_RULETA.length; i++) {
        punto -= EMOJIS_RULETA[i].peso;
        if (punto <= 0) return EMOJIS_RULETA[i].emoji;
    }
    return EMOJIS_RULETA[0].emoji;
}

// Datos para la tarjeta "¿Qué tan exclusivo es este emoji?": agrupa
// los emojis de la ruleta por tier con su probabilidad real, a partir
// de los pesos de EMOJIS_RULETA (si el peso de algún emoji cambia,
// esto se recalcula solo).
export function datosExclusividadPorTier() {
    const pesoTotal = EMOJIS_RULETA.reduce(function(acc, e) { return acc + e.peso; }, 0);
    const grupos = TIER_INFO.map(function(info) {
        return Object.assign({ emojis: [], porcentaje: 0 }, info);
    });
    EMOJIS_RULETA.forEach(function(e) {
        const tier = tierVisualEmoji(e.emoji);
        const grupo = grupos[tier - 1];
        if (!grupo) return;
        grupo.emojis.push(e.emoji);
        grupo.porcentaje += (e.peso / pesoTotal) * 100;
    });
    return grupos;
}
