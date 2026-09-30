/**
 * auth-modal.js
 * Self-contained Google Sign-In modal.
 * - Injects a full-screen overlay into any page
 * - Opens when window.showAuthModal() is called or a [data-auth-trigger] is clicked
 * - Handles Google GIS credential flow + password fallback
 * - On success redirects to '/' or the value of window.AUTH_REDIRECT
 */
(() => {
  'use strict';

  // ── Styles injected once ───────────────────────────────────────────────────
  const CSS = `
    #ob-auth-overlay {
      display: none;
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      align-items: center; justify-content: center;
      padding: 16px;
      animation: ob-fade-in 0.2s ease;
    }
    #ob-auth-overlay.open { display: flex; }
    @keyframes ob-fade-in { from { opacity: 0; } to { opacity: 1; } }

    #ob-auth-card {
      width: 100%; max-width: 400px;
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
      padding: 36px 32px 28px;
      position: relative;
      animation: ob-card-in 0.25s cubic-bezier(0.34,1.56,0.64,1);
      font-family: 'Inter', system-ui, sans-serif;
    }
    @keyframes ob-card-in { from { opacity:0; transform:scale(0.94) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }

    #ob-auth-close {
      position: absolute; top: 14px; right: 14px;
      width: 30px; height: 30px; border-radius: 50%;
      border: none; background: #f1f5f9; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: #64748b; font-size: 16px; line-height: 1;
      transition: background 0.15s;
    }
    #ob-auth-close:hover { background: #e2e8f0; color: #1e293b; }

    .ob-auth-logo-wrap {
      display: flex; flex-direction: column; align-items: center;
      margin-bottom: 24px; gap: 8px;
    }
    .ob-auth-logo-mark {
      width: 50px; height: 50px; border-radius: 14px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      display: flex; align-items: center; justify-content: center;
      font-size: 1.375rem; font-weight: 800; color: #fff;
      box-shadow: 0 4px 14px rgba(99,102,241,0.32);
    }
    .ob-auth-title { font-size: 1.125rem; font-weight: 700; color: #1e293b; }
    .ob-auth-sub { font-size: 0.8rem; color: #64748b; margin-top: -2px; }

    .ob-alert {
      display: none; padding: 9px 13px; border-radius: 9px;
      font-size: 0.85rem; line-height: 1.45; margin-bottom: 14px;
    }
    .ob-alert.show { display: block; }
    .ob-alert-error   { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; }
    .ob-alert-success { background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; }

    /* Google buttons wrapper — GIS renders iframes inside */
    .ob-google-wrap {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; margin-bottom: 4px;
    }

    .ob-divider {
      display: flex; align-items: center; gap: 10px;
      color: #cbd5e1; font-size: 0.8rem; margin: 16px 0;
    }
    .ob-divider::before, .ob-divider::after {
      content:''; flex:1; height:1px; background:#e2e8f0;
    }

    .ob-field {
      width: 100%; padding: 0.62rem 0.85rem;
      border: 1.5px solid #e2e8f0; border-radius: 9px;
      font-size: 0.9rem; font-family: inherit; outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
      background: #fff; color: #1e293b; margin-bottom: 10px;
    }
    .ob-field:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.12); }
    .ob-field-label { display:block; font-size:0.8rem; font-weight:500; color:#475569; margin-bottom:4px; }

    .ob-btn-pw {
      width:100%; padding:0.68rem; border:none; border-radius:9px;
      cursor:pointer; font-size:0.9rem; font-weight:600; font-family:inherit;
      color:#fff; background:linear-gradient(135deg,#6366f1,#8b5cf6);
      transition:opacity 0.15s; margin-top:4px;
    }
    .ob-btn-pw:hover:not(:disabled) { opacity:0.88; }
    .ob-btn-pw:disabled { opacity:0.5; cursor:not-allowed; }

    .ob-pw-section { display:none; }
    .ob-pw-section.open { display:block; }

    .ob-toggle-link {
      background:none; border:none; cursor:pointer; font-family:inherit;
      font-size:0.8rem; color:#6366f1; text-decoration:underline;
      text-underline-offset:2px;
    }
    .ob-footer-note {
      font-size:0.72rem; color:#94a3b8; text-align:center;
      margin-top:16px; line-height:1.5;
    }
    .ob-spinner-wrap {
      display:none; justify-content:center; align-items:center;
      gap:8px; padding:10px; color:#64748b; font-size:0.85rem;
    }
    .ob-spinner-wrap.show { display:flex; }
    .ob-spinner {
      width:16px; height:16px;
      border:2px solid #e2e8f0; border-top-color:#6366f1;
      border-radius:50%; animation:ob-spin 0.6s linear infinite;
    }
    @keyframes ob-spin { to { transform:rotate(360deg); } }

    @media (max-width:440px) {
      #ob-auth-card { padding: 26px 18px 22px; }
    }
  `;

  // ── Inject styles ──────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  // ── Build modal HTML ───────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'ob-auth-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Sign in');
  overlay.innerHTML = `
    <div id="ob-auth-card">
      <button id="ob-auth-close" aria-label="Close" onclick="window.hideAuthModal()">✕</button>

      <div class="ob-auth-logo-wrap">
        <div class="ob-auth-logo-mark">OB</div>
        <div class="ob-auth-title">OB Backtest Journal</div>
        <div class="ob-auth-sub">Sign in to your trading journal</div>
      </div>

      <div class="ob-alert ob-alert-error"   id="ob-auth-error"></div>
      <div class="ob-alert ob-alert-success" id="ob-auth-success"></div>

      <div id="ob-google-section">
        <div class="ob-google-wrap">
          <div id="ob-gsi-signin"></div>
          <div id="ob-gsi-signup"></div>
        </div>
        <div class="ob-spinner-wrap" id="ob-auth-spinner">
          <div class="ob-spinner"></div>
          <span>Verifying with Google…</span>
        </div>
      </div>

      <div class="ob-divider" id="ob-auth-divider">or</div>

      <div class="ob-pw-section" id="ob-pw-section">
        <form id="ob-pw-form" novalidate autocomplete="on">
          <label class="ob-field-label" for="ob-pw-email">Email</label>
          <input id="ob-pw-email" type="email" class="ob-field"
            placeholder="you@example.com" autocomplete="email" />
          <label class="ob-field-label" for="ob-pw-password">Password</label>
          <input id="ob-pw-password" type="password" class="ob-field"
            placeholder="••••••••" autocomplete="current-password" />
          <button type="submit" class="ob-btn-pw" id="ob-pw-btn">Sign In</button>
        </form>
      </div>

      <div style="text-align:center;margin-top:12px;">
        <button class="ob-toggle-link" id="ob-pw-toggle">
          Sign in with email &amp; password instead
        </button>
      </div>

      <p class="ob-footer-note">
        New users are registered automatically on first Google sign-in.<br>
        Your data is stored privately and never shared.
      </p>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── Close on overlay click (outside card) ─────────────────────────────────
  overlay.addEventListener('click', e => {
    if (e.target === overlay) window.hideAuthModal();
  });

  // ── Close on Escape ────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) window.hideAuthModal();
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function showError(msg) {
    const el = document.getElementById('ob-auth-error');
    const ok = document.getElementById('ob-auth-success');
    el.textContent = msg; el.classList.add('show');
    ok.classList.remove('show');
  }
  function showSuccess(msg) {
    const ok = document.getElementById('ob-auth-success');
    const el = document.getElementById('ob-auth-error');
    ok.textContent = msg; ok.classList.add('show');
    el.classList.remove('show');
  }
  function clearAlerts() {
    document.getElementById('ob-auth-error').classList.remove('show');
    document.getElementById('ob-auth-success').classList.remove('show');
  }
  function setSpinner(on) {
    document.getElementById('ob-auth-spinner').classList.toggle('show', on);
    const gs = document.getElementById('ob-google-section');
    gs.style.opacity = on ? '0.5' : '1';
    gs.style.pointerEvents = on ? 'none' : '';
  }

  // ── Password section toggle ────────────────────────────────────────────────
  let pwOpen = false;
  document.getElementById('ob-pw-toggle').addEventListener('click', () => {
    pwOpen = !pwOpen;
    document.getElementById('ob-pw-section').classList.toggle('open', pwOpen);
    document.getElementById('ob-pw-toggle').textContent = pwOpen
      ? 'Hide email & password sign-in'
      : 'Sign in with email & password instead';
    if (pwOpen) document.getElementById('ob-pw-email').focus();
  });

  // ── Password form submit ───────────────────────────────────────────────────
  document.getElementById('ob-pw-form').addEventListener('submit', async e => {
    e.preventDefault();
    clearAlerts();
    const email    = document.getElementById('ob-pw-email').value.trim();
    const password = document.getElementById('ob-pw-password').value;
    if (!email || !password) { showError('Please enter your email and password.'); return; }

    const btn = document.getElementById('ob-pw-btn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        showSuccess('Signed in! Loading your journal…');
        setTimeout(() => { window.location.replace(window.AUTH_REDIRECT || '/'); }, 700);
      } else {
        showError(body.error || 'Incorrect email or password.');
        document.getElementById('ob-pw-password').value = '';
      }
    } catch {
      showError('Network error. Please try again.');
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });

  // ── Google credential callback ────────────────────────────────────────────
  // Exposed globally so GIS can call it
  window._obGoogleCallback = async function(response) {
    clearAlerts();
    setSpinner(true);
    try {
      const res  = await fetch('/api/auth/google', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        showSuccess('Signed in! Loading your journal…');
        setTimeout(() => { window.location.replace(window.AUTH_REDIRECT || '/'); }, 700);
      } else {
        setSpinner(false);
        showError(body.error || 'Google Sign-In failed. Please try again.');
      }
    } catch {
      setSpinner(false);
      showError('Network error. Please check your connection and try again.');
    }
  };

  // ── Initialise GIS buttons ────────────────────────────────────────────────
  let gisReady = false;

  function initGIS(clientId) {
    if (gisReady) return;
    if (typeof google === 'undefined' || !google?.accounts?.id) return;
    gisReady = true;

    google.accounts.id.initialize({
      client_id:             clientId,
      callback:              window._obGoogleCallback,
      context:               'signin',
      ux_mode:               'popup',
      auto_select:           false,
      cancel_on_tap_outside: true
    });

    google.accounts.id.renderButton(
      document.getElementById('ob-gsi-signin'),
      { type:'standard', theme:'outline',     size:'large', text:'signin_with', shape:'rectangular', logo_alignment:'left', width:336 }
    );
    google.accounts.id.renderButton(
      document.getElementById('ob-gsi-signup'),
      { type:'standard', theme:'filled_blue', size:'large', text:'signup_with', shape:'rectangular', logo_alignment:'left', width:336 }
    );
  }

  function tryInitGIS() {
    const meta = document.querySelector('meta[name="google-client-id"]');
    if (!meta?.content) {
      // No Google client ID — hide Google section, show password only
      document.getElementById('ob-google-section').style.display = 'none';
      document.getElementById('ob-auth-divider').style.display   = 'none';
      document.getElementById('ob-pw-toggle').style.display      = 'none';
      document.getElementById('ob-pw-section').classList.add('open');
      return;
    }
    initGIS(meta.content);
    if (!gisReady) {
      // GIS not loaded yet — wait for it
      const interval = setInterval(() => {
        if (typeof google !== 'undefined' && google?.accounts?.id) {
          clearInterval(interval);
          initGIS(meta.content);
        }
      }, 100);
      // Stop trying after 5s
      setTimeout(() => clearInterval(interval), 5000);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.showAuthModal = function(redirectTo) {
    if (redirectTo) window.AUTH_REDIRECT = redirectTo;
    clearAlerts();
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    tryInitGIS();
    // Trigger one-tap if GIS is loaded
    const meta = document.querySelector('meta[name="google-client-id"]');
    if (meta?.content && typeof google !== 'undefined' && google?.accounts?.id) {
      google.accounts.id.prompt();
    }
  };

  window.hideAuthModal = function() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    clearAlerts();
  };

  // ── Wire up existing "Get Started" buttons automatically ──────────────────
  // Any button with data-auth-trigger or calling handleGetStarted() opens the modal.
  // Override handleGetStarted globally so both header buttons use the modal.
  window.handleGetStarted = async function() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (res.ok) {
        // Already logged in — go to trading tab
        if (typeof switchTab === 'function') switchTab('trading');
      } else {
        window.showAuthModal(window.location.pathname);
      }
    } catch {
      window.showAuthModal(window.location.pathname);
    }
  };

  // Load GIS script if not already present
  if (!document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }
})();
