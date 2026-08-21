// ===== config.js =====
(function() {
    'use strict';

    // ===== VARIABLES GLOBALES =====
    const userData = {
        name: 'Usuario',
        email: 'usuario@ejemplo.com',
        phone: '+57 300 000 0000',
        role: 'Administrador'
    };

    // ===== PROYECTOS =====
    const proyectos = [
        { nombre: 'camara', icono: 'fa-camera', descripcion: 'Reconocimiento facial en tiempo real' },
    ];

    // ===== DOM REFS =====
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const sections = document.querySelectorAll('.dashboard-section');
    const pageTitle = document.getElementById('pageTitle');
    const logoutBtn = document.getElementById('logoutBtn');

    // Perfil
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const editName = document.getElementById('editName');
    const editEmail = document.getElementById('editEmail');
    const editPhone = document.getElementById('editPhone');
    const saveProfileBtn = document.getElementById('saveProfileBtn');

    // Notificaciones
    const notifBtn = document.getElementById('notifBtn');
    const notifDropdown = document.getElementById('notifDropdown');
    const notifBadge = document.getElementById('notifBadge');

    // Cámara
    const startCameraBtn = document.getElementById('startCameraBtn');
    const captureBtn = document.getElementById('captureBtn');
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    const videoFeed = document.getElementById('videoFeed');
    const overlayCanvas = document.getElementById('overlayCanvas');
    const videoPlaceholder = document.getElementById('videoPlaceholder');
    const cameraResult = document.getElementById('cameraResult');
    const cameraStatus = document.getElementById('cameraStatus');

    // Proyectos
    const projectsGrid = document.getElementById('projectsGrid');

    // Tema
    const themeToggle = document.getElementById('themeToggle');

    // Estadísticas
    const totalReconocimientos = document.getElementById('totalReconocimientos');
    const totalUsuarios = document.getElementById('totalUsuarios');
    const tiempoPromedio = document.getElementById('tiempoPromedio');
    const tasaPrecision = document.getElementById('tasaPrecision');

    // ===== VARIABLES DE ESTADÍSTICAS =====
    let recognitionCount = 0;
    let userCount = 32;
    let precisionValue = 98.7;
    let tiempoValue = 2.4;
    let reconocimientosPorSegundo = 0.3; // Reconocimientos por segundo (lento)
    let lastUpdateTime = Date.now();
    let precisionDirection = 1; // 1 = sube, -1 = baja
    let tiempoDirection = 1;
    let recognitionCounter = 0;

    // ===== FUNCIONES =====

    // Navegación
    function navigateTo(sectionId) {
        const sectionName = sectionId.replace('section-', '');
        const titles = {
            panel: 'Panel',
            perfil: 'Perfil',
            clases: 'Clases',
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

    // Cargar proyectos
    function loadProjects() {
        if (!projectsGrid) return;
        projectsGrid.innerHTML = '';
        proyectos.forEach(proyecto => {
            const card = document.createElement('a');
            card.className = 'project-card';
            card.href = `../html/proyectos/${proyecto.nombre}.html`;
            card.innerHTML = `
                <div class="project-icon"><i class="fas ${proyecto.icono}"></i></div>
                <h3>${proyecto.nombre.charAt(0).toUpperCase() + proyecto.nombre.slice(1)}</h3>
                <p>${proyecto.descripcion}</p>
            `;
            projectsGrid.appendChild(card);
        });
    }

    // Cargar datos de usuario
    function loadUserData() {
        const storedName = localStorage.getItem('botardo_user_name');
        const storedEmail = localStorage.getItem('botardo_user_email');
        const storedPhone = localStorage.getItem('botardo_user_phone');

        const name = storedName || userData.name;
        const email = storedEmail || userData.email;
        const phone = storedPhone || userData.phone;

        document.getElementById('userNameDisplay').textContent = name;
        document.getElementById('profileName').textContent = name;
        document.getElementById('profileEmail').textContent = email;
        editName.value = name;
        editEmail.value = email;
        editPhone.value = phone;
    }

    // ===== ACTUALIZAR ESTADÍSTICAS EN TIEMPO REAL =====
    function updateStats() {
        const now = Date.now();
        const deltaTime = (now - lastUpdateTime) / 1000; // segundos
        lastUpdateTime = now;

        // 1. RECONOCIMIENTOS - sube lentamente sin parar
        recognitionCount += reconocimientosPorSegundo * deltaTime;
        if (totalReconocimientos) {
            totalReconocimientos.textContent = Math.floor(recognitionCount);
        }

        // 2. USUARIOS ACTIVOS - varía de forma realista (30-55)
        // Cambia aleatoriamente pero con inercia (sube/baja lentamente)
        const userChange = (Math.random() - 0.48) * 0.3; // -0.144 a +0.156 por segundo
        userCount += userChange * deltaTime;
        userCount = Math.min(Math.max(userCount, 28), 58);
        if (totalUsuarios) {
            totalUsuarios.textContent = Math.round(userCount);
        }

        // 3. TIEMPO PROMEDIO - varía entre 1.8 y 3.2 segundos
        // Cambia muy lentamente
        if (Math.random() < 0.01 * deltaTime) {
            tiempoDirection *= -1;
        }
        tiempoValue += (Math.random() * 0.02 - 0.01) * tiempoDirection * deltaTime;
        tiempoValue = Math.min(Math.max(tiempoValue, 1.8), 3.2);
        if (tiempoPromedio) {
            tiempoPromedio.textContent = tiempoValue.toFixed(1) + 's';
        }

        // 4. PRECISIÓN - varía entre 96.5% y 99.2%
        // Cambia según los reconocimientos (cada 50 reconocimientos)
        if (Math.random() < 0.005 * deltaTime) {
            precisionDirection *= -1;
        }
        // Pequeñas variaciones constantes
        const precisionChange = (Math.random() * 0.04 - 0.02) * precisionDirection;
        precisionValue += precisionChange * deltaTime * 0.3;
        precisionValue = Math.min(Math.max(precisionValue, 96.5), 99.2);
        if (tasaPrecision) {
            tasaPrecision.textContent = precisionValue.toFixed(1) + '%';
        }

        // 5. NOTIFICACIONES - actualizar badge cada cierto tiempo
        if (Math.random() < 0.001 * deltaTime) {
            const currentBadge = parseInt(notifBadge.textContent) || 0;
            if (currentBadge < 9) {
                notifBadge.textContent = currentBadge + 1;
                notifBadge.style.display = 'flex';
            }
        }
    }

    // ===== EVENTOS =====

    // Menu toggle
    if (menuToggle) {
        menuToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });
    }

    // Cerrar sidebar al hacer clic fuera
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            const isSidebar = sidebar.contains(e.target);
            const isMenuToggle = menuToggle.contains(e.target);
            if (!isSidebar && !isMenuToggle && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
            }
        }
    });

    // Navegación
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const sectionId = this.dataset.section;
            navigateTo(`section-${sectionId}`);
        });
    });

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
                localStorage.removeItem('botardo_remember');
                localStorage.removeItem('botardo_email');
                window.location.href = '../html/login.html';
            }
        });
    }

    // Notificaciones
    if (notifBtn) {
        notifBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            notifDropdown.classList.toggle('open');
        });

        document.addEventListener('click', function(e) {
            if (!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
                notifDropdown.classList.remove('open');
            }
        });

        const markAllBtn = document.querySelector('.notif-mark-all');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', function() {
                document.querySelectorAll('.notif-item.unread').forEach(item => {
                    item.classList.remove('unread');
                });
                if (notifBadge) {
                    notifBadge.textContent = '0';
                    notifBadge.style.display = 'none';
                }
            });
        }
    }

    // Guardar perfil
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

    // ===== CÁMARA =====
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

    // ===== TEMA OSCURO/CLARO =====
    let darkMode = false;

    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            darkMode = !darkMode;
            if (darkMode) {
                document.documentElement.style.setProperty('--bg-main', '#0f0f1a');
                document.documentElement.style.setProperty('--card-bg', 'rgba(30, 30, 50, 0.85)');
                document.documentElement.style.setProperty('--text-primary', '#e8e8f0');
                document.documentElement.style.setProperty('--text-secondary', '#a8a8c0');
                document.documentElement.style.setProperty('--border-color', 'rgba(255,255,255,0.06)');
                this.textContent = 'Modo claro';
            } else {
                document.documentElement.style.setProperty('--bg-main', '#f0f2f5');
                document.documentElement.style.setProperty('--card-bg', 'rgba(255,255,255,0.85)');
                document.documentElement.style.setProperty('--text-primary', '#1a2332');
                document.documentElement.style.setProperty('--text-secondary', '#4a5a6e');
                document.documentElement.style.setProperty('--border-color', 'rgba(0,0,0,0.06)');
                this.textContent = 'Cambiar tema';
            }
        });
    }

    // ===== NUEVO PROYECTO =====
    const newProjectBtn = document.getElementById('newProjectBtn');
    if (newProjectBtn) {
        newProjectBtn.addEventListener('click', function() {
            const nombre = prompt('Ingresa el nombre del nuevo proyecto:');
            if (nombre && nombre.trim()) {
                const cleanName = nombre.trim().toLowerCase().replace(/\s+/g, '-');
                proyectos.push({
                    nombre: cleanName,
                    icono: 'fa-file',
                    descripcion: 'Proyecto nuevo'
                });
                loadProjects();
                alert(`Proyecto "${nombre}" creado exitosamente.`);
            }
        });
    }

    // ===== INICIALIZACIÓN =====
    function init() {
        loadUserData();
        loadProjects();

        // Configurar estado inicial de la cámara
        updateCameraStatus(false, 'Desconectada');

        // Inicializar contadores
        recognitionCount = 127;
        userCount = 32;
        precisionValue = 98.7;
        tiempoValue = 2.4;
        lastUpdateTime = Date.now();

        // Mostrar panel por defecto
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

        // Iniciar actualización de estadísticas en tiempo real
        // Usamos requestAnimationFrame para actualizar suavemente
        function statsLoop() {
            updateStats();
            requestAnimationFrame(statsLoop);
        }
        requestAnimationFrame(statsLoop);

        // También actualizar cada 100ms como respaldo
        setInterval(() => {
            // Pequeña actualización adicional para mantener fluidez
        }, 100);
    }

    // ===== EVENTO DE REDIMENSIÓN =====
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // Reajustar elementos si es necesario
        }, 250);
    });

    // ===== INICIAR =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();