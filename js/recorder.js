// Aim log recorder: while enabled, captures fixed-rate (128Hz) aim/position ticks plus
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
  const TICK_HZ = 128;
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

  function relT() { return Math.round(now() - startMs); }

  function start(m) {
    recording = true;
    startMs = now();
    acc = 0;
    meta = m || {};
    ticks = [];
    events = [];
  }

  function tick(dtSec, snapshot) {
    if (!recording) return;
    const r = ticksToEmit(acc, dtSec, PERIOD);
    acc = r.remainder;
    if (r.count <= 0) return;
    // 128Hz vs a ~60-144fps loop: at most a couple samples per frame. If a slow frame owes
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
    const stats = deps.getStats ? deps.getStats() : makeStats();
    const obj = {
      schemaVersion: 1,
      _readme: 'Aim training log. ticks = fixed 128Hz samples (t in ms from start). ' +
        'angles in degrees, positions [x,y,z] in meters. events map back to ticks via t. ' +
        'aimErrorDeg = angle between crosshair and target head; target is null when no live bot.',
      session: Object.assign({ tickRateHz: TICK_HZ, durationMs: relT() }, meta),
      summary: buildSummary(stats, stoppedBy || 'toggle'),
      ticks,
      events,
    };
    download(filenameNow(), JSON.stringify(obj));
    ticks = [];
    events = [];
    return obj;
  }

  return { start, stop, tick, logEvent, isRecording: () => recording };
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
