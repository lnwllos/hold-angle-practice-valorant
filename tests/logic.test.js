const { test } = require('node:test');
const assert = require('node:assert');
const L = require('../js/logic.js');

const TABLE = { head: 160, body: 40, legs: 33 };

// --- damage / health ---
test('damageForZone returns Vandal damage per zone, 0 for unknown', () => {
  assert.strictEqual(L.damageForZone('head', TABLE), 160);
  assert.strictEqual(L.damageForZone('body', TABLE), 40);
  assert.strictEqual(L.damageForZone('legs', TABLE), 33);
  assert.strictEqual(L.damageForZone('miss', TABLE), 0);
});

test('headshot one-shots a 150-EHP enemy', () => {
  assert.ok(L.applyDamage(150, 160) <= 0);
});

test('body shots: 3 do not kill, 4 kills (150 EHP)', () => {
  let ehp = 150;
  for (let i = 0; i < 3; i++) ehp = L.applyDamage(ehp, 40);
  assert.ok(ehp > 0, `after 3 body shots ehp=${ehp} should be > 0`);
  ehp = L.applyDamage(ehp, 40);
  assert.ok(ehp <= 0, `after 4 body shots ehp=${ehp} should be <= 0`);
});

// --- peek width sampling ---
test('peekWeight decreases as width increases (wider = less likely)', () => {
  assert.ok(L.peekWeight(0.5, 2.5) > L.peekWeight(2.0, 2.5));
  assert.strictEqual(L.peekWeight(2.5, 2.5), 0);  // weight 0 at max width
});

test('samplePeekWidth stays within [min,max] and maps endpoints', () => {
  const min = 0.3, max = 2.5;
  assert.ok(Math.abs(L.samplePeekWidth(min, max, () => 1) - min) < 1e-9); // u=1 -> min
  assert.ok(Math.abs(L.samplePeekWidth(min, max, () => 0) - max) < 1e-9); // u=0 -> max
});

test('samplePeekWidth: larger u yields narrower (smaller) width', () => {
  const min = 0, max = 2.5;
  const a = L.samplePeekWidth(min, max, () => 0.1);
  const b = L.samplePeekWidth(min, max, () => 0.9);
  assert.ok(a > b, `u=0.1 width ${a} should exceed u=0.9 width ${b}`);
});

test('samplePeekWidth midpoint check: u=0.25 -> halfway', () => {
  // width = max - sqrt(u)*(max-min); u=0.25 -> sqrt=0.5 -> midpoint
  assert.ok(Math.abs(L.samplePeekWidth(0, 2.5, () => 0.25) - 1.25) < 1e-9);
});

// --- sensitivity ---
test('degPerCount = valSens * yawConst', () => {
  assert.ok(Math.abs(L.degPerCount(0.4, 0.07) - 0.028) < 1e-9);
});

test('cm360 ≈ 40.8 cm for 0.4 sens @ 800 DPI', () => {
  const cm = L.cm360(0.4, 800, 0.07);
  assert.ok(Math.abs(cm - 40.8) < 0.5, `got ${cm}`);
});

test('effectiveDeg scales movement by sens, yawConst and fine-tune multiplier', () => {
  // 10px * 0.4 * 0.07 * 2 = 0.56
  assert.ok(Math.abs(L.effectiveDeg(10, 0.4, 0.07, 2) - 0.56) < 1e-9);
});

// --- fire rate ---
test('fireInterval = 1 / fireRate', () => {
  assert.ok(Math.abs(L.fireInterval(9.75) - (1 / 9.75)) < 1e-9);
});

test('canFire only after the interval elapsed', () => {
  const interval = L.fireInterval(9.75); // ~0.1026 s
  assert.strictEqual(L.canFire(1.0, 1.0 + interval * 0.5, interval), false);
  assert.strictEqual(L.canFire(1.0, 1.0 + interval * 1.01, interval), true);
});

// --- spawn delay ---
test('sampleSpawnDelay returns fixed delay when mode is fixed', () => {
  assert.strictEqual(L.sampleSpawnDelay('fixed', 0.5, 0.2, 1.5, () => 1), 0.5);
});

test('sampleSpawnDelay samples random delay inside ordered range', () => {
  assert.ok(Math.abs(L.sampleSpawnDelay('random', 0.5, 0.2, 1.5, () => 0) - 0.2) < 1e-9);
  assert.ok(Math.abs(L.sampleSpawnDelay('random', 0.5, 0.2, 1.5, () => 1) - 1.5) < 1e-9);
  assert.ok(Math.abs(L.sampleSpawnDelay('random', 0.5, 1.5, 0.2, () => 0.5) - 0.85) < 1e-9);
});

// --- shot timing ---
test('classifyShotTiming labels hidden/early shots as fast', () => {
  assert.strictEqual(L.classifyShotTiming(null, 75, 300), 'fast');
  assert.strictEqual(L.classifyShotTiming(50, 75, 300), 'fast');
});

test('classifyShotTiming labels ideal and slow shots', () => {
  assert.strictEqual(L.classifyShotTiming(120, 75, 300), 'good');
  assert.strictEqual(L.classifyShotTiming(350, 75, 300), 'slow');
});

// --- recoil ---
test('recoilOffset: first shot has no offset', () => {
  assert.deepStrictEqual(L.recoilOffset(0, 1), { yaw: 0, pitch: 0 });
});

test('recoilOffset: vertical climb grows over the first shots', () => {
  assert.ok(L.recoilOffset(2, 1).pitch > L.recoilOffset(1, 1).pitch);
  assert.strictEqual(L.recoilOffset(2, 1).yaw, 0); // no horizontal sway in first 5
});

test('recoilOffset: intensity 0 disables recoil', () => {
  assert.deepStrictEqual(L.recoilOffset(8, 0), { yaw: 0, pitch: 0 });
});

// --- stats ---
test('stats: accuracy, headshot %, average reaction', () => {
  const s = L.makeStats();
  L.recordShot(s); L.recordShot(s); L.recordShot(s); L.recordShot(s); // 4 shots
  L.recordHit(s, true);   // headshot hit
  L.recordHit(s, false);  // body hit  -> 2 hits
  L.recordKill(s, 300);
  L.recordKill(s, 500);   // 2 kills, reaction 300 & 500
  assert.ok(Math.abs(L.statAccuracy(s) - 0.5) < 1e-9);      // 2 hits / 4 shots
  assert.ok(Math.abs(L.statHeadshotPct(s) - 0.5) < 1e-9);   // 1 hs / 2 hits
  assert.ok(Math.abs(L.statAvgReaction(s) - 400) < 1e-9);   // (300+500)/2
});

test('stats: empty stats report zeros, not NaN', () => {
  const s = L.makeStats();
  assert.strictEqual(L.statAccuracy(s), 0);
  assert.strictEqual(L.statHeadshotPct(s), 0);
  assert.strictEqual(L.statAvgReaction(s), 0);
});
