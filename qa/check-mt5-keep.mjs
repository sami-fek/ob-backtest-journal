// Part 4: the page saves its whole trade list. An MT5 trade the EA added after the page
// loaded (mt5-ingest writes straight to the tables) must survive that save, show up in the
// page, and a trade deleted in the page must still go away.
import { launch, wait, api, open } from './h2.mjs';
import { newUser } from './seed.mjs';
let pass = 0, fail = 0; const errors = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const b = await launch();
const t = (id, extra = {}) => ({ id, mode: 'Real', accountId: 'real-1', date: '2026-11-14', pair: 'EURUSD', direction: 'LONG', result: 'Win', rMultiple: 1, strategy: 'Model OB', notes: '', checklist: [], screenshots: [], tags: [], ...extra });
const mt5A = t('mt5-real-1-1001', { source: 'mt5', mt5Ticket: '1001' });
const mt5B = t('mt5-real-1-1002', { source: 'mt5', mt5Ticket: '1002', date: '2026-11-16' });
const c = await newUser({ trades: [t('tr-1794000000001'), t('tr-1794000000002'), mt5A] });
const server = async () => JSON.parse((await api(c, 'GET', '/api/storage/ob-trades')).body.value).map(x => x.id);

const p = await open(b, c, { tab: 'journal', mode: 'Real', errors });
// the EA adds mt5B after the page loaded its list
const list = JSON.parse((await api(c, 'GET', '/api/storage/ob-trades')).body.value);
await api(c, 'PUT', '/api/storage/ob-trades', { value: JSON.stringify([mt5B, ...list]) });
ok(!(await p.evaluate(() => window.trades.some(x => x.id === 'mt5-real-1-1002'))), 'the page does not know mt5B yet');

await p.evaluate(() => window.deleteTrade('tr-1794000000002')); await wait(1200);
let ids = await server();
ok(ids.includes('mt5-real-1-1002'), 'saving the stale page list kept mt5B on the server: ' + ids.join(', '));
ok(!ids.includes('tr-1794000000002'), 'the trade deleted in the page is gone');
ok(await p.evaluate(() => window.trades.some(x => x.id === 'mt5-real-1-1002')), 'the page picked up mt5B from the answer');

await p.evaluate(() => window.deleteTrade('mt5-real-1-1001')); await wait(1200);
ids = await server();
ok(!ids.includes('mt5-real-1-1001') && ids.includes('mt5-real-1-1002'), 'an MT5 trade deleted in the page is removed: ' + ids.join(', '));
await p.reload({ waitUntil: 'networkidle0' }); await wait(1500);
ok(!(await p.evaluate(() => window.trades.some(x => x.id === 'mt5-real-1-1001'))), 'and stays deleted after a reload');
await b.close();
console.log(`\n${pass} passed, ${fail} failed`, errors.length ? errors : '');
process.exit(fail || errors.length ? 1 : 0);
