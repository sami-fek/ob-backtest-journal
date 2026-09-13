(() => {
  const patch = () => {
    const original = window.renderCalendarGrid;
    if (typeof original !== 'function' || original.__noTradesPatched) return;
    const patched = function (...args) {
      const result = original.apply(this, args);
      const container = document.getElementById(args[0]);
      if (container) {
        container.querySelectorAll('.font-mono').forEach(el => {
          if (el.textContent.trim() === '-') el.textContent = 'No trades';
        });
      }
      return result;
    };
    patched.__noTradesPatched = true;
    window.renderCalendarGrid = patched;
  };

  const boot = () => {
    patch();
    if (typeof window.renderHeatmaps === 'function' && !window.renderHeatmaps.__noTradesRefreshPatched) {
      const original = window.renderHeatmaps;
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        setTimeout(() => {
          document.querySelectorAll('.font-mono').forEach(el => {
            if (el.textContent.trim() === '-') el.textContent = 'No trades';
          });
        }, 0);
        return result;
      };
      wrapped.__noTradesRefreshPatched = true;
      window.renderHeatmaps = wrapped;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
