(() => {
  const DISCIPLINE_STAT_ID = 'statCleanTrades';
  const ACCOUNT_BALANCE_ID = 'accountBalanceDisplay';
  let moved = false;

  function swapNodes(a, b) {
    if (!a || !b || a === b) return;
    const aParent = a.parentNode;
    const bParent = b.parentNode;
    if (!aParent || !bParent) return;
    const marker = document.createComment('discipline-account-swap');
    aParent.insertBefore(marker, a);
    bParent.insertBefore(a, b);
    marker.parentNode.replaceChild(b, marker);
  }

  function findDisciplineCard() {
    const stat = document.getElementById(DISCIPLINE_STAT_ID);
    return stat ? stat.closest('.glass-card') : null;
  }

  function findAccountCard() {
    const balance = document.getElementById(ACCOUNT_BALANCE_ID);
    return balance ? balance.closest('.glass-card') : null;
  }

  function journalInsertPoint(journal) {
    const accountMenu = journal.querySelector('.journal-analytics-account-menu');
    if (accountMenu) return accountMenu.nextSibling;
    const modeMenu = journal.querySelector('.journal-analytics-mode-menu');
    if (modeMenu) return modeMenu.nextSibling;
    return journal.firstElementChild;
  }

  function move() {
    const journal = document.getElementById('pageJournal');
    const trading = document.getElementById('pageTrading');
    const discipline = findDisciplineCard();
    const account = findAccountCard();
    if (!journal || !trading || !discipline || !account) return false;

    swapNodes(discipline, account);

    const point = journalInsertPoint(journal);
    if (point && point.parentNode === journal) journal.insertBefore(discipline, point);
    else journal.appendChild(discipline);

    // Journal layout: heatmap + discipline side-by-side.
    applySideBySideLayout(journal);
    discipline.dataset.movedToJournal = 'true';
    account.dataset.movedToTradingSpot = 'true';
    moved = true;
    return true;
  }

  function applySideBySideLayout(journal) {
    const heatmap = document.getElementById('journalPnlHeatmap');
    const discipline = findDisciplineCard();
    if (!heatmap || !discipline || discipline.parentNode !== journal) return;

    let row = document.getElementById('journalHeatmapRulesRow');
    if (!row) {
      row = document.createElement('div');
      row.id = 'journalHeatmapRulesRow';
      row.className = 'journal-heatmap-rules-row';
      heatmap.parentNode.insertBefore(row, heatmap);
      row.appendChild(heatmap);
      row.appendChild(discipline);
    } else {
      if (heatmap.parentNode !== row) row.appendChild(heatmap);
      if (discipline.parentNode !== row) row.appendChild(discipline);
    }

    if (!document.getElementById('journal-heatmap-rules-style')) {
      const style = document.createElement('style');
      style.id = 'journal-heatmap-rules-style';
      style.textContent = `
        .journal-heatmap-rules-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(300px,1fr);gap:20px;align-items:start;margin-top:20px}
        .journal-heatmap-rules-row > .glass-card{margin-top:0!important;min-width:0}
        .journal-heatmap-rules-row #journalPnlHeatmap{margin-top:0!important}
        @media(max-width:900px){.journal-heatmap-rules-row{grid-template-columns:1fr}}
      `;
      document.head.appendChild(style);
    }
  }

  function ensure() {
    move();
    if (moved) applySideBySideLayout(document.getElementById('pageJournal'));
  }

  function boot() {
    [0, 50, 150, 300, 600, 1000].forEach(ms => setTimeout(ensure, ms));
    const originalSwitchTab = window.switchTab;
    if (typeof originalSwitchTab === 'function' && !originalSwitchTab.__disciplineMovePatched) {
      const patched = function (...args) {
        const result = originalSwitchTab.apply(this, args);
        setTimeout(ensure, 30);
        return result;
      };
      patched.__disciplineMovePatched = true;
      window.switchTab = patched;
    }
    window.addEventListener('wallet-accounts-updated', () => setTimeout(ensure, 30));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
