// ===== badges.js =====
// Insignias de perfil: Developer/Admin, Profesor y BETA (primeros en
// registrarse). Todo vive en este único archivo a propósito, para que
// añadir o quitar una cuenta sea "abrir este archivo, editar una lista
// y volver a desplegar", sin tocar el resto de la lógica del dashboard.

// ----- Cuentas de desarrollador -----
// Reciben la insignia "Admin" / "Developer" en su perfil. Añade más
// correos aquí (en minúsculas) a medida que los vayas necesitando.
export const DEVELOPER_EMAILS = [
    'jhorkbecerra@gmail.com',
    'juancheton0930@gmail.com',
    'juanfelipelopezramirez61@gmail.com'
];

// ----- Cuentas de profesor -----
// Por ahora SOLO dan la insignia "Profesor" en el perfil. Cuando se
// construyan las secciones especiales para profesores, este mismo
// archivo es el punto de partida para darles esos permisos extra.
//
// IMPORTANTE: esta lista se deja vacía A PROPÓSITO. La insignia y el
// panel de profesor (sección de administración) ya están listos para
// usarse, pero todavía no se le entregan a ninguna cuenta real de
// profesor -- eso se hará cuando el equipo confirme quiénes son.
export const TEACHER_EMAILS = [
    // 'profesor@ejemplo.com',
];

// ----- Vista previa de la insignia/panel de Profesor -----
// Mientras TEACHER_EMAILS siga vacío, esta lista es la ÚNICA forma de
// ver cómo se ve la insignia "Profesor" y de probar el panel especial
// de profesores: solo la(s) cuenta(s) de acá lo obtienen, y son las
// mismas que DEVELOPER_EMAILS (el equipo/admin), no alumnos ni
// profesores reales todavía. Cuando haya cuentas de profesor de
// verdad, sus correos van en TEACHER_EMAILS (arriba) y esta lista se
// puede dejar vacía o quitar.
export const TEACHER_PREVIEW_EMAILS = [
    'jhorkbecerra@gmail.com',
    'juancheton0930@gmail.com',
    'juanfelipelopezramirez61@gmail.com'
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
    const norm = normalizarEmail(email);
    return TEACHER_EMAILS.indexOf(norm) !== -1 || TEACHER_PREVIEW_EMAILS.indexOf(norm) !== -1;
}

// Cuentas "staff": developer/admin O profesor (real o de vista previa).
// Es el permiso que se usa para decidir quién ve el panel especial de
// profesores (buscar alumno por código y editar colegio/grado/horario).
export function esCuentaStaff(email) {
    return esCorreoDeveloper(email) || esCorreoProfesor(email);
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

// Igual que construirBadgesHtml, pero si hay más de "maxVisible"
// insignias, solo pinta las primeras y agrega al final un chip
// "+N" (con data-badges-more="1") en vez de seguir amontonando chips.
// Ese chip no abre nada por sí solo -- quien lo use (el dashboard) es
// quien decide qué hacer al hacer click en él (normalmente, abrir un
// modal con construirBadgesHtml(todasLasInsignias) adentro).
//
// Devuelve { html, badges, hayOcultas } para que quien llame tenga a
// la mano la lista completa (por si quiere armar ese modal) sin tener
// que volver a calcular las insignias del usuario.
export function construirBadgesHtmlConLimite(badgesOrUserData, maxVisible) {
    const badges = Array.isArray(badgesOrUserData) ? badgesOrUserData : obtenerBadgesDeUsuario(badgesOrUserData);
    if (!badges || badges.length === 0) return { html: '', badges: [], hayOcultas: false };

    const limite = (typeof maxVisible === 'number' && maxVisible > 0) ? maxVisible : badges.length;
    const visibles = badges.slice(0, limite);
    const restantes = badges.length - visibles.length;

    let html = construirBadgesHtml(visibles);
    if (restantes > 0) {
        html += `<button type="button" class="profile-badge-chip profile-badge-more" data-badges-more="1" title="Ver todas tus insignias">+${restantes}</button>`;
    }
    return { html: html, badges: badges, hayOcultas: restantes > 0 };
}
