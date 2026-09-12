// Phase 2: discipline dashboard integration.
// Surfaces the discipline state at the top of the existing app without replacing the dashboard.
(function () {
  function esc(v) { return typeof escapeHtml === 'function' ? escapeHtml(String(v)) : String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function render() {
    if (typeof disciplineCalc !== 'function' || !document.body) return;
    const mode = typeof phase1Mode === 'function' ? phase1Mode() : 'Backtest';
    if (!['Demo','Real','Funded'].includes(mode)) { document.getElementById('discipline-dashboard')?.remove(); return; }
    const d = disciplineCalc();
    const account = typeof phase1CurrentAccount === 'function' ? phase1CurrentAccount() : null;
    let panel = document.getElementById('discipline-dashboard');
    if (!panel) {
      panel = document.createElement('div'); panel.id = 'discipline-dashboard'; panel.className = 'panel glass discipline-dashboard';
      const navHome = document.getElementById('nav-home');
      const firstPanel = document.querySelector('.panel');
      (navHome || firstPanel)?.parentNode.insertBefore(panel, navHome ? navHome.nextSibling : firstPanel);
    }
    const today = typeof disciplineTodayCount === 'function' ? disciplineTodayCount() : 0;
    const remaining = Math.max(0, d.dailyLimit - today);
    const clean = d.cleanPct == null ? '—' : `${d.cleanPct}%`;
    const trend = d.trend?.filter(x => x.pct != null).slice(-1)[0];
    panel.innerHTML = `<div class="discipline-dashboard-head"><div><h2>Trading health <small>discipline at a glance</small></h2><div class="discipline-dashboard-scope">${esc(account?.name || mode)} · ${esc(mode)}</div></div><div class="discipline-dashboard-status ${d.hardStop ? 'is-stop' : 'is-active'}"><span></span>${d.hardStop ? 'Hard stop active' : 'Trading allowed'}</div></div><div class="discipline-dashboard-grid"><div><span>Losing streak</span><b>${d.streak}</b><small>${d.threshold} losses triggers stop</small></div><div><span>Today</span><b>${today}/${d.dailyLimit}</b><small>${remaining} trade${remaining === 1 ? '' : 's'} remaining</small></div><div><span>Clean rate</span><b>${clean}</b><small>${d.evaluatedCount} reviewed</small></div><div><span>Recent trend</span><b>${trend ? trend.pct + '%' : '—'}</b><small>${trend ? trend.total + ' reviewed' : 'No reviewed trades'}</small></div></div>${d.hardStop ? '<div class="discipline-dashboard-alert">New entries are blocked until the losing streak is reset. Post-stop attempts are tracked as discipline violations.</div>' : d.dailyLimitViolations ? `<div class="discipline-dashboard-alert">${d.dailyLimitViolations} daily trade-limit violation${d.dailyLimitViolations === 1 ? '' : 's'} in the current filtered history.</div>` : ''}`;
  }
  function install() {
    if (window.__obDisciplineDashboardInstalled) return;
    window.__obDisciplineDashboardInstalled = true;
    const original = disciplineRender;
    disciplineRender = function () { original(); render(); };
    if (typeof disciplineReady !== 'undefined' && disciplineReady) render();
  }
  const style = document.createElement('style'); style.textContent = `.discipline-dashboard{margin-bottom:14px}.discipline-dashboard-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.discipline-dashboard h2{margin-bottom:2px}.discipline-dashboard-scope{font-size:10px;color:var(--ink-faint)}.discipline-dashboard-status{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;padding:6px 9px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.48)}.discipline-dashboard-status span{width:7px;height:7px;border-radius:50%;background:var(--win)}.discipline-dashboard-status.is-stop span{background:var(--loss)}.discipline-dashboard-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:11px}.discipline-dashboard-grid>div{border:1px solid var(--line);border-radius:10px;padding:10px;background:rgba(255,255,255,.4)}.discipline-dashboard-grid span,.discipline-dashboard-grid small{display:block;font-size:9.5px;color:var(--ink-faint)}.discipline-dashboard-grid b{display:block;font-size:19px;margin:3px 0 2px}.discipline-dashboard-alert{margin-top:9px;border:1px solid rgba(209,79,53,.2);background:rgba(209,79,53,.055);border-radius:9px;padding:8px 10px;font-size:10.5px;color:var(--loss);font-weight:600}@media(max-width:700px){.discipline-dashboard-grid{grid-template-columns:1fr 1fr}.discipline-dashboard-head{flex-direction:column}}`; document.head.appendChild(style);
  install();
})();
