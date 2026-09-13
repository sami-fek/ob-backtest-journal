(() => {
  const ACCOUNT_KEY = 'my_journal_accounts_v1';
  const DEFAULT_ACCOUNTS = {
    Demo: [{ id: 'demo-1', name: 'Demo 01', balance: 100000, startingBalance: 100000 }],
    Real: [{ id: 'real-1', name: 'Real 01', balance: 100000, startingBalance: 100000 }],
    Funded: [{ id: 'funded-1', name: 'Funded 01', balance: 100000, startingBalance: 100000 }]
  };
  const CHECKLIST_COUNT = 8;
  let accounts = {};
  let activeAccountId = null;
  let currentDrawerTradeId = null;

  function loadAccounts() {
    try { accounts = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}'); } catch (_) { accounts = {}; }
    ['Demo', 'Real', 'Funded'].forEach(mode => {
      if (!Array.isArray(accounts[mode]) || !accounts[mode].length) accounts[mode] = DEFAULT_ACCOUNTS[mode].map(a => ({ ...a }));
    });
    Object.keys(accounts).forEach(mode => {
      if (!Array.isArray(accounts[mode])) delete accounts[mode];
      else accounts[mode].forEach(a => {
        if (!Number.isFinite(Number(a.balance))) a.balance = 100000;
        if (!Number.isFinite(Number(a.startingBalance))) a.startingBalance = Number(a.balance) || 100000;
      });
    });
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
  }

  function saveAccounts() { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts)); }

  function activeList() { return activeMode === 'Backtest' ? [] : (accounts[activeMode] || []); }
  function getActiveAccount() { return activeList().find(a => a.id === activeAccountId) || activeList()[0] || null; }

  function accountBalance(account) {
    if (!account || !Array.isArray(trades)) return 0;
    const risk = Number(riskPercent) || 1;
    const base = Number(account.startingBalance ?? account.balance ?? 100000);
    const r = trades.filter(t => t.mode === activeMode && t.accountId === account.id)
      .reduce((sum, t) => sum + (Number(t.rMultiple) || 0), 0);
    return base + r * base * (risk / 100);
  }

  function accountTrades() {
    if (!Array.isArray(trades)) return [];
    if (activeMode === 'Backtest') return trades.filter(t => t.mode === 'Backtest');
    const acc = getActiveAccount();
    return acc ? trades.filter(t => t.mode === activeMode && t.accountId === acc.id) : [];
  }

  function migrateTrades() {
    if (!Array.isArray(trades)) return;
    let changed = false;
    trades.forEach(t => {
      if (t.mode === 'Backtest' || t.accountId) return;
      const first = (accounts[t.mode] || [])[0];
      if (first) { t.accountId = first.id; changed = true; }
    });
    if (changed && typeof window.saveState === 'function') window.saveState();
  }

  function showAccountToast(message) {
    let toast = document.getElementById('accountTextToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'accountTextToast';
      toast.className = 'fixed left-1/2 top-6 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl bg-white/90 backdrop-blur-xl border border-white/70 shadow-2xl text-sm font-semibold text-slate-700 opacity-0 pointer-events-none transition-all duration-200';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('opacity-0');
    toast.classList.add('opacity-100');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.classList.remove('opacity-100'); toast.classList.add('opacity-0'); }, 1800);
  }

  function closeAccountModal() {
    document.getElementById('accountAddModal')?.remove();
    document.getElementById('accountEditModal')?.remove();
  }

  function openAddAccountModal() {
    if (activeMode === 'Backtest') return;
    closeAccountModal();
    const mode = activeMode;
    const count = (accounts[mode] || []).length + 1;
    const overlay = document.createElement('div');
    overlay.id = 'accountAddModal';
    overlay.className = 'fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/30 backdrop-blur-md';
    overlay.innerHTML = `
      <div class="w-full max-w-[480px] rounded-[24px] border border-white/80 bg-white/80 backdrop-blur-2xl shadow-[0_25px_80px_rgba(15,23,42,.22)] overflow-hidden">
        <div class="p-6 sm:p-7">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-xl font-bold tracking-tight text-slate-900">Add ${mode} account</h3>
              <p class="mt-1 text-xs text-slate-500">Create another account for this mode.</p>
            </div>
            <button id="accountModalClose" class="h-9 w-9 rounded-xl bg-white/70 border border-slate-200/80 text-slate-400 hover:text-slate-700 hover:bg-white transition-colors" aria-label="Close">×</button>
          </div>

          <div class="mt-6 space-y-4">
            <label class="block">
              <span class="block mb-2 text-xs font-bold text-slate-600">Account name</span>
              <input id="newAccountName" value="${mode} ${count}" class="w-full rounded-xl border border-slate-200 bg-white/75 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" autocomplete="off">
            </label>
            <label class="block">
              <span class="block mb-2 text-xs font-bold text-slate-600">Starting balance</span>
              <div class="relative">
                <input id="newAccountBalance" value="100000" inputmode="decimal" class="w-full rounded-xl border border-slate-200 bg-white/75 px-4 py-3 pr-14 text-sm font-mono text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                <span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">USD</span>
              </div>
            </label>
          </div>

          <div class="mt-7 flex justify-end gap-2">
            <button id="accountModalCancel" class="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white/70 transition-colors">Cancel</button>
            <button id="accountModalCreate" class="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-colors">Add account</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeAccountModal(); });
    document.getElementById('accountModalClose').onclick = closeAccountModal;
    document.getElementById('accountModalCancel').onclick = closeAccountModal;
    document.getElementById('accountModalCreate').onclick = () => {
      const name = document.getElementById('newAccountName').value.trim();
      const balance = Number(document.getElementById('newAccountBalance').value.replace(/,/g, ''));
      if (!name) { showAccountToast('Enter an account name.'); return; }
      if (!Number.isFinite(balance) || balance <= 0) { showAccountToast('Enter a valid starting balance.'); return; }
      const account = { id: `${mode.toLowerCase()}-${Date.now()}`, name, balance, startingBalance: balance };
      accounts[mode].push(account);
      activeAccountId = account.id;
      saveAccounts();
      localStorage.setItem(`my_journal_active_account_${mode}_v1`, activeAccountId);
      closeAccountModal();
      showAccountToast('Account added.');
      renderForAccount();
    };
    setTimeout(() => document.getElementById('newAccountName')?.focus(), 0);
  }

  function openEditAccountModal(accountId) {
    if (activeMode === 'Backtest') return;
    const mode = activeMode;
    const account = (accounts[mode] || []).find(item => item.id === accountId);
    if (!account) return;
    closeAccountModal();
    const overlay = document.createElement('div');
    overlay.id = 'accountEditModal';
    overlay.className = 'fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/30 backdrop-blur-md';
    overlay.innerHTML = 
      '<div class="w-full max-w-[480px] rounded-[24px] border border-white/80 bg-white/80 backdrop-blur-2xl shadow-[0_25px_80px_rgba(15,23,42,.22)] overflow-hidden">' +
        '<div class="p-6 sm:p-7">' +
          '<div class="flex items-start justify-between gap-4">' +
            '<div><h3 class="text-xl font-bold tracking-tight text-slate-900">Edit ' + mode + ' account</h3><p class="mt-1 text-xs text-slate-500">Rename the account or change its starting balance.</p></div>' +
            '<button id="accountEditClose" class="h-9 w-9 rounded-xl bg-white/70 border border-slate-200/80 text-slate-400 hover:text-slate-700 hover:bg-white transition-colors" aria-label="Close">×</button>' +
          '</div>' +
          '<div class="mt-6 space-y-4">' +
            '<label class="block"><span class="block mb-2 text-xs font-bold text-slate-600">Account name</span><input id="editAccountName" class="w-full rounded-xl border border-slate-200 bg-white/75 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" autocomplete="off"></label>' +
            '<label class="block"><span class="block mb-2 text-xs font-bold text-slate-600">Starting balance</span><div class="relative"><input id="editAccountBalance" inputmode="decimal" class="w-full rounded-xl border border-slate-200 bg-white/75 px-4 py-3 pr-14 text-sm font-mono text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">USD</span></div></label>' +
          '</div>' +
          '<div class="mt-7 flex justify-end gap-2"><button id="accountEditCancel" class="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white/70 transition-colors">Cancel</button><button id="accountEditSave" class="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-colors">Save changes</button></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('editAccountName').value = account.name || '';
    document.getElementById('editAccountBalance').value = String(account.startingBalance ?? account.balance ?? 100000);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeAccountModal(); });
    document.getElementById('accountEditClose').onclick = closeAccountModal;
    document.getElementById('accountEditCancel').onclick = closeAccountModal;
    document.getElementById('accountEditSave').onclick = () => {
      const name = document.getElementById('editAccountName').value.trim();
      const balance = Number(document.getElementById('editAccountBalance').value.replace(/,/g, ''));
      if (!name) { showAccountToast('Enter an account name.'); return; }
      if (!Number.isFinite(balance) || balance <= 0) { showAccountToast('Enter a valid starting balance.'); return; }
      account.name = name;
      account.startingBalance = balance;
      account.balance = balance;
      saveAccounts();
      localStorage.setItem(accountKey(mode)], account.id);
      closeAccountModal();
      showAccountToast('Account updated.');
      renderForAccount();
      window.dispatchEvent(new CustomEvent('wallet-accounts-updated'));
    };
    setTimeout(() => document.getElementById('editAccountName')?.focus(), 0);
  }

  // The wallet widget invokes this bridge for its Add account control.
  window.openAddAccountModal = openAddAccountModal;
  window.openEditAccountModal = openEditAccountModal;

  function ensureBalanceCard() {
    const display = document.getElementById('accountBalanceDisplay');
    const panel = display?.closest('.bg-gradient-to-br');
    const card = display?.closest('.glass-card');
    if (!display || !panel || !card) return;

    card.style.display = activeMode === 'Backtest' ? 'none' : '';
    if (activeMode === 'Backtest') return;

    panel.id = 'accountBalanceSwipePanel';
    panel.style.position = 'relative';
    panel.classList.add('select-none');

    let header = document.getElementById('accountCardHeader');
    if (!header || !panel.contains(header)) {
      header?.remove();
      header = document.createElement('div');
      header.id = 'accountCardHeader';
      header.className = 'flex items-center justify-between gap-3 mb-2';
      panel.insertBefore(header, panel.firstChild);
    }

    const acc = getActiveAccount();
    const list = activeList();
    header.innerHTML = `
      <div class="min-w-0">
        <div class="text-[10px] text-blue-200/80 font-bold uppercase tracking-wider">${activeMode} account</div>
        <div class="text-sm font-bold text-white truncate">${acc?.name || 'Account'}</div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${list.length > 1 ? `<span class="text-[9px] text-blue-200/80 uppercase tracking-wider">Swipe</span>` : ''}
        <button id="addAccountTextBtn" type="button" class="text-[10px] font-bold text-white/90 hover:text-white underline underline-offset-2">+ Add account</button>
      </div>`;
    document.getElementById('addAccountTextBtn').onclick = e => { e.stopPropagation(); openAddAccountModal(); };

    const balance = accountBalance(acc);
    const base = Number(acc?.startingBalance ?? acc?.balance ?? 100000);
    const ret = base ? ((balance - base) / base) * 100 : 0;
    display.textContent = `$${balance.toLocaleString('en-US', {minimumFractionDigits:2})}`;
    document.getElementById('accountReturnBadge').textContent = `${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%`;
    const baseSpan = panel.querySelector('.text-blue-200.font-medium.uppercase')?.parentElement?.querySelector('.flex span');
    if (baseSpan) baseSpan.textContent = `Base Capital: $${base.toLocaleString('en-US', {minimumFractionDigits:2})}`;

  }

  function filterByAccount() { return accountTrades(); }

  function patchAccountFiltering() {
    ['renderTradingConsole', 'renderJournalTable', 'renderHeatmaps', 'renderAnalyticsKPIs', 'updateCharts'].forEach(name => {
      const original = window[name];
      if (typeof original !== 'function' || original.__accountPatched) return;
      const patched = function(...args) {
        const all = trades;
        trades = filterByAccount();
        try { return original.apply(this, args); } finally { trades = all; }
      };
      patched.__accountPatched = true;
      window[name] = patched;
    });
  }

  function renderForAccount() {
    ensureBalanceCard();
    patchAccountFiltering();
    if (typeof window.renderAll === 'function') window.renderAll();
    ensureBalanceCard();
    patchIconsAndBacktestUI();
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
    const check = () => {
      const t = Array.isArray(trades) ? trades.find(x => x.id === currentDrawerTradeId) : null;
      if (!t) return setSaveEnabled(btn, false);
      const checklist = t.checklist || [];
      const checklistComplete = checklist.length === CHECKLIST_COUNT && checklist.every(s => s === 'pass' || s === 'fail');
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
        currentDrawerTradeId = id;
        originalOpen.apply(this, arguments);
        const t = trades.find(x => x.id === id);
        if (t && activeMode !== 'Backtest') t.accountId = t.accountId || activeAccountId;
        setTimeout(() => { setupRequiredSave(); window.__checkDrawerSaveReady?.(); }, 0);
      };
      patched.__patchedRules = true;
      window.openDrawer = patched;
    }
    const originalChecklist = window.setChecklistItem;
    if (typeof originalChecklist === 'function' && !originalChecklist.__patchedRules) {
      const patched = function() { const result = originalChecklist.apply(this, arguments); window.__checkDrawerSaveReady?.(); return result; };
      patched.__patchedRules = true;
      window.setChecklistItem = patched;
    }
    const originalUpload = window.handleScreenshotUpload;
    if (typeof originalUpload === 'function' && !originalUpload.__patchedRules) {
      const patched = function() { const result = originalUpload.apply(this, arguments); setTimeout(() => window.__checkDrawerSaveReady?.(), 100); return result; };
      patched.__patchedRules = true;
      window.handleScreenshotUpload = patched;
    }
    const originalRemove = window.removeScreenshot;
    if (typeof originalRemove === 'function' && !originalRemove.__patchedRules) {
      const patched = function() { const result = originalRemove.apply(this, arguments); setTimeout(() => window.__checkDrawerSaveReady?.(), 0); return result; };
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
      const before = trades.length;
      const result = original.apply(this, arguments);
      const created = trades[0];
      if (trades.length > before && created && activeMode !== 'Backtest') {
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
        activeAccountId = localStorage.getItem(`my_journal_active_account_${mode}_v1`) || list[0]?.id || null;
      } else activeAccountId = null;
      const result = original.apply(this, arguments);
      renderForAccount();
      return result;
    };
    patched.__accountPatched = true;
    window.switchMode = patched;
  }

  function patchIconsAndBacktestUI() {
    document.querySelectorAll('button').forEach(btn => {
      const eye = btn.querySelector('i.fa-eye');
      if (eye) { eye.classList.remove('fa-eye'); eye.classList.add('fa-pen'); btn.title = 'Edit journal entry'; }
    });
    const label = document.getElementById('drawerSaveBtnLabel');
    if (label) label.textContent = 'Save';
  }

  function removeLegacyTopSelector() {
    document.getElementById('accountSelectorWrap')?.remove();
    document.getElementById('accountSelector')?.closest('#accountSelectorWrap')?.remove();
  }

  function init() {
    loadAccounts();
    migrateTrades();
    removeLegacyTopSelector();
    if (activeMode !== 'Backtest') {
      const list = accounts[activeMode] || [];
      activeAccountId = localStorage.getItem(`my_journal_active_account_${activeMode}_v1`) || list[0]?.id || null;
    }
    patchTradeSubmit();
    patchDrawer();
    patchSaveDrawer();
    patchMode();
    patchAccountFiltering();
    renderForAccount();
    setupRequiredSave();
    patchIconsAndBacktestUI();
  }

  if (document.readyState === 'complete') setTimeout(init, 0);
  else window.addEventListener('load', () => setTimeout(init, 0), { once: true });
})();
