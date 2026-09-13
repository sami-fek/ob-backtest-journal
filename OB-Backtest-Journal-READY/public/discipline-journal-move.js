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
    if (!stat) return null;
    return stat.closest('.glass-card');
  }

  function findAccountCard() {
    const balance = document.getElementById(ACCOUNT_BALANCE_ID);
    if (!balance) return null;
    return balance.closest('.glass-card');
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

    // Put the account widget exactly where Discipline & Rules Status was.
    swapNodes(discipline, account);

    // Move the complete Discipline & Rules Status card to Journal.
    const point = journalInsertPoint(journal);
    if (point && point.parentNode === journal) journal.insertBefore(discipline, point);
    else journal.appendChild(discipline);

    discipline.dataset.movedToJournal = 'true';
    account.dataset.movedToTradingSpot = 'true';
    moved = true;
    return true;
  }

  function ensure() {
    if (moved) return;
    move();
  }

  function boot() {
    // Wait briefly because the account widget is injected after the main UI loads.
    [0, 50, 150, 300, 600].forEach(ms => setTimeout(ensure, ms));

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
