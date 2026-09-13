(() => {
  const ACCOUNT_STORAGE_KEY = 'my_journal_accounts_v1';

  function persistAccounts() {
    const value = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (value && typeof window.persistAccountState === 'function') {
      void window.persistAccountState(value);
    }
  }

  function patchEditModal() {
    const originalOpen = window.openEditAccountModal;
    if (typeof originalOpen !== 'function' || originalOpen.__persistencePatched) return;

    const patchedOpen = function (...args) {
      const result = originalOpen.apply(this, args);

      const saveButton = document.getElementById('accountEditSave');
      if (!saveButton || saveButton.__persistencePatched) return result;

      const originalClick = saveButton.onclick;
      if (typeof originalClick !== 'function') return result;

      saveButton.__persistencePatched = true;
      saveButton.onclick = function (event) {
        try {
          return originalClick.call(this, event);
        } catch (error) {
          // The current edit handler successfully updates the private account state
          // and localStorage, then hits an old undefined accountKey(mode) reference.
          // Preserve that existing behavior and only recover from that stale reference.
          if (!(error instanceof ReferenceError) || !String(error.message || '').includes('accountKey')) {
            throw error;
          }

          persistAccounts();
          document.getElementById('accountEditModal')?.remove();
          window.dispatchEvent(new CustomEvent('wallet-accounts-updated'));
        }
      };

      return result;
    };

    patchedOpen.__persistencePatched = true;
    window.openEditAccountModal = patchedOpen;
  }

  function boot() {
    patchEditModal();
    const observer = new MutationObserver(patchEditModal);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('wallet-accounts-updated', persistAccounts);
  }

  if (document.body) boot();
  else window.addEventListener('DOMContentLoaded', boot, { once: true });
})();
