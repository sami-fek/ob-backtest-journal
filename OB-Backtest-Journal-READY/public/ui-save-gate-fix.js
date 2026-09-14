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

    const check = () => {
      const id = window.__obJournalOpenTradeId || window.currentDrawerTradeId;
      const list = Array.isArray(window.trades) ? window.trades : (typeof trades !== 'undefined' ? trades : []);
      const t = list.find(x => x.id === id);
      if (!t) {
        btn.disabled = true;
        btn.classList.add('opacity-40', 'cursor-not-allowed', 'bg-slate-300');
        btn.classList.remove('bg-emerald-600', 'text-white', 'ob-save-ready');
        return false;
      }
      const strategy = String(t.strategy || 'Model OB');
      const steps = typeof window.checklistFor === 'function' ? window.checklistFor(strategy) : (strategy === 'Model A' ? Array(9) : Array(14));
      const checklist = Array.isArray(t.checklist) ? t.checklist : [];
      const checklistComplete = checklist.length === steps.length && checklist.every(s => s === 'pass' || s === 'fail');
      const screenshotComplete = Array.isArray(t.screenshots) && t.screenshots.length > 0;
      const noteComplete = !!document.getElementById('drawerNotesInput')?.value.trim();
      const ready = checklistComplete && screenshotComplete && noteComplete;
      btn.disabled = !ready;
      btn.classList.toggle('opacity-40', !ready);
      btn.classList.toggle('cursor-not-allowed', !ready);
      btn.classList.toggle('bg-slate-300', !ready);
      btn.classList.toggle('bg-emerald-600', ready);
      btn.classList.toggle('text-slate-500', !ready);
      btn.classList.toggle('text-white', ready);
      btn.classList.toggle('ob-save-ready', ready);
      const label = document.getElementById('drawerSaveBtnLabel');
      if (label) label.textContent = 'Save';
      return ready;
    };

    window.__checkDrawerSaveReady = check;
    check();
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
