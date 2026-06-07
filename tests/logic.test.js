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

// --- peek mode: wave count ---
test('sampleEnemyCount: fixed returns the clamped fixed value', () => {
  assert.strictEqual(L.sampleEnemyCount('fixed', 3, 5, () => 0), 3);
  assert.strictEqual(L.sampleEnemyCount('fixed', 9, 5, () => 0), 5); // clamp to max
  assert.strictEqual(L.sampleEnemyCount('fixed', 0, 5, () => 0), 1); // clamp to >=1
});

test('sampleEnemyCount: random returns an integer in [1, max]', () => {
  assert.strictEqual(L.sampleEnemyCount('random', 3, 5, () => 0), 1);
  assert.strictEqual(L.sampleEnemyCount('random', 3, 5, () => 0.999), 5);
  assert.strictEqual(L.sampleEnemyCount('random', 3, 5, () => 1), 5); // guard rng()==1
});

// --- shot timing ---
test('classifyShotTimingByPeek labels hidden shots as fast', () => {
  assert.strictEqual(L.classifyShotTimingByPeek(false, false), 'fast');
  assert.strictEqual(L.classifyShotTimingByPeek(false, true), 'fast');
});

test('classifyShotTimingByPeek labels visible swing vs full peek', () => {
  assert.strictEqual(L.classifyShotTimingByPeek(true, false), 'good');
  assert.strictEqual(L.classifyShotTimingByPeek(true, true), 'slow');
});

test('classifyShotTimingByLateral labels miss side for rightward peek', () => {
  assert.strictEqual(L.classifyShotTimingByLateral(true, null, 1.5, 1.0, 1, false), 'fast');
  assert.strictEqual(L.classifyShotTimingByLateral(true, null, 0.5, 1.0, 1, false), 'slow');
});

test('classifyShotTimingByLateral labels miss side for leftward peek', () => {
  assert.strictEqual(L.classifyShotTimingByLateral(true, null, 0.5, 1.0, -1, false), 'fast');
  assert.strictEqual(L.classifyShotTimingByLateral(true, null, 1.5, 1.0, -1, false), 'slow');
});

test('classifyShotTimingByLateral labels head halves as almost early/late', () => {
  assert.strictEqual(L.classifyShotTimingByLateral(true, 'head', 1.1, 1.0, 1, false, 0.045), 'nearFast');
  assert.strictEqual(L.classifyShotTimingByLateral(true, 'head', 0.9, 1.0, 1, false, 0.045), 'nearSlow');
  assert.strictEqual(L.classifyShotTimingByLateral(true, 'head', 0.9, 1.0, -1, false, 0.045), 'nearFast');
  assert.strictEqual(L.classifyShotTimingByLateral(true, 'head', 1.1, 1.0, -1, false, 0.045), 'nearSlow');
});

test('classifyShotTimingByLateral labels center head hits as perfect', () => {
  assert.strictEqual(L.classifyShotTimingByLateral(true, 'head', 1.04, 1.0, 1, false, 0.045), 'perfect');
  assert.strictEqual(L.classifyShotTimingByLateral(true, 'head', 0.96, 1.0, -1, false, 0.045), 'perfect');
  assert.strictEqual(L.classifyShotTimingByLateral(true, 'head', 1.05, 1.0, 1, false, 0.045), 'nearFast');
});

test('classifyShotTimingByLateral keeps non-head hits as good', () => {
  assert.strictEqual(L.classifyShotTimingByLateral(true, 'body', 1.5, 1.0, 1, false), 'good');
  assert.strictEqual(L.classifyShotTimingByLateral(true, 'legs', 0.5, 1.0, 1, false), 'good');
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

test('stats: valid and first-bullet accuracy ignore invalid shots', () => {
  const s = L.makeStats();
  L.recordShot(s, { valid: true, hit: true, isHead: true, firstBullet: true, reason: 'hit-head' });
  L.recordShot(s, { valid: true, hit: false, isHead: false, firstBullet: true, reason: 'miss-high' });
  L.recordShot(s, { valid: false, hit: false, reason: 'no-target' });
  L.recordShot(s, { valid: false, hit: false, reason: 'target-not-visible' });
  L.recordHit(s, true);
  assert.strictEqual(s.shots, 4);
  assert.strictEqual(s.validShots, 2);
  assert.strictEqual(s.validHits, 1);
  assert.strictEqual(s.firstBulletShots, 2);
  assert.strictEqual(s.firstBulletHits, 1);
  assert.strictEqual(s.noTargetShots, 1);
  assert.strictEqual(s.preVisibleShots, 1);
  assert.strictEqual(s.missHigh, 1);
  assert.ok(Math.abs(L.statValidAccuracy(s) - 0.5) < 1e-9);
  assert.ok(Math.abs(L.statFirstBulletPct(s) - 0.5) < 1e-9);
});

test('stats: empty stats report zeros, not NaN', () => {
  const s = L.makeStats();
  assert.strictEqual(L.statAccuracy(s), 0);
  assert.strictEqual(L.statHeadshotPct(s), 0);
  assert.strictEqual(L.statValidAccuracy(s), 0);
  assert.strictEqual(L.statFirstBulletPct(s), 0);
  assert.strictEqual(L.statAvgReaction(s), 0);
});

// --- flash: selection / round decision ---
test('pickFlashAgent returns null when none enabled', () => {
  assert.strictEqual(L.pickFlashAgent([], () => 0), null);
  assert.strictEqual(L.pickFlashAgent(undefined, () => 0), null);
});

test('pickFlashAgent picks by rng index', () => {
  const ks = ['breach', 'phoenix', 'yoru'];
  assert.strictEqual(L.pickFlashAgent(ks, () => 0), 'breach');
  assert.strictEqual(L.pickFlashAgent(ks, () => 0.5), 'phoenix');
  assert.strictEqual(L.pickFlashAgent(ks, () => 0.999), 'yoru');
});

test('shouldFlashRound needs an agent and rng below chance', () => {
  assert.strictEqual(L.shouldFlashRound(0.3, true, () => 0.2), true);
  assert.strictEqual(L.shouldFlashRound(0.3, true, () => 0.5), false);
  assert.strictEqual(L.shouldFlashRound(1.0, false, () => 0), false);
});

// --- flash: blind ---
test('blindFactor is full at/under fullDeg, zero at/over zeroDeg, linear between', () => {
  assert.strictEqual(L.blindFactor(0, 35, 100), 1);
  assert.strictEqual(L.blindFactor(35, 35, 100), 1);
  assert.strictEqual(L.blindFactor(100, 35, 100), 0);
  assert.strictEqual(L.blindFactor(120, 35, 100), 0);
  assert.ok(Math.abs(L.blindFactor(67.5, 35, 100) - 0.5) < 1e-9); // midpoint
});

test('blindDuration scales max blind by factor', () => {
  assert.strictEqual(L.blindDuration(2.0, 1), 2.0);
  assert.strictEqual(L.blindDuration(2.0, 0), 0);
  assert.ok(Math.abs(L.blindDuration(1.75, 0.5) - 0.875) < 1e-9);
});

test('flashOverlayOpacity ramps up, then decays, then zero', () => {
  assert.strictEqual(L.flashOverlayOpacity(0, 1.0, 0.05), 0);
  assert.ok(Math.abs(L.flashOverlayOpacity(0.025, 1.0, 0.05) - 0.5) < 1e-9); // mid ramp-up
  assert.ok(Math.abs(L.flashOverlayOpacity(0.05, 1.0, 0.05) - 1) < 1e-9);    // peak
  assert.strictEqual(L.flashOverlayOpacity(1.0, 1.0, 0.05), 0);              // exactly end
  assert.strictEqual(L.flashOverlayOpacity(1.5, 1.0, 0.05), 0);             // past end
  assert.strictEqual(L.flashOverlayOpacity(0.5, 0, 0.05), 0);              // zero duration
  // halfway through decay: decaySpan=0.95, remain=0.475 -> elapsed=0.525 -> 0.5
  assert.ok(Math.abs(L.flashOverlayOpacity(0.525, 1.0, 0.05) - 0.5) < 1e-9);
});

// --- peek mode: target placements ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('randomTargetPlacements returns count items inside bounds, min-separated', () => {
  const bounds = { spreadX: 5, depthMin: 12, depthMax: 18, minSep: 1.2 };
  const out = L.randomTargetPlacements(4, bounds, mulberry32(42));
  assert.strictEqual(out.length, 4);
  for (const p of out) {
    assert.ok(p.x >= -5 - 1e-9 && p.x <= 5 + 1e-9, `x in range: ${p.x}`);
    assert.ok(p.z <= -12 + 1e-9 && p.z >= -18 - 1e-9, `z in range: ${p.z}`);
  }
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const dx = out[i].x - out[j].x, dz = out[i].z - out[j].z;
      assert.ok(Math.hypot(dx, dz) >= 1.2 - 1e-9, `pair ${i},${j} separated`);
    }
  }
});

test('randomTargetPlacements still returns count when space is too tight', () => {
  const bounds = { spreadX: 0.1, depthMin: 12, depthMax: 12.1, minSep: 5 };
  const out = L.randomTargetPlacements(5, bounds, mulberry32(7));
  assert.strictEqual(out.length, 5); // never throws / never infinite-loops
});

// --- peek mode: stationary shot feedback ---
test('classifyStationaryShot maps head/body/legs and misses', () => {
  assert.strictEqual(L.classifyStationaryShot('head'), 'perfect');
  assert.strictEqual(L.classifyStationaryShot('body'), 'good');
  assert.strictEqual(L.classifyStationaryShot('legs'), 'good');
  assert.strictEqual(L.classifyStationaryShot('wall'), null);
  assert.strictEqual(L.classifyStationaryShot(null), null);
});

// --- peek mode: behind-cover detection ---
test('isBehindCover true only inside the pocket on both axes', () => {
  // halfWidth 0.6, behindZ -0.5
  assert.strictEqual(L.isBehindCover(0, 0, 0.6, -0.5), true);
  assert.strictEqual(L.isBehindCover(0.6, -0.5, 0.6, -0.5), true);  // on the boundary
  assert.strictEqual(L.isBehindCover(0.7, 0, 0.6, -0.5), false);    // too far sideways
  assert.strictEqual(L.isBehindCover(-0.7, 0, 0.6, -0.5), false);   // symmetric
  assert.strictEqual(L.isBehindCover(0, -0.6, 0.6, -0.5), false);   // pushed forward past pocket
});

// --- peek mode: smoke cycle ---
test('smokePhase covers, then fades, then stays clear', () => {
  assert.deepStrictEqual(L.smokePhase(0, 3, 0.6), { phase: 'covered', opacity: 1 });
  assert.deepStrictEqual(L.smokePhase(2.9, 3, 0.6), { phase: 'covered', opacity: 1 });
  const mid = L.smokePhase(3.3, 3, 0.6); // halfway through the 0.6s fade
  assert.strictEqual(mid.phase, 'fading');
  assert.ok(Math.abs(mid.opacity - 0.5) < 1e-9);
  assert.deepStrictEqual(L.smokePhase(3.6, 3, 0.6), { phase: 'clear', opacity: 0 });
  assert.deepStrictEqual(L.smokePhase(10, 3, 0.6), { phase: 'clear', opacity: 0 });
});

// --- destructible flash: nearsight & drone detection ---
test('nearsightIntensity: 0 before start, ramps, holds at 1, fades to 0', () => {
  // rampUp=0.2, duration=1.6, fadeOut=0.4
  assert.strictEqual(L.nearsightIntensity(0, 0.2, 1.6, 0.4), 0);
  assert.ok(Math.abs(L.nearsightIntensity(0.1, 0.2, 1.6, 0.4) - 0.5) < 1e-9); // half-way up the ramp
  assert.strictEqual(L.nearsightIntensity(0.8, 0.2, 1.6, 0.4), 1);            // holding
  assert.ok(Math.abs(L.nearsightIntensity(1.4, 0.2, 1.6, 0.4) - 0.5) < 1e-9); // half-way down the fade
  assert.strictEqual(L.nearsightIntensity(1.6, 0.2, 1.6, 0.4), 0);            // done
  assert.strictEqual(L.nearsightIntensity(2.0, 0.2, 1.6, 0.4), 0);            // past end
});

test('lockOnProgress clamps to [0,1] and completes at lockTime', () => {
  assert.strictEqual(L.lockOnProgress(0, 0.4), 0);
  assert.ok(Math.abs(L.lockOnProgress(0.2, 0.4) - 0.5) < 1e-9);
  assert.strictEqual(L.lockOnProgress(0.4, 0.4), 1);
  assert.strictEqual(L.lockOnProgress(0.9, 0.4), 1);   // clamped
  assert.strictEqual(L.lockOnProgress(0.1, 0), 1);     // zero lock time = instant
});

test('inScanCone: inside half-angle is true, outside is false', () => {
  assert.strictEqual(L.inScanCone(0, 60), true);
  assert.strictEqual(L.inScanCone(30, 60), true);   // exactly the edge (half = 30)
  assert.strictEqual(L.inScanCone(31, 60), false);
});

test('flashDestroyedInTime: true only if destroyed before the blind started', () => {
  assert.strictEqual(L.flashDestroyedInTime(true, false), true);
  assert.strictEqual(L.flashDestroyedInTime(true, true), false);  // blinded already
  assert.strictEqual(L.flashDestroyedInTime(false, false), false);
});

// --- aim log recorder helpers ---
test('ticksToEmit emits floor((acc+dt)/period) samples and keeps the remainder', () => {
  const p = 1 / 128;
  let r = L.ticksToEmit(0, 0.016667, p);
  assert.strictEqual(r.count, 2);
  assert.ok(Math.abs(r.remainder - (0.016667 - 2 * p)) < 1e-9);
  r = L.ticksToEmit(0, 0.001, p);
  assert.strictEqual(r.count, 0);
  assert.ok(Math.abs(r.remainder - 0.001) < 1e-9);
  r = L.ticksToEmit(0, 0.05, p);
  assert.strictEqual(r.count, 6);
  r = L.ticksToEmit(0.02, 0.02, 0);
  assert.strictEqual(r.count, 0);
  assert.strictEqual(r.remainder, 0.02);
});

test('angleBetweenDeg returns the angle in degrees between [x,y,z] vectors', () => {
  assert.ok(Math.abs(L.angleBetweenDeg([1, 0, 0], [1, 0, 0]) - 0) < 1e-6);
  assert.ok(Math.abs(L.angleBetweenDeg([1, 0, 0], [0, 1, 0]) - 90) < 1e-6);
  assert.ok(Math.abs(L.angleBetweenDeg([1, 0, 0], [-1, 0, 0]) - 180) < 1e-6);
  assert.ok(Math.abs(L.angleBetweenDeg([1, 0, 0], [1, 1, 0]) - 45) < 1e-6);
  assert.strictEqual(L.angleBetweenDeg([0, 0, 0], [1, 0, 0]), 0);
});

test('buildSummary derives rounded session stats and carries stoppedBy', () => {
  const s = L.makeStats();
  s.shots = 10; s.hits = 8; s.headshots = 4; s.kills = 4; s.reactionTotalMs = 1248; s.reactionSamples = 4;
  s.validShots = 5; s.validHits = 3; s.firstBulletShots = 4; s.firstBulletHits = 2;
  s.noTargetShots = 1; s.preVisibleShots = 2; s.flashHitShots = 3; s.wallBlockedShots = 4;
  s.missLeft = 5; s.missRight = 6; s.missHigh = 7; s.missLow = 8;
  const out = L.buildSummary(s, 'toggle');
  assert.strictEqual(out.shots, 10);
  assert.strictEqual(out.hits, 8);
  assert.strictEqual(out.kills, 4);
  assert.strictEqual(out.accuracyPct, 80);
  assert.strictEqual(out.headshotPct, 50);
  assert.strictEqual(out.validAccuracyPct, 60);
  assert.strictEqual(out.firstBulletPct, 50);
  assert.strictEqual(out.noTargetShots, 1);
  assert.strictEqual(out.preVisibleShots, 2);
  assert.strictEqual(out.flashHitShots, 3);
  assert.strictEqual(out.wallBlockedShots, 4);
  assert.deepStrictEqual(out.missDirection, { left: 5, right: 6, high: 7, low: 8 });
  assert.strictEqual(out.avgReactionMs, 312);
  assert.strictEqual(out.reactionSamples, 4);
  assert.strictEqual(out.stoppedBy, 'toggle');
  const z = L.buildSummary(L.makeStats(), 'cap');
  assert.strictEqual(z.accuracyPct, 0);
  assert.strictEqual(z.headshotPct, 0);
  assert.strictEqual(z.avgReactionMs, null);
  assert.strictEqual(z.reactionSamples, 0);
  assert.strictEqual(z.stoppedBy, 'cap');
});

// --- primary aim-target selection (must never be a destructible flash) ---
test('pickPrimaryTarget returns the enemy when both enemy and flash are alive', () => {
  const enemy = { isFlash: false };
  const flash = { isFlash: true };
  assert.strictEqual(L.pickPrimaryTarget([enemy, flash]), enemy);
});

test('pickPrimaryTarget returns null when only a flash is alive (enemy already killed)', () => {
  // Regression: after killing the enemy in a flash round, the destructible flash kept
  // living and became alive[0]. targetInfo then read flash.hitboxes[2] (undefined) and
  // threw, freezing the render loop. The primary must be an enemy bot or null, never a flash.
  const flash = { isFlash: true };
  assert.strictEqual(L.pickPrimaryTarget([flash]), null);
});

test('pickPrimaryTarget returns null for an empty list and the first enemy otherwise', () => {
  assert.strictEqual(L.pickPrimaryTarget([]), null);
  const a = { isFlash: false }, b = { isFlash: false };
  assert.strictEqual(L.pickPrimaryTarget([a, b]), a);
});
