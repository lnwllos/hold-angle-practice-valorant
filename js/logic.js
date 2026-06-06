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

// --- Flash: agent selection and round decision ---
// enabledKeys: array of 'breach'|'phoenix'|'yoru' currently enabled. rng() -> [0,1).
function pickFlashAgent(enabledKeys, rng) {
  if (!enabledKeys || enabledKeys.length === 0) return null;
  const i = Math.min(enabledKeys.length - 1, Math.floor(rng() * enabledKeys.length));
  return enabledKeys[i];
}
// A spawn becomes a flash round when at least one agent is enabled and the roll is under chance.
function shouldFlashRound(chance, hasAgent, rng) {
  return !!hasAgent && rng() < chance;
}

// --- Flash: blind factor and duration ---
// angleDeg is the angle between the player's view direction and the direction to the flash
// at detonation. Looking at it (<= fullDeg) -> full blind; turned away (>= zeroDeg) -> none.
function blindFactor(angleDeg, fullDeg, zeroDeg) {
  if (angleDeg <= fullDeg) return 1;
  if (angleDeg >= zeroDeg) return 0;
  return (zeroDeg - angleDeg) / (zeroDeg - fullDeg);
}
function blindDuration(maxBlind, factor) {
  return maxBlind * factor;
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

// --- Lateral shot timing feedback ---
// movementDir is the bot's screen/world X direction while peeking: +1 = right, -1 = left.
// A miss ahead of that motion means the player fired too early; a miss behind it means late.
// Center-head hits are perfect; other head hits are "almost" early/late by head side.
function classifyShotTimingByLateral(isVisible, hitZone, aimX, botX, movementDir, isFullyPeeked, perfectHeadHalfWidth) {
  if (!isVisible) return 'fast';
  if (!Number.isFinite(aimX) || !Number.isFinite(botX) || !movementDir) {
    return classifyShotTimingByPeek(isVisible, isFullyPeeked);
  }

  const delta = aimX - botX;
  const perfectWidth = Number.isFinite(perfectHeadHalfWidth) ? Math.max(0, perfectHeadHalfWidth) : 0;
  if (hitZone === 'head' && Math.abs(delta) <= perfectWidth) return 'perfect';
  if (Math.abs(delta) < 1e-6) return isFullyPeeked ? 'slow' : 'good';
  const isAhead = Math.sign(delta) === Math.sign(movementDir);

  if (hitZone === 'head') return isAhead ? 'nearFast' : 'nearSlow';
  if (hitZone) return 'good';
  return isAhead ? 'fast' : 'slow';
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
    sampleSpawnDelay, pickFlashAgent, shouldFlashRound, blindFactor, blindDuration,
    classifyShotTimingByPeek, classifyShotTimingByLateral,
    recoilOffset, makeStats, recordShot, recordHit, recordKill,
    statAccuracy, statHeadshotPct, statAvgReaction,
  };
}
