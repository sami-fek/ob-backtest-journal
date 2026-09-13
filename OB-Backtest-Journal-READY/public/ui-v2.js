/* UI v2 behavior hook. The existing application logic remains the source of truth. */
(function(){
  function apply(){
    document.documentElement.dataset.ui='pro-os';
    document.body.classList.add('pro-os-ui');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',apply); else apply();
})();
