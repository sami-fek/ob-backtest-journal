// Step 1 UI only: move the existing Trading P&L heatmap + Account Balance row
// directly below Log A Trade. The two widgets keep their original internal markup and logic.
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
  }

  function findLogTradeCard(trading) {
    const form = trading.querySelector('#tradeForm');
    if (form) return form.closest('.glass-card') || form;
    return [...trading.querySelectorAll('.glass-card')].find(card =>
      /log a trade/i.test(card.textContent || '')
    ) || null;
  }

  function findPnlAccountRow(trading) {
    const heatmapGrid = trading.querySelector('#calendarHeatmapGrid');
    if (!heatmapGrid) return null;
    // This is the original parent containing both existing cards.
    return heatmapGrid.closest('.grid.grid-cols-1.lg\\:grid-cols-3')
      || heatmapGrid.closest('.grid');
  }

  function moveTradingRow() {
    const trading = document.getElementById('pageTrading');
    if (!trading) return false;

    const logTrade = findLogTradeCard(trading);
    const row = findPnlAccountRow(trading);
    if (!logTrade || !row) return false;

    row.id = 'ob-trading-pnl-account-row';

    // Move the ORIGINAL row as a unit. Do not pull the widgets out of it.
    if (row.parentElement !== trading || row.previousElementSibling !== logTrade) {
      trading.insertBefore(row, logTrade.nextSibling);
    }

    // Force the existing row to remain a two-column layout at desktop widths.
    ensureStyles();
    return true;
  }

  function run() {
    moveTradingRow();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 60);
  }

  function boot() {
    run();
    [150, 500, 1200, 2500].forEach(ms => setTimeout(run, ms));
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
