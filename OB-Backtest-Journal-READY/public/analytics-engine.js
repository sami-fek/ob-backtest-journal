// Phase 3: analytics engine.
// Uses the existing filtered trade set (account + strategy + journal filters) as its source.
const ANALYTICS_SAMPLE_WARNING = 20;
let analyticsReady = false;
let analyticsFilters = { direction: 'all', session: 'all', day: 'all', from: '', to: '' };

function analyticsBaseTrades() {
  if (typeof getFiltered !== 'function') return [];
  return [...getFiltered()].sort((a,b) => String(a.date || '').localeCompare(String(b.date || '')) || Number(a.id || 0) - Number(b.id || 0));
}
function analyticsDirection(t) { return String(t.dir || '').toLowerCase() === 'short' ? 'Short' : String(t.dir || '').toLowerCase() === 'long' ? 'Long' : 'Unspecified'; }
function analyticsResult(t) { return String(t.result || '').toLowerCase(); }
function analyticsSession(t) { return t.session ? String(t.session) : 'Unspecified'; }
function analyticsDay(t) {
  const raw = String(t.date || '');
  const d = new Date(raw.length === 10 ? raw + 'T00:00:00' : raw);
  if (Number.isNaN(d.getTime())) return 'Unspecified';
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
}
function analyticsR(t) {
  const r = Number(t.r);
  if (!Number.isFinite(r)) return 0;
  return analyticsResult(t) === 'loss' ? -Math.abs(r) : analyticsResult(t) === 'win' ? Math.abs(r) : 0;
}
function analyticsFilterTrades(list) {
  return list.filter(t => {
    if (analyticsFilters.direction !== 'all' && analyticsDirection(t) !== analyticsFilters.direction) return false;
    if (analyticsFilters.session !== 'all' && analyticsSession(t) !== analyticsFilters.session) return false;
    if (analyticsFilters.day !== 'all' && analyticsDay(t) !== analyticsFilters.day) return false;
    const date = String(t.date || '').slice(0,10);
    if (analyticsFilters.from && date < analyticsFilters.from) return false;
    if (analyticsFilters.to && date > analyticsFilters.to) return false;
    return true;
  });
}
function analyticsMetrics(list) {
  const wins = list.filter(t => analyticsResult(t) === 'win').length;
  const losses = list.filter(t => analyticsResult(t) === 'loss').length;
  const be = list.filter(t => analyticsResult(t) === 'be').length;
  const rs = list.map(analyticsR);
  const netR = rs.reduce((a,b) => a+b, 0);
  const avgR = list.length ? netR / list.length : 0;
  const winRs = list.filter(t => analyticsResult(t) === 'win').map(t => Math.abs(Number(t.r) || 0));
  const lossRs = list.filter(t => analyticsResult(t) === 'loss').map(t => Math.abs(Number(t.r) || 0));
  const grossWin = winRs.reduce((a,b) => a+b, 0);
  const grossLoss = lossRs.reduce((a,b) => a+b, 0);
  let maxLossStreak = 0, streak = 0;
  for (const t of list) { if (analyticsResult(t) === 'loss') { streak++; maxLossStreak = Math.max(maxLossStreak, streak); } else if (analyticsResult(t) === 'win' || analyticsResult(t) === 'be') streak = 0; }
  const reviewed = list.filter(t => t.clean === true || t.clean === false);
  const clean = reviewed.filter(t => t.clean === true).length;
  return {
    total: list.length, wins, losses, be,
    winRate: (wins + losses) ? wins / (wins + losses) * 100 : null,
    netR, avgR,
    avgWin: winRs.length ? grossWin / winRs.length : null,
    avgLoss: lossRs.length ? grossLoss / lossRs.length : null,
    profitFactor: grossLoss ? grossWin / grossLoss : (grossWin ? Infinity : null),
    maxLossStreak,
    cleanPct: reviewed.length ? clean / reviewed.length * 100 : null
  };
}
function analyticsGroup(list, keyFn) {
  const map = new Map();
  for (const t of list) { const key = keyFn(t); if (!map.has(key)) map.set(key, []); map.get(key).push(t); }
  return [...map.entries()].map(([name, trades]) => ({ name, ...analyticsMetrics(trades) })).sort((a,b) => b.netR - a.netR || b.total - a.total);
}
function analyticsEsc(value) { return typeof escapeHtml === 'function' ? escapeHtml(String(value)) : String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function analyticsFmtR(value) { if (!Number.isFinite(value)) return '—'; return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`; }
function analyticsFmtPct(value) { return value == null ? '—' : `${Math.round(value)}%`; }
function analyticsFmtPF(value) { return value == null || !Number.isFinite(value) ? (value === Infinity ? '∞' : '—') : value.toFixed(2); }
function analyticsTable(rows, emptyText) {
  if (!rows.length) return `<div class="empty">${analyticsEsc(emptyText || 'No data for this breakdown.')}</div>`;
  return `<table class="bd-table"><thead><tr><th>Group</th><th>Trades</th><th>Win %</th><th>Net R</th><th>Avg R</th><th>Clean %</th></tr></thead><tbody>${rows.map(r => `<tr><td><span class="bd-name">${analyticsEsc(r.name)}</span>${r.total < ANALYTICS_SAMPLE_WARNING ? '<div class="analytics-small">Small sample</div>' : ''}</td><td>${r.total}</td><td>${analyticsFmtPct(r.winRate)}</td><td>${analyticsFmtR(r.netR)}</td><td>${analyticsFmtR(r.avgR)}</td><td>${analyticsFmtPct(r.cleanPct)}</td></tr>`).join('')}</tbody></table>`;
}
function analyticsStyles() {
  if (document.getElementById('analytics-styles')) return;
  const style = document.createElement('style'); style.id = 'analytics-styles';
  style.textContent = `
    .analytics-panel{margin-bottom:14px}.analytics-filters{display:flex;gap:7px;flex-wrap:wrap;align-items:end;margin-bottom:12px}.analytics-filters .field{min-width:115px;flex:1}.analytics-filters .field.date-field{min-width:140px}.analytics-filters input,.analytics-filters select{font-size:12px}.analytics-clear{background:rgba(255,255,255,.7);border:1px solid var(--line-strong);color:var(--ink-soft);border-radius:8px;padding:7px 10px;font-size:11px;cursor:pointer;font-family:inherit}.analytics-clear:hover{border-color:var(--accent);color:var(--accent)}.analytics-scope{font-size:10.5px;color:var(--ink-faint);margin:-3px 0 11px}.analytics-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}.analytics-kpi{border:1px solid var(--line);border-radius:10px;padding:9px;background:rgba(255,255,255,.45)}.analytics-kpi-label{font-size:9.5px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.04em}.analytics-kpi-value{font-size:18px;font-weight:700;margin-top:2px}.analytics-kpi-sub{font-size:9.5px;color:var(--ink-faint);margin-top:2px}.analytics-note{font-size:10.5px;color:var(--ink-faint);padding:7px 9px;border:1px dashed var(--line-strong);border-radius:8px;margin-bottom:12px}.analytics-breakdowns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.analytics-breakdown{border-top:1px solid var(--line);padding-top:10px}.analytics-breakdown h3{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-faint);margin:0 0 7px}.analytics-small{font-size:8.5px;color:var(--ink-faint);margin-top:2px}.analytics-equity{width:100%;height:130px;display:block;border-top:1px solid var(--line);padding-top:7px}@media(max-width:800px){.analytics-kpis{grid-template-columns:repeat(3,1fr)}.analytics-breakdowns{grid-template-columns:1fr}}@media(max-width:500px){.analytics-kpis{grid-template-columns:repeat(2,1fr)}}
  `; document.head.appendChild(style);
}
function analyticsRender() {
  let panel = document.getElementById('analytics-panel');
  if (!panel) {
    panel = document.createElement('div'); panel.id = 'analytics-panel'; panel.className = 'panel glass analytics-panel';
    const discipline = document.getElementById('discipline-panel');
    const context = document.getElementById('phase1-context');
    const logPanel = [...document.querySelectorAll('.panel')].find(p => p.querySelector('#f-add'));
    (discipline || context || logPanel)?.parentNode.insertBefore(panel, (discipline || context || logPanel).nextSibling);
  }
  const base = analyticsBaseTrades();
  const list = analyticsFilterTrades(base);
  const m = analyticsMetrics(list);
  const sessions = [...new Set(base.map(analyticsSession))].sort();
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].filter(d => base.some(t => analyticsDay(t) === d));
  const directions = ['Long','Short','Unspecified'].filter(d => base.some(t => analyticsDirection(t) === d));
  const equity = [];
  let running = 0; for (const t of list) { running += analyticsR(t); equity.push(running); }
  panel.innerHTML = `<h2>Analytics <small>current account + strategy context</small></h2>
    <div class="analytics-filters">
      <div class="field"><label>Direction</label><select id="analytics-direction"><option value="all">All directions</option>${directions.map(x => `<option value="${analyticsEsc(x)}">${analyticsEsc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>Session</label><select id="analytics-session"><option value="all">All sessions</option>${sessions.map(x => `<option value="${analyticsEsc(x)}">${analyticsEsc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>Day</label><select id="analytics-day"><option value="all">All days</option>${days.map(x => `<option value="${x}">${x}</option>`).join('')}</select></div>
      <div class="field date-field"><label>From</label><input type="date" id="analytics-from" value="${analyticsEsc(analyticsFilters.from)}"></div>
      <div class="field date-field"><label>To</label><input type="date" id="analytics-to" value="${analyticsEsc(analyticsFilters.to)}"></div>
      <button class="analytics-clear" id="analytics-clear" type="button">Clear</button>
    </div>
    <div class="analytics-scope">${list.length} trade${list.length === 1 ? '' : 's'} in the analytics filter · journal/account/strategy filters remain the source set.</div>
    <div class="analytics-kpis">
      <div class="analytics-kpi"><div class="analytics-kpi-label">Trades</div><div class="analytics-kpi-value">${m.total}</div><div class="analytics-kpi-sub">${m.wins}W · ${m.losses}L · ${m.be}BE</div></div>
      <div class="analytics-kpi"><div class="analytics-kpi-label">Win rate</div><div class="analytics-kpi-value">${analyticsFmtPct(m.winRate)}</div><div class="analytics-kpi-sub">excluding BE</div></div>
      <div class="analytics-kpi"><div class="analytics-kpi-label">Net R</div><div class="analytics-kpi-value">${analyticsFmtR(m.netR)}</div><div class="analytics-kpi-sub">expectancy ${analyticsFmtR(m.avgR)}</div></div>
      <div class="analytics-kpi"><div class="analytics-kpi-label">Profit factor</div><div class="analytics-kpi-value">${analyticsFmtPF(m.profitFactor)}</div><div class="analytics-kpi-sub">gross win / gross loss</div></div>
      <div class="analytics-kpi"><div class="analytics-kpi-label">Max loss streak</div><div class="analytics-kpi-value">${m.maxLossStreak}</div><div class="analytics-kpi-sub">clean ${analyticsFmtPct(m.cleanPct)}</div></div>
    </div>
    ${m.total > 0 && m.total < ANALYTICS_SAMPLE_WARNING ? '<div class="analytics-note">⚠ Small sample — fewer than 20 trades. Treat percentage and group differences as provisional.</div>' : ''}
    <div class="analytics-breakdowns">
      <div class="analytics-breakdown"><h3>By pair</h3>${analyticsTable(analyticsGroup(list, t => t.pair || 'Unspecified'))}</div>
      <div class="analytics-breakdown"><h3>By session</h3>${analyticsTable(analyticsGroup(list, analyticsSession))}</div>
      <div class="analytics-breakdown"><h3>By day</h3>${analyticsTable(analyticsGroup(list, analyticsDay))}</div>
      <div class="analytics-breakdown"><h3>By timeframe</h3>${analyticsTable(analyticsGroup(list, t => t.tf || 'Unspecified'))}</div>
      <div class="analytics-breakdown"><h3>By market regime</h3>${analyticsTable(analyticsGroup(list, t => t.regime || 'Unspecified'))}</div>
      <div class="analytics-breakdown"><h3>By direction</h3>${analyticsTable(analyticsGroup(list, analyticsDirection))}</div>
    </div>
    <div class="analytics-breakdown" style="margin-top:12px"><h3>R progression</h3>${equity.length ? `<canvas id="analytics-equity" class="analytics-equity"></canvas>` : '<div class="empty">No trades for the current analytics filter.</div>'}</div>`;
  const dirEl = document.getElementById('analytics-direction'), sessionEl = document.getElementById('analytics-session'), dayEl = document.getElementById('analytics-day');
  dirEl.value = analyticsFilters.direction; sessionEl.value = analyticsFilters.session; dayEl.value = analyticsFilters.day;
  const rerender = () => analyticsRender();
  dirEl.onchange = () => { analyticsFilters.direction = dirEl.value; rerender(); };
  sessionEl.onchange = () => { analyticsFilters.session = sessionEl.value; rerender(); };
  dayEl.onchange = () => { analyticsFilters.day = dayEl.value; rerender(); };
  document.getElementById('analytics-from').onchange = e => { analyticsFilters.from = e.target.value; rerender(); };
  document.getElementById('analytics-to').onchange = e => { analyticsFilters.to = e.target.value; rerender(); };
  document.getElementById('analytics-clear').onclick = () => { analyticsFilters = { direction:'all', session:'all', day:'all', from:'', to:'' }; analyticsRender(); };
  const canvas = document.getElementById('analytics-equity');
  if (canvas && equity.length) {
    const ctx = canvas.getContext('2d'), w = canvas.clientWidth || 600, h = 130, dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
    const min = Math.min(0, ...equity), max = Math.max(0, ...equity), span = max - min || 1;
    ctx.strokeStyle = '#2F6FED'; ctx.lineWidth = 2; ctx.beginPath();
    equity.forEach((v,i) => { const x = equity.length === 1 ? w/2 : i/(equity.length-1)*w; const y = h - ((v-min)/span)*(h-10)-5; i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }); ctx.stroke();
    const zeroY = h - ((0-min)/span)*(h-10)-5; ctx.strokeStyle = 'rgba(60,90,160,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0,zeroY); ctx.lineTo(w,zeroY); ctx.stroke();
  }
}
const analyticsOriginalRender = render;
render = async function() { await analyticsOriginalRender(); if (analyticsReady) analyticsRender(); };
analyticsStyles();
analyticsReady = true;
analyticsRender();
