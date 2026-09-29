/**
 * auth-check.js
 * Injected into every page by backend-sync.js.
 * - Verifies the user is authenticated via /api/auth/me
 * - Redirects to /auth.html if not
 * - Adds user email + logout button to the app header when authenticated
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
        const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
        window.location.replace('/auth.html?next=' + next);
        return null;
      }
      if (!res.ok) {
        // Non-auth error (server down etc.) — don't redirect, just warn
        console.warn('[OB Auth] /api/auth/me returned', res.status);
        return null;
      }
      const body = await res.json().catch(() => null);
      return body?.user ?? null;
    } catch (err) {
      // Network error — don't block the user, warn only
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

  function injectUserBadge(email) {
    // Find the sticky header element
    const header = document.querySelector('header');
    if (!header) return;

    // Don't inject twice
    if (document.getElementById('ob-auth-badge')) return;

    const badge = document.createElement('div');
    badge.id = 'ob-auth-badge';
    badge.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      flex-shrink: 0;
    `;

    // Shorten the email for display — show only local part if it's long
    const displayEmail = email.length > 22 ? email.split('@')[0] : email;

    badge.innerHTML = `
      <span style="
        font-size: 0.78rem;
        color: #64748b;
        font-weight: 500;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: none;
      " id="ob-auth-email" title="${email}">${displayEmail}</span>
      <button
        id="ob-logout-btn"
        title="Sign out"
        style="
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 12px;
          border-radius: 8px;
          border: 1.5px solid #e2e8f0;
          background: #fff;
          color: #64748b;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap;
        "
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign out
      </button>
    `;

    badge.querySelector('#ob-logout-btn').addEventListener('click', logout);
    badge.querySelector('#ob-logout-btn').addEventListener('mouseenter', function() {
      this.style.background = '#f8fafc';
      this.style.color = '#ef4444';
      this.style.borderColor = '#fecaca';
    });
    badge.querySelector('#ob-logout-btn').addEventListener('mouseleave', function() {
      this.style.background = '#fff';
      this.style.color = '#64748b';
      this.style.borderColor = '#e2e8f0';
    });

    // Show email label on wider screens
    function updateEmailVisibility() {
      const emailEl = badge.querySelector('#ob-auth-email');
      if (emailEl) emailEl.style.display = window.innerWidth >= 640 ? 'block' : 'none';
    }
    updateEmailVisibility();
    window.addEventListener('resize', updateEmailVisibility);

    // Append badge to the rightmost slot in the header nav
    // Try to find the nav flex container first
    const nav = header.querySelector('nav') || header.querySelector('[class*="flex"]') || header;
    nav.appendChild(badge);
  }

  // Run auth check immediately (async, non-blocking)
  checkAuth().then(user => {
    if (user?.email) {
      injectUserBadge(user.email);
    }
  });

  // Expose globally so other scripts can trigger logout programmatically
  window.obAuthLogout = logout;
})();
