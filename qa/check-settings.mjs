// Step 6: Settings keeps every setting and its behaviour.
import { launch, wait, open, richUser, api } from './h2.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const b = await launch(); const errors = []; const cookie = await richUser();
await api(cookie, 'PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ currencySymbol: '€', dateFormat: 'DD/MM/YYYY', maxDailyTrades: 3, hardStopLosses: 2, initialCapital: 100000, riskPercent: 1, defaultRR: 2 }) });
for (const width of [1440, 390]) {
  const p = await open(b, cookie, { tab: 'settings', width, errors }); await wait(600);
  const s = await p.evaluate(() => ({
    ids: ['settingMaxDailyTrades', 'settingHardStopLosses', 'settingInitialCapital', 'settingRiskPercent', 'settingDefaultRR', 'mt5BridgeStatus', 'importBackupInput'].filter(id => !document.getElementById(id)),
    order: [...document.querySelectorAll('#pageSettings .ds-section')].map(s => s.id + ':' + Math.round(s.getBoundingClientRect().top)),
    cardsInCards: document.querySelectorAll('#pageSettings .ds-card .ds-card').length,
    titlesOutside: [...document.querySelectorAll('#pageSettings .ds-section-head')].every(h => !h.closest('.ds-card')),
    sym: document.querySelector('#pageSettings [data-ob-sym]').textContent,
    width: Math.round(document.getElementById('pageSettings').getBoundingClientRect().width),
  }));
  ok(s.ids.length === 0, `${width}: every setting is there (missing: ${s.ids})`);
  ok(s.titlesOutside && s.cardsInCards === 0, `${width}: section titles outside cards, no card in a card`);
  ok(s.sym === '€', `${width}: capital label shows the saved symbol`);
  const tops = s.order.map(x => +x.split(':')[1]); const ids = s.order.map(x => x.split(':')[0]);
  if (width < 640) ok(ids.join() === 'stRules,stAccount,stData,stMt5' && tops.every((t, i) => !i || t > tops[i - 1]), `phone order: rules → account → data → MT5 (${s.order})`);
  else ok(s.width > 1300, `desktop: full-width frame (${s.width}px)`);
  await p.close();
}
// behaviour: changing values saves them and the discipline engine uses them
const p = await open(b, cookie, { tab: 'settings', errors });
for (const [id, v] of [['settingMaxDailyTrades', '5'], ['settingHardStopLosses', '3'], ['settingRiskPercent', '1.5'], ['settingDefaultRR', '2.5'], ['settingInitialCapital', '50000']]) {
  await p.$eval('#' + id, (e, v) => { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, v); await wait(400);
}
await wait(800);
const saved = JSON.parse((await api(cookie, 'GET', '/api/storage/ob-os-settings')).body.value);
ok(saved.maxDailyTrades === 5 && saved.hardStopLosses === 3 && saved.riskPercent === 1.5 && saved.defaultRR === 2.5 && saved.initialCapital === 50000 && saved.currencySymbol === '€', 'changed values are saved (and other settings kept): ' + JSON.stringify(saved));
ok(await p.evaluate(() => window.maxDailyTrades === 5 && window.hardStopLosses === 3), 'discipline engine uses the new limits');
const dl = await api(cookie, 'GET', '/api/trades/daily-count?mode=Real');
ok(dl.body.limit === 5, 'server daily limit follows the setting: ' + dl.body.limit);
ok(await p.evaluate(() => typeof window.exportDataJSON === 'function' && typeof window.exportTableCSV === 'function' && typeof window.importDataJSON === 'function' && typeof window.resetToDemoData === 'function'), 'backup / CSV / import / clear handlers exist');
await b.close(); console.log(`\n${pass} passed, ${fail} failed`, 'errors', errors);
