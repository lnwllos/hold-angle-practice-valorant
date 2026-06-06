// Pure game logic. No THREE, no DOM — safe to require() in Node tests and to load
// as a browser global. Functions are dependency-free; callers pass any config values.

// --- Damage & health ---
function damageForZone(zone, table) {
  return table[zone] || 0;
}
function applyDamage(ehp, dmg) {
  return ehp - dmg;
}

// --- Peek width sampling ---
// Linear-decreasing likelihood with width: probability density f(x) ∝ (max - x) on [min,max].
// Inverse-CDF sampling: with u ~ U(0,1), width = max - sqrt(u) * (max - min).
// So u near 0 (rare via sqrt compression) gives wide peeks; most samples are narrow.
function peekWeight(width, max) {
  return Math.max(0, max - width);
}
function samplePeekWidth(min, max, rng) {
  const u = rng();
  return max - Math.sqrt(u) * (max - min);
}

// --- Sensitivity ---
// Valorant rotates the view by (sens * 0.07) degrees per mouse count. Browsers report
// movement in CSS pixels (≈ counts here), so this is an approximation; the fine-tune
// multiplier lets the user match feel by hand.
function degPerCount(valSens, yawConst) {
  return valSens * yawConst;
}
function cm360(valSens, dpi, yawConst) {
  return (360 / (valSens * yawConst * dpi)) * 2.54;
}
function effectiveDeg(movementPx, valSens, yawConst, multiplier) {
  return movementPx * valSens * yawConst * multiplier;
}

// --- Fire-rate gating ---
function fireInterval(fireRateRps) {
  return 1 / fireRateRps;
}
function canFire(lastShotTime, now, interval) {
  return now - lastShotTime >= interval;
}

// --- Spawn delay ---
function sampleSpawnDelay(mode, fixedDelay, minDelay, maxDelay, rng) {
  if (mode !== 'random') return fixedDelay;
  const lo = Math.min(minDelay, maxDelay);
  const hi = Math.max(minDelay, maxDelay);
  return lo + (hi - lo) * rng();
}

// --- Shot timing feedback ---
// This is position-based, not reaction-ms based:
// - hidden/not yet visible: early
// - moving through the visible peek: good
// - already stopped at full peek width: late
function classifyShotTimingByPeek(isVisible, isFullyPeeked) {
  if (!isVisible) return 'fast';
  if (isFullyPeeked) return 'slow';
  return 'good';
}

// --- Recoil (approximate Vandal pattern) ---
// shotIndex is the 0-based index within a continuous burst. First shot is dead accurate.
// Vertical climbs quickly over the first ~5 shots then slows; horizontal sway starts after.
// Returns degrees to ADD to the view (pitch up = positive). intensity scales the whole thing.
function recoilOffset(shotIndex, intensity) {
  if (shotIndex <= 0 || intensity <= 0) return { yaw: 0, pitch: 0 };
  const climb = Math.min(shotIndex, 5) * 0.6 + Math.max(0, shotIndex - 5) * 0.15;
  const sway = shotIndex < 5 ? 0 : Math.sin((shotIndex - 5) * 0.7) * (0.4 + (shotIndex - 5) * 0.05);
  return { yaw: sway * intensity, pitch: climb * intensity };
}

// --- Session stats ---
function makeStats() {
  return { shots: 0, hits: 0, headshots: 0, kills: 0, reactionTotalMs: 0 };
}
function recordShot(s) { s.shots += 1; }
function recordHit(s, isHead) { s.hits += 1; if (isHead) s.headshots += 1; }
function recordKill(s, reactionMs) { s.kills += 1; s.reactionTotalMs += reactionMs; }
function statAccuracy(s) { return s.shots ? s.hits / s.shots : 0; }
function statHeadshotPct(s) { return s.hits ? s.headshots / s.hits : 0; }
function statAvgReaction(s) { return s.kills ? s.reactionTotalMs / s.kills : 0; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    damageForZone, applyDamage, peekWeight, samplePeekWidth,
    degPerCount, cm360, effectiveDeg, fireInterval, canFire,
    sampleSpawnDelay, classifyShotTimingByPeek,
    recoilOffset, makeStats, recordShot, recordHit, recordKill,
    statAccuracy, statHeadshotPct, statAvgReaction,
  };
}
