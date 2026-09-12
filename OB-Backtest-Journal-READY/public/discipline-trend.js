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

  function trendStyles() {
    if (document.getElementById('discipline-trend-styles')) return;
    const style = document.createElement('style');
    style.id = 'discipline-trend-styles';
    style.textContent = `
      .discipline-trend-section{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
      .discipline-trend-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .discipline-trend-head strong{display:block;font-size:12px;color:var(--ink)}
      .discipline-trend-head span{display:block;font-size:10px;color:var(--ink-faint);margin-top:2px}
      .discipline-trend-controls{display:flex;align-items:center;gap:5px}
      .discipline-trend-controls select,.discipline-trend-controls input{height:30px;border:1px solid var(--line-strong);border-radius:7px;background:rgba(255,255,255,.68);color:var(--ink-soft);font:500 11px inherit;padding:0 7px}
      .discipline-trend-controls input{width:125px}
      .discipline-trend-controls>span{margin:0;color:var(--ink-faint);font-size:11px}
      .discipline-trend-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:9px}
      .discipline-trend-summary>div{border:1px solid var(--line);border-radius:9px;padding:8px 9px;background:rgba(255,255,255,.35)}
      .discipline-trend-summary span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-faint)}
      .discipline-trend-summary b{display:block;margin-top:3px;font-size:17px;color:var(--ink)}
      .discipline-trend-summary small{display:block;margin-top:2px;font-size:9px;color:var(--ink-faint)}
      .discipline-trend-bars{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;height:145px;margin-top:10px;padding:8px 4px 0;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.28)}
      .discipline-trend-bar{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end}
      .discipline-bar-value{font-size:10px;font-weight:700;color:var(--ink-soft);margin-bottom:4px}
      .discipline-bar-track{width:100%;height:82px;display:flex;align-items:flex-end;justify-content:center}
      .discipline-bar-track i{display:block;width:min(42px,65%);min-height:4px;border-radius:6px 6px 2px 2px;background:rgba(47,111,237,.58);box-shadow:inset 0 1px rgba(255,255,255,.5)}
      .discipline-trend-bar>span{font-size:9px;color:var(--ink-soft);margin-top:5px}
      .discipline-trend-bar>small{font-size:8px;color:var(--ink-faint);margin-top:1px}
      .discipline-trend-note{margin-top:7px;padding:7px 9px;border:1px solid rgba(47,111,237,.18);background:rgba(47,111,237,.05);border-radius:8px;font-size:10px;color:var(--ink-soft)}
      .discipline-trend-empty{grid-column:1/-1;align-self:center;text-align:center;font-size:11px;color:var(--ink-faint)}
      @media(max-width:700px){.discipline-trend-summary{grid-template-columns:1fr 1fr}.discipline-trend-bars{grid-template-columns:repeat(2,1fr);height:auto;min-height:170px}.discipline-trend-controls{width:100%;flex-wrap:wrap}.discipline-trend-controls input{flex:1;min-width:105px}}
    `;
    document.head.appendChild(style);
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
    trendStyles();
    const original = disciplineRender;
    disciplineRender = function () {
      original();
      renderTrend('week');
    };
    if (typeof disciplineReady !== 'undefined' && disciplineReady) disciplineRender();
  }

  install();
})();
