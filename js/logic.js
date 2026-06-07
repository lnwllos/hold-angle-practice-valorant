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

// --- Peek mode: wave count ---
// 'fixed' -> the fixed value clamped to [1, max]. 'random' -> an integer in [1, max].
function sampleEnemyCount(mode, fixed, max, rng) {
  const hi = Math.max(1, Math.floor(max));
  if (mode !== 'random') return Math.max(1, Math.min(hi, Math.floor(fixed)));
  return Math.min(hi, 1 + Math.floor(rng() * hi));
}

// --- Peek mode: target placements ---
// Place `count` bots at random {x, z} within bounds, rejection-sampling so no two are
// closer than minSep. Attempts are capped; the last sample is used if no gap is found, so
// the function always returns exactly `count` placements (never loops forever).
// bounds: { spreadX, depthMin, depthMax, minSep }. x in [-spreadX, spreadX]; z in [-depthMax, -depthMin].
function randomTargetPlacements(count, bounds, rng) {
  const { spreadX, depthMin, depthMax, minSep } = bounds;
  const sep2 = minSep * minSep;
  const out = [];
  for (let i = 0; i < count; i++) {
    let pick = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = (rng() * 2 - 1) * spreadX;
      const z = -(depthMin + rng() * (depthMax - depthMin));
      pick = { x, z };
      const ok = out.every(p => {
        const dx = p.x - x, dz = p.z - z;
        return dx * dx + dz * dz >= sep2;
      });
      if (ok) break;
    }
    out.push(pick);
  }
  return out;
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

// White-overlay opacity for the current frame: 0->1 over rampUp, then linear 1->0 over the
// rest of duration, 0 once finished.
function flashOverlayOpacity(elapsed, duration, rampUp) {
  if (duration <= 0 || elapsed < 0 || elapsed >= duration) return 0;
  if (rampUp > 0 && elapsed < rampUp) return elapsed / rampUp;
  const decaySpan = duration - rampUp;
  if (decaySpan <= 0) return 1;
  return Math.max(0, Math.min(1, (duration - elapsed) / decaySpan));
}

// --- Destructible flash: nearsight effect & drone detection ---
// Nearsight intensity for the current frame, 0..1. elapsed is seconds since the blind began.
// Ramps 0->1 over rampUp, holds at 1, then eases 1->0 over the last fadeOut seconds.
function nearsightIntensity(elapsed, rampUp, duration, fadeOut) {
  if (duration <= 0 || elapsed <= 0 || elapsed >= duration) return 0;
  if (rampUp > 0 && elapsed < rampUp) return elapsed / rampUp;
  const fadeStart = duration - fadeOut;
  if (fadeOut > 0 && elapsed > fadeStart) return Math.max(0, (duration - elapsed) / fadeOut);
  return 1;
}

// Lock-on progress 0..1 — fraction of the required lock time the player has been continuously
// detected. Clamped; reaches 1 (lock complete) at lockTime. lockTime <= 0 means instant.
function lockOnProgress(elapsedInCone, lockTime) {
  if (lockTime <= 0) return 1;
  return Math.max(0, Math.min(1, elapsedInCone / lockTime));
}

// True when a target sits inside a forward scan cone of TOTAL angle coneDeg (half each side).
// angleDeg is the angle between the cone's forward axis and the direction to the target.
function inScanCone(angleDeg, coneDeg) {
  return angleDeg <= coneDeg / 2;
}

// Success classification: the player destroyed the flash before its blind began.
function flashDestroyedInTime(destroyed, blindStarted) {
  return !!destroyed && !blindStarted;
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

// --- Stationary-target feedback (peek modes) ---
// Stationary shot feedback: head is a perfect kill shot, body/legs are good,
// anything else (occluder/miss) shows nothing.
function classifyStationaryShot(hitZone) {
  if (hitZone === 'head') return 'perfect';
  if (hitZone === 'body' || hitZone === 'legs') return 'good';
  return null;
}

// The player is "behind cover" (arms the next wall-peek wave) when centered within the
// pocket and not pushed forward past it. behindZ is the most-forward z still counted as safe.
function isBehindCover(x, z, halfWidth, behindZ) {
  return Math.abs(x) <= halfWidth && z >= behindZ;
}

// Smoke cycle for a wave: opaque for coverDur, then fades to clear over fadeDur, then stays
// clear. Returns the current phase and the smoke's opacity for this frame.
function smokePhase(elapsed, coverDur, fadeDur) {
  if (elapsed < coverDur) return { phase: 'covered', opacity: 1 };
  if (elapsed < coverDur + fadeDur) {
    return { phase: 'fading', opacity: 1 - (elapsed - coverDur) / fadeDur };
  }
  return { phase: 'clear', opacity: 0 };
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

// --- Aim log recorder helpers ---
// Fixed-timestep tick accumulator. accSec is leftover time, dtSec this frame, periodSec the
// tick period (all seconds). Returns how many samples to emit this frame and the new leftover.
function ticksToEmit(accSec, dtSec, periodSec) {
  if (periodSec <= 0) return { count: 0, remainder: accSec };
  let acc = accSec + dtSec;
  let count = 0;
  while (acc >= periodSec) { acc -= periodSec; count += 1; }
  return { count, remainder: acc };
}

// Angle in degrees between two 3D vectors given as [x,y,z] arrays. 0 if either is zero-length.
function angleBetweenDeg(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ma = Math.hypot(a[0], a[1], a[2]);
  const mb = Math.hypot(b[0], b[1], b[2]);
  if (ma === 0 || mb === 0) return 0;
  const c = Math.max(-1, Math.min(1, dot / (ma * mb)));
  return (Math.acos(c) * 180) / Math.PI;
}

// The aim-analysis "primary" target: the first alive ENEMY bot in the shootable set, or null.
// Destructible flashes (eyeorb/trackdrone) share the shootable interface but are NOT bots —
// they only expose a single hitbox, so they must never be chosen as the primary (targetInfo
// reads the bot's head at hitboxes[2]). When only a flash is alive (e.g. the enemy was just
// killed but the flash is still floating), this returns null so no enemy aim info is computed.
function pickPrimaryTarget(aliveTargets) {
  if (!aliveTargets) return null;
  for (const t of aliveTargets) if (t && !t.isFlash) return t;
  return null;
}

// --- Session stats ---
function makeStats() {
  return {
    shots: 0,
    hits: 0,
    headshots: 0,
    kills: 0,
    reactionTotalMs: 0,
    reactionSamples: 0,
    validShots: 0,
    validHits: 0,
    validHeadshots: 0,
    firstBulletShots: 0,
    firstBulletHits: 0,
    firstBulletHeadshots: 0,
    noTargetShots: 0,
    preVisibleShots: 0,
    flashHitShots: 0,
    wallBlockedShots: 0,
    missLeft: 0,
    missRight: 0,
    missHigh: 0,
    missLow: 0,
  };
}
function recordShot(s, info) {
  s.shots += 1;
  if (!info) return;
  if (info.valid) {
    s.validShots = (s.validShots || 0) + 1;
    if (info.hit) {
      s.validHits = (s.validHits || 0) + 1;
      if (info.isHead) s.validHeadshots = (s.validHeadshots || 0) + 1;
    }
  }
  if (info.firstBullet) {
    s.firstBulletShots = (s.firstBulletShots || 0) + 1;
    if (info.hit) {
      s.firstBulletHits = (s.firstBulletHits || 0) + 1;
      if (info.isHead) s.firstBulletHeadshots = (s.firstBulletHeadshots || 0) + 1;
    }
  }
  if (info.reason === 'no-target') s.noTargetShots = (s.noTargetShots || 0) + 1;
  else if (info.reason === 'target-not-visible') s.preVisibleShots = (s.preVisibleShots || 0) + 1;
  else if (info.reason === 'flash-hit') s.flashHitShots = (s.flashHitShots || 0) + 1;
  else if (info.reason === 'wall-blocked') s.wallBlockedShots = (s.wallBlockedShots || 0) + 1;
  else if (info.reason === 'miss-left') s.missLeft = (s.missLeft || 0) + 1;
  else if (info.reason === 'miss-right') s.missRight = (s.missRight || 0) + 1;
  else if (info.reason === 'miss-high') s.missHigh = (s.missHigh || 0) + 1;
  else if (info.reason === 'miss-low') s.missLow = (s.missLow || 0) + 1;
}
function recordHit(s, isHead) { s.hits += 1; if (isHead) s.headshots += 1; }
function recordKill(s, reactionMs) {
  s.kills += 1;
  if (Number.isFinite(reactionMs)) {
    s.reactionTotalMs += reactionMs;
    s.reactionSamples = (s.reactionSamples || 0) + 1;
  }
}
function statAccuracy(s) { return s.shots ? s.hits / s.shots : 0; }
function statHeadshotPct(s) { return s.hits ? s.headshots / s.hits : 0; }
function statValidAccuracy(s) { return s.validShots ? (s.validHits || 0) / s.validShots : 0; }
function statFirstBulletPct(s) { return s.firstBulletShots ? (s.firstBulletHits || 0) / s.firstBulletShots : 0; }
function statAvgReaction(s) {
  const samples = s.reactionSamples || 0;
  return samples ? s.reactionTotalMs / samples : 0;
}

// End-of-session summary for the aim log. stoppedBy: 'toggle' | 'cap'.
function buildSummary(s, stoppedBy) {
  const reactionSamples = s.reactionSamples || 0;
  return {
    shots: s.shots,
    hits: s.hits,
    kills: s.kills,
    accuracyPct: Math.round(statAccuracy(s) * 100),
    headshotPct: Math.round(statHeadshotPct(s) * 100),
    validShots: s.validShots || 0,
    validHits: s.validHits || 0,
    validAccuracyPct: Math.round(statValidAccuracy(s) * 100),
    firstBulletShots: s.firstBulletShots || 0,
    firstBulletHits: s.firstBulletHits || 0,
    firstBulletPct: Math.round(statFirstBulletPct(s) * 100),
    noTargetShots: s.noTargetShots || 0,
    preVisibleShots: s.preVisibleShots || 0,
    flashHitShots: s.flashHitShots || 0,
    wallBlockedShots: s.wallBlockedShots || 0,
    missDirection: {
      left: s.missLeft || 0,
      right: s.missRight || 0,
      high: s.missHigh || 0,
      low: s.missLow || 0,
    },
    avgReactionMs: reactionSamples ? Math.round(statAvgReaction(s)) : null,
    reactionSamples,
    stoppedBy: stoppedBy || 'toggle',
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    damageForZone, applyDamage, peekWeight, samplePeekWidth,
    degPerCount, cm360, effectiveDeg, fireInterval, canFire,
    sampleSpawnDelay, sampleEnemyCount, randomTargetPlacements, pickFlashAgent, shouldFlashRound, blindFactor, blindDuration,
    flashOverlayOpacity, nearsightIntensity, lockOnProgress, inScanCone, flashDestroyedInTime,
    classifyShotTimingByPeek, classifyShotTimingByLateral, classifyStationaryShot, isBehindCover, smokePhase,
    recoilOffset, pickPrimaryTarget, makeStats, recordShot, recordHit, recordKill,
    statAccuracy, statHeadshotPct, statValidAccuracy, statFirstBulletPct, statAvgReaction, buildSummary,
    ticksToEmit, angleBetweenDeg,
  };
}
