import { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, googleProvider, githubProvider, doc, setDoc, collection, query, where, getDocs } from './firebase-config.js';

(function() {
    'use strict';

    var loginPanel = document.getElementById('loginPanel');
    var registerPanel = document.getElementById('registerPanel');
    var showRegister = document.getElementById('showRegister');
    var showLogin = document.getElementById('showLogin');

    var loginForm = document.getElementById('loginForm');
    var emailInput = document.getElementById('email');
    var passwordInput = document.getElementById('password');
    var emailError = document.getElementById('emailError');
    var passwordError = document.getElementById('passwordError');
    var togglePassword = document.getElementById('togglePassword');
    var rememberCheck = document.getElementById('remember');

    var registerForm = document.getElementById('registerForm');
    var regName = document.getElementById('regName');
    var regUsername = document.getElementById('regUsername');
    var regEmail = document.getElementById('regEmail');
    var regPassword = document.getElementById('regPassword');
    var regConfirmPassword = document.getElementById('regConfirmPassword');
    var regNameError = document.getElementById('regNameError');
    var regUsernameError = document.getElementById('regUsernameError');
    var regEmailError = document.getElementById('regEmailError');
    var regPasswordError = document.getElementById('regPasswordError');
    var regConfirmError = document.getElementById('regConfirmError');
    var toggleRegPassword = document.getElementById('toggleRegPassword');
    var toggleRegConfirm = document.getElementById('toggleRegConfirm');

    var menuToggle = document.getElementById('menuToggle');
    var navMenu = document.getElementById('navMenu');

    menuToggle.addEventListener('click', function() {
        navMenu.classList.toggle('active');
    });

    document.querySelectorAll('.nav-menu a').forEach(function(link) {
        link.addEventListener('click', function() {
            navMenu.classList.remove('active');
        });
    });

    document.addEventListener('click', function(event) {
        var isClickInside = navMenu.contains(event.target) || menuToggle.contains(event.target);
        if (!isClickInside && navMenu.classList.contains('active')) {
            navMenu.classList.remove('active');
        }
    });

    showRegister.addEventListener('click', function(e) {
        e.preventDefault();
        loginPanel.style.display = 'none';
        registerPanel.style.display = 'block';
        document.querySelector('.login-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    showLogin.addEventListener('click', function(e) {
        e.preventDefault();
        registerPanel.style.display = 'none';
        loginPanel.style.display = 'block';
        document.querySelector('.login-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    function validateLoginEmail(email) {
        var trimmed = email.trim();
        if (trimmed === '') {
            emailError.textContent = 'El correo es obligatorio.';
            emailInput.style.borderColor = '#dc3545';
            return false;
        }
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmed)) {
            emailError.textContent = 'Ingresa un correo válido (ejemplo@dominio.com).';
            emailInput.style.borderColor = '#dc3545';
            return false;
        }
        emailError.textContent = '';
        emailInput.style.borderColor = '#28a745';
        return true;
    }

    function validateLoginPassword(password) {
        if (password.trim() === '') {
            passwordError.textContent = 'La contraseña es obligatoria.';
            passwordInput.style.borderColor = '#dc3545';
            return false;
        }
        if (password.length < 6) {
            passwordError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
            passwordInput.style.borderColor = '#dc3545';
            return false;
        }
        passwordError.textContent = '';
        passwordInput.style.borderColor = '#28a745';
        return true;
    }

    emailInput.addEventListener('blur', function() { validateLoginEmail(this.value); });
    emailInput.addEventListener('input', function() {
        if (this.value.trim() === '') {
            emailError.textContent = '';
            this.style.borderColor = '';
        } else {
            validateLoginEmail(this.value);
        }
    });

    passwordInput.addEventListener('blur', function() { validateLoginPassword(this.value); });
    passwordInput.addEventListener('input', function() {
        if (this.value.trim() === '') {
            passwordError.textContent = '';
            this.style.borderColor = '';
        } else {
            validateLoginPassword(this.value);
        }
    });

    togglePassword.addEventListener('click', function() {
        var type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        this.setAttribute('aria-label', type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    });

    function validateRegName(name) {
        var trimmed = name.trim();
        if (trimmed === '') {
            regNameError.textContent = 'El nombre es obligatorio.';
            regName.style.borderColor = '#dc3545';
            return false;
        }
        if (trimmed.length < 2) {
            regNameError.textContent = 'Ingresa un nombre válido (mínimo 2 caracteres).';
            regName.style.borderColor = '#dc3545';
            return false;
        }
        regNameError.textContent = '';
        regName.style.borderColor = '#28a745';
        return true;
    }

    function validateRegUsername(username) {
        var trimmed = username.trim();
        if (trimmed === '') {
            regUsernameError.textContent = 'El nombre de usuario es obligatorio.';
            regUsername.style.borderColor = '#dc3545';
            return false;
        }
        var usernameRegex = /^[A-Za-z0-9_]+$/;
        if (!usernameRegex.test(trimmed)) {
            regUsernameError.textContent = 'Solo letras, números y guion bajo (_), sin espacios ni símbolos.';
            regUsername.style.borderColor = '#dc3545';
            return false;
        }
        if (trimmed.length < 3) {
            regUsernameError.textContent = 'Mínimo 3 caracteres.';
            regUsername.style.borderColor = '#dc3545';
            return false;
        }
        regUsernameError.textContent = '';
        regUsername.style.borderColor = '#28a745';
        return true;
    }

    function validateRegEmail(email) {
        var trimmed = email.trim();
        if (trimmed === '') {
            regEmailError.textContent = 'El correo es obligatorio.';
            regEmail.style.borderColor = '#dc3545';
            return false;
        }
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmed)) {
            regEmailError.textContent = 'Ingresa un correo válido (ejemplo@dominio.com).';
            regEmail.style.borderColor = '#dc3545';
            return false;
        }
        regEmailError.textContent = '';
        regEmail.style.borderColor = '#28a745';
        return true;
    }

    function validateRegPassword(password) {
        if (password.trim() === '') {
            regPasswordError.textContent = 'La contraseña es obligatoria.';
            regPassword.style.borderColor = '#dc3545';
            return false;
        }
        if (password.length < 8) {
            regPasswordError.textContent = 'La contraseña debe tener al menos 8 caracteres.';
            regPassword.style.borderColor = '#dc3545';
            return false;
        }
        regPasswordError.textContent = '';
        regPassword.style.borderColor = '#28a745';
        return true;
    }

    function validateRegConfirm(confirm, password) {
        if (confirm.trim() === '') {
            regConfirmError.textContent = 'Verifica tu contraseña.';
            regConfirmPassword.style.borderColor = '#dc3545';
            return false;
        }
        if (confirm !== password) {
            regConfirmError.textContent = 'Las contraseñas no coinciden.';
            regConfirmPassword.style.borderColor = '#dc3545';
            return false;
        }
        regConfirmError.textContent = '';
        regConfirmPassword.style.borderColor = '#28a745';
        return true;
    }

    async function isUsernameTaken(username) {
        var usersRef = collection(db, 'users');
        var q = query(usersRef, where('username', '==', username));
        var snapshot = await getDocs(q);
        return !snapshot.empty;
    }

    async function generateUsernameSuggestions(base) {
        var clean = base.toLowerCase();
        var candidates = [
            clean + Math.floor(Math.random() * 900 + 100),
            clean + '_' + Math.floor(Math.random() * 90 + 10),
            clean + new Date().getFullYear(),
            clean + Math.floor(Math.random() * 9000 + 1000),
            clean + '_' + Math.floor(Math.random() * 900 + 100),
            clean + Math.floor(Math.random() * 90 + 10)
        ];
        var suggestions = [];
        for (var i = 0; i < candidates.length; i++) {
            if (suggestions.length >= 3) break;
            var taken = await isUsernameTaken(candidates[i]);
            if (!taken && suggestions.indexOf(candidates[i]) === -1) {
                suggestions.push(candidates[i]);
            }
        }
        return suggestions;
    }

    regName.addEventListener('blur', function() { validateRegName(this.value); });
    regName.addEventListener('input', function() {
        if (this.value.trim() === '') {
            regNameError.textContent = '';
            this.style.borderColor = '';
        } else {
            validateRegName(this.value);
        }
    });

    regUsername.addEventListener('blur', function() { validateRegUsername(this.value); });
    regUsername.addEventListener('input', function() {
        if (this.value.trim() === '') {
            regUsernameError.textContent = '';
            this.style.borderColor = '';
        } else {
            validateRegUsername(this.value);
        }
    });

    regEmail.addEventListener('blur', function() { validateRegEmail(this.value); });
    regEmail.addEventListener('input', function() {
        if (this.value.trim() === '') {
            regEmailError.textContent = '';
            this.style.borderColor = '';
        } else {
            validateRegEmail(this.value);
        }
    });

    regPassword.addEventListener('blur', function() { validateRegPassword(this.value); });
    regPassword.addEventListener('input', function() {
        if (this.value.trim() === '') {
            regPasswordError.textContent = '';
            this.style.borderColor = '';
        } else {
            validateRegPassword(this.value);
            if (regConfirmPassword.value.trim() !== '') {
                validateRegConfirm(regConfirmPassword.value, this.value);
            }
        }
    });

    regConfirmPassword.addEventListener('blur', function() {
        validateRegConfirm(this.value, regPassword.value);
    });
    regConfirmPassword.addEventListener('input', function() {
        if (this.value.trim() === '') {
            regConfirmError.textContent = '';
            this.style.borderColor = '';
        } else {
            validateRegConfirm(this.value, regPassword.value);
        }
    });

    toggleRegPassword.addEventListener('click', function() {
        var type = regPassword.getAttribute('type') === 'password' ? 'text' : 'password';
        regPassword.setAttribute('type', type);
        this.setAttribute('aria-label', type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    });

    toggleRegConfirm.addEventListener('click', function() {
        var type = regConfirmPassword.getAttribute('type') === 'password' ? 'text' : 'password';
        regConfirmPassword.setAttribute('type', type);
        this.setAttribute('aria-label', type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    });

    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();

        var isEmailValid = validateLoginEmail(emailInput.value);
        var isPasswordValid = validateLoginPassword(passwordInput.value);

        if (!isEmailValid || !isPasswordValid) {
            if (!isEmailValid) emailInput.focus();
            else if (!isPasswordValid) passwordInput.focus();
            return;
        }

        var btn = this.querySelector('.btn-primary');
        var originalText = btn.textContent;
        btn.textContent = 'Verificando...';
        btn.disabled = true;

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                const user = userCredential.user;
                if (rememberCheck.checked) {
                    localStorage.setItem('botardo_remember', 'true');
                    localStorage.setItem('botardo_email', email);
                } else {
                    localStorage.removeItem('botardo_remember');
                    localStorage.removeItem('botardo_email');
                }
                window.location.href = '../html/dashboard.html';
            })
            .catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                if (errorCode === 'auth/user-not-found') {
                    emailError.textContent = 'No existe una cuenta con este correo.';
                    emailInput.style.borderColor = '#dc3545';
                } else if (errorCode === 'auth/wrong-password') {
                    passwordError.textContent = 'Contraseña incorrecta.';
                    passwordInput.style.borderColor = '#dc3545';
                } else if (errorCode === 'auth/invalid-credential') {
                    emailError.textContent = 'Credenciales inválidas.';
                    emailInput.style.borderColor = '#dc3545';
                } else if (errorCode === 'auth/too-many-requests') {
                    passwordError.textContent = 'Demasiados intentos. Intenta más tarde.';
                    passwordInput.style.borderColor = '#dc3545';
                } else {
                    emailError.textContent = 'Error: ' + errorMessage;
                    emailInput.style.borderColor = '#dc3545';
                }
                btn.textContent = originalText;
                btn.disabled = false;
            });
    });

    registerForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        var isNameValid = validateRegName(regName.value);
        var isUsernameValid = validateRegUsername(regUsername.value);
        var isEmailValid = validateRegEmail(regEmail.value);
        var isPasswordValid = validateRegPassword(regPassword.value);
        var isConfirmValid = validateRegConfirm(regConfirmPassword.value, regPassword.value);

        if (!isNameValid || !isUsernameValid || !isEmailValid || !isPasswordValid || !isConfirmValid) {
            if (!isNameValid) regName.focus();
            else if (!isUsernameValid) regUsername.focus();
            else if (!isEmailValid) regEmail.focus();
            else if (!isPasswordValid) regPassword.focus();
            else if (!isConfirmValid) regConfirmPassword.focus();
            return;
        }

        var btn = registerForm.querySelector('.btn-primary');
        var originalText = btn.textContent;
        btn.textContent = 'Verificando usuario...';
        btn.disabled = true;

        const username = regUsername.value.trim();

        var taken;
        try {
            taken = await isUsernameTaken(username);
        } catch (err) {
            console.error('Error verificando username:', err);
            regUsernameError.textContent = 'No se pudo verificar el usuario: ' + (err.code || err.message || err);
            regUsername.style.borderColor = '#dc3545';
            btn.textContent = originalText;
            btn.disabled = false;
            return;
        }

        if (taken) {
            var suggestions = await generateUsernameSuggestions(username);
            regUsernameError.textContent = suggestions.length > 0
                ? 'Este nombre de usuario ya está en uso. Sugerencias: ' + suggestions.join(', ')
                : 'Este nombre de usuario ya está en uso.';
            regUsername.style.borderColor = '#dc3545';
            btn.textContent = originalText;
            btn.disabled = false;
            regUsername.focus();
            return;
        }

        btn.textContent = 'Registrando...';

        const email = regEmail.value.trim();
        const password = regPassword.value;
        const displayName = regName.value.trim();

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            try {
                await setDoc(doc(db, 'users', user.uid), {
                    name: displayName,
                    username: username,
                    email: email,
                    createdAt: new Date().toISOString()
                });
            } catch (firestoreErr) {
                console.error('Error guardando datos en Firestore:', firestoreErr);
                alert('Tu cuenta se creó, pero no se pudieron guardar tus datos (' + (firestoreErr.code || firestoreErr.message) + '). Al iniciar sesión te los pediremos de nuevo.');
                registerPanel.style.display = 'none';
                loginPanel.style.display = 'block';
                emailInput.value = email;
                btn.textContent = originalText;
                btn.disabled = false;
                return;
            }

            alert('¡Bienvenid@ ' + displayName + '! Tu usuario "' + username + '" ha sido registrado con éxito.');
            registerPanel.style.display = 'none';
            loginPanel.style.display = 'block';
            emailInput.value = email;
            validateLoginEmail(email);
            document.querySelector('.login-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
            btn.textContent = originalText;
            btn.disabled = false;
            registerForm.reset();
            regName.style.borderColor = '';
            regUsername.style.borderColor = '';
            regEmail.style.borderColor = '';
            regPassword.style.borderColor = '';
            regConfirmPassword.style.borderColor = '';
            regNameError.textContent = '';
            regUsernameError.textContent = '';
            regEmailError.textContent = '';
            regPasswordError.textContent = '';
            regConfirmError.textContent = '';
        } catch (error) {
            const errorCode = error.code;
            const errorMessage = error.message;
            if (errorCode === 'auth/email-already-in-use') {
                regEmailError.textContent = 'Este correo ya está registrado.';
                regEmail.style.borderColor = '#dc3545';
            } else if (errorCode === 'auth/weak-password') {
                regPasswordError.textContent = 'La contraseña es muy débil.';
                regPassword.style.borderColor = '#dc3545';
            } else if (errorCode === 'auth/invalid-email') {
                regEmailError.textContent = 'Correo inválido.';
                regEmail.style.borderColor = '#dc3545';
            } else {
                regEmailError.textContent = 'Error: ' + errorMessage;
                regEmail.style.borderColor = '#dc3545';
            }
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });

    function handleSocialLogin(provider, providerName) {
        signInWithPopup(auth, provider)
            .then((result) => {
                const user = result.user;
                localStorage.setItem('botardo_remember', 'true');
                localStorage.setItem('botardo_email', user.email);
                window.location.href = '../html/dashboard.html';
            })
            .catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                if (errorCode === 'auth/popup-closed-by-user') {
                    console.log('Popup cerrado por el usuario');
                } else if (errorCode === 'auth/account-exists-with-different-credential') {
                    alert('Ya existe una cuenta con este correo usando otro método.');
                } else {
                    alert('Error al iniciar sesión con ' + providerName + ': ' + errorMessage);
                }
            });
    }

    document.querySelector('.social-btn.google').addEventListener('click', function() {
        handleSocialLogin(googleProvider, 'Google');
    });

    document.querySelector('.social-btn.github').addEventListener('click', function() {
        handleSocialLogin(githubProvider, 'GitHub');
    });

    (function loadRemembered() {
        var remembered = localStorage.getItem('botardo_remember');
        if (remembered === 'true') {
            var savedEmail = localStorage.getItem('botardo_email');
            if (savedEmail) {
                emailInput.value = savedEmail;
                rememberCheck.checked = true;
                validateLoginEmail(savedEmail);
            }
        }
    })();

    togglePassword.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); this.click(); }
    });
    toggleRegPassword.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); this.click(); }
    });
    toggleRegConfirm.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); this.click(); }
    });

})();