/**
 * analytics-page.js — Analytics page structure (BUILD-PLAN-2 Part 2 Step 1).
 * "Why am I winning or losing?"
 *
 * The existing blocks (filters, KPI cards, charts by strategy/timeframe/regime/
 * session/day, Strategy Comparison, Behavior tab) are rendered by other scripts
 * and keep working unchanged. This script only:
 *  - adds section titles above them (CSS `order` in pages.css puts everything in place);
 *  - adds a sample-size warning (under 30 trades = not yet reliable);
 *  - adds "Rules followed vs broken" and "After losses" (Discipline section);
 *  - adds the drawdown chart and the R-multiple distribution (Risk section).
 * Numbers come from analytics-insights.js (unit-tested) and use the same
 * filtered, account-scoped trade list as the rest of Analytics.
 */
(() => {
  'use strict';
  const A = () => window.obAnalyticsInsights;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtR = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}R`);
  const fmtPct = v => (v == null ? '—' : `${Math.round(v)}%`);
  const cls = v => (v == null ? '' : v > 0 ? 'ds-pos' : v < 0 ? 'ds-neg' : '');
  const charts = {};

  const HEADS = [
    { id: 'apHeadOverview', label: 'Overview', sub: 'filters below apply to every number' },
    { id: 'apHeadTime', label: 'Over time', sub: 'cumulative R and drawdown, in trade order' },
    { id: 'apHeadWhere', label: 'Where the R comes from', sub: 'strategy · timeframe · regime · session · day' },
    { id: 'apHeadDiscipline', label: 'Discipline', sub: 'does following the checklist pay?' },
    { id: 'apHeadStrategies', label: 'Strategies', sub: 'side by side' }
  ];

  function totalFor(t) {
    try { if (typeof window.stepsForTrade === 'function') { const s = window.stepsForTrade(t); if (Array.isArray(s) && s.length) return s.length; } } catch (_) {}
    return Array.isArray(t && t.checklist) ? t.checklist.length : 0;
  }

  function ensure(page, id, tag, className) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement(tag || 'div'); el.id = id; if (className) el.className = className; }
    if (el.parentElement !== page) page.appendChild(el);
    return el;
  }

  function sampleTag(n) {
    const r = A().reliability(n);
    return r.reliable ? '' : `<span class="ds-pill warn" title="Fewer than ${r.threshold} trades: treat as a hint, not a result">small sample · ${r.n}</span>`;
  }

  function groupRow(label, g, note) {
    return `<div class="ap-cmp-row">
      <div class="ap-cmp-name"><b>${esc(label)}</b><span class="ds-period">${note}</span></div>
      <div class="ap-cmp-vals">
        <div><span class="ds-label">Trades</span><b class="ds-num">${g.trades}</b></div>
        <div><span class="ds-label">Win rate</span><b class="ds-num">${fmtPct(g.winRate)}</b></div>
        <div><span class="ds-label">Avg R</span><b class="ds-num ${cls(g.avgR)}">${fmtR(g.avgR)}</b></div>
      </div>
      <div class="ds-meter" aria-hidden="true"><i class="${g.winRate == null ? '' : g.winRate >= 50 ? 'pos' : 'neg'}" style="width:${g.winRate == null ? 0 : g.winRate}%"></i></div>
    </div>`;
  }

  function renderDiscipline(page, list) {
    const el = ensure(page, 'apDiscipline', 'div', 'ds-grid');
    const s = A().rulesSplit(list, totalFor);
    const al = A().afterLosses(list, 3);
    const diff = s.followed.avgR != null && s.broken.avgR != null ? s.followed.avgR - s.broken.avgR : null;
    el.innerHTML = `
      <div class="ds-card ds-span-6 ds-l-12 ap-card">
        <div class="ap-card-head"><div><h3 class="ap-title">Rules followed vs broken</h3><p class="ds-sub">Checklist ≥ 50% ticked vs under 50%</p></div>${sampleTag(s.followed.trades + s.broken.trades)}</div>
        ${groupRow('Followed', s.followed, 'checklist ≥ 50%')}
        ${groupRow('Broken', s.broken, 'checklist < 50%')}
        <p class="ap-foot">${diff == null ? 'Needs trades on both sides to compare.' : `Following the checklist is worth <b class="${cls(diff)}">${fmtR(diff)}</b> per trade in this view.`}${s.unknown ? ` ${s.unknown} trade${s.unknown === 1 ? '' : 's'} without a checklist left out.` : ''}</p>
      </div>
      <div class="ds-card ds-span-6 ds-l-12 ap-card">
        <div class="ap-card-head"><div><h3 class="ap-title">After losses</h3><p class="ds-sub">The next trade after 1, 2 and 3 losses in a row</p></div>${sampleTag(al[0].trades)}</div>
        <div class="ap-tw"><table class="ap-table">
          <thead><tr><th>After</th><th>Trades</th><th>Win rate</th><th>Avg R</th><th>Net R</th></tr></thead>
          <tbody>${al.map(g => `<tr><td>${g.k} loss${g.k === 1 ? '' : 'es'}${A().reliability(g.trades).reliable || !g.trades ? '' : ' <span class="ap-warn" title="Fewer than 30 trades">⚠</span>'}</td><td>${g.trades}</td><td>${fmtPct(g.winRate)}</td><td class="${cls(g.avgR)}">${fmtR(g.avgR)}</td><td class="${cls(g.netR)}">${g.trades ? fmtR(g.netR) : '—'}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="ap-foot">Counts every trade taken right after at least that many losses (time order). ⚠ = under 30 trades.</p>
      </div>`;
  }

  function renderRisk(page, list) {
    const el = ensure(page, 'apRisk', 'div', 'ds-grid');
    const d = A().drawdown(list);
    const bins = A().rHistogram(list);
    if (!el.dataset.built) {
      el.dataset.built = '1';
      el.innerHTML = `
        <div class="ds-card ds-span-7 ds-l-12 ap-card">
          <div class="ap-card-head"><div><h3 class="ap-title">Drawdown</h3><p class="ds-sub">Distance below the best cumulative R so far</p></div><span id="apDdSample"></span></div>
          <div class="ap-kpis" id="apDdKpis"></div>
          <div class="ap-chart"><canvas id="apDdChart" aria-label="Drawdown chart"></canvas></div>
        </div>
        <div class="ds-card ds-span-5 ds-l-12 ap-card">
          <div class="ap-card-head"><div><h3 class="ap-title">R-multiple distribution</h3><p class="ds-sub">How many trades landed in each 0.5R band</p></div><span id="apHistSample"></span></div>
          <div class="ap-chart ap-chart-tall"><canvas id="apHistChart" aria-label="R-multiple histogram"></canvas></div>
        </div>`;
    }
    document.getElementById('apDdSample').innerHTML = sampleTag(list.length);
    document.getElementById('apHistSample').innerHTML = sampleTag(list.length);
    document.getElementById('apDdKpis').innerHTML = `
      <div><span class="ds-label">Max depth</span><b class="ds-num ${d.maxDepth < 0 ? 'ds-neg' : ''}">${fmtR(d.maxDepth)}</b></div>
      <div><span class="ds-label">Longest</span><b class="ds-num">${d.maxDurationTrades} trade${d.maxDurationTrades === 1 ? '' : 's'}</b><span class="ds-period">${d.maxDurationDays} day${d.maxDurationDays === 1 ? '' : 's'}</span></div>
      <div><span class="ds-label">Now</span><b class="ds-num ${d.current.depth < 0 ? 'ds-neg' : 'ds-pos'}">${d.current.recovered ? 'At peak' : fmtR(d.current.depth)}</b>${d.current.recovered ? '' : `<span class="ds-period">${d.current.trades} trade${d.current.trades === 1 ? '' : 's'} in</span>`}</div>`;
    if (!window.Chart) return;
    const ddCanvas = document.getElementById('apDdChart');
    const histCanvas = document.getElementById('apHistChart');
    const labels = d.points.map(p => p.date ? p.date.slice(5) : '');
    const ddData = d.points.map(p => +p.dd.toFixed(2));
    if (charts.dd && charts.dd.canvas !== ddCanvas) { charts.dd.destroy(); charts.dd = null; }
    if (!charts.dd) {
      charts.dd = new Chart(ddCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Drawdown (R)', data: ddData, borderColor: '#ef4444', fill: 'origin', cubicInterpolationMode: 'monotone', borderWidth: 2, pointRadius: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmtR(c.parsed.y)}` } } },
          scales: { x: { ticks: { maxTicksLimit: 8, autoSkip: true, maxRotation: 0 }, grid: { display: false } }, y: { suggestedMax: 0, ticks: { callback: v => `${v}R` } } } }
      });
    } else { charts.dd.data.labels = labels; charts.dd.data.datasets[0].data = ddData; charts.dd.update('none'); }
    const hLabels = bins.map(b => b.label);
    const hData = bins.map(b => b.count);
    const hColors = bins.map(b => (b.sign > 0 ? '#22c55e' : b.sign < 0 ? '#ef4444' : '#94a3b8'));
    if (charts.hist && charts.hist.canvas !== histCanvas) { charts.hist.destroy(); charts.hist = null; }
    if (!charts.hist) {
      charts.hist = new Chart(histCanvas, {
        type: 'bar',
        data: { labels: hLabels, datasets: [{ label: 'Trades', data: hData, backgroundColor: hColors, categoryPercentage: 0.9, barPercentage: 0.95 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.parsed.y} trade${c.parsed.y === 1 ? '' : 's'}` } } },
          scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, callback: (v, i) => { const b = bins[i]; return b && Number.isInteger(b.from) ? (i === 0 ? `≤${b.to}` : `${b.from > 0 ? '+' : ''}${b.from}`) : ''; } } }, y: { beginAtZero: true, ticks: { precision: 0 } } } }
      });
    } else { charts.hist.data.labels = hLabels; charts.hist.data.datasets[0].data = hData; charts.hist.data.datasets[0].backgroundColor = hColors; charts.hist.update('none'); }
  }

  function renderSample(page, list) {
    const el = ensure(page, 'apSample', 'div', 'ap-sample');
    const r = A().reliability(list.length);
    el.hidden = r.reliable;
    el.innerHTML = r.reliable ? '' : `<span class="ds-dot" aria-hidden="true"></span><span><b>${r.n} trade${r.n === 1 ? '' : 's'} in this view.</b> Under ${r.threshold} trades, results are not yet reliable: treat them as hints. ${r.need} more to go.</span>`;
  }

  function render() {
    const page = document.getElementById('pageAnalytics');
    if (!page || page.classList.contains('hidden') || !A() || typeof window.obAnalyticsFilteredTrades !== 'function') return;
    page.classList.add('ap-v2');
    HEADS.forEach(h => {
      const el = ensure(page, h.id, 'div', 'ds-section-head ap-head');
      if (!el.dataset.built) { el.dataset.built = '1'; el.innerHTML = `<h2 class="ds-label">${h.label}</h2><span class="ds-period">${h.sub}</span>`; }
    });
    let list = [];
    try { list = window.obAnalyticsFilteredTrades() || []; } catch (_) { list = []; }
    renderSample(page, list);
    renderDiscipline(page, list);
    renderRisk(page, list);
  }

  window.addEventListener('ob-analytics-refresh', () => setTimeout(render, 0));
  // Trades can arrive from the server after the first Analytics refresh: refresh
  // the whole Analytics view (filters, charts, these cards) after every renderAll.
  let timer = 0;
  const queue = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const page = document.getElementById('pageAnalytics');
      if (page && !page.classList.contains('hidden') && typeof window.__obAnalyticsRefresh === 'function') window.__obAnalyticsRefresh();
    }, 120);
  };
  function wrapRenderAll() {
    const fn = window.renderAll;
    if (typeof fn !== 'function' || fn.__obApWrapped) return;
    const w = function (...a) { const r = fn.apply(this, a); queue(); return r; };
    w.__obApWrapped = true;
    window.renderAll = w;
  }
  wrapRenderAll();
  [400, 1200, 2500].forEach(ms => setTimeout(wrapRenderAll, ms));
  window.obAnalyticsPageRender = render;
})();
