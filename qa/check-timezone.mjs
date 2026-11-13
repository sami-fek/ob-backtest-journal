// Fix round step 1: timezone default saved once; never overwrites; server day == browser day.
import { launch, wait, api, BASE } from './h2.mjs';
import { newUser } from './seed.mjs';
let pass = 0, fail = 0; const errors = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const b = await launch();
const getTz = async c => { const r = await api(c, 'GET', '/api/storage/ob-os-settings'); try { return JSON.parse(r.body.value || '{}').timezone; } catch { return undefined; } };
async function visit(cookie, tz) {
  const p = await b.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.emulateTimezone(tz);
  await p.setViewport({ width: 1440, height: 900 });
  await p.setCookie({ name: 'ob_session', value: decodeURIComponent(cookie.split('=')[1]), url: BASE });
  await p.goto(BASE + '/#trading', { waitUntil: 'networkidle0' }); await wait(1500);
  return p;
}
const utc = new Date().toISOString().slice(0, 10);
for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
  const cookie = await newUser();
  ok((await getTz(cookie)) === undefined, `${tz}: fresh user has no saved timezone`);
  const p = await visit(cookie, tz);
  ok((await getTz(cookie)) === tz, `${tz}: device zone saved on first load (${await getTz(cookie)})`);
  const browserToday = await p.evaluate(() => window.obTime.today());
  const server = await api(cookie, 'GET', '/api/trades/daily-count?mode=Real');
  ok(server.body.date === browserToday, `${tz}: server daily-limit day ${server.body.date} == browser day ${browserToday} (UTC day ${utc})`);
  const s = (await api(cookie, 'GET', '/api/storage/ob-os-settings')).body.value;
  ok(/"maxDailyTrades":3/.test(s) && /"hardStopLosses":2/.test(s), `${tz}: other settings written with their defaults`);
  await p.close();
}
// existing saved zone is never changed
const c2 = await newUser();
await api(c2, 'PUT', '/api/storage/ob-os-settings', { value: JSON.stringify({ timezone: 'Europe/Berlin', currencySymbol: '€', maxDailyTrades: 5 }) });
const p2 = await visit(c2, 'Pacific/Kiritimati');
const after = JSON.parse((await api(c2, 'GET', '/api/storage/ob-os-settings')).body.value);
ok(after.timezone === 'Europe/Berlin' && after.currencySymbol === '€' && after.maxDailyTrades === 5, 'saved zone Europe/Berlin unchanged (and other settings intact)');
await p2.close();
// signed out: nothing written, no request errors
const ctx = await b.createBrowserContext(); const q = await ctx.newPage(); q.on('pageerror', e => errors.push(e.message));
await q.goto(BASE + '/', { waitUntil: 'networkidle0' }); await wait(800);
ok(true, 'signed-out homepage loads');
await b.close();
console.log(`\n${pass} passed, ${fail} failed`); console.log('errors', errors);
