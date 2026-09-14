(() => {
  const STYLE_ID = 'ob-ai-chat-style-v4';
  const CHAT_ID = 'ob-ai-chat';
  const FAB_ID = 'ob-ai-fab';
  let currentTradeId = null;
  let currentImages = [];
  let chatHistory = [];
  let busy = false;

  function style() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style'); s.id = STYLE_ID;
    s.textContent = `
      #${FAB_ID}{position:fixed;right:22px;bottom:22px;z-index:90;border:1px solid #bfdbfe;background:rgba(255,255,255,.94);color:#2563eb;box-shadow:0 10px 30px rgba(15,23,42,.14);backdrop-filter:blur(10px);border-radius:14px;padding:10px 14px;font-size:12px;font-weight:800;cursor:pointer;transition:.18s}
      #${FAB_ID}:hover{background:#eff6ff;transform:translateY(-1px);box-shadow:0 13px 34px rgba(15,23,42,.18)}
      #${CHAT_ID}{position:fixed;inset:0;z-index:100;background:rgba(15,23,42,.18);backdrop-filter:blur(3px);display:flex;align-items:stretch;justify-content:flex-end}
      #${CHAT_ID}.hidden{display:none}
      #${CHAT_ID} .chat-panel{width:min(500px,100%);height:100%;background:#fff;border-left:1px solid #e2e8f0;box-shadow:-18px 0 50px rgba(15,23,42,.14);display:flex;flex-direction:column}
      #${CHAT_ID} .chat-messages{flex:1;overflow:auto;padding:18px 16px;display:flex;flex-direction:column;gap:12px}
      #${CHAT_ID} .msg{max-width:90%;padding:10px 12px;border-radius:15px;font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
      #${CHAT_ID} .msg.user{align-self:flex-end;background:#2563eb;color:#fff;border-bottom-right-radius:5px}
      #${CHAT_ID} .msg.ai{align-self:flex-start;background:#f1f5f9;color:#334155;border-bottom-left-radius:5px}
      #${CHAT_ID} .chat-input{border-top:1px solid #e2e8f0;padding:10px 12px;background:#fff}
      #${CHAT_ID} textarea{width:100%;resize:none;min-height:42px;max-height:120px;border:1px solid #cbd5e1;border-radius:13px;padding:10px 12px;font-size:13px;outline:none}
      #${CHAT_ID} textarea:focus{border-color:#60a5fa}
      #${CHAT_ID} .input-row{display:flex;gap:8px;margin-top:8px;align-items:center}
      #${CHAT_ID} .tool{height:38px;border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:11px;padding:0 10px;font-size:12px;font-weight:700;cursor:pointer}
      #${CHAT_ID} .tool:hover{background:#f8fafc}
      #${CHAT_ID} .send{margin-left:auto;width:42px;height:38px;border-radius:11px;background:#2563eb;color:#fff;border:0;cursor:pointer}
      #${CHAT_ID} .send:disabled{opacity:.45;cursor:not-allowed}
      #${CHAT_ID} .image-count{font-size:11px;color:#64748b}
      #${CHAT_ID} .context{font-size:10px;color:#64748b;border-top:1px solid #f1f5f9;padding:7px 12px}
      @media(max-width:640px){#${CHAT_ID} .chat-panel{width:100%}#${FAB_ID}{right:14px;bottom:14px}}
    `;
    document.head.appendChild(s);
  }

  function ensureFab() {
    style();
    let fab = document.getElementById(FAB_ID);
    if (!fab) {
      fab = document.createElement('button'); fab.id = FAB_ID;
      fab.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-1.5"></i> AI Coach';
      fab.title = 'Open AI Coach';
      fab.onclick = () => openGlobalChat();
      document.body.appendChild(fab);
    }
  }

  function ensureChat() {
    style();
    let root = document.getElementById(CHAT_ID);
    if (!root) {
      root = document.createElement('div'); root.id = CHAT_ID; root.className = 'hidden';
      root.innerHTML = `<div class="chat-panel">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div><div class="text-[10px] uppercase tracking-widest font-bold text-blue-600">AI Coach</div><div id="obChatTitle" class="text-sm font-bold text-slate-900">Journal assistant</div></div>
          <button id="obChatClose" class="text-slate-400 hover:text-slate-700 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="obChatContext" class="context"></div>
        <div id="obChatMessages" class="chat-messages"></div>
        <div class="chat-input">
          <textarea id="obChatInput" placeholder="Ask me to analyze your trades, journal, notes, checklist, images, performance…"></textarea>
          <div class="input-row">
            <input id="obChatImageInput" type="file" accept="image/*" multiple hidden>
            <button id="obChatImageBtn" class="tool"><i class="fa-regular fa-image mr-1"></i> Add image</button>
            <span id="obChatImageCount" class="image-count"></span>
            <button id="obChatSend" class="send" aria-label="Send"><i class="fa-solid fa-arrow-up"></i></button>
          </div>
        </div>
      </div>`;
      document.body.appendChild(root);
      root.querySelector('#obChatClose').onclick = () => root.classList.add('hidden');
      root.addEventListener('click', e => { if(e.target === root) root.classList.add('hidden'); });
      root.querySelector('#obChatSend').onclick = sendMessage;
      root.querySelector('#obChatImageBtn').onclick = () => root.querySelector('#obChatImageInput').click();
      root.querySelector('#obChatImageInput').onchange = async e => {
        const files = [...(e.target.files || [])].filter(f => f.type.startsWith('image/')).slice(0,5);
        currentImages = [];
        for (const f of files) currentImages.push(await fileToDataUrl(f));
        root.querySelector('#obChatImageCount').textContent = currentImages.length ? `${currentImages.length} image${currentImages.length>1?'s':''} attached` : '';
        e.target.value = '';
      };
      root.querySelector('#obChatInput').addEventListener('keydown', e => { if(e.key === 'Enter' && !e.shiftKey){e.preventDefault();sendMessage();} });
    }
    return root;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result)); r.onerror=reject; r.readAsDataURL(file); });
  }

  function readTrades() {
    try { const raw=localStorage.getItem('my_journal_trades_v1'); const list=raw?JSON.parse(raw):[]; return Array.isArray(list)?list:[]; } catch(_){ return []; }
  }
  function readTrade(id) { return readTrades().find(t=>String(t.id)===String(id)) || null; }

  function currentMode() {
    const ids=['Backtest','Demo','Real','Funded'];
    const active=ids.find(id=>{ const b=document.getElementById(`modeBtn-${id}`); return b && (b.className.includes('bg-white') || b.className.includes('bg-blue') || b.getAttribute('aria-selected')==='true'); });
    if(active)return active;
    try { return typeof activeMode!=='undefined' ? activeMode : 'Demo'; } catch(_){ return 'Demo'; }
  }

  function currentAccountId(mode) {
    if(mode==='Backtest')return null;
    try { return localStorage.getItem(`my_journal_active_account_${mode}_v1`) || null; } catch(_){ return null; }
  }

  function relevantTrades() {
    const all=readTrades();
    const mode=currentMode();
    if(mode==='Backtest') return all.filter(t=>(t.mode||'Backtest')==='Backtest');
    const accountId=currentAccountId(mode);
    const byMode=all.filter(t=>(t.mode||'Demo')===mode);
    return accountId ? byMode.filter(t=>!t.accountId || String(t.accountId)===String(accountId)) : byMode;
  }

  function accountContext() {
    const mode=currentMode(); const accountId=currentAccountId(mode); let name='';
    try { const data=JSON.parse(localStorage.getItem('my_journal_accounts_v1')||'{}'); const a=(data[mode]||[]).find(x=>String(x.id)===String(accountId)); if(a)name=a.name||''; } catch(_){ }
    return name ? `${mode} · ${name}` : mode;
  }

  function compactTrade(t) {
    const checklist=Array.isArray(t.checklist)?t.checklist:[];
    return {date:t.date||t.createdAt||'',pair:t.pair||'',timeframe:t.timeframe||'',mode:t.mode||'',session:t.session||'',regime:t.regime||'',strategy:t.strategy||'',direction:t.direction||'',result:t.result||'',rMultiple:Number(t.rMultiple||0),riskPercent:t.riskPercent,notes:(t.notes||'').trim(),checklist,screenshots:Array.isArray(t.screenshots)?t.screenshots.length:0};
  }

  function datasetText(trades) {
    const rows=trades.slice(-80).map(compactTrade);
    const wins=trades.filter(t=>String(t.result||'').toLowerCase().includes('win')).length;
    const losses=trades.filter(t=>String(t.result||'').toLowerCase().includes('loss')).length;
    const r=trades.reduce((s,t)=>s+Number(t.rMultiple||0),0);
    return `CURRENT JOURNAL CONTEXT\nACCOUNT: ${accountContext()}\nTRADES IN CURRENT VIEW: ${trades.length}\nSUMMARY: ${wins} wins, ${losses} losses, ${r.toFixed(2)}R total (based on recorded R-multiples)\nRECENT/AVAILABLE TRADE DATA (up to 80):\n${JSON.stringify(rows)}`;
  }

  function tradeContext(trade) { return `SELECTED TRADE\n${JSON.stringify(compactTrade(trade))}`; }

  function makeMessages(question, trade) {
    const context=[datasetText(relevantTrades()), trade ? tradeContext(trade) : 'NO SINGLE TRADE SELECTED'];
    const content=[{type:'text',text:`You are the AI Coach inside a trading journal. Act like a practical conversational coach. Analyze ONLY the supplied journal data and images; do not invent market facts, price levels, or missing trade details. The user may ask about one trade, multiple trades, notes, checklist quality, screenshots/images, performance, patterns, discipline, or any combination. Treat notes and images as first-class evidence, not just the checklist. If the data is insufficient, say exactly what is missing.\n\n${context.join('\n\n')}\n\nUSER QUESTION: ${question}`}];
    currentImages.slice(0,5).forEach(url=>content.push({type:'image_url',image_url:{url}}));
    return [{role:'system',content:'You are a practical trading coach. Maintain natural multi-turn conversation. Do not reveal hidden reasoning.'}, ...chatHistory, {role:'user',content}];
  }

  function addMessage(role,text){ const box=document.querySelector(`#${CHAT_ID} #obChatMessages`); if(!box)return null; const d=document.createElement('div'); d.className=`msg ${role}`; d.textContent=text; box.appendChild(d); box.scrollTop=box.scrollHeight; return d; }

  function openGlobalChat() {
    currentTradeId=null; currentImages=[]; chatHistory=[];
    const root=ensureChat(); root.querySelector('#obChatTitle').textContent='Journal assistant';
    root.querySelector('#obChatContext').textContent=`Context: ${accountContext()} · ${relevantTrades().length} trade${relevantTrades().length===1?'':'s'} available`;
    root.querySelector('#obChatMessages').innerHTML=''; root.querySelector('#obChatImageCount').textContent='';
    addMessage('ai', `I’m ready. I can analyze your ${accountContext()} journal using the recorded trade data, notes, checklist, and screenshots. You can also attach an image and ask me about it.`);
    root.classList.remove('hidden'); root.querySelector('#obChatInput').focus();
  }

  function openTradeChat(trade) {
    currentTradeId=trade.id; currentImages=[]; chatHistory=[];
    const root=ensureChat(); root.querySelector('#obChatTitle').textContent=`${trade.pair || 'Trade'} · AI Coach`;
    root.querySelector('#obChatContext').textContent=`Context: ${accountContext()} · selected trade`;
    root.querySelector('#obChatMessages').innerHTML=''; root.querySelector('#obChatImageCount').textContent='';
    addMessage('ai', `I’m ready to review this ${trade.pair || 'trade'}. Ask me anything about the setup, execution, notes, checklist, screenshots, risk/reward, or what you could improve.`);
    root.classList.remove('hidden'); root.querySelector('#obChatInput').focus();
  }

  async function sendMessage() {
    if(busy)return;
    const root=document.getElementById(CHAT_ID); if(!root)return;
    const input=root.querySelector('#obChatInput'); const question=input.value.trim(); if(!question)return;
    const trade=currentTradeId!=null?readTrade(currentTradeId):null;
    input.value=''; addMessage('user',question); const pending=addMessage('ai','Thinking…'); busy=true; root.querySelector('#obChatSend').disabled=true;
    try {
      const hasTradeShots=!!(trade&&Array.isArray(trade.screenshots)&&trade.screenshots.some(x=>typeof x==='string'&&x.startsWith('data:image/')));
      if(!currentImages.length && hasTradeShots) currentImages=trade.screenshots.filter(x=>typeof x==='string'&&x.startsWith('data:image/')).slice(0,5);
      const hasImages=currentImages.length>0;
      const model=hasImages?'qwen/qwen3.6-27b':'openai/gpt-oss-20b';
      const messages=makeMessages(question,trade);
      const r=await fetch('/api/ai',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'groq',model,messages,max_completion_tokens:800,temperature:.3})});
      const b=await r.json().catch(()=>({})); if(!r.ok)throw new Error(b?.error?.message||b?.error||`AI request failed (${r.status})`);
      const text=(b?.choices?.[0]?.message?.content||b?.choices?.[0]?.text||'').trim(); if(!text)throw new Error('AI returned an empty response.');
      pending.textContent=text;
      chatHistory.push({role:'user',content:question},{role:'assistant',content:text});
      if(chatHistory.length>12)chatHistory=chatHistory.slice(-12);
    } catch(e){ pending.textContent=e?.message||'Unable to reach the AI right now.'; }
    finally { busy=false;root.querySelector('#obChatSend').disabled=false;input.focus(); }
  }

  function bindTradeButton() {
    const root=document.getElementById('tradeDrawer'); if(!root)return;
    const btn=[...root.querySelectorAll('button')].find(b=>b.textContent.includes('Analyze with AI'));
    if(btn&&!btn.dataset.aiCoachBound){ btn.dataset.aiCoachBound='1'; btn.onclick=e=>{e.preventDefault();e.stopPropagation();const t=readTrade(window.__obJournalOpenTradeId);if(t)openTradeChat(t);}; }
  }

  function hookDrawer() {
    if(typeof window.openDrawer!=='function'||window.openDrawer.__obAiWrapped)return;
    const original=window.openDrawer;
    const wrapped=function(id){ window.__obJournalOpenTradeId=id; const result=original.apply(this,arguments); setTimeout(bindTradeButton,50); return result; };
    wrapped.__obAiWrapped=true; window.openDrawer=wrapped;
  }

  function boot(){ style(); ensureFab(); hookDrawer(); bindTradeButton(); [100,300,700,1200].forEach(ms=>setTimeout(()=>{ensureFab();hookDrawer();bindTradeButton();},ms)); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('load',()=>{ensureFab();hookDrawer();bindTradeButton();});
})();
