// Fix round step 3: restyled dialogs keep working.
import { launch, wait, api, open, makeTrades } from './h2.mjs';
import { newUser } from './seed.mjs';
let pass = 0, fail = 0; const errors = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = iso(new Date());
const t = o => ({ mode: 'Real', accountId: 'real-1', pair: 'EURUSD', timeframe: '15M', regime: 'Trending', session: 'London', direction: 'LONG', strategy: 'Model A', notes: '<p>n</p>', checklist: ['pass'], screenshots: [], tags: [], feeling: 'neutral', ...o });
const b = await launch();
const bg = (p, sel) => p.$eval(sel, e => getComputedStyle(e).backgroundColor);

for (const theme of ['light', 'dark']) {
  console.log(`\n## ${theme}`);
  // MT5 link: form → token step (was broken: the token step looked for a class that no longer existed)
  let c = await newUser();
  let p = await open(b, c, { tab: 'trading', theme, errors });
  await p.click('#tpStrip [data-mt5="link"]'); await wait(600);
  ok(await p.$('#mt5IntegrationModal .mt5-modal-box') !== null, 'MT5 link dialog opens (design-system box)');
  ok(!/37, 99, 235|59, 130, 246/.test(await bg(p, '#m5save')), 'Link account button is not blue: ' + await bg(p, '#m5save'));
  // The real POST /api/mt5/link currently fails on the server (pre-existing, see report), so the
  // server answer is mocked here to test the dialog's token step itself.
  await p.setRequestInterception(true);
  p.on('request', r => { if (r.url().endsWith('/api/mt5/link') && r.method() === 'POST') r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, token: 'obmt5_TESTTOKEN_0123456789abcdefghijklmnop' }) }); else r.continue(); });
  await p.type('#m5login', '12345678'); await p.type('#m5server', 'Broker-Demo'); await p.type('#m5label', 'QA');
  await p.click('#m5save'); await wait(1500);
  const tok = await p.evaluate(() => document.getElementById('m5tokenInput')?.value || '');
  const err = await p.evaluate(() => { const e = document.getElementById('m5error'); return e && !e.classList.contains('hidden') ? e.textContent : ''; });
  ok(tok.length > 20 && !err, `after linking, the bridge token is shown (${tok.slice(0, 8)}…)${err ? ' ERROR: ' + err : ''}`);
  ok(await p.$('#m5done') !== null && !/37, 99, 235/.test(await bg(p, '#m5done')), 'Done button monochrome');
  await p.click('#m5done'); await wait(500);
  ok(!(await p.$('#mt5IntegrationModal')), 'Done closes the dialog');
  await p.close();

  // MT5 guide
  p = await open(b, c, { tab: 'trading', theme, errors });
  await p.click('#tpStrip [data-mt5="help"]'); await wait(500);
  ok(/integration guide/i.test(await p.evaluate(() => document.getElementById('mt5IntegrationModal')?.textContent || '')), 'MT5 guide opens');
  await p.close();

  // Add / edit account dialogs: still create and save; symbol follows settings; below the toast
  c = await newUser();
  await api(c, 'PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ currencySymbol: '£', dateFormat: 'DD/MM/YYYY' }) });
  p = await open(b, c, { tab: 'trading', theme, errors });
  await p.evaluate(() => window.openAddAccountModal()); await wait(400);
  ok(await p.$eval('#accountAddModal [data-ob-sym]', e => e.textContent) === '£', 'Add account: balance suffix is the saved symbol (£)');
  await p.evaluate(() => { document.getElementById('newAccountName').value = 'QA new'; });
  await p.click('#accountModalCreate'); await wait(700);
  const accs = JSON.parse((await api(c, 'GET', '/api/storage/my_journal_accounts_v1')).body.value || '{}');
  ok((accs.Real || []).some(a => a.name === 'QA new'), 'Add account still creates the account (saved on the server)');
  await p.evaluate(() => window.openEditAccountModal('real-1')); await wait(400);
  ok(await p.$eval('#editAccountName', e => e.value) === 'Real 01', 'Edit account dialog pre-fills the name');
  await p.evaluate(() => { document.getElementById('editAccountName').value = ''; });
  await p.click('#accountEditSave'); await wait(400);
  ok(await p.evaluate(() => { const t = document.getElementById('accountTextToast'), o = document.getElementById('accountEditModal'); return !!t && !!o && /Enter an account name/.test(t.textContent) && Number(getComputedStyle(t).zIndex) > Number(getComputedStyle(o).zIndex); }), 'validation toast is visible above the dialog');
  await p.evaluate(() => { document.getElementById('editAccountName').value = 'Real renamed'; });
  await p.click('#accountEditSave'); await wait(700);
  const accs2 = JSON.parse((await api(c, 'GET', '/api/storage/my_journal_accounts_v1')).body.value || '{}');
  ok((accs2.Real || []).some(a => a.name === 'Real renamed'), 'Edit account still saves');
  await p.close();

  // Daily-limit modal
  c = await newUser({ trades: [...makeTrades(5), ...[1, 2, 3].map(i => t({ id: 'd' + i, date: today, result: 'Win', rMultiple: 1 }))] });
  p = await open(b, c, { tab: 'trading', theme, errors });
  await p.click('#tpAddTrade'); await wait(900);
  ok(await p.$('#ob-daily-limit-block .ds-dialog') !== null, 'daily-limit modal on the design system');
  const s1 = await bg(p, '#obDailyBlockSettings');
  ok(!/37, 99, 235/.test(s1), 'Open Settings is monochrome: ' + s1);
  await p.click('#obDailyBlockSettings'); await wait(600);
  ok(await p.evaluate(() => !document.getElementById('pageSettings').classList.contains('hidden') && !document.getElementById('ob-daily-limit-block')), 'Open Settings goes to Settings and closes the modal');
  await p.close();

  // Hard-stop modal: Go back cancels; Log as violation logs (rule kept)
  c = await newUser({ trades: [...makeTrades(5), ...[1, 2].map(i => t({ id: 's' + i, date: today, result: 'Loss', rMultiple: -1 }))] });
  await api(c, 'PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ maxDailyTrades: 5, hardStopLosses: 2 }) });
  p = await open(b, c, { tab: 'trading', theme, errors });
  // same browser profile as the earlier users: forget their active-account choice
  await p.evaluate(() => { const th = localStorage.getItem('my-journal-theme'); localStorage.clear(); if (th) localStorage.setItem('my-journal-theme', th); });
  await p.reload({ waitUntil: 'networkidle0' }); await wait(1500);
  await p.click('#tpAddTrade'); await p.waitForSelector('#obDmOverride', { timeout: 5000 }).catch(() => {});
  ok(await p.$('#ob-discipline-modal.ds-overlay .ds-dialog') !== null, 'hard-stop modal on the design system');
  const ov = await bg(p, '#obDmOverride');
  ok(/201, 64, 64|227, 96, 96/.test(ov), 'Log as violation uses the toned danger red: ' + ov);
  await p.click('#obDmBack'); await wait(500);
  ok(!(await p.$('#ob-discipline-modal')) && !(await p.evaluate(() => document.getElementById('tradeDrawer')?.classList.contains('open'))), 'Go back cancels (no trade sheet)');
  await p.click('#tpAddTrade'); await p.waitForSelector('#obDmOverride', { timeout: 5000 }).catch(() => {});
  await p.click('#obDmOverride'); await wait(900);
  ok(await p.evaluate(() => !document.getElementById('ob-discipline-modal')), 'Log as violation closes the modal and continues');
  await p.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`); console.log('errors', errors);
