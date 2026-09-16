(() => {
  const STATE_KEY = 'ob_ui_state_v1';
  const TABS = new Set(['home', 'trading', 'journal', 'analytics', 'accounts', 'settings']);
  const MODES = new Set(['Backtest', 'Demo', 'Real', 'Funded']);
  const ACCOUNT_KEY = mode => `my_journal_active_account_${mode}_v1`;
  let restoring = false;
  let layoutTimer = null;
  let booted = false;

  const readState = () => {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  };
  const writeState = patch => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ ...readState(), ...patch })); } catch (_) {}
  };
  const validTab = tab => TABS.has(String(tab || '').toLowerCase());
  const modeNow = () => {
    try { return MODES.has(activeMode) ? activeMode : null; } catch (_) { return null; }
  };
  const tabFromHash = () => {
    const tab = window.location.hash.replace(/^#/, '').trim().toLowerCase();
    return validTab(tab) ? tab : null;
  };
  const currentVisibleTab = () => {
    for (const tab of TABS) {
      const page = document.getElementById(`page${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
      if (!page) continue;
      const style = window.getComputedStyle(page);
      if (style.display !== 'none' && !page.hidden && page.getBoundingClientRect().height > 0) return tab;
    }
    return null;
  };

  function persistUiState(tab = null, mode = null) {
    const nextTab = validTab(tab) ? String(tab).toLowerCase()
                   : tabFromHash() || currentVisibleTab() || readState().tab || 'home';
    const nextMode = MODES.has(mode) ? mode : modeNow() || readState().mode || 'Real';
    const next = { tab: nextTab, mode: nextMode, accountIds: { ...(readState().accountIds || {}) } };
    if (nextMode !== 'Backtest') {
      const accountId = localStorage.getItem(ACCOUNT_KEY(nextMode));
      if (accountId) next.accountIds[nextMode] = accountId;
    }
    writeState(next);
    if (window.location.hash !== `#${nextTab}`) {
      try { window.history.replaceState({ obTab: nextTab }, '', `#${nextTab}`); } catch (_) {}
    }
  }

  function hookNavigation() {
    const originalTab = window.switchTab;
    if (typeof originalTab === 'function' && !originalTab.__obStabilityWrapped) {
      const wrappedTab = function (tab, ...args) {
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
      const wrappedMode = function (mode, ...args) {
        const result = originalMode.call(this, mode, ...args);
        if (!restoring) persistUiState(null, mode);
        scheduleLayout();
        return result;
      };
      wrappedMode.__obStabilityWrapped = true;
      window.switchMode = wrappedMode;
    }
  }

  function restoreUiStateOnce() {
    const state = readState();
    const tab = tabFromHash() || (validTab(state.tab) ? state.tab : 'home');
    const mode = MODES.has(state.mode) ? state.mode : (modeNow() || 'Real');

    if (mode !== 'Backtest' && state.accountIds && state.accountIds[mode]) {
      try { localStorage.setItem(ACCOUNT_KEY(mode), state.accountIds[mode]); } catch (_) {}
    }

    restoring = true;
    try {
      if (typeof window.switchMode === 'function') {
        try { window.switchMode(mode); } catch (_) {}
      }
      if (typeof window.switchTab === 'function') {
        try { window.switchTab(tab); } catch (_) {}
      }
      try { window.history.replaceState({ obTab: tab }, '', `#${tab}`); } catch (_) {}
    } finally {
      restoring = false;
    }
    persistUiState(tab, mode);
  }

  function findCard(root, needle) {
    const target = String(needle).toLowerCase();
    return [...root.querySelectorAll('.glass-card')]
      .find(card => card.textContent.toLowerCase().includes(target)) || null;
  }

  function moveJournalCards() {
    const row = document.getElementById('ob-journal-equity-discipline-row');
    if (!row) return;
    const equity = findCard(document.body, 'cumulative equity growth (net r)');
    const discipline = findCard(document.body, 'discipline & rules status');
    if (!equity || !discipline) return;
    if (equity.parentElement !== row) row.appendChild(equity);
    if (discipline.parentElement !== row) row.appendChild(discipline);
  }

  function cleanConflicts() {
    const trading = document.getElementById('pageTrading');
    const journal = document.getElementById('pageJournal');
    const wrongJournalRow = trading?.querySelector('#ob-journal-equity-discipline-row');
    if (wrongJournalRow && journal) {
      [...wrongJournalRow.children].forEach(card => journal.appendChild(card));
      wrongJournalRow.remove();
    }
    const wrongTradingRow = journal?.querySelector('#ob-trading-pnl-account-row');
    if (wrongTradingRow && trading) {
      [...wrongTradingRow.children].forEach(card => trading.appendChild(card));
      wrongTradingRow.remove();
    }
    document.querySelectorAll('#pageAnalytics #journalPnlHeatmap').forEach(el => el.remove());
  }

  function ensureStyles() {
    if (document.getElementById('ob-ui-stability-style')) return;
    const style = document.createElement('style');
    style.id = 'ob-ui-stability-style';
    style.textContent = `#ob-journal-equity-discipline-row{display:grid!important;grid-template-columns:minmax(0,2fr) minmax(300px,1fr)!important;gap:20px!important;align-items:start!important;width:100%!important;margin:20px 0!important}#ob-journal-equity-discipline-row>.glass-card{min-width:0!important;width:auto!important;margin:0!important}@media(max-width:900px){#ob-journal-equity-discipline-row{grid-template-columns:1fr!important}}`;
    document.head.appendChild(style);
  }

  function layout() { ensureStyles(); cleanConflicts(); moveJournalCards(); }
  function scheduleLayout() { clearTimeout(layoutTimer); layoutTimer = setTimeout(layout, 20); }

  function boot() {
    if (booted) return;
    booted = true;
    ensureStyles();
    hookNavigation();
    setTimeout(() => {
      hookNavigation();
      restoreUiStateOnce();
      layout();
      [100, 300, 700, 1400, 2500].forEach(ms => setTimeout(layout, ms));
    }, 0);
    window.addEventListener('resize', scheduleLayout);
    window.addEventListener('wallet-accounts-updated', () => {
      if (!restoring) persistUiState();
      scheduleLayout();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
