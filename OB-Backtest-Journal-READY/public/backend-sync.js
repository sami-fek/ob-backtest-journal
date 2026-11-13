(() => {
  // The sign-in page (/auth.html) is not the app: it has its own form, no session yet,
  // and none of the app page's elements. Loading the app feature scripts there only
  // produced console errors (ui-rules.js, mt5-integration-ui.js) and 401 requests.
  if (/^\/auth\.html$/i.test(location.pathname)) return;
  const ACCOUNT_STORAGE_KEY = 'my_journal_accounts_v1';

  async function readServerState(storageKey) {
    try {
      const response = await fetch(`/api/storage/${encodeURIComponent(storageKey)}`, {
        credentials: 'same-origin', cache: 'no-store'
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Storage read ${response.status}`);
      const body = await response.json();
      return typeof body.value === 'string' ? body.value : null;
    } catch (error) {
      console.warn('[MY Journal] Server state read failed; using local cache.', error);
      return null;
    }
  }

  async function writeServerState(value, storageKey) {
    try {
      const response = await fetch(`/api/storage/${encodeURIComponent(storageKey)}`, {
        method: 'PUT', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
      if (!response.ok) throw new Error(`Storage write ${response.status}`);
      return true;
    } catch (error) {
      console.warn('[MY Journal] Server state write failed; local cache remains available.', error);
      return false;
    }
  }

  function setPersistenceLabel() {
    document.querySelectorAll('span').forEach(label => {
      if (label.textContent.includes('LocalStorage Persistent'))
        label.innerHTML = '<i class="fa-solid fa-database text-blue-600 mr-1"></i> Cloud Persistent';
    });
  }

  async function hydrateAccounts() {
    const serverAccounts = await readServerState(ACCOUNT_STORAGE_KEY);
    const localAccounts = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (serverAccounts) localStorage.setItem(ACCOUNT_STORAGE_KEY, serverAccounts);
    else if (localAccounts) void writeServerState(localAccounts, ACCOUNT_STORAGE_KEY);
  }

  window.persistAccountState = value => writeServerState(value, ACCOUNT_STORAGE_KEY);

  // Signed-out visitors only see the homepage (site-shell.js): the app feature
  // scripts, the app's data load and their polling (daily limit, MT5 status) are
  // skipped, so the homepage loads lighter and makes no failing API calls.
  // A sign-in reloads the page, which then loads everything. If the check itself
  // fails (offline), the app loads as before.
  const signedIn = fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
    .then(r => !(r.status === 401 || r.status === 403))
    .catch(() => true);
  window.obSignedInCheck = signedIn;

  const originalLoad = window.onload;
  window.onload = async function(...args) {
    if (!(await signedIn)) { setPersistenceLabel(); return; }
    await hydrateAccounts();
    if (typeof originalLoad === 'function') originalLoad.apply(this, args);
    setPersistenceLabel();
  };

  // ---- Load order ----
  // 0. auth-check.js loads IMMEDIATELY — redirects to /auth.html if the user
  //    is not authenticated. It is async/non-blocking so it won't delay reveal.
  // 1. auth-modal.js loads next — provides the in-page sign-in modal and
  //    overrides handleGetStarted() on every page.
  // 2. ui-stability-fix.js runs FIRST and alone, so it can install its
  //    switchTab/switchMode wrappers before anything else touches them.
  // 3. Everything else loads in PARALLEL (no onload chaining).
  inject('/auth-check.js');
  inject('/auth-modal.js');
  const FIRST = '/ui-stability-fix.js';
  const REST = [
    '/ui-rules.js',
    '/account-widget-fix.js',
    '/account-edit-persistence-fix.js',
    '/journal-analytics-ui.js',
    '/journal-heatmap.js',
    '/account-widget-size-fix.js',
    '/mt5-link-ui.js',
    '/mt5-link-widget.js',
    '/mt5-integration-ui.js',
    '/mt5-balance-overlay.js',
    '/ui-save-gate-fix.js',
    '/ui-navigation-fix.js',
    '/ui-carousel-stability.js',
    '/discipline-engine.js',
    '/analytics-advanced.js',
    '/mt5-r-assign.js',
    '/ui-dropdowns.js'
  ];

  function inject(src, onDone) {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => onDone && onDone();
    script.onerror = () => {
      console.warn(`[MY Journal] UI feature script failed to load: ${src}`);
      onDone && onDone();
    };
    document.head.appendChild(script);
  }

  function loadRest() {
    REST.forEach(src => inject(src)); // parallel — do not chain
  }

  // Kick off accounts hydration in parallel with everything else (signed in only).
  signedIn.then(ok => { if (ok) hydrateAccounts().finally(() => {}); });

    // Load the first script alone, then fire the rest all at once.
  // When ALL scripts have loaded, reveal the page.
  let pending = REST.length;
  const onOneDone = () => {
    pending -= 1;
    if (pending <= 0) {
      // One more frame to let scripts finish their initial render.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.documentElement.classList.remove('ob-booting');
        });
      });
    }
  };

  function loadRestAndReveal() {
    REST.forEach(src => inject(src, onOneDone));
  }

  signedIn.then(ok => {
    if (ok) { inject(FIRST, loadRestAndReveal); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('ob-booting')));
  });
})();
