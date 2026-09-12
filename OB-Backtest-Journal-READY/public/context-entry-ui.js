// Phase 1: make the selected account/mode explicit at the trade-entry control.
(function installContextEntryUI(){
  if (window.__obContextEntryUIInstalled) return;
  window.__obContextEntryUIInstalled = true;

  function refresh(){
    const button = document.getElementById('f-add');
    const context = document.getElementById('phase1-context');
    if (!button || !context) return;
    const mode = typeof phase1Mode === 'function' ? phase1Mode() : 'Backtest';
    const strategy = typeof phase1Strategy === 'function' && typeof phase1Context !== 'undefined'
      ? phase1Strategy(phase1Context.strategyId)?.name || 'Strategy'
      : 'Strategy';
    button.textContent = `Add ${mode} trade`;
    button.title = `Stores this trade under the current ${mode} account and ${strategy} strategy.`;

    let hint = document.getElementById('context-entry-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'context-entry-hint';
      hint.style.cssText = 'font-size:10.5px;color:var(--ink-faint);margin-top:6px;';
      button.parentNode?.insertBefore(hint, button.nextSibling);
    }
    hint.textContent = `Saving to ${mode} · ${strategy}`;
  }

  const baseRender = render;
  render = async function(){
    await baseRender();
    refresh();
  };

  refresh();
})();
