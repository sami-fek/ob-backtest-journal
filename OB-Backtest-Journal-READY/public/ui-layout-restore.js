(() => {
  const STYLE_ID = 'ob-layout-restore-style';
  let booted = false;

  function styles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #ob-journal-insights-row{display:grid;grid-template-columns:minmax(0,1fr);gap:1.5rem;margin-bottom:1.5rem}
      @media(min-width:1024px){#ob-journal-insights-row{grid-template-columns:repeat(2,minmax(0,1fr))}}
      #ob-journal-insights-row>.glass-card{min-width:0}
    `;
    document.head.appendChild(s);
  }

  function cardByText(root, needle) {
    const target = String(needle).toLowerCase();
    return [...root.querySelectorAll('.glass-card')].find(card => card.textContent.toLowerCase().includes(target)) || null;
  }

  function restoreLayout() {
    const trading = document.getElementById('pageTrading');
    const journal = document.getElementById('pageJournal');
    if (!trading || !journal) return;
    styles();

    // The static Next-Gen Trading page contains the account + original heatmap row.
    // Keep that row on Trading and let journal-heatmap.js enhance its calendar grid.
    const tradingHeatmap = trading.querySelector('#calendarHeatmapGrid')?.closest('.glass-card');
    const accountPanel = trading.querySelector('#accountBalanceDisplay')?.closest('.glass-card');
    if (tradingHeatmap) tradingHeatmap.style.display = '';
    if (accountPanel) accountPanel.style.display = '';

    // Move the previously built equity and discipline cards to Journal.
    const equity = cardByText(trading, 'Cumulative Equity Growth (Net R)');
    const discipline = cardByText(trading, 'Discipline & Rules Status');
    if (equity || discipline) {
      let row = document.getElementById('ob-journal-insights-row');
      if (!row) {
        row = document.createElement('div');
        row.id = 'ob-journal-insights-row';
        const journalFilter = journal.querySelector('.glass-card');
        if (journalFilter) journal.insertBefore(row, journalFilter);
        else journal.insertBefore(row, journal.firstChild);
      }
      [equity, discipline].forEach(card => {
        if (!card) return;
        card.classList.remove('lg:col-span-2', 'lg:col-span-3');
        if (card.parentElement !== row) row.appendChild(card);
      });
    }

    // Remove/hide the extra Analytics heatmap. Trading is the single P&L calendar location.
    [...document.querySelectorAll('#pageAnalytics .glass-card')].forEach(card => {
      if (card.textContent.toLowerCase().includes('full monthly performance heatmap')) card.style.display = 'none';
    });

    // Never leave a second generated heatmap on Journal.
    document.getElementById('journalPnlHeatmap')?.remove();
  }

  function patchNavigation() {
    const original = window.switchTab;
    if (typeof original !== 'function' || original.__obLayoutPatched) return;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      setTimeout(restoreLayout, 60);
      return result;
    };
    wrapped.__obLayoutPatched = true;
    window.switchTab = wrapped;
  }

  function boot() {
    if (booted) return;
    booted = true;
    restoreLayout();
    patchNavigation();
    window.addEventListener('resize', () => setTimeout(restoreLayout, 40));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
