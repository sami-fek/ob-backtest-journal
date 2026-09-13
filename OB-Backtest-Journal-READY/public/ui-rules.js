(() => {
  const ACCOUNT_KEY = 'my_journal_accounts_v1';
  const DEFAULT_ACCOUNTS = {
    Demo: [{ id: 'demo-1', name: 'Demo 01', balance: 100000 }],
    Real: [{ id: 'real-1', name: 'Real 01', balance: 100000 }],
    Funded: [{ id: 'funded-1', name: 'Funded 01', balance: 100000 }]
  };

  let accounts = {};
  let activeAccountId = null;

  function loadAccounts() {
    try { accounts = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}'); } catch (_) { accounts = {}; }
    ['Demo', 'Real', 'Funded'].forEach(mode => {
      if (!Array.isArray(accounts[mode]) || !accounts[mode].length) accounts[mode] = DEFAULT_ACCOUNTS[mode].map(a => ({ ...a }));
    });
    Object.keys(accounts).forEach(mode => {
      if (!Array.isArray(accounts[mode])) delete accounts[mode];
      else accounts[mode].forEach(a => { if (!a.balance) a.balance = 100000; });
    });
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
  }

  function saveAccounts() { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts)); }

  function migrateTrades() {
    if (!Array.isArray(window.trades)) return;
    let changed = false;
    window.trades.forEach(t => {
      if (t.mode === 'Backtest') return;
      if (!t.accountId) {
        const first = (accounts[t.mode] || [])[0];
        if (first) { t.accountId = first.id; changed = true; }
      }
    });
    if (changed && typeof window.saveState === 'function') window.saveState();
  }

  function getActiveAccount() {
    const list = accounts[window.activeMode] || [];
    return list.find(a => a.id === activeAccountId) || list[0] || null;
  }

  function accountTrades(mode, accountId) {
    return (window.trades || []).filter(t => t.mode === mode && t.accountId === accountId);
  }

  function accountBalance(account) {
    if (!account) return 0;
    const risk = Number(window.riskPercent) || 1;
    const base = Number(account.startingBalance ?? account.balance ?? 100000);
    const r = accountTrades(window.activeMode, account.id).reduce((sum, t) => sum + (Number(t.rMultiple) || 0), 0);
    return base + r * base * (risk / 100);
  }

  function ensureAccountSelector() {
    const modeBar = document.querySelector('#modeBtn-Backtest')?.parentElement;
    if (!modeBar) return;
    let wrap = document.getElementById('accountSelectorWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'accountSelectorWrap';
      wrap.className = 'flex items-center gap-2 w-full sm:w-auto';
      wrap.innerHTML = `
        <span class="text-[10px] uppercase tracking-wider font-bold text-slate-400">Account</span>
        <select id="accountSelector" class="min-w-[165px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"></select>`;
      const activeWrap = document.querySelector('#activeModeLabel')?.parentElement;
      if (activeWrap?.parentElement) activeWrap.parentElement.insertBefore(wrap, activeWrap);
      else modeBar.parentElement.appendChild(wrap);
      document.getElementById('accountSelector').addEventListener('change', e => {
        activeAccountId = e.target.value;
        localStorage.setItem('my_journal_active_account_v1', activeAccountId);
        renderForAccount();
      });
    }
    wrap.style.display = window.activeMode === 'Backtest' ? 'none' : 'flex';
    const select = document.getElementById('accountSelector');
    if (!select || window.activeMode === 'Backtest') return;
    const list = accounts[window.activeMode] || [];
    if (!list.some(a => a.id === activeAccountId)) activeAccountId = list[0]?.id || null;
    select.innerHTML = list.map(a => `<option value="${a.id}">${a.name} — $${accountBalanceForMode(a).toLocaleString('en-US', {minimumFractionDigits: 2})}</option>`).join('');
    select.value = activeAccountId || '';
  }

  function accountBalanceForMode(account) {
    const risk = Number(window.riskPercent) || 1;
    const base = Number(account.startingBalance ?? account.balance ?? 100000);
    const r = (window.trades || []).filter(t => t.mode === window.activeMode && t.accountId === account.id).reduce((sum, t) => sum + (Number(t.rMultiple) || 0), 0);
    return base + r * base * (risk / 100);
  }

  function renderForAccount() {
    ensureAccountSelector();
    if (typeof window.renderAll === 'function') window.renderAll();
    updateAccountBalanceWidget();
    refreshAccountOptionBalances();
  }

  function filterByAccount() {
    if (window.activeMode === 'Backtest') return (window.trades || []).filter(t => t.mode === 'Backtest');
    const acc = getActiveAccount();
    return acc ? (window.trades || []).filter(t => t.mode === window.activeMode && t.accountId === acc.id) : [];
  }

  function patchAccountFiltering() {
    const targets = [
      ['renderTradingConsole', false],
      ['renderJournalTable', false],
      ['renderHeatmaps', false],
      ['renderAnalyticsKPIs', false],
      ['updateCharts', false]
    ];
    targets.forEach(([name]) => {
      const original = window[name];
      if (typeof original !== 'function' || original.__accountPatched) return;
      const patched = function() {
        const all = window.trades;
        window.trades = filterByAccount();
        try { return original.apply(this, arguments); } finally { window.trades = all; }
      };
      patched.__accountPatched = true;
      window[name] = patched;
    });
  }

  function updateAccountBalanceWidget() {
    const card = document.getElementById('accountBalanceDisplay')?.closest('.glass-card');
    if (!card) return;
    card.style.display = window.activeMode === 'Backtest' ? 'none' : '';
    if (window.activeMode === 'Backtest') return;
    const acc = getActiveAccount();
    if (!acc) return;
    const balance = accountBalance(acc);
    const base = Number(acc.startingBalance ?? acc.balance ?? 100000);
    const ret = base ? ((balance - base) / base) * 100 : 0;
    const display = document.getElementById('accountBalanceDisplay');
    const badge = document.getElementById('accountReturnBadge');
    if (display) display.textContent = `$${balance.toLocaleString('en-US', {minimumFractionDigits:2})}`;
    if (badge) badge.textContent = `${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%`;
    const baseSpan = card.querySelector('.text-blue-200.font-medium.uppercase')?.parentElement?.querySelector('.flex span');
    if (baseSpan) baseSpan.textContent = `Base Capital: $${base.toLocaleString('en-US', {minimumFractionDigits:2})}`;
  }

  function refreshAccountOptionBalances() {
    const select = document.getElementById('accountSelector');
    if (!select || window.activeMode === 'Backtest') return;
    const list = accounts[window.activeMode] || [];
    select.innerHTML = list.map(a => `<option value="${a.id}">${a.name} — $${accountBalanceForMode(a).toLocaleString('en-US', {minimumFractionDigits:2})}</option>`).join('');
    select.value = activeAccountId || '';
  }

  function setSaveEnabled(btn, enabled) {
    btn.disabled = !enabled;
    btn.classList.toggle('opacity-40', !enabled);
    btn.classList.toggle('cursor-not-allowed', !enabled);
    btn.classList.toggle('hover:bg-emerald-700', enabled);
    btn.classList.toggle('bg-slate-300', !enabled);
    btn.classList.toggle('bg-emerald-600', enabled);
    btn.classList.toggle('text-slate-500', !enabled);
    btn.classList.toggle('text-white', enabled);
  }

  function setupRequiredSave() {
    const btn = document.getElementById('drawerSaveBtn');
    if (!btn) return;
    btn.innerHTML = '<span id="drawerSaveBtnLabel">Save</span>';
    btn.disabled = true;
    const check = () => {
      const t = (window.trades || []).find(x => x.id === window.currentDrawerTradeId);
      if (!t) return setSaveEnabled(btn, false);
      const checklist = t.checklist || [];
      const checklistComplete = checklist.length === window.DEFAULT_CHECKLIST.length && checklist.every(s => s === 'pass' || s === 'fail');
      const screenshotComplete = Array.isArray(t.screenshots) && t.screenshots.length > 0;
      const noteComplete = document.getElementById('drawerNotesInput')?.value.trim().length > 0;
      setSaveEnabled(btn, checklistComplete && screenshotComplete && noteComplete);
    };
    window.__checkDrawerSaveReady = check;
    document.getElementById('drawerNotesInput')?.addEventListener('input', check);
    check();
  }

  function patchDrawer() {
    const originalOpen = window.openDrawer;
    if (typeof originalOpen === 'function' && !originalOpen.__patchedRules) {
      const patched = function(id) {
        originalOpen.apply(this, arguments);
        const t = (window.trades || []).find(x => x.id === id);
        if (t && window.activeMode !== 'Backtest') t.accountId = t.accountId || activeAccountId;
        setTimeout(() => { setupRequiredSave(); window.__checkDrawerSaveReady?.(); }, 0);
      };
      patched.__patchedRules = true;
      window.openDrawer = patched;
    }

    const originalChecklist = window.setChecklistItem;
    if (typeof originalChecklist === 'function' && !originalChecklist.__patchedRules) {
      const patched = function() {
        const result = originalChecklist.apply(this, arguments);
        window.__checkDrawerSaveReady?.();
        return result;
      };
      patched.__patchedRules = true;
      window.setChecklistItem = patched;
    }

    const originalUpload = window.handleScreenshotUpload;
    if (typeof originalUpload === 'function' && !originalUpload.__patchedRules) {
      const patched = function() {
        const result = originalUpload.apply(this, arguments);
        setTimeout(() => window.__checkDrawerSaveReady?.(), 100);
        return result;
      };
      patched.__patchedRules = true;
      window.handleScreenshotUpload = patched;
    }

    const originalRemove = window.removeScreenshot;
    if (typeof originalRemove === 'function' && !originalRemove.__patchedRules) {
      const patched = function() {
        const result = originalRemove.apply(this, arguments);
        setTimeout(() => window.__checkDrawerSaveReady?.(), 0);
        return result;
      };
      patched.__patchedRules = true;
      window.removeScreenshot = patched;
    }
  }

  function patchSaveDrawer() {
    const original = window.saveDrawer;
    if (typeof original !== 'function' || original.__requiredPatched) return;
    const patched = function() {
      if (document.getElementById('drawerSaveBtn')?.disabled) return;
      const result = original.apply(this, arguments);
      setTimeout(() => { setupRequiredSave(); window.__checkDrawerSaveReady?.(); }, 0);
      return result;
    };
    patched.__requiredPatched = true;
    window.saveDrawer = patched;
  }

  function patchTradeSubmit() {
    const original = window.handleTradeSubmit;
    if (typeof original !== 'function' || original.__accountPatched) return;
    const patched = function(e) {
      const before = (window.trades || []).length;
      const result = original.apply(this, arguments);
      const created = (window.trades || [])[0];
      if ((window.trades || []).length > before && created && window.activeMode !== 'Backtest') {
        created.accountId = activeAccountId;
        if (typeof window.saveState === 'function') window.saveState();
      }
      setTimeout(() => { patchIconsAndBacktestUI(); setupRequiredSave(); window.__checkDrawerSaveReady?.(); }, 0);
      return result;
    };
    patched.__accountPatched = true;
    window.handleTradeSubmit = patched;
  }

  function patchMode() {
    const original = window.switchMode;
    if (typeof original !== 'function' || original.__accountPatched) return;
    const patched = function(mode) {
      if (mode !== 'Backtest') {
        const list = accounts[mode] || [];
        activeAccountId = localStorage.getItem('my_journal_active_account_v1') || list[0]?.id || null;
      } else activeAccountId = null;
      const result = original.apply(this, arguments);
      ensureAccountSelector();
      renderForAccount();
      patchIconsAndBacktestUI();
      return result;
    };
    patched.__accountPatched = true;
    window.switchMode = patched;
  }

  function patchIconsAndBacktestUI() {
    document.querySelectorAll('button').forEach(btn => {
      const eye = btn.querySelector('i.fa-eye');
      if (eye) {
        eye.classList.remove('fa-eye');
        eye.classList.add('fa-pen');
        btn.title = 'Edit journal entry';
      }
    });
    const label = document.getElementById('drawerSaveBtnLabel');
    if (label) label.textContent = 'Save';
  }

  function init() {
    loadAccounts();
    migrateTrades();
    if (window.activeMode !== 'Backtest') {
      const list = accounts[window.activeMode] || [];
      activeAccountId = localStorage.getItem('my_journal_active_account_v1') || list[0]?.id || null;
    }
    patchTradeSubmit();
    patchDrawer();
    patchSaveDrawer();
    patchMode();
    patchAccountFiltering();
    ensureAccountSelector();
    patchIconsAndBacktestUI();
    setupRequiredSave();
    updateAccountBalanceWidget();
    refreshAccountOptionBalances();
  }

  window.addEventListener('load', () => setTimeout(init, 0));
})();
