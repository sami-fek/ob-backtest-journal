/**
 * analytics-drivers.js — Performance Breakdown + Profit Drivers on the
 * Analytics "Performance" tab (moved from the Dashboard, BUILD-PLAN-2 Part 1).
 * Uses the Analytics filter bar's trade list (obAnalyticsFilteredTrades) and the
 * same $ calculation as the calendar (obCalendarKit.pnlFor). Restyled in Part 2.
 */
(() => {
  'use strict';
  const ID = 'ob-analytics-drivers';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sym = () => (window.obPrefs ? window.obPrefs.get().currencySymbol : '$');
  function money(v, signed = true) {
    const n = Number(v) || 0;
    return `${n < 0 ? '-' : signed && n > 0 ? '+' : ''}${sym()}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const cls = v => (v > 0 ? 'db-pos' : v < 0 ? 'db-neg' : '');
  const fmtR = v => `${v > 0 ? '+' : ''}${(Number(v) || 0).toFixed(2)}R`;
  const pnlFor = t => (window.obCalendarKit ? window.obCalendarKit.pnlFor(t) : (Number(t.rMultiple) || 0) * 1000);

  function render() {
    const page = document.getElementById('pageAnalytics');
    if (!page || page.classList.contains('hidden') || !window.obDashStats || typeof window.obAnalyticsFilteredTrades !== 'function') return;
    let el = document.getElementById(ID);
    if (!el) {
      el = document.createElement('div');
      el.id = ID;
      el.className = 'grid grid-cols-1 lg:grid-cols-2 gap-6';
      el.style.marginTop = '24px';
    }
    // Keep it at the end of the Performance content, before the Behavior section.
    const behavior = document.getElementById('ob-behavior');
    if (behavior && behavior.parentElement === page) { if (el.nextElementSibling !== behavior) page.insertBefore(el, behavior); }
    else if (el.parentElement !== page) page.appendChild(el);

    const sum = window.obDashStats.summary(window.obAnalyticsFilteredTrades() || [], pnlFor);
    const n = `${sum.trades} trade${sum.trades === 1 ? '' : 's'} · analytics filters`;
    el.innerHTML = `
      <div class="db-card">
        <div class="db-card-head"><div><h3>Performance Breakdown</h3><p>${n}</p></div></div>
        <ul class="db-list">
          <li><span>Biggest win</span><b class="db-pos">${sum.best && sum.best.pnl > 0 ? money(sum.best.pnl) : '—'}</b></li>
          <li><span>Biggest loss</span><b class="db-neg">${sum.worst && sum.worst.pnl < 0 ? money(sum.worst.pnl) : '—'}</b></li>
          <li><span>Average win</span><b class="db-pos">${sum.wins ? money(sum.avgWin) : '—'}</b></li>
          <li><span>Average loss</span><b class="db-neg">${sum.losses ? money(sum.avgLoss) : '—'}</b></li>
          <li><span>Max drawdown</span><b class="${sum.maxDrawdown < 0 ? 'db-neg' : ''}">${money(sum.maxDrawdown)}</b></li>
          <li><span>Average R</span><b class="${cls(sum.avgR)}">${fmtR(sum.avgR)}</b></li>
        </ul>
      </div>
      <div class="db-card">
        <div class="db-card-head"><div><h3>Profit Drivers</h3><p>Net result per strategy · ${n}</p></div></div>
        ${sum.strategies.length ? `
          <div class="db-drivers-top">
            <div><span>Best strategy</span><b>${esc(sum.bestStrategy.strategy)}</b><em class="${cls(sum.bestStrategy.net)}">${money(sum.bestStrategy.net)}</em></div>
            <div><span>Worst strategy</span><b>${sum.worstStrategy ? esc(sum.worstStrategy.strategy) : '—'}</b><em class="${sum.worstStrategy ? cls(sum.worstStrategy.net) : ''}">${sum.worstStrategy ? money(sum.worstStrategy.net) : 'one strategy only'}</em></div>
          </div>
          <ul class="db-drivers">${(() => { const max = Math.max(...sum.strategies.map(x => Math.abs(x.net)), 1); return sum.strategies.map(x => `
            <li><div class="db-drv-line"><span>${esc(x.strategy)}</span><b class="${cls(x.net)}">${money(x.net)}</b></div>
              <div class="db-drv-bar"><i class="${x.net >= 0 ? 'pos' : 'neg'}" style="width:${(Math.abs(x.net) / max) * 100}%"></i></div>
              <div class="db-drv-meta">${x.trades} trade${x.trades === 1 ? '' : 's'} · ${x.trades ? Math.round((x.wins / x.trades) * 100) : 0}% win · ${fmtR(x.r)}</div></li>`).join(''); })()}</ul>`
          : '<div class="db-empty">No trades match the filters.</div>'}
      </div>`;
  }
  window.addEventListener('ob-analytics-refresh', () => setTimeout(render, 0));
})();
