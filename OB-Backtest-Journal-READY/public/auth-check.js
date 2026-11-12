/**
 * auth-check.js
 * Injected into every page by backend-sync.js.
 * - Verifies the user is authenticated via /api/auth/me
 * - Redirects to /auth.html if not
 * - Adds a round account button (email, Settings, Log out menu) to the header
 */
(() => {
  const AUTH_SKIP_PATHS = ['/auth.html'];

  function currentPathMatches(paths) {
    const p = window.location.pathname.toLowerCase();
    return paths.some(s => p === s || p.startsWith(s + '?'));
  }

  // Do nothing on the auth page itself
  if (currentPathMatches(AUTH_SKIP_PATHS)) return;

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        // Show auth modal if available, otherwise fall back to auth page
        if (typeof window.showAuthModal === 'function') {
          window.showAuthModal('/');
        } else {
          // auth-modal.js not yet loaded — wait briefly then try again
          setTimeout(() => {
            if (typeof window.showAuthModal === 'function') {
              window.showAuthModal('/');
            } else {
              const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
              window.location.replace('/auth.html?next=' + next);
            }
          }, 300);
        }
        return null;
      }
      if (!res.ok) {
        console.warn('[OB Auth] /api/auth/me returned', res.status);
        return null;
      }
      const body = await res.json().catch(() => null);
      return body?.user ?? null;
    } catch (err) {
      console.warn('[OB Auth] auth check failed (network):', err.message);
      return null;
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (_) {}
    window.location.replace('/auth.html');
  }

  // ── Account menu: round avatar button + dropdown (email, Settings, Log out) ──
  const ACCOUNT_STYLE_ID = 'ob-account-menu-style';
  function injectAccountStyles() {
    if (document.getElementById(ACCOUNT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = ACCOUNT_STYLE_ID;
    style.textContent = `
      #ob-account-wrap { position: relative; flex-shrink: 0; }
      #ob-account-btn {
        width: 36px; height: 36px; border-radius: 9999px; border: 2px solid #fff;
        background: linear-gradient(135deg, #2563eb, #6366f1); color: #fff;
        font: 700 14px/1 Inter, system-ui, sans-serif; text-transform: uppercase;
        display: flex; align-items: center; justify-content: center; cursor: pointer;
        box-shadow: 0 0 0 1px #c7d2fe, 0 4px 12px rgba(37,99,235,.25);
        transition: transform .15s, box-shadow .15s;
      }
      #ob-account-btn:hover { transform: translateY(-1px); box-shadow: 0 0 0 2px #93c5fd, 0 6px 16px rgba(37,99,235,.3); }
      #ob-account-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px #93c5fd; }
      #ob-account-menu {
        position: absolute; top: calc(100% + 8px); right: 0; z-index: 60;
        width: 240px; max-width: calc(100vw - 24px);
        background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
        box-shadow: 0 16px 40px rgba(15,23,42,.16), 0 2px 6px rgba(15,23,42,.06);
        padding: 6px; display: none; font-family: Inter, system-ui, sans-serif;
      }
      #ob-account-menu.open { display: block; animation: ob-acc-in .12s ease-out; }
      @keyframes ob-acc-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
      #ob-account-menu .ob-acc-head { padding: 8px 10px 10px; border-bottom: 1px solid #f1f5f9; margin-bottom: 4px; }
      #ob-account-menu .ob-acc-label { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #94a3b8; }
      #ob-account-menu .ob-acc-email { font-size: 12px; color: #64748b; margin-top: 2px; word-break: break-all; }
      #ob-account-menu .ob-acc-item {
        width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px;
        border: 0; background: transparent; border-radius: 9px; cursor: pointer;
        font: 600 13px/1.2 Inter, system-ui, sans-serif; color: #334155; text-align: left;
      }
      #ob-account-menu .ob-acc-item svg { flex-shrink: 0; color: #64748b; }
      #ob-account-menu .ob-acc-item:hover, #ob-account-menu .ob-acc-item:focus-visible { background: #f1f5f9; outline: none; }
      #ob-account-menu .ob-acc-logout:hover, #ob-account-menu .ob-acc-logout:focus-visible { background: #fef2f2; color: #dc2626; }
      #ob-account-menu .ob-acc-logout:hover svg, #ob-account-menu .ob-acc-logout:focus-visible svg { color: #dc2626; }
      /* Narrow screens: let the nav pill scroll sideways instead of pushing
         the account button off-screen. */
      @media (max-width: 1023px) {
        header nav { min-width: 0; flex: 0 1 auto; overflow-x: auto; scrollbar-width: none; }
        header nav::-webkit-scrollbar { display: none; }
        header nav > button { flex-shrink: 0; }
      }
      /* Phones: logo + actions on the first row, nav pill on its own row. */
      @media (max-width: 767px) {
        header > div { flex-wrap: wrap; row-gap: 10px; }
        header > div > div:last-child { margin-left: auto; }
        header nav { order: 3; flex: 1 1 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function goToSettings() {
    // Use the same path as the nav's Settings button.
    if (typeof window.switchTab === 'function') window.switchTab('settings');
  }

  function injectAccountMenu(email) {
    const header = document.querySelector('header');
    if (!header || document.getElementById('ob-account-wrap')) return;
    document.getElementById('ob-auth-badge')?.remove(); // old email + Sign out pill
    injectAccountStyles();

    const wrap = document.createElement('div');
    wrap.id = 'ob-account-wrap';
    wrap.innerHTML = `
      <button id="ob-account-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="ob-account-menu"></button>
      <div id="ob-account-menu" role="menu" aria-labelledby="ob-account-btn">
        <div class="ob-acc-head">
          <div class="ob-acc-label">Signed in as</div>
          <div class="ob-acc-email"></div>
        </div>
        <button type="button" role="menuitem" class="ob-acc-item" data-action="accounts">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 12h2"/></svg>
          Accounts
        </button>
        <button type="button" role="menuitem" class="ob-acc-item" data-action="settings">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Settings
        </button>
        <button type="button" role="menuitem" class="ob-acc-item ob-acc-logout" data-action="logout">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Log out
        </button>
      </div>`;

    const btn = wrap.querySelector('#ob-account-btn');
    const menu = wrap.querySelector('#ob-account-menu');
    const initial = (String(email).trim().charAt(0) || '?').toUpperCase();
    btn.textContent = initial;
    btn.title = `Account (${email})`;
    btn.setAttribute('aria-label', `Account menu for ${email}`);
    wrap.querySelector('.ob-acc-email').textContent = email;

    const items = () => [...menu.querySelectorAll('.ob-acc-item')];
    function open() {
      menu.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      items()[0]?.focus();
    }
    function close(focusBtn) {
      if (!menu.classList.contains('open')) return;
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      if (focusBtn) btn.focus();
    }
    btn.addEventListener('click', e => {
      e.stopPropagation();
      menu.classList.contains('open') ? close(false) : open();
    });
    menu.addEventListener('click', e => {
      const item = e.target.closest('.ob-acc-item');
      if (!item) return;
      close(false);
      if (item.dataset.action === 'settings') goToSettings();
      if (item.dataset.action === 'accounts' && typeof window.switchTab === 'function') window.switchTab('accounts');
      if (item.dataset.action === 'logout') logout();
    });
    menu.addEventListener('keydown', e => {
      const list = items();
      const i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(true); });

    // Right-hand slot of the header (next to "Get started"); fall back to the header.
    const slot = header.querySelector(':scope > div > div:last-child') || header;
    slot.classList.add('ob-has-account');
    slot.appendChild(wrap);
  }

  // Run auth check immediately (async, non-blocking)
  checkAuth().then(user => {
    if (user?.email) {
      injectAccountMenu(user.email);
    }
  });

  // Expose globally so other scripts can trigger logout programmatically
  window.obAuthLogout = logout;
})();
