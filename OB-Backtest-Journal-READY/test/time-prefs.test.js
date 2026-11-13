import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/time-prefs.js';

const T = globalThis.obTimeCore;

test('timezone: a trade near midnight lands on the right calendar day', () => {
  // 2026-11-13 23:30 in New York = 2026-11-14 04:30 UTC
  const instant = '2026-11-14T04:30:00Z';
  assert.equal(T.isoInTz(instant, 'America/New_York'), '2026-11-13');
  assert.equal(T.isoInTz(instant, 'UTC'), '2026-11-14');
  // 00:30 in Tokyo on the 14th = 15:30 UTC on the 13th
  assert.equal(T.isoInTz('2026-11-13T15:30:00Z', 'Asia/Tokyo'), '2026-11-14');
  // Daylight-saving edge (Europe/London switches on 2026-10-25): 23:30 local on the 25th
  assert.equal(T.isoInTz('2026-10-25T23:30:00Z', 'Europe/London'), '2026-10-25');
  assert.equal(T.isoInTz('2026-03-29T23:30:00Z', 'Europe/London'), '2026-03-30');
});

test('today in a timezone; invalid or missing timezone falls back to the device clock', () => {
  const now = new Date('2026-11-14T02:00:00Z');
  assert.equal(T.todayIso('America/Los_Angeles', now), '2026-11-13');
  assert.equal(T.todayIso('Australia/Sydney', now), '2026-11-14');
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  assert.equal(T.todayIso('Not/AZone', now), local);
  assert.equal(T.todayIso('', now), local);
  assert.equal(T.validTz('Europe/Berlin'), true);
  assert.equal(T.validTz('Mars/Olympus'), false);
  assert.equal(T.isoInTz('not a date', 'UTC'), '');
});

test('currency symbol and date format', () => {
  assert.equal(T.formatMoney(1234.5, '€'), '+€1,234.50');
  assert.equal(T.formatMoney(-85, '£'), '-£85.00');
  assert.equal(T.formatMoney(0, '$'), '$0.00');
  assert.equal(T.formatMoney(1500, '¥', { signed: false, decimals: 0 }), '¥1,500');
  assert.equal(T.formatMoney(2400, '$', { compact: true }), '+$2.4k');
  assert.equal(T.formatMoney(-12500, 'R', { compact: true }), '-R13k');
  assert.equal(T.formatDate('2026-11-03', 'DD/MM/YYYY'), '03/11/2026');
  assert.equal(T.formatDate('2026-11-03', 'MM/DD/YYYY'), '11/03/2026');
  assert.equal(T.formatDate('2026-11-03', 'DD MMM YYYY'), '03 Nov 2026');
  assert.equal(T.formatDate('2026-11-03', 'YYYY-MM-DD'), '2026-11-03');
  assert.equal(T.formatDate('2026-11-03T10:00:00Z', 'DD/MM/YYYY'), '03/11/2026');
  assert.equal(T.formatDate('', 'DD/MM/YYYY'), '');
});

test('MT5 import: close time becomes the calendar day in the saved timezone (UTC when none)', async () => {
  const { dateOnly } = await import('../mt5-backend.js');
  assert.equal(dateOnly('2026-11-14T03:10:00Z', 'America/New_York'), '2026-11-13');
  assert.equal(dateOnly('2026-11-14T03:10:00Z', ''), '2026-11-14');
  assert.equal(dateOnly('2026-11-14T03:10:00Z', 'Bad/Zone'), '2026-11-14');
  assert.equal(dateOnly('', 'UTC'), '');
});
