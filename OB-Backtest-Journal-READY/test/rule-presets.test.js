// Part 2: rule presets, the two daily floor formulas and rule days in the reset timezone.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/time-prefs.js';
import '../public/rule-presets.js';

const R = globalThis.obRules;

test('presets carry the numbers from prop-firms.xlsx "preset values" (warn = 80% of max DD, DECISIONS.md)', () => {
  // [max DD %, warn %, daily %, base, formula, default reset zone, EA]
  const expected = {
    'my-rules': [10, 8, 3, 'balance', 'standard', 'UTC', 'n/a'],
    fundingpips: [10, 8, 5, 'equity', 'standard', 'Etc/GMT-3', 'ask'],
    ftmo: [10, 8, 5, 'equity', 'ftmo', 'Europe/Prague', 'yes'],
    the5ers: [10, 8, 5, 'equity', 'standard', 'Europe/Athens', 'yes'],
    maven: [8, 6.4, 4, 'equity', 'standard', 'UTC', 'no'],
  };
  assert.deepEqual(R.PRESET_IDS, ['my-rules', 'fundingpips', 'ftmo', 'the5ers', 'maven', 'custom']);
  for (const [id, e] of Object.entries(expected)) {
    const p = R.presetById(id);
    assert.deepEqual([p.maxDrawdownPct, p.warnPct, p.dailyLossPct, p.dailyLossBase, p.dailyLossFormula, p.resetTimezone, p.ea], e, id);
    assert.ok(Math.abs(p.warnPct - p.maxDrawdownPct * 0.8) < 1e-9, `${id}: warn is 80% of max drawdown`);
  }
});

test('ftmo formula differs from standard for the same inputs', () => {
  const inputs = { dayStartBalance: 104000, dayStartEquity: 104000, initialCapital: 100000 };
  const standard = R.dailyFloor(R.rulesFor({ preset: 'the5ers' }), inputs);
  const ftmo = R.dailyFloor(R.rulesFor({ preset: 'ftmo' }), inputs);
  // same 5%, different base: 5% of the day-start value vs 5% of INITIAL capital
  assert.equal(standard.formula, 'standard'); assert.equal(standard.floor, 98800); assert.equal(standard.amount, 5200);
  assert.equal(ftmo.formula, 'ftmo'); assert.equal(ftmo.floor, 99000); assert.equal(ftmo.amount, 5000);
  // below the initial capital the order flips: the formula, not just the number, changed
  const down = { dayStartBalance: 96000, dayStartEquity: 96000, initialCapital: 100000 };
  assert.equal(R.dailyFloor(R.rulesFor({ preset: 'the5ers' }), down).floor, 91200);
  assert.equal(R.dailyFloor(R.rulesFor({ preset: 'ftmo' }), down).floor, 91000);
  // standard uses the higher of balance and equity at day start; ftmo ignores equity
  const eqHigher = { dayStartBalance: 100000, dayStartEquity: 102000, initialCapital: 100000 };
  assert.equal(R.dailyFloor(R.rulesFor({ preset: 'the5ers' }), eqHigher).floor, 96900);
  assert.equal(R.dailyFloor(R.rulesFor({ preset: 'ftmo' }), eqHigher).floor, 95000);
});

test('switching an account to FTMO changes its formula; the account keeps the same balance', () => {
  const acc = { id: 'f1', startingBalance: 100000, preset: 'fundingpips' };
  const trades = [{ id: 't1', date: '2026-11-10', pnl: 4000 }];
  const now = '2026-11-16T12:00:00Z';
  const before = R.dailyStatus(acc, trades, { now, pnlFor: t => t.pnl });
  const after = R.dailyStatus({ ...acc, preset: 'ftmo' }, trades, { now, pnlFor: t => t.pnl });
  assert.equal(before.dayStartBalance, 104000); assert.equal(after.dayStartBalance, 104000);
  assert.equal(before.formula, 'standard'); assert.equal(after.formula, 'ftmo');
  assert.equal(before.allowed, 5200); assert.equal(after.allowed, 5000);
  assert.equal(before.tz, 'Etc/GMT-3'); assert.equal(after.tz, 'Europe/Prague', 'the reset zone follows the preset default');
});

test('equity-based presets without equity are understated, never a clean pass; My Rules is balance-based', () => {
  const s = R.dailyStatus({ startingBalance: 10000, preset: 'ftmo' }, [], { now: '2026-11-16T12:00:00Z' });
  assert.equal(s.complete, true); assert.equal(s.understated, true);
  const m = R.dailyStatus({ startingBalance: 10000, preset: 'my-rules' }, [], { now: '2026-11-16T12:00:00Z' });
  assert.equal(m.understated, false); assert.equal(m.allowed, 300); assert.equal(m.left, 300);
  assert.match(R.EQUITY_MSG, /^equity unavailable - closed balance only, understated$/);
  // with a day-start equity the standard formula is complete
  const withEq = R.dailyFloor(R.rulesFor({ preset: 'the5ers' }), { dayStartBalance: 10000, dayStartEquity: 9900 });
  assert.equal(withEq.understated, false); assert.equal(withEq.floor, 9500);
});

test('missing or invalid numbers are incomplete, never computed as a pass', () => {
  assert.equal(R.rulesFor({}), null, 'no preset: the older dollar limits apply');
  assert.equal(R.rulesFor({ preset: 'nope' }), null);
  const custom = R.rulesFor({ preset: 'custom', customRules: { maxDrawdownPct: 6, warnPct: 7, dailyLossPct: '', dailyLossBase: 'balance', dailyLossFormula: 'standard' } });
  assert.equal(custom.complete, false);
  assert.deepEqual(custom.problems, ['Warn % cannot be above max drawdown %.', 'Daily loss % must be between 0 and 100.']);
  assert.equal(R.dailyFloor(custom, { dayStartBalance: 1000 }).complete, false);
  assert.equal(R.dailyStatus({ preset: 'custom', startingBalance: 1000 }, []).left, undefined);
  assert.equal(R.dailyFloor(R.rulesFor({ preset: 'ftmo' }), { dayStartBalance: 1000 }).complete, false, 'ftmo needs the initial capital');
  const ok = R.rulesFor({ preset: 'custom', customRules: { maxDrawdownPct: 6, warnPct: 4.8, dailyLossPct: 2, dailyLossBase: 'balance', dailyLossFormula: 'ftmo' } });
  assert.equal(ok.complete, true);
  assert.equal(R.dailyFloor(ok, { dayStartBalance: 51000, initialCapital: 50000 }).floor, 50000);
  assert.deepEqual(R.drawdownLevels(R.rulesFor({ preset: 'my-rules' }), 10000), { maxLoss: 1000, floor: 9000, warnLoss: 800, warnLevel: 9200 });
});

test('reset timezone: IANA names only; an offset is never used', () => {
  for (const ok of ['UTC', 'Europe/Prague', 'Europe/Athens', 'Etc/GMT-3', 'Africa/Addis_Ababa']) assert.equal(R.validResetTz(ok), true, ok);
  for (const bad of ['UTC+2', 'utc-5', 'GMT+3', '+03:00', '3', '-2', '', null, 'Mars/Olympus']) assert.equal(R.validResetTz(bad), false, String(bad));
  const r = R.rulesFor({ preset: 'the5ers', resetTimezone: 'UTC+2' });
  assert.equal(r.resetTimezone, 'Europe/Athens'); assert.equal(r.resetTimezoneIsDefault, true);
  assert.equal(R.rulesFor({ preset: 'the5ers', resetTimezone: 'Europe/Prague' }).resetTimezone, 'Europe/Prague');
  const tz = R.timezoneChoices();
  assert.ok(tz.common.includes('Europe/Prague') && tz.common.includes('Etc/GMT-3'));
  assert.ok(!tz.all.includes('Europe/Prague'), 'no duplicates between the lists');
});

test('rule days follow the account reset zone, across summer time', () => {
  const pnlFor = t => t.pnl;
  const acc = { startingBalance: 100000, preset: 'ftmo' }; // Europe/Prague
  // winter (CET, UTC+1): 23:30 UTC on the 16th is 00:30 on the 17th in Prague
  const winterNow = '2026-11-16T23:30:00Z';
  const trades = [
    { id: 'a', date: '2026-11-16', closeTime: '2026-11-16T22:50:00Z', pnl: -700 }, // 23:50 Prague on the 16th: yesterday
    { id: 'b', date: '2026-11-16', closeTime: '2026-11-16T23:10:00Z', pnl: -300 }, // 00:10 Prague on the 17th: today
  ];
  const w = R.dailyStatus(acc, trades, { now: winterNow, pnlFor });
  assert.equal(w.today, '2026-11-17');
  assert.equal(w.dayStartBalance, 99300); assert.equal(w.used, 300); assert.equal(w.todayCount, 1);
  assert.equal(w.floor, 94300); assert.equal(w.left, 4700);
  // the same instant in UTC (My Rules) is still the 16th, so both trades count today
  const u = R.dailyStatus({ startingBalance: 100000, preset: 'my-rules' }, trades, { now: winterNow, pnlFor });
  assert.equal(u.today, '2026-11-16'); assert.equal(u.used, 1000); assert.equal(u.todayCount, 2);
  // summer (CEST, UTC+2): 22:30 UTC on 15 July is 00:30 on the 16th in Prague
  assert.equal(R.dailyStatus(acc, [], { now: '2026-07-15T22:30:00Z' }).today, '2026-07-16');
  assert.equal(R.dailyStatus(acc, [], { now: '2026-07-15T21:30:00Z' }).today, '2026-07-15');
  // a manual trade has a date and no time: its own date is its rule day
  assert.equal(R.tradeDay({ date: '2026-11-16', closeTime: '2026-11-16 10:00' }, 'Europe/Prague'), '2026-11-16');
  // cash movements change the day-start balance but never count as a loss
  const cash = R.dailyStatus({ ...acc, cashMovements: [{ type: 'withdraw', date: '2026-11-10', amount: 2000 }, { type: 'deposit', date: '2026-11-17', amount: 500 }] }, [], { now: winterNow });
  assert.equal(cash.dayStartBalance, 98000); assert.equal(cash.used, 0);
});

test('Maven accounts get no EA linking', () => {
  assert.equal(R.eaAllowed({ preset: 'maven' }), false);
  for (const p of ['my-rules', 'fundingpips', 'ftmo', 'the5ers', 'custom', undefined]) assert.equal(R.eaAllowed({ preset: p }), true, String(p));
  assert.equal(R.EA_BLOCKED_MSG, 'EAs not permitted by this firm');
});

// ── Part 3: account state for the current run ────────────────────────────────
const pnl = t => t.pnl;
const loss = (id, date, amount, extra = {}) => ({ id, mode: 'Funded', accountId: 'f1', date, pnl: -amount, ...extra });
const myRules = (extra = {}) => ({ id: 'f1', startingBalance: 10000, preset: 'my-rules', ...extra }); // 10% / 8% / 3%, UTC

test('warn at 8%: drawdown from the starting balance reaches the warn level', () => {
  const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].map((d, i) => loss('t' + i, d, 200)); // 2% a day, below the daily 3%
  const s = R.accountState(myRules(), days, { pnlFor: pnl });
  assert.equal(s.state, 'warn'); assert.equal(s.drawdown, 800); assert.equal(s.drawdownPct, 8);
  const under = R.accountState(myRules(), [...days.slice(0, 3), loss('t9', '2026-11-13', 190)], { pnlFor: pnl });
  assert.equal(under.state, 'ok', '7.9% is below the warn level');
});

test('blown at 10%: max drawdown reached', () => {
  const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'].map((d, i) => loss('t' + i, d, 200));
  const s = R.accountState(myRules(), days, { pnlFor: pnl });
  assert.equal(s.state, 'blown');
  assert.deepEqual([s.blown.kind, s.blown.day, s.blown.tradeId, s.blown.loss, s.blown.limit], ['max_drawdown', '2026-11-14', 't4', 1000, 1000]);
  assert.match(R.blownReason(s.blown, v => '$' + v), /^Max drawdown reached: down \$1000 from the starting balance, limit \$1000 \(10%\), on 2026-11-14$/);
});

test('blown on a 3% daily breach (closed balance, My Rules)', () => {
  const s = R.accountState(myRules(), [loss('a', '2026-11-10', 100), loss('b', '2026-11-10', 200)], { pnlFor: pnl });
  assert.equal(s.state, 'blown'); assert.equal(s.blown.kind, 'daily_loss'); assert.equal(s.blown.tradeId, 'b');
  assert.equal(s.blown.loss, 300); assert.equal(s.blown.limit, 300);
  assert.equal(R.accountState(myRules(), [loss('a', '2026-11-10', 299)], { pnlFor: pnl }).state, 'ok', 'just under 3%');
  // a win earlier the same day counts: the day's net loss is what matters
  assert.equal(R.accountState(myRules(), [{ id: 'w', mode: 'Funded', accountId: 'f1', date: '2026-11-10', pnl: 100 }, loss('l', '2026-11-10', 350)], { pnlFor: pnl }).state, 'ok');
  // the allowance follows the day-start balance: after a 1,000 profit, 3% is 330
  const up = [{ id: 'w', mode: 'Funded', accountId: 'f1', date: '2026-11-09', pnl: 1000 }, loss('l', '2026-11-10', 320)];
  assert.equal(R.accountState(myRules(), up, { pnlFor: pnl }).state, 'ok');
});

test('the daily boundary lands in the account reset timezone, not UTC', () => {
  // 23:30 and 00:30 in Prague (CET, UTC+1): two different rule days there, one day in UTC
  const trades = [loss('a', '2026-11-16', 200, { closeTime: '2026-11-16T22:30:00Z' }), loss('b', '2026-11-16', 200, { closeTime: '2026-11-16T23:30:00Z' })];
  const prague = R.accountState(myRules({ resetTimezone: 'Europe/Prague' }), trades, { pnlFor: pnl });
  assert.equal(prague.state, 'ok', '200 on the 16th and 200 on the 17th in Prague: neither day reaches 300');
  const utc = R.accountState(myRules(), trades, { pnlFor: pnl });
  assert.equal(utc.state, 'blown', 'the same trades on one UTC day: 400 ≥ 300');
  assert.equal(utc.blown.day, '2026-11-16');
  // FTMO (Europe/Prague by default) uses 5% of the initial capital as the day's allowance
  const ftmo = R.accountState({ id: 'f1', startingBalance: 10000, preset: 'ftmo' }, [loss('c', '2026-11-16', 500, { closeTime: '2026-11-16T23:30:00Z' })], { pnlFor: pnl });
  assert.equal(ftmo.state, 'blown'); assert.equal(ftmo.blown.day, '2026-11-17'); assert.equal(ftmo.blown.formula, 'ftmo');
});

test('a recorded BLOWN stays; a new run only counts its own trades; incomplete rules are never ok', () => {
  const saved = { kind: 'daily_loss', day: '2026-11-10', loss: 300, limit: 300, pct: 3, at: '2026-11-10T12:00:00Z' };
  assert.equal(R.accountState(myRules({ blown: saved }), [], { pnlFor: pnl }).state, 'blown', 'deleting the trades does not clear it');
  const old = [loss('tr-1794000000000', '2026-11-10', 1000)];
  const fresh = R.accountState(myRules({ runNumber: 2, runStartedAt: '2026-11-15T09:00:00Z' }), old, { pnlFor: pnl });
  assert.equal(fresh.state, 'ok'); assert.equal(fresh.tradeCount, 0); assert.equal(fresh.runNumber, 2);
  // on the start day: a manual trade created before the run started belongs to the old run
  const start = Date.parse('2026-11-15T09:00:00Z');
  const sameDay = [loss('tr-' + (start - 1000), '2026-11-15', 1000), loss('tr-' + (start + 1000), '2026-11-15', 100)];
  const r2 = R.accountState(myRules({ runNumber: 2, runStartedAt: '2026-11-15T09:00:00Z' }), sameDay, { pnlFor: pnl });
  assert.equal(r2.tradeCount, 1); assert.equal(r2.drawdown, 100);
  assert.equal(R.accountState(myRules({ preset: 'custom', customRules: {} }), [], {}).state, 'unknown');
  assert.equal(R.accountState({ id: 'x', startingBalance: 1000 }, [], {}).state, 'none');
  assert.equal(R.accountState({ id: 'f', startingBalance: 1000, preset: 'the5ers' }, [], {}).understated, true);
  // money as the app computes it: R × starting balance × risk %
  assert.equal(R.pnlOf({ mode: 'Funded', rMultiple: -2 }, { startingBalance: 10000 }, { riskPct: 1 }), -200);
  assert.equal(R.pnlOf({ mode: 'Backtest', rMultiple: 1 }, { startingBalance: 10000 }, { riskPct: 1, initialCapital: 1000 }), 10);
});

test('BLOWN locks manual entry on Real, Demo and Funded, never on Backtest', () => {
  for (const t of ['Real', 'Demo', 'Funded']) assert.equal(R.blocksManualEntry(t), true, t);
  assert.equal(R.blocksManualEntry('Backtest'), false);
});
