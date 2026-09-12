// Phase 5: MT5 tracking foundation. Read-only/import-first; no automated execution.
(function(){
  if(window.__obMT5Foundation)return; window.__obMT5Foundation=true;
  const KEY='ob-mt5-settings';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}};
  const write=v=>localStorage.setItem(KEY,JSON.stringify(v));
  const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'');
  function normalize(row){
    const r={...row};
    r.source='mt5_import';
    r.mode=r.mode||'Real';
    r.symbol=r.symbol||r.pair||r.instrument||'';
    r.direction=r.direction||r.type||r.side||'';
    r.entryPrice=Number(r.entryPrice??r.entry??r.openPrice)||0;
    r.exitPrice=Number(r.exitPrice??r.exit??r.closePrice)||0;
    r.stopLoss=Number(r.stopLoss??r.sl)||0;
    r.takeProfit=Number(r.takeProfit??r.tp)||0;
    r.lotSize=Number(r.lotSize??r.volume??r.lots)||0;
    r.profitLoss=Number(r.profitLoss??r.profit??r.pnl)||0;
    r.ticket=String(r.ticket??r.positionId??r.dealId??'');
    r.entryTime=r.entryTime||r.openTime||'';
    r.exitTime=r.exitTime||r.closeTime||'';
    r.status=r.status||'Closed';
    r.accountId=r.accountId||window.phase1Context?.accountId||window.obContext?.accountId||'real-main';
    r.id=r.id||`mt5-${r.ticket||Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    return r;
  }
  function parseFile(file){const reader=new FileReader();reader.onload=()=>{try{const d=JSON.parse(reader.result);const rows=Array.isArray(d)?d:(Array.isArray(d.trades)?d.trades:[]);if(!rows.length)throw new Error('No trades found');const incoming=rows.map(normalize);const existing=Array.isArray(window.trades)?window.trades:[];const ids=new Set(existing.map(t=>String(t.id)));const fresh=incoming.filter(t=>!ids.has(String(t.id)));window.trades=existing.concat(fresh);if(typeof saveTrades==='function')saveTrades();if(typeof render==='function')render();renderPanel();}catch(e){showMsg('MT5 import failed: '+e.message)}};reader.readAsText(file)}
  function showMsg(msg){if(typeof window.disciplineShowWarning==='function')window.disciplineShowWarning(msg);else window.alert(msg)}
  function renderPanel(){let p=document.getElementById('mt5-panel');if(!p){p=document.createElement('div');p.id='mt5-panel';p.className='panel glass';const a=document.getElementById('backup-panel')||document.getElementById('analytics-risk-panel')||document.querySelector('.wrap');a?.parentNode?.insertBefore(p,a?.nextSibling||null)}const s=read();p.innerHTML=`<h2>MT5 tracking <small>read-only foundation</small></h2><div class="mt5-row"><div><strong>Connection status</strong><span>${esc(s.connected?'Connected':'Not connected')}</span><small>No automated trading. The first bridge stage imports/syncs trade history only.</small></div><div class="mt5-actions"><button id="mt5-import" type="button">Import MT5 JSON</button><button id="mt5-config" type="button">Configure</button><input id="mt5-file" type="file" accept="application/json,.json" hidden></div></div><div class="mt5-fields"><label>Account ID<input id="mt5-account" value="${esc(s.accountId||'real-main')}"></label><label>Terminal/bridge label<input id="mt5-label" value="${esc(s.label||'MT5 Terminal')}"></label></div><div class="mt5-flow">MT5 Terminal → EA / Bridge → Trading System → Supabase → Dashboard</div>`;
    document.getElementById('mt5-import').onclick=()=>document.getElementById('mt5-file').click();
    document.getElementById('mt5-file').onchange=e=>e.target.files[0]&&parseFile(e.target.files[0]);
    document.getElementById('mt5-config').onclick=()=>{const n={...read(),accountId:document.getElementById('mt5-account').value.trim()||'real-main',label:document.getElementById('mt5-label').value.trim()||'MT5 Terminal',connected:false};write(n);renderPanel()};
  }
  const st=document.createElement('style');st.textContent=`#mt5-panel{margin-bottom:14px}.mt5-row{display:flex;justify-content:space-between;gap:14px;align-items:center}.mt5-row strong,.mt5-row span,.mt5-row small{display:block}.mt5-row span{font-size:12px;font-weight:700;margin-top:4px}.mt5-row small{font-size:9.5px;color:var(--ink-faint);margin-top:4px}.mt5-actions{display:flex;gap:7px}.mt5-actions button{border:1px solid var(--line-strong);background:rgba(255,255,255,.7);border-radius:8px;padding:8px 11px;font:600 10px inherit;color:var(--ink-soft);cursor:pointer}.mt5-actions button:first-child{background:rgba(47,111,237,.1);color:var(--accent)}.mt5-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:11px}.mt5-fields label{font-size:9px;color:var(--ink-faint);text-transform:uppercase}.mt5-fields input{display:block;width:100%;box-sizing:border-box;margin-top:4px;border:1px solid var(--line);border-radius:8px;padding:8px;background:rgba(255,255,255,.55);color:var(--ink);font:500 11px inherit}.mt5-flow{margin-top:10px;padding:8px 10px;border:1px dashed var(--line-strong);border-radius:8px;font-size:9.5px;color:var(--ink-faint)}@media(max-width:650px){.mt5-row{flex-direction:column;align-items:stretch}.mt5-actions button{flex:1}.mt5-fields{grid-template-columns:1fr}}`;document.head.appendChild(st);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderPanel,{once:true});else renderPanel();
  window.obMT5={normalize,render:renderPanel,settings:read};
})();
