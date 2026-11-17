// Part 6: Link MT5 end to end (gateway → server): the EA key is shown once with the setup
// steps, only its hash is stored, it is never saved with the account, and Unlink revokes it.
// Start the app with MT5_INGEST_URL=https://ynloihdiiahlegpkzhae.supabase.co/functions/v1/mt5-ingest
import { launch, wait, api, open } from './h2.mjs';
import { newUser } from './seed.mjs';
let pass = 0, fail = 0; const errors = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const b = await launch();
for (const [theme, width] of [['light', 1440], ['dark', 390]]) {
  console.log(`\n## ${theme} ${width}px`);
  const c = await newUser({ trades: [], accounts: { Funded: [{ id: 'funded-1', name: 'FTMO 10k', balance: 10000, startingBalance: 10000, preset: 'ftmo' }] } });
  const p = await open(b, c, { tab: 'trading', mode: 'Funded', theme, width, errors });
  await p.evaluate(() => window.__mt5Link('funded-1')); await wait(500);
  const intro = await p.evaluate(() => document.querySelector('.mt5-modal-box')?.textContent.replace(/\s+/g, ' ') || '');
  ok(/MYJournalLogger/.test(intro) && /InpEaKey/.test(intro) && /never places, changes or closes/.test(intro), 'the dialog explains the read-only EA and InpEaKey');
  await p.type('#m5login', '5550001'); await p.type('#m5server', 'Broker-Live');
  await p.click('#m5save'); await wait(1500);
  const shown = await p.evaluate(() => ({ key: document.getElementById('m5tokenInput')?.value || '', text: document.querySelector('.mt5-modal-box')?.textContent.replace(/\s+/g, ' ') || '' }));
  ok(/^myj_[A-Za-z0-9_-]{40,}$/.test(shown.key), 'an EA key is shown: ' + shown.key.slice(0, 8) + '…');
  ok(shown.text.includes('https://ynloihdiiahlegpkzhae.supabase.co') && /Allow WebRequest/.test(shown.text), 'with the exact address to allow in MT5');
  ok(!/Direct logging is not available/.test(shown.text), 'direct logging is available (journal on the tables)');
  const local = await p.evaluate(() => localStorage.getItem('my_journal_accounts_v1') || '');
  ok(!local.includes(shown.key), 'the key is not saved in the browser with the account');
  await p.evaluate(() => document.getElementById('m5done')?.click()); await wait(1200);
  const server = (await api(c, 'GET', '/api/storage/my_journal_accounts_v1')).body.value;
  ok(!server.includes(shown.key) && /"linked":true/.test(server), 'nor on the server (the account only records the link)');
  let keys = (await api(c, 'GET', '/api/mt5/ea-keys')).body;
  ok(keys.keys.length === 1 && keys.keys[0].keyHint === shown.key.slice(-4) && !JSON.stringify(keys).includes(shown.key), 'one active key, listed by its last 4 characters only');
  if (width < 1024) {
    const fits = await p.evaluate(() => { const box = document.querySelector('.mt5-modal-box'); return !box || box.getBoundingClientRect().right <= document.documentElement.clientWidth + 1; });
    ok(fits, 'the dialog fits the phone');
  }
  await p.evaluate(() => window.__mt5Help && window.__mt5Help());
  await p.evaluate(() => window.dispatchEvent(new CustomEvent('open-mt5-help'))); await wait(800);
  ok(await p.evaluate(() => [...document.querySelectorAll('[data-mt5-allow-url]')].some(e => e.textContent === 'https://ynloihdiiahlegpkzhae.supabase.co')), 'the guide shows the address from the server');
  const r = await api(c, 'POST', '/api/mt5/unlink', { accountId: 'funded-1' });
  keys = (await api(c, 'GET', '/api/mt5/ea-keys')).body;
  ok(r.status === 200 && keys.keys.length === 0, 'Unlink revokes the key');
  await p.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`, errors.length ? errors : '');
process.exit(fail || errors.length ? 1 : 0);
