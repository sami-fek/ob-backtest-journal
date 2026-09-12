// Phase 3: risk, expectancy, drawdown and consistency analytics.
(function(){
  function result(t){return String(t.result||'').toLowerCase()}
  function rr(t){const n=Number(t.r);if(!Number.isFinite(n))return 0;return result(t)==='loss'?-Math.abs(n):result(t)==='win'?Math.abs(n):0}
  function calc(){
    const list=[...(window.obAnalyticsContext?.trades||[])];
    let eq=0,peak=0,maxDD=0,currentDD=0,best=0,worst=0,lossStreak=0,maxLossStreak=0;
    const equity=[];
    for(const t of list){
      const r=rr(t);eq+=r;peak=Math.max(peak,eq);currentDD=peak-eq;maxDD=Math.max(maxDD,currentDD);best=Math.max(best,r);worst=Math.min(worst,r);equity.push(eq);
      if(result(t)==='loss'){lossStreak++;maxLossStreak=Math.max(maxLossStreak,lossStreak)}else if(result(t)==='win'||result(t)==='be')lossStreak=0;
    }
    const wins=list.filter(t=>result(t)==='win'),losses=list.filter(t=>result(t)==='loss');
    const aw=wins.length?wins.reduce((s,t)=>s+Math.abs(Number(t.r)||0),0)/wins.length:null;
    const al=losses.length?losses.reduce((s,t)=>s+Math.abs(Number(t.r)||0),0)/losses.length:null;
    const grossWin=wins.reduce((s,t)=>s+Math.abs(Number(t.r)||0),0),grossLoss=losses.reduce((s,t)=>s+Math.abs(Number(t.r)||0),0);
    const wr=wins.length+losses.length?wins.length/(wins.length+losses.length):null;
    const net=eq,expectancy=list.length?net/list.length:null;
    return {n:list.length,net,eq,peak,currentDD,maxDD,best,worst,maxLossStreak,aw,al,wr,expectancy,pf:grossLoss?grossWin/grossLoss:(grossWin?Infinity:null),breakeven:aw!=null&&al!=null&&aw+al>0?al/(aw+al):null,recovery:maxDD>0?net/maxDD:null,equity};
  }
  const fmtR=v=>Number.isFinite(v)?`${v>=0?'+':''}${v.toFixed(2)}R`:'—';
  const fmtPct=v=>v==null?'—':`${Math.round(v*100)}%`;
  const fmtNum=v=>v==null?'—':Number.isFinite(v)?v.toFixed(2):'—';
  function render(){
    let p=document.getElementById('analytics-risk-panel');
    if(!p){p=document.createElement('div');p.id='analytics-risk-panel';p.className='panel glass';const c=document.getElementById('analytics-comparison');const a=document.getElementById('analytics-panel');(c||a)?.parentNode.insertBefore(p,(c||a).nextSibling);if(!c&&!a)document.body.appendChild(p)}
    const m=calc();
    p.innerHTML=`<h2>Performance quality <small>expectancy, drawdown & consistency</small></h2>
      <div class="risk-grid">
        <div><span>Expectancy</span><b>${fmtR(m.expectancy)}</b><small>per trade</small></div>
        <div><span>Avg win</span><b>${m.aw==null?'—':'+'+m.aw.toFixed(2)+'R'}</b><small>winning trades</small></div>
        <div><span>Avg loss</span><b>${m.al==null?'—':'-'+m.al.toFixed(2)+'R'}</b><small>losing trades</small></div>
        <div><span>Payoff ratio</span><b>${m.aw!=null&&m.al?fmtNum(m.aw/m.al):'—'}</b><small>avg win / avg loss</small></div>
        <div><span>Max drawdown</span><b>${m.maxDD?'-'+m.maxDD.toFixed(2)+'R':'0R'}</b><small>peak to trough</small></div>
        <div><span>Current drawdown</span><b>${m.currentDD?'-'+m.currentDD.toFixed(2)+'R':'0R'}</b><small>from equity peak</small></div>
        <div><span>Recovery factor</span><b>${m.recovery==null?'—':m.recovery.toFixed(2)}</b><small>net R / max DD</small></div>
        <div><span>Breakeven win rate</span><b>${fmtPct(m.breakeven)}</b><small>based on payoff</small></div>
        <div><span>Best trade</span><b>${fmtR(m.best)}</b><small>single trade</small></div>
        <div><span>Worst trade</span><b>${fmtR(m.worst)}</b><small>single trade</small></div>
        <div><span>Max loss streak</span><b>${m.maxLossStreak}</b><small>consecutive losses</small></div>
        <div><span>Win rate</span><b>${fmtPct(m.wr)}</b><small>excluding BE</small></div>
      </div>
      ${m.n&&m.n<30?'<div class="risk-note">Small sample: risk metrics can change materially with a few additional trades.</div>':''}`;
  }
  if(window.__obRiskAnalytics)return;window.__obRiskAnalytics=true;
  const style=document.createElement('style');style.textContent=`#analytics-risk-panel{margin-bottom:14px}.risk-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.risk-grid div{border:1px solid var(--line);border-radius:10px;padding:10px;background:rgba(255,255,255,.42)}.risk-grid span{display:block;font-size:9px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.03em}.risk-grid b{display:block;font-size:15px;margin-top:4px}.risk-grid small{display:block;font-size:8.5px;color:var(--ink-faint);margin-top:2px}.risk-note{margin-top:9px;font-size:10px;color:var(--ink-faint);border:1px dashed var(--line-strong);padding:7px 9px;border-radius:8px}@media(max-width:1050px){.risk-grid{grid-template-columns:repeat(4,1fr)}}@media(max-width:700px){.risk-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:500px){.risk-grid{grid-template-columns:repeat(2,1fr)}}`;document.head.appendChild(style);
  function hook(){render();setInterval(()=>{if(document.getElementById('analytics-panel'))render()},1500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook,{once:true});else hook();
})();
