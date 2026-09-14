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
      const modal = document.getElementById('accountEditModal');
      if (!saveButton || !modal || saveButton.__persistencePatched) return result;

      const originalClick = saveButton.onclick;
      if (typeof originalClick !== 'function') return result;

      saveButton.__persistencePatched = true;
      saveButton.onclick = function (event) {
        try {
          originalClick.call(this, event);
        } catch (error) {
          // Keep compatibility with the stale accountKey(mode) reference from an
          // older edit handler. The account data has already been saved locally.
          if (!(error instanceof ReferenceError) || !String(error.message || '').includes('accountKey')) {
            throw error;
          }
        }

        // The edit handler closes the modal on a valid save. Ensure that the
        // modal cannot remain visible after a successful save, including when
        // the legacy error above interrupts the remainder of that handler.
        const name = document.getElementById('editAccountName')?.value.trim();
        const balance = Number((document.getElementById('editAccountBalance')?.value || '').replace(/,/g, ''));
        const valid = !!name && Number.isFinite(balance) && balance > 0;

        if (valid) {
          persistAccounts();
          queueMicrotask(() => {
            document.getElementById('accountEditModal')?.remove();
            window.dispatchEvent(new CustomEvent('wallet-accounts-updated'));
          });
        }
      };
    };

    patchedOpen.__persistencePatched = true;
    window.openEditAccountModal = patchedOpen;
  }

  function patchTradeDrawerSave() {
    const saveButton = document.getElementById('drawerSaveBtn');
    if (!saveButton || saveButton.__closePeekPatched) return;

    const originalClick = saveButton.onclick;
    if (typeof originalClick !== 'function') return;

    saveButton.__closePeekPatched = true;
    saveButton.onclick = function (event) {
      const result = originalClick.call(this, event);

      // Saving the trade should also close the right-side trade peek drawer.
      // Use the page's existing closeDrawer() so its normal closing animation
      // and state cleanup remain intact.
      if (typeof window.closeDrawer === 'function') {
        window.closeDrawer();
      } else {
        const drawer = document.getElementById('tradeDrawer');
        if (drawer) {
          drawer.classList.remove('drawer-open');
          drawer.classList.add('hidden');
        }
      }

      return result;
    };
  }

  function boot() {
    patchEditModal();
    patchTradeDrawerSave();
    const observer = new MutationObserver(() => {
      patchEditModal();
      patchTradeDrawerSave();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('wallet-accounts-updated', persistAccounts);
  }

  if (document.body) boot();
  else window.addEventListener('DOMContentLoaded', boot, { once: true });
})();
