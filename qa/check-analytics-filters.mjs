// Step 5: Overview tiles, insight card and strategy/timeframe/regime charts follow the Analytics filters.
import { launch, wait, open, richUser } from './h2.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const b = await launch(); const errors = []; const cookie = await richUser();
const p = await open(b, cookie, { tab: 'analytics', errors }); await wait(900);
const read = () => p.evaluate(() => {
  const list = window.obAnalyticsFilteredTrades();
  let wR = 0, lR = 0; list.forEach(t => { if (t.rMultiple > 0) wR += t.rMultiple; else if (t.rMultiple < 0) lR += Math.abs(t.rMultiple); });
  return {
    n: list.length,
    pf: document.getElementById('analyticsProfitFactor').textContent,
    pfExpected: (lR > 0 ? wR / lR : (wR > 0 ? 99 : 0)).toFixed(2),
    ins: document.getElementById('analyticsInsightText').textContent.slice(0, 30),
    strat: Chart.getChart('chartStrategyModel').data.datasets[0].data.reduce((a, x) => a + x, 0),
    reg: Chart.getChart('chartRegimeBreakdown').data.datasets[0].data.reduce((a, x) => a + x, 0),
    netR: list.reduce((a, t) => a + (Number(t.rMultiple) || 0), 0),
    allModes: window.trades.length,
  };
});
const good = r => r.reg === r.n && r.pf === r.pfExpected && new RegExp(`Across ${r.n} trades`).test(r.ins) && Math.abs(r.strat - r.netR) < 1e-9;
let r = await read();
ok(good(r) && r.n < r.allModes, `no filter: tiles, insight and charts use the ${r.n} Live · Real 01 trades, not all ${r.allModes} across modes ${JSON.stringify(r)}`);
await p.select('#af-pair', 'EURUSD'); await wait(800);
r = await read();
ok(good(r) && r.n > 0 && r.n < 40, `EURUSD filter: they follow it ${JSON.stringify(r)}`);
await p.select('#af-pair', 'ALL'); await wait(500);
await b.close(); console.log(`\n${pass} passed, ${fail} failed`, 'errors', errors);
