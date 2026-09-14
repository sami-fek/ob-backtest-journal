(() => {
  const DISCIPLINE_STAT_ID='statCleanTrades', ACCOUNT_BALANCE_ID='accountBalanceDisplay', EQUITY_CANVAS_ID='chartEquityConsole', HEATMAP_ID='journalPnlHeatmap', JOURNAL_ID='pageJournal', TRADING_ID='pageTrading', STYLE_ID='equity-heatmap-account-layout-style';
  const cardFrom=id=>document.getElementById(id)?.closest('.glass-card');
  const disciplineCard=()=>cardFrom(DISCIPLINE_STAT_ID), accountCard=()=>cardFrom(ACCOUNT_BALANCE_ID), equityCard=()=>cardFrom(EQUITY_CANVAS_ID), heatmap=()=>document.getElementById(HEATMAP_ID);
  function styles(){if(document.getElementById(STYLE_ID))return;const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
    #ob-trading-pnl-account-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(300px,1fr);gap:24px;align-items:start;margin-top:20px}
    #ob-trading-pnl-account-row>.glass-card{min-width:0;margin-top:0!important}
    #ob-journal-equity-discipline-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(300px,1fr);gap:20px;align-items:start;margin-top:20px}
    #ob-journal-equity-discipline-row>.glass-card{min-width:0;margin-top:0!important}
    @media(max-width:900px){#ob-trading-pnl-account-row,#ob-journal-equity-discipline-row{grid-template-columns:1fr}}
  `;document.head.appendChild(s)}
  function tradingRow(trading){let row=document.getElementById('ob-trading-pnl-account-row');if(!row){row=document.createElement('div');row.id='ob-trading-pnl-account-row';const anchor=trading.querySelector(':scope > .glass-card');if(anchor?.nextSibling)trading.insertBefore(row,anchor.nextSibling);else trading.appendChild(row)}return row}
  function journalRow(journal){let row=document.getElementById('ob-journal-equity-discipline-row');if(!row){row=document.createElement('div');row.id='ob-journal-equity-discipline-row';const table=journal.querySelector('#journalTableBody')?.closest('.glass-card');if(table?.nextSibling)journal.insertBefore(row,table.nextSibling);else journal.appendChild(row)}return row}
  function move(){
    const journal=document.getElementById(JOURNAL_ID), trading=document.getElementById(TRADING_ID);if(!journal||!trading)return;
    styles();
    const hm=heatmap(), account=accountCard(), eq=equityCard(), discipline=disciplineCard();
    const tr=tradingRow(trading);
    if(hm)tr.appendChild(hm);
    if(account)tr.appendChild(account);
    const jr=journalRow(journal);
    if(eq)jr.appendChild(eq);
    if(discipline)jr.appendChild(discipline);
    const oldJournalHeatmap=document.querySelector('#pageJournal #journalPnlHeatmap');if(oldJournalHeatmap)tr.appendChild(oldJournalHeatmap);
    const oldJournalAccount=document.querySelector('#pageJournal #wallet-account-carousel')?.closest('.glass-card');if(oldJournalAccount)tr.appendChild(oldJournalAccount);
  }
  function schedule(){[0,50,150,300,600,1000,1800,3000].forEach(ms=>setTimeout(move,ms))}
  function boot(){schedule();const st=window.switchTab;if(typeof st==='function'&&!st.__pnlAccountLayout){const w=function(...a){const r=st.apply(this,a);schedule();return r};w.__pnlAccountLayout=true;window.switchTab=w}const sm=window.switchMode;if(typeof sm==='function'&&!sm.__pnlAccountModeLayout){const w=function(...a){const r=sm.apply(this,a);schedule();return r};w.__pnlAccountModeLayout=true;window.switchMode=w}window.addEventListener('wallet-accounts-updated',schedule);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
