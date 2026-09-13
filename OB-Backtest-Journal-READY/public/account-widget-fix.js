(() => {
  function initAccountWidgetFix() {
    const card = document.getElementById('accountBalanceDisplay')?.closest('.glass-card');
    const panel = document.getElementById('accountBalanceDisplay')?.closest('.bg-gradient-to-br');
    const wrap = document.getElementById('accountSelectorWrap');
    if (!card || !panel || !wrap) return;

    panel.insertBefore(wrap, panel.firstChild);
    wrap.className = 'flex items-center justify-between gap-2 mb-2';
    const label = wrap.querySelector('span');
    if (label) label.className = 'text-[10px] uppercase tracking-wider font-bold text-blue-200';
    const select = document.getElementById('accountSelector');
    if (select) select.className = 'min-w-[150px] max-w-[65%] bg-white/10 border border-blue-700/70 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white focus:outline-none focus:border-blue-300';

    if (!panel.__accountSwipeReady) {
      panel.__accountSwipeReady = true;
      let startX = 0, startY = 0;
      panel.addEventListener('touchstart', e => {
        if (e.touches.length === 1) { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }
      }, { passive: true });
      panel.addEventListener('touchend', e => {
        if (!startX || e.changedTouches.length !== 1) return;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        startX = startY = 0;
        if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy)) return;
        if (typeof window.__cycleAccount === 'function') window.__cycleAccount(dx < 0 ? 1 : -1);
      }, { passive: true });
    }
  }

  window.__cycleAccount = function(direction) {
    if (typeof window.__accountCycle === 'function') return window.__accountCycle(direction);
    const select = document.getElementById('accountSelector');
    if (!select || typeof window.renderForAccount !== 'function') return;
    const options = [...select.options].filter(o => o.value !== '__add_account__');
    if (options.length < 2) return;
    let index = options.findIndex(o => o.value === select.value);
    if (index < 0) index = 0;
    index = (index + direction + options.length) % options.length;
    select.value = options[index].value;
    select.dispatchEvent(new Event('change'));
  };

  const observer = new MutationObserver(initAccountWidgetFix);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('load', () => setTimeout(initAccountWidgetFix, 50), { once: true });
  setTimeout(initAccountWidgetFix, 100);
})();
