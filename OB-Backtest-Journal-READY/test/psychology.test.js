import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'psychology.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(code, sandbox);
const P = sandbox.window.obPsych;
const plain = v => JSON.parse(JSON.stringify(v));

const trades = [
  { id: 1, date: '2026-11-02', result: 'Win', rMultiple: 2, tags: ['Patient', 'Followed Plan'], feeling: 'confident', checklist: ['pass', 'pass', 'pass', 'fail'] },
  { id: 2, date: '2026-11-03', result: 'Loss', rMultiple: -1, tags: ['FOMO'], feeling: 'excited', checklist: ['pass', 'fail'] },
  { id: 3, date: '2026-11-04', result: 'Loss', rMultiple: -1, tags: ['fomo', 'Revenge'], feeling: 'excited', checklist: ['fail', 'fail'] },
  { id: 4, date: '2026-11-10', result: 'Win', rMultiple: 1.5, tags: [], checklist: [] },
  { id: 5, date: '2026-11-11', result: 'BE', rMultiple: 0, tags: ['MyMistake', 'Scalp'], feeling: 'worried' }
];
const library = [{ name: 'MyMistake', sentiment: 'negative' }];

test('cards: followed, deviated, discipline, FOMO', () => {
  const r = P.compute(trades, { tagLibrary: library });
  assert.equal(r.trades, 5);
  assert.equal(r.deviatedPct, 60);   // 2, 3, 5 have a negative tag
  assert.equal(r.followedPct, 40);
  assert.equal(r.fomoPct, 40);       // 2 and 3 (case-insensitive)
  // checklist: 75, 50, 0 → 41.7 (trades without a checklist are skipped)
  assert.equal(r.disciplinePct, 41.7);
  assert.equal(r.counts.withChecklist, 3);
  assert.equal(r.taggedTrades, 4);
});

test('tag table: counts, win rate, avg and total R; case-insensitive merge; sentiment', () => {
  const r = plain(P.compute(trades, { tagLibrary: library }));
  const fomo = r.tags.find(t => t.tag.toLowerCase() === 'fomo');
  assert.deepEqual([fomo.trades, fomo.winRate, fomo.avgR, fomo.totalR, fomo.sentiment, fomo.rLost], [2, 0, -1, -2, 'negative', -2]);
  const patient = r.tags.find(t => t.tag === 'Patient');
  assert.deepEqual([patient.trades, patient.winRate, patient.avgR, patient.sentiment], [1, 100, 2, 'positive']);
  assert.equal(r.tags.find(t => t.tag === 'Scalp').sentiment, 'neutral');
  assert.equal(r.tags.find(t => t.tag === 'MyMistake').sentiment, 'negative');
  assert.equal(r.tags[0].tag.toLowerCase(), 'fomo'); // most used first
});

test('mistake leaderboard: negative tags only, most R lost first', () => {
  const r = plain(P.compute(trades, { tagLibrary: library }));
  assert.deepEqual(r.mistakes.map(m => [m.tag.toLowerCase(), m.rLost]), [['fomo', -2], ['revenge', -1], ['mymistake', 0]]);
});

test('feeling table uses labels from settings', () => {
  const r = plain(P.compute(trades, { feelings: [{ id: 'excited', emoji: '🤩', label: 'Excited' }] }));
  const ex = r.feelings.find(f => f.id === 'excited');
  assert.deepEqual([ex.label, ex.trades, ex.winRate, ex.totalR], ['Excited', 2, 0, -2]);
  assert.equal(r.feelings.find(f => f.id === 'worried').label, 'worried'); // unknown id → id as label
  assert.equal(r.feelings.length, 3);
});

test('weekly Followed % trend (Monday weeks)', () => {
  const r = plain(P.compute(trades, { tagLibrary: library }));
  assert.deepEqual(r.trend, [
    { week: '2026-11-02', trades: 3, followedPct: 33.3 },
    { week: '2026-11-09', trades: 2, followedPct: 50 }
  ]);
  assert.equal(P.weekStart('2026-11-08'), '2026-11-02'); // Sunday belongs to the previous Monday
});

test('date range and empty input', () => {
  assert.equal(P.inRange(trades, 7, '2026-11-11').length, 2); // 11-05 .. 11-11
  assert.equal(P.inRange(trades, 0, '2026-11-11').length, 5);
  const e = P.compute([]);
  assert.equal(e.trades, 0);
  assert.equal(e.followedPct, 0);
  assert.equal(e.disciplinePct, null);
  assert.equal(e.tags.length, 0);
});
