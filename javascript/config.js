(function() {
    'use strict';

    // ===== perfil  =====
    let posts = [];
    let bioText = 'Aún no has agregado una descripción.';
    let statusEmoji = '😊';

    function cargarPerfil() {
        const storedPosts = localStorage.getItem('botardo_posts');
        if (storedPosts) {
            try {
                posts = JSON.parse(storedPosts);
            } catch {
                posts = [];
            }
        }

        const storedBio = localStorage.getItem('botardo_bio');
        if (storedBio) {
            bioText = storedBio;
        }

        const storedEmoji = localStorage.getItem('botardo_emoji');
        if (storedEmoji) {
            statusEmoji = storedEmoji;
        }

        renderizarPosts();
        actualizarBio();
        actualizarEmoji();
        actualizarStats();
    }

    function guardarPosts() {
        localStorage.setItem('botardo_posts', JSON.stringify(posts));
    }

    function guardarBio() {
        localStorage.setItem('botardo_bio', bioText);
    }

    function guardarEmoji() {
        localStorage.setItem('botardo_emoji', statusEmoji);
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

        grid.innerHTML = posts.map((post, index) => `
            <div class="post-card">
                <div class="post-header">
                    <span class="post-date">${post.fecha}</span>
                    <div class="post-actions">
                        <button class="btn-delete-post" onclick="eliminarPost(${index})">
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

    function actualizarStats() {
        document.getElementById('postCount').textContent = posts.length;
        document.getElementById('classCount').textContent = clases.length;
        document.getElementById('friendCount').textContent = 0;
    }

    function agregarPost(texto) {
        const ahora = new Date();
        const fecha = ahora.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        posts.unshift({ texto: texto, fecha: fecha });
        guardarPosts();
        renderizarPosts();
        actualizarStats();
    }

    function eliminarPost(index) {
        if (!confirm('¿Eliminar esta nota?')) return;
        posts.splice(index, 1);
        guardarPosts();
        renderizarPosts();
        actualizarStats();
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
            saveBioBtn.addEventListener('click', function() {
                const nuevoTexto = bioTextarea.value.trim();
                if (nuevoTexto) {
                    bioText = nuevoTexto;
                    guardarBio();
                    actualizarBio();
                    bioEdit.style.display = 'none';
                    bioTextEl.style.display = 'block';
                    editBioBtn.style.display = 'inline-block';
                } else {
                    alert('Por favor escribe algo sobre ti.');
                }
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

        cargarPerfil();
    }

    window.eliminarPost = eliminarPost;
    window.agregarPost = agregarPost;

    // ===== datos de usuario =====
    const userData = {
        name: 'Usuario',
        email: 'usuario@ejemplo.com',
        phone: '+57 300 000 0000',
        role: 'Alumno'
    };

    const proyectos = [
        { nombre: 'camara', icono: 'fa-camera', descripcion: 'Reconocimiento facial en tiempo real' }
    ];

    const materiasDisponibles = [
        'Matemáticas',
        'Español',
        'Inglés',
        'Ciencias Naturales',
        'Ciencias Sociales',
        'Educación Física',
        'Artes',
        'Música',
        'Tecnología',
        'Ética',
        'Religión',
        'Filosofía',
        'Física',
        'Química',
        'Biología',
        'Historia',
        'Geografía',
        'Recreo'
    ];

    const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const diasAbreviados = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const sections = document.querySelectorAll('.dashboard-section');
    const pageTitle = document.getElementById('pageTitle');
    const logoutBtn = document.getElementById('logoutBtn');

    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const editName = document.getElementById('editName');
    const editEmail = document.getElementById('editEmail');
    const editPhone = document.getElementById('editPhone');
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
    const themeToggle = document.getElementById('themeToggle');

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

    let clases = [];

    // ===== navegación =====
    function navigateTo(sectionId) {
        const sectionName = sectionId.replace('section-', '');
        const titles = {
            panel: 'Panel',
            perfil: 'Perfil',
            clases: 'Horario',
            camara: 'Cámara',
            proyectos: 'Proyectos',
            estadisticas: 'Estadísticas',
            configuracion: 'Configuración'
        };

        sections.forEach(s => s.classList.remove('active'));
        const target = document.getElementById(sectionId);
        if (target) target.classList.add('active');

        navLinks.forEach(link => {
            link.parentElement.classList.remove('active');
            if (link.dataset.section === sectionName) {
                link.parentElement.classList.add('active');
            }
        });

        pageTitle.textContent = titles[sectionName] || sectionName;

        if (window.innerWidth <= 768) {
            sidebar.classList.remove('open');
        }

        notifDropdown.classList.remove('open');
    }

    // ===== proyectos =====
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

    // ===== usuario =====
    function loadUserData() {
        const storedName = localStorage.getItem('botardo_user_name');
        const storedEmail = localStorage.getItem('botardo_user_email');
        const storedPhone = localStorage.getItem('botardo_user_phone');

        const name = storedName || userData.name;
        const email = storedEmail || userData.email;
        const phone = storedPhone || userData.phone;

        document.getElementById('userNameDisplay').textContent = name;
        document.getElementById('profileName').textContent = name;
        document.querySelector('.user-role').textContent = 'Alumno';
    }

    // ===== estadisticas =====
    function updateStats() {
        const now = Date.now();
        const deltaTime = (now - lastUpdateTime) / 1000;
        lastUpdateTime = now;

        recognitionCount += reconocimientosPorSegundo * deltaTime;
        if (totalReconocimientos) {
            totalReconocimientos.textContent = Math.floor(recognitionCount);
        }

        const userChange = (Math.random() - 0.48) * 0.3;
        userCount += userChange * deltaTime;
        userCount = Math.min(Math.max(userCount, 28), 58);
        if (totalUsuarios) {
            totalUsuarios.textContent = Math.round(userCount);
        }

        if (Math.random() < 0.01 * deltaTime) {
            tiempoDirection *= -1;
        }
        tiempoValue += (Math.random() * 0.02 - 0.01) * tiempoDirection * deltaTime;
        tiempoValue = Math.min(Math.max(tiempoValue, 1.8), 3.2);
        if (tiempoPromedio) {
            tiempoPromedio.textContent = tiempoValue.toFixed(1) + 's';
        }

        if (Math.random() < 0.005 * deltaTime) {
            precisionDirection *= -1;
        }
        const precisionChange = (Math.random() * 0.04 - 0.02) * precisionDirection;
        precisionValue += precisionChange * deltaTime * 0.3;
        precisionValue = Math.min(Math.max(precisionValue, 96.5), 99.2);
        if (tasaPrecision) {
            tasaPrecision.textContent = precisionValue.toFixed(1) + '%';
        }
    }

    // ===== horario  =====
    function cargarClases() {
        const stored = localStorage.getItem('botardo_clases');
        if (stored) {
            try {
                clases = JSON.parse(stored);
            } catch {
                clases = [];
            }
        } else {
            clases = [];
        }
        renderizarHorario();
    }

    function guardarClases() {
        localStorage.setItem('botardo_clases', JSON.stringify(clases));
    }

    function esRecreo(clase) {
        return clase.nombre.toLowerCase() === 'recreo';
    }

    function estaActivaAhora(clase) {
        const ahora = new Date();
        const diaActual = diasSemana[ahora.getDay() === 0 ? 6 : ahora.getDay() - 1];
        const horaActual = String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');

        if (!clase.dias.includes(diaActual)) return false;

        const [hInicio, mInicio] = clase.horaInicio.split(':').map(Number);
        const [hFin, mFin] = clase.horaFin.split(':').map(Number);
        const [hActual, mActual] = horaActual.split(':').map(Number);

        const inicioMin = hInicio * 60 + mInicio;
        const finMin = hFin * 60 + mFin;
        const actualMin = hActual * 60 + mActual;

        return actualMin >= inicioMin && actualMin <= finMin;
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
        diasConClases.forEach(dia => {
            html += `<th>${dia}</th>`;
        });
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
                                <button class="class-edit-btn" onclick="editarClase(${clase.id})"><i class="fas fa-edit"></i></button>
                                <button class="class-delete-btn" onclick="eliminarClase(${clase.id})"><i class="fas fa-trash"></i></button>
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

    function editarClase(id) {
        const clase = clases.find(c => c.id === id);
        if (!clase) return;
        abrirModal(clase);
    }

    function eliminarClase(id) {
        if (!confirm('¿Estás seguro de eliminar esta clase?')) return;
        clases = clases.filter(c => c.id !== id);
        guardarClases();
        renderizarHorario();
        agregarNotificacionSistema('Clase eliminada', `Has eliminado una clase del horario`);
    }

    // ===== notificaciones =====
    function agregarNotificacionSistema(titulo, mensaje) {
        const list = document.querySelector('#notifSistema .notif-list');
        if (!list) return;
        const emptyMsg = list.querySelector('li:only-child');
        if (emptyMsg && emptyMsg.textContent.includes('Sistema funcionando')) {
            list.innerHTML = '';
        }
        const item = document.createElement('li');
        item.className = 'notif-item unread';
        item.innerHTML = `
            <i class="fas fa-info-circle" style="color:#0d47a1;"></i>
            <div>
                <p><strong>${titulo}</strong> - ${mensaje}</p>
                <span>Hace unos segundos</span>
            </div>
        `;
        list.prepend(item);
        actualizarBadge();
    }

    function agregarNotificacionLive(titulo, mensaje) {
        const list = document.querySelector('#notifLive .notif-list');
        if (!list) return;
        const emptyMsg = list.querySelector('li:only-child');
        if (emptyMsg && emptyMsg.textContent.includes('No hay notificaciones')) {
            list.innerHTML = '';
        }
        const item = document.createElement('li');
        item.className = 'notif-item unread';
        item.innerHTML = `
            <i class="fas fa-bell" style="color:#e65100;"></i>
            <div>
                <p><strong>${titulo}</strong> - ${mensaje}</p>
                <span>Hace unos segundos</span>
            </div>
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

    // ===== modal clases =====
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

    function guardarClaseFromModal() {
        const id = parseInt(document.getElementById('modalId').value) || null;
        const nombre = document.getElementById('modalNombre').value.trim();
        const dias = Array.from(document.querySelectorAll('.day-checkbox:checked')).map(cb => cb.value);
        const horaInicio = document.getElementById('modalHoraInicio').value;
        const horaFin = document.getElementById('modalHoraFin').value;

        if (!nombre) {
            alert('Por favor ingresa el nombre.');
            return;
        }
        if (dias.length === 0) {
            alert('Selecciona al menos un día.');
            return;
        }
        if (!horaInicio || !horaFin) {
            alert('Selecciona la hora de inicio y fin.');
            return;
        }
        if (horaInicio >= horaFin) {
            alert('La hora de inicio debe ser menor que la hora de finalización.');
            return;
        }

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
            id: id || Date.now(),
            nombre: nombre,
            icono: style.icono,
            color: style.color,
            colorText: style.colorText,
            dias: dias,
            horaInicio: horaInicio,
            horaFin: horaFin
        };

        if (id) {
            const index = clases.findIndex(c => c.id === id);
            if (index !== -1) {
                clases[index] = claseData;
                agregarNotificacionSistema('Actualizado', `Has actualizado "${nombre}"`);
            }
        } else {
            clases.push(claseData);
            agregarNotificacionSistema('Nuevo', `Has agregado "${nombre}" al horario`);
        }

        guardarClases();
        renderizarHorario();
        cerrarModal();
    }

    function initClases() {
        if (!document.getElementById('modalOverlay')) {
            crearModal();
        }

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
        const horaActual = String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
        const diaActual = diasSemana[ahora.getDay() === 0 ? 6 : ahora.getDay() - 1];
        const horaActualMin = parseInt(horaActual.replace(':', ''));

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

            if (diffInicio <= 0 && diffFin > 0) {
                if (Math.random() < 0.1) {
                    const emoji = esRecreo(clase) ? '☕' : '📚';
                    agregarNotificacionLive(`${emoji} En curso`, `"${clase.nombre}" está en progreso`);
                }
            }
        });

        renderizarHorario();
    }

    // ===== eventos =====
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
                localStorage.removeItem('botardo_remember');
                localStorage.removeItem('botardo_email');
                window.location.href = '../html/login.html';
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

        const markAllBtn = document.querySelectorAll('.notif-mark-all');
        markAllBtn.forEach(btn => {
            btn.addEventListener('click', function() {
                const panel = this.closest('.notif-panel');
                if (panel) {
                    panel.querySelectorAll('.notif-item.unread').forEach(item => {
                        item.classList.remove('unread');
                    });
                }
                actualizarBadge();
            });
        });
    }

    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', function() {
            const name = editName.value.trim();
            const email = editEmail.value.trim();
            const phone = editPhone.value.trim();

            if (!name || !email) {
                alert('Por favor completa los campos obligatorios.');
                return;
            }

            if (!email.includes('@')) {
                alert('Por favor ingresa un correo válido.');
                return;
            }

            localStorage.setItem('botardo_user_name', name);
            localStorage.setItem('botardo_user_email', email);
            localStorage.setItem('botardo_user_phone', phone);

            document.getElementById('userNameDisplay').textContent = name;
            document.getElementById('profileName').textContent = name;
            document.getElementById('profileEmail').textContent = email;

            alert('¡Perfil actualizado correctamente!');
        });
    }

    // ===== camara =====
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
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
                stream = null;
            }

            const constraints = {
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

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

            setTimeout(() => {
                if (cameraActive) {
                    cameraResult.style.display = 'block';
                }
            }, 2000);

        } catch (err) {
            console.error('Error al iniciar cámara:', err);
            alert('No se pudo acceder a la cámara. Por favor, verifica los permisos.');
            updateCameraStatus(false, 'Error');
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
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
            if (cameraActive) {
                stopCamera();
            } else {
                startCamera();
            }
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

            if (facingMode === 'user') {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);

            const link = document.createElement('a');
            link.download = `captura_${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            cameraResult.style.display = 'block';
            cameraResult.querySelector('.result-content span').textContent =
                `Captura #${captureCount} guardada correctamente`;
        });
    }

    if (switchCameraBtn) {
        switchCameraBtn.addEventListener('click', function() {
            facingMode = facingMode === 'user' ? 'environment' : 'user';
            if (cameraActive) {
                startCamera();
            }
        });
    }

    // ===== tema oscuro =====
    let darkMode = false;

    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            darkMode = !darkMode;
            if (darkMode) {
                document.documentElement.style.setProperty('--bg-main', '#0f0f1a');
                document.documentElement.style.setProperty('--card-bg', 'rgba(30, 30, 50, 0.85)');
                document.documentElement.style.setProperty('--text-primary', '#e8e8f0');
                document.documentElement.style.setProperty('--text-secondary', '#f3efee');
                document.documentElement.style.setProperty('--border-color', 'rgba(255,255,255,0.06)');
                this.textContent = 'Modo claro';
            } else {
                document.documentElement.style.setProperty('--bg-main', '#005ae0');
                document.documentElement.style.setProperty('--card-bg', 'rgba(255,255,255,0.85)');
                document.documentElement.style.setProperty('--text-primary', '#1a2332');
                document.documentElement.style.setProperty('--text-secondary', '#4a5a6e');
                document.documentElement.style.setProperty('--border-color', 'rgba(0,0,0,0.06)');
                this.textContent = 'Cambiar tema';
            }
        });
    }

    // ===== proyectos =====
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

    // ===== funciones globales =====
    window.editarClase = editarClase;
    window.eliminarClase = eliminarClase;
    window.abrirModal = abrirModal;
    window.cerrarModal = cerrarModal;
    window.guardarClaseFromModal = guardarClaseFromModal;
    window.eliminarPost = eliminarPost;
    window.agregarPost = agregarPost;

    // ===== init =====
    function init() {
        loadUserData();
        loadProjects();
        initClases();
        initPerfil();

        updateCameraStatus(false, 'Desconectada');

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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();