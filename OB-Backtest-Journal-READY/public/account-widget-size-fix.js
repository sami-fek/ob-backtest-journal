(() => {
  const STYLE_ID = 'account-widget-size-fix-v1';
  function apply() {
    if (!document.getElementById('wallet-account-carousel')) return;
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #wallet-account-carousel .wallet-card{height:140px;padding:14px 15px 12px;border-radius:18px}
        #wallet-account-carousel .wallet-body{margin-top:18px}
        #wallet-account-carousel .wallet-balance{font-size:23px}
        #wallet-account-carousel .wallet-foot{margin-top:11px;padding-top:7px}
        #wallet-account-carousel .wallet-meta{margin-top:0}
        #wallet-account-carousel .wallet-capital{margin-top:6px;font-size:9px}
      `;
      document.head.appendChild(style);
    }
  }
  function boot(){ apply(); [100,300,600,1000].forEach(ms => setTimeout(apply, ms)); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
