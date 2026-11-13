/**
 * dashboard.js — the Dashboard page: "How am I doing, and am I safe?"
 * (BUILD-PLAN-2, Part 1 step 2). Uses only data that already exists on
 * trades/accounts/settings.
 *  - Dollar values: obCalendarKit.pnlFor (R × account starting balance × risk %),
 *    the same as the calendar.
 *  - Account equity: obBalance.balance (incl. cash movements), the same as the balance card.
 *  - Discipline: the discipline engine's own state (getDisciplineState /
 *    'ob-discipline-state'); nothing here changes the rules.
 * Every number says which period it covers.
 * Profit Drivers and Performance Breakdown moved to Analytics (analytics-drivers.js).
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
  let calMonth = null;
  let chart = null;
  let profileName = null;
  let renderQueued = false;
  let discipline = null;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sym = () => (window.obPrefs ? window.obPrefs.get().currencySymbol : '$');
  function money(v, signed = true) {
    const n = Number(v) || 0;
    const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${n < 0 ? '-' : signed && n > 0 ? '+' : ''}${sym()}${body}`;
  }
  const cls = v => (v > 0 ? 'ds-pos' : v < 0 ? 'ds-neg' : '');
  const fmtR = v => `${v > 0 ? '+' : ''}${(Number(v) || 0).toFixed(2)}R`;
  const fmtDate = d => (window.obPrefs ? window.obPrefs.formatDate(d) : d);
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const touch = () => window.matchMedia('(hover: none)').matches;

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
  function disciplineState() {
    if (discipline && discipline.mode === mode()) return discipline;
    try { return typeof window.getDisciplineState === 'function' ? { ...window.getDisciplineState(), mode: mode() } : null; } catch (_) { return null; }
  }

  // ── markup pieces ──────────────────────────────────────────────────────────
  function gauge(w, b, l) {
    const n = w + b + l;
    const L = Math.PI * 40;
    const seg = (v, off, color) => n && v ? `<path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="${(v / n) * L} ${L}" stroke-dashoffset="${-off}"/>` : '';
    const wl = (w / (n || 1)) * L, bl = (b / (n || 1)) * L;
    return `<svg class="db2-gauge" viewBox="0 0 100 56" role="img" aria-label="${w} wins, ${b} breakeven, ${l} losses">
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--ds-track)" stroke-width="8"/>
      ${seg(w, 0, 'var(--ds-pos)')}${seg(b, wl, 'var(--ds-muted)')}${seg(l, wl + bl, 'var(--ds-neg)')}</svg>`;
  }
  const head = (title, period, extra = '') => `<div class="ds-section-head"><h2 class="ds-label">${title}</h2>${period ? `<span class="ds-period">${period}</span>` : ''}${extra}</div>`;
  function stat(label, value, sub, { valueCls = '', extra = '', span = 'ds-span-3 ds-t-3 ds-p-1', id = '' } = {}) {
    return `<div class="ds-card db2-stat ${span}"${id ? ` id="${id}"` : ''}><div class="db2-stat-top"><span class="ds-label">${label}</span>${extra}</div>
      <div class="ds-big ${valueCls}">${value}</div><div class="ds-sub">${sub}</div></div>`;
  }
  function meterRow(label, valueHtml, pct, tone, caption) {
    return `<div class="db2-meter-row"><div class="db2-meter-line"><span>${label}</span><b class="ds-num">${valueHtml}</b></div>
      <div class="ds-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${esc(label)}"><i class="${tone}" style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>
      ${caption ? `<div class="ds-sub db2-cap">${caption}</div>` : ''}</div>`;
  }
  function sparkline(trades) {
    const pts = equitySeries(trades).map(p => p.equity).filter(Number.isFinite);
    if (pts.length < 2) return '';
    const v = pts.slice(-90);
    const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
    const xy = v.map((y, i) => `${((i / (v.length - 1)) * 100).toFixed(2)},${(36 - ((y - min) / span) * 32).toFixed(2)}`);
    const up = v[v.length - 1] >= v[0];
    return `<svg class="db2-spark ${up ? 'up' : 'down'}" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="0,40 ${xy.join(' ')} 100,40"/><polyline points="${xy.join(' ')}" vector-effect="non-scaling-stroke"/></svg>`;
  }
  const usedTone = pct => (pct >= 80 ? 'neg' : pct >= 50 ? 'warn' : 'pos');

  function filterOptions(all) {
    const uniq = k => [...new Set(all.map(t => t[k]).filter(Boolean))].sort();
    const sel = (key, label, opts) => `<label class="db2-field"><span class="ds-label">${label}</span><select class="ds-select" data-f="${key}"><option value="">All</option>${opts.map(o => `<option ${filter[key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    return sel('pair', 'Pair', uniq('pair')) + sel('strategy', 'Strategy', uniq('strategy')) + sel('side', 'Side', ['LONG', 'SHORT']) + sel('result', 'Result', ['Win', 'Loss', 'BE']);
  }
  const activeFilters = () => Object.values(filter).filter(Boolean).length;

  // ── sections ───────────────────────────────────────────────────────────────
  function nowSection(all, eq) {
    const m = mode();
    const acc = activeAccount();
    const st = S().streak(all);
    const d = disciplineState();
    // Discipline (today): the engine's numbers. Backtest has no limits.
    let disc;
    if (m === 'Backtest') {
      disc = `<div class="ds-sub db2-note"><i class="fa-solid fa-flask"></i> Hard stop and daily limit don't apply in Backtest.</div>`;
    } else if (!d) {
      disc = `<div class="ds-sub">Loading rules…</div>`;
    } else {
      const lossesLeft = Math.max(0, d.hardStopThreshold - d.consecutiveLosses);
      const tradesLeft = Math.max(0, d.dailyMax - d.todayCount);
      disc = meterRow('Losses in a row', `${d.consecutiveLosses} / ${d.hardStopThreshold}`, (d.consecutiveLosses / (d.hardStopThreshold || 1)) * 100,
        lossesLeft === 0 ? 'neg' : lossesLeft === 1 ? 'warn' : 'pos',
        lossesLeft === 0 ? '<span class="ds-neg">Hard stop reached — stop trading.</span>' : `${plural(lossesLeft, 'more loss')} before your hard stop`.replace('more losss', 'more losses'))
        + meterRow('Trades today', `${d.todayCount} / ${d.dailyMax}`, (d.todayCount / (d.dailyMax || 1)) * 100,
          tradesLeft === 0 ? 'neg' : tradesLeft === 1 ? 'warn' : 'pos',
          tradesLeft === 0 ? '<span class="ds-neg">Daily limit reached.</span>' : `${plural(tradesLeft, 'trade')} left today`);
    }
    const dots = st.recent.map(r => `<i class="db2-dot ${r === 'Win' ? 'w' : r === 'Loss' ? 'l' : 'b'}" title="${r}"></i>`).join('');
    const streakVal = st.kind ? `${st.count} ${st.kind === 'Win' ? (st.count === 1 ? 'win' : 'wins') : (st.count === 1 ? 'loss' : 'losses')}` : '—';
    const scopeLabel = m === 'Backtest' ? 'Backtest' : acc ? esc(acc.name) : '';
    return `<section class="ds-section" id="dbNow">
      ${head('Right now', `${scopeLabel ? scopeLabel + ' · ' : ''}live`)}
      <div class="ds-grid">
        <div class="ds-card db2-equity ds-span-4 ds-t-3" id="dbEquity">
          <div class="db2-stat-top"><span class="ds-label">Account equity</span><span class="ds-period">now</span></div>
          <div class="ds-big db2-xl">${money(eq.balance, false)}</div>
          <div class="ds-sub"><span class="${cls(eq.pct)}">${eq.pct >= 0 ? '+' : ''}${eq.pct.toFixed(2)}%</span> on ${money(eq.base, false)} · all time${eq.cash ? ` · cash ${money(eq.cash)}` : ''}</div>
          ${sparkline(all)}
        </div>
        <div class="ds-card db2-disc ds-span-4 ds-t-6" id="dbDiscipline">
          <div class="db2-stat-top"><span class="ds-label">Discipline</span><span class="ds-period">today</span></div>
          ${disc}
        </div>
        <div class="ds-card db2-streak ds-span-4 ds-t-3" id="dbStreak">
          <div class="db2-stat-top"><span class="ds-label">Current streak</span><span class="ds-period">all time</span></div>
          <div class="ds-big ${st.kind === 'Win' ? 'ds-pos' : st.kind === 'Loss' ? 'ds-neg' : ''}">${streakVal}</div>
          ${st.recent.length ? `<div class="db2-dots" aria-label="Last ${st.recent.length} results, oldest first">${dots}</div>` : ''}
          <div class="ds-sub">${all.length ? `Longest: ${plural(st.longestWin, 'win')} · ${plural(st.longestLoss, 'loss').replace('losss', 'losses')}` : 'No trades yet'}${st.kind === null && all.length ? ' · last trade breakeven' : ''}</div>
        </div>
      </div>
    </section>`;
  }

  function targetsSection(all) {
    const acc = activeAccount();
    if (!acc) return '';
    const today = todayIso();
    const sumIn = ([a, b]) => all.filter(t => { const x = String(t.date).slice(0, 10); return x >= a && x <= b; }).reduce((s, t) => s + pnlFor(t), 0);
    const cards = [];
    const tgt = (label, period, p) => {
      if (!p) return;
      cards.push(`<div class="ds-card db2-target">
        <div class="db2-stat-top"><span class="ds-label">${label}</span><span class="ds-period">${period}</span></div>
        <div class="db2-target-val"><b class="ds-num ${cls(p.value)}">${money(p.value)}</b><span class="ds-sub"> of ${money(p.target, false)}</span></div>
        <div class="ds-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p.pct)}" aria-label="${esc(label)}"><i class="${p.value < 0 ? 'neg' : 'pos'}" style="width:${p.value < 0 ? 100 : p.pct}%"></i></div>
        <div class="ds-sub db2-cap">${p.value < 0 ? 'Below zero' : p.reached ? 'Target reached' : `${p.pct.toFixed(0)}% · ${money(p.target - p.value, false)} to go`}</div></div>`);
    };
    tgt('Weekly target', 'this week', S().progress(sumIn(S().weekBounds(today)), acc.weeklyTarget));
    tgt('Monthly target', 'this month', S().progress(sumIn(S().monthBounds(today)), acc.monthlyTarget));
    tgt('Profit target', 'all time', S().progress(all.reduce((s, t) => s + pnlFor(t), 0), acc.profitTarget));
    const lim = (label, period, used, limit, what) => {
      if (!(Number(limit) > 0)) return;
      const pct = Math.min(100, (used / limit) * 100);
      cards.push(`<div class="ds-card db2-target">
        <div class="db2-stat-top"><span class="ds-label">${label}</span><span class="ds-period">${period}</span></div>
        <div class="db2-target-val"><b class="ds-num ${used > 0 ? 'ds-neg' : ''}">${money(used, false)}</b><span class="ds-sub"> of ${money(limit, false)} used</span></div>
        <div class="ds-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${esc(label)} used"><i class="${usedTone(pct)}" style="width:${pct}%"></i></div>
        <div class="ds-sub db2-cap">${pct >= 100 ? '<span class="ds-neg">Limit reached</span>' : `${money(limit - used, false)} room left · ${what}`}</div></div>`);
    };
    lim('Max drawdown', 'now', S().currentDrawdown(all, pnlFor), acc.maxDrawdown, 'from peak');
    lim('Daily loss', 'today', Math.max(0, -all.filter(t => String(t.date).slice(0, 10) === today).reduce((s, t) => s + pnlFor(t), 0)), acc.dailyLossLimit, "today's net loss");
    if (!cards.length) return '';
    const span = cards.length === 1 ? 'ds-span-4 ds-t-3' : cards.length === 2 ? 'ds-span-6 ds-t-3' : cards.length === 3 ? 'ds-span-4 ds-t-3' : cards.length === 4 ? 'ds-span-3 ds-t-3' : 'ds-span-4 ds-t-3';
    return `<section class="ds-section" id="dbTargets">
      ${head('Targets &amp; limits', `${esc(acc.name)} · from account settings`)}
      <div class="ds-grid">${cards.map(c => c.replace('class="ds-card db2-target"', `class="ds-card db2-target ${span}"`)).join('')}</div>
    </section>`;
  }

  // ── render ─────────────────────────────────────────────────────────────────
  function render() {
    renderQueued = false;
    const root = document.getElementById('dbRoot');
    const pageEl = document.getElementById('pageDashboard');
    if (!root || !pageEl || pageEl.classList.contains('hidden') || !S()) return;
    if (K()) K().injectStyles();
    const fpOld = document.getElementById('dbFilterPop');
    const keepFilterOpen = !!fpOld && !fpOld.hidden;

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
    const rangeLabel = ((S().RANGES.find(r => r.id === range) || {}).label || 'All time').toLowerCase();
    const period = `${rangeLabel}${activeFilters() ? ' · filtered' : ''}`;
    const empty = !all.length;
    const accounts = liveAccounts(m);

    root.className = 'db-root ds-page db2';
    root.innerHTML = `
      <div class="db2-top">
        <div class="db2-hello">
          <div class="ds-label">${esc(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</div>
          <h1 class="ds-h1">${greet}${profileName ? `, <b>${esc(profileName)}</b>` : ''}</h1>
        </div>
        <dl class="db2-today" aria-label="Today">
          <div><dt class="ds-label">P&amp;L today</dt><dd class="ds-num ${cls(todayPnl)}">${money(todayPnl)}</dd></div>
          <div><dt class="ds-label">Trades today</dt><dd class="ds-num">${todays.length}</dd></div>
          <div><dt class="ds-label">Wins today</dt><dd class="ds-num">${todays.filter(t => t.result === 'Win').length}</dd></div>
        </dl>
      </div>

      <div class="db2-toolbar">
        <div class="ds-seg db2-modes" role="radiogroup" aria-label="Account mode">${MODES.map(x => `<button type="button" role="radio" data-mode="${x.id}" aria-checked="${x.id === m}">${x.id === 'Real' ? '<span class="ds-dot ds-pos"></span>' : ''}${x.label}</button>`).join('')}</div>
        <div class="db2-tools">
          ${m !== 'Backtest' && accounts.length ? `<select class="ds-select" id="dbAccount" aria-label="Account">${accounts.map(a => `<option value="${esc(a.id)}" ${acc && a.id === acc.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : ''}
          <select class="ds-select db-range" id="dbRange" aria-label="Date range for performance">${S().RANGES.map(r => `<option value="${r.id}" ${r.id === range ? 'selected' : ''}>${r.label}</option>`).join('')}</select>
          <div class="db-filter-wrap">
            <button type="button" class="ds-btn ds-btn-secondary" id="dbFilterBtn" aria-expanded="false" aria-haspopup="dialog"><i class="fa-solid fa-sliders"></i> Filter${activeFilters() ? ` <span class="db2-count">${activeFilters()}</span>` : ''}</button>
            <div class="db-pop db2-pop" id="dbFilterPop" role="dialog" aria-label="Filter trades" hidden>
              ${filterOptions(all)}
              <div class="db-pop-foot"><button type="button" class="ds-btn ds-btn-secondary ds-btn-sm" id="dbFilterClear">Clear</button><button type="button" class="ds-btn ds-btn-primary ds-btn-sm" id="dbFilterClose">Done</button></div>
            </div>
          </div>
        </div>
      </div>

      ${empty ? `<div class="ds-card db2-empty"><i class="fa-solid fa-chart-line"></i><div><b>No trades yet${m === 'Backtest' ? ' in Backtest' : acc ? ` on ${esc(acc.name)}` : ''}.</b><span class="ds-sub">Log your first trade and this dashboard fills in: P&amp;L, win rate, equity curve, calendar and more.</span></div><button type="button" class="ds-btn ds-btn-log" data-go="trading"><i class="fa-solid fa-plus"></i> Log a trade</button></div>` : ''}

      ${nowSection(all, eq)}
      ${targetsSection(all)}

      <section class="ds-section" id="dbPerf">
        ${head('Performance', period)}
        <div class="ds-grid">
          ${stat('Net P&amp;L', money(sum.net), `${plural(sum.trades, 'trade')} · ${esc(period)}`, { valueCls: cls(sum.net) })}
          ${stat('Win rate', `${sum.winRate.toFixed(1)}%`, `<span class="ds-pos">${sum.wins}W</span> · <span class="ds-muted">${sum.breakeven}BE</span> · <span class="ds-neg">${sum.losses}L</span> · ${esc(period)}`, { extra: gauge(sum.wins, sum.breakeven, sum.losses) })}
          ${stat('Profit factor', sum.profitFactor === Infinity ? '∞' : sum.profitFactor.toFixed(2), `Gross ${money(sum.grossProfit, false)} / ${money(Math.abs(sum.grossLoss), false)} · ${esc(period)}`, { valueCls: sum.profitFactor >= 1 ? 'ds-pos' : sum.trades ? 'ds-neg' : '' })}
          ${stat('Risk : reward', sum.riskReward == null ? '—' : `1 : ${sum.riskReward.toFixed(2)}`, `Avg win ${fmtR(sum.avgWinR)} · avg loss ${fmtR(sum.avgLossR)} · ${esc(period)}`)}
          <div class="ds-card ds-span-12 db2-chart-card">
            <div class="db2-stat-top"><span class="ds-label">Net P&amp;L &amp; account equity</span><span class="ds-period">${esc(period)}</span></div>
            <div class="db2-chart">${inRange.length || eq.cash ? '<canvas id="dbChart" aria-label="Daily P&amp;L bars and account equity line"></canvas>' : '<div class="db2-none">No trades in this range.</div>'}</div>
          </div>
        </div>
      </section>

      <div class="ds-grid db2-split">
        <section class="ds-section ds-span-7" id="dbCalSection">
          ${head('Calendar', '', `<div class="db2-cal-nav"><button type="button" class="ds-btn ds-btn-secondary ds-icon-btn" data-cal="-1" aria-label="Previous month"><i class="fa-solid fa-chevron-left"></i></button><span id="dbCalLabel" class="ds-num"></span><button type="button" class="ds-btn ds-btn-secondary ds-icon-btn" data-cal="1" aria-label="Next month"><i class="fa-solid fa-chevron-right"></i></button><button type="button" class="ds-btn ds-btn-secondary ds-btn-sm" data-cal="0">Today</button></div>`)}
          <div class="ds-card db2-cal-card">
            <p class="ds-sub db2-cal-sub" id="dbCalSub"></p>
            <div class="db-cal-scroll"><div id="dbCalendar" class="ob-jh-grid"></div></div>
          </div>
        </section>
        <section class="ds-section ds-span-5" id="dbRecentSection">
          ${head('Recent trades', esc(period))}
          <div class="ds-card db2-recent-card"><div id="dbRecent"></div></div>
        </section>
      </div>

      <section class="ds-section" id="dbActSection">
        ${head('Trading activity', `last ${K() ? K().weeks : 26} weeks · daily P&amp;L${activeFilters() ? ' · filtered' : ''}`)}
        <div class="ds-card ob-act-card" id="dbActivity">
          <div class="db2-act-legend"><div class="ob-act-legend" aria-hidden="true">${K() ? K().legendHtml() : ''}</div></div>
          <div class="ob-act-scroll"><div class="ob-act-wrap" id="dbActBody"></div></div>
          <div class="ob-act-summary db-act-summary" id="dbActSummary"></div>
        </div>
      </section>`;

    bind(root, all);
    renderCalendar(filtered);
    renderActivity(filtered);
    renderRecent(inRange);
    if (inRange.length || eq.cash) drawChart(inRange, all, bounds);
    else destroyChart();
    if (keepFilterOpen) { const p = document.getElementById('dbFilterPop'); if (p) { p.hidden = false; document.getElementById('dbFilterBtn').setAttribute('aria-expanded', 'true'); } }
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
    document.getElementById('dbCalSub').innerHTML = `<b class="ds-num ${cls(total)}">${money(total)}</b> · ${plural(n, 'trade')} in ${esc(label)} · ${touch() ? 'tap a day' : 'hover a day and press +'} to add a trade`;
  }

  function renderActivity(filtered) {
    if (!K()) return;
    const out = K().activityHtml(K().dailyStatsFor(filtered), () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - (K().weeks - 1) * 7);
      const startIso = K().isoOf(start.getFullYear(), start.getMonth(), start.getDate());
      const s = S().summary(filtered.filter(t => String(t.date).slice(0, 10) >= startIso), pnlFor);
      return `<span>Net P&amp;L <b class="${cls(s.net)}">${money(s.net)}</b></span><span>Gross profit <b class="ds-pos">${money(s.grossProfit)}</b></span><span>Gross loss <b class="ds-neg">${money(s.grossLoss)}</b></span>` +
        `<span>Most traded <b>${s.mostTradedPair ? `${esc(s.mostTradedPair.pair)} (${s.mostTradedPair.trades})` : '—'}</b></span>` +
        `<span>Best trade <b class="ds-pos">${s.best && s.best.pnl > 0 ? `${money(s.best.pnl)} ${esc(s.best.trade.pair)}` : '—'}</b></span>` +
        `<span>Worst trade <b class="ds-neg">${s.worst && s.worst.pnl < 0 ? `${money(s.worst.pnl)} ${esc(s.worst.trade.pair)}` : '—'}</b></span>`;
    });
    document.getElementById('dbActBody').innerHTML = out.body;
    document.getElementById('dbActSummary').innerHTML = out.summary;
    const card = document.getElementById('dbActivity');
    const sc = card && card.querySelector('.ob-act-scroll');
    if (sc) {
      // Cells grow with the available width (14–24px) so the heatmap fills the row on wide screens.
      const weeks = K().weeks || 26;
      const cell = Math.max(14, Math.min(24, Math.floor((sc.clientWidth - 48) / weeks) - 4));
      card.style.setProperty('--act-cell', cell + 'px');
      sc.scrollLeft = sc.scrollWidth; // newest weeks first on narrow screens
    }
  }

  function renderRecent(list) {
    const box = document.getElementById('dbRecent');
    if (!box) return;
    const sorted = list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    if (page >= pages) page = pages - 1;
    const rows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    if (!rows.length) { box.innerHTML = '<div class="db2-none">No trades in this range.</div>'; return; }
    box.innerHTML = `<ul class="db2-trades">${rows.map(t => {
      const p = pnlFor(t); const short = t.direction === 'SHORT';
      const res = String(t.result || '');
      return `<li><button type="button" class="db2-trade" data-id="${esc(t.id)}" aria-label="Open trade ${esc(t.pair)} ${esc(fmtDate(String(t.date).slice(0, 10)))}">
        <span class="db2-side ${short ? 'short' : 'long'}">${short ? 'Short' : 'Long'}</span>
        <span class="db2-tmain"><b>${esc(t.pair || '—')}</b><small>${esc(fmtDate(String(t.date).slice(0, 10)))} · ${esc(t.strategy || '—')}</small></span>
        <span class="db2-tres"><b class="ds-num ${cls(p)}">${money(p)}</b><small><span class="${cls(t.rMultiple)}">${fmtR(t.rMultiple)}</span> · ${esc(res === 'BE' ? 'Breakeven' : res || '—')}</small></span>
      </button></li>`; }).join('')}</ul>
      <div class="db2-pager"><span class="ds-sub">${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + rows.length} of ${sorted.length}</span>
        <div><button type="button" class="ds-btn ds-btn-secondary ds-icon-btn" data-pg="-1" ${page === 0 ? 'disabled' : ''} aria-label="Previous page"><i class="fa-solid fa-chevron-left"></i></button>
        <button type="button" class="ds-btn ds-btn-secondary ds-icon-btn" data-pg="1" ${page >= pages - 1 ? 'disabled' : ''} aria-label="Next page"><i class="fa-solid fa-chevron-right"></i></button></div></div>`;
    box.querySelectorAll('[data-pg]').forEach(b => b.addEventListener('click', () => { page += Number(b.dataset.pg); renderRecent(list); }));
    box.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => { if (typeof window.openDrawer === 'function') window.openDrawer(b.dataset.id); }));
  }

  function destroyChart() { try { chart && chart.destroy(); } catch (_) {} chart = null; }
  function cssVar(n, f) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f; }
  function drawChart(inRange, all, [from, to]) {
    destroyChart();
    const canvas = document.getElementById('dbChart');
    if (!canvas || !window.Chart) return;
    const daily = S().daily(inRange, pnlFor);
    const pts = equitySeries(all);
    const eqByDay = {};
    const startEq = pts.length ? pts[0].equity : 0;
    pts.forEach(p => { if (p.date) eqByDay[p.date] = p.equity; });
    const days = [...new Set([...Object.keys(daily), ...Object.keys(eqByDay).filter(d => (!from || d >= from) && (!to || d <= to))])].sort();
    const eqLine = [];
    let last = startEq;
    const before = Object.keys(eqByDay).filter(d => from && d < from).sort();
    if (before.length) last = eqByDay[before[before.length - 1]];
    days.forEach(d => { if (eqByDay[d] != null) last = eqByDay[d]; eqLine.push(Math.round(last * 100) / 100); });
    const pos = cssVar('--ds-chart-pos', 'rgba(34,160,92,.78)'), neg = cssVar('--ds-chart-neg', 'rgba(226,92,92,.78)'), line = cssVar('--ds-chart-line', '#3b82f6');
    chart = new Chart(canvas.getContext('2d'), {
      data: {
        labels: days.map(d => fmtDate(d)),
        datasets: [
          { type: 'bar', label: 'Daily P&L', data: days.map(d => Math.round(((daily[d] || {}).pnl || 0) * 100) / 100), backgroundColor: days.map(d => ((daily[d] || {}).pnl || 0) >= 0 ? pos : neg), borderRadius: 3, yAxisID: 'y', order: 2, maxBarThickness: 14 },
          { type: 'line', label: 'Account equity', data: eqLine, borderColor: line, fill: 'start', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, cubicInterpolationMode: 'monotone', yAxisID: 'y1', order: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 11 } } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y, c.datasetIndex === 0)}` } } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7, font: { size: 10 } } },
          y: { position: 'left', border: { display: false }, ticks: { maxTicksLimit: 6, callback: v => `${sym()}${Number(v).toLocaleString('en-US')}`, font: { family: 'JetBrains Mono', size: 10 } } },
          y1: { position: 'right', border: { display: false }, grid: { drawOnChartArea: false }, ticks: { maxTicksLimit: 6, callback: v => `${sym()}${Number(v).toLocaleString('en-US')}`, font: { family: 'JetBrains Mono', size: 10 } } }
        }
      }
    });
  }

  function bind(root, all) {
    root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.mode !== mode() && typeof window.switchMode === 'function') { page = 0; discipline = null; window.switchMode(b.dataset.mode); }
    }));
    root.querySelector('#dbAccount')?.addEventListener('change', e => {
      try { localStorage.setItem(`my_journal_active_account_${mode()}_v1`, e.target.value); } catch (_) {}
      window.dispatchEvent(new CustomEvent('wallet-accounts-updated'));
      page = 0; discipline = null;
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
    wrap('switchTab', ([tab]) => { if (tab === 'dashboard') { loadName(); queue(); if (window.obDisciplineRefresh) window.obDisciplineRefresh(); } });
    wrap('switchMode', () => queue());
    wrap('renderAll', () => queue());
    [400, 1200].forEach(ms => setTimeout(() => { wrap('renderAll', () => queue()); wrap('switchMode', () => queue()); }, ms));
    window.addEventListener('wallet-accounts-updated', queue);
    window.addEventListener('ob-theme-change', queue);
    window.addEventListener('ob-discipline-state', e => {
      const prev = discipline ? JSON.stringify(discipline) : '';
      discipline = e.detail || null;
      if (JSON.stringify(discipline) !== prev) queue();
    });
    document.addEventListener('click', () => { const p = document.getElementById('dbFilterPop'); if (p && !p.hidden) { p.hidden = true; document.getElementById('dbFilterBtn')?.setAttribute('aria-expanded', 'false'); } });
    new MutationObserver(() => queue()).observe(document.getElementById('pageDashboard'), { attributes: true, attributeFilter: ['class'] });
    loadName();
    [300, 1200, 2500].forEach(ms => setTimeout(queue, ms)); // trades/accounts arrive asynchronously
  }
  if (document.readyState === 'complete') setTimeout(boot, 0);
  else window.addEventListener('load', () => setTimeout(boot, 0), { once: true });
})();
