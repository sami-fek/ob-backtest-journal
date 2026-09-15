// Step 1 UI only: place the existing Trading P&L heatmap and Account Balance widget
// directly below Log A Trade, side-by-side. No internal widget markup or logic is changed.
(() => {
  const STYLE_ID = 'ob-trading-layout-step1-style';
  let timer = null;
  let observer = null;

  function ensureStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      #ob-trading-pnl-account-row {
        display: grid !important;
        grid-template-columns: minmax(0, 2fr) minmax(360px, 1fr) !important;
        gap: 24px !important;
        align-items: start !important;
        width: 100% !important;
        margin: 20px 0 !important;
      }
      #ob-trading-pnl-account-row > .glass-card {
        display: block !important;
        min-width: 0 !important;
        width: 100% !important;
        margin: 0 !important;
      }
      @media (max-width: 900px) {
        #ob-trading-pnl-account-row {
          grid-template-columns: 1fr !important;
          gap: 16px !important;
        }
      }
    `;
  }

  function cardFrom(root, selector, fallbackText) {
    const node = root.querySelector(selector);
    if (node) return node.closest('.glass-card') || node;
    const needle = String(fallbackText || '').toLowerCase();
    return [...root.querySelectorAll('.glass-card')].find(card =>
      String(card.textContent || '').toLowerCase().includes(needle)
    ) || null;
  }

  function moveTradingCards() {
    const trading = document.getElementById('pageTrading');
    if (!trading) return false;

    const heatmap = cardFrom(trading, '#calendarHeatmapGrid', 'p&l calendar heatmap');
    const account = cardFrom(trading, '#accountBalanceDisplay', 'account balance widget');
    const tradeForm = trading.querySelector('#tradeForm');
    const logTrade = tradeForm?.closest('.glass-card') || cardFrom(trading, null, 'log a trade');
    if (!heatmap || !account || !logTrade || heatmap === account) return false;

    let row = document.getElementById('ob-trading-pnl-account-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'ob-trading-pnl-account-row';
    }

    // Insert immediately after Log A Trade. This is the only structural move in Step 1.
    if (row.parentElement !== trading || row.previousElementSibling !== logTrade) {
      trading.insertBefore(row, logTrade.nextSibling);
    }

    // The two existing cards become direct grid children.
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
    timer = setTimeout(run, 40);
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

    if (!observer) {
      observer = new MutationObserver(() => schedule());
      observer.observe(document.getElementById('pageTrading') || document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
