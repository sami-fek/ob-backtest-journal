// System settings foundation: one place for trading rules and session configuration.
(function phase4Settings(){
  if(window.__obSettingsFoundation)return; window.__obSettingsFoundation=true;
  const KEY='ob-trading-rules';
  const DEFAULTS={riskPercent:1,minRR:2,preferredRR:3,maxTradesPerDay:2,hardStopLosses:2,primarySession:'London',timezone:'UTC'};
  const read=()=>{try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...DEFAULTS}}};
  const write=v=>localStorage.setItem(KEY,JSON.stringify(v));
  const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'');
  let settings=read();

  async function persist(){
    write(settings);
    try{await storageSet(KEY,JSON.stringify(settings));}catch{}
    // Keep the discipline engine's configurable controls synchronized with the system rules.
    if(typeof disciplineSettings==='object'&&disciplineSettings){
      disciplineSettings.dailyTradeLimit=settings.maxTradesPerDay;
      disciplineSettings.lossThreshold=settings.hardStopLosses;
      try{await storageSet('ob-discipline-settings',JSON.stringify(disciplineSettings));}catch{}
    }
  }

  function render(){
    let panel=document.getElementById('trading-rules-panel');
    if(!panel){panel=document.createElement('div');panel.id='trading-rules-panel';panel.className='panel glass';const backup=document.getElementById('backup-panel');const mt5=document.getElementById('mt5-panel');const anchor=backup||mt5||document.querySelector('.wrap');anchor?.parentNode?.insertBefore(panel,anchor?.nextSibling||null)}
    settings=read();
    panel.innerHTML=`<h2>Trading rules <small>system-wide defaults used for discipline and future trade validation</small></h2><div class="rules-grid"><label>Risk per trade %<input id="rule-risk" type="number" min="0.1" max="10" step="0.1" value="${esc(settings.riskPercent)}"></label><label>Minimum RR<input id="rule-min-rr" type="number" min="0.5" max="20" step="0.1" value="${esc(settings.minRR)}"></label><label>Preferred RR<input id="rule-pref-rr" type="number" min="0.5" max="20" step="0.1" value="${esc(settings.preferredRR)}"></label><label>Max trades / day<input id="rule-max-trades" type="number" min="1" max="50" step="1" value="${esc(settings.maxTradesPerDay)}"></label><label>Hard stop after losses<input id="rule-hard-stop" type="number" min="1" max="20" step="1" value="${esc(settings.hardStopLosses)}"></label><label>Primary session<select id="rule-session"><option>London</option><option>New York</option><option>Asia</option><option>London + New York</option></select></label><label>Trading timezone<select id="rule-timezone"><option>UTC</option><option>Africa/Addis_Ababa</option><option>Europe/London</option><option>America/New_York</option></select></label></div><div class="rules-note">Risk, RR and session settings are configuration only for now. Discipline limits are enforced on Demo, Real and Funded entries; Backtest remains unrestricted.</div><button class="rules-save" id="rules-save" type="button">Save trading rules</button>`;
    document.getElementById('rule-session').value=settings.primarySession;
    document.getElementById('rule-timezone').value=settings.timezone;
    document.getElementById('rules-save').onclick=async()=>{
      settings={...settings,riskPercent:Math.max(.1,Number(document.getElementById('rule-risk').value)||1),minRR:Math.max(.5,Number(document.getElementById('rule-min-rr').value)||2),preferredRR:Math.max(.5,Number(document.getElementById('rule-pref-rr').value)||3),maxTradesPerDay:Math.max(1,Number(document.getElementById('rule-max-trades').value)||2),hardStopLosses:Math.max(1,Number(document.getElementById('rule-hard-stop').value)||2),primarySession:document.getElementById('rule-session').value,timezone:document.getElementById('rule-timezone').value};
      await persist();
      render();
      if(typeof disciplineRender==='function')disciplineRender();
    };
  }
  const st=document.createElement('style');st.textContent=`#trading-rules-panel{margin-bottom:14px}.rules-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.rules-grid label{font-size:9px;color:var(--ink-faint);text-transform:uppercase}.rules-grid input,.rules-grid select{display:block;width:100%;box-sizing:border-box;margin-top:4px;border:1px solid var(--line);border-radius:8px;padding:8px;background:rgba(255,255,255,.55);color:var(--ink);font:500 11px inherit}.rules-note{margin-top:10px;font-size:10.5px;line-height:1.45;color:var(--ink-faint)}.rules-save{margin-top:10px;border:1px solid var(--line-strong);border-radius:8px;padding:8px 11px;background:rgba(47,111,237,.1);color:var(--accent);font:600 10px inherit;cursor:pointer}.rules-save:hover{border-color:var(--accent)}@media(max-width:800px){.rules-grid{grid-template-columns:1fr 1fr}}@media(max-width:500px){.rules-grid{grid-template-columns:1fr}}`;document.head.appendChild(st);
  window.obTradingRules={get:()=>({...settings}),save:async(next)=>{settings={...settings,...next};await persist();render()}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();
