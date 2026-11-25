// Run: node engine.test.js ../still/index.html
const fs = require('fs'), assert = require('assert');
const html = fs.readFileSync(process.argv[2], 'utf8');
const src = html.split('<!-- ENGINE:START -->')[1].split('<!-- ENGINE:END -->')[0].replace(/<\/?script>/g, '');
const StillEngine = new Function(src + '; return StillEngine;')();

const MIN = 60000;
function rig(seed) {
  let t = new Date(2026, 10, 25, 9, 0, 0).getTime();
  const data = seed ? JSON.parse(JSON.stringify(seed)) : {};
  const store = { get: k => (k in data ? JSON.parse(JSON.stringify(data[k])) : null), set: (k, v) => { data[k] = JSON.parse(JSON.stringify(v)); } };
  const clock = { now: () => t, adv: ms => { t += ms; } };
  const E = StillEngine.create({ now: clock.now, store });
  return { E, clock, data, store, reopen: () => StillEngine.create({ now: clock.now, store }) };
}
const tests = [];
const test = (n, f) => tests.push([n, f]);
const runFull = (E, clock) => { E.start(); clock.adv(E.timer.duration); return E.sync(); };

test('1a start counts down from 25:00 using timestamps', () => {
  const { E, clock } = rig();
  assert.equal(E.timer.status, 'idle'); assert.equal(E.remaining(), 25 * MIN);
  E.start(); assert.equal(E.timer.status, 'running');
  clock.adv(61_500); assert.equal(E.remaining(), 25 * MIN - 61_500);
});
test('1b pause freezes remaining, resume continues from it', () => {
  const { E, clock } = rig();
  E.start(); clock.adv(5 * MIN); E.pause();
  assert.equal(E.timer.status, 'paused'); assert.equal(E.remaining(), 20 * MIN);
  clock.adv(60 * MIN); assert.equal(E.remaining(), 20 * MIN); assert.equal(E.sync(), null);
  E.start(); assert.equal(E.timer.status, 'running'); clock.adv(19 * MIN); assert.equal(E.remaining(), 1 * MIN);
  clock.adv(MIN); const d = E.sync(); assert.equal(d.phase, 'focus'); assert.equal(E.history.length, 1);
});
test('1c reset restores full duration and does not count', () => {
  const { E, clock } = rig();
  E.start(); clock.adv(24 * MIN); E.reset();
  assert.equal(E.timer.status, 'idle'); assert.equal(E.timer.phase, 'focus'); assert.equal(E.remaining(), 25 * MIN);
  clock.adv(10 * MIN); assert.equal(E.sync(), null); assert.equal(E.history.length, 0);
});
test('1d reset while paused does not count', () => {
  const { E, clock } = rig();
  E.start(); clock.adv(10 * MIN); E.pause(); E.reset(); assert.equal(E.history.length, 0); assert.equal(E.remaining(), 25 * MIN);
});
test('1e skip moves to next session and does not count unfinished focus', () => {
  const { E, clock } = rig();
  E.start(); clock.adv(24 * MIN + 59_000); E.skip();
  assert.equal(E.history.length, 0); assert.equal(E.timer.phase, 'short'); assert.equal(E.timer.status, 'idle');
  E.skip(); assert.equal(E.timer.phase, 'focus'); assert.equal(E.timer.round, 2);
});
test('1f skip pressed after time already ran out records the completed session once', () => {
  const { E, clock } = rig();
  E.start(); clock.adv(26 * MIN); E.skip();
  assert.equal(E.history.length, 1); assert.equal(E.timer.phase, 'short'); assert.equal(E.timer.status, 'idle');
});
test('2 custom durations apply to subsequent sessions (and an idle one), not the running one', () => {
  const { E, clock } = rig();
  E.start(); clock.adv(MIN);
  E.setSettings({ focus: 50, short: 10 });
  assert.equal(E.timer.duration, 25 * MIN, 'running session unchanged');
  clock.adv(24 * MIN); E.sync();
  assert.equal(E.timer.phase, 'short'); assert.equal(E.timer.duration, 10 * MIN);
  assert.equal(E.history[0].duration, 25 * MIN);
  E.setSettings({ short: 7 }); assert.equal(E.remaining(), 7 * MIN, 'idle session picks up change');
  runFull(E, clock); assert.equal(E.timer.duration, 50 * MIN);
  E.setSettings({ focus: 0 }); assert.equal(E.settings.focus, 1, 'clamped to min');
  E.setSettings({ focus: 'abc' }); assert.equal(E.settings.focus, 25, 'garbage falls back to default');
  E.setSettings({ focus: 999 }); assert.equal(E.settings.focus, 120, 'clamped to max');
});
test('3+4 default sequence F S F S F S F L, then repeats', () => {
  const { E, clock } = rig();
  const seen = [];
  for (let i = 0; i < 16; i++) { seen.push(E.timer.phase[0].toUpperCase() + E.timer.duration / MIN + '#' + E.timer.round); runFull(E, clock); }
  assert.deepEqual(seen, ['F25#1', 'S5#1', 'F25#2', 'S5#2', 'F25#3', 'S5#3', 'F25#4', 'L15#4', 'F25#1', 'S5#1', 'F25#2', 'S5#2', 'F25#3', 'S5#3', 'F25#4', 'L15#4']);
  assert.equal(E.history.length, 8);
});
test('4 long break after configured count (3 and 1)', () => {
  let { E, clock } = rig();
  E.setSettings({ rounds: 3 });
  const seen = []; for (let i = 0; i < 7; i++) { seen.push(E.timer.phase); runFull(E, clock); }
  assert.deepEqual(seen, ['focus', 'short', 'focus', 'short', 'focus', 'long', 'focus']);
  ({ E, clock } = rig()); E.setSettings({ rounds: 1 });
  const s2 = []; for (let i = 0; i < 4; i++) { s2.push(E.timer.phase); runFull(E, clock); }
  assert.deepEqual(s2, ['focus', 'long', 'focus', 'long']);
});
test('4 lowering the cycle mid-way clamps the session number', () => {
  const { E, clock } = rig();
  for (let i = 0; i < 4; i++) runFull(E, clock); // now focus #3
  assert.equal(E.timer.round, 3);
  E.setSettings({ rounds: 2 }); assert.equal(E.timer.round, 2);
  runFull(E, clock); assert.equal(E.timer.phase, 'long');
});
test('5 sessions never start automatically, even after long gaps or reopening', () => {
  const { E, clock, reopen } = rig();
  E.start(); clock.adv(25 * MIN); E.sync();
  assert.equal(E.timer.phase, 'short'); assert.equal(E.timer.status, 'idle');
  clock.adv(3 * 60 * MIN); assert.equal(E.sync(), null); assert.equal(E.remaining(), 5 * MIN);
  const E2 = reopen(); assert.equal(E2.timer.status, 'idle'); assert.equal(E2.remaining(), 5 * MIN);
  // phone locked for hours during focus: completes once, the break waits
  E2.skip(); E2.start(); clock.adv(5 * 60 * MIN);
  const E3 = reopen(); const d = E3.sync();
  assert.equal(d.phase, 'focus'); assert.equal(E3.timer.status, 'idle'); assert.equal(E3.timer.phase, 'short');
  assert.equal(E3.remaining(), 5 * MIN);
});
test('5 pressing Start on an already-expired session completes it but does not start the next', () => {
  const { E, clock } = rig();
  E.start(); clock.adv(30 * MIN); E.start();
  assert.equal(E.timer.phase, 'short'); assert.equal(E.timer.status, 'idle'); assert.equal(E.history.length, 1);
});
test('6 completed focus recorded exactly once across refreshes, tabs and crashes', () => {
  const { E, clock, store, data, reopen } = rig();
  E.start(); clock.adv(25 * MIN);
  // two tabs open on the same storage both notice completion
  const tabB = reopen();
  E.sync(); tabB.sync();
  assert.equal(JSON.parse(JSON.stringify(data.history)).length, 1);
  // crash after history write but before timer write
  const r = rig(); r.E.start(); r.clock.adv(25 * MIN);
  const realSet = r.store.set; const timerBefore = JSON.parse(JSON.stringify(r.data.timer));
  r.E.sync(); r.data.timer = timerBefore; // simulate timer write lost
  const again = r.reopen(); again.sync();
  assert.equal(again.history.length, 1); assert.equal(again.timer.phase, 'short');
  // refreshes after completion
  for (let i = 0; i < 5; i++) { const x = reopen(); x.sync(); }
  assert.equal(reopen().history.length, 1);
  // breaks are not recorded as focus
  const b = reopen(); b.start(); clock.adv(5 * MIN); b.sync(); assert.equal(b.history.length, 1);
});
test('6 completion is stamped at the real end time, not when the app was reopened', () => {
  const { E, clock, reopen } = rig();
  E.setTask('Write report'); E.start(); const endAt = E.timer.endAt; clock.adv(8 * 60 * MIN);
  const x = reopen(); x.sync();
  assert.equal(x.history[0].end, endAt); assert.equal(x.history[0].task, 'Write report');
});
test('persist: refresh mid-session keeps the countdown, paused stays paused', () => {
  const { E, clock, reopen } = rig();
  E.start(); clock.adv(7 * MIN);
  let x = reopen(); assert.equal(x.timer.status, 'running'); assert.equal(x.remaining(), 18 * MIN);
  x.pause(); clock.adv(30 * MIN); x = reopen(); assert.equal(x.timer.status, 'paused'); assert.equal(x.remaining(), 18 * MIN);
  x.setTask('  Draft   chapter 3 '); assert.equal(reopen().task, 'Draft chapter 3');
  x.setSettings({ goal: 90 }); assert.equal(reopen().settings.goal, 90);
});
test('persist: corrupt storage falls back safely', () => {
  const { E } = rig({ timer: { phase: 'nope' }, settings: { focus: -5, rounds: 'x' }, history: [{ bad: 1 }, null], task: 4 });
  assert.equal(E.timer.phase, 'focus'); assert.equal(E.settings.focus, 1); assert.equal(E.settings.rounds, 4);
  assert.equal(E.history.length, 0); assert.equal(E.task, '');
});
test('stats: daily and weekly use local dates, from history only', () => {
  const S = StillEngine.stats;
  const at = (d, h) => new Date(2026, 10, d, h, 0).getTime(); // Nov 2026: 23 Mon .. 29 Sun
  const H = [
    { id: 'a', end: at(25, 23) + 59 * MIN, duration: 25 * MIN },
    { id: 'b', end: at(25, 0) + MIN, duration: 25 * MIN },
    { id: 'c', end: at(24, 23) + 59 * MIN, duration: 50 * MIN },
    { id: 'd', end: at(23, 9), duration: 25 * MIN },
    { id: 'e', end: at(22, 9), duration: 25 * MIN } // previous week (Sunday)
  ];
  const s = S(H, at(25, 12), 120);
  assert.equal(s.today.count, 2); assert.equal(s.today.ms, 50 * MIN);
  assert.equal(s.todayIdx, 2);
  assert.deepEqual(s.days.map(d => d.ms / MIN), [25, 50, 50, 0, 0, 0, 0]);
  assert.equal(s.weekMs, 125 * MIN); assert.equal(Math.round(s.avgMs / MIN * 100) / 100, 41.67);
  const sun = S(H, at(29, 20), 120); assert.equal(sun.todayIdx, 6); assert.equal(sun.today.count, 0);
});

let fail = 0;
for (const [n, f] of tests) { try { f(); console.log('✓', n); } catch (e) { fail++; console.log('✗', n, '\n   ', e.message); } }
console.log(`\n${tests.length - fail}/${tests.length} passed`);
process.exit(fail ? 1 : 0);
