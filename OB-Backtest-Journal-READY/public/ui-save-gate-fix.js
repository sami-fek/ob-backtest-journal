(() => {
  const STYLE_ID = 'ob-save-gate-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #drawerSaveBtn.ob-save-ready{transition:opacity .18s ease,transform .18s ease,background-color .18s ease}
      #drawerSaveBtn:not(:disabled).ob-save-ready:hover{transform:translateY(-1px)}
    `;
    document.head.appendChild(style);
  }

  function installCheck() {
    const btn = document.getElementById('drawerSaveBtn');
    if (!btn) return;
    injectStyle();
    // Save is always available once a drawer is open — no strict gate.
    const enableBtn = () => {
      const b = document.getElementById('drawerSaveBtn');
      if (!b) return;
      b.disabled = false;
      b.classList.remove('opacity-40', 'cursor-not-allowed', 'bg-slate-300', 'text-slate-500');
      b.classList.add('bg-emerald-600', 'text-white', 'ob-save-ready');
      const label = document.getElementById('drawerSaveBtnLabel');
      if (label) label.textContent = 'Save Changes';
    };
    window.__checkDrawerSaveReady = enableBtn;
    enableBtn();
  }

  function patchOpenDrawer() {
    const original = window.openDrawer;
    if (typeof original !== 'function' || original.__saveGateStrategyPatched) return;
    const patched = function(...args) {
      const result = original.apply(this, args);
      window.__obJournalOpenTradeId = args[0];
      setTimeout(installCheck, 0);
      return result;
    };
    patched.__saveGateStrategyPatched = true;
    window.openDrawer = patched;
  }

  function patchChecklist() {
    const original = window.setChecklistItem;
    if (typeof original !== 'function' || original.__saveGateStrategyPatched) return;
    const patched = function(...args) {
      const result = original.apply(this, args);
      setTimeout(installCheck, 0);
      return result;
    };
    patched.__saveGateStrategyPatched = true;
    window.setChecklistItem = patched;
  }

  function patchScreenshotUpload() {
    const original = window.handleScreenshotUpload;
    if (typeof original !== 'function' || original.__saveGateStrategyPatched) return;
    const patched = function(...args) {
      const result = original.apply(this, args);
      setTimeout(installCheck, 120);
      return result;
    };
    patched.__saveGateStrategyPatched = true;
    window.handleScreenshotUpload = patched;
  }

  function patchRemoveScreenshot() {
    const original = window.removeScreenshot;
    if (typeof original !== 'function' || original.__saveGateStrategyPatched) return;
    const patched = function(...args) {
      const result = original.apply(this, args);
      setTimeout(installCheck, 0);
      return result;
    };
    patched.__saveGateStrategyPatched = true;
    window.removeScreenshot = patched;
  }

  function boot() {
    patchOpenDrawer();
    patchChecklist();
    patchScreenshotUpload();
    patchRemoveScreenshot();
    const note = document.getElementById('drawerNotesInput');
    note?.addEventListener('input', installCheck);
    installCheck();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
