import { auth, db, rtdb, ai, onAuthStateChanged, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider, doc, getDoc, setDoc, collection, query, where, getDocs, arrayUnion, ref, set, get, update, remove, push, onValue, off, onDisconnect, getGenerativeModel } from './firebase-config.js';

(function() {
    'use strict';

    let currentUser = null;
    let currentUserData = null;
    let notifSettings = { live: true, sistema: true };

    let posts = [];
    let bioText = 'Aún no has agregado una descripción.';
    // '😶' = "sin reacción": el emoji por defecto hasta que la persona
    // gire la ruleta al menos una vez. No es un premio posible de la
    // ruleta, así que siempre se nota que todavía no ha girado.
    let statusEmoji = '😶';
    const EMOJI_SIN_REACCION = '😶';

    // Ruleta de emoji: entre más abajo en la lista, más raro (y más
    // "exclusiva" hace ver la cuenta). El primero tiene ~70% de
    // probabilidad; el resto va bajando cada vez más fuerte.
    const EMOJIS_RULETA = [
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

    const MAX_GIROS_EMOJI_POR_DIA = 3;
    let emojiGiroUsage = { fecha: '', cantidad: 0 };
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
    let contactAvatars = {};
    let attachedChatListeners = new Set();
    let userStats = { loginCount: 0, exportCount: 0, aiMessages: 0, aiChats: 0, lastLogin: null };
    let apariencia = { tema: 'claro', acento: '#1a2332' };
    let perfilImagenes = {
        banner: { tipo: 'default', valor: null, posX: 50, posY: 50 },
        avatar: { tipo: 'default', valor: null, posX: 50, posY: 50 }
    };
    let aiChatsList = [];
    let currentAiChatId = null;
    let aiDailyUsage = { fecha: '', count: 0 };
    const AI_DAILY_LIMIT = 5;
    let viewingProfileUid = null;
    let viewingProfileData = null;
    let activeProfileTab = 'publicaciones';

    // Igual que en login.js: genera un ID único para cuentas que todavía no
    // tengan uno (por ejemplo cuentas creadas antes de este cambio).
    function generarBotardoId() {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // --- Ofuscación visual del ID único ---
    // Importante: esto NO es un cifrado a prueba de expertos en seguridad.
    // Es una capa de privacidad visual para que el ID no quede expuesto
    // "a simple vista" en la pantalla ni se pueda leer por encima del
    // hombro; el dato en sí ya está protegido porque Firestore solo debe
    // permitir que cada usuario lea su propio documento (reglas de
    // seguridad del lado de Firebase). Para este proyecto de colegio es
    // suficiente y evita depender de un backend propio.
    const BOTARDO_ID_KEY = 'BotardoFaceApp2026';
    function ofuscarId(texto) {
        let resultado = '';
        for (let i = 0; i < texto.length; i++) {
            const codigo = texto.charCodeAt(i) ^ BOTARDO_ID_KEY.charCodeAt(i % BOTARDO_ID_KEY.length);
            resultado += String.fromCharCode(codigo);
        }
        return btoa(unescape(encodeURIComponent(resultado)));
    }
    function desofuscarId(textoOfuscado) {
        try {
            const decodificado = decodeURIComponent(escape(atob(textoOfuscado)));
            let resultado = '';
            for (let i = 0; i < decodificado.length; i++) {
                const codigo = decodificado.charCodeAt(i) ^ BOTARDO_ID_KEY.charCodeAt(i % BOTARDO_ID_KEY.length);
                resultado += String.fromCharCode(codigo);
            }
            return resultado;
        } catch (e) {
            return null;
        }
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function(c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // --- Pantalla de carga ---
    // Se queda tapando el dashboard hasta que confirmamos que la sesión
    // y los datos del usuario ya están listos, para no dejar ver el
    // panel "vacío" (usuario en blanco, avatar por defecto) mientras
    // Firebase todavía está resolviendo todo.
    function marcarPasoCarga(paso, estado) {
        const li = document.querySelector('#appLoaderSteps li[data-step="' + paso + '"]');
        if (!li) return;
        const icon = li.querySelector('i');
        if (estado === 'active') {
            li.classList.add('active');
            li.classList.remove('done');
            if (icon) icon.className = 'fas fa-circle-notch fa-spin';
        } else if (estado === 'done') {
            li.classList.remove('active');
            li.classList.add('done');
            if (icon) icon.className = 'fas fa-check';
        }
    }

    function actualizarTextoCarga(texto) {
        const el = document.getElementById('appLoaderText');
        if (el) el.textContent = texto;
    }

    let appLoaderOculto = false;
    function ocultarAppLoader() {
        if (appLoaderOculto) return;
        appLoaderOculto = true;
        const loader = document.getElementById('appLoader');
        if (!loader) return;
        loader.classList.add('app-loader-hidden');
        setTimeout(function() {
            if (loader.parentNode) loader.parentNode.removeChild(loader);
        }, 500);
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
            'section-camara': 'Salón',
            'section-proyectos': 'Proyectos',
            'section-estadisticas': 'Estadísticas',
            'section-configuracion': 'Configuración'
        };
        if (pageTitle && titles[sectionId]) pageTitle.textContent = titles[sectionId];

        if (sectionId === 'section-configuracion') actualizarNotasCambioNombreUsuario();

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
        if (userNameDisplay) {
            userNameDisplay.textContent = data.name;
            userNameDisplay.title = data.name;
        }

        const profileNameEl = document.getElementById('profileName');
        if (profileNameEl) profileNameEl.textContent = data.name;

        const profileUsernameEl = document.getElementById('profileUsername');
        if (profileUsernameEl) profileUsernameEl.textContent = '@' + data.username;

        const profileEmailEl = document.getElementById('profileEmail');
        if (profileEmailEl) profileEmailEl.textContent = data.email;

        const userRoleEl = document.querySelector('.user-role');
        if (userRoleEl) userRoleEl.textContent = 'Alumno';

        const metaRow = document.getElementById('profileMetaRow');
        const colegioChip = document.getElementById('profileColegioChip');
        const colegioTexto = document.getElementById('profileColegioTexto');
        const gradoChip = document.getElementById('profileGradoChip');
        const gradoTexto = document.getElementById('profileGradoTexto');
        const tieneColegio = !!data.colegio;
        const tieneGrado = !!data.grado;
        if (colegioChip) colegioChip.style.display = tieneColegio ? 'inline-flex' : 'none';
        if (colegioTexto) colegioTexto.textContent = data.colegio || '--';
        if (gradoChip) gradoChip.style.display = tieneGrado ? 'inline-flex' : 'none';
        if (gradoTexto) gradoTexto.textContent = data.grado || '--';
        if (metaRow) metaRow.style.display = (tieneColegio || tieneGrado) ? 'flex' : 'none';

        const ownerIdValueEl = document.getElementById('profileOwnerIdValue');
        if (ownerIdValueEl) {
            ownerIdValueEl.textContent = '••••••••••••';
            ownerIdValueEl.dataset.revealed = 'false';
            ownerIdValueEl.dataset.idOfuscado = data.botardoId ? ofuscarId(data.botardoId) : '';
        }
    }

    function initIdUnico() {
        const revealBtn = document.getElementById('revealOwnerIdBtn');
        const valueEl = document.getElementById('profileOwnerIdValue');
        if (!revealBtn || !valueEl) return;
        revealBtn.addEventListener('click', function() {
            const yaVisible = valueEl.dataset.revealed === 'true';
            if (yaVisible) {
                valueEl.textContent = '••••••••••••';
                valueEl.dataset.revealed = 'false';
                revealBtn.innerHTML = '<i class="fas fa-eye"></i> Ver';
                return;
            }
            if (!confirm('¿Seguro que quieres ver tu ID único? No lo compartas con nadie: es personal e intransferible.')) return;
            const ofuscado = valueEl.dataset.idOfuscado;
            const real = ofuscado ? desofuscarId(ofuscado) : (currentUserData && currentUserData.botardoId);
            valueEl.textContent = real || 'No disponible';
            valueEl.dataset.revealed = 'true';
            revealBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Ocultar';
        });
    }

    // --- Colegio y grado ---
    // Los "colegios" y sus "grados" no son una lista fija: cualquier
    // usuario puede crear su colegio y sus grados la primera vez que los
    // necesite (por ejemplo, el primer alumno de un colegio nuevo los
    // registra, y luego el resto de compañeros del mismo colegio los ven
    // en el desplegable). El grado del usuario solo se puede guardar una
    // vez; después queda bloqueado.
    let colegiosCache = [];

    function slugColegio(nombre) {
        return nombre.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || ('colegio-' + Date.now());
    }

    // Compara nombres de colegio/grado sin importar mayúsculas, tildes
    // ni espacios extra, para no crear duplicados como "Colegio San
    // José" y "colegio san jose" cuando el estudiante escribe libremente.
    function normalizarTextoComparacion(texto) {
        return String(texto || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async function cargarColegios() {
        try {
            const snap = await getDocs(collection(db, 'colegios'));
            colegiosCache = [];
            snap.forEach(function(d) {
                colegiosCache.push({ id: d.id, nombre: d.data().nombre, grados: d.data().grados || [] });
            });
            colegiosCache.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
        } catch (err) {
            console.error('Error cargando colegios:', err);
        }
    }

    // El colegio y el grado ahora son campos de texto libre (el
    // estudiante los escribe directamente, no elige de una lista). Los
    // <datalist> solo sirven como sugerencia opcional para evitar
    // duplicados por error de tipeo; el estudiante puede escribir lo que
    // quiera y, si el colegio no existe todavía, se crea automáticamente.
    function renderColegiosDatalist() {
        const dl = document.getElementById('colegiosSugeridos');
        if (!dl) return;
        dl.innerHTML = colegiosCache.map(function(c) {
            return `<option value="${escapeHtml(c.nombre)}"></option>`;
        }).join('');
    }

    function renderGradosDatalistParaColegio(nombreColegio) {
        const dl = document.getElementById('gradosSugeridos');
        if (!dl) return;
        const norm = normalizarTextoComparacion(nombreColegio);
        const colegio = norm ? colegiosCache.find(function(c) { return normalizarTextoComparacion(c.nombre) === norm; }) : null;
        dl.innerHTML = colegio ? colegio.grados.map(function(g) {
            return `<option value="${escapeHtml(g)}"></option>`;
        }).join('') : '';
    }

    function actualizarNotaGrado() {
        const note = document.getElementById('gradoNote');
        const guardarBtn = document.getElementById('guardarGradoBtn');
        const inputColegioEl = document.getElementById('inputColegio');
        const inputGradoEl = document.getElementById('inputGrado');
        const yaSeCambio = !!(currentUserData && currentUserData.gradoChanged);
        if (note) {
            note.innerHTML = yaSeCambio
                ? `Ya elegiste tu grado y no se puede volver a cambiar. Si te equivocaste, escribe a <a href="mailto:${SOPORTE_EMAIL}">soporte</a>.`
                : 'Podrás escribir tu colegio y tu grado una sola vez. Revísalo bien antes de guardar.';
        }
        if (guardarBtn) guardarBtn.disabled = yaSeCambio;
        if (inputColegioEl) inputColegioEl.disabled = yaSeCambio;
        if (inputGradoEl) inputGradoEl.disabled = yaSeCambio;
    }

    async function guardarColegioGradoUsuario(colegioNombre, gradoNombre) {
        await setDoc(doc(db, 'users', currentUser.uid), {
            colegio: colegioNombre,
            grado: gradoNombre,
            gradoChanged: true
        }, { merge: true });
        currentUserData.colegio = colegioNombre;
        currentUserData.grado = gradoNombre;
        currentUserData.gradoChanged = true;
        loadUserData();
        actualizarNotaGrado();
        cargarAsistenciasSalon();
    }

    async function initGradoColegio() {
        await cargarColegios();
        renderColegiosDatalist();

        const inputColegioEl = document.getElementById('inputColegio');
        const inputGradoEl = document.getElementById('inputGrado');
        const guardarBtn = document.getElementById('guardarGradoBtn');

        if (inputColegioEl) {
            inputColegioEl.value = (currentUserData && currentUserData.colegio) || '';
            renderGradosDatalistParaColegio(inputColegioEl.value);
            inputColegioEl.addEventListener('input', function() {
                renderGradosDatalistParaColegio(inputColegioEl.value);
            });
        }
        if (inputGradoEl) {
            inputGradoEl.value = (currentUserData && currentUserData.grado) || '';
        }

        if (guardarBtn) {
            guardarBtn.addEventListener('click', async function() {
                if (currentUserData && currentUserData.gradoChanged) {
                    alert(`Ya elegiste tu grado. Escribe a ${SOPORTE_EMAIL} para cambiarlo.`);
                    return;
                }
                const colegioTexto = inputColegioEl ? inputColegioEl.value.trim() : '';
                const gradoTexto = inputGradoEl ? inputGradoEl.value.trim() : '';
                if (!colegioTexto || !gradoTexto) {
                    alert('Escribe tu colegio y tu grado antes de guardar.');
                    return;
                }
                if (!confirm(`¿Seguro que quieres guardar "${gradoTexto}" en "${colegioTexto}" como tu grado? Solo podrás hacerlo una vez; para cambios futuros tendrás que contactar a soporte.`)) return;

                guardarBtn.disabled = true;
                try {
                    const normColegio = normalizarTextoComparacion(colegioTexto);
                    const colegioExistente = colegiosCache.find(function(c) { return normalizarTextoComparacion(c.nombre) === normColegio; });

                    if (colegioExistente) {
                        const normGrado = normalizarTextoComparacion(gradoTexto);
                        const gradoExistente = colegioExistente.grados.find(function(g) { return normalizarTextoComparacion(g) === normGrado; });
                        const gradoFinal = gradoExistente || gradoTexto;
                        if (!gradoExistente) {
                            await setDoc(doc(db, 'colegios', colegioExistente.id), { grados: arrayUnion(gradoTexto) }, { merge: true });
                            colegioExistente.grados.push(gradoTexto);
                        }
                        await guardarColegioGradoUsuario(colegioExistente.nombre, gradoFinal);
                    } else {
                        const id = slugColegio(colegioTexto);
                        await setDoc(doc(db, 'colegios', id), { nombre: colegioTexto, grados: [gradoTexto] });
                        colegiosCache.push({ id: id, nombre: colegioTexto, grados: [gradoTexto] });
                        colegiosCache.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
                        await guardarColegioGradoUsuario(colegioTexto, gradoTexto);
                    }
                    alert('Tu colegio y tu grado se guardaron correctamente.');
                } catch (err) {
                    console.error('Error guardando grado:', err);
                    alert('No se pudo guardar: ' + (err.code || err.message));
                    guardarBtn.disabled = false;
                }
            });
        }

        actualizarNotaGrado();
    }

    // --- Integración con Spotify ---
    //
    // Usa el flujo "Authorization Code with PKCE", pensado exactamente
    // para apps que corren solo en el navegador: NO necesita el Client
    // Secret (por eso no aparece aquí — si ya lo compartiste en algún
    // lado, ve a tu Dashboard de Spotify for Developers y dale a
    // "regenerar" para invalidarlo, aunque con PKCE ni siquiera lo vas a
    // usar). Solo hace falta el Client ID, que sí es seguro tenerlo
    // visible en el código del navegador.
    //
    // Los tokens (access_token y refresh_token) se guardan en
    // localStorage del navegador para no tener que volver a pedir el
    // login en esa misma sesión/dispositivo, y el refresh_token también
    // se guarda en el documento del usuario en Firestore, para que si
    // entra desde otro dispositivo/navegador no tenga que autorizar de
    // nuevo: el refresh_token de Firestore se usa para pedir un
    // access_token nuevo automáticamente y en silencio.
    const SPOTIFY_CLIENT_ID = 'cbb396e04ba040d2a7cb2c44078071be';
    // Antes esto era un texto fijo apuntando siempre a producción
    // (botardoface.pages.dev). El problema: Spotify SIEMPRE redirige a
    // esa URL fija sin importar desde dónde abriste la app, así que si
    // estabas probando en localhost/Live Server, el popup terminaba
    // cargando el sitio EN PRODUCCIÓN (con el código que esté publicado
    // ahí, no tus cambios locales) — por eso parecía que "abría el
    // dashboard de nuevo" en vez de la pantalla de Spotify. Ahora se arma
    // según el dominio actual, así funciona igual en local y en
    // producción, siempre y cuando esa URL esté agregada en la lista de
    // "Redirect URIs" de tu app en el Dashboard de Spotify for
    // Developers (Settings de tu app → Redirect URIs → Add).
    const SPOTIFY_REDIRECT_URI = window.location.origin + '/html/dashboard';
    const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state';
    const SPOTIFY_LS_KEY = 'botardo_spotify_tokens';
    // Antes se guardaba en sessionStorage, pero la ventana emergente de
    // conexión es una ventana/pestaña aparte con su propio sessionStorage,
    // así que usamos localStorage (compartido entre ventanas del mismo
    // sitio) para que el intercambio de tokens funcione desde el popup.
    const SPOTIFY_VERIFIER_KEY = 'botardo_spotify_verifier';
    const SPOTIFY_POPUP_NAME = 'botardo_spotify_popup';
    // Valor que mandamos como "state" de OAuth y que Spotify nos
    // devuelve intacto en la URL de vuelta. Es la forma confiable de
    // saber "esta carga de la página es el popup de conexión": algunos
    // navegadores rompen la relación window.opener/window.name cuando la
    // ventana pasa por un dominio externo (Spotify) antes de volver, así
    // que no podemos depender solo de eso.
    const SPOTIFY_STATE_POPUP = 'botardo_popup_v1';

    // Se calcula una sola vez, apenas se carga el script, leyendo la URL
    // tal como llegó (antes de que la limpiemos). Detecta si esta carga
    // de la página es la ventana emergente que abrimos para conectar
    // Spotify (en vez de la pestaña principal del sitio). Así esa
    // ventana solo hace el intercambio de tokens y se cierra sola, sin
    // volver a montar todo el dashboard ni recargar el sitio principal.
    const ES_VENTANA_EMERGENTE_SPOTIFY = (function() {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('state') === SPOTIFY_STATE_POPUP) return true;
        } catch (e) { /* ignorar */ }
        try {
            return !!(window.opener && window.opener !== window && window.name === SPOTIFY_POPUP_NAME);
        } catch (e) {
            return false;
        }
    })();

    function mostrarMensajePopupSpotify(texto) {
        document.body.innerHTML = `
            <div class="spotify-popup-message">
                <i class="fab fa-spotify"></i>
                <p>${escapeHtml(texto)}</p>
            </div>
        `;
    }

    // MUY IMPORTANTE: la conexión de Spotify tiene que quedar ligada a
    // la CUENTA de Botardo Face (currentUser.uid), no al navegador.
    // Antes se guardaba en una sola llave fija de localStorage, así que
    // si en el mismo navegador entrabas con otra cuenta, esa cuenta
    // "heredaba" la conexión de Spotify de la cuenta anterior sin haberla
    // conectado de verdad. Por eso el nombre de la llave incluye el uid
    // del usuario que inició sesión.
    function claveTokensSpotifyLocal() {
        const uid = currentUser ? currentUser.uid : 'sin-sesion';
        return SPOTIFY_LS_KEY + ':' + uid;
    }

    // Limpieza única de la llave vieja (compartida entre cuentas) que
    // pudo haber quedado guardada en el navegador con versiones
    // anteriores de la app.
    (function limpiarTokenSpotifyLegado() {
        try { localStorage.removeItem(SPOTIFY_LS_KEY); } catch (e) { /* ignorar */ }
    })();

    function base64UrlEncode(bytes) {
        let binary = '';
        bytes.forEach(function(b) { binary += String.fromCharCode(b); });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function generarSpotifyCodeVerifier() {
        const array = new Uint8Array(64);
        crypto.getRandomValues(array);
        return base64UrlEncode(array);
    }

    async function generarSpotifyCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return base64UrlEncode(new Uint8Array(digest));
    }

    function leerTokensSpotifyLocal() {
        try {
            const raw = localStorage.getItem(claveTokensSpotifyLocal());
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function guardarTokensSpotifyLocal(tokens) {
        try {
            localStorage.setItem(claveTokensSpotifyLocal(), JSON.stringify(tokens));
        } catch (e) {
            console.error('No se pudo guardar el token de Spotify localmente:', e);
        }
    }

    function borrarTokensSpotifyLocal() {
        try { localStorage.removeItem(claveTokensSpotifyLocal()); } catch (e) { /* ignorar */ }
    }

    async function guardarRefreshTokenEnFirestore(refreshToken) {
        if (!currentUser) return;
        try {
            await setDoc(doc(db, 'users', currentUser.uid), { spotifyRefreshToken: refreshToken }, { merge: true });
            if (currentUserData) currentUserData.spotifyRefreshToken = refreshToken;
        } catch (err) {
            console.error('Error guardando refresh token de Spotify:', err);
        }
    }

    async function iniciarConexionSpotify() {
        const verifier = generarSpotifyCodeVerifier();
        const challenge = await generarSpotifyCodeChallenge(verifier);
        localStorage.setItem(SPOTIFY_VERIFIER_KEY, verifier);

        const baseParams = {
            client_id: SPOTIFY_CLIENT_ID,
            response_type: 'code',
            redirect_uri: SPOTIFY_REDIRECT_URI,
            code_challenge_method: 'S256',
            code_challenge: challenge,
            scope: SPOTIFY_SCOPES
        };
        // La versión "popup" lleva un state especial para que, al volver,
        // sepamos con certeza que esa carga es la ventana emergente (ver
        // ES_VENTANA_EMERGENTE_SPOTIFY más arriba). La versión "directa"
        // NO lo lleva, porque esa es para cuando el navegador bloqueó el
        // popup y la pestaña principal navega de verdad: si le pusiéramos
        // el mismo state, la pestaña principal se confundiría pensando
        // que ES el popup.
        const authUrlPopup = 'https://accounts.spotify.com/authorize?' +
            new URLSearchParams(Object.assign({}, baseParams, { state: SPOTIFY_STATE_POPUP })).toString();
        const authUrlDirecta = 'https://accounts.spotify.com/authorize?' +
            new URLSearchParams(baseParams).toString();

        // Abrimos Spotify en una ventana flotante en vez de navegar la
        // pestaña principal, para que el sitio nunca se recargue ni
        // pierda dónde estabas.
        const ancho = 480, alto = 720;
        const left = Math.max(0, Math.round((window.screen.width - ancho) / 2));
        const top = Math.max(0, Math.round((window.screen.height - alto) / 2));
        const popup = window.open(
            authUrlPopup,
            SPOTIFY_POPUP_NAME,
            `width=${ancho},height=${alto},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );

        if (!popup) {
            // El navegador bloqueó la ventana emergente: usamos la
            // redirección de página completa como respaldo.
            window.location.href = authUrlDirecta;
            return;
        }

        const vigilancia = setInterval(function() {
            if (popup.closed) {
                clearInterval(vigilancia);
                actualizarUISpotifyConexion();
            }
        }, 700);
    }

    async function intercambiarCodigoSpotify(code) {
        const verifier = localStorage.getItem(SPOTIFY_VERIFIER_KEY);
        if (!verifier) return false;
        try {
            const body = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: SPOTIFY_REDIRECT_URI,
                client_id: SPOTIFY_CLIENT_ID,
                code_verifier: verifier
            });
            const resp = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error_description || data.error || 'Error desconocido');

            const tokens = {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: Date.now() + (data.expires_in * 1000)
            };
            guardarTokensSpotifyLocal(tokens);
            if (data.refresh_token) await guardarRefreshTokenEnFirestore(data.refresh_token);
            localStorage.removeItem(SPOTIFY_VERIFIER_KEY);
            return true;
        } catch (err) {
            console.error('Error conectando con Spotify:', err);
            if (!ES_VENTANA_EMERGENTE_SPOTIFY) alert('No se pudo conectar con Spotify: ' + err.message);
            return false;
        }
    }

    async function refrescarTokenSpotify(refreshToken) {
        try {
            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: SPOTIFY_CLIENT_ID
            });
            const resp = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error_description || data.error || 'Error desconocido');

            const tokens = {
                access_token: data.access_token,
                // Spotify no siempre devuelve un refresh_token nuevo; si no
                // viene, seguimos usando el que ya teníamos.
                refresh_token: data.refresh_token || refreshToken,
                expires_at: Date.now() + (data.expires_in * 1000)
            };
            guardarTokensSpotifyLocal(tokens);
            if (data.refresh_token) await guardarRefreshTokenEnFirestore(data.refresh_token);
            return tokens.access_token;
        } catch (err) {
            console.error('Error refrescando token de Spotify:', err);
            return null;
        }
    }

    // Devuelve un access_token válido sin volver a pedirle nada al
    // usuario, a menos que nunca haya conectado su cuenta. Este es el
    // punto clave que evita el bug de "me lo pide siempre": primero mira
    // localStorage, y si el access_token ya expiró usa el refresh_token
    // (de localStorage o, si no hay, el que quedó guardado en su cuenta
    // de Firestore) para conseguir uno nuevo en silencio.
    async function obtenerAccessTokenSpotifyValido() {
        let tokens = leerTokensSpotifyLocal();

        if (tokens && tokens.access_token && tokens.expires_at > Date.now() + 5000) {
            return tokens.access_token;
        }

        const refreshToken = (tokens && tokens.refresh_token) || (currentUserData && currentUserData.spotifyRefreshToken);
        if (refreshToken) {
            return await refrescarTokenSpotify(refreshToken);
        }

        return null;
    }

    function estaSpotifyConectado() {
        const tokens = leerTokensSpotifyLocal();
        return !!((tokens && tokens.refresh_token) || (currentUserData && currentUserData.spotifyRefreshToken));
    }

    async function desconectarSpotify() {
        if (!confirm('¿Quieres desconectar tu cuenta de Spotify?')) return;
        borrarTokensSpotifyLocal();
        if (currentUserData) currentUserData.spotifyRefreshToken = null;
        // Reflejamos el cambio en la interfaz de inmediato, sin esperar
        // a que terminen las peticiones a Firestore/Realtime Database.
        actualizarUISpotifyConexion();
        pintarSpotifyNowPlaying(null);
        if (spotifyPollInterval) clearInterval(spotifyPollInterval);
        try {
            await setDoc(doc(db, 'users', currentUser.uid), { spotifyRefreshToken: null }, { merge: true });
        } catch (err) {
            console.error('Error desconectando Spotify:', err);
        }
        try { await set(ref(rtdb, 'spotifyNowPlaying/' + currentUser.uid), null); } catch (e) { /* ignorar */ }
    }

    function actualizarUISpotifyConexion() {
        const connectBtn = document.getElementById('spotifyConnectBtn');
        const connectedLabel = document.getElementById('spotifyConnectedLabel');
        const conectado = estaSpotifyConectado();
        if (connectBtn) connectBtn.style.display = conectado ? 'none' : 'inline-flex';
        if (connectedLabel) connectedLabel.style.display = conectado ? 'inline-flex' : 'none';
    }

    // Cada cierto tiempo consulta qué está sonando en la cuenta de
    // Spotify del usuario (si conectó una) y lo publica en la Realtime
    // Database, en el mismo estilo que la presencia "en línea" que ya
    // existe en la app. Así, cualquiera que vea su perfil (siguiendo el
    // mismo esquema de permisos que el resto del perfil) puede ver en
    // vivo qué está escuchando, sin que su navegador necesite el token
    // de Spotify de nadie más.
    async function actualizarSpotifyNowPlaying() {
        if (!currentUser || !estaSpotifyConectado()) return;
        const token = await obtenerAccessTokenSpotifyValido();
        if (!token) return;

        try {
            const resp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: { Authorization: 'Bearer ' + token }
            });

            const miNowPlayingRef = ref(rtdb, 'spotifyNowPlaying/' + currentUser.uid);

            if (resp.status === 204 || resp.status === 202) {
                await set(miNowPlayingRef, null);
                return;
            }
            if (!resp.ok) return;

            const data = await resp.json();
            if (!data || !data.item || !data.is_playing) {
                await set(miNowPlayingRef, null);
                return;
            }

            const imagenes = (data.item.album && data.item.album.images) || [];
            await set(miNowPlayingRef, {
                cancion: data.item.name,
                artista: (data.item.artists || []).map(function(a) { return a.name; }).join(', '),
                imagen: imagenes.length ? imagenes[imagenes.length - 1].url : null,
                progresoMs: data.progress_ms || 0,
                duracionMs: data.item.duration_ms || 0,
                actualizadoEn: Date.now()
            });
            // Antes se borraba automáticamente apenas cerrabas la pestaña
            // (onDisconnect().remove()). Ahora se deja la última canción
            // guardada tal cual: si cierras la app, tu perfil sigue
            // mostrando lo último que estabas escuchando en vez de
            // quedar vacío. Como no hay nada corriendo en segundo plano
            // que la siga actualizando mientras no tengas la app abierta,
            // pintarSpotifyNowPlaying() la marca como "última vez" pasado
            // un rato, para no dar a entender que sigue sonando en vivo.
        } catch (err) {
            console.error('Error consultando reproducción actual de Spotify:', err);
        }
    }

    let spotifyPollInterval = null;
    let nowPlayingListenerRef = null;

    // Si la última actualización es reciente (la app sigue abierta en
    // algún lado, o se cerró hace muy poco) se muestra como "en vivo"
    // con el ecualizador animado. Si ya pasó un rato, se seguimos
    // mostrando la canción (ya no se borra sola) pero como "última vez",
    // sin el pulso animado, para ser honestos con quien lo ve.
    const SPOTIFY_NOW_PLAYING_LIVE_MS = 60 * 1000;

    function formatoTiempoTranscurrido(ms) {
        const segundos = Math.floor(ms / 1000);
        if (segundos < 60) return 'hace un momento';
        const minutos = Math.floor(segundos / 60);
        if (minutos < 60) return `hace ${minutos} min`;
        const horas = Math.floor(minutos / 60);
        if (horas < 24) return `hace ${horas} h`;
        const dias = Math.floor(horas / 24);
        return `hace ${dias} d`;
    }

    function formatoMinutosSegundos(ms) {
        const totalSeg = Math.max(0, Math.floor(ms / 1000));
        const min = Math.floor(totalSeg / 60);
        const seg = totalSeg % 60;
        return min + ':' + String(seg).padStart(2, '0');
    }

    let spotifyProgressTicker = null;

    // El disco de vinilo y la barrita de progreso solo se muestran
    // mientras la canción se considera "en vivo" (esReciente); si no,
    // se quedan quietos para no aparentar que sigue sonando.
    function actualizarProgresoSpotify(data, esReciente) {
        const wrap = document.getElementById('spotifyProgressWrap');
        const fill = document.getElementById('spotifyProgressFill');
        const actualEl = document.getElementById('spotifyProgressCurrent');
        const totalEl = document.getElementById('spotifyProgressTotal');
        if (!wrap || !fill || !actualEl || !totalEl) return;

        if (!data || !data.duracionMs || !esReciente) {
            wrap.style.display = 'none';
            return;
        }

        const transcurridoDesdeUpdate = Date.now() - (data.actualizadoEn || 0);
        const progresoEstimado = Math.min(data.duracionMs, (data.progresoMs || 0) + transcurridoDesdeUpdate);
        const pct = Math.min(100, (progresoEstimado / data.duracionMs) * 100);

        wrap.style.display = 'flex';
        fill.style.width = pct + '%';
        actualEl.textContent = formatoMinutosSegundos(progresoEstimado);
        totalEl.textContent = formatoMinutosSegundos(data.duracionMs);
    }

    function pintarSpotifyNowPlaying(data) {
        const bloque = document.getElementById('profileSpotifyNow');
        const texto = document.getElementById('profileSpotifyNowText');
        const vinilo = document.getElementById('spotifyVinyl');
        const viniloArt = document.getElementById('spotifyVinylArt');
        if (!bloque || !texto) return;

        if (spotifyProgressTicker) {
            clearInterval(spotifyProgressTicker);
            spotifyProgressTicker = null;
        }

        if (data && data.cancion) {
            const transcurrido = Date.now() - (data.actualizadoEn || 0);
            const esReciente = transcurrido < SPOTIFY_NOW_PLAYING_LIVE_MS;
            const cancionTexto = data.cancion + (data.artista ? ' — ' + data.artista : '');
            texto.textContent = esReciente ? cancionTexto : (cancionTexto + ' · ' + formatoTiempoTranscurrido(transcurrido));
            texto.title = cancionTexto;
            bloque.classList.toggle('spotify-now-desactualizado', !esReciente);
            // position:absolute (overlay): aparece/desaparece sin mover
            // nada del resto del perfil, ni vertical ni horizontalmente.
            bloque.style.display = 'flex';

            // El disco solo gira cuando de verdad está sonando algo
            // ahora mismo, y va por encima del avatar (no ocupa espacio).
            if (vinilo) {
                vinilo.classList.toggle('is-playing', esReciente);
                if (viniloArt) viniloArt.src = (esReciente && data.imagen) ? data.imagen : '';
            }

            actualizarProgresoSpotify(data, esReciente);
            if (esReciente && data.duracionMs) {
                spotifyProgressTicker = setInterval(function() { actualizarProgresoSpotify(data, true); }, 1000);
            }
        } else {
            bloque.style.display = 'none';
            if (vinilo) vinilo.classList.remove('is-playing');
            const wrap = document.getElementById('spotifyProgressWrap');
            if (wrap) wrap.style.display = 'none';
        }
    }

    let ultimoNowPlayingData = null;
    let nowPlayingRefreshInterval = null;

    function escucharSpotifyNowPlayingDeUid(uid) {
        if (nowPlayingListenerRef) {
            off(nowPlayingListenerRef);
            nowPlayingListenerRef = null;
        }
        if (nowPlayingRefreshInterval) {
            clearInterval(nowPlayingRefreshInterval);
            nowPlayingRefreshInterval = null;
        }
        ultimoNowPlayingData = null;
        pintarSpotifyNowPlaying(null);
        if (!uid) return;
        nowPlayingListenerRef = ref(rtdb, 'spotifyNowPlaying/' + uid);
        onValue(nowPlayingListenerRef, function(snap) {
            ultimoNowPlayingData = snap.exists() ? snap.val() : null;
            pintarSpotifyNowPlaying(ultimoNowPlayingData);
        });
        // Como ya no se borra sola al desconectarse, el texto "hace X
        // min" necesita refrescarse solo de vez en cuando aunque no
        // llegue ningún dato nuevo (la persona sigue con la app cerrada).
        nowPlayingRefreshInterval = setInterval(function() {
            if (ultimoNowPlayingData) pintarSpotifyNowPlaying(ultimoNowPlayingData);
        }, 30000);
    }

    // Mientras la pestaña está visible consultamos seguido para que se
    // sienta "en vivo"; si el usuario cambia de pestaña bajamos la
    // frecuencia para no gastar llamadas de la API de Spotify de balde,
    // y en cuanto vuelve a mirar la pestaña consultamos al instante.
    const SPOTIFY_POLL_MS_ACTIVO = 5000;
    const SPOTIFY_POLL_MS_OCULTO = 30000;

    function reiniciarPollingSpotify() {
        if (spotifyPollInterval) clearInterval(spotifyPollInterval);
        const intervalo = document.hidden ? SPOTIFY_POLL_MS_OCULTO : SPOTIFY_POLL_MS_ACTIVO;
        spotifyPollInterval = setInterval(actualizarSpotifyNowPlaying, intervalo);
    }

    function initSpotify() {
        const connectBtn = document.getElementById('spotifyConnectBtn');
        const disconnectBtn = document.getElementById('spotifyDisconnectBtn');
        if (connectBtn) connectBtn.addEventListener('click', iniciarConexionSpotify);
        if (disconnectBtn) disconnectBtn.addEventListener('click', desconectarSpotify);

        actualizarUISpotifyConexion();
        escucharSpotifyNowPlayingDeUid(currentUser ? currentUser.uid : null);

        actualizarSpotifyNowPlaying();
        reiniciarPollingSpotify();

        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) actualizarSpotifyNowPlaying();
            reiniciarPollingSpotify();
        });

        // Cuando la ventana emergente de conexión avisa que ya terminó,
        // refrescamos el estado en la pestaña principal sin recargar
        // nada ni volver a pedir el login.
        window.addEventListener('message', function(e) {
            if (e.origin !== window.location.origin) return;
            if (!e.data || e.data.tipo !== 'botardo-spotify-conectado') return;
            actualizarUISpotifyConexion();
            actualizarSpotifyNowPlaying();
            reiniciarPollingSpotify();
        });
    }

    // Maneja el regreso de Spotify con "?code=...": tanto si ocurre
    // dentro de la ventana emergente (caso normal) como si ocurre en la
    // pestaña principal (respaldo cuando el navegador bloqueó el popup).
    // El "code" es un dato sensible de un solo uso, así que lo primero
    // que hacemos siempre es limpiarlo de la URL, antes incluso de
    // esperar la respuesta de Spotify.
    async function manejarRedireccionSpotify() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (!code) return;

        const urlLimpia = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, urlLimpia);

        if (ES_VENTANA_EMERGENTE_SPOTIFY) {
            mostrarMensajePopupSpotify('Conectando tu cuenta de Spotify...');
            const ok = await intercambiarCodigoSpotify(code);
            try {
                window.opener.postMessage({ tipo: 'botardo-spotify-conectado', ok: ok }, window.location.origin);
            } catch (e) { /* ignorar */ }
            mostrarMensajePopupSpotify(ok
                ? '¡Listo! Ya puedes cerrar esta ventana.'
                : 'No se pudo conectar. Cierra esta ventana e inténtalo de nuevo.');
            setTimeout(function() { window.close(); }, ok ? 900 : 2500);
            return;
        }

        await intercambiarCodigoSpotify(code);
        actualizarUISpotifyConexion();
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

    function fechaStringDeTimestamp(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    const MAX_NOTAS_POR_DIA = 5;

    function ordenarPosts(arr) {
        return arr.slice().sort(function(a, b) {
            const aFijado = a.fijado ? 1 : 0;
            const bFijado = b.fijado ? 1 : 0;
            if (aFijado !== bFijado) return bFijado - aFijado;
            return b.createdAt - a.createdAt;
        });
    }

    function renderizarPosts() {
        if (viewingProfileUid) return;
        renderPostsGridGeneric(ordenarPosts(posts), true);
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
        aplicarAnimEntradaPerfilPorEmoji(statusEmoji);
    }

    // Índice de rareza dentro de la ruleta (0 = el más común). El emoji
    // por defecto ("sin reacción") no cuenta como premio, así que no
    // tiene tier especial.
    function indiceRarezaEmoji(emoji) {
        return EMOJIS_RULETA.findIndex(function(e) { return e.emoji === emoji; });
    }

    // Traduce la posición en la ruleta a uno de 5 "tiers" visuales: entre
    // más raro salió el emoji, más llamativo el aro alrededor del avatar.
    function tierVisualEmoji(emoji) {
        const idx = indiceRarezaEmoji(emoji);
        if (idx < 0) return 0;
        if (idx <= 1) return 1;
        if (idx <= 4) return 2;
        if (idx <= 9) return 3;
        if (idx <= 16) return 4;
        return 5;
    }

    // Se llama cada vez que se entra a un perfil (el propio o el de
    // alguien más) para que la anim del aro de rareza se vuelva a
    // reproducir, no solo la primera vez que se gira el emoji.
    function aplicarAnimEntradaPerfilPorEmoji(emoji) {
        const avatarBox = document.getElementById('profileAvatarXl');
        if (!avatarBox) return;
        for (let t = 1; t <= 5; t++) avatarBox.classList.remove('avatar-tier-' + t);
        const tier = tierVisualEmoji(emoji);
        if (tier > 0) avatarBox.classList.add('avatar-tier-' + tier);
        avatarBox.classList.remove('emoji-reveal-anim');
        // Forzar reflow para poder volver a disparar la animación aunque
        // sea el mismo tier que ya tenía.
        void avatarBox.offsetWidth;
        avatarBox.classList.add('emoji-reveal-anim');

        // La insignia del emoji también crece según la exclusividad del
        // resultado (más raro = más grande), pero sin taparle nunca la
        // foto de perfil: ver .emoji-tier-N en dashboard.css, que además
        // de agrandar el emoji lo va corriendo hacia afuera de la
        // esquina. Esto solo se aplica al entrar a un perfil (aquí),
        // nunca en avatares chicos de otras partes de la app.
        const emojiBadge = document.getElementById('statusEmoji');
        if (emojiBadge) {
            for (let t = 2; t <= 5; t++) emojiBadge.classList.remove('emoji-tier-' + t);
            if (tier >= 2) emojiBadge.classList.add('emoji-tier-' + tier);
        }
    }

    // Elige un emoji al azar respetando los pesos (el primero de la
    // lista tiene ~70% de probabilidad, y va bajando fuerte desde ahí).
    function girarRuletaEmoji() {
        const pesoTotal = EMOJIS_RULETA.reduce(function(acc, e) { return acc + e.peso; }, 0);
        let punto = Math.random() * pesoTotal;
        for (let i = 0; i < EMOJIS_RULETA.length; i++) {
            punto -= EMOJIS_RULETA[i].peso;
            if (punto <= 0) return EMOJIS_RULETA[i].emoji;
        }
        return EMOJIS_RULETA[0].emoji;
    }

    function girosEmojiDisponiblesHoy() {
        if (emojiGiroUsage.fecha !== getTodayString()) return MAX_GIROS_EMOJI_POR_DIA;
        return Math.max(0, MAX_GIROS_EMOJI_POR_DIA - emojiGiroUsage.cantidad);
    }

    async function cargarPosts() {
        if (!currentUser) return;
        try {
            const snap = await get(ref(rtdb, 'users/' + currentUser.uid + '/posts'));
            posts = [];
            if (snap.exists()) {
                snap.forEach(function(child) {
                    const val = child.val();
                    posts.push({ id: child.key, texto: val.texto, fecha: val.fecha, createdAt: val.createdAt || 0, fijado: !!val.fijado });
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
        const hoyStr = getTodayString();
        const notasHoy = posts.filter(function(p) { return fechaStringDeTimestamp(p.createdAt) === hoyStr; }).length;
        if (notasHoy >= MAX_NOTAS_POR_DIA) {
            alert('Ya llegaste al máximo de ' + MAX_NOTAS_POR_DIA + ' notas por día. Intenta de nuevo mañana.');
            return;
        }
        const ahora = new Date();
        const fecha = ahora.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const createdAt = Date.now();
        try {
            const newRef = push(ref(rtdb, 'users/' + currentUser.uid + '/posts'));
            await set(newRef, { texto: texto, fecha: fecha, createdAt: createdAt, fijado: false });
            posts.unshift({ id: newRef.key, texto: texto, fecha: fecha, createdAt: createdAt, fijado: false });
            renderizarPosts();
            actualizarStats();
        } catch (err) {
            console.error('Error guardando nota:', err);
            alert('No se pudo guardar la nota: ' + (err.code || err.message));
        }
    }

    async function toggleFijarPost(id) {
        if (!currentUser) return;
        const post = posts.find(function(p) { return p.id === id; });
        if (!post) return;
        const nuevoValor = !post.fijado;
        try {
            await update(ref(rtdb, 'users/' + currentUser.uid + '/posts/' + id), { fijado: nuevoValor });
            post.fijado = nuevoValor;
            renderizarPosts();
        } catch (err) {
            console.error('Error fijando nota:', err);
            alert('No se pudo actualizar la nota: ' + (err.code || err.message));
        }
    }

    window.toggleFijarPost = toggleFijarPost;

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
                if (val.giroEmoji) {
                    emojiGiroUsage = { fecha: val.giroEmoji.fecha || '', cantidad: val.giroEmoji.cantidad || 0 };
                }
            }
        } catch (err) {
            console.error('Error cargando perfil:', err);
        }
        if (emojiGiroUsage.fecha !== getTodayString()) emojiGiroUsage = { fecha: getTodayString(), cantidad: 0 };
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
            await update(ref(rtdb, 'users/' + currentUser.uid + '/perfil'), { emoji: statusEmoji, giroEmoji: emojiGiroUsage });
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
                if (emojiEl.classList.contains('spinning')) return;

                const disponibles = girosEmojiDisponiblesHoy();
                if (disponibles <= 0) {
                    alert('Ya usaste tus ' + MAX_GIROS_EMOJI_POR_DIA + ' giros de hoy. Vuelve mañana para intentar de nuevo.');
                    return;
                }

                const confirmado = confirm(
                    '¿Estás seguro de girar? (Te quedan ' + disponibles + ' de ' + MAX_GIROS_EMOJI_POR_DIA + ' giros hoy)\n\n' +
                    'Es cuestión de suerte: puede salir un emoji peor o uno mucho más exclusivo. Nadie sabe qué va a salir.'
                );
                if (!confirmado) return;

                if (emojiGiroUsage.fecha !== getTodayString()) emojiGiroUsage = { fecha: getTodayString(), cantidad: 0 };
                emojiGiroUsage.cantidad += 1;

                // Efecto de "ruleta girando" antes de mostrar el resultado.
                emojiEl.classList.add('spinning');
                const emojisVisuales = EMOJIS_RULETA.map(function(e) { return e.emoji; });
                let vueltas = 0;
                const spinTimer = setInterval(function() {
                    emojiEl.textContent = emojisVisuales[Math.floor(Math.random() * emojisVisuales.length)];
                    vueltas++;
                    if (vueltas >= 14) {
                        clearInterval(spinTimer);
                        emojiEl.classList.remove('spinning');
                        statusEmoji = girarRuletaEmoji();
                        guardarEmoji();
                        actualizarEmoji();
                    }
                }, 90);
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
            // La marca de "está pasando ahora" se pone en la celda de la
            // HORA (columna izquierda), no en la materia: así no hace
            // falta cambiarle el color/borde a la materia para saber que
            // es la clase activa, basta con mirar qué hora está resaltada.
            const horaActivaEnFila = diasConClases.some(function(dia) {
                const c = clasesArr.find(c => c.dias.includes(dia) && c.horaInicio === hora);
                return c && estaActivaAhora(c);
            });
            html += `<tr><td class="hour-cell${horaActivaEnFila ? ' hour-cell-active' : ''}">${hora}</td>`;
            diasConClases.forEach(dia => {
                const clase = clasesArr.find(c => c.dias.includes(dia) && c.horaInicio === hora);
                if (clase) {
                    const esRecreoClase = esRecreo(clase);
                    const bgColor = esRecreoClase ? '#fff3e0' : clase.color;
                    const textColor = esRecreoClase ? '#e65100' : clase.colorText;
                    // El borde ya no depende de si está activa (eso ahora lo
                    // marca la hora): sirve como color identificador fijo de
                    // la materia, tanto en modo claro como oscuro.
                    const borderColor = esRecreoClase ? '#ff9800' : (clase.colorText || 'transparent');
                    const icono = esRecreoClase ? 'fa-coffee' : clase.icono;
                    const label = esRecreoClase ? 'RECREO' : '';

                    html += `
                        <td class="class-cell" style="background:${bgColor};color:${textColor};border-left:3px solid ${borderColor};">
                            <div class="class-cell-content">
                                <i class="fas ${icono}"></i>
                                <span class="class-name">${clase.nombre}</span>
                                ${label ? `<span class="recreo-badge">${label}</span>` : ''}
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

    // Las notificaciones ahora se guardan en la base de datos (ver
    // guardarNotificacionPersistente más abajo) para que sigan ahí la
    // próxima vez que entres, aunque hayan ocurrido con la app cerrada.
    function agregarNotificacionSistema(titulo, mensaje, target) {
        if (notifSettings.sistema && currentUser) {
            guardarNotificacionPersistente(currentUser.uid, 'sistema', titulo, mensaje, target);
        }
        agregarActividad('#0d47a1', titulo, mensaje);
    }

    function agregarNotificacionLive(titulo, mensaje, target, avatar) {
        if (notifSettings.live && currentUser) {
            guardarNotificacionPersistente(currentUser.uid, 'live', titulo, mensaje, target, avatar).then(function(id) {
                if (id) notifIdsRenderizados.add(id);
            });
        }
        agregarActividad('#e65100', titulo, mensaje);
    }

    // ===== Notificaciones persistentes =====
    // Antes vivían solo en el DOM y se perdían al recargar o si no
    // estabas conectado cuando ocurrían (p. ej. un nuevo seguidor).
    // Ahora se guardan en users/{uid}/notificaciones/{id} y un listener
    // en tiempo real las va mostrando en la campanita, ya sea que
    // acaben de pasar o llevaran horas esperando desde tu último login.
    const MAX_NOTIFICACIONES_GUARDADAS = 40;
    let notifIdsRenderizados = new Set();
    const notifSessionStart = Date.now();

    async function guardarNotificacionPersistente(uid, tipo, titulo, mensaje, target, avatar) {
        try {
            const nuevaRef = push(ref(rtdb, 'users/' + uid + '/notificaciones'));
            await set(nuevaRef, {
                tipo: tipo,
                titulo: titulo,
                mensaje: mensaje,
                target: target || null,
                avatar: avatar || null,
                ts: Date.now(),
                leido: false
            });
            return nuevaRef.key;
        } catch (err) {
            console.error('Error guardando notificación persistente:', err);
            return null;
        }
    }

    function formatearTiempoRelativo(ts) {
        if (!ts) return '';
        const diffMs = Date.now() - ts;
        const min = Math.floor(diffMs / 60000);
        if (min < 1) return 'Hace unos segundos';
        if (min < 60) return `Hace ${min} minuto${min === 1 ? '' : 's'}`;
        const horas = Math.floor(min / 60);
        if (horas < 24) return `Hace ${horas} hora${horas === 1 ? '' : 's'}`;
        const dias = Math.floor(horas / 24);
        return `Hace ${dias} día${dias === 1 ? '' : 's'}`;
    }

    async function marcarNotificacionLeida(id) {
        if (!currentUser || !id) return;
        try {
            await update(ref(rtdb, 'users/' + currentUser.uid + '/notificaciones/' + id), { leido: true });
        } catch (err) {
            console.error('Error marcando notificación como leída:', err);
        }
    }

    async function marcarTodasLeidasPersistente(tipo) {
        if (!currentUser) return;
        try {
            const snap = await get(ref(rtdb, 'users/' + currentUser.uid + '/notificaciones'));
            if (!snap.exists()) return;
            const updates = {};
            snap.forEach(function(child) {
                const val = child.val();
                const esDelTipo = tipo === 'sistema' ? val.tipo === 'sistema' : val.tipo !== 'sistema';
                if (esDelTipo && !val.leido) updates[child.key + '/leido'] = true;
            });
            if (Object.keys(updates).length > 0) {
                await update(ref(rtdb, 'users/' + currentUser.uid + '/notificaciones'), updates);
            }
        } catch (err) {
            console.error('Error marcando todas como leídas:', err);
        }
    }

    function renderNotifItemGuardado(n) {
        const list = document.querySelector(n.tipo === 'sistema' ? '#notifSistema .notif-list' : '#notifLive .notif-list');
        if (!list) return;
        const icono = n.tipo === 'sistema' ? 'fa-info-circle' : 'fa-bell';
        const color = n.tipo === 'sistema' ? '#0d47a1' : '#e65100';
        const item = document.createElement('li');
        item.className = 'notif-item' + (n.leido ? '' : ' unread');
        item.innerHTML = `
            <i class="fas ${icono}" style="color:${color};"></i>
            <div><p><strong>${escapeHtml(n.titulo)}</strong> - ${escapeHtml(n.mensaje)}</p><span>${formatearTiempoRelativo(n.ts)}</span></div>
        `;
        if (n.target) {
            item.classList.add('notif-clickable');
            item.addEventListener('click', function() {
                if (!n.leido) { marcarNotificacionLeida(n.id); n.leido = true; }
                item.classList.remove('unread');
                actualizarBadge();
                const dropdown = document.getElementById('notifDropdown');
                if (dropdown) dropdown.classList.remove('open');
                manejarClickNotificacion(n.target);
            });
        }
        list.appendChild(item);
    }

    function renderNotificacionesGuardadas(registros) {
        const listLive = document.querySelector('#notifLive .notif-list');
        const listSistema = document.querySelector('#notifSistema .notif-list');
        if (listLive) listLive.innerHTML = '';
        if (listSistema) listSistema.innerHTML = '';

        const live = registros.filter(function(n) { return n.tipo !== 'sistema'; }).slice(0, MAX_NOTIFICACIONES_GUARDADAS);
        const sistema = registros.filter(function(n) { return n.tipo === 'sistema'; }).slice(0, MAX_NOTIFICACIONES_GUARDADAS);

        if (live.length === 0 && listLive) {
            listLive.innerHTML = '<li style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:0.8rem;"><i class="fas fa-bell-slash" style="font-size:1.5rem;display:block;margin-bottom:0.5rem;opacity:0.3;"></i>No hay notificaciones en vivo</li>';
        } else {
            live.forEach(renderNotifItemGuardado);
        }

        if (sistema.length === 0 && listSistema) {
            listSistema.innerHTML = '<li style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:0.8rem;"><i class="fas fa-check-circle" style="font-size:1.5rem;display:block;margin-bottom:0.5rem;opacity:0.3;"></i>Sistema funcionando correctamente</li>';
        } else {
            sistema.forEach(renderNotifItemGuardado);
        }

        actualizarBadge();
    }

    function iniciarListenerNotificaciones() {
        if (!currentUser) return;
        const notifRef = ref(rtdb, 'users/' + currentUser.uid + '/notificaciones');
        let primeraCarga = true;
        onValue(notifRef, function(snap) {
            const registros = [];
            if (snap.exists()) {
                snap.forEach(function(child) {
                    registros.push(Object.assign({ id: child.key }, child.val()));
                });
            }
            registros.sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });
            renderNotificacionesGuardadas(registros);

            if (!primeraCarga) {
                registros.forEach(function(n) {
                    if (n.ts > notifSessionStart && n.tipo !== 'sistema' && !notifIdsRenderizados.has(n.id)) {
                        notifIdsRenderizados.add(n.id);
                        mostrarToastGenerico({
                            titulo: n.titulo,
                            mensaje: n.mensaje,
                            target: n.target,
                            avatarHtml: n.avatar ? escapeHtml(n.avatar) : null
                        });
                    }
                });
            } else {
                registros.forEach(function(n) { notifIdsRenderizados.add(n.id); });
            }
            primeraCarga = false;
        }, function(err) {
            console.error('Error escuchando notificaciones:', err);
        });
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
    // Se persiste en localStorage (por usuario) porque antes esto vivía solo
    // en una variable de JS: al recargar la página o volver a entrar la
    // app se reiniciaba y volvía a avisar "empezó tal clase" aunque ya se
    // hubiera avisado antes ese mismo día.
    let clasesNotificadasHoy = { fecha: null, avisos: new Set() };

    function claveStorageAvisosClases() {
        return 'botardo_avisos_clases_' + (currentUser ? currentUser.uid : 'anon');
    }

    function cargarClasesNotificadasHoy() {
        const hoyStr = getTodayString();
        try {
            const raw = localStorage.getItem(claveStorageAvisosClases());
            if (raw) {
                const data = JSON.parse(raw);
                if (data && data.fecha === hoyStr) {
                    clasesNotificadasHoy = { fecha: hoyStr, avisos: new Set(data.avisos || []) };
                    return;
                }
            }
        } catch (err) { /* localStorage no disponible: se usa solo en memoria */ }
        clasesNotificadasHoy = { fecha: hoyStr, avisos: new Set() };
    }

    function guardarClasesNotificadasHoy() {
        try {
            localStorage.setItem(claveStorageAvisosClases(), JSON.stringify({
                fecha: clasesNotificadasHoy.fecha,
                avisos: Array.from(clasesNotificadasHoy.avisos)
            }));
        } catch (err) { /* localStorage no disponible: no pasa nada, se sigue solo en memoria */ }
    }

    function minutosDesdeMedianoche(horaStr) {
        const [h, m] = horaStr.split(':').map(Number);
        return h * 60 + m;
    }

    function verificarNotificacionesClases() {
        const ahora = new Date();
        const hoyStr = getTodayString();
        if (clasesNotificadasHoy.fecha !== hoyStr) {
            cargarClasesNotificadasHoy();
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
                guardarClasesNotificadasHoy();
                const emoji = esRecreo(clase) ? '☕' : '⏰';
                agregarNotificacionLive(
                    `${emoji} Próximo`,
                    `"${clase.nombre}" comienza en ${diffInicio} minuto${diffInicio === 1 ? '' : 's'} (${diaActual})`,
                    'section-clases'
                );
            }

            if (diffInicio <= 0 && diffFin > 0 && !clasesNotificadasHoy.avisos.has(claveComenzo)) {
                clasesNotificadasHoy.avisos.add(claveComenzo);
                guardarClasesNotificadasHoy();
                // El mensaje sigue mencionando la materia (es el texto de la
                // notificación), pero la hora de inicio es lo que se resalta
                // en la grilla del horario en sí — ver hourCellActiva en
                // construirGridHorarioHtml. En el perfil sigue mostrándose
                // la materia en la que estás (ver actualizarBadgeClaseActual).
                const emoji = esRecreo(clase) ? '☕' : '📚';
                const titulo = esRecreo(clase) ? `${emoji} Recreo` : `${emoji} Ha comenzado`;
                const mensaje = `${clase.horaInicio} - ${clase.horaFin} · "${clase.nombre}" (${diaActual})`;
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
                            <div id="completeEmailHint" class="field-hint" style="display:none;font-size:0.78rem;color:var(--text-secondary,#6a7a8f);margin-top:0.3rem;">
                                <i class="fas fa-lock"></i> Este correo viene de tu cuenta de Google/GitHub y no se puede cambiar aquí.
                            </div>
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

        // El correo viene por defecto de la cuenta con la que se registró
        // (Google, GitHub, o el correo/contraseña usado al crear la cuenta).
        // Si Firebase Auth ya nos dio un correo confiable, se bloquea el
        // campo para que no se pueda editar por error; si por algún caso
        // raro no vino correo (ej. GitHub sin correo público), se deja
        // editable como respaldo para no bloquear el registro.
        const emailHint = document.getElementById('completeEmailHint');
        const correoConfiable = !!user.email;
        emailInput.readOnly = correoConfiable;
        emailInput.classList.toggle('input-locked', correoConfiable);
        if (emailHint) emailHint.style.display = correoConfiable ? 'block' : 'none';

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
                    createdAt: (existingData && existingData.createdAt) || new Date().toISOString(),
                    botardoId: (existingData && existingData.botardoId) || generarBotardoId(),
                    grado: (existingData && existingData.grado) || '',
                    gradoChanged: !!(existingData && existingData.gradoChanged),
                    colegio: (existingData && existingData.colegio) || ''
                });

                const esCuentaNueva = !existingData;
                currentUserData = { name: name, username: username, email: email };
                overlay.classList.remove('open');
                overlay.remove();
                init();
                if (esCuentaNueva) {
                    agregarNotificacionBienvenida();
                    // En cuentas recién creadas, algunas estadísticas dependen
                    // de listeners en tiempo real (seguidores, clases, chats de
                    // IA) que pueden no haber terminado de sincronizar en el
                    // primer render de init(). Se recargan una vez más tras un
                    // instante para que se vean correctas desde el principio.
                    setTimeout(function() {
                        cargarUserStats();
                        actualizarStats();
                        renderUserStats();
                    }, 1800);
                }
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
                    marcarPasoCarga('datos', 'done');
                    marcarPasoCarga('perfil', 'active');
                    actualizarTextoCarga('Preparando tu perfil...');
                    init();
                    return;
                }
                ocultarAppLoader();
                showCompleteDataModal(user, data);
                return;
            }
            ocultarAppLoader();
            showCompleteDataModal(user, null);
        } catch (err) {
            console.error('Error leyendo datos de Firestore:', err);
            ocultarAppLoader();
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
            // La notificación de "nuevo seguidor" ya no se detecta comparando
            // instantáneas aquí (eso solo funcionaba si estabas conectado en
            // ese momento). Ahora toggleFollow() la guarda directamente en tu
            // nodo de notificaciones al momento de seguirte, y el listener de
            // iniciarListenerNotificaciones() la muestra apenas entres,
            // aunque haya sido con la app cerrada.
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
            container.innerHTML = '<p class="social-empty">No se encontró ningún usuario con ese nombre de usuario exacto.</p>';
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

    // Antes buscaba por coincidencia parcial (cualquier username que
    // empezara con el término). Con muchos usuarios eso devolvía listas
    // largas y ambiguas, así que ahora exige el nombre de usuario EXACTO.
    async function handleUserSearch() {
        const input = document.getElementById('userSearchInput');
        const resultsContainer = document.getElementById('userSearchResults');
        const term = input.value.trim().toLowerCase();
        if (!term) { resultsContainer.innerHTML = ''; return; }

        resultsContainer.innerHTML = '<p class="social-empty">Buscando...</p>';

        try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('username', '==', term));
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
                // Se guarda directo en el nodo de notificaciones de la persona
                // seguida (no en el propio) para que le llegue aunque no esté
                // conectada ahora mismo, y aparezca en su campanita al entrar.
                guardarNotificacionPersistente(
                    uid,
                    'live',
                    'Nuevo seguidor',
                    `${currentUserData.name} (@${currentUserData.username}) ahora te sigue`,
                    'perfil:' + currentUser.uid + ':' + encodeURIComponent(currentUserData.name || '') + ':' + (currentUserData.username || ''),
                    (currentUserData.name || '?').charAt(0).toUpperCase()
                );
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

    // Igual que el emoji, pero para la foto de perfil: se usa para que
    // la lista de chats muestre la foto real de cada contacto (con su
    // aro de exclusividad) en vez de solo un círculo con la inicial.
    async function obtenerAvatarUsuario(uid) {
        if (uid in contactAvatars) return contactAvatars[uid];
        try {
            const snap = await get(ref(rtdb, 'users/' + uid + '/perfil/avatar'));
            contactAvatars[uid] = snap.exists() ? snap.val() : null;
        } catch (err) {
            contactAvatars[uid] = null;
        }
        return contactAvatars[uid];
    }

    function precargarEmojis(list) {
        const faltanEmoji = (list || []).filter(function(u) { return !(u.uid in contactEmojis); });
        const faltanAvatar = (list || []).filter(function(u) { return !(u.uid in contactAvatars); });
        if (faltanEmoji.length === 0 && faltanAvatar.length === 0) return;
        Promise.all(
            faltanEmoji.map(function(u) { return obtenerEmojiUsuario(u.uid); })
                .concat(faltanAvatar.map(function(u) { return obtenerAvatarUsuario(u.uid); }))
        ).then(function() {
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

    // Arma el círculo de avatar para la lista de chats/encabezado de chat:
    // foto real si el contacto ya tiene una guardada (si no, la inicial
    // de su nombre como antes) y el aro de exclusividad correspondiente
    // a su emoji, en versión miniatura (sin la animación de "abrir
    // perfil", que se queda solo para la vista de perfil completa).
    function htmlAvatarContacto(uid, nombre) {
        const avatar = contactAvatars[uid];
        const emoji = contactEmojis[uid] || '';
        const tier = emoji ? tierVisualEmoji(emoji) : 0;
        const tierClass = tier > 0 ? ' avatar-tier-' + tier : '';
        const inicial = escapeHtml(nombre.charAt(0).toUpperCase());
        if (avatar && avatar.tipo === 'imagen' && avatar.valor) {
            const posX = avatar.posX != null ? avatar.posX : 50;
            const posY = avatar.posY != null ? avatar.posY : 50;
            return `<div class="chat-contact-avatar${tierClass}"><img src="${PROFILE_BG_PATH}${avatar.valor}.webp" alt="" style="object-position:${posX}% ${posY}%;" /></div>`;
        }
        return `<div class="chat-contact-avatar${tierClass}">${inicial}</div>`;
    }

    function renderChatContacts(filtro) {
        const container = document.getElementById('chatContactsList');
        if (!container) return;
        container.className = 'chat-contacts-list';
        const term = (filtro || '').trim().toLowerCase();
        const lista = term
            ? chatContacts.filter(function(u) {
                return u.name.toLowerCase().includes(term) || u.username.toLowerCase().includes(term);
            })
            : chatContacts;

        if (chatContacts.length === 0) {
            container.innerHTML = '<p class="social-empty">Sigue a alguien o consigue seguidores para poder chatear.</p>';
            return;
        }
        if (lista.length === 0) {
            container.innerHTML = '<p class="social-empty">Ningún contacto coincide con "' + escapeHtml(filtro) + '".</p>';
            return;
        }
        container.innerHTML = lista.map(function(u) {
            const canWrite = puedeEscribirA(u.uid);
            const activeClass = u.uid === currentChatUid ? ' active' : '';
            const online = estaEnLinea(u.uid);
            const emoji = contactEmojis[u.uid] || '';
            return `
                <div class="chat-contact-item${activeClass}" data-uid="${u.uid}" onclick="abrirChat('${u.uid}', '${escapeForAttr(u.name)}', '${u.username}')">
                    <div class="chat-contact-avatar-wrap">
                        ${htmlAvatarContacto(u.uid, u.name)}
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
                    ${htmlAvatarContacto(uid, name)}
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
        { keywords: ['salon', 'asistencia', 'asistencias', 'reconocimiento facial'], target: 'section-camara' },
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
        'section-camara': 'Salón',
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

    let claseActualBadgeTimer = null;

    // Muestra en la cabecera del perfil, en tiempo real, la clase en la que
    // está el dueño del perfil ahora mismo (si tiene alguna activa). Sirve
    // tanto para tu propio perfil (clasesArr = clases, tu horario) como para
    // el de alguien más (clasesArr = su horario, ya cargado aparte).
    function actualizarBadgeClaseActual(clasesArr) {
        const lista = clasesArr || clases;
        const badge = document.getElementById('profileClaseActualBadge');
        const texto = document.getElementById('profileClaseActualTexto');
        if (!badge || !texto) return;

        const render = function() {
            if (!document.body.contains(badge)) {
                if (claseActualBadgeTimer) { clearInterval(claseActualBadgeTimer); claseActualBadgeTimer = null; }
                return;
            }
            const claseActiva = (lista || []).find(function(c) { return estaActivaAhora(c); });
            if (claseActiva) {
                texto.textContent = esRecreo(claseActiva) ? 'En recreo ahora' : `En clase ahora: ${claseActiva.nombre}`;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        };

        render();
        if (claseActualBadgeTimer) clearInterval(claseActualBadgeTimer);
        claseActualBadgeTimer = setInterval(render, 30000);
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
                <div class="post-card${post.fijado ? ' pinned' : ''}">
                    <div class="post-header">
                        <span class="post-date">${post.fijado ? '<i class="fas fa-thumbtack post-pin-icon"></i> ' : ''}${post.fecha}</span>
                        ${soyPropietario ? `<div class="post-actions">
                            <button class="btn-pin-post${post.fijado ? ' active' : ''}" onclick="toggleFijarPost('${post.id}')" title="${post.fijado ? 'Quitar de fijadas' : 'Fijar nota'}"><i class="fas fa-thumbtack"></i></button>
                            <button class="btn-delete-post" onclick="eliminarPost('${post.id}')"><i class="fas fa-trash"></i></button>
                        </div>` : ''}
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
        renderPostsGridGeneric(ordenarPosts(posts), true);
        renderProfileMaterias(clases);
        renderProfileHorarioResumen(clases);
        renderFollowingList(followingList);
        renderFollowersList(followersList);
        renderFriendsList();
        actualizarStats();
        aplicarAccentPerfilView(apariencia.acento);
        aplicarBannerPerfilView(perfilImagenes.banner);
        aplicarAvatarPerfilView(perfilImagenes.avatar);
        actualizarBadgeClaseActual();
        escucharSpotifyNowPlayingDeUid(currentUser ? currentUser.uid : null);

        const tabsRow = document.getElementById('profileTabs');
        if (tabsRow) tabsRow.style.display = '';

        const view = document.getElementById('profileView');
        if (view) view.classList.add('is-own');

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

    function mostrarBarraCargaPerfil() {
        const barra = document.getElementById('profileLoadingBar');
        if (barra) barra.classList.add('activa');
    }

    function ocultarBarraCargaPerfil() {
        const barra = document.getElementById('profileLoadingBar');
        if (barra) barra.classList.remove('activa');
    }

    async function mostrarPerfilDeUsuario(uid, name, username) {
        // Solo se puede ver el perfil completo de alguien si hay algún
        // vínculo real: lo sigues, te sigue, o ambas cosas (amigos). Un
        // desconocido sin ninguna relación no puede entrar aquí.
        const hayRelacion = followingSet.has(uid) || followersSet.has(uid);
        if (!hayRelacion) {
            alert('Solo puedes ver el perfil de tus amigos, o de cuentas que te siguen o que sigues.');
            return;
        }

        viewingProfileUid = uid;
        viewingProfileData = { name: name, username: username };
        escucharSpotifyNowPlayingDeUid(uid);

        const view = document.getElementById('profileView');
        if (view) view.classList.remove('is-own');

        const backBtn = document.getElementById('profileBackBtn');
        if (backBtn) backBtn.style.display = 'inline-flex';

        document.getElementById('profileName').textContent = name;
        document.getElementById('profileUsername').textContent = '@' + username;
        document.getElementById('profileBio').textContent = 'Cargando...';
        renderProfileActionsViewing(uid, name, username);

        // El colegio y el grado NUNCA se muestran en el perfil de otra
        // persona (solo el propio dueño los ve, en su propio perfil).
        // Combinado con las materias y los seguidores, esa información
        // podría usarse para identificar a un menor específico —en qué
        // colegio, en qué grado y con quién se relaciona—, así que se
        // oculta por completo aquí sin excepción, sin importar la
        // relación de amistad que haya.
        const metaRow = document.getElementById('profileMetaRow');
        if (metaRow) metaRow.style.display = 'none';

        const postsHeaderRow = document.getElementById('postsHeaderRow');
        if (postsHeaderRow) postsHeaderRow.innerHTML = '<h3><i class="fas fa-newspaper"></i> Notas</h3>';

        const tabsRow = document.getElementById('profileTabs');
        if (tabsRow) tabsRow.style.display = '';

        switchProfileTab('publicaciones');

        mostrarBarraCargaPerfil();
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
            if (emojiEl) emojiEl.textContent = perfil.emoji || EMOJI_SIN_REACCION;
            aplicarAnimEntradaPerfilPorEmoji(perfil.emoji || EMOJI_SIN_REACCION);
            aplicarAccentPerfilView(perfil.acento);
            aplicarBannerPerfilView(perfil.banner);
            aplicarAvatarPerfilView(perfil.avatar);

            const postsArr = [];
            if (postsSnap.exists()) postsSnap.forEach(function(c) { postsArr.push(c.val()); });
            renderPostsGridGeneric(ordenarPosts(postsArr), false);
            const postCountEl = document.getElementById('postCount');
            if (postCountEl) postCountEl.textContent = postsArr.length;

            const clasesArr = [];
            if (clasesSnap.exists()) clasesSnap.forEach(function(c) { clasesArr.push(c.val()); });
            renderProfileMaterias(clasesArr);
            renderProfileHorarioResumen(clasesArr);
            actualizarBadgeClaseActual(clasesArr);

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
        } finally {
            ocultarBarraCargaPerfil();
        }
    }

    function verPerfilUsuario(uid, name, username) {
        navigateTo('section-perfil');
        mostrarPerfilDeUsuario(uid, name, username);
    }

    window.verPerfilUsuario = verPerfilUsuario;

    const ASSISTANT_SYSTEM_INSTRUCTION = `Eres "Botardo", el asistente virtual dentro del dashboard de Botardo Face App, una aplicación educativa de reconocimiento facial creada por estudiantes del Colegio Luis Madina (Colombia) para el taller de Sistemas Informáticos.

CONOCIMIENTO DE LA APLICACIÓN (úsalo para responder con precisión):
- Secciones del panel lateral: Panel (resumen y actividad reciente), Perfil (perfil propio y de otros usuarios, con notas, horario, materias, seguidores, seguidos y amigos), Mensajes (conversaciones con otras personas; tú, la IA, se accede desde el botón flotante del asistente en cualquier sección, no desde Mensajes), Horario (crear y editar el horario de clases semanal), Salón (estadísticas de asistencia al colegio registradas por el reconocimiento facial: asistencias totales, racha, colegio y grado, y configuración del colegio/grado), Estadísticas (datos de uso de la cuenta), Configuración (seguridad, notificaciones, apariencia, datos, uso de IA) y Proyectos (proyectos propios de Botardo).
- Perfil: cada usuario tiene nombre, nombre de usuario, descripción (bio), un emoji de estado, notas/publicaciones, horario de clases, materias, seguidores y seguidos. Dos usuarios son "amigos" cuando se siguen mutuamente.
- Mensajería: solo puedes escribirle a alguien si esa persona te sigue a ti.
- Tienes un límite de 5 mensajes diarios contigo (la IA) para cuentas gratuitas; los usuarios Premium (función futura) no tendrán límite. Un mensaje solo cuenta contra ese límite si logras responder; si hay un error técnico, no se descuenta.
- Función VIP: en cada mensaje recibirás un bloque "[CONTEXTO DEL PERFIL DEL USUARIO]" con su nombre, bio, notas, seguidores/seguidos/amigos y plan, y un bloque "[CONTEXTO DEL HORARIO EN TIEMPO REAL]" con el horario real de hoy del usuario, su clase actual y sus materias. Úsalo para responder con precisión sobre su perfil o cuando pregunten en qué clase están, qué les toca hoy, cuánto falta para la siguiente clase, etc. No inventes datos: si un bloque dice que no hay información, dilo tal cual. No repitas los bloques de contexto en tu respuesta, son solo para ti.
- Responde siempre en español, de forma breve, cálida y clara. Puedes usar formato Markdown (negrita con **, listas con -, etc.) cuando ayude a la claridad.

NAVEGACIÓN: si el usuario te pide ir a una sección de la app (por ejemplo "llévame a mi perfil", "abre configuración", "muéstrame mis mensajes"), responde brevemente confirmando la acción y termina tu respuesta agregando en una línea aparte, exactamente, una de estas marcas según corresponda:
[[NAV:section-panel]] para Panel
[[NAV:section-perfil]] para Perfil
[[NAV:section-mensajes]] para Mensajes
[[NAV:section-clases]] para Horario
[[NAV:section-camara]] para Salón
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

    // Le da a la IA visibilidad del perfil de quien le escribe: nombre,
    // usuario, bio, emoji de estado, notas, seguidores/seguidos/amigos y
    // plan de cuenta. Se recalcula en cada mensaje (no se guarda en el
    // historial) para reflejar siempre el estado más reciente del perfil.
    function construirContextoPerfilIA() {
        if (!currentUser) return '';
        let amigos = 0;
        followingSet.forEach(function(uid) { if (followersSet.has(uid)) amigos++; });

        let texto = '[CONTEXTO DEL PERFIL DEL USUARIO]\n';
        texto += `Nombre: ${(currentUserData && currentUserData.name) || 'Sin nombre'}.\n`;
        texto += `Usuario: @${(currentUserData && currentUserData.username) || 'sin_usuario'}.\n`;
        texto += `Descripción (bio): ${bioText || 'Sin descripción.'}\n`;
        texto += `Emoji de estado: ${statusEmoji || EMOJI_SIN_REACCION}.\n`;
        texto += `Plan: ${(currentUserData && currentUserData.premium) ? 'Premium' : 'Gratis'}.\n`;
        texto += `Notas publicadas: ${posts.length}.\n`;
        if (posts.length > 0) {
            texto += 'Últimas notas: ' + posts.slice(0, 3).map(function(p) { return '"' + p.texto + '"'; }).join(' | ') + '.\n';
        }
        texto += `Seguidores: ${followersCount}. Seguidos: ${followingSet.size}. Amigos (se siguen mutuamente): ${amigos}.\n`;
        texto += '[FIN DEL CONTEXTO DE PERFIL]';
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

    function abrirAsistentePanel() {
        const panel = document.getElementById('assistantPanel');
        if (panel) panel.style.display = 'flex';
    }

    // "Mensajes" ahora tiene dos sub-pestañas dentro del panel de la
    // izquierda: "Conversaciones" (chats existentes) y "Buscar personas"
    // (antes vivía como buscador dentro de Perfil; se mudó aquí porque
    // tiene más sentido buscar gente justo donde se empieza a chatear).
    function switchMessagesTab(tab) {
        const conv = document.getElementById('messagesContainer');
        if (conv) conv.style.display = 'flex';
        switchMessagesContactsTab(tab === 'buscar' ? 'buscar' : 'conversaciones');
    }

    function switchMessagesContactsTab(tab) {
        document.querySelectorAll('.messages-contacts-tab').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.mtab === tab);
        });
        const panelConv = document.getElementById('mcPanelConversaciones');
        const panelBuscar = document.getElementById('mcPanelBuscar');
        if (panelConv) panelConv.classList.toggle('active', tab !== 'buscar');
        if (panelBuscar) panelBuscar.classList.toggle('active', tab === 'buscar');
    }

    function initMessagesTabs() {
        document.querySelectorAll('.messages-contacts-tab').forEach(function(btn) {
            if (btn._wired) return;
            btn._wired = true;
            btn.addEventListener('click', function() {
                switchMessagesContactsTab(this.dataset.mtab);
            });
        });
        const contactsSearchInput = document.getElementById('chatContactsSearchInput');
        if (contactsSearchInput && !contactsSearchInput._wired) {
            contactsSearchInput._wired = true;
            contactsSearchInput.addEventListener('input', function() {
                renderChatContacts(this.value.trim().toLowerCase());
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
        // El consumo de mensajes (límite diario + estadística) se registra
        // solo cuando la IA responde con éxito, más abajo. Así un error de
        // la API (por ejemplo un fallo de red o un error del modelo) no le
        // cuesta un mensaje al usuario.
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
            const contextoPerfil = construirContextoPerfilIA();
            const result = await chat.sendMessage(contextoPerfil + '\n\n' + contextoHorario + '\n\nMensaje del usuario: ' + text);
            let responseText = result.response.text();
            const typing = document.getElementById('assistantTyping');
            if (typing) typing.remove();

            // Solo llegados aquí sabemos que la IA sí respondió: ahora sí
            // se cuenta el mensaje contra el límite diario y las stats.
            incrementarStatAiMessage();
            registrarUsoDiarioIA();

            const { texto, target } = extraerNavegacion(responseText);
            appendAssistantMessage('assistant', texto);
            guardarMensajeIA(currentAiChatId, 'assistant', texto);
            cargarChatsIA().then(function() {
                renderAiChatsDropdown();
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
            appendAssistantMessage('assistant', 'Lo siento, tuve un problema para responder: ' + (err.code || err.message || err) + '. Este intento no cuenta contra tu límite diario, puedes intentarlo de nuevo.');
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
                marcarTodasLeidasPersistente(panel && panel.id === 'notifSistema' ? 'sistema' : 'live');
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

    // --- Salón: asistencias registradas por el reconocimiento facial ---
    //
    // Estructura en la Realtime Database (simplificada a propósito, para
    // que el compañero de hardware/Python la pueda escribir fácilmente
    // por REST sin lógica compleja de su lado):
    //
    //   asistencias/
    //     {colegioSlug}/
    //       {gradoSlug}/
    //         {botardoId}/
    //           {AAAA-MM-DD}: { hora: "07:32", estado: "presente" }
    //
    // - {colegioSlug} y {gradoSlug} salen del nombre del colegio/grado ya
    //   guardados en el perfil del usuario (misma función slugColegio()
    //   que se usa para crear el documento del colegio en Firestore).
    // - {botardoId} es el ID único generado al crear la cuenta (ver
    //   generarBotardoId / ofuscarId más arriba). Esta es justamente la
    //   "función única" que se mencionó para este ID: el reconocedor
    //   facial identifica a la persona y solo necesita conocer su
    //   botardoId para saber dónde escribir su asistencia, sin tener que
    //   manejar el UID interno de Firebase Auth.
    // - El equipo de hardware solo necesita hacer un PUT/PATCH sencillo a
    //   esa ruta con la REST API de la Realtime Database, algo como:
    //   PUT https://faceid-50a95-default-rtdb.firebaseio.com/asistencias/{colegioSlug}/{gradoSlug}/{botardoId}/{fecha}.json
    //   Body: {"hora":"07:32","estado":"presente"}

    function formatearFechaCorta(fechaStr) {
        const partes = fechaStr.split('-');
        if (partes.length !== 3) return fechaStr;
        const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return partes[2] + ' ' + meses[parseInt(partes[1], 10) - 1];
    }

    function calcularRachaDiasHabiles(fechas) {
        // Cuenta días consecutivos hacia atrás desde hoy, saltándose
        // fines de semana (sábado/domingo), en los que sí hay asistencia.
        let racha = 0;
        let cursor = new Date();
        for (let i = 0; i < 60; i++) {
            const diaSemana = cursor.getDay();
            if (diaSemana === 0 || diaSemana === 6) {
                cursor.setDate(cursor.getDate() - 1);
                continue;
            }
            const fechaStr = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0');
            if (fechas.indexOf(fechaStr) !== -1) {
                racha++;
                cursor.setDate(cursor.getDate() - 1);
            } else {
                break;
            }
        }
        return racha;
    }

    async function cargarAsistenciasSalon() {
        const elTotales = document.getElementById('salonAsistenciasTotales');
        const elRacha = document.getElementById('salonRacha');
        const elSemana = document.getElementById('salonEstaSemana');
        const elUltima = document.getElementById('salonUltimaAsistencia');
        const elColegio = document.getElementById('salonColegioTexto');
        const elGrado = document.getElementById('salonGradoTexto');
        const elEstado = document.getElementById('salonEstadoReconocedor');
        const elHistorial = document.getElementById('salonHistorialLista');

        if (elColegio) elColegio.textContent = (currentUserData && currentUserData.colegio) || 'Sin definir';
        if (elGrado) elGrado.textContent = (currentUserData && currentUserData.grado) || 'Sin definir';

        if (!currentUserData || !currentUserData.colegio || !currentUserData.grado || !currentUserData.botardoId) {
            if (elEstado) elEstado.textContent = 'Configura tu colegio y grado para empezar a recibir asistencias';
            return;
        }

        const colegioSlug = slugColegio(currentUserData.colegio);
        const gradoSlug = slugColegio(currentUserData.grado);
        const rutaAsistencias = ref(rtdb, `asistencias/${colegioSlug}/${gradoSlug}/${currentUserData.botardoId}`);

        try {
            const snap = await get(rutaAsistencias);
            if (!snap.exists()) {
                if (elEstado) elEstado.textContent = 'Sin datos aún: el reconocedor facial todavía no te ha registrado';
                return;
            }
            const datos = snap.val();
            const fechas = Object.keys(datos).sort();
            const totales = fechas.length;

            const hoy = new Date();
            const inicioSemana = new Date(hoy);
            inicioSemana.setDate(hoy.getDate() - hoy.getDay());
            inicioSemana.setHours(0, 0, 0, 0);
            const estaSemana = fechas.filter(function(f) { return new Date(f + 'T00:00:00') >= inicioSemana; }).length;

            const ultimaFecha = fechas[fechas.length - 1];
            const racha = calcularRachaDiasHabiles(fechas);

            if (elTotales) elTotales.textContent = totales;
            if (elRacha) elRacha.textContent = racha;
            if (elSemana) elSemana.textContent = estaSemana;
            if (elUltima) elUltima.textContent = ultimaFecha ? formatearFechaCorta(ultimaFecha) : '--';
            if (elEstado) elEstado.textContent = 'Conectado: recibiendo asistencias correctamente';

            if (elHistorial) {
                const ultimasDiez = fechas.slice(-10).reverse();
                elHistorial.innerHTML = ultimasDiez.map(function(f) {
                    const registro = datos[f];
                    return `
                        <div class="activity-item">
                            <span class="activity-dot" style="background:#2e7d32;"></span>
                            <div class="activity-content">
                                <p><strong>Asistencia registrada</strong> — ${escapeHtml(registro.estado || 'presente')}</p>
                                <span class="activity-time">${escapeHtml(f)}${registro.hora ? ' · ' + escapeHtml(registro.hora) : ''}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch (err) {
            console.error('Error cargando asistencias:', err);
            if (elEstado) elEstado.textContent = 'No se pudieron cargar las asistencias';
        }
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
        // El modo oscuro se quitó de la app (no se veía bien), así que
        // siempre se aplica el tema claro sin importar lo que haya
        // quedado guardado de antes en la cuenta.
        root.setAttribute('data-tema', 'claro');
        root.style.setProperty('--accent-user', apariencia.acento || '#1a2332');

        document.querySelectorAll('.accent-swatch').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.accent === apariencia.acento);
        });
    }

    async function guardarApariencia() {
        try {
            await set(ref(rtdb, 'users/' + currentUser.uid + '/settings/apariencia'), apariencia);
            // El acento es parte de "tu estilo" y se publica en el perfil
            // para que quien te visite lo vea también, sin cambiarle su
            // propio tema. El fondo/banner ahora se maneja aparte (ver
            // perfil.banner / perfil.avatar más abajo).
            await update(ref(rtdb, 'users/' + currentUser.uid + '/perfil'), {
                acento: apariencia.acento
            });
            if (!viewingProfileUid) aplicarAccentPerfilView(apariencia.acento);
        } catch (err) {
            console.error('Error guardando apariencia:', err);
        }
    }

    // Carpeta con las imágenes que se pueden elegir tanto para el banner
    // como para la foto de perfil (mismo set de imágenes para ambos, como
    // se pidió). Para agregar una nueva: sube el archivo como
    // recourses/images/backgrounds/background_N.webp y añade su miniatura
    // en construirGridSelectorImagenes() más abajo. No hace falta tocar
    // nada más del JS.
    const PROFILE_BG_PATH = '../recourses/images/backgrounds/';
    const PROFILE_BG_COUNT = 10; // background_1.webp ... background_10.webp

    // Paleta de colores sólidos para quien prefiera un banner sin imagen.
    const BANNER_COLORS = ['#1a2332', '#0d6efd', '#7b2cbf', '#d81b60', '#2e7d32', '#e65100', '#00838f', '#c62828', '#f9a825', '#4527a0', '#37474f', '#ad1457'];

    // Aplica el acento elegido por el dueño del perfil, pero SOLO dentro
    // de la tarjeta de perfil (#profileView) — así quien visita un perfil
    // ve "el estilo" de esa persona sin que le cambie su propio tema en
    // el resto de la app. El banner/avatar se aplican aparte con
    // aplicarBannerPerfilView() / aplicarAvatarPerfilView().
    function aplicarAccentPerfilView(acento) {
        const view = document.getElementById('profileView');
        if (!view) return;
        view.style.setProperty('--accent-user', acento || '#1a2332');
    }

    function aplicarBannerPerfilView(banner) {
        const bannerEl = document.getElementById('profileBanner');
        if (!bannerEl) return;
        banner = banner || { tipo: 'default' };
        bannerEl.classList.remove('banner-imagen', 'banner-color');
        bannerEl.style.backgroundImage = '';
        bannerEl.style.backgroundColor = '';
        bannerEl.style.backgroundPosition = '';
        if (banner.tipo === 'imagen' && banner.valor) {
            bannerEl.classList.add('banner-imagen');
            bannerEl.style.backgroundImage = `url('${PROFILE_BG_PATH}${banner.valor}.webp')`;
            bannerEl.style.backgroundPosition = `${banner.posX != null ? banner.posX : 50}% ${banner.posY != null ? banner.posY : 50}%`;
        } else if (banner.tipo === 'color' && banner.valor) {
            bannerEl.classList.add('banner-color');
            bannerEl.style.backgroundColor = banner.valor;
        }
    }

    function aplicarAvatarPerfilView(avatar, imgEl) {
        const img = imgEl || document.getElementById('profileAvatar');
        if (!img) return;
        avatar = avatar || { tipo: 'default' };
        if (avatar.tipo === 'imagen' && avatar.valor) {
            img.src = PROFILE_BG_PATH + avatar.valor + '.webp';
            img.style.objectPosition = `${avatar.posX != null ? avatar.posX : 50}% ${avatar.posY != null ? avatar.posY : 50}%`;
        } else {
            img.src = '../recourses/images/S/notfound.webp';
            img.style.objectPosition = '';
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
                    acento: val.acento || '#1a2332'
                };
            }
        } catch (err) {
            console.error('Error cargando apariencia:', err);
        }
        aplicarApariencia();
    }

    // Carga el banner y la foto de perfil guardados (una sola vez al
    // iniciar sesión) y los aplica tanto al mini-avatar de la barra
    // lateral como a la vista de "Mi perfil".
    async function cargarImagenesPerfil() {
        if (!currentUser) return;
        try {
            const snap = await get(ref(rtdb, 'users/' + currentUser.uid + '/perfil'));
            if (snap.exists()) {
                const val = snap.val();
                if (val.banner) perfilImagenes.banner = Object.assign({ tipo: 'default', posX: 50, posY: 50 }, val.banner);
                if (val.avatar) perfilImagenes.avatar = Object.assign({ tipo: 'default', posX: 50, posY: 50 }, val.avatar);
            }
        } catch (err) {
            console.error('Error cargando imágenes de perfil:', err);
        }
        aplicarBannerPerfilView(perfilImagenes.banner);
        aplicarAvatarPerfilView(perfilImagenes.avatar);
        aplicarAvatarPerfilView(perfilImagenes.avatar, document.getElementById('userAvatar'));
    }

    function initApariencia() {
        document.querySelectorAll('.accent-swatch').forEach(function(btn) {
            if (btn._wired) return;
            btn._wired = true;
            btn.addEventListener('click', function() {
                apariencia.acento = this.dataset.accent;
                aplicarApariencia();
                guardarApariencia();
            });
        });
        const goBtn = document.getElementById('goToProfileAppearanceBtn');
        if (goBtn && !goBtn._wired) {
            goBtn._wired = true;
            goBtn.addEventListener('click', function() {
                mostrarPerfilPropio();
                navigateTo('section-perfil');
            });
        }
    }

    // ===== Selector de imagen (banner / foto de perfil) =====
    // Comparten el mismo set de imágenes preestablecidas. El banner además
    // admite un color sólido liso para quien no quiera usar imágenes.
    let imgPickerState = null;

    function construirGridImagenesHtml(seleccionActual) {
        let html = '';
        for (let i = 1; i <= PROFILE_BG_COUNT; i++) {
            const valor = 'background_' + i;
            const activa = seleccionActual === valor;
            html += `<button type="button" class="img-picker-swatch${activa ? ' active' : ''}" data-valor="${valor}" style="background-image:url('${PROFILE_BG_PATH}${valor}.webp');" aria-label="Imagen ${i}"></button>`;
        }
        return html;
    }

    function actualizarPreviewImgPicker() {
        const preview = document.getElementById('imgPickerPreview');
        if (!preview || !imgPickerState) return;
        preview.className = 'img-picker-preview' + (imgPickerState.tipo === 'avatar' ? ' img-picker-preview-avatar' : '');
        if (imgPickerState.tipoSeleccion === 'imagen' && imgPickerState.valor) {
            preview.style.backgroundImage = `url('${PROFILE_BG_PATH}${imgPickerState.valor}.webp')`;
            preview.style.backgroundColor = '';
            preview.style.backgroundPosition = `${imgPickerState.posX}% ${imgPickerState.posY}%`;
        } else if (imgPickerState.tipoSeleccion === 'color' && imgPickerState.valor) {
            preview.style.backgroundImage = '';
            preview.style.backgroundColor = imgPickerState.valor;
            preview.style.backgroundPosition = '';
        } else {
            preview.style.backgroundImage = '';
            preview.style.backgroundColor = '';
            preview.style.backgroundPosition = '';
        }
        const posWrap = document.getElementById('imgPickerPositionWrap');
        if (posWrap) posWrap.style.display = imgPickerState.tipoSeleccion === 'imagen' ? 'flex' : 'none';
    }

    function buildImagePickerModal() {
        if (document.getElementById('imgPickerOverlay')) return;
        const html = `
            <div class="modal-overlay" id="imgPickerOverlay">
                <div class="modal img-picker-modal">
                    <div class="modal-header">
                        <h3 id="imgPickerTitle">Cambiar imagen</h3>
                        <button class="modal-close" id="imgPickerClose">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="img-picker-preview" id="imgPickerPreview"></div>
                        <div class="img-picker-position" id="imgPickerPositionWrap" style="display:none;">
                            <label><i class="fas fa-arrows-left-right"></i> Posición horizontal
                                <input type="range" min="0" max="100" value="50" id="imgPickerPosX" />
                            </label>
                            <label><i class="fas fa-arrows-up-down"></i> Posición vertical
                                <input type="range" min="0" max="100" value="50" id="imgPickerPosY" />
                            </label>
                            <p class="img-picker-hint">Usa las barras para acomodar la imagen si es más grande que el espacio.</p>
                        </div>
                        <p class="img-picker-label">Imágenes</p>
                        <div class="img-picker-grid" id="imgPickerGrid"></div>
                        <div id="imgPickerColorsWrap" style="display:none;">
                            <p class="img-picker-label">O un color sólido (sin imagen)</p>
                            <div class="img-picker-colors" id="imgPickerColors"></div>
                        </div>
                        <button class="btn btn-secondary btn-sm" id="imgPickerDefaultBtn" type="button">Quitar y usar el estilo por defecto</button>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-cancel" id="imgPickerCancel">Cancelar</button>
                        <button class="btn btn-save" id="imgPickerSave">Guardar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('imgPickerClose').addEventListener('click', cerrarSelectorImagen);
        document.getElementById('imgPickerCancel').addEventListener('click', cerrarSelectorImagen);
        document.getElementById('imgPickerOverlay').addEventListener('click', function(e) {
            if (e.target === this) cerrarSelectorImagen();
        });
        document.getElementById('imgPickerSave').addEventListener('click', guardarSeleccionImagen);
        document.getElementById('imgPickerDefaultBtn').addEventListener('click', function() {
            imgPickerState.tipoSeleccion = 'default';
            imgPickerState.valor = null;
            document.querySelectorAll('.img-picker-swatch, .img-picker-color').forEach(function(b) { b.classList.remove('active'); });
            actualizarPreviewImgPicker();
        });
        document.getElementById('imgPickerPosX').addEventListener('input', function() {
            imgPickerState.posX = Number(this.value);
            actualizarPreviewImgPicker();
        });
        document.getElementById('imgPickerPosY').addEventListener('input', function() {
            imgPickerState.posY = Number(this.value);
            actualizarPreviewImgPicker();
        });
    }

    function abrirSelectorImagen(tipo) {
        buildImagePickerModal();
        const actual = tipo === 'avatar' ? perfilImagenes.avatar : perfilImagenes.banner;
        imgPickerState = {
            tipo: tipo,
            tipoSeleccion: actual.tipo || 'default',
            valor: actual.valor || null,
            posX: actual.posX != null ? actual.posX : 50,
            posY: actual.posY != null ? actual.posY : 50
        };

        document.getElementById('imgPickerTitle').textContent = tipo === 'avatar' ? 'Cambiar foto de perfil' : 'Cambiar banner';
        document.getElementById('imgPickerPosX').value = imgPickerState.posX;
        document.getElementById('imgPickerPosY').value = imgPickerState.posY;

        const grid = document.getElementById('imgPickerGrid');
        grid.innerHTML = construirGridImagenesHtml(imgPickerState.tipoSeleccion === 'imagen' ? imgPickerState.valor : null);
        grid.querySelectorAll('.img-picker-swatch').forEach(function(btn) {
            btn.addEventListener('click', function() {
                imgPickerState.tipoSeleccion = 'imagen';
                imgPickerState.valor = this.dataset.valor;
                grid.querySelectorAll('.img-picker-swatch').forEach(function(b) { b.classList.remove('active'); });
                document.querySelectorAll('.img-picker-color').forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
                actualizarPreviewImgPicker();
            });
        });

        const colorsWrap = document.getElementById('imgPickerColorsWrap');
        const colorsGrid = document.getElementById('imgPickerColors');
        if (tipo === 'banner') {
            colorsWrap.style.display = 'block';
            colorsGrid.innerHTML = BANNER_COLORS.map(function(c) {
                const activa = imgPickerState.tipoSeleccion === 'color' && imgPickerState.valor === c;
                return `<button type="button" class="img-picker-color${activa ? ' active' : ''}" data-color="${c}" style="background:${c};" aria-label="Color ${c}"></button>`;
            }).join('');
            colorsGrid.querySelectorAll('.img-picker-color').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    imgPickerState.tipoSeleccion = 'color';
                    imgPickerState.valor = this.dataset.color;
                    grid.querySelectorAll('.img-picker-swatch').forEach(function(b) { b.classList.remove('active'); });
                    colorsGrid.querySelectorAll('.img-picker-color').forEach(function(b) { b.classList.remove('active'); });
                    this.classList.add('active');
                    actualizarPreviewImgPicker();
                });
            });
        } else {
            colorsWrap.style.display = 'none';
        }

        actualizarPreviewImgPicker();
        document.getElementById('imgPickerOverlay').classList.add('open');
    }

    function cerrarSelectorImagen() {
        const overlay = document.getElementById('imgPickerOverlay');
        if (overlay) overlay.classList.remove('open');
        imgPickerState = null;
    }

    async function guardarSeleccionImagen() {
        if (!imgPickerState || !currentUser) return;
        const tipo = imgPickerState.tipo;
        const datos = {
            tipo: imgPickerState.tipoSeleccion,
            valor: imgPickerState.tipoSeleccion === 'default' ? null : imgPickerState.valor,
            posX: imgPickerState.tipoSeleccion === 'imagen' ? imgPickerState.posX : 50,
            posY: imgPickerState.tipoSeleccion === 'imagen' ? imgPickerState.posY : 50
        };
        try {
            await update(ref(rtdb, 'users/' + currentUser.uid + '/perfil'), { [tipo]: datos });
            perfilImagenes[tipo] = datos;
            if (tipo === 'banner') {
                aplicarBannerPerfilView(datos);
            } else {
                aplicarAvatarPerfilView(datos);
                aplicarAvatarPerfilView(datos, document.getElementById('userAvatar'));
            }
            cerrarSelectorImagen();
        } catch (err) {
            console.error('Error guardando imagen de perfil:', err);
            alert('No se pudo guardar: ' + (err.code || err.message));
        }
    }

    function initEditorImagenesPerfil() {
        const bannerBtn = document.getElementById('editBannerBtn');
        if (bannerBtn && !bannerBtn._wired) {
            bannerBtn._wired = true;
            bannerBtn.addEventListener('click', function() { abrirSelectorImagen('banner'); });
        }
        const avatarBtn = document.getElementById('editAvatarBtn');
        if (avatarBtn && !avatarBtn._wired) {
            avatarBtn._wired = true;
            avatarBtn.addEventListener('click', function() { abrirSelectorImagen('avatar'); });
        }
    }

    // ===== Cambiar nombre / nombre de usuario =====
    // Nombre: se puede cambiar, pero como máximo una vez cada 30 días
    // (para que no sea algo que la gente cambie todo el tiempo).
    // Usuario: se puede cambiar UNA sola vez en la vida de la cuenta (la
    // primera vez que lo cambian, después de haberlo creado en el
    // registro). Para cambios adicionales hay que escribirle a soporte
    // (el correo que aparece en terminos.html).
    const DIAS_COOLDOWN_NOMBRE = 30;
    const SOPORTE_EMAIL = 'jhorkbecerra@gmail.com';

    function diasRestantes(desdeTs, diasEspera) {
        if (!desdeTs) return 0;
        const transcurridos = (Date.now() - desdeTs) / (1000 * 60 * 60 * 24);
        return Math.max(0, Math.ceil(diasEspera - transcurridos));
    }

    function actualizarNotasCambioNombreUsuario() {
        const nameInput = document.getElementById('changeNameInput');
        const nameNote = document.getElementById('changeNameNote');
        const nameBtn = document.getElementById('changeNameBtn');
        const userInput = document.getElementById('changeUsernameInput');
        const userNote = document.getElementById('changeUsernameNote');
        const userBtn = document.getElementById('changeUsernameBtn');
        if (!currentUserData) return;

        if (nameInput && !nameInput._focused) nameInput.value = currentUserData.name || '';
        if (userInput && !userInput._focused) userInput.value = currentUserData.username || '';

        const restantesNombre = diasRestantes(currentUserData.nameChangedAt, DIAS_COOLDOWN_NOMBRE);
        if (nameNote) {
            nameNote.textContent = restantesNombre > 0
                ? `Podrás volver a cambiar tu nombre en ${restantesNombre} día${restantesNombre === 1 ? '' : 's'}.`
                : 'Puedes cambiar tu nombre una vez al mes.';
        }
        if (nameBtn) nameBtn.disabled = restantesNombre > 0;

        const yaUsoSuCambio = !!currentUserData.usernameChanged;
        if (userNote) {
            userNote.innerHTML = yaUsoSuCambio
                ? `Ya usaste tu único cambio de nombre de usuario. Para cambiarlo de nuevo, escribe a <a href="mailto:${SOPORTE_EMAIL}">soporte</a>.`
                : 'Puedes cambiar tu nombre de usuario una sola vez en la vida de tu cuenta.';
        }
        if (userInput) userInput.disabled = yaUsoSuCambio;
        if (userBtn) userBtn.disabled = yaUsoSuCambio;
    }

    async function handleChangeName() {
        const input = document.getElementById('changeNameInput');
        const nombre = input.value.trim();
        if (!nombre) { alert('El nombre no puede estar vacío.'); return; }
        const restantes = diasRestantes(currentUserData.nameChangedAt, DIAS_COOLDOWN_NOMBRE);
        if (restantes > 0) {
            alert(`Ya cambiaste tu nombre hace poco. Podrás volver a hacerlo en ${restantes} día${restantes === 1 ? '' : 's'}.`);
            return;
        }
        try {
            const ahora = Date.now();
            await setDoc(doc(db, 'users', currentUser.uid), { name: nombre, nameChangedAt: ahora }, { merge: true });
            currentUserData.name = nombre;
            currentUserData.nameChangedAt = ahora;
            loadUserData();
            actualizarNotasCambioNombreUsuario();
            alert('Tu nombre se actualizó correctamente.');
        } catch (err) {
            console.error('Error cambiando nombre:', err);
            alert('No se pudo actualizar el nombre: ' + (err.code || err.message));
        }
    }

    async function handleChangeUsername() {
        if (currentUserData.usernameChanged) {
            alert(`Ya usaste tu único cambio de nombre de usuario. Escribe a ${SOPORTE_EMAIL} para cambios adicionales.`);
            return;
        }
        const input = document.getElementById('changeUsernameInput');
        const nuevo = input.value.trim().toLowerCase();
        const usernameRegex = /^[A-Za-z0-9_]+$/;
        if (!nuevo || !usernameRegex.test(nuevo) || nuevo.length < 3) {
            alert('El nombre de usuario debe tener al menos 3 caracteres: solo letras, números y guion bajo (_).');
            return;
        }
        if (nuevo === currentUserData.username) {
            alert('Ese ya es tu nombre de usuario actual.');
            return;
        }
        try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('username', '==', nuevo));
            const snap = await getDocs(q);
            const tomado = !snap.empty && snap.docs.some(function(d) { return d.id !== currentUser.uid; });
            if (tomado) {
                alert('Ese nombre de usuario ya está en uso. Elige otro.');
                return;
            }
            if (!confirm(`¿Seguro que quieres cambiar tu nombre de usuario a "${nuevo}"? Solo puedes hacerlo una vez, para cambios futuros tendrás que contactar a soporte.`)) return;

            await setDoc(doc(db, 'users', currentUser.uid), { username: nuevo, usernameChanged: true }, { merge: true });
            currentUserData.username = nuevo;
            currentUserData.usernameChanged = true;
            loadUserData();
            actualizarNotasCambioNombreUsuario();
            alert('Tu nombre de usuario se actualizó correctamente.');
        } catch (err) {
            console.error('Error cambiando username:', err);
            alert('No se pudo actualizar el nombre de usuario: ' + (err.code || err.message));
        }
    }

    function initCambioNombreUsuario() {
        const nameInput = document.getElementById('changeNameInput');
        const userInput = document.getElementById('changeUsernameInput');
        if (nameInput && !nameInput._wired) {
            nameInput._wired = true;
            nameInput.addEventListener('focus', function() { this._focused = true; });
            nameInput.addEventListener('blur', function() { this._focused = false; });
        }
        if (userInput && !userInput._wired) {
            userInput._wired = true;
            userInput.addEventListener('focus', function() { this._focused = true; });
            userInput.addEventListener('blur', function() { this._focused = false; });
        }
        const nameBtn = document.getElementById('changeNameBtn');
        if (nameBtn && !nameBtn._wired) {
            nameBtn._wired = true;
            nameBtn.addEventListener('click', handleChangeName);
        }
        const userBtn = document.getElementById('changeUsernameBtn');
        if (userBtn && !userBtn._wired) {
            userBtn._wired = true;
            userBtn.addEventListener('click', handleChangeUsername);
        }
        actualizarNotasCambioNombreUsuario();
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

    async function init() {
        await manejarRedireccionSpotify();
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
        cargarImagenesPerfil();
        iniciarListenerNotificaciones();
        cargarUserStats().then(registrarEntrada);
        cargarChatsIA().then(renderUserStats);
        initChatUI();
        initMessagesTabs();
        initApariencia();
        initEditorImagenesPerfil();
        initCambioNombreUsuario();
        initIdUnico();
        initGradoColegio();
        initSpotify();
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

        cargarAsistenciasSalon();

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

        marcarPasoCarga('perfil', 'done');
        marcarPasoCarga('listo', 'done');
        actualizarTextoCarga('¡Todo listo!');
        setTimeout(ocultarAppLoader, 250);
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
            if (ES_VENTANA_EMERGENTE_SPOTIFY) {
                // La ventana emergente de Spotify no necesita loguearse
                // de nuevo: si por alguna razón (cookies bloqueadas, etc.)
                // no hay sesión ahí, simplemente avisamos en el popup en
                // vez de mandarlo a la pantalla de login.
                mostrarMensajePopupSpotify('No se pudo verificar tu sesión. Cierra esta ventana y vuelve a intentarlo desde el sitio.');
                return;
            }
            window.location.href = '../html/login.html';
            return;
        }
        currentUser = user;
        if (ES_VENTANA_EMERGENTE_SPOTIFY) {
            // Este es el popup de conexión: solo hace el intercambio de
            // tokens con Spotify y se cierra solo, sin montar todo el
            // dashboard ni tocar la pestaña principal del sitio.
            manejarRedireccionSpotify();
            return;
        }
        marcarPasoCarga('auth', 'done');
        marcarPasoCarga('datos', 'active');
        actualizarTextoCarga('Cargando tus datos...');
        loadOrRequestUserData(user);
    });

})();