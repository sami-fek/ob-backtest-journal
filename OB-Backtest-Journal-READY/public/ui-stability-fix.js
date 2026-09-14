(() => {
  const STATE_KEY = 'ob_ui_state_v1';
  const TABS = new Set(['home', 'trading', 'journal', 'analytics', 'accounts', 'settings']);
  const MODES = new Set(['Backtest', 'Demo', 'Real', 'Funded']);
  const ACCOUNT_KEY = mode => `my_journal_active_account_${mode}_v1`;
  let restoring = false;
  let layoutTimer = null;

  const readState = () => {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  };
  const writeState = patch => localStorage.setItem(STATE_KEY, JSON.stringify({ ...readState(), ...patch }));
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
    const nextTab = validTab(tab) ? String(tab).toLowerCase() : tabFromHash() || currentVisibleTab() || readState().tab || 'home';
    const nextMode = MODES.has(mode) ? mode : modeNow() || readState().mode || 'Real';
    const next = { tab: nextTab, mode: nextMode, accountIds: { ...(readState().accountIds || {}) } };
    if (nextMode !== 'Backtest') { const accountId = localStorage.getItem(ACCOUNT_KEY(nextMode)); if (accountId) next.accountIds[nextMode] = accountId; }
    writeState(next);
    if (window.location.hash !== `#${nextTab}`) window.history.replaceState({ obTab: nextTab }, '', `#${nextTab}`);
  }
  function hookNavigation() {
    const originalTab = window.switchTab;
    if (typeof originalTab === 'function' && !originalTab.__obStabilityWrapped) {
      const wrappedTab = function(tab, ...args) { const result = originalTab.call(this, tab, ...args); if (!restoring) persistUiState(tab, null); scheduleLayout(); return result; };
      wrappedTab.__obStabilityWrapped = true; window.switchTab = wrappedTab;
    }
    const originalMode = window.switchMode;
    if (typeof originalMode === 'function' && !originalMode.__obStabilityWrapped) {
      const wrappedMode = function(mode, ...args) { const result = originalMode.call(this, mode, ...args); if (!restoring) persistUiState(null, mode); scheduleLayout(); return result; };
      wrappedMode.__obStabilityWrapped = true; window.switchMode = wrappedMode;
    }
  }
  function restoreUiState() {
    const state = readState();
    const tab = tabFromHash() || (validTab(state.tab) ? state.tab : 'home');
    const mode = MODES.has(state.mode) ? state.mode : modeNow() || 'Real';
    restoring = true;
    try {
      if (mode !== 'Backtest' && state.accountIds?.[mode]) localStorage.setItem(ACCOUNT_KEY(mode), state.accountIds[mode]);
      if (typeof window.switchMode === 'function') window.switchMode(mode);
      if (typeof window.switchTab === 'function') window.switchTab(tab);
      window.history.replaceState({ obTab: tab }, '', `#${tab}`);
    } finally { restoring = false; }
    persistUiState(tab, mode);
  }
  function findCard(root, needle) { const target = String(needle).toLowerCase(); return [...root.querySelectorAll('.glass-card')].find(card => card.textContent.toLowerCase().includes(target)) || null; }
  function findHeatmapCard(trading) { return trading.querySelector('#calendarHeatmapGrid')?.closest('.glass-card') || null; }
  function findAccountCard(trading) { return trading.querySelector('#accountBalanceDisplay')?.closest('.glass-card') || null; }
  function moveTradingCards() {
    const trading = document.getElementById('pageTrading'); if (!trading) return;
    const heatmap = findHeatmapCard(trading), account = findAccountCard(trading), logTrade = findCard(trading, 'log a trade');
    if (!heatmap || !account || !logTrade) return;
    let row = document.getElementById('ob-trading-pnl-account-row'); if (!row) { row = document.createElement('div'); row.id = 'ob-trading-pnl-account-row'; }
    if (row.parentElement !== trading || logTrade.nextElementSibling !== row) trading.insertBefore(row, logTrade.nextSibling);
    if (heatmap.parentElement !== row) row.appendChild(heatmap);
    if (account.parentElement !== row) row.appendChild(account);
  }
  function moveJournalCards() {
    const journal = document.getElementById('pageJournal'); if (!journal) return;
    const equity = findCard(journal, 'cumulative equity growth (net r)'), discipline = findCard(journal, 'discipline & rules status'), table = journal.querySelector('#journalTableBody')?.closest('.glass-card');
    if (!equity || !discipline || !table) return;
    let row = document.getElementById('ob-journal-equity-discipline-row'); if (!row) { row = document.createElement('div'); row.id = 'ob-journal-equity-discipline-row'; }
    if (row.parentElement !== journal || table.nextElementSibling !== row) journal.insertBefore(row, table.nextSibling);
    if (equity.parentElement !== row) row.appendChild(equity);
    if (discipline.parentElement !== row) row.appendChild(discipline);
  }
  function cleanConflicts() {
    const trading = document.getElementById('pageTrading'), journal = document.getElementById('pageJournal');
    const wrongJournalRow = trading?.querySelector('#ob-journal-equity-discipline-row');
    if (wrongJournalRow && journal) { [...wrongJournalRow.children].forEach(card => journal.appendChild(card)); wrongJournalRow.remove(); }
    const wrongTradingRow = journal?.querySelector('#ob-trading-pnl-account-row');
    if (wrongTradingRow && trading) { [...wrongTradingRow.children].forEach(card => trading.appendChild(card)); wrongTradingRow.remove(); }
    document.querySelectorAll('#pageAnalytics #journalPnlHeatmap').forEach(el => el.remove());
  }
  function ensureStyles() {
    if (document.getElementById('ob-ui-stability-style')) return;
    const style = document.createElement('style'); style.id = 'ob-ui-stability-style'; style.textContent = `#ob-trading-pnl-account-row{display:grid!important;grid-template-columns:minmax(0,2fr) minmax(300px,1fr)!important;gap:24px!important;align-items:start!important;width:100%!important;margin:20px 0!important}#ob-trading-pnl-account-row>.glass-card{min-width:0!important;width:auto!important;margin:0!important}#ob-journal-equity-discipline-row{display:grid!important;grid-template-columns:minmax(0,2fr) minmax(300px,1fr)!important;gap:20px!important;align-items:start!important;width:100%!important;margin:20px 0!important}#ob-journal-equity-discipline-row>.glass-card{min-width:0!important;width:auto!important;margin:0!important}@media(max-width:900px){#ob-trading-pnl-account-row,#ob-journal-equity-discipline-row{grid-template-columns:1fr!important}}`; document.head.appendChild(style);
  }
  function layout() { ensureStyles(); cleanConflicts(); moveTradingCards(); moveJournalCards(); }
  function scheduleLayout() { clearTimeout(layoutTimer); layoutTimer = setTimeout(layout, 20); }
  function boot() {
    ensureStyles(); hookNavigation(); restoreUiState(); layout(); [100,300,700,1400,2500].forEach(ms => setTimeout(layout, ms));
    window.addEventListener('resize', scheduleLayout); window.addEventListener('wallet-accounts-updated', () => { persistUiState(); scheduleLayout(); });
    [0,100,350,800,1500,2500].forEach(ms => setTimeout(() => { hookNavigation(); restoreUiState(); layout(); }, ms));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
