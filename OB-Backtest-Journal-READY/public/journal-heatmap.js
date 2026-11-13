(() => {
  // P&L calendar (Trading page) + Trading Activity heatmap.
  // Dollar values: R × account starting balance × risk % — the same
  // calculation the account balance display uses, so the numbers agree.
  const GRID_ID = 'calendarHeatmapGrid';
  const STYLE_ID = 'journal-pnl-heatmap-style-v3';
  const ACTIVITY_ID = 'ob-activity-card';
  const ACTIVITY_WEEKS = 26;
  let viewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let booted = false;

  const getMode = () => { try { return typeof activeMode !== 'undefined' ? activeMode : 'Demo'; } catch (_) { return 'Demo'; } };
  const getTrades = () => { try { return Array.isArray(trades) ? trades : []; } catch (_) { return []; } };
  const getAccounts = () => { try { return JSON.parse(localStorage.getItem('my_journal_accounts_v1') || '{}'); } catch (_) { return {}; } };
  const getAccountId = mode => mode === 'Backtest' ? null : (localStorage.getItem(`my_journal_active_account_${mode}_v1`) || null);
  const getRisk = () => { try { return Number(riskPercent) || 1; } catch (_) { return 1; } };
  const getCapital = () => { try { return Number(initialCapital) || 100000; } catch (_) { return 100000; } };
  const baseFor = trade => {
    if (trade.mode === 'Backtest') return getCapital();
    const list = Array.isArray(getAccounts()[trade.mode]) ? getAccounts()[trade.mode] : [];
    const account = list.find(a => a.id === trade.accountId);
    return Number(account?.startingBalance ?? account?.balance ?? 100000) || 100000;
  };
  const pnlFor = trade => Number(trade.rMultiple || 0) * baseFor(trade) * (getRisk() / 100);
  const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const todayIso = () => { const n = new Date(); return isoOf(n.getFullYear(), n.getMonth(), n.getDate()); };
  const money = value => !value ? '$0' : `${value > 0 ? '+' : '-'}$${Math.abs(Math.round(value)).toLocaleString('en-US')}`;
  // Compact form for narrow screens: +$2.4k, -$1k, +$850
  const short = value => {
    if (!value) return '$0';
    const a = Math.abs(value);
    const t = a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(Math.round(a));
    return (value > 0 ? '+$' : '-$') + t;
  };
  const pnlHtml = value => `<span class="ob-jh-full">${money(value)}</span><span class="ob-jh-short">${short(value)}</span>`;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root, html[data-theme="light"] {
        --cal-cell-bg: #ffffff; --cal-cell-border: #e7e7e9; --cal-muted: #94a3b8; --cal-text: #101729;
        --cal-win-bg: rgba(22,163,74,.07); --cal-win-border: rgba(22,163,74,.45); --cal-win-text: #16a34a;
        --cal-loss-bg: rgba(239,68,68,.07); --cal-loss-border: rgba(239,68,68,.45); --cal-loss-text: #ef4444;
        --cal-today: #3b82f6; --cal-week-bg: #fafafa;
        --act-empty: #f1f5f9;
        --act-p1: rgba(22,163,74,.22); --act-p2: rgba(22,163,74,.4); --act-p3: rgba(22,163,74,.6); --act-p4: rgba(22,163,74,.8); --act-p5: #16a34a;
        --act-l1: rgba(239,68,68,.22); --act-l2: rgba(239,68,68,.4); --act-l3: rgba(239,68,68,.6); --act-l4: rgba(239,68,68,.8); --act-l5: #dc2626;
      }
      html[data-theme="dark"] {
        --cal-cell-bg: #0f0f0f; --cal-cell-border: #262626; --cal-muted: #7c8596; --cal-text: #fafafa;
        --cal-win-bg: rgba(34,197,94,.1); --cal-win-border: rgba(34,197,94,.5); --cal-win-text: #22c55e;
        --cal-loss-bg: rgba(239,68,68,.1); --cal-loss-border: rgba(239,68,68,.5); --cal-loss-text: #ef4444;
        --cal-today: #3b82f6; --cal-week-bg: #171717;
        --act-empty: #1c1c1c;
        --act-p1: rgba(34,197,94,.2); --act-p2: rgba(34,197,94,.38); --act-p3: rgba(34,197,94,.56); --act-p4: rgba(34,197,94,.76); --act-p5: #22c55e;
        --act-l1: rgba(239,68,68,.2); --act-l2: rgba(239,68,68,.38); --act-l3: rgba(239,68,68,.56); --act-l4: rgba(239,68,68,.76); --act-l5: #ef4444;
      }
      .ob-jh-grid.ob-jh-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr)) minmax(0,1.05fr);gap:6px}
      .ob-jh-grid .ob-jh-head{padding:4px 3px 6px;text-align:center;font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--cal-muted)}
      .ob-jh-grid .ob-jh-cell{position:relative;min-height:70px;padding:7px 8px;border:1px solid var(--cal-cell-border);background:var(--cal-cell-bg);border-radius:12px;display:flex;flex-direction:column;justify-content:space-between;transition:border-color .15s}
      .ob-jh-grid .ob-jh-blank{min-height:70px;border-radius:12px;border:1px dashed transparent}
      .ob-jh-grid .ob-jh-day{font:700 10px 'JetBrains Mono',monospace;color:var(--cal-muted)}
      .ob-jh-grid .ob-jh-pnl{font:800 12px 'JetBrains Mono',monospace;color:var(--cal-text)}
      .ob-jh-grid .ob-jh-count{font:800 8.5px Inter,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--cal-muted)}
      .ob-jh-grid .ob-jh-flat .ob-jh-pnl{color:var(--cal-muted);font-weight:700}
      .ob-jh-grid .ob-jh-win{background:var(--cal-win-bg);border-color:var(--cal-win-border)}
      .ob-jh-grid .ob-jh-win .ob-jh-pnl{color:var(--cal-win-text)}
      .ob-jh-grid .ob-jh-loss{background:var(--cal-loss-bg);border-color:var(--cal-loss-border)}
      .ob-jh-grid .ob-jh-loss .ob-jh-pnl{color:var(--cal-loss-text)}
      .ob-jh-grid .ob-jh-today{border-color:var(--cal-today);box-shadow:0 0 0 1px var(--cal-today) inset}
      .ob-jh-grid .ob-jh-today .ob-jh-day{color:var(--cal-today)}
      .ob-jh-grid .ob-jh-week{min-height:70px;padding:7px 8px;border:1px solid var(--cal-cell-border);background:var(--cal-week-bg);border-radius:12px;display:flex;flex-direction:column;justify-content:space-between}
      .ob-jh-grid .ob-jh-week.ob-jh-win{background:var(--cal-win-bg);border-color:var(--cal-win-border)}
      .ob-jh-grid .ob-jh-week.ob-jh-loss{background:var(--cal-loss-bg);border-color:var(--cal-loss-border)}
      .ob-jh-grid .ob-jh-week-label{font-size:9px;color:var(--cal-muted);font-weight:800;letter-spacing:.06em;text-transform:uppercase}
      .ob-jh-grid .ob-jh-week-pnl{font:800 12px 'JetBrains Mono',monospace;color:var(--cal-muted)}
      .ob-jh-grid .ob-jh-week.ob-jh-win .ob-jh-week-pnl{color:var(--cal-win-text)}
      .ob-jh-grid .ob-jh-week.ob-jh-loss .ob-jh-week-pnl{color:var(--cal-loss-text)}
      .ob-jh-grid .ob-jh-week-count{font:800 8.5px Inter,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--cal-muted)}
      .ob-jh-grid .ob-jh-short{display:none}
      .ob-jh-nav{width:27px;height:27px;border:1px solid var(--cal-cell-border);border-radius:9999px;background:var(--cal-cell-bg);color:var(--cal-muted);display:grid;place-items:center;cursor:pointer}
      .ob-jh-nav:hover{color:var(--blue,#3b82f6);border-color:var(--blue,#3b82f6)}
      @media(max-width:700px){
        .ob-jh-grid.ob-jh-grid{grid-template-columns:repeat(7,minmax(0,1fr)) minmax(0,1.15fr);gap:3px}
        .ob-jh-grid .ob-jh-head{font-size:8px;letter-spacing:0;padding:2px 0 4px}
        .ob-jh-grid .ob-jh-cell,.ob-jh-grid .ob-jh-week,.ob-jh-grid .ob-jh-blank{min-height:52px;padding:4px 3px;border-radius:9px}
        .ob-jh-grid .ob-jh-pnl,.ob-jh-grid .ob-jh-week-pnl{font-size:8.5px;letter-spacing:-.02em;white-space:nowrap;overflow:hidden}
        .ob-jh-grid .ob-jh-count,.ob-jh-grid .ob-jh-week-count,.ob-jh-grid .ob-jh-week-label{font-size:7px;letter-spacing:0;white-space:nowrap}
        .ob-jh-grid .ob-jh-none .ob-jh-count,.ob-jh-grid .ob-jh-none .ob-jh-pnl{visibility:hidden}
        .ob-jh-grid .ob-jh-full{display:none} .ob-jh-grid .ob-jh-short{display:inline}
      }

      /* Trading Activity heatmap */
      .ob-act-card .ob-act-scroll{overflow-x:auto;padding-bottom:4px}
      .ob-act-card .ob-act-wrap{display:inline-grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:start}
      .ob-act-card .ob-act-months{display:grid;grid-auto-flow:column;grid-auto-columns:14px;gap:3px;font:700 9.5px Inter,system-ui,sans-serif;color:var(--cal-muted);height:14px;white-space:nowrap}
      .ob-act-card .ob-act-days{display:grid;grid-template-rows:repeat(7,14px);gap:3px;font:700 9px Inter,system-ui,sans-serif;color:var(--cal-muted);line-height:14px}
      .ob-act-card .ob-act-grid{display:grid;grid-template-rows:repeat(7,14px);grid-auto-flow:column;grid-auto-columns:14px;gap:3px}
      .ob-act-card .ob-act-sq{width:14px;height:14px;border-radius:4px;background:var(--act-empty)}
      .ob-act-card .ob-act-sq.ob-act-out{background:transparent}
      .ob-act-card .ob-act-sq.ob-act-today{outline:1.5px solid var(--cal-today);outline-offset:1px}
      ${[1, 2, 3, 4, 5].map(i => `.ob-act-card .ob-act-p${i}{background:var(--act-p${i})} .ob-act-card .ob-act-l${i}{background:var(--act-l${i})}`).join('\n      ')}
      .ob-act-card .ob-act-legend{display:flex;align-items:center;gap:3px;font:700 10px Inter,system-ui,sans-serif;color:var(--cal-muted)}
      .ob-act-card .ob-act-legend .ob-act-sq{width:12px;height:12px;border-radius:3px}
      .ob-act-card .ob-act-summary{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:11px;color:var(--cal-muted)}
      .ob-act-card .ob-act-summary b{font-family:'JetBrains Mono',monospace;color:var(--cal-text)}
    `;
    document.head.appendChild(style);
  }

  function relevantTrades() {
    const mode = getMode();
    const accountId = getAccountId(mode);
    return getTrades().filter(t => t.mode === mode && (mode === 'Backtest' || !accountId || t.accountId === accountId));
  }

  function dailyStats() {
    const stats = {};
    relevantTrades().forEach(t => {
      const iso = String(t.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      if (!stats[iso]) stats[iso] = { pnl: 0, count: 0 };
      stats[iso].pnl += pnlFor(t);
      stats[iso].count++;
    });
    return stats;
  }

  function render() {
    const grid = document.getElementById(GRID_ID);
    const page = document.getElementById('pageTrading');
    if (!grid || !page) return;
    injectStyles();

    const card = grid.closest('.glass-card');
    if (card) card.style.display = '';

    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const first = new Date(y, m, 1).getDay();
    const all = dailyStats();
    const stats = {};
    for (let d = 1; d <= days; d++) { const s = all[isoOf(y, m, d)]; if (s) stats[d] = s; }
    const monthName = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const values = Object.values(stats);
    const total = values.reduce((sum, x) => sum + x.pnl, 0);
    const count = values.reduce((sum, x) => sum + x.count, 0);

    const label = document.getElementById('heatmapMonthLabel');
    if (label) {
      label.textContent = `P&L Calendar Heatmap (${monthName})`;
      const controls = label.closest('.border-b')?.querySelector('.flex.items-center.gap-2.text-xs');
      if (controls && !controls.querySelector('[data-ob-jh-prev]')) {
        controls.innerHTML = `<button type="button" class="ob-jh-nav" data-ob-jh-prev aria-label="Previous month"><i class="fa-solid fa-chevron-left text-[9px]"></i></button><span class="font-mono text-[10px] text-slate-500 min-w-[96px] text-center">${monthName}</span><button type="button" class="ob-jh-nav" data-ob-jh-next aria-label="Next month"><i class="fa-solid fa-chevron-right text-[9px]"></i></button><button type="button" class="px-2.5 py-1.5 rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-500" data-ob-jh-today>This month</button>`;
        controls.querySelector('[data-ob-jh-prev]').onclick = () => { viewDate.setMonth(viewDate.getMonth() - 1); render(); };
        controls.querySelector('[data-ob-jh-next]').onclick = () => { viewDate.setMonth(viewDate.getMonth() + 1); render(); };
        controls.querySelector('[data-ob-jh-today]').onclick = () => { const n = new Date(); viewDate = new Date(n.getFullYear(), n.getMonth(), 1); render(); };
      } else if (controls) {
        const span = controls.querySelector('span'); if (span) span.textContent = monthName;
      }
    }

    grid.classList.add('ob-jh-grid');
    grid.innerHTML = monthGridHtml(all, y, m);
    // Day "+" (shown on hover): one combined panel for a new trade on that date.
    wireAdd(grid);

    const subtitle = card?.querySelector('p');
    if (subtitle) subtitle.textContent = `${count} trades • Monthly P&L ${money(total)} • account/mode filtered`;

    renderActivity(all);
  }

  function wireAdd(grid) {
    if (grid.__obAddWired) return;
    grid.__obAddWired = true;
    grid.addEventListener('click', e => {
      if (typeof window.obAddTradeOnDate !== 'function') return;
      const b = e.target.closest('[data-add-date]');
      // Touch screens: the "+" is too small to hit, so a tap anywhere on the
      // day opens the same combined panel.
      const cell = !b && window.matchMedia('(hover: none)').matches ? e.target.closest('.ob-jh-cell[data-date]') : null;
      if (!b && !cell) return;
      e.stopPropagation();
      window.obAddTradeOnDate(b ? b.dataset.addDate : cell.dataset.date);
    });
  }

  /** Month grid markup. all: { 'YYYY-MM-DD': { pnl, count } }. */
  function monthGridHtml(all, y, m) {
    const days = new Date(y, m + 1, 0).getDate();
    const first = new Date(y, m, 1).getDay();
    const stats = {};
    for (let d = 1; d <= days; d++) { const s = all[isoOf(y, m, d)]; if (s) stats[d] = s; }
    const today = todayIso();
    const cls = pnl => pnl > 0 ? 'ob-jh-win' : pnl < 0 ? 'ob-jh-loss' : 'ob-jh-flat';
    // Phones show the short labels (.ob-jh-short), wider screens the full ones.
    let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => `<div class="ob-jh-head"><span class="ob-jh-full">${day}</span><span class="ob-jh-short" aria-hidden="true">${day.charAt(0)}</span></div>`).join('') + '<div class="ob-jh-head"><span class="ob-jh-full">Week</span><span class="ob-jh-short" aria-hidden="true">Wk</span></div>';
    const rows = Math.ceil((first + days) / 7);
    for (let row = 0; row < rows; row++) {
      let wp = 0, wt = 0;
      for (let col = 0; col < 7; col++) {
        const d = row * 7 + col - first + 1;
        if (d < 1 || d > days) { html += '<div class="ob-jh-blank" aria-hidden="true"></div>'; continue; }
        const s = stats[d] || { pnl: 0, count: 0 };
        wp += s.pnl; wt += s.count;
        const iso = isoOf(y, m, d);
        const todayCls = iso === today ? ' ob-jh-today' : '';
        html += `<div class="ob-jh-cell ${s.count ? cls(s.pnl) : 'ob-jh-flat ob-jh-none'}${todayCls}" data-date="${iso}"><button type="button" class="ob-jh-add" data-add-date="${iso}" title="Add Trade" aria-label="Add trade on ${iso}">+</button><div class="ob-jh-day">${d}</div><div class="ob-jh-pnl">${s.count ? pnlHtml(s.pnl) : '$0'}</div><div class="ob-jh-count"><span class="ob-jh-full">${s.count ? `${s.count} trade${s.count === 1 ? '' : 's'}` : 'No trades'}</span><span class="ob-jh-short">${s.count ? `${s.count}T` : ''}</span></div></div>`;
      }
      html += `<div class="ob-jh-week ${wt ? cls(wp) : ''}"><div class="ob-jh-week-label"><span class="ob-jh-full">Week ${row + 1}</span><span class="ob-jh-short">W${row + 1}</span></div><div class="ob-jh-week-pnl">${pnlHtml(wp)}</div><div class="ob-jh-week-count"><span class="ob-jh-full">${wt} trade${wt === 1 ? '' : 's'}</span><span class="ob-jh-short">${wt}T</span></div></div>`;
    }
    return html;
  }

  // ── Trading Activity: last 26 weeks, one rounded square per day,
  //    5 levels for profit and 5 for loss (scaled to the biggest day). ──
  function ensureActivityCard() {
    let card = document.getElementById(ACTIVITY_ID);
    if (card) return card;
    const grid = document.getElementById(GRID_ID);
    const anchor = document.getElementById('ob-trading-pnl-account-row') || grid?.closest('.glass-card');
    if (!anchor || !anchor.parentNode) return null;
    card = document.createElement('div');
    card.id = ACTIVITY_ID;
    card.className = 'glass-card p-5 space-y-4 ob-act-card';
    card.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2"><i class="fa-solid fa-table-cells text-blue-600"></i>Trading Activity</h3>
          <p class="text-xs text-slate-400 mt-0.5">Last ${ACTIVITY_WEEKS} weeks • account/mode filtered</p>
        </div>
        <div class="ob-act-legend" aria-hidden="true"><span>Loss</span>${[5, 4, 3, 2, 1].map(i => `<span class="ob-act-sq ob-act-l${i}"></span>`).join('')}<span class="ob-act-sq"></span>${[1, 2, 3, 4, 5].map(i => `<span class="ob-act-sq ob-act-p${i}"></span>`).join('')}<span>Profit</span></div>
      </div>
      <div class="ob-act-scroll"><div class="ob-act-wrap" data-act-body></div></div>
      <div class="ob-act-summary" data-act-summary></div>`;
    anchor.parentNode.insertBefore(card, anchor.nextSibling);
    return card;
  }

  function renderActivity(all) {
    const card = ensureActivityCard();
    if (!card) return;
    const out = activityHtml(all);
    card.querySelector('[data-act-body]').innerHTML = out.body;
    card.querySelector('[data-act-summary]').innerHTML = out.summary;
  }

  /** Activity squares + summary markup for the last ACTIVITY_WEEKS weeks. extra: optional summary items. */
  function activityHtml(all, extra) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end);
    start.setDate(start.getDate() - end.getDay() - (ACTIVITY_WEEKS - 1) * 7); // a Sunday, 26 weeks back
    const inRange = Object.entries(all).filter(([iso]) => { const d = new Date(iso + 'T00:00:00'); return d >= start && d <= end; });
    const max = Math.max(0, ...inRange.map(([, s]) => Math.abs(s.pnl)));
    const level = pnl => !pnl || !max ? 0 : Math.min(5, Math.max(1, Math.ceil((Math.abs(pnl) / max) * 5)));
    const today = todayIso();
    let squares = '', months = '', lastMonth = -1;
    for (let w = 0; w < ACTIVITY_WEEKS; w++) {
      const weekStart = new Date(start); weekStart.setDate(start.getDate() + w * 7);
      const mo = weekStart.getMonth();
      months += `<span>${mo !== lastMonth ? weekStart.toLocaleDateString('en-US', { month: 'short' }) : ''}</span>`;
      lastMonth = mo;
      for (let d = 0; d < 7; d++) {
        const day = new Date(weekStart); day.setDate(weekStart.getDate() + d);
        const iso = isoOf(day.getFullYear(), day.getMonth(), day.getDate());
        if (day > end) { squares += '<span class="ob-act-sq ob-act-out"></span>'; continue; }
        const s = all[iso];
        let cls = 'ob-act-sq';
        let title = `${iso}: no trades`;
        if (s) {
          const lv = level(s.pnl);
          if (s.pnl > 0) cls += ` ob-act-p${lv}`; else if (s.pnl < 0) cls += ` ob-act-l${lv}`;
          title = `${iso}: ${money(s.pnl)} • ${s.count} trade${s.count === 1 ? '' : 's'}`;
        }
        if (iso === today) cls += ' ob-act-today';
        squares += `<span class="${cls}" title="${title}"></span>`;
      }
    }
    const body = `<span></span><div class="ob-act-months">${months}</div>
      <div class="ob-act-days"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div>
      <div class="ob-act-grid" role="img" aria-label="Daily P&amp;L for the last ${ACTIVITY_WEEKS} weeks">${squares}</div>`;
    const net = inRange.reduce((a, [, s]) => a + s.pnl, 0);
    const gross = inRange.reduce((a, [, s]) => a + Math.max(0, s.pnl), 0);
    const loss = inRange.reduce((a, [, s]) => a + Math.min(0, s.pnl), 0);
    const n = inRange.reduce((a, [, s]) => a + s.count, 0);
    const best = inRange.reduce((b, [iso, s]) => (!b || s.pnl > b.pnl ? { iso, pnl: s.pnl } : b), null);
    const worst = inRange.reduce((b, [iso, s]) => (!b || s.pnl < b.pnl ? { iso, pnl: s.pnl } : b), null);
    const summary = n
      ? (typeof extra === 'function' ? extra({ net, gross, loss, n, best, worst, money }) : `<span>Net P&amp;L <b>${money(net)}</b></span><span>Gross profit <b>${money(gross)}</b></span><span>Gross loss <b>${money(loss)}</b></span><span>Trades <b>${n}</b></span><span>Best day <b>${money(best.pnl)}</b></span><span>Worst day <b>${money(worst.pnl)}</b></span>`)
      : `<span>No trades in the last ${ACTIVITY_WEEKS} weeks for this account.</span>`;
    return { body, summary };
  }
  const LEGEND_HTML = `<span>Loss</span>${[5, 4, 3, 2, 1].map(i => `<span class="ob-act-sq ob-act-l${i}"></span>`).join('')}<span class="ob-act-sq"></span>${[1, 2, 3, 4, 5].map(i => `<span class="ob-act-sq ob-act-p${i}"></span>`).join('')}<span>Profit</span>`;

  function removeExtraHeatmaps() {
    document.querySelectorAll('#pageAnalytics .glass-card').forEach(card => {
      const text = card.textContent.toLowerCase();
      if (text.includes('full monthly performance heatmap')) card.style.display = 'none';
    });
    document.getElementById('journalPnlHeatmap')?.remove();
  }

  function patchNavigation(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.__obHeatmapPatched) return;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      setTimeout(() => { removeExtraHeatmaps(); render(); }, 40);
      return result;
    };
    wrapped.__obHeatmapPatched = true;
    window[name] = wrapped;
  }

  function boot() {
    if (booted) return;
    booted = true;
    removeExtraHeatmaps();
    render();
    patchNavigation('switchTab');
    patchNavigation('switchMode');
    // The page redraws the calendar grid after saves/deletes (renderAll → renderHeatmaps):
    // re-apply this calendar (and its day "+" buttons) afterwards.
    patchNavigation('renderHeatmaps');
    [300, 1000, 2500].forEach(ms => setTimeout(() => patchNavigation('renderHeatmaps'), ms));
    window.addEventListener('wallet-accounts-updated', () => setTimeout(render, 50));
    window.addEventListener('resize', () => setTimeout(render, 20));
  }

  window.obRenderCalendar = () => render();
  // Reused by the Dashboard (dashboard.js): same markup, styles and $ maths.
  window.obCalendarKit = {
    injectStyles, monthGridHtml, activityHtml, wireAdd, pnlFor, isoOf, todayIso, money,
    legendHtml: () => LEGEND_HTML, weeks: ACTIVITY_WEEKS,
    dailyStatsFor(list) {
      const stats = {};
      (list || []).forEach(t => {
        const iso = String(t.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
        if (!stats[iso]) stats[iso] = { pnl: 0, count: 0 };
        stats[iso].pnl += pnlFor(t);
        stats[iso].count++;
      });
      return stats;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
