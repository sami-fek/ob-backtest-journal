(() => {
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
      console.warn('[OB Journal] Server state read failed; using local cache.', error);
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
      console.warn('[OB Journal] Server state write failed; local cache remains available.', error);
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

  const originalLoad = window.onload;
  window.onload = async function(...args) {
    await hydrateAccounts();
    if (typeof originalLoad === 'function') originalLoad.apply(this, args);
    setPersistenceLabel();
  };

  // ---- Load order ----
  // 1. ui-stability-fix.js runs FIRST and alone, so it can install its
  //    switchTab/switchMode wrappers before anything else touches them.
  // 2. Everything else loads in PARALLEL (no onload chaining).
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
    '/ui-carousel-stability.js'
  ];

  function inject(src, onDone) {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => onDone && onDone();
    script.onerror = () => {
      console.warn(`[OB Journal] UI feature script failed to load: ${src}`);
      onDone && onDone();
    };
    document.head.appendChild(script);
  }

  function loadRest() {
    REST.forEach(src => inject(src)); // parallel — do not chain
  }

  // Kick off accounts hydration in parallel with everything else.
  hydrateAccounts().finally(() => {});

  // Load the first script alone, then fire the rest all at once.
  inject(FIRST, loadRest);
})();
