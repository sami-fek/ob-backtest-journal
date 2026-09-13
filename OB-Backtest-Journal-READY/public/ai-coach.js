(() => {
  const STYLE_ID = 'ob-ai-coach-style-v1';
  const MODAL_ID = 'ob-ai-coach-modal';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${MODAL_ID}{position:fixed;inset:0;z-index:100;background:rgba(15,23,42,.35);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px}
      #${MODAL_ID}.hidden{display:none}
      #${MODAL_ID} .ai-panel{width:min(720px,100%);max-height:min(82vh,760px);overflow:auto;background:#fff;border:1px solid #e2e8f0;border-radius:20px;box-shadow:0 24px 70px rgba(15,23,42,.18)}
      #${MODAL_ID} .ai-answer{white-space:pre-wrap;font-size:13px;line-height:1.7;color:#334155}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    ensureStyle();
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'hidden';
    modal.innerHTML = `
      <div class="ai-panel">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div class="text-[10px] uppercase tracking-widest font-bold text-blue-600">AI Coach</div>
            <div id="obAiTitle" class="text-sm font-bold text-slate-900 mt-0.5">Trade analysis</div>
          </div>
          <button id="obAiClose" class="text-slate-400 hover:text-slate-700 text-lg" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="px-5 py-5">
          <div id="obAiStatus" class="text-xs text-slate-400 mb-3">Analyzing…</div>
          <div id="obAiAnswer" class="ai-answer"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#obAiClose').onclick = () => modal.classList.add('hidden');
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
    return modal;
  }

  function getTradeById(id) {
    try {
      const raw = localStorage.getItem('my_journal_trades_v1');
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) return list.find(t => String(t.id) === String(id)) || null;
    } catch (_) {}
    return null;
  }

  function getCurrentTrade() {
    const id = window.__obJournalOpenTradeId;
    if (id != null) return getTradeById(id);
    try {
      const pair = document.getElementById('drawerPair')?.textContent?.trim();
      if (!pair) return null;
      const raw = localStorage.getItem('my_journal_trades_v1');
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.find(t => t.pair === pair) || null : null;
    } catch (_) { return null; }
  }

  function buildMessages(trade) {
    const checklist = Array.isArray(trade.checklist) ? trade.checklist : [];
    const screenshots = Array.isArray(trade.screenshots) ? trade.screenshots.filter(x => typeof x === 'string' && x.startsWith('data:image/')).slice(0, 3) : [];
    const evidence = [
      `TRADE: ${trade.pair || '—'} | ${trade.timeframe || '—'} | ${trade.direction || '—'} | ${trade.result || '—'} | ${Number(trade.rMultiple || 0).toFixed(2)}R`,
      `MODE: ${trade.mode || '—'} | SESSION: ${trade.session || '—'} | REGIME: ${trade.regime || '—'} | STRATEGY: ${trade.strategy || '—'}`,
      `NOTE: ${(trade.notes || '').trim() || '(no note)'}`,
      `CHECKLIST: ${checklist.length ? checklist.map((s, i) => `${i + 1}. ${s}`).join(' | ') : '(not recorded)'}`,
      `SCREENSHOTS: ${screenshots.length}`
    ].join('\n');

    const content = [{
      type: 'text',
      text: `Analyze this single trading journal entry as a direct trading coach. Use only the evidence supplied. Evaluate execution quality, checklist/rule adherence, setup quality, risk/reward, what was done well, what was weak, and one practical improvement. Do not invent price levels or market facts that are not in the evidence.\n\n${evidence}`
    }];
    screenshots.forEach(url => content.push({ type: 'image_url', image_url: { url } }));
    return [
      { role: 'system', content: 'You are the AI Coach inside a trading journal. Give concise, evidence-based trade feedback. Do not reveal hidden reasoning.' },
      { role: 'user', content }
    ];
  }

  async function analyzeTrade(trade, button) {
    const modal = ensureModal();
    const title = modal.querySelector('#obAiTitle');
    const status = modal.querySelector('#obAiStatus');
    const answer = modal.querySelector('#obAiAnswer');
    const screenshots = Array.isArray(trade.screenshots) ? trade.screenshots.filter(x => typeof x === 'string' && x.startsWith('data:image/')) : [];
    const model = screenshots.length ? 'qwen/qwen3.6-27b' : 'openai/gpt-oss-20b';

    title.textContent = `${trade.pair || 'Trade'} · AI analysis`;
    status.textContent = screenshots.length ? 'Analyzing trade + screenshot evidence…' : 'Analyzing trade evidence…';
    answer.textContent = '';
    modal.classList.remove('hidden');
    if (button) { button.disabled = true; button.dataset.aiBusy = '1'; }

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'groq', model, messages: buildMessages(trade), max_completion_tokens: 800, temperature: 0.3 })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || body?.error || `AI request failed (${response.status})`);
      const text = body?.choices?.[0]?.message?.content || body?.choices?.[0]?.text || '';
      if (!text.trim()) throw new Error('AI returned an empty response.');
      status.textContent = `Groq · ${model}`;
      answer.textContent = text.trim();
    } catch (error) {
      console.error('[OB Journal] AI Coach failed:', error);
      status.textContent = 'AI analysis failed';
      answer.textContent = error?.message || 'Unable to analyze this trade right now.';
    } finally {
      if (button) { button.disabled = false; delete button.dataset.aiBusy; }
    }
  }

  function hookDrawer() {
    if (typeof window.openDrawer !== 'function' || window.openDrawer.__obAiWrapped) return;
    const original = window.openDrawer;
    const wrapped = function(id) {
      window.__obJournalOpenTradeId = id;
      return original.apply(this, arguments);
    };
    wrapped.__obAiWrapped = true;
    window.openDrawer = wrapped;
  }

  function attach() {
    ensureStyle();
    hookDrawer();
    document.querySelectorAll('#tradeDrawer button').forEach(button => {
      if (button.dataset.aiCoachBound === '1') return;
      if (!button.textContent.includes('Analyze with AI')) return;
      button.dataset.aiCoachBound = '1';
      button.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const trade = getCurrentTrade();
        if (!trade) {
          const modal = ensureModal();
          modal.querySelector('#obAiStatus').textContent = 'AI analysis failed';
          modal.querySelector('#obAiAnswer').textContent = 'No open trade was found. Open a trade first, then run Analyze with AI.';
          modal.classList.remove('hidden');
          return;
        }
        analyzeTrade(trade, button);
      });
    });
  }

  function boot() {
    attach();
    [100, 300, 700, 1200].forEach(ms => setTimeout(attach, ms));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('load', attach);
})();
