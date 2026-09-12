// Central trade model: keep every trade compatible with the trading-system structure.
(function installTradeModel(){
  if (window.__obTradeModelInstalled) return;
  window.__obTradeModelInstalled = true;

  const SOURCE_DEFAULT = 'backtest';
  const MODE_DEFAULT = 'Backtest';
  const ACCOUNT_DEFAULT = 'backtest-main';
  const STRATEGY_DEFAULT = 'model-ob';

  function normalizeTrade(t){
    if(!t || typeof t !== 'object') return t;
    const mode = ['Backtest','Demo','Real','Funded'].includes(t.mode) ? t.mode : MODE_DEFAULT;
    const source = t.source || (mode === 'Backtest' ? SOURCE_DEFAULT : 'manual');
    return Object.assign(t, {
      source,
      mode,
      accountId: t.accountId || ACCOUNT_DEFAULT,
      strategyId: t.strategyId || STRATEGY_DEFAULT,
      status: t.status || 'closed',
      riskPercent: t.riskPercent ?? null,
      riskAmount: t.riskAmount ?? null,
      entryPrice: t.entryPrice ?? null,
      exitPrice: t.exitPrice ?? null,
      stopLoss: t.stopLoss ?? null,
      takeProfit: t.takeProfit ?? null,
      lotSize: t.lotSize ?? null,
      r: Number.isFinite(Number(t.r)) ? Number(t.r) : 0,
      profitLoss: t.profitLoss ?? null,
      timeframe: t.timeframe ?? t.tf ?? null,
      session: t.session ?? null,
      dayOfWeek: t.dayOfWeek ?? null,
      marketRegime: t.marketRegime ?? t.regime ?? null,
      updatedAt: t.updatedAt || new Date().toISOString()
    });
  }

  window.obTradeModel = {
    normalize: normalizeTrade,
    normalizeAll(list){ return Array.isArray(list) ? list.map(normalizeTrade) : list; },
    version: 1
  };

  if(typeof saveTrades === 'function'){
    const baseSaveTrades = saveTrades;
    saveTrades = async function(){
      if(Array.isArray(trades)) window.obTradeModel.normalizeAll(trades);
      return baseSaveTrades();
    };
  }
})();
