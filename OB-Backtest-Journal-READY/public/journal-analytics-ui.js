(() => {
  const MODES = ['Backtest', 'Demo', 'Real', 'Funded'];
  const MODE_MENU = 'journal-analytics-mode-menu';
  const ACCOUNT_MENU = 'journal-analytics-account-menu';
  const ACCOUNT_KEY = 'my_journal_accounts_v1';

  const modeLabel = mode => mode === 'Backtest' ? 'BACKTEST' : `${mode.toUpperCase()} ACCOUNT`;

  function currentMode() {
    try { return typeof activeMode !== 'undefined' ? activeMode : 'Demo'; } catch (_) { return 'Demo'; }
  }

  function readAccounts(mode) {
    if (mode === 'Backtest') return [];
    try {
      const data = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}');
      return Array.isArray(data[mode]) ? data[mode] : [];
    } catch (_) { return []; }
  }

  function currentAccountId(mode) {
    if (mode === 'Backtest') return null;
    return localStorage.getItem(`my_journal_active_account_${mode}_v1`) || readAccounts(mode)[0]?.id || null;
  }

  function syncModeMenus() {
    const mode = currentMode();
    document.querySelectorAll(`.${MODE_MENU}`).forEach(menu => {
      menu.querySelectorAll('button[data-mode]').forEach(btn => {
        const active = btn.dataset.mode === mode;
        btn.classList.toggle('bg-white', active);
        btn.classList.toggle('text-blue-600', active);
        btn.classList.toggle('shadow-sm', active);
        btn.classList.toggle('text-slate-500', !active);
        btn.classList.toggle('hover:text-slate-800', !active);
      });
      const label = menu.querySelector('[data-mode-label]');
      if (label) label.textContent = modeLabel(mode);
    });
    syncAccountMenus();
  }

  function makeModeMenu(page) {
    const section = document.getElementById(page === 'journal' ? 'pageJournal' : 'pageAnalytics');
    if (!section || section.querySelector(`.${MODE_MENU}`)) return;

    const wrap = document.createElement('div');
    wrap.className = `${MODE_MENU} glass-card p-3 flex flex-col sm:flex-row items-center justify-between gap-3`;
    wrap.innerHTML = `
      <div class="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold w-full sm:w-auto">
        ${MODES.map(mode => `<button type="button" data-mode="${mode}" class="px-4 py-2 rounded-lg transition-all flex-1 sm:flex-none text-center text-slate-500 hover:text-slate-800" onclick="window.__journalAnalyticsSetMode('${mode}')">${mode}</button>`).join('')}
      </div>
      <div class="flex items-center gap-2 text-xs">
        <span class="text-slate-400">Viewing:</span>
        <span data-mode-label class="font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">DEMO ACCOUNT</span>
      </div>`;
    section.insertBefore(wrap, section.firstElementChild);
  }

  function makeAccountMenu(page) {
    const section = document.getElementById(page === 'journal' ? 'pageJournal' : 'pageAnalytics');
    if (!section || section.querySelector(`.${ACCOUNT_MENU}`)) return;

    const wrap = document.createElement('div');
    wrap.className = `${ACCOUNT_MENU} mt-2 px-1`;
    section.insertBefore(wrap, section.querySelector(`.${MODE_MENU}`)?.nextSibling || section.firstElementChild?.nextSibling);
    renderAccountMenu(wrap);
  }

  function renderAccountMenu(root) {
    const mode = currentMode();
    if (mode === 'Backtest') {
      root.innerHTML = `<div class="flex items-center gap-2 text-xs text-slate-400"><span class="font-semibold text-slate-500">Account:</span><span class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 font-semibold">All Backtest</span></div>`;
      return;
    }

    const accounts = readAccounts(mode);
    const selected = currentAccountId(mode);
    root.innerHTML = `
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">Account</span>
        ${accounts.map(a => `<button type="button" data-account-id="${String(a.id).replace(/"/g, '&quot;')}" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${a.id === selected ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm' : 'bg-slate-50 text-slate-500 border border-transparent hover:bg-slate-100 hover:text-slate-700'}">${String(a.name || 'Account').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</button>`).join('')}
      </div>`;

    root.querySelectorAll('button[data-account-id]').forEach(btn => {
      btn.addEventListener('click', () => selectAccount(mode, btn.dataset.accountId));
    });
  }

  function syncAccountMenus() {
    document.querySelectorAll(`.${ACCOUNT_MENU}`).forEach(renderAccountMenu);
  }

  function selectAccount(mode, accountId) {
    if (mode === 'Backtest' || !accountId) return;
    const account = readAccounts(mode).find(a => a.id === accountId);
    if (!account || typeof window.switchMode !== 'function') return;

    // ui-rules reads this per-mode key whenever switchMode runs, so this keeps
    // the existing account state/filtering system as the single source of truth.
    localStorage.setItem(`my_journal_active_account_${mode}_v1`, accountId);
    window.switchMode(mode);
    syncModeMenus();
    setTimeout(() => {
      syncModeMenus();
      if (typeof window.renderAll === 'function') window.renderAll();
    }, 50);
  }

  window.__journalAnalyticsSetMode = mode => {
    if (!MODES.includes(mode) || typeof window.switchMode !== 'function') return;
    window.switchMode(mode);
    syncModeMenus();
    setTimeout(() => { syncModeMenus(); if (typeof window.renderAll === 'function') window.renderAll(); }, 40);
  };

  function moveRuleStatusToJournal() {
    const tradingTable = document.getElementById('tradingTableBody')?.closest('table');
    if (tradingTable) {
      const head = tradingTable.querySelector('thead tr');
      const statusIndex = [...(head?.children || [])].findIndex(th => th.textContent.trim().toLowerCase() === 'rule status');
      if (statusIndex >= 0) {
        head.children[statusIndex].remove();
        tradingTable.querySelectorAll('tbody tr').forEach(row => {
          if (row.children.length > statusIndex) row.children[statusIndex].remove();
        });
      }
    }

    const journalTable = document.getElementById('journalTableBody')?.closest('table');
    if (journalTable) {
      const head = journalTable.querySelector('thead tr');
      const checklistIndex = [...(head?.children || [])].findIndex(th => th.textContent.trim().toLowerCase() === 'checklist confluence');
      if (checklistIndex >= 0) head.children[checklistIndex].textContent = 'Rule Status';

      journalTable.querySelectorAll('tbody tr').forEach(row => {
        const cells = row.children;
        if (checklistIndex < 0 || !cells[checklistIndex]) return;
        const id = row.querySelector('button[onclick*="openDrawer"]')?.getAttribute('onclick')?.match(/openDrawer\('([^']+)'\)/)?.[1];
        let trade = null;
        if (id && Array.isArray(window.trades)) trade = window.trades.find(t => t.id === id);
        if (!trade) return;
        const chk = Array.isArray(trade.checklist) ? trade.checklist : [];
        const hasFail = chk.some(s => s === 'fail');
        const hasAny = chk.some(s => s !== 'notset');
        cells[checklistIndex].innerHTML = hasFail
          ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-bold"><i class="fa-solid fa-triangle-exclamation text-[9px]"></i> Violation</span>'
          : hasAny
            ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold"><i class="fa-solid fa-circle-check text-[9px]"></i> Clean</span>'
            : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-400 text-[10px] font-bold"><i class="fa-regular fa-clock text-[9px]"></i> Pending</span>';
      });
    }
  }

  function patchRenders() {
    ['renderJournalTable', 'renderTradingConsole'].forEach(name => {
      const original = window[name];
      if (typeof original !== 'function' || original.__journalAnalyticsPatched) return;
      const patched = function (...args) {
        const result = original.apply(this, args);
        moveRuleStatusToJournal();
        syncModeMenus();
        return result;
      };
      patched.__journalAnalyticsPatched = true;
      window[name] = patched;
    });
  }

  function boot() {
    makeModeMenu('journal');
    makeModeMenu('analytics');
    makeAccountMenu('journal');
    makeAccountMenu('analytics');
    patchRenders();
    moveRuleStatusToJournal();
    syncModeMenus();

    const originalSwitchTab = window.switchTab;
    if (typeof originalSwitchTab === 'function' && !originalSwitchTab.__journalAnalyticsPatched) {
      const patched = function (...args) {
        const result = originalSwitchTab.apply(this, args);
        makeModeMenu('journal');
        makeModeMenu('analytics');
        makeAccountMenu('journal');
        makeAccountMenu('analytics');
        patchRenders();
        moveRuleStatusToJournal();
        syncModeMenus();
        return result;
      };
      patched.__journalAnalyticsPatched = true;
      window.switchTab = patched;
    }

    window.addEventListener('wallet-accounts-updated', () => {
      makeModeMenu('journal');
      makeModeMenu('analytics');
      makeAccountMenu('journal');
      makeAccountMenu('analytics');
      patchRenders();
      moveRuleStatusToJournal();
      syncModeMenus();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
