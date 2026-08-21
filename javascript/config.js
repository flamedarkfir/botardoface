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
        var latinRegex = /^[A-Za-z]+$/;
        if (!latinRegex.test(trimmed)) {
            regUsernameError.textContent = 'Solo letras A-Z, a-z (sin ñ, números ni símbolos).';
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

        setTimeout(function() {
            if (rememberCheck.checked) {
                localStorage.setItem('botardo_remember', 'true');
                localStorage.setItem('botardo_email', emailInput.value.trim());
            } else {
                localStorage.removeItem('botardo_remember');
                localStorage.removeItem('botardo_email');
            }

            window.location.href = '../html/dashboard.html';

            btn.textContent = originalText;
            btn.disabled = false;
        }, 1200);
    });

    registerForm.addEventListener('submit', function(e) {
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

        var btn = this.querySelector('.btn-primary');
        var originalText = btn.textContent;
        btn.textContent = 'Registrando...';
        btn.disabled = true;

        setTimeout(function() {
            var nombre = regName.value.trim();
            var usuario = regUsername.value.trim();
            var email = regEmail.value.trim();

            alert('¡Bienvenid@ ' + nombre + '! Tu usuario "' + usuario + '" ha sido registrado con éxito.');

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
        }, 1500);
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