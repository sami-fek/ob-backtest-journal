// Phase 3: keep the central analytics filter context authoritative without render recursion.
(function(){
  let syncing = false;
  function sync(){
    if (syncing || !window.obAnalyticsContext || typeof window.obAnalyticsContext.refresh !== 'function') return;
    syncing = true;
    try { window.obAnalyticsContext.refresh(); } finally { syncing = false; }
  }
  if (typeof analyticsBaseTrades === 'function') {
    analyticsBaseTrades = function(){
      const central = window.obAnalyticsContext?.trades;
      if (Array.isArray(central)) return [...central].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||Number(a.id||0)-Number(b.id||0));
      return typeof getFiltered==='function' ? [...getFiltered()] : [];
    };
  }
  if (typeof analyticsFilterTrades === 'function') analyticsFilterTrades = list => list;
  const originalRender = render;
  render = async function(){
    await originalRender();
    if (!syncing) sync();
  };
  sync();
})();
