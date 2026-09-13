(() => {
  const STORAGE_KEY = 'my_journal_trades_v1';
  const ACCOUNT_STORAGE_KEY = 'my_journal_accounts_v1';
  const API_PATH = `/api/storage/${encodeURIComponent(STORAGE_KEY)}`;
  const ACCOUNT_API_PATH = `/api/storage/${encodeURIComponent(ACCOUNT_STORAGE_KEY)}`;

  async function readServerState(storageKey = STORAGE_KEY) {
    try {
      const response = await fetch(`/api/storage/${encodeURIComponent(storageKey)}`, { credentials: 'same-origin' });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Storage read ${response.status}`);
      const body = await response.json();
      return typeof body.value === 'string' ? body.value : null;
    } catch (error) {
      console.warn('[OB Journal] Server state read failed; using local cache.', error);
      return null;
    }
  }

  async function writeServerState(value, storageKey = STORAGE_KEY) {
    try {
      const response = await fetch(`/api/storage/${encodeURIComponent(storageKey)}`, {
        method: 'PUT',
        credentials: 'same-origin',
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
      if (label.textContent.includes('LocalStorage Persistent')) {
        label.innerHTML = '<i class="fa-solid fa-database text-blue-600 mr-1"></i> Cloud Persistent';
      }
    });
  }

  const originalLoad = window.onload;
  window.persistAccountState = value => writeServerState(value, ACCOUNT_STORAGE_KEY);

  window.onload = async function (...args) {
    const [serverState, serverAccounts] = await Promise.all([
      readServerState(STORAGE_KEY),
      readServerState(ACCOUNT_STORAGE_KEY)
    ]);
    const localState = localStorage.getItem(STORAGE_KEY);
    const localAccounts = localStorage.getItem(ACCOUNT_STORAGE_KEY);

    if (serverState) {
      localStorage.setItem(STORAGE_KEY, serverState);
    } else if (localState) {
      await writeServerState(localState, STORAGE_KEY);
    }

    if (serverAccounts) {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, serverAccounts);
    } else if (localAccounts) {
      await writeServerState(localAccounts, ACCOUNT_STORAGE_KEY);
    }

    if (typeof originalLoad === 'function') originalLoad.apply(this, args);
    setPersistenceLabel();
  };

  const originalSave = window.saveState;
  if (typeof originalSave === 'function') {
    window.saveState = function (...args) {
      const result = originalSave.apply(this, args);
      const value = localStorage.getItem(STORAGE_KEY);
      if (value) void writeServerState(value);
      return result;
    };
  }

  const uiScript = document.createElement('script');
  uiScript.src = '/ui-rules.js';
  uiScript.onload = () => {
    const widgetScript = document.createElement('script');
    widgetScript.src = '/account-widget-fix.js';
    document.head.appendChild(widgetScript);
  };
  document.head.appendChild(uiScript);
})();
