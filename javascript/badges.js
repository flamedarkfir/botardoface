// ===== badges.js =====
// Insignias de perfil: Developer/Admin, Profesor y BETA (primeros en
// registrarse). Todo vive en este único archivo a propósito, para que
// añadir o quitar una cuenta sea "abrir este archivo, editar una lista
// y volver a desplegar", sin tocar el resto de la lógica del dashboard.

// ----- Cuentas de desarrollador -----
// Reciben la insignia "Admin" / "Developer" en su perfil. Añade más
// correos aquí (en minúsculas) a medida que los vayas necesitando.
export const DEVELOPER_EMAILS = [
    'jhorkbecerra@gmail.com'
];

// ----- Cuentas de profesor -----
// Por ahora SOLO dan la insignia "Profesor" en el perfil. Cuando se
// construyan las secciones especiales para profesores, este mismo
// archivo es el punto de partida para darles esos permisos extra.
export const TEACHER_EMAILS = [
    // 'profesor@ejemplo.com',
];

// ----- Insignia BETA -----
// Se le da a las primeras cuentas en registrarse en el sitio (ver
// "signupNumber" en config.js, que se asigna una sola vez por cuenta).
// Para dejar de repartirla, pon este número en 0.
export const BETA_SIGNUP_LIMIT = 150;

function normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export function esCorreoDeveloper(email) {
    return DEVELOPER_EMAILS.indexOf(normalizarEmail(email)) !== -1;
}

export function esCorreoProfesor(email) {
    return TEACHER_EMAILS.indexOf(normalizarEmail(email)) !== -1;
}

export function esBetaPorSignupNumber(signupNumber) {
    if (BETA_SIGNUP_LIMIT <= 0) return false;
    return typeof signupNumber === 'number' && signupNumber > 0 && signupNumber <= BETA_SIGNUP_LIMIT;
}

// Devuelve la lista de insignias (puede ser más de una a la vez, por
// ejemplo un developer que además fue de los primeros en registrarse)
// para un usuario dado. `email` y `signupNumber` deben venir de su
// documento en Firestore (users/{uid}).
export function obtenerBadgesDeUsuario({ email, signupNumber } = {}) {
    const badges = [];
    if (esCorreoDeveloper(email)) {
        badges.push({
            id: 'developer',
            label: 'Admin',
            icon: 'fa-shield-halved',
            className: 'profile-badge-developer',
            title: 'Cuenta de desarrollador de Botardo Face App'
        });
    }
    if (esCorreoProfesor(email)) {
        badges.push({
            id: 'profesor',
            label: 'Profesor',
            icon: 'fa-chalkboard-user',
            className: 'profile-badge-profesor',
            title: 'Cuenta verificada de profesor'
        });
    }
    if (esBetaPorSignupNumber(signupNumber)) {
        badges.push({
            id: 'beta',
            label: 'BETA',
            icon: 'fa-flask',
            className: 'profile-badge-beta',
            title: 'Una de las primeras cuentas registradas en Botardo Face App (#' + signupNumber + ')'
        });
    }
    return badges;
}

function escapeHtmlLocal(str) {
    return String(str).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// Arma el HTML de la fila de insignias. Se puede llamar con un arreglo
// ya calculado (obtenerBadgesDeUsuario) o directamente con los datos
// crudos del usuario.
export function construirBadgesHtml(badgesOrUserData) {
    const badges = Array.isArray(badgesOrUserData) ? badgesOrUserData : obtenerBadgesDeUsuario(badgesOrUserData);
    if (!badges || badges.length === 0) return '';
    return badges.map(function(b) {
        return `<span class="profile-badge-chip ${b.className}" title="${escapeHtmlLocal(b.title || b.label)}"><i class="fas ${b.icon}"></i> ${escapeHtmlLocal(b.label)}</span>`;
    }).join('');
}
