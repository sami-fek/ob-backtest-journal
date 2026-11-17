// Parts 2 and 3: rule presets in the account editor, Maven, expectancy with no trades,
// BLOWN on the Dashboard / Trading / Account center, the blocked form, the BLOWN override,
// "Start new run" and the Analytics runs and overrides; a blown Backtest is shown but never
// locked. Desktop and a 390 px phone (touch).
import { launch, wait, api, open, audit } from './h2.mjs';
import { newUser } from './seed.mjs';
let pass = 0, fail = 0; const errors = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const b = await launch();
const accounts = () => ({
  Demo: [{ id: 'demo-1', name: 'Maven 01', balance: 10000, startingBalance: 10000, preset: 'maven' }],
  Real: [{ id: 'real-1', name: 'Real 01', balance: 10000, startingBalance: 10000 }],
  Funded: [{ id: 'funded-1', name: 'FTMO 10k', balance: 10000, startingBalance: 10000, preset: 'ftmo' }],
});
const settings = { riskPercent: 1, maxDailyTrades: 10, hardStopLosses: 5, timezone: 'UTC', currencySymbol: '€', dateFormat: 'DD/MM/YYYY' };
const serverAccounts = async c => JSON.parse((await api(c, 'GET', '/api/storage/my_journal_accounts_v1')).body.value);

for (const [theme, width] of [['light', 1440], ['dark', 390]]) {
  console.log(`\n## ${theme} ${width}px`);
  const touch = width < 1024;

  // ── Part 2: the account editor ─────────────────────────────────────────────
  let c = await newUser({ trades: [], accounts: accounts() });
  await api(c, 'PUT', '/api/storage/ob-os-settings', { value: JSON.stringify(settings) });
  let p = await open(b, c, { tab: 'dashboard', theme, width, mode: 'Real', errors });
  await p.evaluate(() => window.obEditAccount('real-1')); await wait(400);
  const ed = () => p.evaluate(() => {
    const m = document.getElementById('acModal'); const q = s => m.querySelector(s); const shown = s => { const e = q(s); return !!e && !e.closest('[hidden]') && getComputedStyle(e.closest('.ac-field') || e).display !== 'none'; };
    return { preset: q('#aePreset').value, tz: q('#aeTz').value, dd: q('#aeRDD').value, ddDisabled: q('#aeRDD').disabled, text: q('#aeRText').textContent, note: q('#aeRNote').hidden ? '' : q('#aeRNote').textContent, legacy: shown('#aeDD'), rules: shown('#aeRDD') };
  });
  let e = await ed();
  ok(e.preset === '' && e.legacy && !e.rules, 'no preset: the dollar limits show, the rule fields do not');
  const pick = v => p.evaluate(v => { const s = document.querySelector('#aePreset'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  await pick('ftmo'); e = await ed();
  ok(e.dd === '10' && e.ddDisabled && e.tz === 'Europe/Prague' && !e.legacy && e.rules, `FTMO fills 10% (read-only) and Europe/Prague (${e.dd}, ${e.tz})`);
  ok(/initial capital/.test(e.text) && /€500\.00/.test(e.text), 'FTMO formula: day-start balance − 5% of initial capital (€500.00): ' + e.text);
  ok(/equity/.test(e.note), 'equity-based: says it is understated until live equity exists');
  await pick('the5ers'); e = await ed();
  ok(/higher of day-start balance and day-start equity/.test(e.text) && e.tz === 'Europe/Athens', 'The5ers: the standard formula and Europe/Athens');
  await pick('maven'); e = await ed();
  ok(/EAs not permitted by this firm/.test(e.note) && e.tz === 'UTC', 'Maven: EAs not permitted, UTC reset');
  await pick('custom'); e = await ed();
  ok(!e.ddDisabled, 'Custom: the numbers can be typed');
  await p.evaluate(() => { const m = document.getElementById('acModal'); m.querySelector('#aeRDD').value = '5'; m.querySelector('#aeRWarn').value = '6'; m.querySelector('#aeRDaily').value = '2'; });
  await p.click('#aeSave'); await wait(400);
  ok(/Warn % cannot be above max drawdown %/.test(await p.$eval('#aeErr', x => x.textContent)), 'invalid custom rules are refused with the reason');
  if (touch) {
    const issues = (await p.evaluate(() => [...document.querySelectorAll('#acModal input, #acModal select')].filter(x => x.offsetParent && parseFloat(getComputedStyle(x).fontSize) < 16).map(x => x.id)));
    ok(!issues.length, 'editor fields are ≥ 16 px on the phone: ' + issues.join(','));
    ok(await p.evaluate(() => { const d = document.querySelector('#acModal .ac-dialog'); return d && d.getBoundingClientRect().right <= document.documentElement.clientWidth + 1; }), 'editor fits the phone width');
  }
  await pick('my-rules');
  const tzBox = await p.evaluate(() => [...document.querySelectorAll('#aeTz option')].some(o => /^UTC\+|^\+\d/.test(o.value)));
  ok(!tzBox, 'the time zone list has zone names only, no UTC offsets');
  await p.click('#aeSave'); await wait(900);
  let acc = (await serverAccounts(c)).Real[0];
  ok(acc.preset === 'my-rules' && acc.resetTimezone === 'UTC', `saved on the server: preset ${acc.preset}, reset ${acc.resetTimezone}`);
  await p.close();

  // Maven: no EA link offered
  p = await open(b, c, { tab: 'trading', theme, width, mode: 'Demo', errors });
  const strip = await p.evaluate(() => ({ link: !!document.querySelector('#tpStrip [data-mt5="link"]'), text: document.getElementById('tpStrip').textContent }));
  ok(!strip.link && /EAs not permitted by this firm/.test(strip.text), 'Maven account: "EAs not permitted by this firm", no Link MT5 button');
  await p.evaluate(() => window.__mt5Link && window.__mt5Link('demo-1')); await wait(400);
  ok(/EAs not permitted by this firm/.test(await p.evaluate(() => document.getElementById('mt5IntegrationModal')?.textContent || '')), 'the MT5 link dialog refuses it too');
  await p.close();

  // Expectancy with 0 trades: a dash
  p = await open(b, c, { tab: 'analytics', theme, width, mode: 'Funded', errors });
  ok(await p.$eval('#analyticsExpectancy', x => x.textContent.trim()) === '—', 'Analytics: expectancy with 0 trades is a dash, not -1.00 R');
  await p.close();

  // ── Part 3: BLOWN ──────────────────────────────────────────────────────────
  // FTMO 10k: the day's allowance is 5% of the initial capital = 500; -6R × 100 = -600 in one day
  const breach = { id: 'tr-1794000000000', mode: 'Funded', accountId: 'funded-1', date: '2026-11-10', pair: 'XAUUSD', direction: 'LONG', result: 'Loss', rMultiple: -6, strategy: 'Model OB', notes: '<p>n</p>', checklist: ['pass'], screenshots: [], tags: [] };
  await api(c, 'PUT', '/api/storage/ob-trades', { value: JSON.stringify([breach]) });
  acc = (await serverAccounts(c)).Funded[0];
  ok(acc.blown && acc.blown.kind === 'daily_loss', 'the server recorded BLOWN (daily loss)');

  p = await open(b, c, { tab: 'dashboard', theme, width, mode: 'Funded', errors });
  const card = await p.evaluate(() => { const e = document.getElementById('dbEquity'); return { red: e.classList.contains('db2-blown-card'), text: e.textContent.replace(/\s+/g, ' ') }; });
  ok(card.red && /BLOWN/.test(card.text), 'Dashboard: the account card is red and says BLOWN');
  ok(/10\/11\/2026/.test(card.text) && /€600\.00/.test(card.text) && /Daily loss limit breached/.test(card.text), 'with the reason and the date (saved formats): ' + card.text.slice(card.text.indexOf('BLOWN'), card.text.indexOf('BLOWN') + 150));
  ok(!(await p.evaluate(() => [...document.querySelectorAll('#dbTargets .ds-meter i, #dbDiscipline .ds-meter i')].some(i => i.classList.contains('pos')))), 'no green meter on a blown account');
  if (touch) { const issues = await audit(p, { touch }); ok(!issues.length, 'Dashboard layout on the phone: ' + (issues.slice(0, 4).join(' | ') || 'clean')); }
  await p.close();

  p = await open(b, c, { tab: 'trading', theme, width, mode: 'Funded', errors });
  const v = await p.evaluate(() => ({ title: document.querySelector('#tpCan .tp-verdict b')?.textContent || '', chip: document.getElementById('tpStrip').textContent }));
  ok(/BLOWN/.test(v.title) && /BLOWN/.test(v.chip), `Trading: "${v.title}" and a BLOWN chip`);
  await p.click('#tpAddTrade'); await wait(900);
  const blocked = await p.evaluate(() => ({ dialog: !!document.getElementById('obRuleDialog'), draft: !!window.__obPendingNewTrade, drawerOpen: !!document.querySelector('#tradeDrawer:not(.translate-x-full), #tradeDrawer.open') }));
  ok(blocked.dialog && !blocked.draft, 'Add trade on a blown account: the form does not open; the BLOWN dialog does');
  if (touch) {
    const d = await p.evaluate(() => { const box = document.querySelector('#obRuleDialog .ds-dialog'); const r = box.getBoundingClientRect(); const vw = document.documentElement.clientWidth;
      const small = [...box.querySelectorAll('button, input')].filter(x => x.offsetParent).filter(x => { const q = x.getBoundingClientRect(); return q.height < 44 || (x.tagName === 'INPUT' && parseFloat(getComputedStyle(x).fontSize) < 16); }).map(x => x.id || x.textContent.trim());
      return { fits: r.left >= 0 && r.right <= vw + 1, small }; });
    ok(d.fits && !d.small.length, 'BLOWN dialog on the phone: fits, taps ≥ 44 px, field ≥ 16 px ' + d.small.join(','));
  }
  ok(await p.$eval('#obBlownGo', x => x.disabled), 'the override button stays disabled until BLOWN is typed');
  await p.type('#obBlownWord', 'blown'); ok(await p.$eval('#obBlownGo', x => x.disabled), 'lower case "blown" does not count');
  await p.$eval('#obBlownWord', x => { x.value = ''; }); await p.type('#obBlownWord', 'BLOWN');
  await p.click('#obBlownGo'); await wait(1200);
  const draft = await p.evaluate(() => window.__obPendingNewTrade && { ovr: window.__obPendingNewTrade.ruleOverride, pb: window.__obPendingNewTrade.postBreach });
  ok(draft && /^ovr-/.test(draft.ovr) && draft.pb === true, 'after typing BLOWN the form opens for one trade, marked post-breach');
  // the server still refuses a manual trade without that override
  const refused = await p.evaluate(async () => (await fetch('/api/trades', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trade: { id: 'tr-x', mode: 'Funded', accountId: 'funded-1', date: '2026-11-16', rMultiple: 1 }, mode: 'Funded' }) })).status);
  ok(refused === 423, 'the server refuses a manual trade without an override (423)');
  await p.close();

  p = await open(b, c, { tab: 'analytics', theme, width, mode: 'Funded', errors });
  await wait(800);
  const an = await p.evaluate(() => document.getElementById('obRulesAnalytics')?.textContent.replace(/\s+/g, ' ') || '');
  console.log('       analytics:', an);
  ok(/BLOWN overrides\s*1\b/.test(an) && /Run 1 \(now\)/.test(an), 'Analytics: override count 1 and the current run');
  await p.close();

  p = await open(b, c, { tab: 'accounts', theme, width, mode: 'Funded', errors });
  await p.evaluate(() => window.openAccountCenter && window.openAccountCenter('accounts')); await wait(700);
  ok(/BLOWN/.test(await p.evaluate(() => document.querySelector('.ac-acc[data-id="funded-1"] .ac-blown')?.textContent || '')), 'Account center: BLOWN on the account card');
  await p.close();

  // Start new run from the Dashboard
  p = await open(b, c, { tab: 'dashboard', theme, width, mode: 'Funded', errors });
  await p.click('[data-db-new-run]'); await wait(400);
  await p.$eval('#obRunStart', x => { x.value = ''; }); await p.type('#obRunStart', '9000');
  await p.click('#obRunGo'); await wait(1500);
  acc = (await serverAccounts(c)).Funded[0];
  ok(!acc.blown && acc.runNumber === 2 && acc.startingBalance === 9000, `Start new run: BLOWN cleared, run ${acc.runNumber}, starting balance ${acc.startingBalance}`);
  ok(!(await p.evaluate(() => document.getElementById('dbEquity').classList.contains('db2-blown-card'))), 'the Dashboard card is no longer red');
  await p.close();
  p = await open(b, c, { tab: 'analytics', theme, width, mode: 'Funded', errors });
  await wait(800);
  const runRows = await p.evaluate(() => [...document.querySelectorAll('#obRulesAnalytics tbody tr')].map(tr => [...tr.cells].map(td => td.textContent.trim()).join(' | ')));
  console.log('       runs:', JSON.stringify(runRows));
  ok(runRows.length === 2 && /^Run 1 \|.*\| Blown$/.test(runRows[0]) && /^Run 2 \(now\) \|.*€9,000\.00/.test(runRows[1]), 'Analytics: run 1 (blown) stays visible next to run 2');
  ok(!(await p.evaluate(() => !!document.querySelector('#obRulesAnalytics [data-ap-scope]'))), 'the runs section carries no period-filter label (it covers all runs)');
  await p.close();

  // ── Backtest: BLOWN shown, never locked ────────────────────────────────────
  // My Rules on 10,000: -3R × 100 = -300 = the 3% day
  c = await newUser({ trades: [], accounts: { Backtest: [{ id: 'bt-1', name: 'Backtest 01', balance: 10000, startingBalance: 10000, preset: 'my-rules' }] } });
  await api(c, 'PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ ...settings, initialCapital: 10000 }) });
  await api(c, 'PUT', '/api/storage/ob-trades', { value: JSON.stringify([{ ...breach, id: 'tr-1794000000002', mode: 'Backtest', accountId: undefined, rMultiple: -3 }]) });
  ok(!!(await serverAccounts(c)).Backtest[0].blown, 'Backtest: the server recorded BLOWN');
  p = await open(b, c, { tab: 'dashboard', theme, width, mode: 'Backtest', errors });
  const btCard = await p.evaluate(() => { const e = document.getElementById('dbEquity'); return { red: e.classList.contains('db2-blown-card'), text: e.textContent.replace(/\s+/g, ' ') }; });
  ok(btCard.red && /BLOWN/.test(btCard.text) && /not locked/.test(btCard.text) && !/Manual trades are blocked/.test(btCard.text), 'Backtest Dashboard: red BLOWN card that says it is not locked');
  await p.close();
  p = await open(b, c, { tab: 'trading', theme, width, mode: 'Backtest', errors });
  await p.click('#tpAddTrade'); await wait(900);
  const btForm = await p.evaluate(() => ({ dialog: !!document.getElementById('obRuleDialog'), draft: window.__obPendingNewTrade && { ovr: window.__obPendingNewTrade.ruleOverride, pb: window.__obPendingNewTrade.postBreach } }));
  ok(!btForm.dialog && btForm.draft && !btForm.draft.ovr && btForm.draft.pb === true, 'Backtest Add trade: the form opens, no BLOWN dialog or override, the trade is marked post-breach');
  await p.close();
  p = await open(b, c, { tab: 'analytics', theme, width, mode: 'Backtest', errors });
  await wait(800);
  const btAn = await p.evaluate(() => document.getElementById('obRulesAnalytics')?.textContent.replace(/\s+/g, ' ') || '');
  ok(/BLOWN overrides\s*0\b/.test(btAn) && /Run 1 \(now\).*BLOWN/.test(btAn), 'Backtest Analytics: the run shows BLOWN, no overrides: ' + btAn.slice(0, 160));
  await p.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) { console.log('\nPage errors:'); for (const e of [...new Set(errors)]) console.log('  ' + e); }
process.exit(fail || errors.length ? 1 : 0);
