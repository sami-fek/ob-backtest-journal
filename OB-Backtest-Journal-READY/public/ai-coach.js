(() => {
  const STYLE_ID = 'ob-ai-chat-style-v2';
  const CHAT_ID = 'ob-ai-chat';
  let currentTradeId = null;
  let busy = false;

  function style() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style'); s.id = STYLE_ID;
    s.textContent = `
      #${CHAT_ID}{position:fixed;inset:0;z-index:100;background:rgba(15,23,42,.18);backdrop-filter:blur(3px);display:flex;align-items:stretch;justify-content:flex-end}
      #${CHAT_ID}.hidden{display:none}
      #${CHAT_ID} .chat-panel{width:min(460px,100%);height:100%;background:#fff;border-left:1px solid #e2e8f0;box-shadow:-18px 0 50px rgba(15,23,42,.14);display:flex;flex-direction:column}
      #${CHAT_ID} .chat-messages{flex:1;overflow:auto;padding:18px 16px;display:flex;flex-direction:column;gap:12px}
      #${CHAT_ID} .msg{max-width:88%;padding:10px 12px;border-radius:15px;font-size:13px;line-height:1.55;white-space:pre-wrap}
      #${CHAT_ID} .msg.user{align-self:flex-end;background:#2563eb;color:#fff;border-bottom-right-radius:5px}
      #${CHAT_ID} .msg.ai{align-self:flex-start;background:#f1f5f9;color:#334155;border-bottom-left-radius:5px}
      #${CHAT_ID} .chat-input{border-top:1px solid #e2e8f0;padding:12px;display:flex;gap:8px;background:#fff}
      #${CHAT_ID} textarea{flex:1;resize:none;min-height:42px;max-height:120px;border:1px solid #cbd5e1;border-radius:13px;padding:10px 12px;font-size:13px;outline:none}
      #${CHAT_ID} textarea:focus{border-color:#60a5fa}
      #${CHAT_ID} .send{width:42px;height:42px;border-radius:13px;background:#2563eb;color:#fff;border:0;cursor:pointer}
      #${CHAT_ID} .send:disabled{opacity:.45;cursor:not-allowed}
      @media(max-width:640px){#${CHAT_ID} .chat-panel{width:100%}}
    `;
    document.head.appendChild(s);
  }

  function ensureChat(trade) {
    style();
    let root = document.getElementById(CHAT_ID);
    if (!root) {
      root = document.createElement('div'); root.id = CHAT_ID; root.className = 'hidden';
      root.innerHTML = `<div class="chat-panel">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div><div class="text-[10px] uppercase tracking-widest font-bold text-blue-600">AI Coach</div><div id="obChatTitle" class="text-sm font-bold text-slate-900">Trade chat</div></div>
          <button id="obChatClose" class="text-slate-400 hover:text-slate-700 text-lg"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="obChatMessages" class="chat-messages"></div>
        <div class="chat-input"><textarea id="obChatInput" placeholder="Ask about this trade…"></textarea><button id="obChatSend" class="send" aria-label="Send"><i class="fa-solid fa-arrow-up"></i></button></div>
      </div>`;
      document.body.appendChild(root);
      root.querySelector('#obChatClose').onclick = () => root.classList.add('hidden');
      root.addEventListener('click', e => { if(e.target === root) root.classList.add('hidden'); });
      const input = root.querySelector('#obChatInput');
      root.querySelector('#obChatSend').onclick = () => sendMessage();
      input.addEventListener('keydown', e => { if(e.key === 'Enter' && !e.shiftKey){e.preventDefault();sendMessage();} });
    }
    root.querySelector('#obChatTitle').textContent = `${trade.pair || 'Trade'} · AI Coach`;
    return root;
  }

  function readTrade(id) {
    try { const raw=localStorage.getItem('my_journal_trades_v1'); const list=raw?JSON.parse(raw):[]; return Array.isArray(list)?list.find(t=>String(t.id)===String(id)):null; } catch(_){ return null; }
  }
  function openChat(trade) {
    currentTradeId = trade.id; const root=ensureChat(trade); const box=root.querySelector('#obChatMessages');
    box.innerHTML='';
    addMessage('ai', `I’m ready to review this ${trade.pair || 'trade'}. Ask me anything about the setup, execution, checklist, risk/reward, or what you could improve.`);
    root.classList.remove('hidden'); root.querySelector('#obChatInput').focus();
  }
  function addMessage(role,text){ const box=document.querySelector(`#${CHAT_ID} #obChatMessages`); if(!box)return; const d=document.createElement('div'); d.className=`msg ${role}`; d.textContent=text; box.appendChild(d); box.scrollTop=box.scrollHeight; return d; }

  function makeMessages(trade, question) {
    const checklist=Array.isArray(trade.checklist)?trade.checklist:[];
    const shots=Array.isArray(trade.screenshots)?trade.screenshots.filter(x=>typeof x==='string'&&x.startsWith('data:image/')).slice(0,3):[];
    const context=`TRADE: ${trade.pair||'—'} | ${trade.timeframe||'—'} | ${trade.direction||'—'} | ${trade.result||'—'} | ${Number(trade.rMultiple||0).toFixed(2)}R\nMODE: ${trade.mode||'—'} | SESSION: ${trade.session||'—'} | REGIME: ${trade.regime||'—'} | STRATEGY: ${trade.strategy||'—'}\nNOTE: ${(trade.notes||'').trim()||'(none)'}\nCHECKLIST: ${checklist.length?checklist.map((x,i)=>`${i+1}. ${x}`).join(' | '):'(not recorded)'}\nSCREENSHOTS: ${shots.length}`;
    const content=[{type:'text',text:`You are the trading AI Coach inside a journal. Maintain a natural conversational chat. Answer the user's question directly using the trade context. Be concise but useful. Do not invent market facts or price levels.\n\n${context}\n\nUSER QUESTION: ${question}`}];
    shots.forEach(url=>content.push({type:'image_url',image_url:{url}}));
    return [{role:'system',content:'You are a practical trading coach. Discuss the supplied journal trade naturally like a chatbot. Do not reveal hidden reasoning.'},{role:'user',content}];
  }

  async function sendMessage() {
    if(busy || currentTradeId==null)return;
    const input=document.querySelector(`#${CHAT_ID} #obChatInput`); const question=input.value.trim(); if(!question)return;
    const trade=readTrade(currentTradeId); if(!trade)return;
    input.value=''; addMessage('user',question); const pending=addMessage('ai','Thinking…'); busy=true;
    const send=document.querySelector(`#${CHAT_ID} #obChatSend`); send.disabled=true;
    try {
      const shots=Array.isArray(trade.screenshots)?trade.screenshots.some(x=>typeof x==='string'&&x.startsWith('data:image/')):false;
      const model=shots?'qwen/qwen3.6-27b':'openai/gpt-oss-20b';
      const r=await fetch('/api/ai',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'groq',model,messages:makeMessages(trade,question),max_completion_tokens:800,temperature:.3})});
      const b=await r.json().catch(()=>({})); if(!r.ok)throw new Error(b?.error?.message||b?.error||`AI request failed (${r.status})`);
      const text=b?.choices?.[0]?.message?.content||b?.choices?.[0]?.text||''; if(!text.trim())throw new Error('AI returned an empty response.');
      pending.textContent=text.trim();
    } catch(e){ pending.textContent=e?.message||'Unable to reach the AI right now.'; }
    finally { busy=false;send.disabled=false;input.focus(); }
  }

  function hookDrawer() {
    if(typeof window.openDrawer!=='function'||window.openDrawer.__obAiWrapped)return;
    const original=window.openDrawer;
    const wrapped=function(id){ window.__obJournalOpenTradeId=id; const result=original.apply(this,arguments); setTimeout(()=>{const t=readTrade(id); if(t){ const root=document.getElementById('tradeDrawer'); const btn=[...root.querySelectorAll('button')].find(b=>b.textContent.includes('Analyze with AI')); if(btn&&!btn.dataset.aiCoachBound){btn.dataset.aiCoachBound='1';btn.onclick=e=>{e.preventDefault();e.stopPropagation();openChat(t);};}}},50); return result; };
    wrapped.__obAiWrapped=true; window.openDrawer=wrapped;
  }
  function attach(){hookDrawer();const root=document.getElementById('tradeDrawer');if(!root)return;const btn=[...root.querySelectorAll('button')].find(b=>b.textContent.includes('Analyze with AI'));if(btn&&!btn.dataset.aiCoachBound){btn.dataset.aiCoachBound='1';btn.onclick=e=>{e.preventDefault();e.stopPropagation();const t=readTrade(window.__obJournalOpenTradeId);if(t)openChat(t);};}}
  function boot(){style();attach();[100,300,700,1200].forEach(ms=>setTimeout(attach,ms));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('load',attach);
})();
