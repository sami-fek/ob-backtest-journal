(() => {
  const STATE_KEY = 'ob_ui_state_v1';
  const TABS = new Set(['home', 'trading', 'journal', 'analytics', 'accounts', 'settings']);
  const MODES = new Set(['Backtest', 'Demo', 'Real', 'Funded']);
  let restoring = false;
  let layoutTimer = null;

  const readState = () => {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  };
  const writeState = patch => {
    const next = { ...readState(), ...patch };
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
  };
  const hashTab = () => {
    const value = window.location.hash.replace(/^#/, '').trim().toLowerCase();
    return TABS.has(value) ? value : null;
  };
  const modeNow = () => {
    try { return MODES.has(activeMode) ? activeMode : null; }
    catch (_) { return null; }
  };
  const accountKey = mode => `my_journal_active_account_${mode}_v1`;

  function persistUiState(tab = null, mode = null) {
    const currentMode = mode && MODES.has(mode) ? mode : modeNow();
    const currentTab = tab && TABS.has(tab) ? tab : hashTab() || readState().tab || 'home';
    const patch = { tab: currentTab, mode: currentMode || readState().mode || 'Real' };
    if (patch.mode !== 'Backtest') {
      const id = localStorage.getItem(accountKey(patch.mode));
      if (id) patch.accountIds = { ...(readState().accountIds || {}), [patch.mode]: id };
    }
    writeState(patch);
    if (TABS.has(currentTab) && window.location.hash !== `#${currentTab}`) {
      window.history.replaceState({ obTab: currentTab }, '', `#${currentTab}`);
    }
  }

  function hookNavigation() {
    const originalTab = window.switchTab;
    if (typeof originalTab === 'function' && !originalTab.__obStabilityWrapped) {
      const wrappedTab = function(tab, ...args) {
        const result = originalTab.call(this, tab, ...args);
        if (!restoring) persistUiState(tab, null);
        scheduleLayout();
        return result;
      };
      wrappedTab.__obStabilityWrapped = true;
      window.switchTab = wrappedTab;
    }

    const originalMode = window.switchMode;
    if (typeof originalMode === 'function' && !originalMode.__obStabilityWrapped) {
      const wrappedMode = function(mode, ...args) {
        const result = originalMode.call(this, mode, ...args);
        if (!restoring) persistUiState(null, mode);
        scheduleLayout();
        return result;
      };
      wrappedMode.__obStabilityWrapped = true;
      window.switchMode = wrappedMode;
    }
  }

  function restoreUiState() {
    const state = readState();
    const tab = hashTab() || (TABS.has(state.tab) ? state.tab : 'home');
    const mode = MODES.has(state.mode) ? state.mode : modeNow() || 'Real';
    restoring = true;
    try {
      if (mode !== 'Backtest') {
        const savedAccount = state.accountIds?.[mode];
        if (savedAccount) localStorage.setItem(accountKey(mode), savedAccount);
      }
      if (typeof window.switchMode === 'function') window.switchMode(mode);
      if (typeof window.switchTab === 'function') window.switchTab(tab);
      persistUiState(tab, mode);
    } finally {
      restoring = false;
    }
    scheduleLayout();
  }

  function cardContaining(root, needle) {
    const target = String(needle).toLowerCase();
    return [...root.querySelectorAll('.glass-card')].find(card => card.textContent.toLowerCase().includes(target)) || null;
  }

  function restoreTradingLayout() {
    const trading = document.getElementById('pageTrading');
    if (!trading) return;
    const heatmap = trading.querySelector('#calendarHeatmapGrid')?.closest('.glass-card');
    const account = trading.querySelector('#accountBalanceDisplay')?.closest('.glass-card');
    const oldRow = document.getElementById('ob-trading-pnl-account-row');
    if (!heatmap || !account) return;

    const parent = heatmap.parentElement;
    if (parent && parent !== account.parentElement && parent.classList.contains('grid')) parent.appendChild(account);
    oldRow?.remove();
  }

  function restoreJournalLayout() {
    const journal = document.getElementById('pageJournal');
    if (!journal) return;
    const equity = cardContaining(journal, 'Cumulative Equity Growth (Net R)');
    const discipline = cardContaining(journal, 'Discipline & Rules Status');
    if (!equity || !discipline) return;

    let row = document.getElementById('ob-journal-equity-discipline-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'ob-journal-equity-discipline-row';
      const table = journal.querySelector('#journalTableBody')?.closest('.glass-card');
      if (table?.parentElement === journal) {
        if (table.nextSibling) journal.insertBefore(row, table.nextSibling);
        else journal.appendChild(row);
      } else {
        journal.appendChild(row);
      }
    }

    const oldRow = document.getElementById('ob-journal-insights-row');
    if (oldRow && oldRow !== row) oldRow.remove();
    [equity, discipline].forEach(card => {
      card.classList.remove('lg:col-span-2', 'lg:col-span-3', 'w-full');
      if (card.parentElement !== row) row.appendChild(card);
    });
  }

  function ensureStyles() {
    if (document.getElementById('ob-ui-stability-style')) return;
    const style = document.createElement('style');
    style.id = 'ob-ui-stability-style';
    style.textContent = `
      #ob-journal-equity-discipline-row{display:grid!important;grid-template-columns:minmax(0,2fr) minmax(300px,1fr)!important;gap:20px!important;align-items:start!important;width:100%!important;margin:20px 0!important}
      #ob-journal-equity-discipline-row>.glass-card{min-width:0!important;width:auto!important;margin:0!important}
      #ob-trading-pnl-account-row{display:none!important}
      @media(max-width:900px){#ob-journal-equity-discipline-row{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  }

  function layout() {
    ensureStyles();
    restoreTradingLayout();
    restoreJournalLayout();
  }

  function scheduleLayout() {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(layout, 30);
    [120, 350, 800, 1500, 2500].forEach(ms => setTimeout(layout, ms));
  }

  function boot() {
    hookNavigation();
    window.addEventListener('wallet-accounts-updated', () => { persistUiState(); scheduleLayout(); });
    window.addEventListener('resize', scheduleLayout);
    restoreUiState();
    scheduleLayout();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
