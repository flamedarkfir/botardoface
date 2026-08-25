import { auth, db, rtdb, ai, onAuthStateChanged, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider, doc, getDoc, setDoc, collection, query, where, getDocs, ref, set, get, update, remove, push, onValue, off, onDisconnect, getGenerativeModel } from './firebase-config.js';

(function() {
    'use strict';

    let currentUser = null;
    let currentUserData = null;
    let notifSettings = { live: true, sistema: true };

    let posts = [];
    let bioText = 'Aún no has agregado una descripción.';
    let statusEmoji = '😊';
    let clases = [];
    let followingSet = new Set();
    let followersSet = new Set();
    let followersList = [];
    let followersCount = 0;
    let presenceRefHandle = null;
    let onlineListenerRef = null;
    let chatContacts = [];
    let currentChatUid = null;
    let currentChatListenerRef = null;
    let followingList = [];
    let followersInitialized = false;
    let activityLog = [];
    let onlineUidsSet = new Set();
    let contactEmojis = {};
    let attachedChatListeners = new Set();
    let userStats = { loginCount: 0, exportCount: 0, aiMessages: 0, aiChats: 0, lastLogin: null };
    let apariencia = { tema: 'claro', acento: '#1a2332', fondo: 'default' };
    let aiChatsList = [];
    let currentAiChatId = null;
    let aiDailyUsage = { fecha: '', count: 0 };
    const AI_DAILY_LIMIT = 5;
    let viewingProfileUid = null;
    let viewingProfileData = null;
    let activeProfileTab = 'publicaciones';
    let activeMessagesTab = 'conversaciones';

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function(c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function getTodayString() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function formatearFechaLarga(value) {
        if (!value) return '--';
        const fecha = new Date(value);
        if (isNaN(fecha.getTime())) return String(value);
        return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) +
            ' · ' + fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }

    function simpleMarkdownToHtml(rawText) {
        let text = escapeHtml(rawText);

        text = text.replace(/```([\s\S]*?)```/g, function(_, code) {
            return '<pre class="md-code-block"><code>' + code.trim() + '</code></pre>';
        });
        text = text.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

        text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
        text = text.replace(/(^|[^_])_([^_\n]+)_([^_]|$)/g, '$1<em>$2</em>$3');

        const lines = text.split('\n');
        let html = '';
        let inUl = false;
        let inOl = false;

        function closeLists() {
            if (inUl) { html += '</ul>'; inUl = false; }
            if (inOl) { html += '</ol>'; inOl = false; }
        }

        lines.forEach(function(line) {
            const trimmed = line.trim();
            const bulletMatch = /^[-*]\s+(.*)$/.exec(trimmed);
            const numberMatch = /^\d+\.\s+(.*)$/.exec(trimmed);

            if (bulletMatch) {
                if (inOl) { html += '</ol>'; inOl = false; }
                if (!inUl) { html += '<ul class="md-list">'; inUl = true; }
                html += '<li>' + bulletMatch[1] + '</li>';
            } else if (numberMatch) {
                if (inUl) { html += '</ul>'; inUl = false; }
                if (!inOl) { html += '<ol class="md-list">'; inOl = true; }
                html += '<li>' + numberMatch[1] + '</li>';
            } else if (trimmed === '') {
                closeLists();
                html += '<br>';
            } else {
                closeLists();
                html += '<p class="md-p">' + line + '</p>';
            }
        });
        closeLists();
        return html;
    }

    function formatearTiempoRelativo(timestamp) {
        const diff = Math.floor((Date.now() - timestamp) / 1000);
        if (diff < 60) return 'Hace unos segundos';
        if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
        return `Hace ${Math.floor(diff / 86400)} d`;
    }

    function renderActivityTimeline() {
        const container = document.getElementById('activityTimeline');
        if (!container) return;
        if (activityLog.length === 0) {
            container.innerHTML = `
                <div class="empty-posts">
                    <i class="fas fa-clock-rotate-left"></i>
                    <p>No hay actividad reciente</p>
                    <p style="font-size:0.8rem;">Aquí aparecerán los últimos eventos del sistema</p>
                </div>
            `;
            return;
        }
        container.innerHTML = activityLog.map(function(a) {
            return `
                <div class="activity-item">
                    <span class="activity-dot" style="background:${a.color};"></span>
                    <div class="activity-content">
                        <p><strong>${escapeHtml(a.titulo)}</strong> — ${escapeHtml(a.mensaje)}</p>
                        <span class="activity-time">${formatearTiempoRelativo(a.timestamp)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function agregarActividad(color, titulo, mensaje) {
        activityLog.unshift({ color: color, titulo: titulo, mensaje: mensaje, timestamp: Date.now() });
        if (activityLog.length > 25) activityLog = activityLog.slice(0, 25);
        renderActivityTimeline();
    }

    const materiasDisponibles = [
        'Matemáticas', 'Español', 'Inglés', 'Ciencias Naturales', 'Ciencias Sociales',
        'Educación Física', 'Artes', 'Música', 'Tecnología', 'Ética', 'Religión',
        'Filosofía', 'Física', 'Química', 'Biología', 'Historia', 'Geografía', 'Recreo'
    ];

    const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    const proyectos = [
        { nombre: 'camara', icono: 'fa-camera', descripcion: 'Reconocimiento facial en tiempo real' }
    ];

    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const sections = document.querySelectorAll('.dashboard-section');
    const pageTitle = document.getElementById('pageTitle');
    const logoutBtn = document.getElementById('logoutBtn');

    const editName = document.getElementById('editName');
    const editEmail = document.getElementById('editEmail');
    const saveProfileBtn = document.getElementById('saveProfileBtn');

    const notifBtn = document.getElementById('notifBtn');
    const notifDropdown = document.getElementById('notifDropdown');
    const notifBadge = document.getElementById('notifBadge');

    const startCameraBtn = document.getElementById('startCameraBtn');
    const captureBtn = document.getElementById('captureBtn');
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    const videoFeed = document.getElementById('videoFeed');
    const overlayCanvas = document.getElementById('overlayCanvas');
    const videoPlaceholder = document.getElementById('videoPlaceholder');
    const cameraResult = document.getElementById('cameraResult');
    const cameraStatus = document.getElementById('cameraStatus');

    const projectsGrid = document.getElementById('projectsGrid');

    const totalReconocimientos = document.getElementById('totalReconocimientos');
    const totalUsuarios = document.getElementById('totalUsuarios');
    const tiempoPromedio = document.getElementById('tiempoPromedio');
    const tasaPrecision = document.getElementById('tasaPrecision');

    let recognitionCount = 0;
    let userCount = 0;
    let precisionValue = 0;
    let tiempoValue = 0;
    let reconocimientosPorSegundo = 0;
    let lastUpdateTime = Date.now();
    let precisionDirection = 1;
    let tiempoDirection = 1;

    function navigateTo(sectionId) {
        sections.forEach(section => section.classList.remove('active'));
        const target = document.getElementById(sectionId);
        if (target) target.classList.add('active');

        navLinks.forEach(link => link.parentElement.classList.remove('active'));
        const activeLink = document.querySelector(`.sidebar-nav a[data-section="${sectionId.replace('section-', '')}"]`);
        if (activeLink) activeLink.parentElement.classList.add('active');

        const titles = {
            'section-panel': 'Panel',
            'section-perfil': 'Perfil',
            'section-mensajes': 'Mensajes',
            'section-clases': 'Horario',
            'section-camara': 'Cámara',
            'section-proyectos': 'Proyectos',
            'section-estadisticas': 'Estadísticas',
            'section-configuracion': 'Configuración'
        };
        if (pageTitle && titles[sectionId]) pageTitle.textContent = titles[sectionId];

        if (window.innerWidth <= 768) {
            sidebar.classList.remove('open');
        }
    }

    function loadProjects() {
        if (!projectsGrid) return;
        projectsGrid.innerHTML = '';
        proyectos.forEach(proyecto => {
            const card = document.createElement('a');
            card.className = 'project-card';
            card.href = `../html/proyectos/${proyecto.nombre}.html`;
            card.innerHTML = `
                <div class="project-icon"><i class="fas ${proyecto.icono}"></i></div>
                <h3>${proyecto.nombre.charAt(0).toUpperCase() + proyecto.nombre.slice(1).replace(/-/g, ' ')}</h3>
                <p>${proyecto.descripcion}</p>
            `;
            projectsGrid.appendChild(card);
        });
    }

    function loadUserData() {
        const data = currentUserData || { name: 'Usuario', username: 'usuario', email: '' };

        const userNameDisplay = document.getElementById('userNameDisplay');
        if (userNameDisplay) userNameDisplay.textContent = data.name;

        const profileNameEl = document.getElementById('profileName');
        if (profileNameEl) profileNameEl.textContent = data.name;

        const profileUsernameEl = document.getElementById('profileUsername');
        if (profileUsernameEl) profileUsernameEl.textContent = '@' + data.username;

        const profileEmailEl = document.getElementById('profileEmail');
        if (profileEmailEl) profileEmailEl.textContent = data.email;

        const userRoleEl = document.querySelector('.user-role');
        if (userRoleEl) userRoleEl.textContent = 'Alumno';

        const profileGradoEl = document.getElementById('profileGrado');
        if (profileGradoEl) profileGradoEl.textContent = 'Grado: ' + (data.grado || '--');
    }

    function updateStats() {
        const now = Date.now();
        const deltaTime = (now - lastUpdateTime) / 1000;
        lastUpdateTime = now;

        recognitionCount += reconocimientosPorSegundo * deltaTime;
        if (totalReconocimientos) totalReconocimientos.textContent = Math.floor(recognitionCount);

        const userChange = (Math.random() - 0.48) * 0.3;
        userCount += userChange * deltaTime;
        userCount = Math.min(Math.max(userCount, 28), 58);
        if (totalUsuarios) totalUsuarios.textContent = Math.round(userCount);

        if (Math.random() < 0.01 * deltaTime) tiempoDirection *= -1;
        tiempoValue += (Math.random() * 0.02 - 0.01) * tiempoDirection * deltaTime;
        tiempoValue = Math.min(Math.max(tiempoValue, 1.8), 3.2);
        if (tiempoPromedio) tiempoPromedio.textContent = tiempoValue.toFixed(1) + 's';

        if (Math.random() < 0.005 * deltaTime) precisionDirection *= -1;
        const precisionChange = (Math.random() * 0.04 - 0.02) * precisionDirection;
        precisionValue += precisionChange * deltaTime * 0.3;
        precisionValue = Math.min(Math.max(precisionValue, 96.5), 99.2);
        if (tasaPrecision) tasaPrecision.textContent = precisionValue.toFixed(1) + '%';
    }

    function actualizarStats() {
        let amigos = 0;
        followingSet.forEach(function(uid) {
            if (followersSet.has(uid)) amigos++;
        });
        const statFriendCountEl = document.getElementById('statFriendCount');
        if (statFriendCountEl) statFriendCountEl.textContent = amigos;

        if (viewingProfileUid) return;

        const postCountEl = document.getElementById('postCount');
        if (postCountEl) postCountEl.textContent = posts.length;
        const classCountEl = document.getElementById('classCount');
        if (classCountEl) classCountEl.textContent = clases.length;

        const followersCountEl = document.getElementById('followersCountStat');
        if (followersCountEl) followersCountEl.textContent = followersCount;

        const followingCountEl = document.getElementById('followingCountStat');
        if (followingCountEl) followingCountEl.textContent = followingSet.size;

        const friendCountEl = document.getElementById('friendCount');
        if (friendCountEl) friendCountEl.textContent = amigos;
    }

    function renderUserStats() {
        const loginEl = document.getElementById('statLoginCount');
        if (loginEl) loginEl.textContent = userStats.loginCount;
        const exportEl = document.getElementById('statExportCount');
        if (exportEl) exportEl.textContent = userStats.exportCount;
        const aiEl = document.getElementById('statAiMessages');
        if (aiEl) aiEl.textContent = userStats.aiMessages;
        const aiChatsEl = document.getElementById('statAiChats');
        if (aiChatsEl) aiChatsEl.textContent = aiChatsList.length;
        const postCountEl2 = document.getElementById('statPostCount');
        if (postCountEl2) postCountEl2.textContent = posts.length;
        const classCountEl2 = document.getElementById('statClassCount');
        if (classCountEl2) classCountEl2.textContent = clases.length;

        const createdEl = document.getElementById('statCreatedAt');
        if (createdEl) createdEl.textContent = formatearFechaLarga(currentUserData && currentUserData.createdAt);
        const lastLoginEl = document.getElementById('statLastLogin');
        if (lastLoginEl) lastLoginEl.textContent = userStats.lastLogin ? formatearFechaLarga(userStats.lastLogin) : 'Esta es tu primera vez';
        const planEl = document.getElementById('statPlan');
        if (planEl) planEl.textContent = (currentUserData && currentUserData.premium) ? 'Premium' : 'Gratis';

        renderAiUsageBar();
    }

    async function cargarUserStats() {
        if (!currentUser) return;
        try {
            const snap = await get(ref(rtdb, 'users/' + currentUser.uid + '/stats'));
            if (snap.exists()) {
                const val = snap.val();
                userStats.loginCount = val.loginCount || 0;
                userStats.exportCount = val.exportCount || 0;
                userStats.aiMessages = val.aiMessages || 0;
                userStats.lastLogin = val.lastLogin || null;
            }
            const usageSnap = await get(ref(rtdb, 'users/' + currentUser.uid + '/stats/aiUsageDiario'));
            if (usageSnap.exists()) {
                const uval = usageSnap.val();
                aiDailyUsage = { fecha: uval.fecha || '', count: uval.count || 0 };
                if (aiDailyUsage.fecha !== getTodayString()) aiDailyUsage = { fecha: getTodayString(), count: 0 };
            } else {
                aiDailyUsage = { fecha: getTodayString(), count: 0 };
            }
        } catch (err) {
            console.error('Error cargando estadísticas:', err);
        }
        renderUserStats();
    }

    async function registrarEntrada() {
        if (!currentUser) return;
        try {
            const previousLastLogin = userStats.lastLogin;
            userStats.loginCount += 1;
            const now = new Date().toISOString();
            await update(ref(rtdb, 'users/' + currentUser.uid + '/stats'), {
                loginCount: userStats.loginCount,
                lastLogin: now
            });
            userStats.lastLogin = previousLastLogin;
            renderUserStats();
        } catch (err) {
            console.error('Error registrando entrada:', err);
        }
    }

    function renderAiUsageBar() {
        const fill = document.getElementById('aiUsageBarFill');
        const text = document.getElementById('aiUsageText');
        const esPremium = !!(currentUserData && currentUserData.premium);
        if (esPremium) {
            if (fill) fill.style.width = '100%';
            if (text) text.textContent = 'Premium: mensajes ilimitados';
            return;
        }
        const usados = (aiDailyUsage.fecha === getTodayString()) ? aiDailyUsage.count : 0;
        const pct = Math.min(100, Math.round((usados / AI_DAILY_LIMIT) * 100));
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent = usados + ' / ' + AI_DAILY_LIMIT + ' mensajes usados hoy';
    }

    function puedeEnviarMensajeIA() {
        if (currentUserData && currentUserData.premium) return true;
        if (aiDailyUsage.fecha !== getTodayString()) {
            aiDailyUsage = { fecha: getTodayString(), count: 0 };
        }
        return aiDailyUsage.count < AI_DAILY_LIMIT;
    }

    async function registrarUsoDiarioIA() {
        if (aiDailyUsage.fecha !== getTodayString()) {
            aiDailyUsage = { fecha: getTodayString(), count: 0 };
        }
        aiDailyUsage.count += 1;
        renderAiUsageBar();
        try {
            await set(ref(rtdb, 'users/' + currentUser.uid + '/stats/aiUsageDiario'), aiDailyUsage);
        } catch (err) {
            console.error('Error guardando uso diario de IA:', err);
        }
    }

    async function incrementarStatExport() {
        if (!currentUser) return;
        try {
            userStats.exportCount += 1;
            await set(ref(rtdb, 'users/' + currentUser.uid + '/stats/exportCount'), userStats.exportCount);
            renderUserStats();
        } catch (err) {
            console.error('Error registrando exportación:', err);
        }
    }

    async function incrementarStatAiMessage() {
        if (!currentUser) return;
        try {
            userStats.aiMessages += 1;
            await set(ref(rtdb, 'users/' + currentUser.uid + '/stats/aiMessages'), userStats.aiMessages);
            renderUserStats();
        } catch (err) {
            console.error('Error registrando mensaje de IA:', err);
        }
    }

    function renderizarPosts() {
        if (viewingProfileUid) return;
        renderPostsGridGeneric(posts, true);
    }

    function actualizarBio() {
        const bioTextEl = document.getElementById('profileBio');
        if (bioTextEl) bioTextEl.textContent = bioText;
        const textarea = document.getElementById('bioTextarea');
        if (textarea) textarea.value = bioText;
    }

    function actualizarEmoji() {
        const emojiEl = document.getElementById('statusEmoji');
        if (emojiEl) emojiEl.textContent = statusEmoji;
    }

    async function cargarPosts() {
        if (!currentUser) return;
        try {
            const snap = await get(ref(rtdb, 'users/' + currentUser.uid + '/posts'));
            posts = [];
            if (snap.exists()) {
                snap.forEach(function(child) {
                    const val = child.val();
                    posts.push({ id: child.key, texto: val.texto, fecha: val.fecha, createdAt: val.createdAt || 0 });
                });
                posts.sort(function(a, b) { return b.createdAt - a.createdAt; });
            }
        } catch (err) {
            console.error('Error cargando notas:', err);
            posts = [];
        }
        renderizarPosts();
        actualizarStats();
    }

    async function agregarPost(texto) {
        if (!currentUser) return;
        const ahora = new Date();
        const fecha = ahora.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const createdAt = Date.now();
        try {
            const newRef = push(ref(rtdb, 'users/' + currentUser.uid + '/posts'));
            await set(newRef, { texto: texto, fecha: fecha, createdAt: createdAt });
            posts.unshift({ id: newRef.key, texto: texto, fecha: fecha, createdAt: createdAt });
            renderizarPosts();
            actualizarStats();
        } catch (err) {
            console.error('Error guardando nota:', err);
            alert('No se pudo guardar la nota: ' + (err.code || err.message));
        }
    }

    async function eliminarPost(id) {
        if (!confirm('¿Eliminar esta nota?')) return;
        try {
            await remove(ref(rtdb, 'users/' + currentUser.uid + '/posts/' + id));
            posts = posts.filter(function(p) { return p.id !== id; });
            renderizarPosts();
            actualizarStats();
        } catch (err) {
            console.error('Error eliminando nota:', err);
            alert('No se pudo eliminar la nota: ' + (err.code || err.message));
        }
    }

    window.eliminarPost = eliminarPost;
    window.agregarPost = agregarPost;

    async function cargarPerfilSocial() {
        if (!currentUser) return;
        try {
            const snap = await get(ref(rtdb, 'users/' + currentUser.uid + '/perfil'));
            if (snap.exists()) {
                const val = snap.val();
                if (val.bio) bioText = val.bio;
                if (val.emoji) statusEmoji = val.emoji;
            }
        } catch (err) {
            console.error('Error cargando perfil:', err);
        }
        actualizarBio();
        actualizarEmoji();
        await cargarPosts();
    }

    async function guardarBio() {
        try {
            await update(ref(rtdb, 'users/' + currentUser.uid + '/perfil'), { bio: bioText });
        } catch (err) {
            console.error('Error guardando bio:', err);
            alert('No se pudo guardar la descripción: ' + (err.code || err.message));
        }
    }

    async function guardarEmoji() {
        try {
            await update(ref(rtdb, 'users/' + currentUser.uid + '/perfil'), { emoji: statusEmoji });
        } catch (err) {
            console.error('Error guardando emoji:', err);
        }
    }

    function initPerfil() {
        const bioEdit = document.getElementById('bioEdit');
        const bioTextEl = document.getElementById('profileBio');
        const cancelBioBtn = document.getElementById('cancelBioBtn');
        const saveBioBtn = document.getElementById('saveBioBtn');
        const bioTextarea = document.getElementById('bioTextarea');

        if (cancelBioBtn) {
            cancelBioBtn.addEventListener('click', function() {
                bioEdit.style.display = 'none';
                bioTextEl.style.display = 'block';
                const editBioBtn = document.getElementById('editBioBtn');
                if (editBioBtn) editBioBtn.style.display = 'inline-flex';
                bioTextarea.value = bioText;
            });
        }

        if (saveBioBtn) {
            saveBioBtn.addEventListener('click', async function() {
                const nuevoTexto = bioTextarea.value.trim();
                if (!nuevoTexto) {
                    alert('Por favor escribe algo sobre ti.');
                    return;
                }
                bioText = nuevoTexto;
                await guardarBio();
                actualizarBio();
                bioEdit.style.display = 'none';
                bioTextEl.style.display = 'block';
                const editBioBtn = document.getElementById('editBioBtn');
                if (editBioBtn) editBioBtn.style.display = 'inline-flex';
            });
        }

        const emojiEl = document.getElementById('statusEmoji');
        if (emojiEl) {
            emojiEl.addEventListener('click', function() {
                if (viewingProfileUid) return;
                const emojis = ['😊', '😎', '🤓', '🔥', '💪', '🌟', '🚀', '💡', '🎯', '✨', '😄', '🤩', '👨‍💻', '👩‍💻', '🧠'];
                const current = emojis.indexOf(statusEmoji);
                const next = (current + 1) % emojis.length;
                statusEmoji = emojis[next];
                guardarEmoji();
                actualizarEmoji();
            });
        }

        wireProfileTabs();
        renderProfileActionsOwn();

        const headerUserBtn = document.getElementById('headerUserBtn');
        if (headerUserBtn && !headerUserBtn._wired) {
            headerUserBtn._wired = true;
            headerUserBtn.addEventListener('click', function() {
                navigateTo('section-perfil');
                mostrarPerfilPropio();
            });
        }

        cargarPerfilSocial().then(function() {
            mostrarPerfilPropio();
        });
    }

    function esRecreo(clase) {
        return clase.nombre.toLowerCase() === 'recreo';
    }

    function estaActivaAhora(clase) {
        const ahora = new Date();
        const diaActual = diasSemana[ahora.getDay() === 0 ? 6 : ahora.getDay() - 1];
        if (!clase.dias.includes(diaActual)) return false;

        const [hInicio, mInicio] = clase.horaInicio.split(':').map(Number);
        const [hFin, mFin] = clase.horaFin.split(':').map(Number);
        const inicioMin = hInicio * 60 + mInicio;
        const finMin = hFin * 60 + mFin;
        const actualMin = ahora.getHours() * 60 + ahora.getMinutes();

        return actualMin >= inicioMin && actualMin <= finMin;
    }

    async function cargarClases() {
        if (!currentUser) return;
        try {
            const snap = await get(ref(rtdb, 'users/' + currentUser.uid + '/clases'));
            clases = [];
            if (snap.exists()) {
                snap.forEach(function(child) {
                    clases.push(Object.assign({ id: child.key }, child.val()));
                });
            }
        } catch (err) {
            console.error('Error cargando horario:', err);
            clases = [];
        }
        renderizarHorario();
        actualizarStats();
    }

    function obtenerHorasUnicas(clasesArr) {
        const horas = new Set();
        (clasesArr || clases).forEach(c => horas.add(c.horaInicio));
        return Array.from(horas).sort();
    }

    function obtenerDiasConClases(clasesArr) {
        const dias = new Set();
        (clasesArr || clases).forEach(c => c.dias.forEach(d => dias.add(d)));
        return diasSemana.filter(d => dias.has(d));
    }

    // Construye la misma grilla (tabla día x hora) del horario, reutilizable
    // tanto para la sección "Mi Horario" (editable) como para la pestaña
    // "Horario" del perfil (solo lectura), para que siempre se vea igual.
    function construirGridHorarioHtml(clasesArr, opciones) {
        const editable = !!(opciones && opciones.editable);
        const horas = obtenerHorasUnicas(clasesArr);
        const diasConClases = obtenerDiasConClases(clasesArr);

        let html = '<table class="schedule-table"><thead><tr><th>Hora</th>';
        diasConClases.forEach(dia => { html += `<th>${dia}</th>`; });
        html += '</tr></thead><tbody>';

        horas.forEach(hora => {
            html += `<tr><td class="hour-cell">${hora}</td>`;
            diasConClases.forEach(dia => {
                const clase = clasesArr.find(c => c.dias.includes(dia) && c.horaInicio === hora);
                if (clase) {
                    const activa = estaActivaAhora(clase);
                    const esRecreoClase = esRecreo(clase);
                    const bgColor = esRecreoClase ? '#fff3e0' : clase.color;
                    const textColor = esRecreoClase ? '#e65100' : clase.colorText;
                    const borderColor = esRecreoClase ? '#ff9800' : (activa ? '#2e7d32' : 'transparent');
                    const icono = esRecreoClase ? 'fa-coffee' : clase.icono;
                    const label = esRecreoClase ? 'RECREO' : '';

                    html += `
                        <td class="class-cell" style="background:${bgColor};color:${textColor};border-left:3px solid ${borderColor};">
                            <div class="class-cell-content">
                                <i class="fas ${icono}"></i>
                                <span class="class-name">${clase.nombre}</span>
                                ${label ? `<span class="recreo-badge">${label}</span>` : ''}
                                ${activa ? `<span class="active-dot">●</span>` : ''}
                                ${editable ? `<button class="class-edit-btn" onclick="editarClase('${clase.id}')"><i class="fas fa-edit"></i></button>
                                <button class="class-delete-btn" onclick="eliminarClase('${clase.id}')"><i class="fas fa-trash"></i></button>` : ''}
                            </div>
                            <div class="class-time">${clase.horaInicio} - ${clase.horaFin}</div>
                        </td>
                    `;
                } else {
                    html += `<td class="empty-cell"></td>`;
                }
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        return html;
    }

    function renderizarHorario() {
        const grid = document.getElementById('scheduleGrid');
        if (!grid) return;

        if (clases.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--text-secondary);">
                    <i class="fas fa-calendar-plus" style="font-size:4rem;margin-bottom:1.5rem;display:block;opacity:0.2;"></i>
                    <h3 style="font-size:1.2rem;margin-bottom:0.5rem;color:var(--text-primary);">Aun no has añadido tus clases</h3>
                    <p style="font-size:0.9rem;margin-bottom:1.5rem;">Crea tu horario agregando las materias que cursas</p>
                    <button class="btn btn-primary" onclick="abrirModal(null)">
                        <i class="fas fa-plus"></i> Agregar materia
                    </button>
                </div>
            `;
            return;
        }

        grid.innerHTML = construirGridHorarioHtml(clases, { editable: true });
    }

    function editarClase(id) {
        const clase = clases.find(c => c.id === id);
        if (!clase) return;
        abrirModal(clase);
    }

    async function eliminarClase(id) {
        if (!confirm('¿Estás seguro de eliminar esta clase?')) return;
        try {
            await remove(ref(rtdb, 'users/' + currentUser.uid + '/clases/' + id));
            clases = clases.filter(c => c.id !== id);
            renderizarHorario();
            actualizarStats();
            agregarNotificacionSistema('Clase eliminada', 'Has eliminado una clase del horario', 'section-clases');
        } catch (err) {
            console.error('Error eliminando clase:', err);
            alert('No se pudo eliminar la clase: ' + (err.code || err.message));
        }
    }

    // Ejecuta la acción asociada a una notificación (o toast) al hacer click,
    // según una convención simple de "target":
    //   'section-xxx'              -> navega a esa sección
    //   'perfil:UID:NOMBRE:USER'   -> abre el perfil de ese usuario
    //   'chat:UID:NOMBRE:USER'     -> abre la conversación con ese usuario
    function manejarClickNotificacion(target) {
        if (!target) return;
        const partes = target.split(':');
        const tipo = partes[0];
        if (tipo === 'perfil' && partes[1]) {
            verPerfilUsuario(partes[1], decodeURIComponent(partes[2] || ''), partes[3] || '');
            return;
        }
        if (tipo === 'chat' && partes[1]) {
            navigateTo('section-mensajes');
            switchMessagesTab('conversaciones');
            abrirChat(partes[1], decodeURIComponent(partes[2] || ''), partes[3] || '');
            return;
        }
        if (target.indexOf('section-') === 0 && document.getElementById(target)) {
            navigateTo(target);
            if (target === 'section-perfil') mostrarPerfilPropio();
        }
    }

    window.manejarClickNotificacion = manejarClickNotificacion;

    function wireNotifItemClick(item, target) {
        if (!target) return;
        item.classList.add('notif-clickable');
        item.dataset.target = target;
        item.addEventListener('click', function() {
            item.classList.remove('unread');
            actualizarBadge();
            const dropdown = document.getElementById('notifDropdown');
            if (dropdown) dropdown.classList.remove('open');
            manejarClickNotificacion(target);
        });
    }

    function agregarNotificacionSistema(titulo, mensaje, target) {
        if (notifSettings.sistema) {
            const list = document.querySelector('#notifSistema .notif-list');
            if (list) {
                const emptyMsg = list.querySelector('li:only-child');
                if (emptyMsg && emptyMsg.textContent.includes('Sistema funcionando')) list.innerHTML = '';
                const item = document.createElement('li');
                item.className = 'notif-item unread';
                item.innerHTML = `
                    <i class="fas fa-info-circle" style="color:#0d47a1;"></i>
                    <div><p><strong>${escapeHtml(titulo)}</strong> - ${escapeHtml(mensaje)}</p><span>Hace unos segundos</span></div>
                `;
                wireNotifItemClick(item, target);
                list.prepend(item);
                actualizarBadge();
            }
        }
        agregarActividad('#0d47a1', titulo, mensaje);
    }

    function agregarNotificacionLive(titulo, mensaje, target) {
        if (notifSettings.live) {
            const list = document.querySelector('#notifLive .notif-list');
            if (list) {
                const emptyMsg = list.querySelector('li:only-child');
                if (emptyMsg && emptyMsg.textContent.includes('No hay notificaciones')) list.innerHTML = '';
                const item = document.createElement('li');
                item.className = 'notif-item unread';
                item.innerHTML = `
                    <i class="fas fa-bell" style="color:#e65100;"></i>
                    <div><p><strong>${escapeHtml(titulo)}</strong> - ${escapeHtml(mensaje)}</p><span>Hace unos segundos</span></div>
                `;
                wireNotifItemClick(item, target);
                list.prepend(item);
                actualizarBadge();
            }
        }
        agregarActividad('#e65100', titulo, mensaje);
    }

    function agregarNotificacionBienvenida() {
        const nombre = (currentUserData && currentUserData.name) ? currentUserData.name : 'Usuario';
        agregarNotificacionLive('¡Bienvenido/a!', `Bienvenido/a ${nombre} a Botardo Face App!`);
    }

    const MAX_TOASTS_VISIBLES = 3;

    // Toast genérico (además del de mensajes de chat que ya existía) para
    // avisos en vivo mientras el usuario está usando la app: nuevo seguidor,
    // clase que empieza, etc. Máximo 3 visibles a la vez.
    function mostrarToastGenerico(opciones) {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        while (container.children.length >= MAX_TOASTS_VISIBLES) {
            container.firstElementChild.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'chat-toast';
        toast.innerHTML = `
            <div class="chat-toast-avatar">${opciones.avatarHtml || '<i class="fas fa-bell"></i>'}</div>
            <div class="chat-toast-body">
                <span class="chat-toast-name">${escapeHtml(opciones.titulo)}</span>
                <span class="chat-toast-text">${escapeHtml(opciones.mensaje)}</span>
            </div>
        `;
        toast.addEventListener('click', function() {
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 250);
            if (opciones.target) manejarClickNotificacion(opciones.target);
        });
        container.appendChild(toast);
        requestAnimationFrame(function() { toast.classList.add('show'); });
        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 250);
        }, 6000);
    }

    function actualizarBadge() {
        const total = document.querySelectorAll('.notif-item.unread').length;
        if (notifBadge) {
            if (total > 0) {
                notifBadge.textContent = total;
                notifBadge.style.display = 'flex';
            } else {
                notifBadge.textContent = '0';
                notifBadge.style.display = 'none';
            }
        }
    }

    function abrirModal(clase = null) {
        const overlay = document.getElementById('modalOverlay');
        if (!overlay) {
            crearModal();
            abrirModal(clase);
            return;
        }

        const isEdit = clase !== null;
        document.getElementById('modalTitle').textContent = isEdit ? 'Editar' : 'Agregar';

        const nombreInput = document.getElementById('modalNombre');
        const diasInputs = document.querySelectorAll('.day-checkbox');
        const horaInicioInput = document.getElementById('modalHoraInicio');
        const horaFinInput = document.getElementById('modalHoraFin');

        if (isEdit) {
            nombreInput.value = clase.nombre;
            diasInputs.forEach(cb => {
                cb.checked = clase.dias.includes(cb.value);
                cb.closest('label').classList.toggle('checked', cb.checked);
            });
            horaInicioInput.value = clase.horaInicio;
            horaFinInput.value = clase.horaFin;
            document.getElementById('modalId').value = clase.id;
        } else {
            nombreInput.value = '';
            diasInputs.forEach(cb => {
                cb.checked = false;
                cb.closest('label').classList.toggle('checked', false);
            });
            horaInicioInput.value = '08:00';
            horaFinInput.value = '09:30';
            document.getElementById('modalId').value = '';
        }

        overlay.classList.add('open');
    }

    function cerrarModal() {
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.classList.remove('open');
    }

    function crearModal() {
        const modalHTML = `
            <div class="modal-overlay" id="modalOverlay">
                <div class="modal">
                    <div class="modal-header">
                        <h3 id="modalTitle">Agregar</h3>
                        <button class="modal-close" onclick="cerrarModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <input type="hidden" id="modalId" />
                        <div class="form-group">
                            <label>Nombre</label>
                            <input type="text" id="modalNombre" placeholder="Ej: Matemáticas" list="materiasList" />
                            <datalist id="materiasList">
                                ${materiasDisponibles.map(m => `<option value="${m}">`).join('')}
                            </datalist>
                        </div>
                        <div class="form-group">
                            <label>Días</label>
                            <div class="days-checkboxes">
                                ${diasSemana.map(d => `
                                    <label class="day-label">
                                        <input type="checkbox" class="day-checkbox" value="${d}" />
                                        ${d.slice(0, 3)}
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Hora de inicio</label>
                                <input type="time" id="modalHoraInicio" value="08:00" />
                            </div>
                            <div class="form-group">
                                <label>Hora de finalización</label>
                                <input type="time" id="modalHoraFin" value="09:30" />
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-cancel" onclick="cerrarModal()">Cancelar</button>
                        <button class="btn btn-save" onclick="guardarClaseFromModal()">Guardar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.querySelectorAll('.day-checkbox').forEach(cb => {
            cb.addEventListener('change', function() {
                this.closest('label').classList.toggle('checked', this.checked);
            });
        });

        const overlay = document.getElementById('modalOverlay');
        if (overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === this) cerrarModal();
            });
        }
    }

    async function guardarClaseFromModal() {
        const id = document.getElementById('modalId').value || null;
        const nombre = document.getElementById('modalNombre').value.trim();
        const dias = Array.from(document.querySelectorAll('.day-checkbox:checked')).map(cb => cb.value);
        const horaInicio = document.getElementById('modalHoraInicio').value;
        const horaFin = document.getElementById('modalHoraFin').value;

        if (!nombre) { alert('Por favor ingresa el nombre.'); return; }
        if (dias.length === 0) { alert('Selecciona al menos un día.'); return; }
        if (!horaInicio || !horaFin) { alert('Selecciona la hora de inicio y fin.'); return; }
        if (horaInicio >= horaFin) { alert('La hora de inicio debe ser menor que la hora de finalización.'); return; }

        const esRecreoClase = nombre.toLowerCase() === 'recreo';

        const colorMap = {
            'Matemáticas': { color: '#e3f2fd', colorText: '#0d47a1', icono: 'fa-calculator' },
            'Español': { color: '#e8f5e9', colorText: '#2e7d32', icono: 'fa-book-open' },
            'Inglés': { color: '#fff3e0', colorText: '#e65100', icono: 'fa-language' },
            'Ciencias Naturales': { color: '#fce4ec', colorText: '#c62828', icono: 'fa-flask' },
            'Ciencias Sociales': { color: '#f3e5f5', colorText: '#6a1b9a', icono: 'fa-globe-americas' },
            'Educación Física': { color: '#e0f7fa', colorText: '#00695c', icono: 'fa-dumbbell' },
            'Artes': { color: '#fbe9e7', colorText: '#bf360c', icono: 'fa-palette' },
            'Música': { color: '#e8eaf6', colorText: '#283593', icono: 'fa-music' },
            'Tecnología': { color: '#e0f2f1', colorText: '#004d40', icono: 'fa-laptop-code' },
            'Ética': { color: '#f1f8e9', colorText: '#33691e', icono: 'fa-handshake' },
            'Religión': { color: '#fce4ec', colorText: '#880e4f', icono: 'fa-church' },
            'Filosofía': { color: '#ede7f6', colorText: '#311b92', icono: 'fa-brain' },
            'Física': { color: '#e3f2fd', colorText: '#0d47a1', icono: 'fa-atom' },
            'Química': { color: '#e8f5e9', colorText: '#1b5e20', icono: 'fa-vial' },
            'Biología': { color: '#f1f8e9', colorText: '#33691e', icono: 'fa-dna' },
            'Historia': { color: '#fff3e0', colorText: '#e65100', icono: 'fa-landmark' },
            'Geografía': { color: '#e0f7fa', colorText: '#00695c', icono: 'fa-map' }
        };

        const defaultStyle = { color: '#e8eaf6', colorText: '#283593', icono: 'fa-chalkboard-user' };
        const style = esRecreoClase
            ? { color: '#fff3e0', colorText: '#e65100', icono: 'fa-coffee' }
            : (colorMap[nombre] || defaultStyle);

        const claseData = {
            nombre: nombre,
            icono: style.icono,
            color: style.color,
            colorText: style.colorText,
            dias: dias,
            horaInicio: horaInicio,
            horaFin: horaFin
        };

        try {
            if (id) {
                await update(ref(rtdb, 'users/' + currentUser.uid + '/clases/' + id), claseData);
                const index = clases.findIndex(c => c.id === id);
                if (index !== -1) clases[index] = Object.assign({ id: id }, claseData);
                agregarNotificacionSistema('Actualizado', `Has actualizado "${nombre}"`, 'section-clases');
            } else {
                const newRef = push(ref(rtdb, 'users/' + currentUser.uid + '/clases'));
                await set(newRef, claseData);
                clases.push(Object.assign({ id: newRef.key }, claseData));
                agregarNotificacionSistema('Nuevo', `Has agregado "${nombre}" al horario`, 'section-clases');
            }
            renderizarHorario();
            actualizarStats();
            cerrarModal();
        } catch (err) {
            console.error('Error guardando clase:', err);
            alert('No se pudo guardar la clase: ' + (err.code || err.message));
        }
    }

    function initClases() {
        if (!document.getElementById('modalOverlay')) crearModal();

        const addBtn = document.getElementById('addClassBtn');
        if (addBtn) {
            addBtn.removeEventListener('click', addBtn._listener);
            addBtn._listener = () => abrirModal(null);
            addBtn.addEventListener('click', addBtn._listener);
        }

        cargarClases();
        verificarNotificacionesClases();
        setInterval(verificarNotificacionesClases, 30000);
    }

    // Guarda qué avisos (próximo / comenzó) ya se dispararon hoy, para no
    // repetirlos en cada chequeo de 30s. Se reinicia solo al cambiar de día.
    let clasesNotificadasHoy = { fecha: null, avisos: new Set() };

    function minutosDesdeMedianoche(horaStr) {
        const [h, m] = horaStr.split(':').map(Number);
        return h * 60 + m;
    }

    function verificarNotificacionesClases() {
        const ahora = new Date();
        const hoyStr = getTodayString();
        if (clasesNotificadasHoy.fecha !== hoyStr) {
            clasesNotificadasHoy = { fecha: hoyStr, avisos: new Set() };
        }

        const diaActual = diasSemana[ahora.getDay() === 0 ? 6 : ahora.getDay() - 1];
        const horaActualMin = ahora.getHours() * 60 + ahora.getMinutes();

        clases.forEach(clase => {
            if (!clase.dias.includes(diaActual)) return;

            const inicioMin = minutosDesdeMedianoche(clase.horaInicio);
            const finMin = minutosDesdeMedianoche(clase.horaFin);
            const diffInicio = inicioMin - horaActualMin; // minutos reales hasta que empiece
            const diffFin = finMin - horaActualMin;

            const claveProximo = clase.id + ':' + diaActual + ':proximo';
            const claveComenzo = clase.id + ':' + diaActual + ':comenzo';

            if (diffInicio > 0 && diffInicio <= 5 && !clasesNotificadasHoy.avisos.has(claveProximo)) {
                clasesNotificadasHoy.avisos.add(claveProximo);
                const emoji = esRecreo(clase) ? '☕' : '⏰';
                agregarNotificacionLive(
                    `${emoji} Próximo`,
                    `"${clase.nombre}" comienza en ${diffInicio} minuto${diffInicio === 1 ? '' : 's'} (${diaActual})`,
                    'section-clases'
                );
            }

            if (diffInicio <= 0 && diffFin > 0 && !clasesNotificadasHoy.avisos.has(claveComenzo)) {
                clasesNotificadasHoy.avisos.add(claveComenzo);
                const emoji = esRecreo(clase) ? '☕' : '📚';
                const titulo = esRecreo(clase) ? `${emoji} Recreo` : `${emoji} Ha comenzado`;
                const mensaje = `"${clase.nombre}" empezó ahora · ${diaActual} · ${clase.horaInicio} - ${clase.horaFin}`;
                agregarNotificacionLive(titulo, mensaje, 'section-clases');
                mostrarToastGenerico({
                    titulo: titulo,
                    mensaje: mensaje,
                    avatarHtml: `<i class="fas ${esRecreo(clase) ? 'fa-coffee' : (clase.icono || 'fa-book')}"></i>`,
                    target: 'section-clases'
                });
            }
        });

        renderizarHorario();
    }

    async function isUsernameTakenByOther(username, uid) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', username));
        const snapshot = await getDocs(q);
        let taken = false;
        snapshot.forEach(function(docSnap) {
            if (docSnap.id !== uid) taken = true;
        });
        return taken;
    }

    async function generateUsernameSuggestions(base, uid) {
        const clean = (base.toLowerCase().replace(/[^a-z0-9_]/g, '')) || 'usuario';
        const candidates = [
            clean + Math.floor(Math.random() * 900 + 100),
            clean + '_' + Math.floor(Math.random() * 90 + 10),
            clean + new Date().getFullYear(),
            clean + Math.floor(Math.random() * 9000 + 1000),
            clean + '_' + Math.floor(Math.random() * 900 + 100),
            clean + Math.floor(Math.random() * 90 + 10)
        ];
        const suggestions = [];
        for (let i = 0; i < candidates.length; i++) {
            if (suggestions.length >= 3) break;
            const taken = await isUsernameTakenByOther(candidates[i], uid);
            if (!taken && suggestions.indexOf(candidates[i]) === -1) suggestions.push(candidates[i]);
        }
        return suggestions;
    }

    function buildCompleteDataModal() {
        if (document.getElementById('completeDataOverlay')) return;
        const modalHTML = `
            <div class="modal-overlay open" id="completeDataOverlay" style="z-index:5000;">
                <div class="modal">
                    <div class="modal-header"><h3>Completa tus datos</h3></div>
                    <div class="modal-body">
                        <p class="social-empty">Necesitamos estos datos para activar tu cuenta.</p>
                        <div class="form-group">
                            <label>Nombres y Apellidos</label>
                            <input type="text" id="completeName" placeholder="Ej: Juan Camilo Pérez Muñoz" />
                            <div id="completeNameError" class="field-error"></div>
                        </div>
                        <div class="form-group">
                            <label>Nombre de usuario</label>
                            <input type="text" id="completeUsername" placeholder="Ej: juan007" />
                            <div id="completeUsernameError" class="field-error"></div>
                        </div>
                        <div class="form-group">
                            <label>Correo electrónico</label>
                            <input type="email" id="completeEmail" placeholder="Ej: ejemplo@gmail.com" />
                            <div id="completeEmailError" class="field-error"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-save" id="completeDataSaveBtn">Guardar y continuar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    function showCompleteDataModal(user, existingData) {
        buildCompleteDataModal();

        const overlay = document.getElementById('completeDataOverlay');
        const nameInput = document.getElementById('completeName');
        const usernameInput = document.getElementById('completeUsername');
        const emailInput = document.getElementById('completeEmail');
        const nameError = document.getElementById('completeNameError');
        const usernameError = document.getElementById('completeUsernameError');
        const emailError = document.getElementById('completeEmailError');
        const saveBtn = document.getElementById('completeDataSaveBtn');

        nameInput.value = (existingData && existingData.name) || user.displayName || '';
        usernameInput.value = (existingData && existingData.username) || '';
        emailInput.value = (existingData && existingData.email) || user.email || '';

        overlay.classList.add('open');

        saveBtn.onclick = async function() {
            nameError.textContent = '';
            usernameError.textContent = '';
            emailError.textContent = '';

            const name = nameInput.value.trim();
            const username = usernameInput.value.trim().toLowerCase();
            const email = emailInput.value.trim();

            let valid = true;

            if (name.length < 2) {
                nameError.textContent = 'Ingresa un nombre válido (mínimo 2 caracteres).';
                valid = false;
            }

            const usernameRegex = /^[A-Za-z0-9_]+$/;
            if (username === '') {
                usernameError.textContent = 'El nombre de usuario es obligatorio.';
                valid = false;
            } else if (!usernameRegex.test(username)) {
                usernameError.textContent = 'Solo letras, números y guion bajo (_), sin espacios ni símbolos.';
                valid = false;
            } else if (username.length < 3) {
                usernameError.textContent = 'Mínimo 3 caracteres.';
                valid = false;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                emailError.textContent = 'Ingresa un correo válido.';
                valid = false;
            }

            if (!valid) return;

            saveBtn.disabled = true;
            saveBtn.textContent = 'Verificando...';

            try {
                const taken = await isUsernameTakenByOther(username, user.uid);
                if (taken) {
                    const suggestions = await generateUsernameSuggestions(username, user.uid);
                    usernameError.textContent = suggestions.length > 0
                        ? 'Este nombre de usuario ya está en uso. Sugerencias: ' + suggestions.join(', ')
                        : 'Este nombre de usuario ya está en uso.';
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Guardar y continuar';
                    return;
                }
            } catch (err) {
                console.error('Error verificando username:', err);
                usernameError.textContent = 'No se pudo verificar el usuario: ' + (err.code || err.message || err);
                saveBtn.disabled = false;
                saveBtn.textContent = 'Guardar y continuar';
                return;
            }

            saveBtn.textContent = 'Guardando...';

            try {
                await setDoc(doc(db, 'users', user.uid), {
                    name: name,
                    username: username,
                    email: email,
                    createdAt: (existingData && existingData.createdAt) || new Date().toISOString()
                });

                const esCuentaNueva = !existingData;
                currentUserData = { name: name, username: username, email: email };
                overlay.classList.remove('open');
                overlay.remove();
                init();
                if (esCuentaNueva) agregarNotificacionBienvenida();
            } catch (err) {
                console.error('Error guardando datos en Firestore:', err);
                emailError.textContent = 'No se pudo guardar: ' + (err.code || err.message || err);
                saveBtn.disabled = false;
                saveBtn.textContent = 'Guardar y continuar';
            }
        };
    }

    async function loadOrRequestUserData(user) {
        try {
            const refDoc = doc(db, 'users', user.uid);
            const snap = await getDoc(refDoc);
            if (snap.exists()) {
                const data = snap.data();
                if (data.name && data.username && data.email) {
                    currentUserData = data;
                    init();
                    return;
                }
                showCompleteDataModal(user, data);
                return;
            }
            showCompleteDataModal(user, null);
        } catch (err) {
            console.error('Error leyendo datos de Firestore:', err);
            showCompleteDataModal(user, null);
        }
    }

    function buildChangePasswordModal() {
        if (document.getElementById('passwordModalOverlay')) return;
        const html = `
            <div class="modal-overlay" id="passwordModalOverlay">
                <div class="modal">
                    <div class="modal-header">
                        <h3>Cambiar contraseña</h3>
                        <button class="modal-close" id="passwordModalClose">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Contraseña actual</label>
                            <input type="password" id="currentPasswordInput" />
                            <div id="currentPasswordError" class="field-error"></div>
                        </div>
                        <div class="form-group">
                            <label>Nueva contraseña</label>
                            <input type="password" id="newPasswordInput" />
                            <div id="newPasswordError" class="field-error"></div>
                        </div>
                        <div class="form-group">
                            <label>Confirmar nueva contraseña</label>
                            <input type="password" id="confirmPasswordInput" />
                            <div id="confirmPasswordError" class="field-error"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-cancel" id="passwordModalCancel">Cancelar</button>
                        <button class="btn btn-save" id="passwordModalSave">Guardar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('passwordModalClose').addEventListener('click', closeChangePasswordModal);
        document.getElementById('passwordModalCancel').addEventListener('click', closeChangePasswordModal);
        document.getElementById('passwordModalOverlay').addEventListener('click', function(e) {
            if (e.target === this) closeChangePasswordModal();
        });
        document.getElementById('passwordModalSave').addEventListener('click', handleChangePassword);
    }

    function openChangePasswordModal() {
        buildChangePasswordModal();
        const isPasswordProvider = currentUser.providerData.some(function(p) { return p.providerId === 'password'; });
        if (!isPasswordProvider) {
            alert('Tu cuenta usa inicio de sesión con Google o GitHub, no tiene contraseña para cambiar.');
            return;
        }
        document.getElementById('currentPasswordInput').value = '';
        document.getElementById('newPasswordInput').value = '';
        document.getElementById('confirmPasswordInput').value = '';
        document.getElementById('currentPasswordError').textContent = '';
        document.getElementById('newPasswordError').textContent = '';
        document.getElementById('confirmPasswordError').textContent = '';
        document.getElementById('passwordModalOverlay').classList.add('open');
    }

    function closeChangePasswordModal() {
        const overlay = document.getElementById('passwordModalOverlay');
        if (overlay) overlay.classList.remove('open');
    }

    async function handleChangePassword() {
        const currentPasswordInput = document.getElementById('currentPasswordInput');
        const newPasswordInput = document.getElementById('newPasswordInput');
        const confirmPasswordInput = document.getElementById('confirmPasswordInput');
        const currentPasswordError = document.getElementById('currentPasswordError');
        const newPasswordError = document.getElementById('newPasswordError');
        const confirmPasswordError = document.getElementById('confirmPasswordError');
        const saveBtn = document.getElementById('passwordModalSave');

        currentPasswordError.textContent = '';
        newPasswordError.textContent = '';
        confirmPasswordError.textContent = '';

        const currentPassword = currentPasswordInput.value;
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        let valid = true;
        if (!currentPassword) {
            currentPasswordError.textContent = 'Ingresa tu contraseña actual.';
            valid = false;
        }
        if (newPassword.length < 8) {
            newPasswordError.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
            valid = false;
        }
        if (confirmPassword !== newPassword) {
            confirmPasswordError.textContent = 'Las contraseñas no coinciden.';
            valid = false;
        }
        if (!valid) return;

        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';

        try {
            const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
            await reauthenticateWithCredential(currentUser, credential);
            await updatePassword(currentUser, newPassword);
            alert('Contraseña actualizada correctamente.');
            closeChangePasswordModal();
        } catch (err) {
            console.error('Error cambiando contraseña:', err);
            if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                currentPasswordError.textContent = 'La contraseña actual es incorrecta.';
            } else if (err.code === 'auth/weak-password') {
                newPasswordError.textContent = 'La nueva contraseña es muy débil.';
            } else if (err.code === 'auth/too-many-requests') {
                currentPasswordError.textContent = 'Demasiados intentos. Intenta más tarde.';
            } else {
                currentPasswordError.textContent = 'Error: ' + (err.code || err.message);
            }
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Guardar';
        }
    }

    function buildSocialUI() {
        const searchBtn = document.getElementById('userSearchBtn');
        const searchInput = document.getElementById('userSearchInput');
        if (searchBtn && !searchBtn._wired) {
            searchBtn._wired = true;
            searchBtn.addEventListener('click', handleUserSearch);
        }
        if (searchInput && !searchInput._wired) {
            searchInput._wired = true;
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); handleUserSearch(); }
            });
        }
    }

    function escapeForAttr(text) {
        return String(text).replace(/'/g, "\\'");
    }

    function renderFollowingList(list) {
        const container = document.getElementById('followingList');
        if (!container) return;
        if (list.length === 0) {
            container.innerHTML = '<p class="social-empty">Aún no sigues a nadie.</p>';
            return;
        }
        container.innerHTML = list.map(function(u) {
            const meSigue = followersSet.has(u.uid);
            const estadoBadge = meSigue
                ? '<span class="social-status-badge amigos"><i class="fas fa-user-group"></i> Amigos</span>'
                : '<span class="social-status-badge">No te sigue</span>';
            return `
                <div class="social-list-item">
                    <div class="social-list-identity">
                        <span class="social-list-name">${u.name}</span>
                        <div class="social-list-username">@${u.username}</div>
                        ${estadoBadge}
                    </div>
                    <div class="social-list-actions">
                        <button class="btn btn-secondary btn-sm" onclick="verPerfilUsuario('${u.uid}', '${escapeForAttr(u.name)}', '${u.username}')">Ver perfil</button>
                        <button class="btn btn-secondary btn-sm" onclick="toggleFollow('${u.uid}', '${escapeForAttr(u.name)}', '${u.username}')">Dejar de seguir</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderFollowersList(list) {
        const container = document.getElementById('followersListEl');
        if (!container) return;
        if (list.length === 0) {
            container.innerHTML = '<p class="social-empty">Nadie te sigue todavía.</p>';
            return;
        }
        container.innerHTML = list.map(function(u) {
            const yaLoSigo = followingSet.has(u.uid);
            const estadoBadge = yaLoSigo
                ? '<span class="social-status-badge amigos"><i class="fas fa-user-group"></i> Amigos</span>'
                : '<span class="social-status-badge nuevo">Te sigue</span>';
            return `
                <div class="social-list-item">
                    <div class="social-list-identity">
                        <span class="social-list-name">${u.name}</span>
                        <div class="social-list-username">@${u.username}</div>
                        ${estadoBadge}
                    </div>
                    <div class="social-list-actions">
                        <button class="btn btn-secondary btn-sm" onclick="verPerfilUsuario('${u.uid}', '${escapeForAttr(u.name)}', '${u.username}')">Ver perfil</button>
                        ${yaLoSigo ? '' : `<button class="btn btn-primary btn-sm" onclick="toggleFollow('${u.uid}', '${escapeForAttr(u.name)}', '${u.username}')">Seguir de vuelta</button>`}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderFriendsList() {
        const container = document.getElementById('friendsListEl');
        if (!container) return;
        const amigos = followingList.filter(function(u) { return followersSet.has(u.uid); });
        if (amigos.length === 0) {
            container.innerHTML = '<p class="social-empty">Todavía no tienes amigos en común. Un amigo es alguien que te sigue y a quien también sigues.</p>';
            return;
        }
        container.innerHTML = amigos.map(function(u) {
            return `
                <div class="social-list-item">
                    <div class="social-list-identity">
                        <span class="social-list-name">${u.name}</span>
                        <div class="social-list-username">@${u.username}</div>
                        <span class="social-status-badge amigos"><i class="fas fa-user-group"></i> Amigos</span>
                    </div>
                    <div class="social-list-actions">
                        <button class="btn btn-secondary btn-sm" onclick="verPerfilUsuario('${u.uid}', '${escapeForAttr(u.name)}', '${u.username}')">Ver perfil</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function initSocialListeners() {
        if (!currentUser) return;

        onValue(ref(rtdb, 'users/' + currentUser.uid + '/following'), function(snap) {
            followingSet = new Set();
            followingList = [];
            if (snap.exists()) {
                snap.forEach(function(child) {
                    followingSet.add(child.key);
                    const val = child.val();
                    followingList.push({ uid: child.key, name: val.name, username: val.username });
                });
            }
            renderFollowingList(followingList);
            renderFollowersList(followersList);
            renderFriendsList();
            actualizarStats();
            buildChatContacts();
        }, function(err) {
            console.error('Error cargando seguidos:', err);
        });

        onValue(ref(rtdb, 'users/' + currentUser.uid + '/followers'), function(snap) {
            const newSet = new Set();
            const newList = [];
            if (snap.exists()) {
                snap.forEach(function(child) {
                    newSet.add(child.key);
                    const val = child.val();
                    newList.push({ uid: child.key, name: val.name, username: val.username });
                });
            }
            if (followersInitialized) {
                newSet.forEach(function(uid) {
                    if (!followersSet.has(uid)) {
                        const u = newList.find(function(x) { return x.uid === uid; });
                        if (u) {
                            const target = 'perfil:' + uid + ':' + encodeURIComponent(u.name || '') + ':' + (u.username || '');
                            agregarNotificacionLive('Nuevo seguidor', `${u.name} (@${u.username}) ahora te sigue`, target);
                            mostrarToastGenerico({
                                titulo: 'Nuevo seguidor',
                                mensaje: `${u.name} (@${u.username}) ahora te sigue`,
                                avatarHtml: escapeHtml((u.name || '?').charAt(0).toUpperCase()),
                                target: target
                            });
                        }
                    }
                });
            }
            followersSet = newSet;
            followersList = newList;
            followersCount = followersList.length;
            followersInitialized = true;
            renderFollowersList(followersList);
            renderFriendsList();
            actualizarStats();
            buildChatContacts();
        }, function(err) {
            console.error('Error cargando seguidores:', err);
        });
    }

    function renderSearchResults(results) {
        const container = document.getElementById('userSearchResults');
        if (results.length === 0) {
            container.innerHTML = '<p class="social-empty">No se encontraron usuarios.</p>';
            return;
        }
        container.innerHTML = results.map(function(u) {
            const isFollowing = followingSet.has(u.uid);
            return `
                <div class="social-list-item">
                    <div><span class="social-list-name">${u.name}</span><div class="social-list-username">@${u.username}</div></div>
                    <div class="social-list-actions">
                        ${isFollowing ? `<button class="btn btn-secondary btn-sm" onclick="verPerfilUsuario('${u.uid}', '${escapeForAttr(u.name)}', '${u.username}')">Ver perfil</button>` : ''}
                        <button class="btn ${isFollowing ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="toggleFollow('${u.uid}', '${escapeForAttr(u.name)}', '${u.username}')">${isFollowing ? 'Dejar de seguir' : 'Seguir'}</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function handleUserSearch() {
        const input = document.getElementById('userSearchInput');
        const resultsContainer = document.getElementById('userSearchResults');
        const term = input.value.trim().toLowerCase();
        if (!term) { resultsContainer.innerHTML = ''; return; }

        resultsContainer.innerHTML = '<p class="social-empty">Buscando...</p>';

        try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('username', '>=', term), where('username', '<=', term + '\uf8ff'));
            const snap = await getDocs(q);
            const results = [];
            snap.forEach(function(docSnap) {
                if (docSnap.id === currentUser.uid) return;
                const data = docSnap.data();
                if (!data.username || data.username.toLowerCase().indexOf(term) !== 0) return;
                results.push({ uid: docSnap.id, name: data.name, username: data.username });
            });
            renderSearchResults(results);
        } catch (err) {
            console.error('Error buscando usuarios:', err);
            resultsContainer.innerHTML = '<p class="social-error">Error al buscar: ' + (err.code || err.message) + '</p>';
        }
    }

    async function toggleFollow(uid, name, username) {
        if (!currentUser) return;
        const isFollowing = followingSet.has(uid);
        try {
            if (isFollowing) {
                await remove(ref(rtdb, 'users/' + currentUser.uid + '/following/' + uid));
                await remove(ref(rtdb, 'users/' + uid + '/followers/' + currentUser.uid));
                followingSet.delete(uid);
                followingList = followingList.filter(function(u) { return u.uid !== uid; });
            } else {
                await set(ref(rtdb, 'users/' + currentUser.uid + '/following/' + uid), { name: name, username: username, followedAt: Date.now() });
                await set(ref(rtdb, 'users/' + uid + '/followers/' + currentUser.uid), { name: currentUserData.name, username: currentUserData.username, followedAt: Date.now() });
                followingSet.add(uid);
                if (!followingList.some(function(u) { return u.uid === uid; })) {
                    followingList.push({ uid: uid, name: name, username: username });
                }
            }
            renderFollowingList(followingList);
            renderFollowersList(followersList);
            renderFriendsList();
            buildChatContacts();
            const term = document.getElementById('userSearchInput').value.trim().toLowerCase();
            if (term) handleUserSearch();
        } catch (err) {
            console.error('Error actualizando seguidor:', err);
            alert('No se pudo actualizar: ' + (err.code || err.message));
        }
    }

    window.toggleFollow = toggleFollow;

    function initPresence() {
        if (!currentUser) return;
        const myPresenceRef = ref(rtdb, 'presence/' + currentUser.uid);
        const connectedRef = ref(rtdb, '.info/connected');
        presenceRefHandle = myPresenceRef;

        onValue(connectedRef, function(snap) {
            if (snap.val() === true) {
                onDisconnect(myPresenceRef).remove().then(function() {
                    set(myPresenceRef, {
                        name: currentUserData.name,
                        username: currentUserData.username,
                        since: Date.now()
                    });
                });
            }
        });

        onlineListenerRef = ref(rtdb, 'presence');
        onValue(onlineListenerRef, function(snap) {
            let count = 0;
            onlineUidsSet = new Set();
            snap.forEach(function(child) {
                count++;
                onlineUidsSet.add(child.key);
            });
            if (totalUsuarios) totalUsuarios.textContent = count;
            renderChatContacts();
            if (currentChatUid) actualizarEstadoChatHeader(currentChatUid);
        });
    }

    function estaEnLinea(uid) {
        return onlineUidsSet.has(uid);
    }

    async function obtenerEmojiUsuario(uid) {
        if (uid in contactEmojis) return contactEmojis[uid];
        try {
            const snap = await get(ref(rtdb, 'users/' + uid + '/perfil/emoji'));
            contactEmojis[uid] = snap.exists() ? snap.val() : '😊';
        } catch (err) {
            contactEmojis[uid] = '😊';
        }
        return contactEmojis[uid];
    }

    function precargarEmojis(list) {
        const faltantes = (list || []).filter(function(u) { return !(u.uid in contactEmojis); });
        if (faltantes.length === 0) return;
        Promise.all(faltantes.map(function(u) { return obtenerEmojiUsuario(u.uid); })).then(function() {
            renderChatContacts();
            if (currentChatUid) actualizarEstadoChatHeader(currentChatUid);
        });
    }

    function puedeEscribirA(otherUid) {
        return followersSet.has(otherUid);
    }

    function sortedPair(uid1, uid2) {
        return uid1 < uid2 ? [uid1, uid2] : [uid2, uid1];
    }

    function chatMessagesPath(otherUid) {
        const pair = sortedPair(currentUser.uid, otherUid);
        return 'chats/' + pair[0] + '/' + pair[1] + '/messages';
    }

    function buildChatContacts() {
        if (!currentUser) return;
        const combined = new Map();
        (followersList || []).forEach(function(u) { combined.set(u.uid, u); });
        (followingList || []).forEach(function(u) { combined.set(u.uid, u); });
        chatContacts = Array.from(combined.values());
        renderChatContacts();
        precargarEmojis(chatContacts);
        attachGlobalChatListeners();
    }

    function mensajesSeccionActiva() {
        const sec = document.getElementById('section-mensajes');
        return !!(sec && sec.classList.contains('active'));
    }

    function mostrarToastMensaje(u, text) {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        while (container.children.length >= MAX_TOASTS_VISIBLES) {
            container.firstElementChild.remove();
        }
        const toast = document.createElement('div');
        toast.className = 'chat-toast';
        toast.innerHTML = `
            <div class="chat-toast-avatar">${escapeHtml(u.name.charAt(0).toUpperCase())}</div>
            <div class="chat-toast-body">
                <span class="chat-toast-name">${escapeHtml(u.name)}</span>
                <span class="chat-toast-text">${escapeHtml(text)}</span>
            </div>
        `;
        toast.addEventListener('click', function() {
            navigateTo('section-mensajes');
            abrirChat(u.uid, u.name, u.username);
            const mc = document.getElementById('messagesContainer');
            if (mc && window.innerWidth <= 768) mc.classList.add('chat-open');
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 250);
        });
        container.appendChild(toast);
        requestAnimationFrame(function() { toast.classList.add('show'); });
        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 250);
        }, 6000);
    }

    function attachGlobalChatListeners() {
        chatContacts.forEach(function(u) {
            if (attachedChatListeners.has(u.uid)) return;
            attachedChatListeners.add(u.uid);
            const messagesRef = ref(rtdb, chatMessagesPath(u.uid));
            let isFirst = true;
            let lastId = null;
            onValue(messagesRef, function(snap) {
                let last = null;
                snap.forEach(function(child) {
                    last = { id: child.key, from: child.val().from, text: child.val().text };
                });
                if (isFirst) {
                    isFirst = false;
                    lastId = last ? last.id : null;
                    return;
                }
                if (!last || last.id === lastId) return;
                lastId = last.id;
                if (last.from === currentUser.uid) return;
                if (currentChatUid === u.uid && mensajesSeccionActiva()) return;
                mostrarToastMensaje(u, last.text);
            });
        });
    }

    function renderChatContacts() {
        const container = document.getElementById('chatContactsList');
        if (!container) return;
        container.className = 'chat-contacts-list';
        if (chatContacts.length === 0) {
            container.innerHTML = '<p class="social-empty">Sigue a alguien o consigue seguidores para poder chatear.</p>';
            return;
        }
        container.innerHTML = chatContacts.map(function(u) {
            const canWrite = puedeEscribirA(u.uid);
            const activeClass = u.uid === currentChatUid ? ' active' : '';
            const online = estaEnLinea(u.uid);
            const emoji = contactEmojis[u.uid] || '';
            return `
                <div class="chat-contact-item${activeClass}" data-uid="${u.uid}" onclick="abrirChat('${u.uid}', '${escapeForAttr(u.name)}', '${u.username}')">
                    <div class="chat-contact-avatar-wrap">
                        <div class="chat-contact-avatar">${u.name.charAt(0).toUpperCase()}</div>
                        ${emoji ? `<span class="chat-contact-emoji">${emoji}</span>` : ''}
                        <span class="chat-contact-dot ${online ? 'online' : 'offline'}"></span>
                    </div>
                    <div class="chat-contact-info">
                        <div class="chat-contact-name">${u.name}</div>
                        <div class="chat-contact-meta">@${u.username}${canWrite ? '' : ' · no te sigue'}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function formatearHoraMensaje(timestamp) {
        if (!timestamp) return '';
        const fecha = new Date(timestamp);
        return fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }

    function renderChatMessages(messages) {
        const container = document.getElementById('chatMessagesList');
        if (!container) return;
        if (messages.length === 0) {
            container.innerHTML = '<p class="chat-empty-messages">No hay mensajes todavía. Escribe el primero.</p>';
            return;
        }
        let lastSender = null;
        container.innerHTML = messages.map(function(m) {
            const isMine = m.from === currentUser.uid;
            const nuevoGrupo = m.from !== lastSender;
            lastSender = m.from;
            return `
                <div class="chat-message ${isMine ? 'mine' : 'theirs'}${nuevoGrupo ? ' new-group' : ''}">
                    <span class="chat-message-text">${escapeHtml(m.text)}</span>
                    <span class="chat-message-time">${formatearHoraMensaje(m.createdAt)}</span>
                </div>
            `;
        }).join('');
        container.scrollTop = container.scrollHeight;
    }

    function actualizarEstadoChatHeader(uid) {
        const statusEl = document.getElementById('chatHeaderStatus');
        if (!statusEl || currentChatUid !== uid) return;
        statusEl.textContent = estaEnLinea(uid) ? 'Activo ahora' : 'Desconectado';
        statusEl.classList.toggle('online', estaEnLinea(uid));
        const emojiEl = document.getElementById('chatHeaderEmoji');
        if (emojiEl) {
            const emoji = contactEmojis[uid] || '';
            emojiEl.textContent = emoji;
            emojiEl.style.display = emoji ? 'inline-flex' : 'none';
        }
    }

    function abrirChat(uid, name, username) {
        if (currentChatUid && currentChatListenerRef) {
            off(currentChatListenerRef);
        }

        currentChatUid = uid;

        document.getElementById('chatEmptyState').style.display = 'none';
        const activeWindow = document.getElementById('chatActiveWindow');
        activeWindow.style.display = 'flex';

        const online = estaEnLinea(uid);
        const emoji = contactEmojis[uid] || '';
        const header = document.getElementById('chatHeader');
        header.innerHTML = `
            <div class="chat-header-user">
                <button class="chat-back-btn" onclick="cerrarChatMobile()" aria-label="Volver"><i class="fas fa-arrow-left"></i></button>
                <div class="chat-contact-avatar-wrap">
                    <div class="chat-contact-avatar">${name.charAt(0).toUpperCase()}</div>
                    <span class="chat-contact-dot ${online ? 'online' : 'offline'}"></span>
                </div>
                <div>
                    <div class="chat-header-name">${name} <span id="chatHeaderEmoji" class="chat-header-emoji" style="display:${emoji ? 'inline-flex' : 'none'};">${emoji}</span></div>
                    <div id="chatHeaderStatus" class="chat-header-status ${online ? 'online' : ''}">${online ? 'Activo ahora' : 'Desconectado'}</div>
                </div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="verPerfilUsuario('${uid}', '${escapeForAttr(name)}', '${username}')">Ver perfil</button>
        `;
        obtenerEmojiUsuario(uid).then(function() { actualizarEstadoChatHeader(uid); });

        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer && window.innerWidth <= 768) messagesContainer.classList.add('chat-open');

        const canWrite = puedeEscribirA(uid);
        const inputArea = document.getElementById('chatInputArea');
        const blockedNotice = document.getElementById('chatBlockedNotice');
        if (canWrite) {
            inputArea.style.display = 'flex';
            blockedNotice.style.display = 'none';
        } else {
            inputArea.style.display = 'none';
            blockedNotice.style.display = 'block';
            blockedNotice.textContent = 'No puedes escribirle a este usuario todavía porque no te sigue.';
        }

        document.querySelectorAll('.chat-contact-item').forEach(function(el) {
            el.classList.toggle('active', el.dataset.uid === uid);
        });

        const messagesRef = ref(rtdb, chatMessagesPath(uid));
        currentChatListenerRef = messagesRef;
        onValue(messagesRef, function(snap) {
            const messages = [];
            snap.forEach(function(child) {
                const val = child.val();
                messages.push({ id: child.key, from: val.from, text: val.text, createdAt: val.createdAt || 0 });
            });
            messages.sort(function(a, b) { return a.createdAt - b.createdAt; });
            renderChatMessages(messages);
        });
    }

    window.abrirChat = abrirChat;

    function cerrarChatMobile() {
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) messagesContainer.classList.remove('chat-open');
    }

    window.cerrarChatMobile = cerrarChatMobile;

    async function enviarMensajeChat() {
        const input = document.getElementById('chatMessageInput');
        const text = input.value.trim();
        if (!text || !currentChatUid) return;

        if (!puedeEscribirA(currentChatUid)) {
            alert('No puedes escribirle a este usuario porque no te sigue.');
            return;
        }

        try {
            const messagesRef = ref(rtdb, chatMessagesPath(currentChatUid));
            const newRef = push(messagesRef);
            await set(newRef, { from: currentUser.uid, text: text, createdAt: Date.now() });
            input.value = '';
        } catch (err) {
            console.error('Error enviando mensaje:', err);
            alert('No se pudo enviar el mensaje: ' + (err.code || err.message));
        }
    }

    function normalizarTexto(texto) {
        return String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    }

    const seccionesBusqueda = [
        { keywords: ['panel', 'inicio', 'dashboard'], target: 'section-panel' },
        { keywords: ['perfil', 'mi perfil', 'cuenta'], target: 'section-perfil' },
        { keywords: ['mensajes', 'mensaje', 'chat', 'chats', 'conversaciones'], target: 'section-mensajes' },
        { keywords: ['horario', 'clases', 'clase', 'materias'], target: 'section-clases' },
        { keywords: ['camara', 'reconocimiento facial'], target: 'section-camara' },
        { keywords: ['proyectos', 'proyecto'], target: 'section-proyectos' },
        { keywords: ['estadisticas', 'estadistica', 'graficos'], target: 'section-estadisticas' },
        { keywords: ['configuracion', 'ajustes', 'seguridad', 'notificaciones'], target: 'section-configuracion' }
    ];

    function marcarBusquedaInvalida() {
        const input = document.getElementById('searchInput');
        if (!input) return;
        input.classList.add('search-shake');
        setTimeout(function() { input.classList.remove('search-shake'); }, 400);
    }

    function realizarBusquedaGlobal() {
        const input = document.getElementById('searchInput');
        if (!input) return;
        const term = normalizarTexto(input.value);
        if (!term) return;

        const seccion = seccionesBusqueda.find(function(s) {
            return s.keywords.some(function(k) { return normalizarTexto(k) === term || normalizarTexto(k).indexOf(term) === 0 || term.indexOf(normalizarTexto(k)) === 0; });
        });
        if (seccion) {
            navigateTo(seccion.target);
            return;
        }

        const contacto = chatContacts.find(function(u) {
            return normalizarTexto(u.name).indexOf(term) === 0 || normalizarTexto(u.username).indexOf(term) === 0;
        });
        if (contacto) {
            navigateTo('section-mensajes');
            abrirChat(contacto.uid, contacto.name, contacto.username);
            return;
        }

        marcarBusquedaInvalida();
    }

    const tituloSecciones = {
        'section-panel': 'Panel',
        'section-perfil': 'Perfil',
        'section-mensajes': 'Mensajes',
        'section-clases': 'Horario',
        'section-camara': 'Cámara',
        'section-proyectos': 'Proyectos',
        'section-estadisticas': 'Estadísticas',
        'section-configuracion': 'Configuración'
    };

    function ocultarSugerencias() {
        const box = document.getElementById('searchSuggestions');
        if (!box) return;
        box.classList.remove('open');
        box.innerHTML = '';
    }

    function renderSearchSuggestions(valor) {
        const box = document.getElementById('searchSuggestions');
        if (!box) return;
        const term = normalizarTexto(valor);
        if (!term) { ocultarSugerencias(); return; }

        const seccionMatches = seccionesBusqueda.filter(function(s) {
            return s.keywords.some(function(k) { return normalizarTexto(k).indexOf(term) !== -1; });
        });
        const contactMatches = chatContacts.filter(function(u) {
            return normalizarTexto(u.name).indexOf(term) !== -1 || normalizarTexto(u.username).indexOf(term) !== -1;
        });

        let html = '';
        seccionMatches.slice(0, 4).forEach(function(s) {
            html += `
                <div class="search-suggestion-item" data-type="section" data-target="${s.target}">
                    <i class="fas fa-arrow-right"></i>
                    <span>${escapeHtml(tituloSecciones[s.target] || s.target)}</span>
                </div>
            `;
        });
        contactMatches.slice(0, 5).forEach(function(u) {
            html += `
                <div class="search-suggestion-item" data-type="contact" data-uid="${u.uid}" data-name="${escapeForAttr(u.name)}" data-username="${u.username}">
                    <i class="fas fa-user"></i>
                    <span>${escapeHtml(u.name)} <small>@${escapeHtml(u.username)}</small></span>
                </div>
            `;
        });

        box.innerHTML = html || '<div class="search-suggestion-empty">Sin resultados</div>';
        box.classList.add('open');
    }

    function initChatUI() {
        const sendBtn = document.getElementById('chatSendBtn');
        const input = document.getElementById('chatMessageInput');
        if (sendBtn) sendBtn.addEventListener('click', enviarMensajeChat);
        if (input) {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); enviarMensajeChat(); }
            });
        }
    }

    function obtenerMateriasUnicas(clasesArr) {
        const set = new Set();
        (clasesArr || []).forEach(function(c) {
            if (c.nombre && c.nombre.toLowerCase() !== 'recreo') set.add(c.nombre);
        });
        return Array.from(set);
    }

    function renderProfileMaterias(clasesArr) {
        const container = document.getElementById('profileMateriasChips');
        if (!container) return;
        const materias = obtenerMateriasUnicas(clasesArr);
        if (materias.length === 0) {
            container.innerHTML = '<p class="social-empty">Sin materias registradas todavía.</p>';
            return;
        }
        container.innerHTML = materias.map(function(m) {
            return '<span class="materia-chip"><i class="fas fa-book"></i> ' + escapeHtml(m) + '</span>';
        }).join('');
    }

    let profileHorarioTimer = null;

    function renderProfileHorarioResumen(clasesArr) {
        const container = document.getElementById('profileHorarioResumen');
        if (!container) return;
        if (!clasesArr || clasesArr.length === 0) {
            container.innerHTML = '<p class="social-empty">Sin horario registrado todavía.</p>';
            if (profileHorarioTimer) { clearInterval(profileHorarioTimer); profileHorarioTimer = null; }
            return;
        }

        // Mismo grid (misma función) que "Mi Horario", así siempre se ve
        // idéntico a como el usuario lo configuró — solo que de solo lectura.
        container.classList.add('schedule-wrapper', 'profile-schedule-wrapper');
        container.innerHTML = construirGridHorarioHtml(clasesArr, { editable: false });

        // Refresca el punto de "clase activa" cada minuto mientras el
        // perfil esté visible, para que coincida con la hora real.
        if (profileHorarioTimer) clearInterval(profileHorarioTimer);
        profileHorarioTimer = setInterval(function() {
            const stillVisible = document.getElementById('profileHorarioResumen');
            if (!stillVisible || !document.body.contains(stillVisible)) {
                clearInterval(profileHorarioTimer);
                profileHorarioTimer = null;
                return;
            }
            stillVisible.innerHTML = construirGridHorarioHtml(clasesArr, { editable: false });
        }, 60000);
    }

    function renderPostsGridGeneric(postsArr, soyPropietario) {
        const grid = document.getElementById('postsGrid');
        if (!grid) return;
        if (!postsArr || postsArr.length === 0) {
            grid.innerHTML = `
                <div class="empty-posts">
                    <i class="fas fa-pen-fancy"></i>
                    <p>${soyPropietario ? 'No tienes notas aún' : 'Este usuario no tiene notas todavía'}</p>
                    ${soyPropietario ? '<p style="font-size:0.8rem;">Comparte tus pensamientos o apuntes</p>' : ''}
                </div>
            `;
            return;
        }
        grid.innerHTML = postsArr.map(function(post) {
            return `
                <div class="post-card">
                    <div class="post-header">
                        <span class="post-date">${post.fecha}</span>
                        ${soyPropietario ? `<div class="post-actions"><button class="btn-delete-post" onclick="eliminarPost('${post.id}')"><i class="fas fa-trash"></i></button></div>` : ''}
                    </div>
                    <div class="post-content">${escapeHtml(post.texto)}</div>
                </div>
            `;
        }).join('');
    }

    function switchProfileTab(tab) {
        activeProfileTab = tab;
        document.querySelectorAll('.profile-tab').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.querySelectorAll('.profile-stat-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.querySelectorAll('.profile-tab-panel').forEach(function(panel) {
            panel.classList.toggle('active', panel.id === 'profilePanel-' + tab);
        });
    }

    function wireProfileTabs() {
        document.querySelectorAll('.profile-tab, .profile-stat-btn').forEach(function(btn) {
            if (btn._wired) return;
            btn._wired = true;
            btn.addEventListener('click', function() {
                switchProfileTab(this.dataset.tab);
            });
        });
        const backBtn = document.getElementById('profileBackBtn');
        if (backBtn && !backBtn._wired) {
            backBtn._wired = true;
            backBtn.addEventListener('click', mostrarPerfilPropio);
        }
    }

    function renderProfileActionsOwn() {
        const actions = document.getElementById('profileActions');
        if (!actions) return;
        actions.innerHTML = `
            <button class="btn btn-secondary btn-sm" id="editBioBtn"><i class="fas fa-pen"></i> Editar descripción</button>
        `;
        wireEditBioButton();
    }

    function renderProfileActionsViewing(uid, name, username) {
        const actions = document.getElementById('profileActions');
        if (!actions) return;
        const isFollowing = followingSet.has(uid);
        actions.innerHTML = `
            <button class="btn ${isFollowing ? 'btn-secondary' : 'btn-primary'} btn-sm" id="profileFollowBtn">
                ${isFollowing ? '<i class="fas fa-user-check"></i> Dejar de seguir' : '<i class="fas fa-user-plus"></i> Seguir'}
            </button>
            <button class="btn btn-secondary btn-sm" id="profileMessageBtn"><i class="fas fa-comment"></i> Mensaje</button>
        `;
        document.getElementById('profileFollowBtn').addEventListener('click', async function() {
            await toggleFollow(uid, name, username);
            renderProfileActionsViewing(uid, name, username);
        });
        document.getElementById('profileMessageBtn').addEventListener('click', function() {
            navigateTo('section-mensajes');
            switchMessagesTab('conversaciones');
            abrirChat(uid, name, username);
        });
    }

    function wireEditBioButton() {
        const editBioBtn = document.getElementById('editBioBtn');
        const bioEdit = document.getElementById('bioEdit');
        const bioTextEl = document.getElementById('profileBio');
        if (editBioBtn && !editBioBtn._wired) {
            editBioBtn._wired = true;
            editBioBtn.addEventListener('click', function() {
                bioEdit.style.display = 'block';
                bioTextEl.style.display = 'none';
                this.style.display = 'none';
                document.getElementById('bioTextarea').focus();
            });
        }
    }

    function mostrarPerfilPropio() {
        viewingProfileUid = null;
        viewingProfileData = null;

        const backBtn = document.getElementById('profileBackBtn');
        if (backBtn) backBtn.style.display = 'none';
        const postsHeaderRow = document.getElementById('postsHeaderRow');
        if (postsHeaderRow) {
            postsHeaderRow.innerHTML = '<h3><i class="fas fa-newspaper"></i> Notas</h3><button class="btn btn-primary btn-sm" id="addPostBtn"><i class="fas fa-plus"></i> Nueva nota</button>';
            wireAddPostButton();
        }

        loadUserData();
        renderProfileActionsOwn();
        actualizarBio();
        actualizarEmoji();
        renderPostsGridGeneric(posts, true);
        renderProfileMaterias(clases);
        renderProfileHorarioResumen(clases);
        renderFollowingList(followingList);
        renderFollowersList(followersList);
        renderFriendsList();
        actualizarStats();

        const tabsRow = document.getElementById('profileTabs');
        if (tabsRow) tabsRow.style.display = '';
        const searchCard = document.getElementById('socialSearchCard');
        if (searchCard) searchCard.style.display = '';

        switchProfileTab('publicaciones');
    }

    function wireAddPostButton() {
        const addPostBtn = document.getElementById('addPostBtn');
        if (addPostBtn && !addPostBtn._wired) {
            addPostBtn._wired = true;
            addPostBtn.addEventListener('click', function() {
                const texto = prompt('Escribe tu nota:');
                if (texto && texto.trim()) agregarPost(texto.trim());
            });
        }
    }

    async function mostrarPerfilDeUsuario(uid, name, username) {
        if (!followingSet.has(uid)) {
            alert('Solo puedes ver el perfil de las cuentas que sigues.');
            return;
        }

        viewingProfileUid = uid;
        viewingProfileData = { name: name, username: username };

        const backBtn = document.getElementById('profileBackBtn');
        if (backBtn) backBtn.style.display = 'inline-flex';

        document.getElementById('profileName').textContent = name;
        document.getElementById('profileUsername').textContent = '@' + username;
        document.getElementById('profileBio').textContent = 'Cargando...';
        renderProfileActionsViewing(uid, name, username);

        const postsHeaderRow = document.getElementById('postsHeaderRow');
        if (postsHeaderRow) postsHeaderRow.innerHTML = '<h3><i class="fas fa-newspaper"></i> Notas</h3>';

        const tabsRow = document.getElementById('profileTabs');
        if (tabsRow) tabsRow.style.display = '';
        const searchCard = document.getElementById('socialSearchCard');
        if (searchCard) searchCard.style.display = 'none';

        switchProfileTab('publicaciones');

        try {
            const [perfilSnap, postsSnap, clasesSnap, followersSnap, followingSnap] = await Promise.all([
                get(ref(rtdb, 'users/' + uid + '/perfil')),
                get(ref(rtdb, 'users/' + uid + '/posts')),
                get(ref(rtdb, 'users/' + uid + '/clases')),
                get(ref(rtdb, 'users/' + uid + '/followers')),
                get(ref(rtdb, 'users/' + uid + '/following'))
            ]);

            if (viewingProfileUid !== uid) return;

            const perfil = perfilSnap.exists() ? perfilSnap.val() : {};
            document.getElementById('profileBio').textContent = perfil.bio || 'Sin descripción.';
            const emojiEl = document.getElementById('statusEmoji');
            if (emojiEl) emojiEl.textContent = perfil.emoji || '😊';

            const postsArr = [];
            if (postsSnap.exists()) postsSnap.forEach(function(c) { postsArr.push(c.val()); });
            postsArr.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
            renderPostsGridGeneric(postsArr, false);

            const clasesArr = [];
            if (clasesSnap.exists()) clasesSnap.forEach(function(c) { clasesArr.push(c.val()); });
            renderProfileMaterias(clasesArr);
            renderProfileHorarioResumen(clasesArr);

            const otherFollowers = [];
            if (followersSnap.exists()) followersSnap.forEach(function(c) { otherFollowers.push(Object.assign({ uid: c.key }, c.val())); });
            const otherFollowing = [];
            if (followingSnap.exists()) followingSnap.forEach(function(c) { otherFollowing.push(Object.assign({ uid: c.key }, c.val())); });

            document.getElementById('followersCountStat').textContent = otherFollowers.length;
            document.getElementById('followingCountStat').textContent = otherFollowing.length;
            const otherFollowersSet = new Set(otherFollowers.map(function(u) { return u.uid; }));
            const otherAmigos = otherFollowing.filter(function(u) { return otherFollowersSet.has(u.uid); });
            document.getElementById('friendCount').textContent = otherAmigos.length;
            document.getElementById('classCount').textContent = clasesArr.length;

            const followersContainer = document.getElementById('followersListEl');
            if (followersContainer) {
                followersContainer.innerHTML = otherFollowers.length === 0
                    ? '<p class="social-empty">Nadie sigue a este usuario todavía.</p>'
                    : otherFollowers.map(function(u) {
                        return `<div class="social-list-item"><div class="social-list-identity"><span class="social-list-name">${escapeHtml(u.name)}</span><div class="social-list-username">@${escapeHtml(u.username)}</div></div></div>`;
                    }).join('');
            }
            const followingContainer = document.getElementById('followingList');
            if (followingContainer) {
                followingContainer.innerHTML = otherFollowing.length === 0
                    ? '<p class="social-empty">Este usuario no sigue a nadie todavía.</p>'
                    : otherFollowing.map(function(u) {
                        return `<div class="social-list-item"><div class="social-list-identity"><span class="social-list-name">${escapeHtml(u.name)}</span><div class="social-list-username">@${escapeHtml(u.username)}</div></div></div>`;
                    }).join('');
            }
            const friendsContainer = document.getElementById('friendsListEl');
            if (friendsContainer) {
                friendsContainer.innerHTML = otherAmigos.length === 0
                    ? '<p class="social-empty">Sin amigos en común visibles.</p>'
                    : otherAmigos.map(function(u) {
                        return `<div class="social-list-item"><div class="social-list-identity"><span class="social-list-name">${escapeHtml(u.name)}</span><div class="social-list-username">@${escapeHtml(u.username)}</div></div></div>`;
                    }).join('');
            }
        } catch (err) {
            console.error('Error cargando perfil de usuario:', err);
            document.getElementById('profileBio').textContent = 'No se pudo cargar este perfil.';
        }
    }

    function verPerfilUsuario(uid, name, username) {
        navigateTo('section-perfil');
        mostrarPerfilDeUsuario(uid, name, username);
    }

    window.verPerfilUsuario = verPerfilUsuario;

    const ASSISTANT_SYSTEM_INSTRUCTION = `Eres "Botardo", el asistente virtual dentro del dashboard de Botardo Face App, una aplicación educativa de reconocimiento facial creada por estudiantes del Colegio Luis Madina (Colombia) para el taller de Sistemas Informáticos.

CONOCIMIENTO DE LA APLICACIÓN (úsalo para responder con precisión):
- Secciones del panel lateral: Panel (resumen y actividad reciente), Perfil (perfil propio y de otros usuarios, con notas, horario, materias, seguidores, seguidos y amigos), Mensajes (pestaña "Conversaciones" para chatear con otras personas, y pestaña "IA" con el historial de chats contigo), Horario (crear y editar el horario de clases semanal), Cámara (demo de reconocimiento facial), Estadísticas (datos de uso de la cuenta), Configuración (seguridad, notificaciones, apariencia, datos, uso de IA) y Proyectos (proyectos propios de Botardo).
- Perfil: cada usuario tiene nombre, nombre de usuario, descripción (bio), un emoji de estado, notas/publicaciones, horario de clases, materias, seguidores y seguidos. Dos usuarios son "amigos" cuando se siguen mutuamente.
- Mensajería: solo puedes escribirle a alguien si esa persona te sigue a ti.
- Tienes un límite de 5 mensajes diarios contigo (la IA) para cuentas gratuitas; los usuarios Premium (función futura) no tendrán límite.
- Función VIP: en cada mensaje recibirás un bloque "[CONTEXTO DEL HORARIO EN TIEMPO REAL]" con el horario real de hoy del usuario, su clase actual y sus materias. Úsalo para responder con precisión cuando pregunten en qué clase están, qué les toca hoy, cuánto falta para la siguiente clase, etc. No inventes horarios: si el contexto dice que no hay clases hoy o ninguna clase activa, dilo tal cual. No repitas el bloque de contexto en tu respuesta, es solo para ti.
- Responde siempre en español, de forma breve, cálida y clara. Puedes usar formato Markdown (negrita con **, listas con -, etc.) cuando ayude a la claridad.

NAVEGACIÓN: si el usuario te pide ir a una sección de la app (por ejemplo "llévame a mi perfil", "abre configuración", "muéstrame mis mensajes"), responde brevemente confirmando la acción y termina tu respuesta agregando en una línea aparte, exactamente, una de estas marcas según corresponda:
[[NAV:section-panel]] para Panel
[[NAV:section-perfil]] para Perfil
[[NAV:section-mensajes]] para Mensajes
[[NAV:section-clases]] para Horario
[[NAV:section-camara]] para Cámara
[[NAV:section-estadisticas]] para Estadísticas
[[NAV:section-configuracion]] para Configuración
[[NAV:section-proyectos]] para Proyectos
No uses esta marca si el usuario no pidió navegar a ninguna parte.`;

    function appendAssistantMessage(role, text, opts) {
        const container = document.getElementById('assistantMessages');
        if (!container) return;
        const bubble = document.createElement('div');
        bubble.className = 'assistant-message ' + (role === 'user' ? 'mine' : 'theirs');
        if (role === 'user') {
            bubble.textContent = text;
        } else {
            bubble.innerHTML = simpleMarkdownToHtml(text);
        }
        container.appendChild(bubble);
        if (!opts || opts.scroll !== false) container.scrollTop = container.scrollHeight;
        return bubble;
    }

    function extraerNavegacion(texto) {
        const match = /\[\[NAV:([a-z0-9\-]+)\]\]/i.exec(texto);
        if (!match) return { texto: texto, target: null };
        const limpio = texto.replace(match[0], '').trim();
        return { texto: limpio, target: match[1] };
    }

    // Función VIP: le da a la IA visibilidad en tiempo real del horario del
    // usuario (materias, horario de hoy y en qué clase está ahora mismo).
    // Se recalcula en cada mensaje (no se guarda en el historial) para que
    // nunca quede desactualizado dentro de una misma conversación larga.
    function construirContextoHorarioIA() {
        const ahora = new Date();
        const diaActual = diasSemana[ahora.getDay() === 0 ? 6 : ahora.getDay() - 1];
        const horaActual = String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');

        const clasesHoy = clases
            .filter(function(c) { return c.dias.includes(diaActual); })
            .slice()
            .sort(function(a, b) { return a.horaInicio.localeCompare(b.horaInicio); });

        const claseActual = clasesHoy.find(function(c) { return estaActivaAhora(c); });
        const proxima = clasesHoy.find(function(c) { return c.horaInicio > horaActual; });
        const materias = obtenerMateriasUnicas(clases);

        let texto = `[CONTEXTO DEL HORARIO EN TIEMPO REAL]\nHoy es ${diaActual}, hora actual ${horaActual}.\n`;
        texto += clasesHoy.length
            ? `Horario de hoy: ${clasesHoy.map(function(c) { return `${c.nombre} (${c.horaInicio}-${c.horaFin})`; }).join(', ')}.\n`
            : 'No hay clases registradas para hoy.\n';
        texto += claseActual
            ? `Clase activa ahora mismo: "${claseActual.nombre}" (${claseActual.horaInicio}-${claseActual.horaFin}).\n`
            : 'Ninguna clase está activa en este momento.\n';
        texto += proxima ? `Siguiente clase: "${proxima.nombre}" a las ${proxima.horaInicio}.\n` : '';
        texto += materias.length ? `Materias del usuario: ${materias.join(', ')}.\n` : 'El usuario aún no tiene materias registradas.\n';
        texto += '[FIN DEL CONTEXTO]';
        return texto;
    }

    let assistantChat = null;
    let assistantChatForId = null;

    function crearModeloIA() {
        return getGenerativeModel(ai, {
            model: 'gemini-3.6-flash',
            systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION
        });
    }

    function getAssistantChat(historyMsgs) {
        if (assistantChat && assistantChatForId === currentAiChatId) return assistantChat;
        const model = crearModeloIA();
        const history = (historyMsgs || []).map(function(m) {
            return { role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] };
        });
        assistantChat = model.startChat({ history: history });
        assistantChatForId = currentAiChatId;
        return assistantChat;
    }

    function aiChatsRtdbPath() {
        return 'users/' + currentUser.uid + '/aiChats';
    }

    async function cargarChatsIA() {
        if (!currentUser) return [];
        try {
            const snap = await get(ref(rtdb, aiChatsRtdbPath()));
            const lista = [];
            if (snap.exists()) {
                snap.forEach(function(child) {
                    const val = child.val();
                    lista.push({ id: child.key, titulo: val.titulo || 'Nueva conversación', updatedAt: val.updatedAt || 0, createdAt: val.createdAt || 0 });
                });
            }
            lista.sort(function(a, b) { return b.updatedAt - a.updatedAt; });
            aiChatsList = lista;
            return lista;
        } catch (err) {
            console.error('Error cargando chats de IA:', err);
            return [];
        }
    }

    async function crearNuevoChatIA() {
        const newRef = push(ref(rtdb, aiChatsRtdbPath()));
        const now = Date.now();
        await set(newRef, { titulo: 'Nueva conversación', createdAt: now, updatedAt: now });
        currentAiChatId = newRef.key;
        assistantChat = null;
        const container = document.getElementById('assistantMessages');
        if (container) container.innerHTML = '';
        appendAssistantMessage('assistant', '¡Hola! Soy el asistente de Botardo Face. Puedo ayudarte con tu horario, tus notas, tu perfil, o llevarte a cualquier sección de la app. ¿En qué te ayudo?');
        await cargarChatsIA();
        renderAiChatsListMessages();
        renderAiChatsDropdown();
        renderUserStats();
        return currentAiChatId;
    }

    async function guardarMensajeIA(chatId, role, text) {
        try {
            const msgRef = push(ref(rtdb, aiChatsRtdbPath() + '/' + chatId + '/messages'));
            await set(msgRef, { role: role, text: text, createdAt: Date.now() });
            const updates = { updatedAt: Date.now() };
            const chatMeta = aiChatsList.find(function(c) { return c.id === chatId; });
            if (role === 'user' && (!chatMeta || chatMeta.titulo === 'Nueva conversación')) {
                updates.titulo = text.length > 40 ? text.slice(0, 40) + '…' : text;
            }
            await update(ref(rtdb, aiChatsRtdbPath() + '/' + chatId), updates);
        } catch (err) {
            console.error('Error guardando mensaje de IA:', err);
        }
    }

    async function cargarMensajesChatIA(chatId) {
        try {
            const snap = await get(ref(rtdb, aiChatsRtdbPath() + '/' + chatId + '/messages'));
            const mensajes = [];
            if (snap.exists()) {
                snap.forEach(function(child) {
                    const val = child.val();
                    mensajes.push({ id: child.key, role: val.role, text: val.text, createdAt: val.createdAt || 0 });
                });
            }
            mensajes.sort(function(a, b) { return a.createdAt - b.createdAt; });
            return mensajes;
        } catch (err) {
            console.error('Error cargando mensajes de IA:', err);
            return [];
        }
    }

    async function abrirChatIA(chatId) {
        currentAiChatId = chatId;
        assistantChat = null;
        const container = document.getElementById('assistantMessages');
        if (container) container.innerHTML = '<p class="assistant-loading">Cargando conversación...</p>';
        const mensajes = await cargarMensajesChatIA(chatId);
        if (container) container.innerHTML = '';
        if (mensajes.length === 0) {
            appendAssistantMessage('assistant', '¡Hola! Soy el asistente de Botardo Face. ¿En qué te ayudo?');
        } else {
            mensajes.forEach(function(m) {
                appendAssistantMessage(m.role === 'user' ? 'user' : 'assistant', m.text, { scroll: false });
            });
            if (container) container.scrollTop = container.scrollHeight;
        }
        getAssistantChat(mensajes);
        renderAiChatsDropdown();
        const panel = document.getElementById('assistantPanel');
        if (panel) panel.classList.remove('history-open');
    }

    function renderAiChatsDropdown() {
        const list = document.getElementById('assistantHistoryList');
        if (!list) return;
        if (aiChatsList.length === 0) {
            list.innerHTML = '<p class="social-empty">Sin conversaciones todavía.</p>';
            return;
        }
        list.innerHTML = aiChatsList.map(function(c) {
            const activeClass = c.id === currentAiChatId ? ' active' : '';
            return `
                <button class="assistant-history-item${activeClass}" data-chat-id="${c.id}">
                    <i class="fas fa-message"></i>
                    <span>${escapeHtml(c.titulo)}</span>
                </button>
            `;
        }).join('');
        list.querySelectorAll('.assistant-history-item').forEach(function(btn) {
            btn.addEventListener('click', function() {
                abrirChatIA(this.dataset.chatId);
            });
        });
    }

    function renderAiChatsListMessages() {
        const list = document.getElementById('aiChatsListMessages');
        if (!list) return;
        if (aiChatsList.length === 0) {
            list.innerHTML = '<p class="social-empty">Aún no has hablado con la IA. Inicia una conversación nueva.</p>';
            return;
        }
        list.innerHTML = aiChatsList.map(function(c) {
            return `
                <div class="chat-contact-item" data-chat-id="${c.id}">
                    <div class="chat-contact-avatar-wrap">
                        <div class="chat-contact-avatar"><i class="fas fa-robot"></i></div>
                    </div>
                    <div class="chat-contact-info">
                        <div class="chat-contact-name">${escapeHtml(c.titulo)}</div>
                        <div class="chat-contact-meta">${formatearTiempoRelativo(c.updatedAt)}</div>
                    </div>
                </div>
            `;
        }).join('');
        list.querySelectorAll('.chat-contact-item').forEach(function(item) {
            item.addEventListener('click', function() {
                abrirAsistentePanel();
                abrirChatIA(this.dataset.chatId);
            });
        });
    }

    function abrirAsistentePanel() {
        const panel = document.getElementById('assistantPanel');
        if (panel) panel.style.display = 'flex';
    }

    function switchMessagesTab(tab) {
        activeMessagesTab = tab;
        document.querySelectorAll('.messages-top-tab').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.mtab === tab);
        });
        const conv = document.getElementById('messagesContainer');
        const iaBox = document.getElementById('messagesIaContainer');
        if (conv) conv.style.display = tab === 'conversaciones' ? 'flex' : 'none';
        if (iaBox) iaBox.style.display = tab === 'ia' ? 'flex' : 'none';
        if (tab === 'ia') {
            cargarChatsIA().then(renderAiChatsListMessages);
        }
    }

    function initMessagesTabs() {
        document.querySelectorAll('.messages-top-tab').forEach(function(btn) {
            if (btn._wired) return;
            btn._wired = true;
            btn.addEventListener('click', function() { switchMessagesTab(this.dataset.mtab); });
        });
        const newChatBtn = document.getElementById('newAiChatFromMessagesBtn');
        if (newChatBtn && !newChatBtn._wired) {
            newChatBtn._wired = true;
            newChatBtn.addEventListener('click', async function() {
                abrirAsistentePanel();
                await crearNuevoChatIA();
            });
        }
    }

    // Bloquea/desbloquea por completo la caja de chat con la IA (input +
    // botón de enviar) cuando se agota el límite diario de 5 mensajes,
    // mostrando el aviso "Premium próximamente".
    function actualizarBloqueoChatIA() {
        const input = document.getElementById('assistantInput');
        const sendBtn = document.getElementById('assistantSendBtn');
        const banner = document.getElementById('assistantLimitBanner');
        const bloqueado = !puedeEnviarMensajeIA();

        if (input) {
            input.disabled = bloqueado;
            input.placeholder = bloqueado ? 'Límite diario alcanzado — Premium próximamente' : 'Escribe tu pregunta...';
        }
        if (sendBtn) sendBtn.disabled = bloqueado;
        if (banner) banner.style.display = bloqueado ? 'block' : 'none';
    }

    window.actualizarBloqueoChatIA = actualizarBloqueoChatIA;

    async function sendAssistantMessage() {
        const input = document.getElementById('assistantInput');
        const sendBtn = document.getElementById('assistantSendBtn');
        const text = input.value.trim();
        if (!text) return;

        if (!puedeEnviarMensajeIA()) {
            actualizarBloqueoChatIA();
            return;
        }

        if (!currentAiChatId) {
            await crearNuevoChatIA();
        }

        appendAssistantMessage('user', text);
        input.value = '';
        sendBtn.disabled = true;
        incrementarStatAiMessage();
        registrarUsoDiarioIA();
        actualizarBloqueoChatIA();
        guardarMensajeIA(currentAiChatId, 'user', text);

        const container = document.getElementById('assistantMessages');
        const typingBubble = document.createElement('div');
        typingBubble.id = 'assistantTyping';
        typingBubble.className = 'assistant-typing';
        typingBubble.textContent = 'Escribiendo...';
        container.appendChild(typingBubble);
        container.scrollTop = container.scrollHeight;

        try {
            const chat = getAssistantChat();
            const contextoHorario = construirContextoHorarioIA();
            const result = await chat.sendMessage(contextoHorario + '\n\nMensaje del usuario: ' + text);
            let responseText = result.response.text();
            const typing = document.getElementById('assistantTyping');
            if (typing) typing.remove();

            const { texto, target } = extraerNavegacion(responseText);
            appendAssistantMessage('assistant', texto);
            guardarMensajeIA(currentAiChatId, 'assistant', texto);
            cargarChatsIA().then(function() {
                renderAiChatsDropdown();
                renderAiChatsListMessages();
            });

            if (target && document.getElementById(target)) {
                navigateTo(target);
                if (target === 'section-perfil') mostrarPerfilPropio();
                if (target === 'section-mensajes') switchMessagesTab('conversaciones');
            }
        } catch (err) {
            console.error('Error del asistente:', err);
            const typing = document.getElementById('assistantTyping');
            if (typing) typing.remove();
            appendAssistantMessage('assistant', 'Lo siento, tuve un problema para responder: ' + (err.code || err.message || err));
        } finally {
            actualizarBloqueoChatIA();
        }
    }

    function buildAssistantUI() {
        if (document.getElementById('assistantButton')) return;
        const html = `
            <button id="assistantButton" class="assistant-fab">
                <i class="fas fa-robot"></i>
            </button>
            <div id="assistantPanel" class="assistant-panel">
                <div class="assistant-panel-header">
                    <strong><i class="fas fa-robot"></i> Asistente Botardo</strong>
                    <div class="assistant-header-actions">
                        <button id="assistantHistoryBtn" class="assistant-icon-btn" title="Historial"><i class="fas fa-clock-rotate-left"></i></button>
                        <button id="assistantNewChatBtn" class="assistant-icon-btn" title="Nuevo chat"><i class="fas fa-plus"></i></button>
                        <button id="assistantCloseBtn" class="assistant-close-btn">&times;</button>
                    </div>
                </div>
                <div id="assistantHistoryPanel" class="assistant-history-panel">
                    <div class="assistant-history-header">Tus conversaciones</div>
                    <div id="assistantHistoryList" class="assistant-history-list"></div>
                </div>
                <div id="assistantMessages" class="assistant-messages"></div>
                <div class="assistant-limit-banner" id="assistantLimitBanner" style="display:none;">
                    <i class="fas fa-lock"></i> Alcanzaste tus 5 mensajes de hoy. <strong>Premium próximamente</strong> 🌟
                </div>
                <div class="assistant-input-row">
                    <input type="text" id="assistantInput" placeholder="Escribe tu pregunta..." />
                    <button id="assistantSendBtn" class="btn btn-primary btn-sm"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('assistantButton').addEventListener('click', async function() {
            const panel = document.getElementById('assistantPanel');
            const abrir = panel.style.display !== 'flex';
            panel.style.display = abrir ? 'flex' : 'none';
            if (abrir && !currentAiChatId) {
                await cargarChatsIA();
                if (aiChatsList.length > 0) {
                    await abrirChatIA(aiChatsList[0].id);
                } else {
                    await crearNuevoChatIA();
                }
                renderAiChatsDropdown();
            }
            if (abrir) actualizarBloqueoChatIA();
        });
        document.getElementById('assistantCloseBtn').addEventListener('click', function() {
            document.getElementById('assistantPanel').style.display = 'none';
        });
        document.getElementById('assistantSendBtn').addEventListener('click', sendAssistantMessage);
        document.getElementById('assistantInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); sendAssistantMessage(); }
        });
        document.getElementById('assistantHistoryBtn').addEventListener('click', function() {
            document.getElementById('assistantPanel').classList.toggle('history-open');
        });
        document.getElementById('assistantNewChatBtn').addEventListener('click', async function() {
            await crearNuevoChatIA();
            document.getElementById('assistantPanel').classList.remove('history-open');
        });
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });
    }

    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            const isSidebar = sidebar.contains(e.target);
            const isMenuToggle = menuToggle.contains(e.target);
            if (!isSidebar && !isMenuToggle && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
            }
        }
    });

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const sectionId = this.dataset.section;
            navigateTo(`section-${sectionId}`);
            if (sectionId === 'perfil') mostrarPerfilPropio();
            if (sectionId === 'mensajes') switchMessagesTab('conversaciones');
        });
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
                if (presenceRefHandle) remove(presenceRefHandle);
                signOut(auth)
                    .then(function() { window.location.href = '../html/login.html'; })
                    .catch(function() { window.location.href = '../html/login.html'; });
            }
        });
    }

    if (notifBtn) {
        notifBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            notifDropdown.classList.toggle('open');
            actualizarBadge();
        });

        document.addEventListener('click', function(e) {
            if (!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
                notifDropdown.classList.remove('open');
            }
        });

        const notifTabs = document.querySelectorAll('.notif-tab');
        notifTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                notifTabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                const target = this.dataset.tab;
                document.querySelectorAll('.notif-panel').forEach(p => p.classList.remove('active'));
                const panel = document.getElementById(`notif${target.charAt(0).toUpperCase() + target.slice(1)}`);
                if (panel) panel.classList.add('active');
            });
        });

        document.querySelectorAll('.notif-mark-all').forEach(btn => {
            btn.addEventListener('click', function() {
                const panel = this.closest('.notif-panel');
                if (panel) panel.querySelectorAll('.notif-item.unread').forEach(item => item.classList.remove('unread'));
                actualizarBadge();
            });
        });
    }

    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', async function() {
            const name = editName.value.trim();
            const email = editEmail.value.trim();

            if (!name || !email) { alert('Por favor completa los campos obligatorios.'); return; }
            if (!email.includes('@')) { alert('Por favor ingresa un correo válido.'); return; }

            try {
                await setDoc(doc(db, 'users', currentUser.uid), {
                    name: name,
                    username: currentUserData.username,
                    email: email,
                    createdAt: currentUserData.createdAt || new Date().toISOString()
                });
                currentUserData.name = name;
                currentUserData.email = email;
                loadUserData();
                alert('¡Perfil actualizado correctamente!');
            } catch (err) {
                alert('No se pudo actualizar el perfil. Intenta de nuevo.');
            }
        });
    }

    let stream = null;
    let cameraActive = false;
    let facingMode = 'user';
    let captureCount = 0;

    function updateCameraStatus(active, message) {
        const dot = cameraStatus.querySelector('.status-dot');
        const text = cameraStatus.querySelector('span');
        if (active) {
            dot.className = 'status-dot active';
            text.textContent = message || 'En línea';
        } else {
            dot.className = 'status-dot inactive';
            text.textContent = message || 'Desconectada';
        }
    }

    async function startCamera() {
        try {
            if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }

            const constraints = { video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            videoFeed.srcObject = stream;
            await videoFeed.play();

            videoFeed.style.display = 'block';
            overlayCanvas.style.display = 'none';
            videoPlaceholder.style.display = 'none';
            cameraActive = true;

            startCameraBtn.innerHTML = '<i class="fas fa-stop"></i> Detener cámara';
            captureBtn.disabled = false;
            switchCameraBtn.disabled = false;
            updateCameraStatus(true, 'En línea');

            setTimeout(() => { if (cameraActive) cameraResult.style.display = 'block'; }, 2000);
        } catch (err) {
            console.error('Error al iniciar cámara:', err);
            alert('No se pudo acceder a la cámara. Por favor, verifica los permisos.');
            updateCameraStatus(false, 'Error');
        }
    }

    function stopCamera() {
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        videoFeed.style.display = 'none';
        videoFeed.srcObject = null;
        videoPlaceholder.style.display = 'flex';
        cameraActive = false;
        cameraResult.style.display = 'none';

        startCameraBtn.innerHTML = '<i class="fas fa-play"></i> Iniciar cámara';
        captureBtn.disabled = true;
        switchCameraBtn.disabled = true;
        updateCameraStatus(false, 'Desconectada');
    }

    if (startCameraBtn) {
        startCameraBtn.addEventListener('click', function() {
            if (cameraActive) stopCamera(); else startCamera();
        });
    }

    if (captureBtn) {
        captureBtn.addEventListener('click', function() {
            if (!cameraActive || !videoFeed.srcObject) return;

            captureCount++;
            const canvas = document.createElement('canvas');
            canvas.width = videoFeed.videoWidth || 640;
            canvas.height = videoFeed.videoHeight || 480;
            const ctx = canvas.getContext('2d');

            if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
            ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);

            const link = document.createElement('a');
            link.download = `captura_${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            cameraResult.style.display = 'block';
            cameraResult.querySelector('.result-content span').textContent = `Captura #${captureCount} guardada correctamente`;
        });
    }

    if (switchCameraBtn) {
        switchCameraBtn.addEventListener('click', function() {
            facingMode = facingMode === 'user' ? 'environment' : 'user';
            if (cameraActive) startCamera();
        });
    }

    const projectsInfoBtn = document.getElementById('projectsInfoBtn');
    if (projectsInfoBtn) {
        projectsInfoBtn.addEventListener('click', openProjectsInfoModal);
    }

    function buildProjectsInfoModal() {
        if (document.getElementById('projectsInfoOverlay')) return;
        const html = `
            <div class="modal-overlay" id="projectsInfoOverlay">
                <div class="modal">
                    <div class="modal-header">
                        <h3><i class="fas fa-circle-info"></i> Sobre estos proyectos</h3>
                        <button class="modal-close" id="projectsInfoClose">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="user-profile-empty">
                            Estos son proyectos propios de Botardo, no tienen relación con tu cuenta,
                            tu horario ni tus datos dentro de la app. Los publicamos aquí simplemente
                            para que puedas probarlos. No puedes crear proyectos nuevos desde tu cuenta;
                            solo nosotros los publicamos.
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-cancel" id="projectsInfoOk">Entendido</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        document.getElementById('projectsInfoClose').addEventListener('click', closeProjectsInfoModal);
        document.getElementById('projectsInfoOk').addEventListener('click', closeProjectsInfoModal);
        document.getElementById('projectsInfoOverlay').addEventListener('click', function(e) {
            if (e.target === this) closeProjectsInfoModal();
        });
    }

    function openProjectsInfoModal() {
        buildProjectsInfoModal();
        document.getElementById('projectsInfoOverlay').classList.add('open');
    }

    function closeProjectsInfoModal() {
        const overlay = document.getElementById('projectsInfoOverlay');
        if (overlay) overlay.classList.remove('open');
    }

    function aplicarApariencia() {
        const root = document.documentElement;
        let temaEfectivo = apariencia.tema;
        if (temaEfectivo === 'sistema') {
            temaEfectivo = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'oscuro' : 'claro';
        }
        root.setAttribute('data-tema', temaEfectivo);
        root.setAttribute('data-fondo', apariencia.fondo || 'default');
        root.style.setProperty('--accent-user', apariencia.acento || '#1a2332');

        document.querySelectorAll('.theme-option').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.tema === apariencia.tema);
        });
        document.querySelectorAll('.accent-swatch').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.accent === apariencia.acento);
        });
        document.querySelectorAll('.bg-swatch').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.bg === apariencia.fondo);
        });
    }

    async function guardarApariencia() {
        try {
            await set(ref(rtdb, 'users/' + currentUser.uid + '/settings/apariencia'), apariencia);
        } catch (err) {
            console.error('Error guardando apariencia:', err);
        }
    }

    async function cargarApariencia() {
        if (!currentUser) { aplicarApariencia(); return; }
        try {
            const snap = await get(ref(rtdb, 'users/' + currentUser.uid + '/settings/apariencia'));
            if (snap.exists()) {
                const val = snap.val();
                apariencia = {
                    tema: val.tema || 'claro',
                    acento: val.acento || '#1a2332',
                    fondo: val.fondo || 'default'
                };
            }
        } catch (err) {
            console.error('Error cargando apariencia:', err);
        }
        aplicarApariencia();
    }

    function initApariencia() {
        document.querySelectorAll('.theme-option').forEach(function(btn) {
            if (btn._wired) return;
            btn._wired = true;
            btn.addEventListener('click', function() {
                apariencia.tema = this.dataset.tema;
                aplicarApariencia();
                guardarApariencia();
            });
        });
        document.querySelectorAll('.accent-swatch').forEach(function(btn) {
            if (btn._wired) return;
            btn._wired = true;
            btn.addEventListener('click', function() {
                apariencia.acento = this.dataset.accent;
                aplicarApariencia();
                guardarApariencia();
            });
        });
        document.querySelectorAll('.bg-swatch').forEach(function(btn) {
            if (btn._wired) return;
            btn._wired = true;
            btn.addEventListener('click', function() {
                apariencia.fondo = this.dataset.bg;
                aplicarApariencia();
                guardarApariencia();
            });
        });
    }

    async function cargarNotifSettings() {
        if (!currentUser) return;
        try {
            const snap = await get(ref(rtdb, 'users/' + currentUser.uid + '/settings/notificaciones'));
            if (snap.exists()) {
                const val = snap.val();
                notifSettings = {
                    live: val.live !== false,
                    sistema: val.sistema !== false
                };
            }
        } catch (err) {
            console.error('Error cargando preferencias de notificaciones:', err);
        }
    }

    async function guardarNotifSettings() {
        try {
            await set(ref(rtdb, 'users/' + currentUser.uid + '/settings/notificaciones'), notifSettings);
        } catch (err) {
            console.error('Error guardando preferencias de notificaciones:', err);
            alert('No se pudieron guardar las preferencias: ' + (err.code || err.message));
        }
    }

    function buildNotifSettingsModal() {
        if (document.getElementById('notifSettingsOverlay')) return;
        const html = `
            <div class="modal-overlay" id="notifSettingsOverlay">
                <div class="modal">
                    <div class="modal-header">
                        <h3>Preferencias de notificación</h3>
                        <button class="modal-close" id="notifSettingsClose">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="notif-toggle-row">
                                <input type="checkbox" id="notifLiveToggle" />
                                Notificaciones en vivo (clases próximas, en curso)
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="notif-toggle-row">
                                <input type="checkbox" id="notifSistemaToggle" />
                                Notificaciones del sistema (cambios en tu horario)
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-cancel" id="notifSettingsCancel">Cerrar</button>
                        <button class="btn btn-save" id="notifSettingsSave">Guardar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('notifSettingsClose').addEventListener('click', closeNotifSettingsModal);
        document.getElementById('notifSettingsCancel').addEventListener('click', closeNotifSettingsModal);
        document.getElementById('notifSettingsOverlay').addEventListener('click', function(e) {
            if (e.target === this) closeNotifSettingsModal();
        });
        document.getElementById('notifSettingsSave').addEventListener('click', async function() {
            const btn = this;
            notifSettings.live = document.getElementById('notifLiveToggle').checked;
            notifSettings.sistema = document.getElementById('notifSistemaToggle').checked;
            btn.disabled = true;
            btn.textContent = 'Guardando...';
            await guardarNotifSettings();
            btn.disabled = false;
            btn.textContent = 'Guardar';
            closeNotifSettingsModal();
        });
    }

    function openNotifSettingsModal() {
        buildNotifSettingsModal();
        document.getElementById('notifLiveToggle').checked = notifSettings.live;
        document.getElementById('notifSistemaToggle').checked = notifSettings.sistema;
        document.getElementById('notifSettingsOverlay').classList.add('open');
    }

    function closeNotifSettingsModal() {
        const overlay = document.getElementById('notifSettingsOverlay');
        if (overlay) overlay.classList.remove('open');
    }

    async function exportarDatosUsuario() {
        const exportBtn = document.getElementById('exportDataBtn');
        if (exportBtn) { exportBtn.disabled = true; exportBtn.textContent = 'Generando...'; }

        try {
            const perfilSnap = await get(ref(rtdb, 'users/' + currentUser.uid + '/perfil'));
            const postsSnap = await get(ref(rtdb, 'users/' + currentUser.uid + '/posts'));
            const clasesSnap = await get(ref(rtdb, 'users/' + currentUser.uid + '/clases'));
            const followingSnap = await get(ref(rtdb, 'users/' + currentUser.uid + '/following'));
            const followersSnap = await get(ref(rtdb, 'users/' + currentUser.uid + '/followers'));

            const perfil = perfilSnap.exists() ? perfilSnap.val() : {};
            const postsData = [];
            if (postsSnap.exists()) postsSnap.forEach(function(c) { postsData.push(c.val()); });
            const clasesData = [];
            if (clasesSnap.exists()) clasesSnap.forEach(function(c) { clasesData.push(c.val()); });
            const followingData = [];
            if (followingSnap.exists()) followingSnap.forEach(function(c) { followingData.push(c.val()); });
            const followersData = [];
            if (followersSnap.exists()) followersSnap.forEach(function(c) { followersData.push(c.val()); });

            const ahora = new Date().toLocaleString('es-ES');
            const linea = '========================================';

            let contenido = '';
            contenido += linea + '\n';
            contenido += '  BOTARDO FACE APP - EXPORTACIÓN DE DATOS\n';
            contenido += linea + '\n';
            contenido += 'Generado: ' + ahora + '\n\n';

            contenido += linea + '\n';
            contenido += 'DATOS DE LA CUENTA\n';
            contenido += linea + '\n';
            contenido += 'Nombre: ' + (currentUserData.name || '-') + '\n';
            contenido += 'Usuario: @' + (currentUserData.username || '-') + '\n';
            contenido += 'Correo: ' + (currentUserData.email || '-') + '\n';
            contenido += 'Cuenta creada: ' + (currentUserData.createdAt || '-') + '\n\n';

            contenido += linea + '\n';
            contenido += 'PERFIL\n';
            contenido += linea + '\n';
            contenido += 'Descripción: ' + (perfil.bio || 'Sin descripción') + '\n';
            contenido += 'Emoji de estado: ' + (perfil.emoji || '-') + '\n\n';

            contenido += linea + '\n';
            contenido += 'NOTAS (' + postsData.length + ')\n';
            contenido += linea + '\n';
            if (postsData.length === 0) {
                contenido += 'No tienes notas guardadas.\n\n';
            } else {
                postsData.forEach(function(p, i) {
                    contenido += '[' + (i + 1) + '] ' + p.fecha + '\n';
                    contenido += p.texto + '\n\n';
                });
            }

            contenido += linea + '\n';
            contenido += 'HORARIO DE CLASES (' + clasesData.length + ')\n';
            contenido += linea + '\n';
            if (clasesData.length === 0) {
                contenido += 'No tienes clases registradas.\n\n';
            } else {
                clasesData.forEach(function(c) {
                    contenido += '- ' + c.nombre + ' | ' + c.dias.join(', ') + ' | ' + c.horaInicio + ' a ' + c.horaFin + '\n';
                });
                contenido += '\n';
            }

            contenido += linea + '\n';
            contenido += 'SIGUIENDO (' + followingData.length + ')\n';
            contenido += linea + '\n';
            if (followingData.length === 0) {
                contenido += 'No sigues a nadie.\n\n';
            } else {
                followingData.forEach(function(f) {
                    contenido += '- ' + f.name + ' (@' + f.username + ')\n';
                });
                contenido += '\n';
            }

            contenido += linea + '\n';
            contenido += 'SEGUIDORES (' + followersData.length + ')\n';
            contenido += linea + '\n';
            if (followersData.length === 0) {
                contenido += 'Nadie te sigue todavía.\n\n';
            } else {
                followersData.forEach(function(f) {
                    contenido += '- ' + f.name + ' (@' + f.username + ')\n';
                });
                contenido += '\n';
            }

            contenido += linea + '\n';
            contenido += 'Fin del reporte.\n';

            const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'botardo_datos_' + (currentUserData.username || 'usuario') + '.txt';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            incrementarStatExport();
        } catch (err) {
            console.error('Error exportando datos:', err);
            alert('No se pudieron exportar los datos: ' + (err.code || err.message));
        } finally {
            if (exportBtn) { exportBtn.disabled = false; exportBtn.textContent = 'Exportar datos'; }
        }
    }

    window.editarClase = editarClase;
    window.eliminarClase = eliminarClase;
    window.abrirModal = abrirModal;
    window.cerrarModal = cerrarModal;
    window.guardarClaseFromModal = guardarClaseFromModal;

    function init() {
        loadUserData();
        loadProjects();
        initClases();
        initPerfil();
        buildSocialUI();
        initSocialListeners();
        initPresence();
        buildAssistantUI();
        cargarNotifSettings();
        cargarApariencia();
        cargarUserStats().then(registrarEntrada);
        cargarChatsIA().then(renderUserStats);
        initChatUI();
        initMessagesTabs();
        initApariencia();
        renderActivityTimeline();

        const headerSearchInput = document.getElementById('searchInput');
        const searchSuggestionsBox = document.getElementById('searchSuggestions');
        if (headerSearchInput) {
            headerSearchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); ocultarSugerencias(); realizarBusquedaGlobal(); }
            });
            headerSearchInput.addEventListener('input', function() {
                renderSearchSuggestions(headerSearchInput.value);
            });
            headerSearchInput.addEventListener('focus', function() {
                if (headerSearchInput.value) renderSearchSuggestions(headerSearchInput.value);
            });
        }
        if (searchSuggestionsBox) {
            searchSuggestionsBox.addEventListener('click', function(e) {
                const item = e.target.closest('.search-suggestion-item');
                if (!item) return;
                if (item.dataset.type === 'section') {
                    navigateTo(item.dataset.target);
                } else if (item.dataset.type === 'contact') {
                    navigateTo('section-mensajes');
                    abrirChat(item.dataset.uid, item.dataset.name, item.dataset.username);
                }
                if (headerSearchInput) headerSearchInput.value = '';
                ocultarSugerencias();
            });
        }
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.header-search')) ocultarSugerencias();
        });

        updateCameraStatus(false, 'Desconectada');

        const changePasswordBtn = document.getElementById('changePasswordBtn');
        if (changePasswordBtn) changePasswordBtn.addEventListener('click', openChangePasswordModal);

        const manageNotifBtn = document.getElementById('manageNotifBtn');
        if (manageNotifBtn) manageNotifBtn.addEventListener('click', openNotifSettingsModal);

        const exportDataBtn = document.getElementById('exportDataBtn');
        if (exportDataBtn) exportDataBtn.addEventListener('click', exportarDatosUsuario);

        const hash = window.location.hash.replace('#', '');
        if (hash) {
            const sectionMap = {
                'panel': 'section-panel',
                'perfil': 'section-perfil',
                'mensajes': 'section-mensajes',
                'clases': 'section-clases',
                'camara': 'section-camara',
                'proyectos': 'section-proyectos',
                'estadisticas': 'section-estadisticas',
                'configuracion': 'section-configuracion'
            };
            const target = sectionMap[hash];
            if (target) {
                navigateTo(target);
                if (hash === 'perfil') mostrarPerfilPropio();
                if (hash === 'mensajes') switchMessagesTab('conversaciones');
            }
        }
    }

    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            const messagesContainer = document.getElementById('messagesContainer');
            if (!messagesContainer) return;
            if (window.innerWidth <= 768 && currentChatUid) {
                messagesContainer.classList.add('chat-open');
            } else if (window.innerWidth > 768) {
                messagesContainer.classList.remove('chat-open');
            }
        }, 200);
    });

    onAuthStateChanged(auth, function(user) {
        if (!user) {
            window.location.href = '../html/login.html';
            return;
        }
        currentUser = user;
        loadOrRequestUserData(user);
    });

})();