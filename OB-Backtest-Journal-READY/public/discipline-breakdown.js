// Phase 2: discipline breakdown.
// Separates profitable outcomes from rule adherence so discipline is not confused with profitability.
(function () {
  function source() { return typeof disciplineTrades === 'function' ? disciplineTrades() : []; }
  function clean(t) { return typeof disciplineClean === 'function' ? disciplineClean(t) : (t.clean === true ? true : t.clean === false ? false : null); }
  function calc() {
    const list = source();
    const reviewed = list.filter(t => clean(t) !== null);
    const cleanTrades = reviewed.filter(t => clean(t) === true);
    const violations = reviewed.filter(t => clean(t) === false);
    const bucket = (items, result) => items.filter(t => t.result === result);
    const sumR = items => items.reduce((s, t) => s + (Number(t.r) || 0), 0);
    return {
      reviewed, cleanTrades, violations,
      cleanWins: bucket(cleanTrades, 'win'), cleanLosses: bucket(cleanTrades, 'loss'),
      violatingWins: bucket(violations, 'win'), violatingLosses: bucket(violations, 'loss'),
      cleanR: sumR(cleanTrades), violationR: sumR(violations),
      postStopR: typeof disciplineCalc === 'function' ? disciplineCalc().postStopR : 0,
      postStopTrades: typeof disciplineCalc === 'function' ? disciplineCalc().postStopTrades : 0
    };
  }
  const pct = (n, d) => d ? Math.round(n / d * 100) : null;
  const fmtR = n => `${n >= 0 ? '+' : ''}${n.toFixed(1)}R`;
  function render() {
    const panel = document.getElementById('discipline-panel');
    if (!panel) return;
    const d = calc();
    let box = panel.querySelector('.discipline-breakdown-section');
    if (!box) {
      box = document.createElement('div');
      box.className = 'discipline-breakdown-section';
      const trend = panel.querySelector('.discipline-trend-section');
      const settings = panel.querySelector('.discipline-settings');
      if (trend?.nextSibling) panel.insertBefore(box, trend.nextSibling);
      else if (settings) panel.insertBefore(box, settings);
      else panel.appendChild(box);
    }
    const cleanRate = pct(d.cleanTrades.length, d.reviewed.length);
    const violationRate = pct(d.violations.length, d.reviewed.length);
    const impact = d.violationR - d.cleanR;
    box.innerHTML = `<div class="discipline-breakdown-head"><div><strong>Discipline breakdown</strong><span>Rule adherence and outcome are measured separately</span></div></div><div class="discipline-breakdown-grid"><div class="discipline-breakdown-card"><span>Clean trades</span><b>${d.cleanTrades.length}</b><small>${cleanRate == null ? '—' : cleanRate + '% of reviewed'}</small></div><div class="discipline-breakdown-card"><span>Rule violations</span><b>${d.violations.length}</b><small>${violationRate == null ? '—' : violationRate + '% of reviewed'}</small></div><div class="discipline-breakdown-card"><span>Clean performance</span><b>${fmtR(d.cleanR)}</b><small>${d.cleanWins.length}W · ${d.cleanLosses.length}L</small></div><div class="discipline-breakdown-card"><span>Violation performance</span><b>${fmtR(d.violationR)}</b><small>${d.violatingWins.length}W · ${d.violatingLosses.length}L</small></div></div><div class="discipline-outcome-grid"><div><span>Clean + win</span><b>${d.cleanWins.length}</b></div><div><span>Clean + loss</span><b>${d.cleanLosses.length}</b></div><div><span>Violation + win</span><b>${d.violatingWins.length}</b></div><div><span>Violation + loss</span><b>${d.violatingLosses.length}</b></div></div>${d.violations.length ? `<div class="discipline-impact">Violating trades contributed ${fmtR(d.violationR)}. A profitable violating trade is still a discipline failure; a clean losing trade is still a valid execution.</div>` : '<div class="discipline-impact discipline-impact-good">No reviewed rule violations in the current filtered history.</div>'}${d.postStopTrades ? `<div class="discipline-impact">Post-hard-stop: ${d.postStopTrades} trade${d.postStopTrades === 1 ? '' : 's'}, ${fmtR(d.postStopR)} after the stop.</div>` : ''}`;
  }
  function install() {
    if (window.__obDisciplineBreakdownInstalled) return;
    window.__obDisciplineBreakdownInstalled = true;
    const original = disciplineRender;
    disciplineRender = function () { original(); render(); };
    if (typeof disciplineReady !== 'undefined' && disciplineReady) disciplineRender();
  }
  const style = document.createElement('style'); style.textContent = `.discipline-breakdown-section{margin-top:12px;border-top:1px solid var(--line);padding-top:12px}.discipline-breakdown-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.discipline-breakdown-head strong{display:block;font-size:12px;color:var(--ink)}.discipline-breakdown-head span{display:block;font-size:10px;color:var(--ink-faint);margin-top:2px}.discipline-breakdown-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.discipline-breakdown-card{border:1px solid var(--line);border-radius:10px;padding:10px;background:rgba(255,255,255,.38)}.discipline-breakdown-card span,.discipline-breakdown-card small{display:block;font-size:10px;color:var(--ink-faint)}.discipline-breakdown-card b{display:block;font-size:17px;margin:4px 0 2px}.discipline-outcome-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}.discipline-outcome-grid div{padding:7px 8px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.28)}.discipline-outcome-grid span{display:block;font-size:9px;color:var(--ink-faint)}.discipline-outcome-grid b{font-size:13px}.discipline-impact{margin-top:8px;padding:9px 10px;border-radius:9px;border:1px solid rgba(209,79,53,.18);background:rgba(209,79,53,.045);font-size:10.5px;line-height:1.45;color:var(--ink-soft)}.discipline-impact-good{border-color:rgba(15,157,99,.18);background:rgba(15,157,99,.045)}@media(max-width:700px){.discipline-breakdown-grid{grid-template-columns:1fr 1fr}.discipline-outcome-grid{grid-template-columns:1fr 1fr}}`; document.head.appendChild(style);
  install();
})();
