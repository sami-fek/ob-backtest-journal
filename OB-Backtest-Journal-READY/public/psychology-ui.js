/**
 * psychology-ui.js — Analytics sub-tabs (Performance | Behavior) and the
 * Psychology Status section on Behavior.
 *
 * Numbers come from window.obPsych.compute (psychology.js, unit-tested) on the
 * same trade list the other analytics use: active mode + account and the
 * analytics filter bar (window.obAnalyticsFilteredTrades), then the range pill.
 * Nothing on the Performance tab is changed or removed; it is only hidden
 * while Behavior is open.
 */
(() => {
  'use strict';
  const TABBAR_ID = 'ob-analytics-subtabs';
  const SECTION_ID = 'ob-behavior';
  const SUB_KEY = 'ob-analytics-subtab';
  const RANGE_KEY = 'ob-behavior-range';
  const RANGES = [{ id: '7', label: '7D', days: 7 }, { id: '30', label: '30D', days: 30 }, { id: '90', label: '90D', days: 90 }, { id: 'all', label: 'All', days: 0 }];
  let sub = (() => { try { return localStorage.getItem(SUB_KEY) === 'behavior' ? 'behavior' : 'performance'; } catch (_) { return 'performance'; } })();
  let range = (() => { try { const r = localStorage.getItem(RANGE_KEY); return RANGES.some(x => x.id === r) ? r : 'all'; } catch (_) { return 'all'; } })();
  let trendChart = null;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r2 = n => `${n > 0 ? '+' : ''}${Number(n).toFixed(2)} R`;
  const todayIso = () => { if (window.obTime) return window.obTime.today(); const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function injectStyles() {
    if (document.getElementById('ob-psych-style')) return;
    const s = document.createElement('style');
    s.id = 'ob-psych-style';
    s.textContent = `
      #${TABBAR_ID}{display:flex;justify-content:center}
      #${TABBAR_ID} .ob-st{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:var(--panel);border:1px solid var(--border);box-shadow:var(--shadow)}
      #${TABBAR_ID} button{border:0;background:transparent;color:var(--muted);font:700 12.5px/1 Inter,system-ui,sans-serif;padding:9px 16px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:7px}
      #${TABBAR_ID} button:hover{color:var(--text)}
      #${TABBAR_ID} button[aria-selected="true"]{background:var(--pill-active-bg);color:var(--pill-active-text)}
      #${TABBAR_ID} button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
      #pageAnalytics.ob-sub-behavior > :not(.ob-keep){display:none!important}
      #pageAnalytics:not(.ob-sub-behavior) > #${SECTION_ID}{display:none!important}
      #${SECTION_ID}{display:flex;flex-direction:column;gap:16px}
      #${SECTION_ID} .pc-card{background:var(--panel);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);padding:18px;min-width:0}
      #${SECTION_ID} .pc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
      #${SECTION_ID} .pc-title{font-size:15px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px}
      #${SECTION_ID} .pc-sub{font-size:12px;color:var(--muted);margin-top:3px}
      #${SECTION_ID} .pc-h3{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text);display:flex;align-items:center;gap:8px;margin-bottom:10px}
      #${SECTION_ID} .pc-pills{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:var(--raised);border:1px solid var(--border)}
      #${SECTION_ID} .pc-pills button{border:0;background:transparent;color:var(--muted);font:700 11.5px/1 'JetBrains Mono',monospace;padding:7px 11px;border-radius:999px;cursor:pointer}
      #${SECTION_ID} .pc-pills button[aria-checked="true"]{background:var(--panel);color:var(--blue);box-shadow:0 1px 3px rgba(0,0,0,.14)}
      #${SECTION_ID} .pc-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
      #${SECTION_ID} .pc-stat{background:var(--panel);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);padding:16px;position:relative;overflow:hidden}
      #${SECTION_ID} .pc-stat::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--pc-accent)}
      #${SECTION_ID} .pc-stat-label{font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
      #${SECTION_ID} .pc-stat-val{font:800 26px/1.1 'JetBrains Mono',monospace;color:var(--pc-accent);margin-top:6px}
      #${SECTION_ID} .pc-stat-note{font-size:11.5px;color:var(--muted);margin-top:4px}
      #${SECTION_ID} .pc-bar{height:6px;border-radius:999px;background:var(--raised);margin-top:10px;overflow:hidden}
      #${SECTION_ID} .pc-bar>i{display:block;height:100%;border-radius:999px;background:var(--pc-accent)}
      #${SECTION_ID} .pc-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      #${SECTION_ID} .pc-tw{overflow-x:auto;border:1px solid var(--border);border-radius:14px}
      #${SECTION_ID} table{width:100%;border-collapse:collapse;font-size:12px;min-width:420px}
      #${SECTION_ID} th{text-align:right;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:9px 12px;background:var(--raised);border-bottom:1px solid var(--border);white-space:nowrap}
      #${SECTION_ID} th:first-child,#${SECTION_ID} td:first-child{text-align:left}
      #${SECTION_ID} td{padding:9px 12px;border-bottom:1px solid var(--border-subtle);color:var(--text);text-align:right;font-family:'JetBrains Mono',monospace;white-space:nowrap}
      #${SECTION_ID} td:first-child{font-family:Inter,system-ui,sans-serif;font-weight:700}
      #${SECTION_ID} tr:last-child td{border-bottom:0}
      #${SECTION_ID} .pos{color:var(--profit)} #${SECTION_ID} .neg{color:var(--loss)}
      #${SECTION_ID} .dot{display:inline-block;width:8px;height:8px;border-radius:999px;margin-right:7px;vertical-align:middle}
      #${SECTION_ID} .dot.positive{background:var(--profit)} #${SECTION_ID} .dot.negative{background:var(--loss)} #${SECTION_ID} .dot.neutral{background:var(--muted-2)}
      #${SECTION_ID} .pc-rank{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:999px;background:rgba(239,68,68,.12);color:var(--loss);font:800 11px/1 'JetBrains Mono',monospace;margin-right:8px}
      #${SECTION_ID} .pc-empty{font-size:12.5px;color:var(--muted);padding:18px;text-align:center;line-height:1.5}
      #${SECTION_ID} .pc-empty b{color:var(--text)}
      #${SECTION_ID} .pc-chart{height:220px;position:relative}
      @media(max-width:900px){#${SECTION_ID} .pc-stats{grid-template-columns:repeat(2,minmax(0,1fr))}#${SECTION_ID} .pc-grid2{grid-template-columns:1fr}}
      @media(max-width:420px){#${SECTION_ID} .pc-stat-val{font-size:22px}#${SECTION_ID} .pc-card{padding:14px}}
    `;
    document.head.appendChild(s);
  }

  // ── sub-tabs ───────────────────────────────────────────────────────────────
  function markKeep(page) {
    // Kept on Behavior: the sub-tab bar, the section, the analytics filter bar
    // and the mode / account selectors (so the same filters apply).
    [...page.children].forEach(el => {
      const keep = el.id === TABBAR_ID || el.id === SECTION_ID || el.id === 'ob-analytics-filter-bar' ||
        !!el.querySelector?.('#ob-analytics-filter-bar, .journal-analytics-mode-menu, .journal-analytics-account-menu') ||
        el.classList.contains('journal-analytics-mode-menu') || el.classList.contains('journal-analytics-account-menu');
      el.classList.toggle('ob-keep', keep);
    });
  }
  function ensureDom() {
    const page = document.getElementById('pageAnalytics');
    if (!page) return null;
    injectStyles();
    let bar = document.getElementById(TABBAR_ID);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = TABBAR_ID;
      bar.innerHTML = `<div class="ob-st" role="tablist" aria-label="Analytics views">
        <button type="button" role="tab" data-sub="performance"><i class="fa-solid fa-chart-column"></i>Performance</button>
        <button type="button" role="tab" data-sub="behavior"><i class="fa-solid fa-brain"></i>Behavior</button></div>`;
      bar.addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) setSub(b.dataset.sub); });
      bar.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        setSub(sub === 'behavior' ? 'performance' : 'behavior');
        bar.querySelector('[aria-selected="true"]')?.focus();
      });
    }
    if (page.firstElementChild !== bar) page.insertBefore(bar, page.firstElementChild);
    let sec = document.getElementById(SECTION_ID);
    if (!sec) { sec = document.createElement('div'); sec.id = SECTION_ID; }
    if (sec.parentElement !== page) page.appendChild(sec);
    // Filter / account rows go right below the tab bar order-wise already; keep marks fresh.
    markKeep(page);
    page.classList.toggle('ob-sub-behavior', sub === 'behavior');
    bar.querySelectorAll('[data-sub]').forEach(b => { const on = b.dataset.sub === sub; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    return page;
  }
  function setSub(next) {
    sub = next === 'behavior' ? 'behavior' : 'performance';
    try { localStorage.setItem(SUB_KEY, sub); } catch (_) {}
    ensureDom();
    if (sub === 'behavior') render();
    else if (typeof window.__obAnalyticsRefresh === 'function') setTimeout(window.__obAnalyticsRefresh, 30); // charts resize after being hidden
  }
  window.obAnalyticsSubTab = setSub;

  // ── data ───────────────────────────────────────────────────────────────────
  function sourceTrades() {
    if (typeof window.obAnalyticsFilteredTrades === 'function') return window.obAnalyticsFilteredTrades();
    const mode = window.activeMode;
    return (Array.isArray(window.trades) ? window.trades : []).filter(t => t.mode === mode);
  }

  // ── render ─────────────────────────────────────────────────────────────────
  function statCard(label, value, note, accent, pct) {
    return `<div class="pc-stat" style="--pc-accent:${accent}"><div class="pc-stat-label">${label}</div>
      <div class="pc-stat-val">${value}</div><div class="pc-stat-note">${note}</div>
      ${pct == null ? '' : `<div class="pc-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`}</div>`;
  }
  function statsTable(rows, firstLabel, firstCell) {
    return `<div class="pc-tw"><table><thead><tr><th>${firstLabel}</th><th>Trades</th><th>Win rate</th><th>Avg R</th><th>Total R</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${firstCell(r)}</td><td>${r.trades}</td><td>${r.winRate.toFixed(1)}%</td>
        <td class="${r.avgR > 0 ? 'pos' : r.avgR < 0 ? 'neg' : ''}">${r2(r.avgR)}</td><td class="${r.totalR > 0 ? 'pos' : r.totalR < 0 ? 'neg' : ''}">${r2(r.totalR)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  function render() {
    const page = ensureDom();
    if (!page || sub !== 'behavior' || page.classList.contains('hidden') || !window.obPsych) return;
    const sec = document.getElementById(SECTION_ID);
    const s = typeof window.obGetSettings === 'function' ? window.obGetSettings() : {};
    const library = (s.tagLibrary || []).map(t => ({ name: t.name, sentiment: t.sentiment }));
    const feelings = s.feelings || (window.obNotes ? window.obNotes.normalizeFeelings([]) : []);
    const days = (RANGES.find(r => r.id === range) || RANGES[3]).days;
    const list = window.obPsych.inRange(sourceTrades(), days, todayIso());
    const d = window.obPsych.compute(list, { tagLibrary: library, feelings });
    const rangeLabel = days ? `last ${days} days` : 'all time';

    const pills = `<div class="pc-pills" role="radiogroup" aria-label="Date range">${RANGES.map(r => `<button type="button" role="radio" data-range="${r.id}" aria-checked="${r.id === range}">${r.label}</button>`).join('')}</div>`;
    const header = `<div class="pc-card"><div class="pc-head"><div><div class="pc-title"><i class="fa-solid fa-brain" style="color:var(--blue)"></i>Psychology Status</div>
      <div class="pc-sub">From the tags, "How it felt" and checklists on your trades · ${d.trades} trade${d.trades === 1 ? '' : 's'}, ${rangeLabel} · analytics filters and the selected account apply</div></div>${pills}</div></div>`;

    if (!d.trades) {
      sec.innerHTML = header + `<div class="pc-card"><div class="pc-empty"><b>No trades in this range.</b><br>Pick a longer range, clear the filters, or log a trade.</div></div>`;
      bindPills(sec);
      destroyChart();
      return;
    }
    const n = d.trades;
    const noTags = !d.taggedTrades;
    const tagHint = `<div class="pc-empty"><b>No tags yet.</b><br>Add tags such as FOMO or Followed Plan under <b>Tags &amp; Psychology</b> in the trade panel. Mark your own tags Negative to count them as deviations.</div>`;
    sec.innerHTML = header + `
      <div class="pc-stats">
        ${statCard('Followed', `${d.followedPct.toFixed(1)}%`, `${d.counts.followed} of ${n} trades with no negative tag`, 'var(--profit)', d.followedPct)}
        ${statCard('Deviated', `${d.deviatedPct.toFixed(1)}%`, `${d.counts.deviated} of ${n} with a negative tag`, 'var(--loss)', d.deviatedPct)}
        ${statCard('Discipline', d.disciplinePct == null ? '—' : `${d.disciplinePct.toFixed(1)}%`, d.disciplinePct == null ? 'No checklists on these trades' : `Avg checklist completion · ${d.counts.withChecklist} trades`, 'var(--blue)', d.disciplinePct)}
        ${statCard('FOMO', `${d.fomoPct.toFixed(1)}%`, `${d.counts.fomo} of ${n} trades tagged FOMO`, 'var(--amber)', d.fomoPct)}
      </div>
      <div class="pc-card"><div class="pc-h3"><i class="fa-solid fa-chart-line" style="color:var(--profit)"></i>Followed % per week</div>
        ${d.trend.length ? '<div class="pc-chart"><canvas id="obPsychTrend" aria-label="Followed percentage per week"></canvas></div>' : '<div class="pc-empty">No dated trades.</div>'}</div>
      <div class="pc-grid2">
        <div class="pc-card"><div class="pc-h3"><i class="fa-solid fa-tags" style="color:var(--blue)"></i>By tag</div>
          ${noTags ? tagHint : statsTable(d.tags, 'Tag', r => `<span class="dot ${r.sentiment}" title="${r.sentiment}"></span>${esc(r.tag)}`)}</div>
        <div class="pc-card"><div class="pc-h3"><i class="fa-regular fa-face-smile" style="color:var(--amber)"></i>By how it felt</div>
          ${d.feelings.length ? statsTable(d.feelings, 'Feeling', r => `${esc(r.emoji)} ${esc(r.label)}`) : `<div class="pc-empty"><b>No feelings logged yet.</b><br>Pick a face under <b>How it felt</b> in the trade panel.</div>`}</div>
      </div>
      <div class="pc-card"><div class="pc-h3"><i class="fa-solid fa-ranking-star" style="color:var(--loss)"></i>Mistake leaderboard</div>
        ${d.mistakes.length ? `<div class="pc-tw"><table><thead><tr><th>Negative tag</th><th>Trades</th><th>Win rate</th><th>R lost</th><th>Total R</th></tr></thead><tbody>
          ${d.mistakes.map((m, i) => `<tr><td><span class="pc-rank">${i + 1}</span>${esc(m.tag)}</td><td>${m.trades}</td><td>${m.winRate.toFixed(1)}%</td><td class="${m.rLost < 0 ? 'neg' : ''}">${r2(m.rLost)}</td><td class="${m.totalR > 0 ? 'pos' : m.totalR < 0 ? 'neg' : ''}">${r2(m.totalR)}</td></tr>`).join('')}
          </tbody></table></div><div class="pc-sub" style="margin-top:8px">R lost = the losing R of trades carrying that tag. Ranked by most R lost.</div>`
          : (noTags ? tagHint : `<div class="pc-empty"><b>No negative tags in this range.</b> Nice. FOMO, Revenge and Overtrade (and your own Negative tags) appear here.</div>`)}
      </div>`;
    bindPills(sec);
    drawTrend(d.trend);
  }

  function bindPills(sec) {
    sec.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => {
      range = b.dataset.range;
      try { localStorage.setItem(RANGE_KEY, range); } catch (_) {}
      render();
    }));
  }
  function destroyChart() { try { trendChart && trendChart.destroy(); } catch (_) {} trendChart = null; }
  function drawTrend(trend) {
    destroyChart();
    const canvas = document.getElementById('obPsychTrend');
    if (!canvas || !window.Chart) return;
    const fmt = w => { const [, m, dd] = w.split('-'); return `${dd}/${m}`; };
    trendChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: trend.map(t => fmt(t.week)), datasets: [{ label: 'Followed %', data: trend.map(t => t.followedPct), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.12)', fill: true, tension: .25, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#22c55e' }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => `Week of ${trend[items[0].dataIndex].week}`, label: item => `Followed ${item.parsed.y}% · ${trend[item.dataIndex].trades} trades` } } },
        scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%', font: { family: 'JetBrains Mono', size: 10 } } }, x: { ticks: { font: { size: 10 } } } }
      }
    });
  }

  // ── boot ───────────────────────────────────────────────────────────────────
  function boot() {
    if (!document.getElementById('pageAnalytics')) return;
    ensureDom();
    const st = window.switchTab;
    if (typeof st === 'function' && !st.__obPsychWrapped) {
      const wrapped = function (tab, ...a) { const r = st.call(this, tab, ...a); if (tab === 'analytics') setTimeout(() => { ensureDom(); render(); }, 120); return r; };
      wrapped.__obPsychWrapped = true;
      window.switchTab = wrapped;
    }
    window.addEventListener('ob-analytics-refresh', () => { ensureDom(); render(); });
    // Other analytics scripts add their cards a little later: keep the marks fresh.
    const page = document.getElementById('pageAnalytics');
    new MutationObserver(() => markKeep(page)).observe(page, { childList: true });
    [300, 900, 1800].forEach(ms => setTimeout(() => { ensureDom(); render(); }, ms));
  }
  if (document.readyState === 'complete') setTimeout(boot, 0);
  else window.addEventListener('load', () => setTimeout(boot, 0), { once: true });
})();
