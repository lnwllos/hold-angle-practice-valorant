# Flash Training (Breach / Phoenix / Yoru) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an option where some rounds throw an agent's flash (Breach/Phoenix/Yoru) at the held angle; the player turns away to reduce the blind, then turns back to kill the enemy that peeks after the pop.

**Architecture:** Pure, testable helpers go in `logic.js`; Valorant reference values in `constants.js`; a THREE visual object in a new `flash.js` mirroring `enemy.js`; a full-screen white blind overlay driven from `hud.js`; a synthesized flash sound in `effects.js`; UI in `settings.js`; orchestration (new `'flashing'` lifecycle phase) in `game.js`.

**Tech Stack:** Vanilla JS (browser globals + factory functions), THREE.js r128 (vendored global `THREE`), Node's built-in test runner (`node --test`), WebAudio for synthesized sound.

**Spec:** `docs/superpowers/specs/2026-06-07-flash-training-design.md`

---

## File Structure

- `js/constants.js` — add `VALO.FLASH` (per-agent windup/blind/color + tuning fields)
- `js/logic.js` — add 5 pure functions: `pickFlashAgent`, `shouldFlashRound`, `blindFactor`, `blindDuration`, `flashOverlayOpacity`
- `js/flash.js` — **new** THREE module: the flash orb + windup + burst (mirrors `enemy.js`)
- `js/hud.js` — blind overlay control (`triggerBlind`, `updateBlind`)
- `js/effects.js` — synthesized `playFlashWindup` / `playFlashPop`
- `js/settings.js` — "Flash training" UI + persisted keys
- `js/game.js` — flash-round orchestration via `'flashing'` state
- `index.html` — `#flash-overlay` div + CSS, `<script src="js/flash.js">`
- `tests/constants.test.js` — assert `VALO.FLASH` shape/values
- `tests/logic.test.js` — tests for the 5 pure functions
- `README.md` — document new settings + behavior

Run tests with: `node --test tests/constants.test.js tests/logic.test.js`

---

## Task 1: Flash reference constants

**Files:**
- Modify: `js/constants.js`
- Test: `tests/constants.test.js`

- [ ] **Step 1: Write the failing test**

Add this test to `tests/constants.test.js` (after the existing `VALO holds...` test):

```js
test('VALO.FLASH holds per-agent windup/blind/color and tuning fields', () => {
  const f = VALO.FLASH;
  const keys = Object.keys(f).sort();
  assert.deepStrictEqual(keys,
    ['blindFullDeg', 'blindZeroDeg', 'breach', 'enemyPeekDelay', 'phoenix', 'rampUp', 'travel', 'yoru']);
  for (const k of ['breach', 'phoenix', 'yoru']) {
    assert.ok(typeof f[k].windup === 'number' && f[k].windup > 0, `${k}.windup`);
    assert.ok(typeof f[k].blind === 'number' && f[k].blind > 0, `${k}.blind`);
    assert.strictEqual(typeof f[k].color, 'number', `${k}.color`);
  }
  assert.strictEqual(f.breach.windup, 0.5);
  assert.strictEqual(f.breach.blind, 2.0);
  assert.ok(f.blindFullDeg < f.blindZeroDeg);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/constants.test.js`
Expected: FAIL — `Cannot read properties of undefined (reading 'sort')` (VALO.FLASH not defined).

- [ ] **Step 3: Add the constant**

In `js/constants.js`, inside the `VALO` object, add this entry after the `AIM_FEEDBACK` line (keep the trailing comma style):

```js
  AIM_FEEDBACK: { perfectHeadHalfWidth: 0.045 }, // meters around head center counted as perfect
  // Flash abilities (current-patch approximations; tunable). windup = charge time before
  // the pop; blind = max blind seconds when looking straight at it; color = orb/burst tint.
  FLASH: {
    breach:  { windup: 0.5, blind: 2.0,  color: 0xfff2b0 }, // Flashpoint — yellow-white
    phoenix: { windup: 0.6, blind: 1.3,  color: 0xffb060 }, // Curveball  — orange (fire)
    yoru:    { windup: 0.6, blind: 1.75, color: 0xbcd6ff }, // Blindside  — blue-white
    travel: 0.35,         // s — orb flight from corner into view before windup (our animation)
    enemyPeekDelay: 0.15, // s — after detonation before the enemy starts peeking
    blindFullDeg: 35,     // angle(view, flash) <= this -> full blind
    blindZeroDeg: 100,    // angle(view, flash) >= this -> no blind
    rampUp: 0.05,         // s — white overlay rises to full this fast
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/constants.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add js/constants.js tests/constants.test.js
git commit -m "feat: add VALO.FLASH reference constants

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Pure logic — agent pick + flash-round decision

**Files:**
- Modify: `js/logic.js`
- Test: `tests/logic.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/logic.test.js` (before the final `module.exports` is irrelevant — just append near the stats section, anywhere among the tests):

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `L.pickFlashAgent is not a function`.

- [ ] **Step 3: Implement**

In `js/logic.js`, add after the `sampleSpawnDelay` function (before the shot-timing section):

```js
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
```

Then add both names to the `module.exports` object in `js/logic.js`. Change:

```js
    sampleSpawnDelay, classifyShotTimingByPeek, classifyShotTimingByLateral,
```

to:

```js
    sampleSpawnDelay, pickFlashAgent, shouldFlashRound,
    classifyShotTimingByPeek, classifyShotTimingByLateral,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/logic.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat: add pickFlashAgent and shouldFlashRound logic

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Pure logic — blind factor + duration

**Files:**
- Modify: `js/logic.js`
- Test: `tests/logic.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/logic.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `L.blindFactor is not a function`.

- [ ] **Step 3: Implement**

In `js/logic.js`, add after the `shouldFlashRound` function:

```js
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
```

Then extend the `module.exports` block — change:

```js
    sampleSpawnDelay, pickFlashAgent, shouldFlashRound,
```

to:

```js
    sampleSpawnDelay, pickFlashAgent, shouldFlashRound, blindFactor, blindDuration,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/logic.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat: add blindFactor and blindDuration logic

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Pure logic — overlay opacity curve

**Files:**
- Modify: `js/logic.js`
- Test: `tests/logic.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/logic.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `L.flashOverlayOpacity is not a function`.

- [ ] **Step 3: Implement**

In `js/logic.js`, add after `blindDuration`:

```js
// White-overlay opacity for the current frame: 0->1 over rampUp, then linear 1->0 over the
// rest of duration, 0 once finished.
function flashOverlayOpacity(elapsed, duration, rampUp) {
  if (duration <= 0 || elapsed < 0 || elapsed >= duration) return 0;
  if (rampUp > 0 && elapsed < rampUp) return elapsed / rampUp;
  const decaySpan = duration - rampUp;
  if (decaySpan <= 0) return 1;
  return Math.max(0, Math.min(1, (duration - elapsed) / decaySpan));
}
```

Then extend the `module.exports` block — change:

```js
    sampleSpawnDelay, pickFlashAgent, shouldFlashRound, blindFactor, blindDuration,
```

to:

```js
    sampleSpawnDelay, pickFlashAgent, shouldFlashRound, blindFactor, blindDuration,
    flashOverlayOpacity,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/constants.test.js tests/logic.test.js`
Expected: PASS (all tests across both files).

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat: add flashOverlayOpacity curve

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Flash visual module

**Files:**
- Create: `js/flash.js`
- Modify: `index.html` (add `<script>` tag)

(No Node test — depends on global `THREE`, like `enemy.js`. Verified manually in Task 9.)

- [ ] **Step 1: Create `js/flash.js`**

```js
// A practice flash: an agent-colored orb emerges from behind the corner, flies into view,
// winds up, then bursts. Mirrors enemy.js — owns its THREE objects and disposes them.
//
// Geometry reuses the enemy's corner: innerEdge = side*1.0, cover wall at z = -distance + 2.
// Timeline from creation: travel -> windup -> detonate -> burst fade -> done. The
// Valorant-accurate piece is `windup`; `travel` is our added flight animation. The caller
// reads `position` at detonation to compute the blind from the player's view angle.
//
// cfg: { color, windup, travel, side, distance }   side = -1 (left) or +1 (right)
function Flash(scene, cfg) {
  const side = cfg.side;
  const wallZ = -cfg.distance + 2;
  const innerEdge = side * 1.0;
  const eyeY = 1.5;

  const startPos = new THREE.Vector3(innerEdge + side * 0.8, eyeY, wallZ); // behind corner (occluded)
  const detPos = new THREE.Vector3(innerEdge - side * 0.3, eyeY, wallZ);   // past corner, in view

  const travel = cfg.travel;
  const windup = cfg.windup;
  const detonateAt = travel + windup;
  const burstDur = 0.3;
  const burstEnd = detonateAt + burstDur;

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 16),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.95 })
  );
  orb.position.copy(startPos);
  scene.add(orb);

  const light = new THREE.PointLight(cfg.color, 0, 14);
  light.position.copy(startPos);
  scene.add(light);

  const burst = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
  );
  burst.position.copy(detPos);
  burst.visible = false;
  scene.add(burst);

  let t = 0;
  let disposed = false;

  function update(dt) {
    if (disposed) return;
    t += dt;
    if (t < travel) {
      const k = travel > 0 ? t / travel : 1;
      orb.position.lerpVectors(startPos, detPos, k);
      light.position.copy(orb.position);
      light.intensity = 0.5 * k;
    } else if (t < detonateAt) {
      const k = windup > 0 ? (t - travel) / windup : 1;
      orb.position.copy(detPos);
      orb.scale.setScalar(1 + k * 1.5);
      light.position.copy(detPos);
      light.intensity = 0.5 + k * 2.5;
    } else if (t < burstEnd) {
      const k = burstDur > 0 ? (t - detonateAt) / burstDur : 1;
      orb.visible = false;
      burst.visible = true;
      burst.scale.setScalar(1 + k * 8);
      burst.material.opacity = (1 - k) * 0.9;
      light.position.copy(detPos);
      light.intensity = 6 * (1 - k);
    } else {
      burst.visible = false;
      light.intensity = 0;
    }
  }

  function disposeObj(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(orb);
    scene.remove(light);
    scene.remove(burst);
    disposeObj(orb);
    disposeObj(burst);
  }

  return {
    update,
    dispose,
    position: detPos,
    get windingUp() { return t >= travel && t < detonateAt; },
    get detonated() { return t >= detonateAt; },
    get done() { return t >= burstEnd; },
  };
}
```

- [ ] **Step 2: Register the script in `index.html`**

In `index.html`, change:

```html
  <script src="js/enemy.js"></script>
  <script src="js/weapon.js"></script>
```

to:

```html
  <script src="js/enemy.js"></script>
  <script src="js/flash.js"></script>
  <script src="js/weapon.js"></script>
```

- [ ] **Step 3: Sanity-check the file parses**

Run: `node --check js/flash.js`
Expected: no output (exit 0). (This only checks syntax; `THREE` is not evaluated.)

- [ ] **Step 4: Commit**

```bash
git add js/flash.js index.html
git commit -m "feat: add Flash visual module (orb, windup, burst)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Blind overlay in HUD

**Files:**
- Modify: `index.html` (overlay div + CSS)
- Modify: `js/hud.js`

(No Node test — DOM + uses global `VALO`/`flashOverlayOpacity`. Verified manually in Task 9.)

- [ ] **Step 1: Add the overlay element**

In `index.html`, change:

```html
  <div id="hud">
    <canvas id="crosshair" width="60" height="60"></canvas>
    <div id="shot-feedback-stack"></div>
    <div id="stats"></div>
  </div>
```

to:

```html
  <div id="hud">
    <canvas id="crosshair" width="60" height="60"></canvas>
    <div id="shot-feedback-stack"></div>
    <div id="stats"></div>
    <div id="flash-overlay"></div>
  </div>
```

- [ ] **Step 2: Add the overlay CSS**

In `index.html`, inside the `<style>` block, add after the `#stats b { ... }` rule:

```css
    #flash-overlay { position: absolute; inset: 0; background: #ffffff; opacity: 0;
      pointer-events: none; z-index: 20; }
```

- [ ] **Step 3: Add blind control to `js/hud.js`**

In `js/hud.js`, inside the `Hud(...)` factory, after the line:

```js
  const feedbackStack = document.getElementById('shot-feedback-stack');
```

add:

```js
  const overlay = document.getElementById('flash-overlay');
  let blindElapsed = 0, blindDuration = 0, blindTint = '#ffffff';

  function toCss(color) {
    return typeof color === 'number'
      ? '#' + color.toString(16).padStart(6, '0')
      : (color || '#ffffff');
  }
  function triggerBlind(durationSec, tintColor) {
    blindDuration = Math.max(0, durationSec || 0);
    blindElapsed = 0;
    blindTint = toCss(tintColor);
  }
  function updateBlind(dt) {
    if (!overlay) return;
    if (blindDuration <= 0) { overlay.style.opacity = '0'; return; }
    blindElapsed += dt;
    overlay.style.background = blindElapsed < blindDuration * 0.15 ? blindTint : '#ffffff';
    overlay.style.opacity = String(flashOverlayOpacity(blindElapsed, blindDuration, VALO.FLASH.rampUp));
    if (blindElapsed >= blindDuration) { blindDuration = 0; overlay.style.opacity = '0'; }
  }
```

- [ ] **Step 4: Export the new methods**

In `js/hud.js`, change the return statement:

```js
  return { update, drawCrosshair, showShotFeedback };
```

to:

```js
  return { update, drawCrosshair, showShotFeedback, triggerBlind, updateBlind };
```

- [ ] **Step 5: Sanity-check parse**

Run: `node --check js/hud.js`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add index.html js/hud.js
git commit -m "feat: add flash blind overlay to HUD

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Synthesized flash sound

**Files:**
- Modify: `js/effects.js`

(No Node test — WebAudio. Verified manually in Task 9.)

- [ ] **Step 1: Add a WebAudio synth to `Effects`**

In `js/effects.js`, inside the `Effects(scene, camera)` factory, after the line:

```js
  const tracers = [];
```

add:

```js
  // Lazy WebAudio context for synthesized flash cues (no audio files needed).
  let audioCtx = null;
  function ctx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { audioCtx = null; }
    }
    return audioCtx;
  }
  function playFlashWindup(durSec) {
    const ac = ctx(); if (!ac) return;
    const now = ac.currentTime;
    const d = durSec || 0.5;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + d);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + d * 0.85);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + d);
    osc.connect(gain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + d + 0.05);
  }
  function playFlashPop() {
    const ac = ctx(); if (!ac) return;
    const now = ac.currentTime;
    const len = Math.floor(ac.sampleRate * 0.25);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    src.connect(gain).connect(ac.destination);
    src.start(now);
  }
```

- [ ] **Step 2: Export the new methods**

In `js/effects.js`, change the return statement of `Effects`:

```js
  return {
    addTracer,
    update,
    playShot: () => shotSound.play(),
    playKill: () => killSound.play(),
  };
```

to:

```js
  return {
    addTracer,
    update,
    playShot: () => shotSound.play(),
    playKill: () => killSound.play(),
    playFlashWindup,
    playFlashPop,
  };
```

- [ ] **Step 3: Sanity-check parse**

Run: `node --check js/effects.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add js/effects.js
git commit -m "feat: add synthesized flash windup/pop sounds

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Settings UI + persisted keys

**Files:**
- Modify: `js/settings.js`

(No Node test — DOM/localStorage. Verified manually in Task 9.)

- [ ] **Step 1: Add defaults**

In `js/settings.js`, in the `defaults` object, add after the `respawnDelayMax` line:

```js
    respawnDelayMax: VALO.SPAWN_DELAY.max,
    flashBreach: false,
    flashPhoenix: false,
    flashYoru: false,
    flashChance: 0.3,   // fraction of spawns that become flash rounds (needs an agent enabled)
    flashSound: true,
```

- [ ] **Step 2: Add the UI section**

In `js/settings.js`, in `build()`, add this block right after the spawn-delay `if (s.spawnDelayMode === 'fixed') { ... } else { ... }` block and before the `row('Valorant sensitivity', ...)` line:

```js
    row('Flash: Breach (Flashpoint)', checkbox(s.flashBreach, v => s.flashBreach = v));
    row('Flash: Phoenix (Curveball)', checkbox(s.flashPhoenix, v => s.flashPhoenix = v));
    row('Flash: Yoru (Blindside)', checkbox(s.flashYoru, v => s.flashYoru = v));
    row('Flash frequency', range(0, 1, 0.05, s.flashChance, v => Math.round(v * 100) + '%',
      v => s.flashChance = v), 'Chance a spawn is a flash round (needs an agent enabled).');
    row('Flash sound', checkbox(s.flashSound, v => s.flashSound = v));
```

- [ ] **Step 3: Sanity-check parse**

Run: `node --check js/settings.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add js/settings.js
git commit -m "feat: add Flash training settings (agents, frequency, sound)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Orchestrate flash rounds in game.js

**Files:**
- Modify: `js/game.js`

(No Node test — composition root. Verified manually in Step 6 below.)

- [ ] **Step 1: Add flash-round state variables**

In `js/game.js`, change the enemy-lifecycle block:

```js
  // Enemy lifecycle
  let enemy = null;
  let state = 'waiting';   // 'waiting' | 'active' | 'dead'
  let respawnAt = 0;       // wall-clock seconds when the next enemy spawns
  let visibleAt = null;    // wall-clock seconds the current enemy became visible (reaction clock)
```

to:

```js
  // Enemy lifecycle
  let enemy = null;
  let state = 'waiting';   // 'waiting' | 'active' | 'flashing' | 'dead'
  let respawnAt = 0;       // wall-clock seconds when the next enemy spawns
  let visibleAt = null;    // wall-clock seconds the current enemy became visible (reaction clock)

  // Flash-round lifecycle (a flash pops, then the held enemy peeks)
  let flash = null;
  let flashAgent = null;
  let enemyPeekAt = 0;
  let windupSoundPlayed = false;
  let detonationHandled = false;
```

- [ ] **Step 2: Let `spawnEnemy` accept explicit side/peek (so the flash and the follow-up enemy share a side)**

In `js/game.js`, change:

```js
  function spawnEnemy() {
    if (enemy) enemy.dispose();
    enemy = Enemy(three.scene, {
      distance: settings.get().distance,
      peekWidth: resolvePeekWidth(),
      side: resolveSide(),
    });
    state = 'active';
    visibleAt = null;
  }
```

to:

```js
  function spawnEnemy(opts) {
    if (enemy) enemy.dispose();
    enemy = Enemy(three.scene, {
      distance: settings.get().distance,
      peekWidth: opts && opts.peekWidth != null ? opts.peekWidth : resolvePeekWidth(),
      side: opts && opts.side != null ? opts.side : resolveSide(),
    });
    state = 'active';
    visibleAt = null;
  }

  // Decide whether the next spawn is a plain enemy or a flash round.
  function startRound() {
    const cfg = settings.get();
    const enabled = [];
    if (cfg.flashBreach) enabled.push('breach');
    if (cfg.flashPhoenix) enabled.push('phoenix');
    if (cfg.flashYoru) enabled.push('yoru');
    if (shouldFlashRound(cfg.flashChance, enabled.length > 0, Math.random)) {
      startFlashRound(enabled);
    } else {
      spawnEnemy();
    }
  }

  // Spawn the enemy hidden behind cover (so the angle/wall is held), then play a flash that
  // pops in front of the corner. The enemy is held until shortly after detonation.
  function startFlashRound(enabled) {
    if (flash) { flash.dispose(); flash = null; } // defensive: never leak a previous flash
    const key = pickFlashAgent(enabled, Math.random);
    flashAgent = VALO.FLASH[key];
    const side = resolveSide();
    spawnEnemy({ side, peekWidth: resolvePeekWidth() }); // wall + bot, hidden; sets state 'active'
    state = 'flashing';                                  // override: hold the bot until the pop
    flash = Flash(three.scene, {
      color: flashAgent.color,
      windup: flashAgent.windup,
      travel: VALO.FLASH.travel,
      side,
      distance: settings.get().distance,
    });
    windupSoundPlayed = false;
    detonationHandled = false;
  }

  // At detonation, blind by how far the player's view is from the flash, then queue the peek.
  function handleDetonation(nowSec) {
    const camPos = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    three.camera.getWorldPosition(camPos);
    three.camera.getWorldDirection(fwd);
    const toFlash = flash.position.clone().sub(camPos).normalize();
    const cos = Math.max(-1, Math.min(1, fwd.dot(toFlash)));
    const angleDeg = (Math.acos(cos) * 180) / Math.PI;
    const factor = blindFactor(angleDeg, VALO.FLASH.blindFullDeg, VALO.FLASH.blindZeroDeg);
    hud.triggerBlind(blindDuration(flashAgent.blind, factor), flashAgent.color);
    if (settings.get().flashSound) effects.playFlashPop();
    enemyPeekAt = nowSec + VALO.FLASH.enemyPeekDelay;
  }
```

- [ ] **Step 3: Drive the flash round in `updateState` and gate the enemy on `'active'`**

In `js/game.js`, change the whole `updateState` function:

```js
  function updateState(nowSec) {
    if (state === 'waiting' || state === 'dead') {
      if (nowSec >= respawnAt) spawnEnemy();
    }
    if (enemy && enemy.alive) {
      const wasFullPeeked = enemy.fullPeeked;
      enemy.update(lastDt);
      if (visibleAt == null && enemy.visible) visibleAt = nowSec; // reaction clock starts
      if (settings.get().respawnOnFullPeek && !wasFullPeeked && enemy.fullPeeked) {
        // Keep the cover wall during the respawn delay; dispose it only when the next
        // enemy is created so the angle does not flicker open between spawns.
        enemy.kill();
        state = 'dead';
        respawnAt = nowSec + resolveRespawnDelay();
        return true;
      }
    }
    return false;
  }
```

to:

```js
  function updateState(nowSec) {
    if (state === 'waiting' || state === 'dead') {
      if (nowSec >= respawnAt) startRound();
    }

    // Advance the flash visual whenever one exists. It outlives the 'flashing' phase by a
    // short burst, so update/dispose it independently of `state` (otherwise the burst would
    // freeze and leak once the enemy is released).
    if (flash) {
      flash.update(lastDt);
      if (!windupSoundPlayed && flash.windingUp) {
        windupSoundPlayed = true;
        if (settings.get().flashSound) effects.playFlashWindup(flashAgent.windup);
      }
      if (!detonationHandled && flash.detonated) {
        detonationHandled = true;
        handleDetonation(nowSec);
      }
      if (state === 'flashing' && detonationHandled && nowSec >= enemyPeekAt) {
        state = 'active'; // release the held enemy; it begins peeking next frame
      }
      if (flash.done) { flash.dispose(); flash = null; }
    }

    if (state === 'active' && enemy && enemy.alive) {
      const wasFullPeeked = enemy.fullPeeked;
      enemy.update(lastDt);
      if (visibleAt == null && enemy.visible) visibleAt = nowSec; // reaction clock starts
      if (settings.get().respawnOnFullPeek && !wasFullPeeked && enemy.fullPeeked) {
        // Keep the cover wall during the respawn delay; dispose it only when the next
        // enemy is created so the angle does not flicker open between spawns.
        enemy.kill();
        state = 'dead';
        respawnAt = nowSec + resolveRespawnDelay();
        return true;
      }
    }
    return false;
  }
```

- [ ] **Step 4: Drive the blind overlay each frame**

In `js/game.js`, change the `update` function:

```js
  function update(dt) {
    lastDt = dt;
    const nowSec = performance.now() / 1000;
    player.update(dt);
    const autoRespawned = updateState(nowSec);
    if (!autoRespawned) weapon.update(dt, nowSec);
    effects.update(dt);
    hud.update(stats, (performance.now() - sessionStart) / 1000);
  }
```

to:

```js
  function update(dt) {
    lastDt = dt;
    const nowSec = performance.now() / 1000;
    player.update(dt);
    const autoRespawned = updateState(nowSec);
    if (!autoRespawned) weapon.update(dt, nowSec);
    effects.update(dt);
    hud.updateBlind(dt);
    hud.update(stats, (performance.now() - sessionStart) / 1000);
  }
```

- [ ] **Step 5: Sanity-check parse + run the unit suite**

Run: `node --check js/game.js`
Expected: no output (exit 0).

Run: `node --test tests/constants.test.js tests/logic.test.js`
Expected: PASS (all tests).

- [ ] **Step 6: Manual verification in the browser**

Start the local server: `python -m http.server 8000` (or run `start.bat`), open `http://localhost:8000`, click to play, press **Esc**, and under "Flash training" enable **Breach** and set **Flash frequency** to **100%**. Then verify:
- A yellow-white orb emerges from the corner, winds up ~0.5 s, and bursts.
- Holding your crosshair on the corner when it pops → screen whites out for ~2 s.
- Turning fully away just before the pop → little or no white-out.
- After the pop, the enemy peeks the same corner; you can kill it (kill/stats/respawn still work).
- You hear a rising windup tone then a pop.
- Switch to **Phoenix** (orange, shorter blind) and **Yoru** (blue) and confirm color/timing differ.
- Disable all three agents → only normal enemies spawn (no flashes).

- [ ] **Step 7: Commit**

```bash
git add js/game.js
git commit -m "feat: orchestrate flash rounds (flash pops, then enemy peeks)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Document the feature in README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the settings**

In `README.md`, in the `## Settings (Esc)` bullet list, add after the `**Respawn at full peek**` bullet:

```markdown
- **Flash training**: enable **Breach (Flashpoint)**, **Phoenix (Curveball)**, and/or **Yoru
  (Blindside)**. When at least one is on, **Flash frequency** sets the chance a spawn becomes a
  flash round: an agent-colored flash pops at the angle with that agent's real windup and blind
  duration — look away to reduce the blind — and then the enemy peeks. **Flash sound** toggles a
  synthesized windup/pop cue.
```

- [ ] **Step 2: Add the module to the Layout list**

In `README.md`, in the `## Layout` code block, add after the `js/enemy.js` line:

```
js/flash.js       practice flash: orb + windup + burst (Breach/Phoenix/Yoru)
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document flash training settings and module

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the full unit suite: `node --test tests/constants.test.js tests/logic.test.js` → all PASS.
- [ ] `node --check` passes for every modified/created JS file.
- [ ] Manual browser checks from Task 9 Step 6 all hold.
- [ ] `git status` is clean (everything committed).
