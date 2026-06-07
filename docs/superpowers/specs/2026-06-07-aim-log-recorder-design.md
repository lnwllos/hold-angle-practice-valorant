# Aim Log Recorder — Design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)

## Goal

A boolean setting in the trainer that, when enabled, records detailed aiming data at a
fixed 128 Hz tick rate plus discrete gameplay events, and downloads it as a single
structured JSON file per session. The file is designed to be easy for an AI to read and
visualize so the user can analyze their aim, flicks, and tune mouse sensitivity.

## Requirements (decided during brainstorming)

1. **Output** — Download one structured JSON file per session (no backend, no localStorage
   persistence of log data).
2. **Sampling** — Fixed 128 Hz tick only (consistent time axis, independent of render fps).
   No raw mouse-event stream.
3. **Captured data** — see Schema below: per-tick aim/position/target state + discrete
   events (spawn/visible/shot/kill/flash) + session metadata + end-of-session summary.
4. **Lifecycle** — Toggle ON = start recording; toggle OFF = stop and auto-download.
5. **Safety cap** — Auto-stop + download + warn + flip the toggle off when the buffer
   reaches ~10 minutes (≈76,800 ticks) to bound memory.
6. Works in **all training modes** (hold / wallpeek / smoke).

## Architecture

New module **`js/recorder.js`** — factory `Recorder()` following the project's existing
IIFE/factory pattern. Single responsibility: own recording state, buffer ticks + events,
assemble and download the JSON.

Public interface:

- `start(meta)` — begin a session; stamp metadata, reset buffers and the tick accumulator.
- `stop(summary)` — finalize: merge the end-of-session summary, assemble JSON, trigger a
  browser download, clear state. Returns nothing (or the assembled object for testing).
- `tick(dt, snapshot)` — called every frame while recording. Uses a **fixed-timestep
  accumulator** to emit one sample per 1/128 s of accumulated time. `snapshot` is an object
  (or a provider called only when a sample is actually emitted) carrying the current
  yaw/pitch/pos/firing/target.
- `logEvent(type, data)` — append a discrete event with the current recording-relative `t`.
- `isRecording()` — boolean getter.

Dependencies it needs: a clock (`performance.now`) and a download helper (Blob + object
URL + anchor click). Keep DOM/download in a thin function so the rest is testable.

Pure helpers live in **`js/logic.js`** (the tested module):

- `tickAccumulator` logic — given accumulated time and tick period, how many samples to
  emit and the leftover remainder. Implemented as a small pure function/helper so it can be
  unit-tested with a sequence of `dt` values.
- `angleBetweenDeg(aFwd, toTarget)` — angle in degrees between two 3D direction vectors,
  used for `aimErrorDeg`. Pure, testable with known vectors.
- `buildSummary(stats)` — derive the summary object (accuracyPct, headshotPct, etc.) from
  the existing stats shape. Pure, testable.

## Integration (js/game.js + js/settings.js + js/player.js + js/weapon.js)

**settings.js**
- Add boolean setting `logRecord` (default `false`) to `defaults`.
- Add a checkbox row in the panel (visible in all modes), e.g. labeled
  "Log recording (อัดข้อมูลการเล็ง)" with a hint describing the 128 Hz JSON export.

**game.js**
- Create `recorder = Recorder()` in `init()`.
- In `onSettingsChange`, detect a transition of `logRecord`:
  - off → on: `recorder.start(buildMeta())`
  - on → off: `recorder.stop(buildSummary(stats))` (downloads the file)
  - Track the previous value so only real transitions trigger start/stop.
- In `update(dt)`, when `recorder.isRecording()`, call `recorder.tick(dt, snapshot())`.
  - `snapshot()` builds: `yaw`, `pitch` (degrees, from player getters), player `pos`
    (`[x,y,z]`), `firing` (from `weapon.isFiring()`), and `target` — the bot that should be
    aimed at (the held `enemy` in hold mode; the nearest alive peek-mode target otherwise),
    its head world position, `visible`, and `aimErrorDeg` (camera forward vs direction to
    head via `angleBetweenDeg`). `target` is `null` when there is no live bot.
- At existing event sites, also call `recorder.logEvent(...)`:
  - `spawn` (in `spawnEnemy`/`startFlashRound`): side, peekWidthM, distanceM.
  - `visible` (when `visibleAt` first set).
  - `shot` (in `on.shot`): yaw, pitch, aimErrorDeg, hitZone, hit (boolean).
  - `kill` (in `on.kill`): reactionMs.
  - `flash` (in `startFlashRound`/`handleBlind`): agent key, windup, blind info.
- Safety cap: `tick` returns or signals when the cap is hit; game.js responds by setting
  `s.logRecord = false`, calling `settings`/rebuild so the checkbox reflects it, downloading,
  and showing a brief warning (reuse an existing HUD/alert path or a simple `alert`).

**player.js**
- Already exposes `yaw`/`pitch`/`position` getters — no change needed beyond reading them.

**weapon.js**
- Add `isFiring()` getter (expose the internal `firing` flag) so the per-tick snapshot can
  record trigger state.

## Data Format (downloaded JSON)

Filename: `holdangle-log-YYYYMMDD-HHMMSS.json`.

```json
{
  "schemaVersion": 1,
  "_readme": "Aim training log. ticks = fixed 128Hz samples (t in ms from start). angles in degrees, positions [x,y,z] in meters. events map back to ticks via t. aimErrorDeg = angle between crosshair and target head.",
  "session": {
    "startedAt": "2026-06-07T18:30:00.000Z",
    "durationMs": 42313,
    "tickRateHz": 128,
    "trainingMode": "hold",
    "distanceM": 18,
    "fovDeg": 103,
    "sensitivity": { "valSens": 0.4, "dpi": 800, "multiplier": 1.0, "cm360Approx": 33.2 },
    "crosshair": { "color": "#33ff88", "length": 7, "gap": 4, "thickness": 2, "dot": false },
    "recoil": { "on": false, "intensity": 1.0 }
  },
  "summary": {
    "shots": 80, "hits": 64, "kills": 12,
    "accuracyPct": 80, "headshotPct": 55, "avgReactionMs": 312,
    "stoppedBy": "toggle"
  },
  "ticks": [
    { "t": 0, "yaw": 1.4, "pitch": -0.2, "pos": [0, 1.6, 0], "firing": false,
      "target": { "head": [2.1, 1.7, -18], "visible": true, "aimErrorDeg": 3.4 } }
  ],
  "events": [
    { "t": 1203, "type": "spawn",   "side": "right", "peekWidthM": 1.2, "distanceM": 18 },
    { "t": 1450, "type": "visible" },
    { "t": 1602, "type": "shot",    "yaw": 1.41, "pitch": -0.19, "aimErrorDeg": 0.8, "hitZone": "head", "hit": true },
    { "t": 1602, "type": "kill",    "reactionMs": 152 }
  ]
}
```

- Angles in **degrees**; positions `[x, y, z]` in **meters**.
- `target` is `null` on ticks with no live bot.
- `summary.stoppedBy` is `"toggle"` or `"cap"`.

## Testing

`node --test tests/...` following the existing pure-logic test pattern:

- Fixed-timestep accumulator: a sequence of `dt` values yields the expected number of
  samples and remainder (e.g. a long `dt` emits multiple samples; tiny `dt` emits none).
- `angleBetweenDeg`: known vector pairs (0°, 90°, 180°, off-axis).
- `buildSummary`: a stats object maps to the expected summary fields.
- Safety cap: tick count reaching the limit reports the cap condition.

DOM/download and full game-loop wiring are verified manually in the browser (toggle on,
play, toggle off, open the downloaded file; confirm tick count ≈ 128 × seconds and events
line up).

## Out of scope (YAGNI)

- Raw mouse-event stream (option C in brainstorming — not chosen).
- localStorage persistence / multi-session history.
- In-app charts/visualization (the JSON is handed to an AI for that).
- Per-round file splitting.
