# Aim Log Recorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a boolean "Log recording" setting that captures aim (yaw/pitch), player/bot positions, and gameplay events at a fixed 128 Hz, then downloads one structured JSON file per session for AI-assisted aim/flick/sensitivity analysis.

**Architecture:** A new `Recorder()` factory owns recording state, fixed-timestep tick buffering, the safety cap, and the JSON download. Pure math (tick accumulator, angle-between, summary builder) lives in the already-tested `js/logic.js`. `game.js` builds a per-tick snapshot from existing module getters and calls the recorder from the render loop and at existing event sites. `settings.js` adds the toggle; `weapon.js` exposes a firing getter.

**Tech Stack:** Vanilla ES5-style browser JS (classic `<script>` globals, factory functions), Three.js r128 (vendored), Node's built-in test runner for pure logic.

---

## File Structure

- **Create** `js/recorder.js` — `Recorder()` factory: buffers, timing, safety cap, download. Depends on logic.js globals (`ticksToEmit`, `angleBetweenDeg` not needed here, `buildSummary`, `makeStats`) + DOM.
- **Modify** `js/logic.js` — add pure helpers `ticksToEmit`, `angleBetweenDeg`, `buildSummary` and export them.
- **Modify** `tests/logic.test.js` — add tests for the three new helpers.
- **Modify** `js/weapon.js` — add `isFiring()` getter.
- **Modify** `js/settings.js` — add `logRecord` default, a checkbox row, and a `setLogRecord()` method.
- **Modify** `js/game.js` — create the recorder, wire the toggle, build per-tick snapshots, log events.
- **Modify** `index.html` — load `js/recorder.js` before `js/game.js`.
- **Modify** `README.md` — document the setting (and the test command if a new test file were added — it is not; tests go in the existing file).

---

## Task 1: Pure helper — fixed-timestep tick accumulator

**Files:**
- Modify: `js/logic.js` (add function + export)
- Test: `tests/logic.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/logic.test.js`:

```js
// --- aim log recorder helpers ---
test('ticksToEmit emits floor((acc+dt)/period) samples and keeps the remainder', () => {
  // period 1/128 s ≈ 0.0078125 s
  const p = 1 / 128;
  // a 60fps frame (0.016667s) from empty owes 2 ticks
  let r = L.ticksToEmit(0, 0.016667, p);
  assert.strictEqual(r.count, 2);
  assert.ok(Math.abs(r.remainder - (0.016667 - 2 * p)) < 1e-9);

  // a tiny frame owes nothing but accumulates
  r = L.ticksToEmit(0, 0.001, p);
  assert.strictEqual(r.count, 0);
  assert.ok(Math.abs(r.remainder - 0.001) < 1e-9);

  // a long stall (0.05s, the loop's dt clamp) owes 6 ticks
  r = L.ticksToEmit(0, 0.05, p);
  assert.strictEqual(r.count, 6);

  // a non-positive period never emits (defensive)
  r = L.ticksToEmit(0.02, 0.02, 0);
  assert.strictEqual(r.count, 0);
  assert.strictEqual(r.remainder, 0.02);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `L.ticksToEmit is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `js/logic.js`, add after the recoil section (before `// --- Session stats ---`):

```js
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
```

Add `ticksToEmit` to the `module.exports` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/logic.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat: add ticksToEmit fixed-timestep accumulator" --no-gpg-sign
```

---

## Task 2: Pure helper — angle between two 3D vectors (degrees)

**Files:**
- Modify: `js/logic.js`
- Test: `tests/logic.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/logic.test.js`:

```js
test('angleBetweenDeg returns the angle in degrees between [x,y,z] vectors', () => {
  assert.ok(Math.abs(L.angleBetweenDeg([1, 0, 0], [1, 0, 0]) - 0) < 1e-6);
  assert.ok(Math.abs(L.angleBetweenDeg([1, 0, 0], [0, 1, 0]) - 90) < 1e-6);
  assert.ok(Math.abs(L.angleBetweenDeg([1, 0, 0], [-1, 0, 0]) - 180) < 1e-6);
  assert.ok(Math.abs(L.angleBetweenDeg([1, 0, 0], [1, 1, 0]) - 45) < 1e-6);
  // zero-length vector -> 0 (no division by zero)
  assert.strictEqual(L.angleBetweenDeg([0, 0, 0], [1, 0, 0]), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `L.angleBetweenDeg is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `js/logic.js`, directly below `ticksToEmit`:

```js
// Angle in degrees between two 3D vectors given as [x,y,z] arrays. 0 if either is zero-length.
function angleBetweenDeg(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ma = Math.hypot(a[0], a[1], a[2]);
  const mb = Math.hypot(b[0], b[1], b[2]);
  if (ma === 0 || mb === 0) return 0;
  const c = Math.max(-1, Math.min(1, dot / (ma * mb)));
  return (Math.acos(c) * 180) / Math.PI;
}
```

Add `angleBetweenDeg` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/logic.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat: add angleBetweenDeg helper for aim error" --no-gpg-sign
```

---

## Task 3: Pure helper — buildSummary from stats

**Files:**
- Modify: `js/logic.js`
- Test: `tests/logic.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/logic.test.js`:

```js
test('buildSummary derives rounded session stats and carries stoppedBy', () => {
  const s = L.makeStats();
  s.shots = 10; s.hits = 8; s.headshots = 4; s.kills = 4; s.reactionTotalMs = 1248;
  const out = L.buildSummary(s, 'toggle');
  assert.strictEqual(out.shots, 10);
  assert.strictEqual(out.hits, 8);
  assert.strictEqual(out.kills, 4);
  assert.strictEqual(out.accuracyPct, 80);     // 8/10
  assert.strictEqual(out.headshotPct, 50);     // 4/8
  assert.strictEqual(out.avgReactionMs, 312);  // 1248/4
  assert.strictEqual(out.stoppedBy, 'toggle');

  // empty stats: no division by zero
  const z = L.buildSummary(L.makeStats(), 'cap');
  assert.strictEqual(z.accuracyPct, 0);
  assert.strictEqual(z.headshotPct, 0);
  assert.strictEqual(z.avgReactionMs, 0);
  assert.strictEqual(z.stoppedBy, 'cap');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `L.buildSummary is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `js/logic.js`, add at the end of the `// --- Session stats ---` section (after `statAvgReaction`):

```js
// End-of-session summary for the aim log. stoppedBy: 'toggle' | 'cap'.
function buildSummary(s, stoppedBy) {
  return {
    shots: s.shots,
    hits: s.hits,
    kills: s.kills,
    accuracyPct: Math.round(statAccuracy(s) * 100),
    headshotPct: Math.round(statHeadshotPct(s) * 100),
    avgReactionMs: Math.round(statAvgReaction(s)),
    stoppedBy: stoppedBy || 'toggle',
  };
}
```

Add `buildSummary` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/logic.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat: add buildSummary for aim log session" --no-gpg-sign
```

---

## Task 4: Weapon firing getter

**Files:**
- Modify: `js/weapon.js:93`

- [ ] **Step 1: Add the getter**

In `js/weapon.js`, change the return statement (currently `return { update };`) to:

```js
  return { update, isFiring: () => firing };
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `node --test tests/constants.test.js tests/logic.test.js`
Expected: PASS (weapon.js is not unit-tested; this confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add js/weapon.js
git commit -m "feat: expose Weapon.isFiring() for log recording" --no-gpg-sign
```

---

## Task 5: Recorder module

**Files:**
- Create: `js/recorder.js`
- Modify: `index.html:116-117`

- [ ] **Step 1: Create `js/recorder.js`**

```js
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
```

- [ ] **Step 2: Load it before game.js**

In `index.html`, between the `settings.js` and `game.js` script tags (after line 116), add:

```html
  <script src="js/recorder.js"></script>
```

So the tail reads:
```html
  <script src="js/settings.js"></script>
  <script src="js/recorder.js"></script>
  <script src="js/game.js"></script>
```

- [ ] **Step 3: Smoke-check it parses**

Run: `node -e "require('./js/logic.js'); console.log('logic ok')"`
Expected: prints `logic ok` (confirms logic.js still loads; recorder.js itself needs the browser DOM and is verified manually later).

- [ ] **Step 4: Commit**

```bash
git add js/recorder.js index.html
git commit -m "feat: add Recorder module (128Hz buffer + JSON download)" --no-gpg-sign
```

---

## Task 6: Settings toggle

**Files:**
- Modify: `js/settings.js:5-37` (defaults), `:127-138` (panel rows), `:170-177` (return object)

- [ ] **Step 1: Add the default**

In `js/settings.js`, in the `defaults` object, add after `chDot: false,`:

```js
    logRecord: false,
```

- [ ] **Step 2: Add the panel row**

In `build()`, add a row at the very end of the function (after the crosshair dot row, before the closing `}` of `build`):

```js
    row('Log recording (อัดข้อมูลการเล็ง)', checkbox(s.logRecord, v => s.logRecord = v),
      'อัด yaw/pitch + ตำแหน่งบอท 128Hz ระหว่างเล่น; ปิดสวิตช์เพื่อดาวน์โหลดไฟล์ JSON (หยุดเองที่ ~10 นาที).');
```

- [ ] **Step 3: Expose a setter for the safety-cap path**

In the returned object (the `return { ... }` near the end), add:

```js
    setLogRecord: v => { s.logRecord = v; save(); build(); },
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `node --test tests/constants.test.js tests/logic.test.js`
Expected: PASS (settings.js is not unit-tested; confirms nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add js/settings.js
git commit -m "feat: add Log recording toggle to settings" --no-gpg-sign
```

---

## Task 7: Wire the recorder into the game loop

**Files:**
- Modify: `js/game.js` (module-scope vars, `init`, `onSettingsChange`, `spawnEnemy`, `startFlashRound`, `handleBlind`, `updateState`, `update`, and the weapon `on.shot`/`on.kill` callbacks)

- [ ] **Step 1: Declare module-scope state and helpers**

In `js/game.js`, add `recorder` to the first `let` line and add helper vars/functions near the top of the IIFE (after the existing `let flash = ...` block, before `function init()`):

```js
  let recorder = null;

  // --- aim log helpers ---
  const R2D = 180 / Math.PI;
  const _camPos = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _head = new THREE.Vector3();
  const round2 = n => Math.round(n * 100) / 100;
  const round3 = n => Math.round(n * 1000) / 1000;

  // The bot the player should currently be aiming at: the held enemy in hold mode, else the
  // nearest alive peek-mode target. null when there is no live bot.
  function aimTarget() {
    if (mode === 'hold') return enemy && enemy.alive ? enemy : null;
    if (!peekMode) return null;
    const bots = peekMode.getTargets().filter(b => b.alive);
    if (bots.length === 0) return null;
    let best = bots[0], bestD = Infinity;
    for (const b of bots) {
      const dx = b.x - player.position.x, dz = b.z - player.position.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  // Head world position, visibility, and crosshair->head angle for the current aim target.
  function targetInfo() {
    const tgt = aimTarget();
    if (!tgt) return null;
    three.camera.getWorldPosition(_camPos);
    three.camera.getWorldDirection(_fwd);
    tgt.updateMatrixWorld();
    tgt.hitboxes[2].getWorldPosition(_head); // head is index 2 in makeBotParts()
    const to = [_head.x - _camPos.x, _head.y - _camPos.y, _head.z - _camPos.z];
    return {
      head: [round3(_head.x), round3(_head.y), round3(_head.z)],
      visible: !!tgt.visible,
      aimErrorDeg: round2(angleBetweenDeg([_fwd.x, _fwd.y, _fwd.z], to)),
    };
  }

  // One 128Hz sample of player aim/position/firing + target info.
  function snapshot() {
    return {
      yaw: round2(player.yaw * R2D),
      pitch: round2(player.pitch * R2D),
      pos: [round3(player.position.x), round3(player.position.y), round3(player.position.z)],
      firing: weapon.isFiring(),
      target: targetInfo(),
    };
  }

  // Session metadata captured when recording starts.
  function buildLogMeta() {
    const c = settings.get();
    return {
      startedAt: new Date().toISOString(),
      trainingMode: c.trainingMode,
      distanceM: c.distance,
      fovDeg: VALO.FOV_H,
      sensitivity: {
        valSens: c.valSens, dpi: c.dpi, multiplier: c.sensMultiplier,
        cm360Approx: Math.round(cm360(c.valSens, c.dpi, VALO.YAW_CONST) * 10) / 10,
      },
      crosshair: { color: c.chColor, length: c.chLength, gap: c.chGap, thickness: c.chThickness, dot: c.chDot },
      recoil: { on: c.recoilOn, intensity: c.recoilIntensity },
    };
  }
```

- [ ] **Step 2: Create the recorder in `init()`**

In `init()`, after `hud = Hud(settings.crosshair());`, add:

```js
    recorder = Recorder({
      getStats: () => stats,
      onCap: () => {
        settings.setLogRecord(false);
        alert('Aim log: ถึงลิมิต ~10 นาที — หยุดอัดและดาวน์โหลดไฟล์แล้ว');
      },
    });
```

- [ ] **Step 3: Toggle start/stop in `onSettingsChange`**

In `onSettingsChange`, after the `reset-stats` block and before `applyMode();`, add:

```js
    // Log recording toggle (use the recorder's own state as the previous value).
    if (recorder) {
      const wantLog = settings.get().logRecord;
      if (wantLog && !recorder.isRecording()) recorder.start(buildLogMeta());
      else if (!wantLog && recorder.isRecording()) recorder.stop('toggle');
    }
```

- [ ] **Step 4: Sample every frame in `update()`**

In `update(dt)`, after the mode-update block (the `if (mode === 'hold') ... else if (peekMode) ...` lines) and before `if (!autoRespawned) weapon.update(...)`, add:

```js
    if (recorder.isRecording()) recorder.tick(dt, snapshot);
```

- [ ] **Step 5: Log spawn + visible + flash + shot + kill events**

(a) **spawn** — rewrite `spawnEnemy` so the resolved side/width are available to log:

```js
  function spawnEnemy(opts) {
    if (enemy) enemy.dispose();
    const side = opts && opts.side != null ? opts.side : resolveSide();
    const peekWidth = opts && opts.peekWidth != null ? opts.peekWidth : resolvePeekWidth();
    enemy = Enemy(three.scene, { distance: settings.get().distance, peekWidth, side });
    state = 'active';
    visibleAt = null;
    if (recorder && recorder.isRecording()) {
      recorder.logEvent('spawn', {
        side: side < 0 ? 'left' : 'right',
        peekWidthM: round2(peekWidth),
        distanceM: settings.get().distance,
      });
    }
  }
```

(b) **visible** — in `updateState`, change the reaction-clock line:

```js
      if (visibleAt == null && enemy.visible) {
        visibleAt = nowSec; // reaction clock starts
        if (recorder && recorder.isRecording()) recorder.logEvent('visible', {});
      }
```

(c) **flash round** — in `startFlashRound`, after `flash = makeFlash(flashKey, side);`, add:

```js
    if (recorder && recorder.isRecording()) {
      recorder.logEvent('flash', { agent: flashKey, windupS: flashAgent.windup, blindMaxS: flashAgent.blind });
    }
```

(d) **blind applied** — in `handleBlind`, after `const dur = blindDuration(flashAgent.blind, factor);`, add:

```js
    if (recorder && recorder.isRecording()) {
      recorder.logEvent('blind', { agent: flashKey, durationS: round2(dur), factor: round2(factor) });
    }
```

(e) **shot** — in the `on.shot` callback, at the very top of the handler (before `recordShot(stats);`), add:

```js
          if (recorder && recorder.isRecording()) {
            const ti = targetInfo();
            recorder.logEvent('shot', {
              yaw: round2(player.yaw * R2D),
              pitch: round2(player.pitch * R2D),
              aimErrorDeg: ti ? ti.aimErrorDeg : null,
              hitZone: info.hitZone || 'miss',
              hit: !!info.hitZone && !info.hitFlash,
            });
          }
```

(f) **kill** — in the `on.kill` callback: in the `mode === 'hold'` branch, after `recordKill(stats, reaction);`, add:

```js
            if (recorder && recorder.isRecording()) recorder.logEvent('kill', { reactionMs: Math.round(reaction) });
```

and in the `else` branch, after `recordKill(stats, 0);`, add:

```js
            if (recorder && recorder.isRecording()) recorder.logEvent('kill', { reactionMs: 0 });
```

- [ ] **Step 6: Verify existing tests still pass**

Run: `node --test tests/constants.test.js tests/logic.test.js`
Expected: PASS (game.js is not unit-tested; confirms nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add js/game.js
git commit -m "feat: record aim ticks + events and export on toggle off" --no-gpg-sign
```

---

## Task 8: Manual browser verification

**Files:** none (manual)

- [ ] **Step 1: Serve and open**

Run: `start.bat` (or open `index.html`), then open http://localhost:8000, click to play.

- [ ] **Step 2: Record a short session**

Press Esc → tick **Log recording** on → play ~15 s in Hold mode (let bots peek, shoot a few, get a kill) → Esc → untick **Log recording**. A `holdangle-log-YYYYMMDD-HHMMSS.json` file downloads.

- [ ] **Step 3: Validate the file**

Run: `node -e "const f=require('fs');const g=require('glob');" 2>NUL & node -e "const fs=require('fs');const d=fs.readdirSync(process.env.USERPROFILE+'/Downloads').filter(n=>n.startsWith('holdangle-log-')).sort();const j=JSON.parse(fs.readFileSync(process.env.USERPROFILE+'/Downloads/'+d[d.length-1]));console.log('ticks',j.ticks.length,'events',j.events.map(e=>e.type),'durMs',j.session.durationMs);console.log('approx Hz', (j.ticks.length/(j.session.durationMs/1000)).toFixed(1));"`
Expected: `ticks` ≈ 128 × seconds recorded, `approx Hz` ≈ 128, `events` includes `spawn`/`visible`/`shot`/`kill`, and `session.sensitivity`/`summary` are populated.

- [ ] **Step 4: Spot-check the schema**

Open the JSON. Confirm: ticks have `yaw`/`pitch` in degrees, `pos` as `[x,y,z]`, `firing` booleans that are `true` during the frames you held click, and `target.aimErrorDeg` shrinking as your crosshair nears a visible bot's head. `target` is `null` on ticks with no live bot.

---

## Task 9: Documentation

**Files:**
- Modify: `README.md` (Settings section + Layout)

- [ ] **Step 1: Document the setting**

In `README.md`, in the Settings list, add a bullet (after the **Crosshair** bullet):

```markdown
- **Log recording**: when on, records your aim (yaw/pitch), player/bot positions, and events
  (spawn/visible/shot/kill/flash) at a fixed **128 Hz**. Turn it **off** to download one
  `holdangle-log-*.json` per session — a structured file meant for AI-assisted analysis of
  aim, flicks, and sensitivity. Auto-stops and downloads at a ~10-minute safety cap.
```

- [ ] **Step 2: Add the module to the Layout block**

In the Layout code block, add after the `js/settings.js` line:

```
js/recorder.js    aim log recorder: 128Hz tick buffer + events + JSON export
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document Log recording setting + recorder module" --no-gpg-sign
```

---

## Self-Review

**Spec coverage:**
- JSON download per session → Task 5 (`stop` + `defaultDownload`), verified Task 8.
- Fixed 128 Hz tick → Task 1 (`ticksToEmit`), Task 5 (`tick`), Task 7 Step 4.
- Captured fields (yaw/pitch/pos/firing/target+aimErrorDeg) → Task 7 Step 1 (`snapshot`/`targetInfo`); firing getter Task 4; angle math Task 2.
- Events (spawn/visible/shot/kill/flash + blind) → Task 7 Step 5.
- Metadata + summary → Task 7 Step 1 (`buildLogMeta`), Task 3 (`buildSummary`), Task 5 (`session`).
- Toggle ON=start / OFF=stop+download → Task 6 (toggle), Task 7 Steps 2-3.
- Safety cap (~10 min, auto-stop+warn+untick) → Task 5 (`MAX_TICKS`, cap path), Task 7 Step 2 (`onCap`), Task 6 Step 3 (`setLogRecord`).
- Works in all modes → `aimTarget()` handles hold + peek modes (Task 7 Step 1).
- Tested pure helpers → Tasks 1-3.

**Placeholder scan:** No TBD/TODO; every code step shows complete code.

**Type consistency:** `ticksToEmit` returns `{count, remainder}` (Task 1) consumed in Task 5. `buildSummary(stats, stoppedBy)` (Task 3) called in Task 5 `stop`. `angleBetweenDeg(a, b)` with array args (Task 2) called in `targetInfo` (Task 7). `Recorder` deps `{ now, download, getStats, onCap }` (Task 5) match the `init()` call (Task 7 Step 2). `settings.setLogRecord` (Task 6) called in `onCap` (Task 7 Step 2). Head hitbox index `2` matches `makeBotParts` order legs/body/head (bot.js).

## Out of scope (YAGNI)
Raw mouse-event stream; localStorage persistence; in-app charts; per-round file splitting.
