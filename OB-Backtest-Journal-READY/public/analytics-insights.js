// Phase 3: concise decision-support insights from the central analytics filter.
(function(){
  if(window.__obAnalyticsInsights)return;window.__obAnalyticsInsights=true;
  const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v)):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const r=t=>{const n=Number(t.r);if(!Number.isFinite(n))return 0;const x=String(t.result||'').toLowerCase();return x==='loss'?-Math.abs(n):x==='win'?Math.abs(n):0};
  const metrics=list=>{const w=list.filter(t=>String(t.result||'').toLowerCase()==='win'),l=list.filter(t=>String(t.result||'').toLowerCase()==='loss');const net=list.reduce((s,t)=>s+r(t),0);return{n:list.length,w:w.length,l:l.length,wr:w.length+l.length?w.length/(w.length+l.length):null,net,avg:list.length?net/list.length:0}};
  function group(list,key){const m=new Map();list.forEach(t=>{const k=key(t)||'Unspecified';if(!m.has(k))m.set(k,[]);m.get(k).push(t)});return [...m.entries()].map(([name,ts])=>({name,...metrics(ts)})).filter(x=>x.n>=5).sort((a,b)=>b.net-a.net)}
  function render(){
    const ctx=window.obAnalyticsContext;if(!ctx?.trades)return;
    let p=document.getElementById('analytics-insights');if(!p){p=document.createElement('div');p.id='analytics-insights';p.className='panel glass';const a=document.getElementById('analytics-filter-bar')||document.getElementById('analytics-panel');if(a)a.parentNode.insertBefore(p,a.nextSibling);else document.body.appendChild(p)}
    const list=ctx.trades,m=metrics(list),byPair=group(list,t=>t.pair||t.symbol),bySession=group(list,t=>t.session),byStrategy=group(list,t=>t.strategyId||t.strategy),byTf=group(list,t=>t.tf||t.timeframe);
    const sections=[];
    for(const [label,rows] of [['Pair',byPair],['Session',bySession],['Strategy',byStrategy],['Timeframe',byTf]]){
      if(rows.length<2)continue;const best=rows[0],worst=rows[rows.length-1];sections.push(`<div class="ai-insight-row"><span>${label}</span><b>Best: ${esc(best.name)} ${best.net>=0?'+':''}${best.net.toFixed(2)}R</b><b>Weakest: ${esc(worst.name)} ${worst.net>=0?'+':''}${worst.net.toFixed(2)}R</b></div>`)
    }
    let finding='';
    if(!list.length)finding='No trades match the current analytics filters.';
    else if(list.length<20)finding='Sample is still small. Use these metrics for direction, not final conclusions.';
    else if(m.net>0&&m.avg>0)finding=`Current filtered set has positive expectancy: ${m.avg>=0?'+':''}${m.avg.toFixed(2)}R per trade.`;
    else if(m.net<0)finding=`Current filtered set is negative: ${m.avg.toFixed(2)}R per trade. Use the breakdowns to isolate where the loss is concentrated.`;
    else finding='Current filtered set is roughly flat. Compare groups before changing the strategy.';
    p.innerHTML=`<h2>Analytics insight <small>evidence from the current filter</small></h2><div class="ai-insight-finding">${esc(finding)}</div>${sections.length?`<div class="ai-insight-list">${sections.join('')}</div>`:''}`;
  }
  const style=document.createElement('style');style.textContent=`#analytics-insights{margin-bottom:14px}.ai-insight-finding{font-size:11px;line-height:1.45;padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:rgba(255,255,255,.42)}.ai-insight-list{margin-top:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.ai-insight-row{border:1px solid var(--line);border-radius:9px;padding:8px;background:rgba(255,255,255,.35)}.ai-insight-row span{display:block;font-size:9px;text-transform:uppercase;color:var(--ink-faint);margin-bottom:4px}.ai-insight-row b{display:block;font-size:10px;margin-top:2px}@media(max-width:650px){.ai-insight-list{grid-template-columns:1fr}}`;document.head.appendChild(style);
  const hook=()=>{render();setInterval(render,1500)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook,{once:true});else hook();
})();
