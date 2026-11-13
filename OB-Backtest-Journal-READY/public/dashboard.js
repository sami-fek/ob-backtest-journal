/**
 * dashboard.js — the Dashboard page (Part 4). Uses only data that already
 * exists on trades/accounts. Dollar values: obCalendarKit.pnlFor (R × account
 * starting balance × risk %), the same as the calendar; Account Equity:
 * obBalance.balance (incl. cash movements), the same as the balance card.
 */
(() => {
  'use strict';
  const RANGE_KEY = 'ob-dash-range';
  const FILTER_KEY = 'ob-dash-filter';
  const MODES = [{ id: 'Real', label: 'Live' }, { id: 'Demo', label: 'Demo' }, { id: 'Funded', label: 'Funded' }, { id: 'Backtest', label: 'Backtest' }];
  const PAGE_SIZE = 8;
  const S = () => window.obDashStats;
  const K = () => window.obCalendarKit;
  let range = (() => { try { return localStorage.getItem(RANGE_KEY) || '30d'; } catch (_) { return '30d'; } })();
  let filter = (() => { try { return JSON.parse(localStorage.getItem(FILTER_KEY) || '{}') || {}; } catch (_) { return {}; } })();
  let page = 0;
  let calMonth = null; // Date (1st of month) shown in the dashboard calendar
  let chart = null;
  let profileName = null;
  let renderQueued = false;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sym = () => (window.obPrefs ? window.obPrefs.get().currencySymbol : '$');
  function money(v, signed = true) {
    const n = Number(v) || 0;
    const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${n < 0 ? '-' : signed && n > 0 ? '+' : ''}${sym()}${body}`;
  }
  const cls = v => (v > 0 ? 'db-pos' : v < 0 ? 'db-neg' : '');
  const fmtR = v => `${v > 0 ? '+' : ''}${(Number(v) || 0).toFixed(2)}R`;
  const fmtDate = d => (window.obPrefs ? window.obPrefs.formatDate(d) : d);
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ── scope ──────────────────────────────────────────────────────────────────
  const mode = () => window.activeMode || 'Real';
  function accountsOf(m) {
    try { const d = JSON.parse(localStorage.getItem('my_journal_accounts_v1') || '{}'); return (Array.isArray(d[m]) ? d[m] : []); } catch (_) { return []; }
  }
  function liveAccounts(m) { const all = accountsOf(m); const live = all.filter(a => a && a.status !== 'archived'); return live.length ? live : all; }
  function activeAccount() {
    const m = mode();
    if (m === 'Backtest') return null;
    const list = liveAccounts(m);
    let id = null; try { id = localStorage.getItem(`my_journal_active_account_${m}_v1`); } catch (_) {}
    return list.find(a => a.id === id) || list[0] || null;
  }
  function scopedTrades() {
    const m = mode();
    const acc = activeAccount();
    return (Array.isArray(window.trades) ? window.trades : []).filter(t => t.mode === m && (m === 'Backtest' || (acc && t.accountId === acc.id)));
  }
  const settings = () => (typeof window.obGetSettings === 'function' ? window.obGetSettings() : {});
  const pnlFor = t => (K() ? K().pnlFor(t) : (Number(t.rMultiple) || 0) * 1000);

  function equityNow(trades) {
    const s = settings();
    const risk = Number(s.riskPercent) || 1;
    const acc = activeAccount();
    if (acc && window.obBalance) return window.obBalance.balance(acc, trades, risk);
    const base = Number(s.initialCapital) || 100000;
    const p = trades.reduce((x, t) => x + pnlFor(t), 0);
    return { balance: base + p, base, tradePnl: p, cash: 0, pct: base ? (p / base) * 100 : 0 };
  }
  function equitySeries(trades) {
    const s = settings();
    const acc = activeAccount() || { startingBalance: Number(s.initialCapital) || 100000 };
    if (!window.obBalance) return [];
    return window.obBalance.equitySeries(acc, trades.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))), Number(s.riskPercent) || 1, Number(s.initialCapital) || 100000);
  }

  // ── markup pieces ──────────────────────────────────────────────────────────
  function gauge(w, b, l) {
    const n = w + b + l;
    const L = Math.PI * 40;
    const seg = (v, off, color) => n && v ? `<path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="butt" stroke-dasharray="${(v / n) * L} ${L}" stroke-dashoffset="${-off}"/>` : '';
    const wl = (w / (n || 1)) * L, bl = (b / (n || 1)) * L;
    return `<svg class="db-gauge" viewBox="0 0 100 56" role="img" aria-label="${w} wins, ${b} breakeven, ${l} losses">
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--db-track)" stroke-width="9"/>
      ${seg(w, 0, 'var(--profit)')}${seg(b, wl, 'var(--muted-2)')}${seg(l, wl + bl, 'var(--loss)')}</svg>`;
  }
  function statCard(label, value, sub, extra = '', valueCls = '') {
    return `<div class="db-card db-stat"><div class="db-stat-top"><span class="db-label">${label}</span>${extra}</div>
      <div class="db-stat-val ${valueCls}">${value}</div><div class="db-stat-sub">${sub}</div></div>`;
  }

  function filterOptions(all) {
    const uniq = k => [...new Set(all.map(t => t[k]).filter(Boolean))].sort();
    const sel = (key, label, opts) => `<label class="db-field"><span>${label}</span><select data-f="${key}"><option value="">All</option>${opts.map(o => `<option ${filter[key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    return sel('pair', 'Pair', uniq('pair')) + sel('strategy', 'Strategy', uniq('strategy')) + sel('side', 'Side', ['LONG', 'SHORT']) + sel('result', 'Result', ['Win', 'Loss', 'BE']);
  }
  const activeFilters = () => Object.values(filter).filter(Boolean).length;

  // ── render ─────────────────────────────────────────────────────────────────
  function render() {
    renderQueued = false;
    const root = document.getElementById('dbRoot');
    const pageEl = document.getElementById('pageDashboard');
    if (!root || !pageEl || pageEl.classList.contains('hidden') || !S()) return;
    if (K()) K().injectStyles();

    const today = todayIso();
    const all = scopedTrades();
    const bounds = S().rangeBounds(range, today);
    const filtered = S().applyFilter(all, filter);
    const inRange = filtered.filter(t => S().inBounds(t, bounds));
    const sum = S().summary(inRange, pnlFor);
    const eq = equityNow(all);
    const todays = all.filter(t => String(t.date).slice(0, 10) === today);
    const todayPnl = todays.reduce((s, t) => s + pnlFor(t), 0);
    const acc = activeAccount();
    const m = mode();
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const rangeLabel = (S().RANGES.find(r => r.id === range) || {}).label || 'All time';
    const empty = !all.length;
    const accounts = liveAccounts(m);

    root.innerHTML = `
      <div class="db-top">
        <div class="db-hello">
          <h1>${greet}${profileName ? ', ' + esc(profileName) : ''}</h1>
          <p>${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
        <div class="db-today" aria-label="Today">
          <div><span>Today's P&amp;L</span><b class="${cls(todayPnl)}">${money(todayPnl)}</b></div>
          <div><span>Trades</span><b>${todays.length}</b></div>
          <div><span>Wins</span><b>${todays.filter(t => t.result === 'Win').length}</b></div>
        </div>
      </div>

      <div class="db-toolbar">
        <div class="db-seg" role="radiogroup" aria-label="Account mode">${MODES.map(x => `<button type="button" role="radio" data-mode="${x.id}" aria-checked="${x.id === m}">${x.id === 'Real' ? '<span class="db-live-dot"></span>' : ''}${x.label}</button>`).join('')}</div>
        ${m !== 'Backtest' && accounts.length ? `<select class="db-select" id="dbAccount" aria-label="Account">${accounts.map(a => `<option value="${esc(a.id)}" ${acc && a.id === acc.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : ''}
        <div class="db-spacer"></div>
        <select class="db-select db-range" id="dbRange" aria-label="Date range">${S().RANGES.map(r => `<option value="${r.id}" ${r.id === range ? 'selected' : ''}>${r.label}</option>`).join('')}</select>
        <div class="db-filter-wrap">
          <button type="button" class="db-btn" id="dbFilterBtn" aria-expanded="false" aria-haspopup="dialog"><i class="fa-solid fa-filter"></i> Filter${activeFilters() ? ` <span class="db-count">${activeFilters()}</span>` : ''}</button>
          <div class="db-pop" id="dbFilterPop" role="dialog" aria-label="Filter trades" hidden>
            ${filterOptions(all)}
            <div class="db-pop-foot"><button type="button" class="db-link" id="dbFilterClear">Clear</button><button type="button" class="db-btn db-primary" id="dbFilterClose">Done</button></div>
          </div>
        </div>
      </div>

      ${empty ? `<div class="db-card db-empty-hero"><i class="fa-solid fa-chart-line"></i><div><b>No trades yet${m === 'Backtest' ? ' in Backtest' : acc ? ` on ${esc(acc.name)}` : ''}.</b><span>Log your first trade and this dashboard fills in: P&amp;L, win rate, equity curve, calendar and more.</span></div><button type="button" class="db-btn db-primary" data-go="trading">Log a trade</button></div>` : ''}

      <div class="db-stats">
        ${statCard('Net P&amp;L', money(sum.net), `${sum.trades} trade${sum.trades === 1 ? '' : 's'} · ${esc(rangeLabel.toLowerCase())}`, '', cls(sum.net))}
        ${statCard('Win Rate', `${sum.winRate.toFixed(1)}%`, `<span class="db-pos">${sum.wins}W</span> · <span class="db-muted">${sum.breakeven}BE</span> · <span class="db-neg">${sum.losses}L</span>`, gauge(sum.wins, sum.breakeven, sum.losses))}
        ${statCard('Profit Factor', sum.profitFactor === Infinity ? '∞' : sum.profitFactor.toFixed(2), `Gross ${money(sum.grossProfit, false)} / ${money(Math.abs(sum.grossLoss), false)}`, '', sum.profitFactor >= 1 ? 'db-pos' : sum.trades ? 'db-neg' : '')}
        ${statCard('Account Equity', money(eq.balance, false), `${eq.pct >= 0 ? '+' : ''}${eq.pct.toFixed(2)}% on ${money(eq.base, false)}${eq.cash ? ` · cash ${money(eq.cash)}` : ''}`)}
        ${statCard('Risk : Reward', sum.riskReward == null ? '—' : `1 : ${sum.riskReward.toFixed(2)}`, `Avg win ${fmtR(sum.avgWinR)} · avg loss ${fmtR(sum.avgLossR)}`)}
      </div>

      <div class="db-row db-row-2-1">
        <div class="db-card">
          <div class="db-card-head"><div><h3>Net P&amp;L &amp; Account Equity</h3><p>Daily P&amp;L bars · equity line (incl. deposits / withdrawals) · ${esc(rangeLabel.toLowerCase())}</p></div></div>
          <div class="db-chart">${inRange.length || eq.cash ? '<canvas id="dbChart"></canvas>' : '<div class="db-empty">No trades in this range.</div>'}</div>
        </div>
        <div class="db-card">
          <div class="db-card-head"><div><h3>Performance Breakdown</h3><p>${esc(rangeLabel)}</p></div></div>
          <ul class="db-list">
            <li><span>Biggest win</span><b class="db-pos">${sum.best && sum.best.pnl > 0 ? money(sum.best.pnl) : '—'}</b></li>
            <li><span>Biggest loss</span><b class="db-neg">${sum.worst && sum.worst.pnl < 0 ? money(sum.worst.pnl) : '—'}</b></li>
            <li><span>Average win</span><b class="db-pos">${sum.wins ? money(sum.avgWin) : '—'}</b></li>
            <li><span>Average loss</span><b class="db-neg">${sum.losses ? money(sum.avgLoss) : '—'}</b></li>
            <li><span>Max drawdown</span><b class="${sum.maxDrawdown < 0 ? 'db-neg' : ''}">${money(sum.maxDrawdown)}</b></li>
            <li><span>Average R</span><b class="${cls(sum.avgR)}">${fmtR(sum.avgR)}</b></li>
          </ul>
        </div>
      </div>

      <div class="db-row db-row-2-1">
        <div class="db-card">
          <div class="db-card-head"><div><h3>Calendar</h3><p id="dbCalSub"></p></div>
            <div class="db-cal-nav"><button type="button" class="db-icon" data-cal="-1" aria-label="Previous month"><i class="fa-solid fa-chevron-left"></i></button><span id="dbCalLabel"></span><button type="button" class="db-icon" data-cal="1" aria-label="Next month"><i class="fa-solid fa-chevron-right"></i></button><button type="button" class="db-btn db-sm" data-cal="0">This month</button></div></div>
          <div class="db-cal-scroll"><div id="dbCalendar" class="ob-jh-grid"></div></div>
        </div>
        <div class="db-card">
          <div class="db-card-head"><div><h3>Profit Drivers</h3><p>Net result per strategy · ${esc(rangeLabel.toLowerCase())}</p></div></div>
          ${sum.strategies.length ? `
            <div class="db-drivers-top">
              <div><span>Best strategy</span><b>${esc(sum.bestStrategy.strategy)}</b><em class="${cls(sum.bestStrategy.net)}">${money(sum.bestStrategy.net)}</em></div>
              <div><span>Worst strategy</span><b>${sum.worstStrategy ? esc(sum.worstStrategy.strategy) : '—'}</b><em class="${sum.worstStrategy ? cls(sum.worstStrategy.net) : ''}">${sum.worstStrategy ? money(sum.worstStrategy.net) : 'one strategy only'}</em></div>
            </div>
            <ul class="db-drivers">${(() => { const max = Math.max(...sum.strategies.map(x => Math.abs(x.net)), 1); return sum.strategies.map(x => `
              <li><div class="db-drv-line"><span>${esc(x.strategy)}</span><b class="${cls(x.net)}">${money(x.net)}</b></div>
                <div class="db-drv-bar"><i class="${x.net >= 0 ? 'pos' : 'neg'}" style="width:${(Math.abs(x.net) / max) * 100}%"></i></div>
                <div class="db-drv-meta">${x.trades} trade${x.trades === 1 ? '' : 's'} · ${x.trades ? Math.round((x.wins / x.trades) * 100) : 0}% win · ${fmtR(x.r)}</div></li>`).join(''); })()}</ul>`
            : '<div class="db-empty">No trades in this range.</div>'}
        </div>
      </div>

      <div class="db-card ob-act-card" id="dbActivity">
        <div class="db-card-head"><div><h3>Trading Activity</h3><p>Last ${K() ? K().weeks : 26} weeks · daily P&amp;L${activeFilters() ? ' · filter applied' : ''}</p></div><div class="ob-act-legend" aria-hidden="true">${K() ? K().legendHtml() : ''}</div></div>
        <div class="ob-act-scroll"><div class="ob-act-wrap" id="dbActBody"></div></div>
        <div class="ob-act-summary db-act-summary" id="dbActSummary"></div>
      </div>

      <div class="db-card">
        <div class="db-card-head"><div><h3>Recent Trades</h3><p>${esc(rangeLabel)} · click a row to open it</p></div></div>
        <div id="dbRecent"></div>
      </div>`;

    bind(root, all);
    renderCalendar(filtered);
    renderActivity(filtered);
    renderRecent(inRange);
    if (inRange.length || eq.cash) drawChart(inRange, all, bounds);
    else destroyChart();
  }

  function renderCalendar(filtered) {
    const grid = document.getElementById('dbCalendar');
    if (!grid || !K()) return;
    if (!calMonth) { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
    const y = calMonth.getFullYear(), mo = calMonth.getMonth();
    const daily = K().dailyStatsFor(filtered);
    grid.innerHTML = K().monthGridHtml(daily, y, mo);
    K().wireAdd(grid);
    const label = calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    document.getElementById('dbCalLabel').textContent = label;
    const prefix = `${y}-${String(mo + 1).padStart(2, '0')}`;
    const monthVals = Object.entries(daily).filter(([d]) => d.startsWith(prefix)).map(([, v]) => v);
    const total = monthVals.reduce((s, v) => s + v.pnl, 0);
    const n = monthVals.reduce((s, v) => s + v.count, 0);
    document.getElementById('dbCalSub').textContent = `${n} trade${n === 1 ? '' : 's'} · ${money(total)} in ${label} · ${window.matchMedia('(hover: none)').matches ? 'tap a day' : 'hover a day and press +'} to add a trade`;
  }

  function renderActivity(filtered) {
    if (!K()) return;
    const out = K().activityHtml(K().dailyStatsFor(filtered), x => {
      // Summary row: Net P&L, Gross profit, Gross loss, Most traded pair, Best trade, Worst trade
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - (K().weeks - 1) * 7);
      const startIso = K().isoOf(start.getFullYear(), start.getMonth(), start.getDate());
      const s = S().summary(filtered.filter(t => String(t.date).slice(0, 10) >= startIso), pnlFor);
      return `<span>Net P&amp;L <b class="${cls(s.net)}">${money(s.net)}</b></span><span>Gross profit <b class="db-pos">${money(s.grossProfit)}</b></span><span>Gross loss <b class="db-neg">${money(s.grossLoss)}</b></span>` +
        `<span>Most traded <b>${s.mostTradedPair ? `${esc(s.mostTradedPair.pair)} (${s.mostTradedPair.trades})` : '—'}</b></span>` +
        `<span>Best trade <b class="db-pos">${s.best && s.best.pnl > 0 ? `${money(s.best.pnl)} ${esc(s.best.trade.pair)}` : '—'}</b></span>` +
        `<span>Worst trade <b class="db-neg">${s.worst && s.worst.pnl < 0 ? `${money(s.worst.pnl)} ${esc(s.worst.trade.pair)}` : '—'}</b></span>`;
    });
    document.getElementById('dbActBody').innerHTML = out.body;
    document.getElementById('dbActSummary').innerHTML = out.summary;
    const sc = document.querySelector('#dbActivity .ob-act-scroll');
    if (sc) sc.scrollLeft = sc.scrollWidth; // newest weeks first on narrow screens
  }

  function renderRecent(list) {
    const box = document.getElementById('dbRecent');
    if (!box) return;
    const sorted = list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    if (page >= pages) page = pages - 1;
    const rows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    if (!rows.length) { box.innerHTML = '<div class="db-empty">No trades in this range.</div>'; return; }
    box.innerHTML = `<div class="db-table-wrap"><table class="db-table"><thead><tr><th>Side</th><th>Pair</th><th>Date</th><th>Strategy</th><th>Result</th><th class="num">R</th><th class="num">P&amp;L</th></tr></thead><tbody>
      ${rows.map(t => { const p = pnlFor(t); return `<tr data-id="${esc(t.id)}" tabindex="0">
        <td data-label="Side" class="db-c-side"><span class="db-side ${t.direction === 'SHORT' ? 'short' : 'long'}">${t.direction === 'SHORT' ? 'Short' : 'Long'}</span></td>
        <td data-label="Pair" class="db-c-pair"><b>${esc(t.pair || '—')}</b></td><td data-label="Date" class="db-c-date">${esc(fmtDate(String(t.date).slice(0, 10)))}</td><td data-label="Strategy" class="db-c-strat">${esc(t.strategy || '—')}</td>
        <td data-label="Result" class="db-c-res"><span class="db-res ${String(t.result).toLowerCase()}">${esc(t.result || '—')}</span></td>
        <td data-label="R" class="num db-c-r ${cls(t.rMultiple)}">${fmtR(t.rMultiple)}</td><td data-label="P&amp;L" class="num db-c-pnl ${cls(p)}">${money(p)}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="db-pager"><span>${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + rows.length} of ${sorted.length}</span>
        <div><button type="button" class="db-icon" data-pg="-1" ${page === 0 ? 'disabled' : ''} aria-label="Previous page"><i class="fa-solid fa-chevron-left"></i></button>
        <span>Page ${page + 1} / ${pages}</span>
        <button type="button" class="db-icon" data-pg="1" ${page >= pages - 1 ? 'disabled' : ''} aria-label="Next page"><i class="fa-solid fa-chevron-right"></i></button></div></div>`;
    box.querySelectorAll('[data-pg]').forEach(b => b.addEventListener('click', () => { page += Number(b.dataset.pg); renderRecent(list); }));
    const open = id => { if (typeof window.openDrawer === 'function') window.openDrawer(id); };
    box.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => open(tr.dataset.id));
      tr.addEventListener('keydown', e => { if (e.key === 'Enter') open(tr.dataset.id); });
    });
  }

  function destroyChart() { try { chart && chart.destroy(); } catch (_) {} chart = null; }
  function drawChart(inRange, all, [from, to]) {
    destroyChart();
    const canvas = document.getElementById('dbChart');
    if (!canvas || !window.Chart) return;
    const daily = S().daily(inRange, pnlFor);
    // Equity at the end of each day (whole account, all trades + cash), shown for days in range.
    const pts = equitySeries(all);
    const eqByDay = {};
    let startEq = pts.length ? pts[0].equity : 0;
    pts.forEach(p => { if (p.date) eqByDay[p.date] = p.equity; });
    const days = [...new Set([...Object.keys(daily), ...Object.keys(eqByDay).filter(d => (!from || d >= from) && (!to || d <= to))])].sort();
    const eqLine = [];
    let last = startEq;
    const before = Object.keys(eqByDay).filter(d => from && d < from).sort();
    if (before.length) last = eqByDay[before[before.length - 1]];
    days.forEach(d => { if (eqByDay[d] != null) last = eqByDay[d]; eqLine.push(Math.round(last * 100) / 100); });
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const green = dark ? '#22c55e' : '#16a34a';
    chart = new Chart(canvas.getContext('2d'), {
      data: {
        labels: days.map(d => fmtDate(d)),
        datasets: [
          { type: 'bar', label: 'Daily P&L', data: days.map(d => Math.round(((daily[d] || {}).pnl || 0) * 100) / 100), backgroundColor: days.map(d => ((daily[d] || {}).pnl || 0) >= 0 ? green + 'cc' : '#ef4444cc'), borderRadius: 4, yAxisID: 'y', order: 2, maxBarThickness: 26 },
          { type: 'line', label: 'Account equity', data: eqLine, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.08)', borderWidth: 2.2, pointRadius: days.length > 40 ? 0 : 2.5, tension: .25, yAxisID: 'y1', order: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y, c.datasetIndex === 0)}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 10 } } },
          y: { position: 'left', ticks: { callback: v => `${sym()}${Number(v).toLocaleString('en-US')}`, font: { family: 'JetBrains Mono', size: 10 } } },
          y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => `${sym()}${Number(v).toLocaleString('en-US')}`, font: { family: 'JetBrains Mono', size: 10 } } }
        }
      }
    });
  }

  function bind(root, all) {
    root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.mode !== mode() && typeof window.switchMode === 'function') { page = 0; window.switchMode(b.dataset.mode); }
    }));
    root.querySelector('#dbAccount')?.addEventListener('change', e => {
      try { localStorage.setItem(`my_journal_active_account_${mode()}_v1`, e.target.value); } catch (_) {}
      window.dispatchEvent(new CustomEvent('wallet-accounts-updated'));
      page = 0;
      if (typeof window.switchMode === 'function') window.switchMode(mode());
    });
    root.querySelector('#dbRange').addEventListener('change', e => { range = e.target.value; page = 0; try { localStorage.setItem(RANGE_KEY, range); } catch (_) {} render(); });
    const pop = root.querySelector('#dbFilterPop');
    const btn = root.querySelector('#dbFilterBtn');
    const setOpen = on => { pop.hidden = !on; btn.setAttribute('aria-expanded', String(on)); if (on) pop.querySelector('select')?.focus(); };
    btn.addEventListener('click', e => { e.stopPropagation(); setOpen(pop.hidden); });
    pop.addEventListener('click', e => e.stopPropagation());
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { setOpen(false); btn.focus(); } });
    pop.querySelectorAll('[data-f]').forEach(s => s.addEventListener('change', () => {
      filter[s.dataset.f] = s.value || undefined;
      try { localStorage.setItem(FILTER_KEY, JSON.stringify(filter)); } catch (_) {}
      page = 0; render();
      const p2 = document.getElementById('dbFilterPop'); if (p2) { p2.hidden = false; document.getElementById('dbFilterBtn').setAttribute('aria-expanded', 'true'); }
    }));
    pop.querySelector('#dbFilterClear').addEventListener('click', () => { filter = {}; try { localStorage.removeItem(FILTER_KEY); } catch (_) {} page = 0; render(); });
    pop.querySelector('#dbFilterClose').addEventListener('click', () => { setOpen(false); btn.focus(); });
    root.querySelectorAll('[data-cal]').forEach(b => b.addEventListener('click', () => {
      const d = Number(b.dataset.cal);
      if (!d) { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
      else calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + d, 1);
      renderCalendar(S().applyFilter(all, filter));
    }));
    root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => window.switchTab && window.switchTab(b.dataset.go)));
  }

  function queue() { if (renderQueued) return; renderQueued = true; setTimeout(render, 40); }
  async function loadName() {
    try {
      const raw = typeof window.storageGet === 'function' ? await window.storageGet('ob-profile') : null;
      const p = raw ? JSON.parse(raw) : {};
      profileName = String(p.firstName || '').trim() || null;
    } catch (_) { profileName = null; }
    if (!profileName) {
      try { const r = await fetch('/api/auth/me', { credentials: 'same-origin' }); const j = await r.json(); profileName = String(j?.user?.email || '').split('@')[0] || null; } catch (_) {}
    }
    queue();
  }
  window.obDashboardRefresh = () => { loadName(); queue(); };

  function wrap(name, after) {
    const fn = window[name];
    if (typeof fn !== 'function' || fn.__obDashWrapped) return;
    const w = function (...a) { const r = fn.apply(this, a); after(a); return r; };
    w.__obDashWrapped = true;
    window[name] = w;
  }
  function boot() {
    if (!document.getElementById('pageDashboard')) return;
    wrap('switchTab', ([tab]) => { if (tab === 'dashboard') { loadName(); queue(); } });
    wrap('switchMode', () => queue());
    wrap('renderAll', () => queue());
    [400, 1200].forEach(ms => setTimeout(() => { wrap('renderAll', () => queue()); wrap('switchMode', () => queue()); }, ms));
    window.addEventListener('wallet-accounts-updated', queue);
    window.addEventListener('ob-theme-change', queue);
    document.addEventListener('click', () => { const p = document.getElementById('dbFilterPop'); if (p && !p.hidden) { p.hidden = true; document.getElementById('dbFilterBtn')?.setAttribute('aria-expanded', 'false'); } });
    new MutationObserver(() => queue()).observe(document.getElementById('pageDashboard'), { attributes: true, attributeFilter: ['class'] });
    loadName();
    [300, 1200, 2500].forEach(ms => setTimeout(queue, ms)); // trades/accounts arrive asynchronously
  }
  if (document.readyState === 'complete') setTimeout(boot, 0);
  else window.addEventListener('load', () => setTimeout(boot, 0), { once: true });
})();
