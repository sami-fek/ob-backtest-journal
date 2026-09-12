// Phase 2: discipline engine.
// Computes discipline only for Demo, Real and Funded accounts.
const DISCIPLINE_DEFAULTS = { lossThreshold: 2, dailyTradeLimit: 2 };
let disciplineSettings = { ...DISCIPLINE_DEFAULTS };
let disciplineReady = false;

function disciplineModeAllowed() {
  const mode = typeof phase1Mode === 'function' ? phase1Mode() : 'Backtest';
  return ['Demo', 'Real', 'Funded'].includes(mode);
}
async function disciplineGet(key, fallback) {
  try { const raw = await storageGet(key); if (!raw) return fallback; return JSON.parse(raw) ?? fallback; }
  catch { return fallback; }
}
async function disciplineSet(key, value) { return storageSet(key, JSON.stringify(value)); }
function disciplineTrades() {
  if (!disciplineModeAllowed() || typeof getFiltered !== 'function') return [];
  return [...getFiltered()].sort((a,b) => String(a.date || '').localeCompare(String(b.date || '')) || Number(a.id || 0) - Number(b.id || 0));
}
function disciplineClean(t) { return t.clean === true ? true : t.clean === false ? false : null; }
function disciplineCalc() {
  const list = disciplineTrades();
  const threshold = Math.max(1, Number(disciplineSettings.lossThreshold) || 2);
  const dailyLimit = Math.max(1, Number(disciplineSettings.dailyTradeLimit) || 2);
  let streak = 0, hardStop = false, postStopTrades = 0, postStopR = 0, dailyLimitViolations = 0;
  const violationMap = { 'Post-hard-stop': 0, 'Daily trade limit': 0, 'Checklist/rule': 0 };
  const days = new Map();
  const evaluated = list.filter(t => disciplineClean(t) !== null);
  const cleanCount = evaluated.filter(t => disciplineClean(t) === true).length;
  const violationCount = evaluated.filter(t => disciplineClean(t) === false).length;
  let previousDate = null, dayStreak = 0, dayStopped = false, dayCount = 0;
  for (const t of list) {
    const date = String(t.date || '');
    if (date !== previousDate) { dayStreak = 0; dayStopped = false; dayCount = 0; previousDate = date; }
    dayCount += 1;
    if (dayCount > dailyLimit) { dailyLimitViolations++; violationMap['Daily trade limit']++; }
    if (dayStopped) {
      postStopTrades++;
      postStopR += Number(t.r) || 0;
      violationMap['Post-hard-stop']++;
    }
    if (t.result === 'loss') {
      dayStreak += 1;
      streak += 1;
      if (dayStreak >= threshold) { dayStopped = true; hardStop = true; }
    } else if (t.result === 'win' || t.result === 'be') {
      dayStreak = 0;
      streak = 0;
      hardStop = false;
    }
    days.set(date, (days.get(date) || []).concat(t));
  }
  const trend = [...days.entries()].filter(([d]) => d).slice(-6).map(([date, ts]) => {
    const reviewed = ts.filter(t => disciplineClean(t) !== null);
    const clean = reviewed.filter(t => disciplineClean(t) === true).length;
    return { date, total: reviewed.length, clean, pct: reviewed.length ? Math.round(clean / reviewed.length * 100) : null };
  });
  return { list, threshold, dailyLimit, streak, hardStop, postStopTrades, postStopR, dailyLimitViolations, cleanCount, violationCount, evaluatedCount: evaluated.length, cleanPct: evaluated.length ? Math.round(cleanCount / evaluated.length * 100) : null, violationMap, trend };
}
function disciplineStyles() {
  if (document.getElementById('discipline-styles')) return;
  const style = document.createElement('style'); style.id = 'discipline-styles';
  style.textContent = `
    .discipline-panel{margin-bottom:14px}.discipline-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.discipline-card{border:1px solid var(--line);border-radius:10px;padding:10px;background:rgba(255,255,255,.45)}.discipline-label{font-size:10px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.04em}.discipline-value{font-size:19px;font-weight:700;margin-top:3px}.discipline-sub{font-size:10.5px;color:var(--ink-faint);margin-top:3px}.discipline-alert{margin-top:10px;border:1px solid rgba(200,60,60,.25);background:rgba(200,60,60,.06);border-radius:9px;padding:9px 10px;font-size:11.5px;color:var(--loss);font-weight:600}.discipline-clean{margin-top:10px;border-top:1px solid var(--line);padding-top:10px;font-size:11px;color:var(--ink-soft)}.discipline-trend{display:flex;gap:6px;margin-top:8px;overflow:auto}.discipline-week{min-width:64px;text-align:center;border:1px solid var(--line);border-radius:8px;padding:6px}.discipline-week b{display:block;font-size:12px}.discipline-week span{font-size:9px;color:var(--ink-faint)}.discipline-settings{display:flex;gap:7px;align-items:end;margin-top:10px;flex-wrap:wrap}.discipline-settings .field{min-width:120px}.discipline-settings input{font-size:12px}.discipline-save{background:rgba(255,255,255,.75);border:1px solid var(--line-strong);color:var(--ink-soft);border-radius:7px;padding:7px 10px;font-size:11px;cursor:pointer;font-family:inherit}.discipline-save:hover{border-color:var(--accent);color:var(--accent)}@media(max-width:700px){.discipline-grid{grid-template-columns:1fr 1fr}}
  `; document.head.appendChild(style);
}
function disciplineRender() {
  let panel = document.getElementById('discipline-panel');
  if (!disciplineModeAllowed()) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = document.createElement('div'); panel.id = 'discipline-panel'; panel.className = 'panel glass discipline-panel';
    const context = document.getElementById('phase1-context');
    const logPanel = [...document.querySelectorAll('.panel')].find(p => p.querySelector('#f-add'));
    (context || logPanel)?.parentNode.insertBefore(panel, context ? context.nextSibling : logPanel);
  }
  const d = disciplineCalc();
  const status = d.hardStop ? `HARD STOP — ${d.threshold} consecutive losses reached` : `${d.streak} consecutive loss${d.streak === 1 ? '' : 'es'}`;
  const trend = d.trend.map(x => `<div class="discipline-week"><b>${x.pct == null ? '—' : x.pct + '%'}</b><span>${escapeHtml(x.date.slice(5))}</span></div>`).join('');
  panel.innerHTML = `<h2>Discipline <small>rules are measured separately from profitability</small></h2><div class="discipline-grid"><div class="discipline-card"><div class="discipline-label">Losing streak</div><div class="discipline-value">${d.streak}</div><div class="discipline-sub">${escapeHtml(status)}</div></div><div class="discipline-card"><div class="discipline-label">Clean trade rate</div><div class="discipline-value">${d.cleanPct == null ? '—' : d.cleanPct + '%'}</div><div class="discipline-sub">${d.cleanCount} clean / ${d.evaluatedCount} reviewed</div></div><div class="discipline-card"><div class="discipline-label">Post-stop trades</div><div class="discipline-value">${d.postStopTrades}</div><div class="discipline-sub">R after stop: ${d.postStopR.toFixed(1)}R</div></div><div class="discipline-card"><div class="discipline-label">Limit violations</div><div class="discipline-value">${d.dailyLimitViolations}</div><div class="discipline-sub">Max ${d.dailyLimit} trades/day</div></div></div>${d.hardStop ? `<div class="discipline-alert">Hard stop active in the current filtered history. A trade after the stop is recorded as a post-hard-stop violation.</div>` : ''}<div class="discipline-clean">Checklist/rule violations: ${d.violationCount} reviewed trades. A clean loss can still be disciplined; a profitable rule-breaking trade remains a violation.</div><div class="discipline-trend"><span style="font-size:10px;color:var(--ink-faint);align-self:center;margin-right:2px;">Trend</span>${trend || '<span class="discipline-sub">No reviewed trades yet.</span>'}</div><div class="discipline-settings"><div class="field"><label>Losses before hard stop</label><input type="number" id="discipline-threshold" min="1" max="20" value="${d.threshold}"></div><div class="field"><label>Daily trade limit</label><input type="number" id="discipline-daily-limit" min="1" max="50" value="${d.dailyLimit}"></div><button class="discipline-save" id="discipline-save">Save rules</button></div>`;
  document.getElementById('discipline-save').onclick = async () => {
    disciplineSettings.lossThreshold = Math.max(1, Number(document.getElementById('discipline-threshold').value) || 2);
    disciplineSettings.dailyTradeLimit = Math.max(1, Number(document.getElementById('discipline-daily-limit').value) || 2);
    await disciplineSet('ob-discipline-settings', disciplineSettings);
    disciplineRender();
  };
}
const disciplineOriginalRender = render;
render = async function() { await disciplineOriginalRender(); if (disciplineReady) disciplineRender(); };
async function disciplineInit() {
  disciplineStyles();
  disciplineSettings = { ...DISCIPLINE_DEFAULTS, ...(await disciplineGet('ob-discipline-settings', {})) };
  disciplineReady = true;
  disciplineRender();
}
disciplineInit().catch(err => console.error('Discipline engine init failed:', err));
