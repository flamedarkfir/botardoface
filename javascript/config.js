import { auth, db, rtdb, ai, onAuthStateChanged, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider, doc, getDoc, setDoc, collection, query, where, getDocs, ref, set, get, update, remove, push, onValue, off, onDisconnect, getGenerativeModel } from './firebase-config.js';

(function() {
    'use strict';

    let currentUser = null;
    let currentUserData = null;

    let posts = [];
    let bioText = 'Aún no has agregado una descripción.';
    let statusEmoji = '😊';
    let clases = [];
    let followingSet = new Set();
    let followersCount = 0;
    let presenceRefHandle = null;
    let onlineListenerRef = null;

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
        const friendCountEl = document.getElementById('friendCount');
        if (friendCountEl) friendCountEl.textContent = followersCount;
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
        const list = document.querySelector('#notifSistema .notif-list');
        if (!list) return;
        const emptyMsg = list.querySelector('li:only-child');
        if (emptyMsg && emptyMsg.textContent.includes('Sistema funcionando')) list.innerHTML = '';
        const item = document.createElement('li');
        item.className = 'notif-item unread';
        item.innerHTML = `
            <i class="fas fa-info-circle" style="color:#0d47a1;"></i>
            <div><p><strong>${titulo}</strong> - ${mensaje}</p><span>Hace unos segundos</span></div>
        `;
        list.prepend(item);
        actualizarBadge();
    }

    function agregarNotificacionLive(titulo, mensaje) {
        const list = document.querySelector('#notifLive .notif-list');
        if (!list) return;
        const emptyMsg = list.querySelector('li:only-child');
        if (emptyMsg && emptyMsg.textContent.includes('No hay notificaciones')) list.innerHTML = '';
        const item = document.createElement('li');
        item.className = 'notif-item unread';
        item.innerHTML = `
            <i class="fas fa-bell" style="color:#e65100;"></i>
            <div><p><strong>${titulo}</strong> - ${mensaje}</p><span>Hace unos segundos</span></div>
        `;
        list.prepend(item);
        actualizarBadge();
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
                        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem;">Necesitamos estos datos para activar tu cuenta.</p>
                        <div class="form-group">
                            <label>Nombres y Apellidos</label>
                            <input type="text" id="completeName" placeholder="Ej: Juan Camilo Pérez Muñoz" />
                            <div id="completeNameError" style="color:#dc3545;font-size:0.75rem;min-height:1.1rem;margin-top:0.2rem;"></div>
                        </div>
                        <div class="form-group">
                            <label>Nombre de usuario</label>
                            <input type="text" id="completeUsername" placeholder="Ej: juan007" />
                            <div id="completeUsernameError" style="color:#dc3545;font-size:0.75rem;min-height:1.1rem;margin-top:0.2rem;"></div>
                        </div>
                        <div class="form-group">
                            <label>Correo electrónico</label>
                            <input type="email" id="completeEmail" placeholder="Ej: ejemplo@gmail.com" />
                            <div id="completeEmailError" style="color:#dc3545;font-size:0.75rem;min-height:1.1rem;margin-top:0.2rem;"></div>
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
            const username = usernameInput.value.trim();
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

                currentUserData = { name: name, username: username, email: email };
                overlay.classList.remove('open');
                overlay.remove();
                init();
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
                            <div id="currentPasswordError" style="color:#dc3545;font-size:0.75rem;min-height:1.1rem;margin-top:0.2rem;"></div>
                        </div>
                        <div class="form-group">
                            <label>Nueva contraseña</label>
                            <input type="password" id="newPasswordInput" />
                            <div id="newPasswordError" style="color:#dc3545;font-size:0.75rem;min-height:1.1rem;margin-top:0.2rem;"></div>
                        </div>
                        <div class="form-group">
                            <label>Confirmar nueva contraseña</label>
                            <input type="password" id="confirmPasswordInput" />
                            <div id="confirmPasswordError" style="color:#dc3545;font-size:0.75rem;min-height:1.1rem;margin-top:0.2rem;"></div>
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
            <div class="profile-bio" id="socialSearchCard" style="margin-top:1.5rem;">
                <div class="bio-header"><i class="fas fa-user-plus"></i><h3>Buscar usuarios</h3></div>
                <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
                    <input type="text" id="userSearchInput" placeholder="Buscar por nombre de usuario..." style="flex:1;padding:0.6rem 0.9rem;border-radius:10px;border:1px solid var(--border-color);outline:none;" />
                    <button class="btn btn-primary btn-sm" id="userSearchBtn"><i class="fas fa-search"></i></button>
                </div>
                <div id="userSearchResults"></div>
            </div>
            <div class="profile-bio" id="followingCard" style="margin-top:1.5rem;">
                <div class="bio-header"><i class="fas fa-users"></i><h3>Siguiendo</h3></div>
                <div id="followingList"><p style="font-size:0.85rem;color:var(--text-secondary);">Aún no sigues a nadie.</p></div>
            </div>
        `;
        profileBody.insertAdjacentHTML('beforeend', html);

        document.getElementById('userSearchBtn').addEventListener('click', handleUserSearch);
        document.getElementById('userSearchInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); handleUserSearch(); }
        });
    }

    function renderFollowingList(list) {
        const container = document.getElementById('followingList');
        if (!container) return;
        if (list.length === 0) {
            container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-secondary);">Aún no sigues a nadie.</p>';
            return;
        }
        container.innerHTML = list.map(function(u) {
            return `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid var(--border-color);">
                    <div><strong>${u.name}</strong><div style="font-size:0.8rem;color:var(--text-secondary);">@${u.username}</div></div>
                    <button class="btn btn-secondary btn-sm" onclick="toggleFollow('${u.uid}', '${u.name.replace(/'/g, "\\'")}', '${u.username}')">Dejar de seguir</button>
                </div>
            `;
        }).join('');
    }

    async function loadFollowing() {
        if (!currentUser) return;
        try {
            const snap = await get(ref(rtdb, 'users/' + currentUser.uid + '/following'));
            followingSet = new Set();
            const list = [];
            if (snap.exists()) {
                snap.forEach(function(child) {
                    followingSet.add(child.key);
                    const val = child.val();
                    list.push({ uid: child.key, name: val.name, username: val.username });
                });
            }
            renderFollowingList(list);
        } catch (err) {
            console.error('Error cargando seguidos:', err);
        }
    }

    async function loadFollowersCount() {
        if (!currentUser) return 0;
        try {
            const snap = await get(ref(rtdb, 'users/' + currentUser.uid + '/followers'));
            return snap.exists() ? Object.keys(snap.val()).length : 0;
        } catch (err) {
            console.error('Error cargando seguidores:', err);
            return 0;
        }
    }

    async function refreshFollowersCount() {
        followersCount = await loadFollowersCount();
        actualizarStats();
    }

    function renderSearchResults(results) {
        const container = document.getElementById('userSearchResults');
        if (results.length === 0) {
            container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-secondary);">No se encontraron usuarios.</p>';
            return;
        }
        container.innerHTML = results.map(function(u) {
            const isFollowing = followingSet.has(u.uid);
            return `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid var(--border-color);">
                    <div><strong>${u.name}</strong><div style="font-size:0.8rem;color:var(--text-secondary);">@${u.username}</div></div>
                    <button class="btn ${isFollowing ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="toggleFollow('${u.uid}', '${u.name.replace(/'/g, "\\'")}', '${u.username}')">${isFollowing ? 'Dejar de seguir' : 'Seguir'}</button>
                </div>
            `;
        }).join('');
    }

    async function handleUserSearch() {
        const input = document.getElementById('userSearchInput');
        const resultsContainer = document.getElementById('userSearchResults');
        const term = input.value.trim().toLowerCase();
        if (!term) { resultsContainer.innerHTML = ''; return; }

        resultsContainer.innerHTML = '<p style="font-size:0.85rem;color:var(--text-secondary);">Buscando...</p>';

        try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('username', '>=', term), where('username', '<=', term + '\uf8ff'));
            const snap = await getDocs(q);
            const results = [];
            snap.forEach(function(docSnap) {
                if (docSnap.id === currentUser.uid) return;
                const data = docSnap.data();
                results.push({ uid: docSnap.id, name: data.name, username: data.username });
            });
            renderSearchResults(results);
        } catch (err) {
            console.error('Error buscando usuarios:', err);
            resultsContainer.innerHTML = '<p style="font-size:0.85rem;color:#dc3545;">Error al buscar: ' + (err.code || err.message) + '</p>';
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
            } else {
                await set(ref(rtdb, 'users/' + currentUser.uid + '/following/' + uid), { name: name, username: username, followedAt: Date.now() });
                await set(ref(rtdb, 'users/' + uid + '/followers/' + currentUser.uid), { name: currentUserData.name, username: currentUserData.username, followedAt: Date.now() });
                followingSet.add(uid);
            }
            await loadFollowing();
            const term = document.getElementById('userSearchInput').value.trim().toLowerCase();
            if (term) handleUserSearch();
        } catch (err) {
            console.error('Error actualizando seguidor:', err);
            alert('No se pudo actualizar: ' + (err.code || err.message));
        }
    }

    window.toggleFollow = toggleFollow;

    function buildOnlineUsersCard() {
        if (document.getElementById('onlineUsersCard')) return;
        const panelGrid = document.querySelector('.panel-grid');
        if (!panelGrid) return;
        const html = `
            <div class="panel-card" id="onlineUsersCard">
                <div class="panel-card-header"><h3><i class="fas fa-circle" style="color:#2e7d32;font-size:0.6rem;"></i> Usuarios conectados</h3></div>
                <div class="panel-card-body"><div id="onlineUsersList"></div></div>
            </div>
        `;
        panelGrid.insertAdjacentHTML('beforeend', html);
    }

    function renderOnlineUsers(list) {
        const container = document.getElementById('onlineUsersList');
        if (!container) return;
        if (list.length === 0) {
            container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-secondary);padding:0.5rem 0;">No hay otros usuarios conectados ahora mismo.</p>';
            return;
        }
        container.innerHTML = list.map(function(u) {
            return `
                <div style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid var(--border-color);">
                    <span style="width:8px;height:8px;border-radius:50%;background:#2e7d32;display:inline-block;"></span>
                    <div><strong>${u.name}</strong><div style="font-size:0.8rem;color:var(--text-secondary);">@${u.username}</div></div>
                </div>
            `;
        }).join('');
    }

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
            const list = [];
            snap.forEach(function(child) {
                if (child.key !== currentUser.uid) {
                    const val = child.val();
                    list.push({ uid: child.key, name: val.name, username: val.username });
                }
            });
            renderOnlineUsers(list);
        });
    }

    function appendAssistantMessage(role, text) {
        const container = document.getElementById('assistantMessages');
        if (!container) return;
        const bubble = document.createElement('div');
        bubble.style.maxWidth = '85%';
        bubble.style.padding = '0.6rem 0.85rem';
        bubble.style.borderRadius = '12px';
        bubble.style.whiteSpace = 'pre-wrap';
        bubble.style.fontSize = '0.88rem';
        if (role === 'user') {
            bubble.style.alignSelf = 'flex-end';
            bubble.style.background = 'var(--primary, #1a2332)';
            bubble.style.color = '#fff';
        } else {
            bubble.style.alignSelf = 'flex-start';
            bubble.style.background = 'rgba(0,0,0,0.06)';
            bubble.style.color = 'var(--text-primary, #1a2332)';
        }
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

        const container = document.getElementById('assistantMessages');
        const typingBubble = document.createElement('div');
        typingBubble.id = 'assistantTyping';
        typingBubble.style.alignSelf = 'flex-start';
        typingBubble.style.color = 'var(--text-secondary, #4a5a6e)';
        typingBubble.style.fontSize = '0.8rem';
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
            <button id="assistantButton" style="position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:var(--primary, #1a2332);color:#fff;border:none;box-shadow:0 4px 16px rgba(0,0,0,0.25);cursor:pointer;font-size:1.4rem;z-index:4000;">
                <i class="fas fa-robot"></i>
            </button>
            <div id="assistantPanel" style="position:fixed;bottom:92px;right:24px;width:340px;max-width:90vw;height:460px;max-height:70vh;background:var(--card-bg, #fff);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.25);display:none;flex-direction:column;overflow:hidden;z-index:4000;border:1px solid var(--border-color, rgba(0,0,0,0.08));">
                <div style="padding:0.9rem 1rem;background:var(--primary,#1a2332);color:#fff;display:flex;justify-content:space-between;align-items:center;">
                    <strong><i class="fas fa-robot"></i> Asistente Botardo</strong>
                    <button id="assistantCloseBtn" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;">&times;</button>
                </div>
                <div id="assistantMessages" style="flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:0.6rem;"></div>
                <div style="display:flex;gap:0.5rem;padding:0.75rem;border-top:1px solid var(--border-color,rgba(0,0,0,0.08));">
                    <input type="text" id="assistantInput" placeholder="Escribe tu pregunta..." style="flex:1;padding:0.6rem 0.8rem;border-radius:10px;border:1px solid var(--border-color,rgba(0,0,0,0.1));outline:none;" />
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

    const newProjectBtn = document.getElementById('newProjectBtn');
    if (newProjectBtn) {
        newProjectBtn.addEventListener('click', function() {
            alert('Los proyectos se crean manualmente en la carpeta html/proyectos/\n\n' +
                'Para agregar un nuevo proyecto:\n' +
                '1. Crea un archivo .html en html/proyectos/\n' +
                '2. Agrega el nombre del proyecto en la lista de proyectos en config.js\n' +
                '3. Recarga la página');
        });
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
        loadFollowing();
        refreshFollowersCount();
        buildOnlineUsersCard();
        initPresence();
        buildAssistantUI();

        updateCameraStatus(false, 'Desconectada');

        const changePasswordBtn = document.getElementById('changePasswordBtn');
        if (changePasswordBtn) changePasswordBtn.addEventListener('click', openChangePasswordModal);

        const hash = window.location.hash.replace('#', '');
        if (hash) {
            const sectionMap = {
                'panel': 'section-panel',
                'perfil': 'section-perfil',
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
        resizeTimer = setTimeout(() => {}, 250);
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