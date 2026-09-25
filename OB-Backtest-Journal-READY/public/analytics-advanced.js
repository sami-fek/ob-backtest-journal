/**
 * analytics-advanced.js
 * Advanced Analytics filters + R Progression chart + Session breakdown
 * + Strategy Comparison table for MY Journal.
 *
 * Adds to #pageAnalytics:
 *  - Combined filter bar (pair, session, day-of-week, TF, regime, date range)
 *  - R Progression line chart (filtered, account-scoped)
 *  - Net R by Session bar chart
 *  - Strategy Comparison table (win rate, net R, expectancy, profit factor, max streak, trades)
 *
 * Patches renderAnalyticsKPIs and updateCharts to scope to the active filters.
 * Never removes or replaces existing Analytics content.
 */
(() => {
  const STYLE_ID   = 'ob-analytics-advanced-style-v1';
  const FILTER_ID  = 'ob-analytics-filter-bar';
  const EXTRA_ID   = 'ob-analytics-extra-section';

  let chartRProgression = null;
  let chartSessionNet   = null;
  let booted = false;

  // ─── helpers ────────────────────────────────────────────────────────────────

  function allTrades()  { try { return Array.isArray(window.trades) ? window.trades : []; } catch (_) { return []; } }
  function getMode()    { try { return typeof window.activeMode !== 'undefined' ? window.activeMode : 'Demo'; } catch (_) { return 'Demo'; } }
  function accountId()  {
    const mode = getMode();
    if (mode === 'Backtest') return null;
    return localStorage.getItem(`my_journal_active_account_${mode}_v1`) || null;
  }

  /** Trades scoped to the current mode+account (same logic as ui-rules.js) */
  function scopedTrades() {
    const mode = getMode();
    const aid  = accountId();
    return allTrades().filter(t => {
      if (t.mode !== mode) return false;
      if (mode === 'Backtest') return true;
      return !aid || !t.accountId || t.accountId === aid;
    });
  }

  /** Day-of-week name from a YYYY-MM-DD string */
  function dayName(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00Z');
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()] || '';
  }

  /** Read all active filter values from the filter bar */
  function readFilters() {
    return {
      pair:      document.getElementById('af-pair')?.value    || 'ALL',
      session:   document.getElementById('af-session')?.value || 'ALL',
      day:       document.getElementById('af-day')?.value     || 'ALL',
      tf:        document.getElementById('af-tf')?.value      || 'ALL',
      regime:    document.getElementById('af-regime')?.value  || 'ALL',
      dateFrom:  document.getElementById('af-from')?.value    || '',
      dateTo:    document.getElementById('af-to')?.value      || '',
    };
  }

  /** Apply active filters to a trade list */
  function applyFilters(list) {
    const f = readFilters();
    return list.filter(t => {
      if (f.pair    !== 'ALL' && t.pair           !== f.pair)    return false;
      if (f.session !== 'ALL' && (t.session || '') !== f.session) return false;
      if (f.day     !== 'ALL' && dayName(t.date)   !== f.day)    return false;
      if (f.tf      !== 'ALL' && t.timeframe        !== f.tf)     return false;
      if (f.regime  !== 'ALL' && t.regime           !== f.regime) return false;
      if (f.dateFrom && t.date < f.dateFrom) return false;
      if (f.dateTo   && t.date > f.dateTo)   return false;
      return true;
    });
  }

  /** The final trade list that all analytics computations use */
  function filteredTrades() {
    return applyFilters(scopedTrades());
  }

  // ─── styles ─────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${FILTER_ID} {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 10px;
        padding: 14px 16px;
        background: rgba(255,255,255,.92);
        backdrop-filter: blur(12px);
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        margin-bottom: 0;
      }
      #${FILTER_ID} .af-group {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      #${FILTER_ID} label {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: #94a3b8;
      }
      #${FILTER_ID} select,
      #${FILTER_ID} input[type="date"] {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 6px 10px;
        font-size: 11px;
        color: #334155;
        outline: none;
        height: 32px;
        min-width: 90px;
        transition: border-color .15s;
      }
      #${FILTER_ID} select:focus,
      #${FILTER_ID} input[type="date"]:focus { border-color: #60a5fa; }
      #${FILTER_ID} .af-reset {
        height: 32px;
        padding: 0 14px;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 700;
        color: #64748b;
        cursor: pointer;
        transition: background .15s, color .15s;
        align-self: flex-end;
      }
      #${FILTER_ID} .af-reset:hover { background: #e2e8f0; color: #1e293b; }
      #${FILTER_ID} .af-active-note {
        font-size: 10px;
        font-weight: 600;
        color: #2563eb;
        align-self: flex-end;
        padding-bottom: 6px;
      }

      /* Strategy comparison table */
      #ob-strategy-compare table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      #ob-strategy-compare thead tr {
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
      }
      #ob-strategy-compare th {
        padding: 9px 12px;
        text-align: left;
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: #94a3b8;
        white-space: nowrap;
      }
      #ob-strategy-compare th:not(:first-child) { text-align: right; }
      #ob-strategy-compare td {
        padding: 10px 12px;
        border-bottom: 1px solid #f1f5f9;
        color: #334155;
      }
      #ob-strategy-compare td:not(:first-child) { text-align: right; font-family: 'JetBrains Mono', monospace; }
      #ob-strategy-compare tbody tr:hover { background: #f8fafc; }
      #ob-strategy-compare tbody tr:last-child td { border-bottom: 0; }
      .ob-small-sample { font-size: 9px; color: #f59e0b; font-weight: 700; vertical-align: middle; margin-left: 4px; }
    `;
    document.head.appendChild(s);
  }

  // ─── filter bar ─────────────────────────────────────────────────────────────

  function buildFilterBar() {
    const page = document.getElementById('pageAnalytics');
    if (!page || document.getElementById(FILTER_ID)) return;

    const bar = document.createElement('div');
    bar.id = FILTER_ID;
    bar.innerHTML = `
      <div class="af-group">
        <label>Pair</label>
        <select id="af-pair" onchange="window.__obAnalyticsRefresh()">
          <option value="ALL">All Pairs</option>
          <option value="XAUUSD">XAUUSD</option>
          <option value="EURUSD">EURUSD</option>
          <option value="GBPUSD">GBPUSD</option>
          <option value="BTCUSD">BTCUSD</option>
          <option value="NQ1!">NQ1!</option>
          <option value="US30">US30</option>
        </select>
      </div>
      <div class="af-group">
        <label>Session</label>
        <select id="af-session" onchange="window.__obAnalyticsRefresh()">
          <option value="ALL">All Sessions</option>
          <option value="London">London</option>
          <option value="New York">New York</option>
          <option value="London/NY">London/NY</option>
          <option value="Asia">Asia</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="af-group">
        <label>Day of Week</label>
        <select id="af-day" onchange="window.__obAnalyticsRefresh()">
          <option value="ALL">All Days</option>
          <option value="Mon">Monday</option>
          <option value="Tue">Tuesday</option>
          <option value="Wed">Wednesday</option>
          <option value="Thu">Thursday</option>
          <option value="Fri">Friday</option>
          <option value="Sat">Saturday</option>
          <option value="Sun">Sunday</option>
        </select>
      </div>
      <div class="af-group">
        <label>Timeframe</label>
        <select id="af-tf" onchange="window.__obAnalyticsRefresh()">
          <option value="ALL">All TFs</option>
          <option value="4H">4H</option>
          <option value="1H">1H</option>
          <option value="15M">15M</option>
          <option value="5M">5M</option>
          <option value="1M">1M</option>
        </select>
      </div>
      <div class="af-group">
        <label>Regime</label>
        <select id="af-regime" onchange="window.__obAnalyticsRefresh()">
          <option value="ALL">All Regimes</option>
          <option value="Trending">Trending</option>
          <option value="Ranging">Ranging</option>
          <option value="Reversal">Reversal</option>
        </select>
      </div>
      <div class="af-group">
        <label>From</label>
        <input type="date" id="af-from" onchange="window.__obAnalyticsRefresh()">
      </div>
      <div class="af-group">
        <label>To</label>
        <input type="date" id="af-to" onchange="window.__obAnalyticsRefresh()">
      </div>
      <button class="af-reset" onclick="window.__obAnalyticsResetFilters()">Reset</button>
      <span id="af-active-note" class="af-active-note" style="display:none">Filtered</span>
    `;

    // Insert as first child so it appears above the heatmap
    page.insertBefore(bar, page.firstElementChild);
  }

  function isFiltered() {
    const f = readFilters();
    return f.pair !== 'ALL' || f.session !== 'ALL' || f.day !== 'ALL' ||
           f.tf !== 'ALL' || f.regime !== 'ALL' || f.dateFrom || f.dateTo;
  }

  window.__obAnalyticsResetFilters = function () {
    ['af-pair','af-session','af-day','af-tf','af-regime'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = 'ALL';
    });
    ['af-from','af-to'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    window.__obAnalyticsRefresh();
  };

  // ─── extra section (R Progression + Session + Strategy Compare) ─────────────

  function buildExtraSection() {
    const page = document.getElementById('pageAnalytics');
    if (!page) return;

    let section = document.getElementById(EXTRA_ID);
    if (!section) {
      section = document.createElement('div');
      section.id = EXTRA_ID;
      section.className = 'space-y-6';
      page.appendChild(section);
    }

    section.innerHTML = `
      <!-- R Progression -->
      <div class="glass-card p-5 space-y-3">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
              <i class="fa-solid fa-chart-line text-blue-600"></i>R Progression (Filtered)
            </h3>
            <p class="text-xs text-slate-400">Cumulative net R over time with active filters applied</p>
          </div>
          <span id="af-r-total" class="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">+0.00 R</span>
        </div>
        <div class="h-56 relative"><canvas id="chartRProgression"></canvas></div>
      </div>

      <!-- Session + Day-of-week row -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="glass-card p-5 space-y-3">
          <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <i class="fa-solid fa-sun text-amber-500"></i>Net R by Session
          </h3>
          <div class="h-48 relative"><canvas id="chartSessionNet"></canvas></div>
        </div>
        <div class="glass-card p-5 space-y-3">
          <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <i class="fa-solid fa-calendar-week text-indigo-500"></i>Net R by Day of Week
          </h3>
          <div class="h-48 relative"><canvas id="chartDayOfWeek"></canvas></div>
        </div>
      </div>

      <!-- Strategy comparison table -->
      <div id="ob-strategy-compare" class="glass-card overflow-hidden">
        <div class="p-4 border-b border-slate-100">
          <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
            <i class="fa-solid fa-table-list text-blue-600"></i>Strategy Comparison
          </h3>
          <p class="text-xs text-slate-400 mt-0.5">Side-by-side metrics per strategy model with active filters. <span class="text-amber-600 font-semibold">⚠ small</span> = fewer than 10 trades.</p>
        </div>
        <div class="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Trades</th>
                <th>Win %</th>
                <th>Net R</th>
                <th>Avg Win R</th>
                <th>Avg Loss R</th>
                <th>Expectancy</th>
                <th>Profit Factor</th>
                <th>Max Streak</th>
              </tr>
            </thead>
            <tbody id="ob-strategy-compare-body"></tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ─── chart helpers ────────────────────────────────────────────────────────────

  function safeDestroy(instance) {
    try { instance?.destroy(); } catch (_) {}
  }

  function barColors(values) {
    return values.map(v => v >= 0 ? 'rgba(22,163,74,.75)' : 'rgba(220,38,38,.75)');
  }

  // ─── render logic ─────────────────────────────────────────────────────────────

  function renderRProgression(list) {
    const ctx = document.getElementById('chartRProgression');
    if (!ctx) return;

    const sorted = [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let cum = 0;
    const labels = ['Start'];
    const data   = [0];
    sorted.forEach(t => {
      cum += Number(t.rMultiple) || 0;
      labels.push(t.date ? t.date.slice(5) : '?'); // MM-DD
      data.push(Math.round(cum * 100) / 100);
    });

    const total = cum;
    const totalEl = document.getElementById('af-r-total');
    if (totalEl) {
      totalEl.textContent = `${total >= 0 ? '+' : ''}${total.toFixed(2)} R`;
      totalEl.className = `text-xs font-mono font-bold px-2.5 py-1 rounded-lg border ${total >= 0
        ? 'text-blue-600 bg-blue-50 border-blue-100'
        : 'text-rose-600 bg-rose-50 border-rose-100'}`;
    }

    safeDestroy(chartRProgression);
    chartRProgression = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Cumulative R',
          data,
          borderColor: total >= 0 ? '#2563eb' : '#dc2626',
          backgroundColor: total >= 0 ? 'rgba(37,99,235,.07)' : 'rgba(220,38,38,.07)',
          fill: true,
          tension: 0.2,
          borderWidth: 2.5,
          pointRadius: data.length > 60 ? 0 : 3,
          pointBackgroundColor: total >= 0 ? '#2563eb' : '#dc2626',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 12 } },
          y: { grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 9 } } }
        }
      }
    });
  }

  function renderSessionChart(list) {
    const ctx = document.getElementById('chartSessionNet');
    if (!ctx) return;

    const sessions = ['London', 'New York', 'London/NY', 'Asia', 'Other'];
    const values = sessions.map(s =>
      list.filter(t => (t.session || 'Other') === s)
          .reduce((sum, t) => sum + (Number(t.rMultiple) || 0), 0)
    );

    safeDestroy(chartSessionNet);
    chartSessionNet = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sessions,
        datasets: [{
          data: values,
          backgroundColor: barColors(values),
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
          y: { grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 9 } } }
        }
      }
    });
  }

  function renderDayOfWeekChart(list) {
    const ctx = document.getElementById('chartDayOfWeek');
    if (!ctx) { if (!window.__dowChartInstance) return; safeDestroy(window.__dowChartInstance); window.__dowChartInstance = null; return; }

    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const values = days.map(d =>
      list.filter(t => dayName(t.date) === d)
          .reduce((sum, t) => sum + (Number(t.rMultiple) || 0), 0)
    );

    safeDestroy(window.__dowChartInstance);
    window.__dowChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [{
          data: values,
          backgroundColor: barColors(values),
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
          y: { grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 9 } } }
        }
      }
    });
  }

  function renderStrategyCompare(list) {
    const tbody = document.getElementById('ob-strategy-compare-body');
    if (!tbody) return;

    const strategies = [...new Set(list.map(t => t.strategy || 'Unknown'))].sort();

    if (!strategies.length || !list.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-slate-400 text-xs">No trade data matching current filters.</td></tr>`;
      return;
    }

    const rows = strategies.map(strat => {
      const st = list.filter(t => (t.strategy || 'Unknown') === strat);
      const n  = st.length;
      const wins   = st.filter(t => t.result === 'Win').length;
      const losses = st.filter(t => t.result === 'Loss').length;
      const netR   = st.reduce((s, t) => s + (Number(t.rMultiple) || 0), 0);
      const winsR  = st.filter(t => Number(t.rMultiple) > 0).reduce((s, t) => s + t.rMultiple, 0);
      const lossesR= st.filter(t => Number(t.rMultiple) < 0).reduce((s, t) => s + Math.abs(t.rMultiple), 0);
      const avgWin = wins   > 0 ? winsR / wins : 0;
      const avgLoss= losses > 0 ? lossesR / losses : 0;
      const wr     = n > 0 ? wins / n : 0;
      const exp    = (wr * avgWin) - ((1 - wr) * avgLoss);
      const pf     = lossesR > 0 ? winsR / lossesR : (winsR > 0 ? 99 : 0);

      // Max consecutive loss streak
      let maxStreak = 0, curStreak = 0;
      st.forEach(t => {
        if (t.result === 'Loss') { curStreak++; if (curStreak > maxStreak) maxStreak = curStreak; }
        else curStreak = 0;
      });

      const small = n < 10;
      const smallTag = small ? '<span class="ob-small-sample" title="Fewer than 10 trades — treat with caution">⚠ small</span>' : '';
      const rColor = netR >= 0 ? 'color:#16a34a' : 'color:#dc2626';
      const expColor = exp >= 0 ? 'color:#2563eb' : 'color:#dc2626';

      return `<tr>
        <td class="font-semibold text-slate-800">${strat}${smallTag}</td>
        <td>${n}</td>
        <td>${n > 0 ? (wr * 100).toFixed(1) + '%' : '—'}</td>
        <td style="${rColor}">${netR >= 0 ? '+' : ''}${netR.toFixed(2)} R</td>
        <td>${avgWin > 0 ? '+' + avgWin.toFixed(2) + ' R' : '—'}</td>
        <td>${avgLoss > 0 ? '-' + avgLoss.toFixed(2) + ' R' : '—'}</td>
        <td style="${expColor}">${exp >= 0 ? '+' : ''}${exp.toFixed(3)} R</td>
        <td>${pf < 99 ? pf.toFixed(2) : (winsR > 0 ? '∞' : '—')}</td>
        <td>${maxStreak > 0 ? maxStreak + ' L' : '—'}</td>
      </tr>`;
    });

    tbody.innerHTML = rows.join('');
  }

  // ─── patch existing analytics renders ────────────────────────────────────────

  function patchExistingRenders() {
    // Patch renderAnalyticsKPIs so it operates on the filtered set
    const origKPI = window.renderAnalyticsKPIs;
    if (typeof origKPI === 'function' && !origKPI.__advancedFiltered) {
      window.renderAnalyticsKPIs = function (...args) {
        // Temporarily replace trades with the filtered set
        const all = window.trades;
        window.trades = filteredTrades();
        try { return origKPI.apply(this, args); }
        finally { window.trades = all; }
      };
      window.renderAnalyticsKPIs.__advancedFiltered = true;
    }

    // Patch updateCharts so the strategy/TF/regime charts also filter
    const origCharts = window.updateCharts;
    if (typeof origCharts === 'function' && !origCharts.__advancedFiltered) {
      window.updateCharts = function (...args) {
        const all = window.trades;
        window.trades = filteredTrades();
        try { return origCharts.apply(this, args); }
        finally { window.trades = all; }
      };
      window.updateCharts.__advancedFiltered = true;
    }
  }

  // ─── main refresh ─────────────────────────────────────────────────────────────

  function refresh() {
    const page = document.getElementById('pageAnalytics');
    if (!page || page.classList.contains('hidden')) return;

    buildExtraSection();

    const list = filteredTrades();

    // Update active-filter note
    const note = document.getElementById('af-active-note');
    if (note) {
      const filtered = isFiltered();
      note.style.display = filtered ? '' : 'none';
      note.textContent = filtered ? `Filtered — ${list.length} trade${list.length !== 1 ? 's' : ''}` : '';
    }

    renderRProgression(list);
    renderSessionChart(list);
    renderDayOfWeekChart(list);
    renderStrategyCompare(list);

    // Also refresh the existing KPI/chart renders with the filtered set
    if (typeof window.renderAnalyticsKPIs === 'function') {
      window.renderAnalyticsKPIs();
    }
    if (typeof window.updateCharts === 'function') {
      window.updateCharts();
    }
  }

  window.__obAnalyticsRefresh = refresh;

  // ─── boot ─────────────────────────────────────────────────────────────────────

  function boot() {
    if (booted) return;
    booted = true;

    injectStyles();
    buildFilterBar();
    buildExtraSection();
    patchExistingRenders();

    // Patch switchTab to refresh when Analytics tab is opened
    const origTab = window.switchTab;
    if (typeof origTab === 'function' && !origTab.__advancedAnalyticsPatched) {
      window.switchTab = function (tab, ...args) {
        const result = origTab.call(this, tab, ...args);
        if (tab === 'analytics') {
          buildFilterBar();
          buildExtraSection();
          patchExistingRenders();
          setTimeout(refresh, 60);
        }
        return result;
      };
      window.switchTab.__advancedAnalyticsPatched = true;
    }

    // Patch switchMode
    const origMode = window.switchMode;
    if (typeof origMode === 'function' && !origMode.__advancedAnalyticsPatched) {
      window.switchMode = function (...args) {
        const result = origMode.apply(this, args);
        setTimeout(refresh, 80);
        return result;
      };
      window.switchMode.__advancedAnalyticsPatched = true;
    }

    window.addEventListener('wallet-accounts-updated', () => setTimeout(refresh, 60));

    // Retry patch after other scripts may have re-wrapped render functions
    [200, 600, 1400].forEach(ms => setTimeout(() => {
      buildFilterBar();
      buildExtraSection();
      patchExistingRenders();
      refresh();
    }, ms));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
