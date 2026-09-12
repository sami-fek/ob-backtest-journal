// Phase 2: discipline trend analytics.
// Builds week/month/custom clean-rate calculations from the filtered discipline history.
(function () {
  function trendSource() {
    if (typeof disciplineTrades !== 'function') return [];
    return disciplineTrades();
  }

  function cleanValue(t) {
    if (typeof disciplineClean === 'function') return disciplineClean(t);
    return t.clean === true ? true : t.clean === false ? false : null;
  }

  function dateOnly(value) {
    const s = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  function parseDate(value) {
    const s = dateOnly(value);
    if (!s) return null;
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function mondayOf(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function isoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function reviewedStats(list) {
    const reviewed = list.filter(t => cleanValue(t) !== null);
    const clean = reviewed.filter(t => cleanValue(t) === true).length;
    return {
      total: reviewed.length,
      clean,
      pct: reviewed.length ? Math.round(clean / reviewed.length * 100) : null
    };
  }

  function grouped(mode, start, end) {
    const groups = new Map();
    for (const t of trendSource()) {
      const d = parseDate(t.date);
      if (!d) continue;
      if (start && d < start) continue;
      if (end && d > end) continue;
      const key = mode === 'month' ? monthKey(d) : isoDate(mondayOf(d));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, ts]) => ({ key, ...reviewedStats(ts) }));
  }

  function latestPeriods(mode, count) {
    return grouped(mode).slice(-count);
  }

  function trendDirection(periods) {
    const usable = periods.filter(x => x.pct !== null);
    if (usable.length < 2) return '—';
    const current = usable[usable.length - 1].pct;
    const previous = usable[usable.length - 2].pct;
    if (current > previous) return '↑';
    if (current < previous) return '↓';
    return '→';
  }

  function average(periods) {
    const usable = periods.filter(x => x.pct !== null);
    return usable.length ? Math.round(usable.reduce((sum, x) => sum + x.pct, 0) / usable.length) : null;
  }

  function labelFor(key, mode) {
    if (mode === 'month') return key;
    return key.slice(5);
  }

  function renderTrend(periodMode, customStart, customEnd) {
    const panel = document.getElementById('discipline-panel');
    if (!panel) return;
    const start = customStart ? parseDate(customStart) : null;
    const end = customEnd ? parseDate(customEnd) : null;
    const periods = periodMode === 'custom' ? grouped('week', start, end) : latestPeriods(periodMode, 4);
    const latest = periods.filter(x => x.pct !== null).slice(-1)[0] || null;
    const previous = periods.filter(x => x.pct !== null).slice(-2, -1)[0] || null;
    const fourWeek = average(periodMode === 'week' ? periods : latestPeriods('week', 4));
    const direction = trendDirection(periodMode === 'week' ? periods : latestPeriods('week', 4));
    const insufficient = latest && latest.total < 5;
    const max = Math.max(100, ...periods.map(x => x.pct || 0));

    let box = panel.querySelector('.discipline-trend-section');
    if (!box) {
      box = document.createElement('div');
      box.className = 'discipline-trend-section';
      const settings = panel.querySelector('.discipline-settings');
      (settings ? panel.insertBefore(box, settings) : panel.appendChild(box));
    }
    box.innerHTML = `<div class="discipline-trend-head"><div><strong>Discipline trend</strong><span>Clean trade rate over time</span></div><div class="discipline-trend-controls"><select id="discipline-trend-period"><option value="week">Week</option><option value="month">Month</option><option value="custom">Custom</option></select><input type="date" id="discipline-trend-start" aria-label="Trend start"><span>→</span><input type="date" id="discipline-trend-end" aria-label="Trend end"></div></div><div class="discipline-trend-summary"><div><span>Current</span><b>${latest?.pct == null ? '—' : latest.pct + '%'}</b>${latest ? `<small>${latest.total} reviewed${insufficient ? ' · small sample' : ''}</small>` : ''}</div><div><span>Previous</span><b>${previous?.pct == null ? '—' : previous.pct + '%'}</b></div><div><span>4-week avg</span><b>${fourWeek == null ? '—' : fourWeek + '%'}</b></div><div><span>Trend</span><b>${direction}</b></div></div><div class="discipline-trend-bars">${periods.length ? periods.map(x => `<div class="discipline-trend-bar"><div class="discipline-bar-value">${x.pct == null ? '—' : x.pct + '%'}</div><div class="discipline-bar-track"><i style="height:${x.pct == null ? 0 : Math.max(4, Math.round((x.pct / max) * 100))}%"></i></div><span>${escapeHtml(labelFor(x.key, periodMode === 'custom' ? 'week' : periodMode))}</span><small>${x.total} reviewed</small></div>`).join('') : '<div class="discipline-trend-empty">No reviewed trades in this period.</div>'}</div>${insufficient ? '<div class="discipline-trend-note">Current period has fewer than 5 reviewed trades, so treat the percentage as an early signal rather than a strong sample.</div>' : ''}`;

    const select = box.querySelector('#discipline-trend-period');
    const startInput = box.querySelector('#discipline-trend-start');
    const endInput = box.querySelector('#discipline-trend-end');
    select.value = periodMode;
    startInput.value = customStart || '';
    endInput.value = customEnd || '';
    const sync = () => renderTrend(select.value, startInput.value, endInput.value);
    select.onchange = sync;
    startInput.onchange = sync;
    endInput.onchange = sync;
  }

  function install() {
    if (window.__obDisciplineTrendInstalled) return;
    window.__obDisciplineTrendInstalled = true;
    const original = disciplineRender;
    disciplineRender = function () {
      original();
      renderTrend('week');
    };
    if (typeof disciplineReady !== 'undefined' && disciplineReady) disciplineRender();
  }

  install();
})();
