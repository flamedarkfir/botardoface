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
    let userStats = { loginCount: 0, exportCount: 0, aiMessages: 0 };

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function(c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
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
        const postCountEl = document.getElementById('postCount');
        if (postCountEl) postCountEl.textContent = posts.length;
        const classCountEl = document.getElementById('classCount');
        if (classCountEl) classCountEl.textContent = clases.length;

        const followersCountEl = document.getElementById('followersCountStat');
        if (followersCountEl) followersCountEl.textContent = followersCount;

        const followingCountEl = document.getElementById('followingCountStat');
        if (followingCountEl) followingCountEl.textContent = followingSet.size;

        let amigos = 0;
        followingSet.forEach(function(uid) {
            if (followersSet.has(uid)) amigos++;
        });
        const friendCountEl = document.getElementById('friendCount');
        if (friendCountEl) friendCountEl.textContent = amigos;
        const statFriendCountEl = document.getElementById('statFriendCount');
        if (statFriendCountEl) statFriendCountEl.textContent = amigos;
    }

    function renderUserStats() {
        const loginEl = document.getElementById('statLoginCount');
        if (loginEl) loginEl.textContent = userStats.loginCount;
        const exportEl = document.getElementById('statExportCount');
        if (exportEl) exportEl.textContent = userStats.exportCount;
        const aiEl = document.getElementById('statAiMessages');
        if (aiEl) aiEl.textContent = userStats.aiMessages;
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
            }
        } catch (err) {
            console.error('Error cargando estadísticas:', err);
        }
        renderUserStats();
    }

    async function registrarEntrada() {
        if (!currentUser) return;
        try {
            userStats.loginCount += 1;
            await set(ref(rtdb, 'users/' + currentUser.uid + '/stats/loginCount'), userStats.loginCount);
            renderUserStats();
        } catch (err) {
            console.error('Error registrando entrada:', err);
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
        const grid = document.getElementById('postsGrid');
        if (!grid) return;

        if (posts.length === 0) {
            grid.innerHTML = `
                <div class="empty-posts">
                    <i class="fas fa-pen-fancy"></i>
                    <p>No tienes notas aún</p>
                    <p style="font-size:0.8rem;">Comparte tus pensamientos o apuntes</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = posts.map(post => `
            <div class="post-card">
                <div class="post-header">
                    <span class="post-date">${post.fecha}</span>
                    <div class="post-actions">
                        <button class="btn-delete-post" onclick="eliminarPost('${post.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="post-content">${post.texto}</div>
            </div>
        `).join('');
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
        const editBioBtn = document.getElementById('editBioBtn');
        const bioEdit = document.getElementById('bioEdit');
        const bioTextEl = document.getElementById('profileBio');
        const cancelBioBtn = document.getElementById('cancelBioBtn');
        const saveBioBtn = document.getElementById('saveBioBtn');
        const bioTextarea = document.getElementById('bioTextarea');
        const addPostBtn = document.getElementById('addPostBtn');

        if (editBioBtn) {
            editBioBtn.addEventListener('click', function() {
                bioEdit.style.display = 'block';
                bioTextEl.style.display = 'none';
                this.style.display = 'none';
                bioTextarea.focus();
            });
        }

        if (cancelBioBtn) {
            cancelBioBtn.addEventListener('click', function() {
                bioEdit.style.display = 'none';
                bioTextEl.style.display = 'block';
                editBioBtn.style.display = 'inline-block';
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
                editBioBtn.style.display = 'inline-block';
            });
        }

        if (addPostBtn) {
            addPostBtn.addEventListener('click', function() {
                const texto = prompt('Escribe tu nota:');
                if (texto && texto.trim()) {
                    agregarPost(texto.trim());
                }
            });
        }

        const emojiEl = document.getElementById('statusEmoji');
        if (emojiEl) {
            emojiEl.addEventListener('click', function() {
                const emojis = ['😊', '😎', '🤓', '🔥', '💪', '🌟', '🚀', '💡', '🎯', '✨', '😄', '🤩', '👨‍💻', '👩‍💻', '🧠'];
                const current = emojis.indexOf(statusEmoji);
                const next = (current + 1) % emojis.length;
                statusEmoji = emojis[next];
                guardarEmoji();
                actualizarEmoji();
            });
        }

        cargarPerfilSocial();
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

    function obtenerHorasUnicas() {
        const horas = new Set();
        clases.forEach(c => horas.add(c.horaInicio));
        return Array.from(horas).sort();
    }

    function obtenerDiasConClases() {
        const dias = new Set();
        clases.forEach(c => c.dias.forEach(d => dias.add(d)));
        return diasSemana.filter(d => dias.has(d));
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

        const horas = obtenerHorasUnicas();
        const diasConClases = obtenerDiasConClases();

        let html = '<table class="schedule-table"><thead><tr><th>Hora</th>';
        diasConClases.forEach(dia => { html += `<th>${dia}</th>`; });
        html += '</tr></thead><tbody>';

        horas.forEach(hora => {
            html += `<tr><td class="hour-cell">${hora}</td>`;
            diasConClases.forEach(dia => {
                const clase = clases.find(c => c.dias.includes(dia) && c.horaInicio === hora);
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
                                <button class="class-edit-btn" onclick="editarClase('${clase.id}')"><i class="fas fa-edit"></i></button>
                                <button class="class-delete-btn" onclick="eliminarClase('${clase.id}')"><i class="fas fa-trash"></i></button>
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
        grid.innerHTML = html;
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
            agregarNotificacionSistema('Clase eliminada', 'Has eliminado una clase del horario');
        } catch (err) {
            console.error('Error eliminando clase:', err);
            alert('No se pudo eliminar la clase: ' + (err.code || err.message));
        }
    }

    function agregarNotificacionSistema(titulo, mensaje) {
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
                list.prepend(item);
                actualizarBadge();
            }
        }
        agregarActividad('#0d47a1', titulo, mensaje);
    }

    function agregarNotificacionLive(titulo, mensaje) {
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
                agregarNotificacionSistema('Actualizado', `Has actualizado "${nombre}"`);
            } else {
                const newRef = push(ref(rtdb, 'users/' + currentUser.uid + '/clases'));
                await set(newRef, claseData);
                clases.push(Object.assign({ id: newRef.key }, claseData));
                agregarNotificacionSistema('Nuevo', `Has agregado "${nombre}" al horario`);
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

    function verificarNotificacionesClases() {
        const ahora = new Date();
        const diaActual = diasSemana[ahora.getDay() === 0 ? 6 : ahora.getDay() - 1];
        const horaActualMin = ahora.getHours() * 100 + ahora.getMinutes();

        clases.forEach(clase => {
            if (!clase.dias.includes(diaActual)) return;

            const inicioMin = parseInt(clase.horaInicio.replace(':', ''));
            const finMin = parseInt(clase.horaFin.replace(':', ''));
            const diffInicio = inicioMin - horaActualMin;
            const diffFin = finMin - horaActualMin;

            if (diffInicio > 0 && diffInicio <= 5) {
                const emoji = esRecreo(clase) ? '☕' : '⏰';
                agregarNotificacionLive(`${emoji} Próximo`, `"${clase.nombre}" comienza en ${Math.round(diffInicio)} minutos`);
            }

            if (diffInicio <= 0 && diffFin > 0 && Math.random() < 0.1) {
                const emoji = esRecreo(clase) ? '☕' : '📚';
                agregarNotificacionLive(`${emoji} En curso`, `"${clase.nombre}" está en progreso`);
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
        if (document.getElementById('socialSearchCard')) return;
        const profileBody = document.querySelector('.profile-body') || document.querySelector('#section-perfil .profile-container') || document.getElementById('section-perfil');
        if (!profileBody) return;
        const html = `
            <div class="profile-bio" id="socialSearchCard">
                <div class="bio-header"><i class="fas fa-user-plus"></i><h3>Buscar usuarios</h3></div>
                <div class="user-search-row">
                    <input type="text" id="userSearchInput" placeholder="Buscar por nombre de usuario..." />
                    <button class="btn btn-primary btn-sm" id="userSearchBtn"><i class="fas fa-search"></i></button>
                </div>
                <div id="userSearchResults"></div>
            </div>
            <div class="profile-bio" id="followingCard">
                <div class="bio-header"><i class="fas fa-users"></i><h3>Siguiendo</h3></div>
                <div id="followingList"><p class="social-empty">Aún no sigues a nadie.</p></div>
            </div>
            <div class="profile-bio" id="followersCard">
                <div class="bio-header"><i class="fas fa-user-friends"></i><h3>Te siguen</h3></div>
                <div id="followersListEl"><p class="social-empty">Nadie te sigue todavía.</p></div>
            </div>
        `;
        profileBody.insertAdjacentHTML('beforeend', html);

        document.getElementById('userSearchBtn').addEventListener('click', handleUserSearch);
        document.getElementById('userSearchInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); handleUserSearch(); }
        });
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
            return `
                <div class="social-list-item">
                    <div><span class="social-list-name">${u.name}</span><div class="social-list-username">@${u.username}</div></div>
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
            return `
                <div class="social-list-item">
                    <div><span class="social-list-name">${u.name}</span><div class="social-list-username">@${u.username}</div></div>
                    ${yaLoSigo ? '' : `<div class="social-list-actions"><button class="btn btn-primary btn-sm" onclick="toggleFollow('${u.uid}', '${escapeForAttr(u.name)}', '${u.username}')">Seguir de vuelta</button></div>`}
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
                        if (u) agregarNotificacionLive('Nuevo seguidor', `${u.name} (@${u.username}) ahora te sigue`);
                    }
                });
            }
            followersSet = newSet;
            followersList = newList;
            followersCount = followersList.length;
            followersInitialized = true;
            renderFollowersList(followersList);
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

    function buildUserProfileModal() {
        if (document.getElementById('userProfileOverlay')) return;
        const html = `
            <div class="modal-overlay" id="userProfileOverlay">
                <div class="modal modal-wide">
                    <div class="modal-header">
                        <h3 id="userProfileModalTitle">Perfil</h3>
                        <button class="modal-close" id="userProfileClose">&times;</button>
                    </div>
                    <div class="modal-body modal-body-scroll" id="userProfileModalBody">
                        <p class="user-profile-empty">Cargando...</p>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        document.getElementById('userProfileClose').addEventListener('click', function() {
            document.getElementById('userProfileOverlay').classList.remove('open');
        });
        document.getElementById('userProfileOverlay').addEventListener('click', function(e) {
            if (e.target === this) this.classList.remove('open');
        });
    }

    async function verPerfilUsuario(uid, name, username) {
        if (!followingSet.has(uid)) {
            alert('Solo puedes ver el perfil de las cuentas que sigues.');
            return;
        }

        buildUserProfileModal();
        const overlay = document.getElementById('userProfileOverlay');
        const title = document.getElementById('userProfileModalTitle');
        const body = document.getElementById('userProfileModalBody');
        title.textContent = name + ' (@' + username + ')';
        body.innerHTML = '<p class="user-profile-empty">Cargando...</p>';
        overlay.classList.add('open');

        try {
            const [perfilSnap, postsSnap, clasesSnap] = await Promise.all([
                get(ref(rtdb, 'users/' + uid + '/perfil')),
                get(ref(rtdb, 'users/' + uid + '/posts')),
                get(ref(rtdb, 'users/' + uid + '/clases'))
            ]);

            const perfil = perfilSnap.exists() ? perfilSnap.val() : {};
            const postsArr = [];
            if (postsSnap.exists()) postsSnap.forEach(function(c) { postsArr.push(c.val()); });
            postsArr.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
            const clasesArr = [];
            if (clasesSnap.exists()) clasesSnap.forEach(function(c) { clasesArr.push(c.val()); });

            let html = '';
            html += '<div class="user-profile-section">';
            html += '<h4><i class="fas fa-pen"></i> Acerca de</h4>';
            html += '<p class="user-profile-bio-text">' + (perfil.bio || 'Sin descripción.') + '</p>';
            html += '</div>';

            html += '<div class="user-profile-section">';
            html += '<h4><i class="fas fa-calendar-alt"></i> Horario (' + clasesArr.length + ')</h4>';
            if (clasesArr.length === 0) {
                html += '<p class="user-profile-empty">Sin clases registradas.</p>';
            } else {
                clasesArr.forEach(function(c) {
                    html += '<div class="user-profile-class-item">' + c.nombre + ' · ' + c.dias.join(', ') + ' · ' + c.horaInicio + '-' + c.horaFin + '</div>';
                });
            }
            html += '</div>';

            html += '<div class="user-profile-section">';
            html += '<h4><i class="fas fa-newspaper"></i> Notas (' + postsArr.length + ')</h4>';
            if (postsArr.length === 0) {
                html += '<p class="user-profile-empty">Sin notas.</p>';
            } else {
                postsArr.forEach(function(p) {
                    html += '<div class="user-profile-post-item"><div class="user-profile-post-date">' + p.fecha + '</div>' + p.texto + '</div>';
                });
            }
            html += '</div>';

            body.innerHTML = html;
        } catch (err) {
            console.error('Error cargando perfil de usuario:', err);
            body.innerHTML = '<p class="social-error" style="text-align:center;">No se pudo cargar el perfil: ' + (err.code || err.message) + '</p>';
        }
    }

    window.verPerfilUsuario = verPerfilUsuario;

    function appendAssistantMessage(role, text) {
        const container = document.getElementById('assistantMessages');
        if (!container) return;
        const bubble = document.createElement('div');
        bubble.className = 'assistant-message ' + (role === 'user' ? 'mine' : 'theirs');
        bubble.textContent = text;
        container.appendChild(bubble);
        container.scrollTop = container.scrollHeight;
    }

    let assistantChat = null;

    function getAssistantChat() {
        if (assistantChat) return assistantChat;
        const model = getGenerativeModel(ai, {
            model: 'gemini-3.6-flash',
            systemInstruction: 'Eres el asistente virtual del dashboard de Botardo Face App, una app educativa de reconocimiento facial hecha por estudiantes de colegio. Ayudas al usuario con dudas sobre su horario de clases, sus notas, su perfil, seguir a otros usuarios y el funcionamiento general de la app. Responde siempre en español, de forma breve, amigable y clara.'
        });
        assistantChat = model.startChat();
        return assistantChat;
    }

    async function sendAssistantMessage() {
        const input = document.getElementById('assistantInput');
        const sendBtn = document.getElementById('assistantSendBtn');
        const text = input.value.trim();
        if (!text) return;

        appendAssistantMessage('user', text);
        input.value = '';
        sendBtn.disabled = true;
        incrementarStatAiMessage();

        const container = document.getElementById('assistantMessages');
        const typingBubble = document.createElement('div');
        typingBubble.id = 'assistantTyping';
        typingBubble.className = 'assistant-typing';
        typingBubble.textContent = 'Escribiendo...';
        container.appendChild(typingBubble);
        container.scrollTop = container.scrollHeight;

        try {
            const chat = getAssistantChat();
            const result = await chat.sendMessage(text);
            const responseText = result.response.text();
            const typing = document.getElementById('assistantTyping');
            if (typing) typing.remove();
            appendAssistantMessage('assistant', responseText);
        } catch (err) {
            console.error('Error del asistente:', err);
            const typing = document.getElementById('assistantTyping');
            if (typing) typing.remove();
            appendAssistantMessage('assistant', 'Lo siento, tuve un problema para responder: ' + (err.code || err.message || err));
        } finally {
            sendBtn.disabled = false;
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
                    <button id="assistantCloseBtn" class="assistant-close-btn">&times;</button>
                </div>
                <div id="assistantMessages" class="assistant-messages"></div>
                <div class="assistant-input-row">
                    <input type="text" id="assistantInput" placeholder="Escribe tu pregunta..." />
                    <button id="assistantSendBtn" class="btn btn-primary btn-sm"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('assistantButton').addEventListener('click', function() {
            const panel = document.getElementById('assistantPanel');
            panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
        });
        document.getElementById('assistantCloseBtn').addEventListener('click', function() {
            document.getElementById('assistantPanel').style.display = 'none';
        });
        document.getElementById('assistantSendBtn').addEventListener('click', sendAssistantMessage);
        document.getElementById('assistantInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); sendAssistantMessage(); }
        });

        appendAssistantMessage('assistant', '¡Hola! Soy el asistente de Botardo Face. Puedo ayudarte con tu horario, tus notas o dudas sobre la app. ¿En qué te ayudo?');
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
        cargarUserStats().then(registrarEntrada);
        initChatUI();
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
            if (target) navigateTo(target);
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