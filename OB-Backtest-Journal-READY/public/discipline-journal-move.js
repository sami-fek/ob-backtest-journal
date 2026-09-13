(() => {
  const DISCIPLINE_STAT_ID = 'statCleanTrades';
  const ACCOUNT_BALANCE_ID = 'accountBalanceDisplay';
  const EQUITY_CANVAS_ID = 'chartEquityConsole';
  const HEATMAP_ID = 'journalPnlHeatmap';
  const JOURNAL_ID = 'pageJournal';
  const TRADING_ID = 'pageTrading';
  const STYLE_ID = 'equity-heatmap-account-layout-style';
  let done = false;

  const cardFrom = id => document.getElementById(id)?.closest('.glass-card');
  const disciplineCard = () => cardFrom(DISCIPLINE_STAT_ID);
  const accountCard = () => cardFrom(ACCOUNT_BALANCE_ID);
  const equityCard = () => cardFrom(EQUITY_CANVAS_ID);
  const heatmap = () => document.getElementById(HEATMAP_ID);

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .ob-trading-performance-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(300px,1fr);gap:24px;align-items:start}
      .ob-journal-performance-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(300px,1fr);gap:20px;align-items:start;margin-top:20px}
      .ob-trading-performance-row>.glass-card,.ob-journal-performance-row>.glass-card{margin-top:0!important;min-width:0}
      .ob-trading-performance-row #${HEATMAP_ID}{margin-top:0!important}
      .ob-trading-performance-row #wallet-account-carousel{min-width:0}
      @media(max-width:900px){.ob-trading-performance-row,.ob-journal-performance-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function findTradingPerformanceRow(trading) {
    const canvas = document.getElementById(EQUITY_CANVAS_ID);
    const card = canvas?.closest('.glass-card');
    if (!card || !trading) return null;
    return card.parentNode;
  }

  function findJournalTable(journal) {
    return journal?.querySelector('#journalTableBody')?.closest('.glass-card') || null;
  }

  function place() {
    const journal = document.getElementById(JOURNAL_ID);
    const trading = document.getElementById(TRADING_ID);
    const eq = equityCard();
    const hm = heatmap();
    const account = accountCard();
    const discipline = disciplineCard();
    if (!journal || !trading || !eq || !hm || !account || !discipline) return false;

    injectStyles();

    // Trading: replace the old equity-curve/rules row with P&L + Account.
    const tradingRow = findTradingPerformanceRow(trading);
    if (tradingRow) {
      tradingRow.classList.add('ob-trading-performance-row');
      tradingRow.classList.remove('grid', 'grid-cols-1', 'lg:grid-cols-3', 'gap-6');
      tradingRow.appendChild(hm);
      tradingRow.appendChild(account);
    }

    // Journal: replace the old heatmap/rules row with Equity + Discipline.
    const journalTable = findJournalTable(journal);
    let journalRow = document.getElementById('ob-journal-performance-row');
    if (!journalRow) {
      journalRow = document.createElement('div');
      journalRow.id = 'ob-journal-performance-row';
      journalRow.className = 'ob-journal-performance-row';
      if (journalTable?.nextSibling) journal.insertBefore(journalRow, journalTable.nextSibling);
      else journal.appendChild(journalRow);
    }
    journalRow.appendChild(eq);
    journalRow.appendChild(discipline);

    done = true;
    return true;
  }

  function ensure() {
    place();
  }

  function boot() {
    [0, 50, 150, 300, 600, 1000, 1600].forEach(ms => setTimeout(ensure, ms));
    const originalSwitchTab = window.switchTab;
    if (typeof originalSwitchTab === 'function' && !originalSwitchTab.__performanceLayoutPatched) {
      const patched = function (...args) {
        const result = originalSwitchTab.apply(this, args);
        setTimeout(ensure, 40);
        return result;
      };
      patched.__performanceLayoutPatched = true;
      window.switchTab = patched;
    }
    const originalSwitchMode = window.switchMode;
    if (typeof originalSwitchMode === 'function' && !originalSwitchMode.__performanceLayoutPatched) {
      const patched = function (...args) {
        const result = originalSwitchMode.apply(this, args);
        setTimeout(ensure, 40);
        return result;
      };
      patched.__performanceLayoutPatched = true;
      window.switchMode = patched;
    }
    window.addEventListener('wallet-accounts-updated', () => setTimeout(ensure, 40));
    window.addEventListener('resize', () => setTimeout(ensure, 40));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
