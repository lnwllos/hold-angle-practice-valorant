// Aim log recorder: while enabled, captures fixed-rate aim/position ticks plus
// discrete gameplay events, then downloads one JSON file per session. Pure math lives in
// logic.js (ticksToEmit / buildSummary); this module owns the buffers, timing, the safety
// cap, and the browser download. Classic-script factory, like the rest of js/.
//
// deps (all optional, defaulted for the browser; overridable in tests):
//   now()       -> milliseconds clock (default performance.now)
//   download(name, text) -> save a text file (default: Blob + <a download>)
//   getStats()  -> the live stats object (for the end-of-session summary)
//   onCap()     -> called after the safety cap auto-stops a recording
function Recorder(deps) {
  deps = deps || {};
  const TICK_HZ = deps.tickHz || 64;
  const PERIOD = 1 / TICK_HZ;            // seconds
  const MAX_TICKS = TICK_HZ * 60 * 10;   // ~10 minutes safety cap
  const now = deps.now || (() => performance.now());
  const download = deps.download || defaultDownload;

  let recording = false;
  let startMs = 0;
  let acc = 0;        // tick accumulator (seconds)
  let meta = null;
  let ticks = [];
  let events = [];
  let statsBaseline = null;

  function relT() { return Math.round(now() - startMs); }

  function snapshotStats() {
    return Object.assign(makeStats(), deps.getStats ? deps.getStats() : makeStats());
  }

  function start(m) {
    recording = true;
    startMs = now();
    acc = 0;
    meta = m || {};
    ticks = [];
    events = [];
    statsBaseline = snapshotStats();
  }

  function tick(dtSec, snapshot) {
    if (!recording) return;
    const r = ticksToEmit(acc, dtSec, PERIOD);
    acc = r.remainder;
    if (r.count <= 0) return;
    // The game loop is ~60-144fps: at most a couple samples per frame. If a slow frame owes
    // several, record the same current snapshot for each so the time axis stays dense.
    const s = snapshot();
    const t = relT();
    for (let i = 0; i < r.count; i++) {
      ticks.push(Object.assign({ t }, s));
      if (ticks.length >= MAX_TICKS) { stop('cap'); if (deps.onCap) deps.onCap(); return; }
    }
  }

  function logEvent(type, data) {
    if (!recording) return;
    events.push(Object.assign({ t: relT(), type }, data || {}));
  }

  function stop(stoppedBy) {
    if (!recording) return null;
    recording = false;
    const stats = diffStats(snapshotStats(), statsBaseline || makeStats());
    const durationMs = relT();
    const summary = buildSummary(stats, stoppedBy || 'toggle');
    const obj = {
      schemaVersion: 2,
      logProfile: `analysis-${TICK_HZ}hz`,
      _readme: 'Aim training log. ticks = fixed-rate samples (t in ms from start). ' +
        'ticks keep lightweight aim/player state; shot events carry full target/timing context. ' +
        'angles in degrees, positions [x,y,z] in meters. aimErrorDeg is absolute crosshair-to-head angle; ' +
        'yawErrorDeg/pitchErrorDeg are signed current-aim minus target-head angles.',
      session: Object.assign({ tickRateHz: TICK_HZ, durationMs }, meta),
      summary,
      segments: buildEventSegments(events, durationMs, meta),
      ticks,
      events,
    };
    download(filenameNow(), JSON.stringify(obj));
    ticks = [];
    events = [];
    return obj;
  }

  function markStatsBaseline() {
    statsBaseline = snapshotStats();
  }

  return { start, stop, tick, logEvent, markStatsBaseline, isRecording: () => recording };
}

function diffStats(current, baseline) {
  const out = makeStats();
  Object.keys(out).forEach(k => {
    out[k] = Math.max(0, (current && current[k] || 0) - (baseline && baseline[k] || 0));
  });
  return out;
}

function buildEventSegments(events, durationMs, initialConfig) {
  const segments = [];
  let startT = 0;
  let config = configFields(initialConfig);
  let summary = makeEventSummary();

  function close(endT, reason) {
    if (endT < startT) endT = startT;
    segments.push(Object.assign({
      startT,
      endT,
      reason,
      summary: finalizeEventSummary(summary),
    }, config));
  }

  for (const e of events) {
    if (e.type === 'config' || e.type === 'reset-stats') {
      close(e.t, e.type);
      startT = e.t;
      summary = makeEventSummary();
      if (e.type === 'config') config = configFields(e);
      continue;
    }
    countEvent(summary, e);
  }
  close(durationMs, 'stop');
  return segments;
}

function configFields(src) {
  src = src || {};
  return {
    trainingMode: src.trainingMode || null,
    distanceM: src.distanceM == null ? null : src.distanceM,
  };
}

function makeEventSummary() {
  return {
    shots: 0, hits: 0, kills: 0, headshots: 0, reactionTotalMs: 0, reactionSamples: 0,
    validShots: 0, validHits: 0, validHeadshots: 0, firstBulletShots: 0, firstBulletHits: 0,
    noTargetShots: 0, preVisibleShots: 0, flashHitShots: 0, wallBlockedShots: 0,
    missLeft: 0, missRight: 0, missHigh: 0, missLow: 0,
  };
}

function countEvent(s, e) {
  if (e.type === 'shot') {
    s.shots += 1;
    const valid = e.targetVisible && e.targetId != null && e.reason !== 'flash-hit' && e.reason !== 'wall-blocked';
    if (valid) {
      s.validShots += 1;
      if (e.hit) {
        s.validHits += 1;
        if (e.hitZone === 'head') s.validHeadshots += 1;
      }
    }
    if (e.firstBullet) {
      s.firstBulletShots += 1;
      if (e.hit) s.firstBulletHits += 1;
    }
    if (e.reason === 'no-target') s.noTargetShots += 1;
    else if (e.reason === 'target-not-visible') s.preVisibleShots += 1;
    else if (e.reason === 'flash-hit') s.flashHitShots += 1;
    else if (e.reason === 'wall-blocked') s.wallBlockedShots += 1;
    else if (e.reason === 'miss-left') s.missLeft += 1;
    else if (e.reason === 'miss-right') s.missRight += 1;
    else if (e.reason === 'miss-high') s.missHigh += 1;
    else if (e.reason === 'miss-low') s.missLow += 1;
    if (e.hit) {
      s.hits += 1;
      if (e.hitZone === 'head') s.headshots += 1;
    }
  } else if (e.type === 'kill') {
    s.kills += 1;
    if (Number.isFinite(e.reactionMs)) {
      s.reactionTotalMs += e.reactionMs;
      s.reactionSamples += 1;
    }
  }
}

function finalizeEventSummary(s) {
  return {
    shots: s.shots,
    hits: s.hits,
    kills: s.kills,
    accuracyPct: s.shots ? Math.round((s.hits / s.shots) * 100) : 0,
    headshotPct: s.hits ? Math.round((s.headshots / s.hits) * 100) : 0,
    validShots: s.validShots,
    validHits: s.validHits,
    validAccuracyPct: s.validShots ? Math.round((s.validHits / s.validShots) * 100) : 0,
    firstBulletShots: s.firstBulletShots,
    firstBulletHits: s.firstBulletHits,
    firstBulletPct: s.firstBulletShots ? Math.round((s.firstBulletHits / s.firstBulletShots) * 100) : 0,
    noTargetShots: s.noTargetShots,
    preVisibleShots: s.preVisibleShots,
    flashHitShots: s.flashHitShots,
    wallBlockedShots: s.wallBlockedShots,
    missDirection: { left: s.missLeft, right: s.missRight, high: s.missHigh, low: s.missLow },
    avgReactionMs: s.reactionSamples ? Math.round(s.reactionTotalMs / s.reactionSamples) : null,
    reactionSamples: s.reactionSamples,
  };
}

function filenameNow() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `holdangle-log-${stamp}.json`;
}

function defaultDownload(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
