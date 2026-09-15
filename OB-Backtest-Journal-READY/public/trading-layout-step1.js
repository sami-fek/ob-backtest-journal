// Step 1 UI only: place the existing Trading P&L heatmap and Account Balance widget
// directly below Log A Trade, side-by-side. No internal widget markup or logic is changed.
(() => {
  const STYLE_ID = 'ob-trading-layout-step1-style';
  let timer = null;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #ob-trading-pnl-account-row {
        display: grid !important;
        grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr) !important;
        gap: 24px !important;
        align-items: start !important;
        width: 100% !important;
        margin: 20px 0 !important;
      }
      #ob-trading-pnl-account-row > .glass-card {
        min-width: 0 !important;
        width: auto !important;
        margin: 0 !important;
      }
      @media (max-width: 900px) {
        #ob-trading-pnl-account-row {
          grid-template-columns: 1fr !important;
          gap: 16px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function findCard(root, selector, text) {
    const bySelector = root.querySelector(selector);
    if (bySelector) return bySelector.closest('.glass-card') || bySelector;
    const needle = String(text || '').toLowerCase();
    return [...root.querySelectorAll('.glass-card')]
      .find(card => card.textContent.toLowerCase().includes(needle)) || null;
  }

  function moveTradingCards() {
    const trading = document.getElementById('pageTrading');
    if (!trading) return false;

    const heatmap = findCard(trading, '#calendarHeatmapGrid', 'p&l calendar heatmap');
    const account = findCard(trading, '#accountBalanceDisplay', 'account balance');
    const logTrade = findCard(trading, '#tradeForm', 'log a trade');
    if (!heatmap || !account || !logTrade) return false;

    let row = document.getElementById('ob-trading-pnl-account-row');
    if (!row) row = document.createElement('div');
    row.id = 'ob-trading-pnl-account-row';

    if (row.parentElement !== trading || logTrade.nextElementSibling !== row) {
      trading.insertBefore(row, logTrade.nextSibling);
    }
    if (heatmap.parentElement !== row) row.appendChild(heatmap);
    if (account.parentElement !== row) row.appendChild(account);
    return true;
  }

  function run() {
    ensureStyles();
    moveTradingCards();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 30);
  }

  function boot() {
    run();
    [100, 300, 700, 1400, 2500].forEach(ms => setTimeout(run, ms));
    window.addEventListener('resize', schedule);
    if (typeof window.switchTab === 'function' && !window.switchTab.__obTradingStep1Wrapped) {
      const original = window.switchTab;
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        schedule();
        return result;
      };
      wrapped.__obTradingStep1Wrapped = true;
      window.switchTab = wrapped;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
