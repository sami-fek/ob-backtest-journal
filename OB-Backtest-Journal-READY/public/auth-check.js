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

  // ── Account menu ───────────────────────────────────────────────────────────
  // Round avatar (first letter of the email on a coloured circle) opening a
  // menu card: name + email, Profile, Accounts, Settings, Appearance
  // (Light / Dark / System → setTheme), divider, Log out.
  const ACCOUNT_STYLE_ID = 'ob-account-menu-style';
  function injectAccountStyles() {
    if (document.getElementById(ACCOUNT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = ACCOUNT_STYLE_ID;
    style.textContent = `
      :root, html[data-theme="light"] { --acc-menu-bg: #ffffff; --acc-menu-border: #e7e7e9; --acc-item-hover: #eff6ff; --acc-item-hover-text: #2563eb; --acc-seg-bg: #f4f4f5; --acc-seg-active: #ffffff; --acc-seg-active-text: #101729; }
      html[data-theme="dark"] { --acc-menu-bg: #171717; --acc-menu-border: #262626; --acc-item-hover: #262626; --acc-item-hover-text: #fafafa; --acc-seg-bg: #0f0f0f; --acc-seg-active: #262626; --acc-seg-active-text: #fafafa; }
      #ob-account-wrap { position: relative; flex-shrink: 0; }
      #ob-account-btn {
        width: 36px; height: 36px; border-radius: 9999px; border: 2px solid var(--panel, #fff);
        background: var(--acc-color, #3b82f6); color: #fff;
        font: 700 14px/1 Inter, system-ui, sans-serif; text-transform: uppercase;
        display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; overflow: hidden;
        box-shadow: 0 0 0 1px var(--border, #e7e7e9), 0 4px 12px rgba(0,0,0,.18);
        transition: transform .15s, box-shadow .15s;
      }
      #ob-account-btn img { width: 100%; height: 100%; object-fit: cover; }
      #ob-account-btn:hover { transform: translateY(-1px); }
      #ob-account-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(59,130,246,.55); }
      #ob-account-menu {
        position: absolute; top: calc(100% + 10px); right: 0; z-index: 60;
        width: 268px; max-width: calc(100vw - 24px);
        background: var(--acc-menu-bg); border: 1px solid var(--acc-menu-border); border-radius: 16px;
        box-shadow: 0 18px 44px rgba(0,0,0,.22), 0 2px 6px rgba(0,0,0,.08);
        padding: 6px; display: none; font-family: Inter, system-ui, sans-serif; color: var(--text, #101729);
      }
      #ob-account-menu.open { display: block; animation: ob-acc-in .12s ease-out; }
      @keyframes ob-acc-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
      #ob-account-menu .ob-acc-head { display: flex; align-items: center; gap: 10px; padding: 10px 10px 12px; border-bottom: 1px solid var(--acc-menu-border); margin-bottom: 4px; }
      #ob-account-menu .ob-acc-mini { width: 34px; height: 34px; border-radius: 9999px; background: var(--acc-color, #3b82f6); color: #fff; font: 700 13px/1 Inter, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
      #ob-account-menu .ob-acc-mini img { width: 100%; height: 100%; object-fit: cover; }
      #ob-account-menu .ob-acc-who { min-width: 0; }
      #ob-account-menu .ob-acc-name { font-size: 13px; font-weight: 700; color: var(--text, #101729); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #ob-account-menu .ob-acc-email { font-size: 11.5px; color: var(--muted, #6b7280); margin-top: 2px; word-break: break-all; }
      #ob-account-menu .ob-acc-item {
        width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px;
        border: 0; background: transparent; border-radius: 10px; cursor: pointer;
        font: 600 13px/1.2 Inter, system-ui, sans-serif; color: var(--text, #101729); text-align: left;
      }
      #ob-account-menu .ob-acc-item svg { flex-shrink: 0; color: var(--muted, #6b7280); }
      #ob-account-menu .ob-acc-item:hover, #ob-account-menu .ob-acc-item:focus-visible { background: var(--acc-item-hover); color: var(--acc-item-hover-text); outline: none; }
      #ob-account-menu .ob-acc-item:hover svg, #ob-account-menu .ob-acc-item:focus-visible svg { color: currentColor; }
      #ob-account-menu .ob-acc-appearance { padding: 8px 10px 10px; }
      #ob-account-menu .ob-acc-label { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted, #6b7280); margin-bottom: 6px; }
      #ob-account-menu .ob-acc-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 3px; border-radius: 10px; background: var(--acc-seg-bg); border: 1px solid var(--acc-menu-border); }
      #ob-account-menu .ob-acc-seg button {
        border: 0; background: transparent; color: var(--muted, #6b7280); border-radius: 8px; padding: 6px 4px; cursor: pointer;
        font: 600 12px/1 Inter, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; gap: 5px;
      }
      #ob-account-menu .ob-acc-seg button[aria-checked="true"] { background: var(--acc-seg-active); color: var(--acc-seg-active-text); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
      #ob-account-menu .ob-acc-seg button:focus-visible { outline: 2px solid #3b82f6; outline-offset: 1px; }
      #ob-account-menu .ob-acc-sep { height: 1px; background: var(--acc-menu-border); margin: 4px 6px; }
      #ob-account-menu .ob-acc-logout:hover, #ob-account-menu .ob-acc-logout:focus-visible { background: rgba(239,68,68,.12); color: #ef4444; }
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

  // account-center.js defines the real openAccountCenter(section). This is only
  // a fallback in case that script failed to load.
  if (typeof window.openAccountCenter !== 'function') {
    window.openAccountCenter = function (section) {
      const tab = section === 'accounts' ? 'accounts' : 'settings';
      if (typeof window.switchTab === 'function') window.switchTab(tab);
    };
  }

  const AVATAR_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444'];
  function avatarColor(email) {
    let h = 0;
    for (const ch of String(email)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  const ICONS = {
    profile: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    accounts: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    settings: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    logout: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    light: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    system: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>'
  };

  function injectAccountMenu(email, displayName) {
    const header = document.querySelector('header');
    if (!header || document.getElementById('ob-account-wrap')) return;
    document.getElementById('ob-auth-badge')?.remove(); // old email + Sign out pill
    injectAccountStyles();

    const name = String(displayName || '').trim() || String(email).split('@')[0];
    const wrap = document.createElement('div');
    wrap.id = 'ob-account-wrap';
    wrap.style.setProperty('--acc-color', avatarColor(email));
    wrap.innerHTML = `
      <button id="ob-account-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="ob-account-menu"></button>
      <div id="ob-account-menu" role="menu" aria-labelledby="ob-account-btn">
        <div class="ob-acc-head">
          <div class="ob-acc-mini" aria-hidden="true"></div>
          <div class="ob-acc-who"><div class="ob-acc-name"></div><div class="ob-acc-email"></div></div>
        </div>
        <button type="button" role="menuitem" class="ob-acc-item" data-action="profile">${ICONS.profile}Profile</button>
        <button type="button" role="menuitem" class="ob-acc-item" data-action="accounts">${ICONS.accounts}Accounts</button>
        <button type="button" role="menuitem" class="ob-acc-item" data-action="settings">${ICONS.settings}Settings</button>
        <div class="ob-acc-appearance">
          <div class="ob-acc-label" id="ob-acc-appearance-label">Appearance</div>
          <div class="ob-acc-seg" role="radiogroup" aria-labelledby="ob-acc-appearance-label">
            <button type="button" role="radio" data-theme-mode="light">${ICONS.light}Light</button>
            <button type="button" role="radio" data-theme-mode="dark">${ICONS.dark}Dark</button>
            <button type="button" role="radio" data-theme-mode="system">${ICONS.system}System</button>
          </div>
        </div>
        <div class="ob-acc-sep" role="separator"></div>
        <button type="button" role="menuitem" class="ob-acc-item ob-acc-logout" data-action="logout">${ICONS.logout}Log out</button>
      </div>`;

    const btn = wrap.querySelector('#ob-account-btn');
    const menu = wrap.querySelector('#ob-account-menu');
    const initial = (String(email).trim().charAt(0) || '?').toUpperCase();
    btn.textContent = initial;
    wrap.querySelector('.ob-acc-mini').textContent = initial;
    btn.title = `Account (${email})`;
    btn.setAttribute('aria-label', `Account menu for ${email}`);
    wrap.querySelector('.ob-acc-name').textContent = name;
    wrap.querySelector('.ob-acc-email').textContent = email;

    const segButtons = [...menu.querySelectorAll('.ob-acc-seg button')];
    function syncAppearance() {
      const mode = typeof window.getTheme === 'function' ? window.getTheme() : 'system';
      segButtons.forEach(b => {
        const on = b.dataset.themeMode === mode;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      });
    }
    syncAppearance();
    window.addEventListener('ob-theme-change', syncAppearance);

    // Focus order for arrow keys: menu items + the selected appearance option.
    const focusables = () => [...menu.querySelectorAll('.ob-acc-item, .ob-acc-seg button[aria-checked="true"]')]
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    function open() {
      syncAppearance();
      menu.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      focusables()[0]?.focus();
    }
    function close(focusBtn) {
      if (!menu.classList.contains('open')) return;
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      if (focusBtn) btn.focus();
    }
    btn.addEventListener('click', e => { e.stopPropagation(); menu.classList.contains('open') ? close(false) : open(); });
    btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); open(); } });

    menu.addEventListener('click', e => {
      const seg = e.target.closest('.ob-acc-seg button');
      if (seg) {
        if (typeof window.setTheme === 'function') window.setTheme(seg.dataset.themeMode);
        syncAppearance();
        seg.focus();
        return; // keep the menu open so the change is visible
      }
      const item = e.target.closest('.ob-acc-item');
      if (!item) return;
      close(false);
      const action = item.dataset.action;
      if (action === 'profile') window.openAccountCenter('profile');
      else if (action === 'accounts') window.openAccountCenter('accounts');
      else if (action === 'settings') goToSettings();
      else if (action === 'logout') logout();
    });
    menu.addEventListener('keydown', e => {
      const list = focusables();
      const i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.activeElement.closest('.ob-acc-seg')) {
        e.preventDefault();
        const k = segButtons.indexOf(document.activeElement);
        const next = segButtons[(k + (e.key === 'ArrowRight' ? 1 : -1) + segButtons.length) % segButtons.length];
        next.click();
      } else if (e.key === 'Tab') close(false);
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(true); });

    // Right-hand slot of the header (next to "Get started"); fall back to the header.
    const slot = header.querySelector(':scope > div > div:last-child') || header;
    slot.classList.add('ob-has-account');
    slot.appendChild(wrap);

    // Part 3 can set a photo / display name later.
    window.obSetAccountAvatar = function (photoUrl, newName) {
      [btn, wrap.querySelector('.ob-acc-mini')].forEach(el => {
        if (photoUrl) { el.textContent = ''; const img = document.createElement('img'); img.src = photoUrl; img.alt = ''; el.appendChild(img); }
        else el.textContent = initial;
      });
      if (newName) wrap.querySelector('.ob-acc-name').textContent = newName;
    };
  }

  function goToSettings() {
    if (typeof window.switchTab === 'function') window.switchTab('settings');
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
