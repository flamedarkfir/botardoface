import { auth, rtdb, onAuthStateChanged, ref, get, set, update, remove } from './firebase-config.js';

(function () {
    'use strict';

    // ===== Configuración de Spotify =====
    // NOTA: aquí solo va el Client ID (es público, va en la URL de
    // autorización). El Client Secret NUNCA debe estar en un archivo que
    // corre en el navegador -- cualquiera podría verlo con "Ver código
    // fuente". Por eso usamos el flujo "Authorization Code with PKCE",
    // que está diseñado justo para apps que corren 100% en el cliente:
    // no necesita el secreto en ningún momento.
    const SPOTIFY_CLIENT_ID = 'cbb396e04ba040d2a7cb2c44078071be';
    const SPOTIFY_REDIRECT_URI = 'https://botardoface.pages.dev/html/dashboard';
    const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state';
    const POLL_MS = 30000; // cada cuánto se revisa qué está sonando

    let currentUid = null;
    let mostrandoOtro = false;
    let pollTimer = null;

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ===== PKCE helpers =====
    function base64UrlEncode(buffer) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)))
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    }

    function generarVerificador() {
        const bytes = new Uint8Array(64);
        crypto.getRandomValues(bytes);
        return base64UrlEncode(bytes.buffer);
    }

    async function generarChallenge(verificador) {
        const enc = new TextEncoder().encode(verificador);
        const hash = await crypto.subtle.digest('SHA-256', enc);
        return base64UrlEncode(hash);
    }

    // ===== Paso 1: iniciar conexión (botón "Conectar Spotify") =====
    async function iniciarConexionSpotify() {
        const verificador = generarVerificador();
        localStorage.setItem('spotify_pkce_verifier', verificador);
        const challenge = await generarChallenge(verificador);

        const params = new URLSearchParams({
            client_id: SPOTIFY_CLIENT_ID,
            response_type: 'code',
            redirect_uri: SPOTIFY_REDIRECT_URI,
            code_challenge_method: 'S256',
            code_challenge: challenge,
            scope: SPOTIFY_SCOPES
        });

        window.location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
    }

    // ===== Paso 2: volver del login de Spotify con ?code=... =====
    async function manejarCallbackSiAplica(uid) {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        if (!code) return;

        const verificador = localStorage.getItem('spotify_pkce_verifier');
        // Limpiamos la URL de inmediato para que un F5 no reintente el mismo code
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        window.history.replaceState({}, document.title, url.pathname + url.hash);

        if (!verificador) {
            console.error('No se encontró el verificador PKCE (¿se limpió el localStorage?)');
            return;
        }

        try {
            const body = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: SPOTIFY_REDIRECT_URI,
                client_id: SPOTIFY_CLIENT_ID,
                code_verifier: verificador
            });

            const resp = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });

            if (!resp.ok) throw new Error('Spotify respondió ' + resp.status);
            const data = await resp.json();

            await set(ref(rtdb, 'users/' + uid + '/privado/spotify'), {
                refreshToken: data.refresh_token,
                accessToken: data.access_token,
                expiresAt: Date.now() + (data.expires_in * 1000)
            });

            localStorage.removeItem('spotify_pkce_verifier');
            actualizarUIConexion(true);
            pollCurrentlyPlaying();
        } catch (err) {
            console.error('Error conectando con Spotify:', err);
            alert('No se pudo completar la conexión con Spotify. Intenta de nuevo.');
        }
    }

    // ===== Tokens: obtener uno válido, refrescando si hace falta =====
    // Esto es lo que hace que NO vuelva a pedir el login cada vez: una
    // vez que el usuario autoriza una vez, el refreshToken queda
    // guardado en Firebase y se reutiliza para siempre (hasta que el
    // usuario revoque el acceso desde Spotify o pulse "Desconectar").
    async function obtenerAccessTokenValido(uid) {
        const snap = await get(ref(rtdb, 'users/' + uid + '/privado/spotify'));
        if (!snap.exists()) return null;
        const datos = snap.val();

        if (datos.expiresAt && datos.expiresAt > Date.now() + 10000) {
            return datos.accessToken;
        }

        // Access token vencido (dura 1h) -> lo renovamos con el refresh token,
        // que no vence y no requiere volver a mostrarle el login al usuario.
        try {
            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: datos.refreshToken,
                client_id: SPOTIFY_CLIENT_ID
            });
            const resp = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });
            if (!resp.ok) throw new Error('refresh falló: ' + resp.status);
            const nuevo = await resp.json();

            const actualizado = {
                accessToken: nuevo.access_token,
                expiresAt: Date.now() + (nuevo.expires_in * 1000),
                // Spotify a veces manda un refresh_token nuevo; si no, conservamos el viejo
                refreshToken: nuevo.refresh_token || datos.refreshToken
            };
            await update(ref(rtdb, 'users/' + uid + '/privado/spotify'), actualizado);
            return actualizado.accessToken;
        } catch (err) {
            console.error('Error renovando token de Spotify:', err);
            return null;
        }
    }

    // ===== Consultar qué está sonando y guardarlo en el perfil público =====
    async function pollCurrentlyPlaying() {
        if (!currentUid) return;
        const token = await obtenerAccessTokenValido(currentUid);
        if (!token) return;

        try {
            const resp = await fetch('https://api.spotify.com/v1/me/player/currently-playing?market=from_token', {
                headers: { Authorization: 'Bearer ' + token }
            });

            let nuevoEstado;
            if (resp.status === 204 || resp.status === 202) {
                nuevoEstado = { playing: false, updatedAt: Date.now() };
            } else if (resp.ok) {
                const data = await resp.json();
                if (data && data.item && data.is_playing) {
                    const imagenes = data.item.album && data.item.album.images ? data.item.album.images : [];
                    const arte = imagenes.length ? (imagenes[imagenes.length - 2] || imagenes[0]).url : '';
                    nuevoEstado = {
                        playing: true,
                        track: data.item.name || '',
                        artist: (data.item.artists || []).map(function (a) { return a.name; }).join(', '),
                        albumArt: arte,
                        trackUrl: (data.item.external_urls && data.item.external_urls.spotify) || '',
                        updatedAt: Date.now()
                    };
                } else {
                    nuevoEstado = { playing: false, updatedAt: Date.now() };
                }
            } else {
                return; // error temporal (401/429/5xx) -> no pisamos el último estado guardado
            }

            await set(ref(rtdb, 'users/' + currentUid + '/perfil/spotify'), nuevoEstado);
            if (!mostrandoOtro) renderSpotifyEnPerfil(nuevoEstado);
        } catch (err) {
            console.error('Error consultando reproducción actual de Spotify:', err);
        }
    }

    // ===== Render en el perfil (propio o ajeno) =====
    function renderSpotifyEnPerfil(datos) {
        const el = document.getElementById('profileSpotify');
        if (!el) return;
        if (datos && datos.playing) {
            el.style.display = '';
            el.innerHTML =
                (datos.albumArt ? '<img class="profile-spotify-art" src="' + escapeHtml(datos.albumArt) + '" alt="">' : '') +
                '<div class="profile-spotify-info">' +
                '<span class="profile-spotify-label"><i class="fab fa-spotify"></i> Escuchando ahora</span>' +
                '<a class="profile-spotify-track" href="' + escapeHtml(datos.trackUrl || '#') + '" target="_blank" rel="noopener">' + escapeHtml(datos.track || '') + '</a>' +
                '<span class="profile-spotify-artist">' + escapeHtml(datos.artist || '') + '</span>' +
                '</div>';
        } else {
            el.style.display = 'none';
            el.innerHTML = '';
        }
    }

    async function mostrarSpotifyDeUsuario(uid) {
        mostrandoOtro = true;
        try {
            const snap = await get(ref(rtdb, 'users/' + uid + '/perfil/spotify'));
            renderSpotifyEnPerfil(snap.exists() ? snap.val() : null);
        } catch (err) {
            console.error('Error leyendo estado de Spotify del usuario visitado:', err);
        }
    }

    async function volverAPerfilPropio() {
        mostrandoOtro = false;
        if (!currentUid) return;
        try {
            const snap = await get(ref(rtdb, 'users/' + currentUid + '/perfil/spotify'));
            renderSpotifyEnPerfil(snap.exists() ? snap.val() : null);
        } catch (err) {
            console.error('Error recargando tu estado de Spotify:', err);
        }
    }

    // ===== UI de conectar/desconectar en Configuración =====
    function actualizarUIConexion(conectado) {
        const status = document.getElementById('spotifyStatusText');
        const btnConectar = document.getElementById('spotifyConnectBtn');
        const btnDesconectar = document.getElementById('spotifyDisconnectBtn');
        if (status) status.textContent = conectado
            ? 'Tu cuenta de Spotify está conectada.'
            : 'Conecta tu cuenta para mostrar lo que estás escuchando en tu perfil.';
        if (btnConectar) btnConectar.style.display = conectado ? 'none' : '';
        if (btnDesconectar) btnDesconectar.style.display = conectado ? '' : 'none';
    }

    async function desconectarSpotify() {
        if (!currentUid) return;
        if (!confirm('¿Desconectar tu cuenta de Spotify? Ya no se mostrará lo que estás escuchando.')) return;
        try {
            await remove(ref(rtdb, 'users/' + currentUid + '/privado/spotify'));
            await remove(ref(rtdb, 'users/' + currentUid + '/perfil/spotify'));
            actualizarUIConexion(false);
            renderSpotifyEnPerfil(null);
        } catch (err) {
            console.error('Error desconectando Spotify:', err);
            alert('No se pudo desconectar: ' + (err.code || err.message));
        }
    }

    function wireBotones() {
        const btnConectar = document.getElementById('spotifyConnectBtn');
        const btnDesconectar = document.getElementById('spotifyDisconnectBtn');
        if (btnConectar) btnConectar.addEventListener('click', iniciarConexionSpotify);
        if (btnDesconectar) btnDesconectar.addEventListener('click', desconectarSpotify);

        // No tocamos config.js: nos "enganchamos" a las funciones que ya
        // expone en window para saber cuándo se está viendo otro perfil.
        if (typeof window.verPerfilUsuario === 'function') {
            const original = window.verPerfilUsuario;
            window.verPerfilUsuario = function (uid, name, username) {
                original(uid, name, username);
                mostrarSpotifyDeUsuario(uid);
            };
        }
        const backBtn = document.getElementById('profileBackBtn');
        if (backBtn) backBtn.addEventListener('click', volverAPerfilPropio);
    }

    async function init(uid) {
        currentUid = uid;
        await manejarCallbackSiAplica(uid);

        const snap = await get(ref(rtdb, 'users/' + uid + '/privado/spotify'));
        const conectado = snap.exists();
        actualizarUIConexion(conectado);

        // Primer render con lo último que se haya guardado, sin esperar al poll
        const perfilSnap = await get(ref(rtdb, 'users/' + uid + '/perfil/spotify'));
        if (perfilSnap.exists()) renderSpotifyEnPerfil(perfilSnap.val());

        if (conectado) {
            pollCurrentlyPlaying();
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = setInterval(pollCurrentlyPlaying, POLL_MS);
        }
    }

    document.addEventListener('DOMContentLoaded', wireBotones);
    // Por si el script se ejecuta después de que el DOM ya cargó
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        wireBotones();
    }

    onAuthStateChanged(auth, function (user) {
        if (!user) return;
        init(user.uid);
    });
})();