(() => {
  // Passive navigation helper.
  // Tab persistence and restore are owned by ui-stability-fix.js.
  // This file only keeps the URL hash in sync when the user manually
  // edits the hash or uses back/forward. It does NOT call switchTab on load
  // and does NOT touch localStorage.
  const TABS = new Set(['home', 'trading', 'journal', 'analytics', 'accounts', 'settings']);
  const tabFromHash = () => {
    const t = window.location.hash.replace(/^#/, '').trim().toLowerCase();
    return TABS.has(t) ? t : null;
  };
  function syncFromHash() {
    const tab = tabFromHash();
    if (!tab) return;
    if (typeof window.switchTab !== 'function') return;
    // Only switch if we're actually on a different page.
    const page = document.getElementById(`page${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    if (page && !page.classList.contains('hidden')) return;
    try { window.switchTab(tab); } catch (_) {}
  }
  window.addEventListener('hashchange', syncFromHash);
  window.addEventListener('popstate', syncFromHash);
})();
