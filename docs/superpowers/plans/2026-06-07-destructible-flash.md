# Destructible Flash (Eye Blind Orb + Tracking Blind Drone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two destructible flash agents to the Hold-mode flash-round pool — a stationary nearsight **Eye Blind Orb** (flick-to-destroy) and a moving **Tracking Blind Drone** (track-and-destroy / lock-on) — both emerging from behind the corner wall.

**Architecture:** Pure, tested helpers go in `js/logic.js`. Two new render modules (`js/eyeorb.js`, `js/trackdrone.js`) mirror the existing `js/flash.js` pattern (own + dispose their own THREE objects) and expose the same shootable target interface as a bot (`hitboxes` / `alive` / `applyDamage`), tagged `isFlash` so `weapon.js` hits them unchanged. `game.js` drives every flash through one unified blind path via `shouldBlind` / `blindKind` getters. The nearsight effect is a new CSS overlay driven by HUD.

**Tech Stack:** Vanilla JS (classic scripts, global `VALO`/`THREE`), Three.js (`three.min.js`), Node's built-in test runner (`node:test`). No build step.

**Spec:** `docs/superpowers/specs/2026-06-07-destructible-flash-design.md`

**Test command (baseline = 44 passing):** `node --test tests/logic.test.js`

---

### Task 1: Pure logic helpers

**Files:**
- Modify: `js/logic.js` (add 4 functions + export them)
- Test: `tests/logic.test.js` (append tests)

- [ ] **Step 1: Write the failing tests**

Append to `tests/logic.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `L.nearsightIntensity is not a function` (and the other three).

- [ ] **Step 3: Implement the functions**

In `js/logic.js`, insert after the `flashOverlayOpacity` function (after line 120, before `// --- Shot timing feedback ---`):

```js
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
```

Then add the names to the `module.exports` object. Change the line:

```js
    flashOverlayOpacity,
```

to:

```js
    flashOverlayOpacity, nearsightIntensity, lockOnProgress, inScanCone, flashDestroyedInTime,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/logic.test.js`
Expected: PASS — 48 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat: pure helpers for nearsight + drone lock-on detection"
```

---

### Task 2: Constants for the two new flash agents

**Files:**
- Modify: `js/constants.js` (add entries to `VALO.FLASH`)
- Test: `tests/constants.test.js` (append a test)

- [ ] **Step 1: Write the failing test**

Append to `tests/constants.test.js`:

```js
test('destructible flash agents are defined with hit-count health', () => {
  for (const key of ['eyeorb', 'trackdrone']) {
    const a = VALO.FLASH[key];
    assert.ok(a, `${key} missing from VALO.FLASH`);
    assert.strictEqual(a.type, 'destructible');
    assert.ok(a.destroyHits >= 1, `${key} needs destroyHits >= 1`);
    assert.ok(a.blind > 0, `${key} needs blind > 0`);
  }
  assert.strictEqual(VALO.FLASH.eyeorb.effect, 'nearsight');
  assert.strictEqual(VALO.FLASH.trackdrone.effect, 'overlay');
  assert.ok(VALO.FLASH.nearsight.maxBlur > 0);
});
```

Check the top of `tests/constants.test.js` for how it imports. If it does not already destructure `VALO`, ensure the file has near the top: `const { VALO } = require('../js/constants.js');` (it already uses `VALO` for other tests, so this is present — do not duplicate it).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/constants.test.js`
Expected: FAIL — `eyeorb missing from VALO.FLASH`.

- [ ] **Step 3: Add the constants**

In `js/constants.js`, inside the `FLASH: { ... }` block, add the three keys right after the `yoru:` line (after line 25) and before `enemyPeekDelay:`:

```js
    // Destructible flashes (you SHOOT these to cancel the blind). HP is measured in bullet
    // HITS, not EHP. Original abstract visuals — no official names/assets. Hold mode only.
    eyeorb: {
      type: 'destructible', effect: 'nearsight',
      color: 0xff5fae,   // abstract magenta-pink glow (not an eye)
      flight: 'emerge',  // emerges from the wall, floats ~1.5 m forward, stops + hovers
      travel: 0.25,      // s — spawn travel to resting position
      windup: 0.45,      // s — active -> full-effect arm delay (fair reaction window)
      destroyHits: 2,    // bullets to destroy
      blind: 1.6,        // s — max nearsight duration (looking straight at it)
    },
    trackdrone: {
      type: 'destructible', effect: 'overlay',
      color: 0x66e0a0,        // abstract green glow (not a creature)
      flight: 'scan',         // launches from the wall, crosses the view laterally while scanning
      flightTime: 1.4,        // s — active flight duration before it expires
      scanStartDelay: 0.2,    // s — after launch before scanning begins
      lockOnTime: 0.4,        // s — player must stay locked this long before it fires
      scanRange: 26,          // m
      scanConeDeg: 60,        // total scan cone angle (degrees)
      destroyHits: 2,
      blind: 1.5,             // s — strong overlay blind on a successful hit
    },
    nearsight: { maxBlur: 6, vignetteStrength: 0.85 }, // CSS nearsight tuning
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/constants.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/constants.js tests/constants.test.js
git commit -m "feat: constants for eye-orb + tracking-drone flashes"
```

---

### Task 3: Eye Blind Orb render module

**Files:**
- Create: `js/eyeorb.js`
- Modify: `index.html` (load the script)

No unit test — render modules are untested, consistent with `flash.js`/`enemy.js`. Verified in the browser in Task 9.

- [ ] **Step 1: Create `js/eyeorb.js`**

```js
// Eye Blind Orb: a DESTRUCTIBLE nearsight flash. Emerges from behind the corner wall,
// floats a short distance to the player side, then hovers until shot or armed. Original
// abstract glowing orb — not an eye. Exposes the same shootable interface as a bot
// (hitboxes / alive / applyDamage) tagged isFlash, so weapon.js hits it unchanged.
// HP is counted in bullet HITS (one hit = -1), not EHP.
//
// Geometry mirrors enemy.js / flash.js: wallZ = -distance + 2, innerEdge = side * 1.0.
// cfg: { color, travel, windup, destroyHits, side, distance }
function EyeOrb(scene, cfg) {
  const side = cfg.side;
  const wallZ = -cfg.distance + 2;
  const innerEdge = side * 1.0;

  // Emerge from inside the wall, float toward the player, stop and hover.
  const startPos = new THREE.Vector3(innerEdge - side * 0.2, 1.60, wallZ - 0.1);
  const restPos  = new THREE.Vector3(innerEdge - side * 0.3, 1.55, wallZ + 1.5);
  const travel = cfg.travel;
  const windup = cfg.windup;
  const armAt = travel + windup;       // full effect arms here (if not destroyed)
  const lifetime = armAt + 2.0;        // expire if never destroyed

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 18, 18),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.95 })
  );
  orb.position.copy(startPos);
  orb.scale.setScalar(0.05);
  scene.add(orb);

  // Faint ring = "shoot me now" affordance / blind-radius hint.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.28, 24),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0, side: THREE.DoubleSide })
  );
  ring.position.copy(restPos);
  scene.add(ring);

  const light = new THREE.PointLight(cfg.color, 0, 10);
  light.position.copy(startPos);
  scene.add(light);

  // Fixed, generous, invisible hitbox so the orb is fair to shoot (the visible orb pulses).
  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 12),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.copy(startPos);
  scene.add(hitbox);

  let hp = cfg.destroyHits;
  let t = 0;
  let alive = true;
  let destroyed = false;
  let disposed = false;
  let burstT = -1; // >= 0 while the destroy burst plays

  function update(dt) {
    if (disposed) return;
    t += dt;

    if (destroyed) {
      if (burstT >= 0) {
        burstT += dt;
        const k = Math.min(1, burstT / 0.25);
        orb.scale.setScalar(Math.max(0.01, (1 - k) * 1.2));
        orb.material.opacity = (1 - k) * 0.95;
        light.intensity = 4 * (1 - k);
      }
      return;
    }

    if (t < travel) {
      const k = travel > 0 ? t / travel : 1;
      orb.position.lerpVectors(startPos, restPos, k);
      orb.scale.setScalar(0.05 + k * 0.95);
      orb.material.opacity = 0.3 + k * 0.65;
      light.intensity = 0.4 * k;
    } else {
      // hovering + warning pulse that speeds up as it approaches the arm time
      orb.position.copy(restPos);
      orb.position.y = restPos.y + Math.sin(t * 2.2) * 0.06;
      orb.rotation.y += dt * 1.2;
      const armK = windup > 0 ? Math.min(1, (t - travel) / windup) : 1;
      const pulseSpeed = 4 + armK * 14;
      const pulse = 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(t * pulseSpeed));
      orb.scale.setScalar(pulse);
      orb.material.opacity = 0.92;
      light.intensity = 0.8 + armK * 2.2;
      ring.position.copy(orb.position);
      ring.lookAt(0, orb.position.y, 0);
      ring.material.opacity = 0.25 + armK * 0.35;
    }
    light.position.copy(orb.position);
    hitbox.position.copy(orb.position);
  }

  function applyDamage(/* zone */) {
    if (!alive) return false;
    hp -= 1;
    if (hp <= 0) { destroy(); return true; }
    return false;
  }

  function destroy() {
    if (!alive) return;
    alive = false;
    destroyed = true;
    burstT = 0;
    ring.material.opacity = 0;
  }

  function disposeObj(o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(orb); scene.remove(ring); scene.remove(light); scene.remove(hitbox);
    disposeObj(orb); disposeObj(ring); disposeObj(hitbox);
  }

  const api = {
    update, dispose, applyDamage,
    hitboxes: [hitbox],
    isFlash: true,
    updateMatrixWorld: () => hitbox.updateMatrixWorld(true),
    get position() { return orb.position; },
    get alive() { return alive; },
    get shouldBlind() { return alive && t >= armAt; },
    get blindKind() { return 'nearsight'; },
    get destroyed() { return destroyed; },
    get done() { return destroyed ? burstT >= 0.25 : t >= lifetime; },
  };
  hitbox.userData.bot = api;
  hitbox.userData.zone = 'core';
  return api;
}
```

- [ ] **Step 2: Load the script in `index.html`**

After the `<script src="js/flash.js"></script>` line (line 99), add:

```html
  <script src="js/eyeorb.js"></script>
```

- [ ] **Step 3: Sanity-check it parses**

Run: `node -e "global.THREE={};require('./js/eyeorb.js');console.log(typeof EyeOrb)"`
Expected: prints `function` (the file defines `EyeOrb` as a global; it does not execute it, so a stub `THREE` is enough to load it).

- [ ] **Step 4: Commit**

```bash
git add js/eyeorb.js index.html
git commit -m "feat: Eye Blind Orb destructible flash module"
```

---

### Task 4: Tracking Blind Drone render module

**Files:**
- Create: `js/trackdrone.js`
- Modify: `index.html` (load the script)

No unit test (render module). Detection math uses the Task 1 helpers.

- [ ] **Step 1: Create `js/trackdrone.js`**

```js
// Tracking Blind Drone: a DESTRUCTIBLE, MOVING flash. Launches from behind the corner and
// crosses the view laterally while scanning. Its scan cone eases from the flight direction
// toward the player; once the player stays inside the cone (in range) for lockOnTime, it
// fires a blind pulse. Generic flying scanner — not a creature. Same shootable interface as
// EyeOrb (isFlash, fixed invisible hitbox; HP counted in bullet hits).
//
// In Hold mode the player is stationary, so detection reduces to: drone visible + in range,
// cone aimed at the player, lock held for lockOnTime. Destroy it before it fires to succeed.
//
// cfg: { color, flightTime, scanStartDelay, lockOnTime, scanRange, scanConeDeg,
//        destroyHits, side, distance, getPlayerPos }
function TrackDrone(scene, cfg) {
  const side = cfg.side;
  const wallZ = -cfg.distance + 2;
  const innerEdge = side * 1.0;

  // Launch from behind the corner, fly laterally inward across the view (player must track it).
  const startPos = new THREE.Vector3(innerEdge + side * 0.6, 1.70, wallZ + 0.2);
  const endPos   = new THREE.Vector3(innerEdge - side * 2.2, 1.70, wallZ + 1.2);
  const flightFwd = new THREE.Vector3(endPos.x - startPos.x, 0, endPos.z - startPos.z).normalize();

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 16),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.95 })
  );
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  body.add(core);
  body.position.copy(startPos);
  scene.add(body);

  // Scan cone visual (thin, semi-transparent). ConeGeometry points +Y; we re-orient it.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.4, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
  );
  cone.visible = false;
  scene.add(cone);

  const light = new THREE.PointLight(cfg.color, 0.6, 10);
  light.position.copy(startPos);
  scene.add(light);

  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 12),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.copy(startPos);
  scene.add(hitbox);

  let hp = cfg.destroyHits;
  let t = 0;
  let prog = 0;       // 0..1 along the flight path (advances slower while locking)
  let coneTime = 0;   // continuous seconds the player has been inside the cone
  let alive = true;
  let destroyed = false;
  let fired = false;
  let disposed = false;
  let burstT = -1;

  const _toP = new THREE.Vector3();
  const _coneFwd = new THREE.Vector3();
  function lockK() { return lockOnProgress(coneTime, cfg.lockOnTime); }

  function update(dt) {
    if (disposed) return;
    t += dt;

    if (destroyed) {
      if (burstT >= 0) {
        burstT += dt;
        const k = Math.min(1, burstT / 0.25);
        body.scale.setScalar(Math.max(0.01, 1 - k));
        body.material.opacity = (1 - k) * 0.95;
        light.intensity = 4 * (1 - k);
        cone.visible = false;
      }
      return;
    }

    // advance along the path; slow down as the lock builds
    const slow = 1 - 0.55 * lockK();           // 1.0 -> 0.45
    if (flightTime() > 0) prog = Math.min(1, prog + (dt / flightTime()) * slow);
    body.position.lerpVectors(startPos, endPos, prog);
    body.position.y = startPos.y + Math.sin(t * 5) * 0.08; // bob
    light.position.copy(body.position);
    hitbox.position.copy(body.position);

    // scanning + detection
    const scanning = t >= cfg.scanStartDelay && !fired;
    let inCone = false;
    if (scanning) {
      const p = cfg.getPlayerPos();
      _toP.set(p.x - body.position.x, 0, p.z - body.position.z);
      const dist = _toP.length();
      if (dist > 1e-6) _toP.divideScalar(dist);
      // ease the cone's aim from the flight direction toward the player over 0.3 s
      const ease = Math.min(1, (t - cfg.scanStartDelay) / 0.3);
      _coneFwd.copy(flightFwd).lerp(_toP, ease);
      if (_coneFwd.lengthSq() > 1e-9) _coneFwd.normalize();
      const cos = Math.max(-1, Math.min(1, _coneFwd.dot(_toP)));
      const angleDeg = (Math.acos(cos) * 180) / Math.PI;
      inCone = dist <= cfg.scanRange && inScanCone(angleDeg, cfg.scanConeDeg);

      cone.visible = true;
      cone.position.copy(body.position).add(_coneFwd.clone().multiplyScalar(0.7));
      cone.lookAt(body.position.x + _coneFwd.x, body.position.y, body.position.z + _coneFwd.z);
      cone.rotateX(Math.PI / 2);
    } else {
      cone.visible = false;
    }
    coneTime = inCone ? coneTime + dt : Math.max(0, coneTime - dt * 2);

    const lk = lockK();
    light.intensity = 0.6 + lk * 2.4;
    core.scale.setScalar(1 + lk * 1.5);

    if (!fired && lk >= 1) fired = true;
    // expired without firing -> just drops/dissolves
    if (!fired && t >= flightTime()) destroy();
  }

  function flightTime() { return cfg.flightTime; }

  function applyDamage(/* zone */) {
    if (!alive) return false;
    hp -= 1;
    if (hp <= 0) { destroy(); return true; }
    return false;
  }

  function destroy() {
    if (!alive) return;
    alive = false;
    destroyed = true;
    burstT = 0;
    cone.visible = false;
  }

  function disposeObj(o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(body); scene.remove(cone); scene.remove(light); scene.remove(hitbox);
    disposeObj(core); disposeObj(body); disposeObj(cone); disposeObj(hitbox);
  }

  const api = {
    update, dispose, applyDamage,
    hitboxes: [hitbox],
    isFlash: true,
    updateMatrixWorld: () => hitbox.updateMatrixWorld(true),
    get position() { return body.position; },
    get alive() { return alive; },
    get shouldBlind() { return alive && fired; },
    get blindKind() { return 'overlay'; },
    get destroyed() { return destroyed; },
    get done() { return destroyed ? burstT >= 0.25 : (fired ? t >= flightTime() + 0.3 : false); },
  };
  hitbox.userData.bot = api;
  hitbox.userData.zone = 'core';
  return api;
}
```

- [ ] **Step 2: Load the script in `index.html`**

After the `<script src="js/eyeorb.js"></script>` line you added in Task 3, add:

```html
  <script src="js/trackdrone.js"></script>
```

- [ ] **Step 3: Sanity-check it parses**

Run: `node -e "global.THREE={};global.lockOnProgress=()=>0;global.inScanCone=()=>false;require('./js/trackdrone.js');console.log(typeof TrackDrone)"`
Expected: prints `function`.

- [ ] **Step 4: Commit**

```bash
git add js/trackdrone.js index.html
git commit -m "feat: Tracking Blind Drone destructible flash module"
```

---

### Task 5: Unify the blind interface on the existing Flash

**Files:**
- Modify: `js/flash.js` (add `shouldBlind` + `blindKind` getters)

So `game.js` can drive Breach/Phoenix/Yoru through the same blind path as the new flashes.

- [ ] **Step 1: Add the getters**

In `js/flash.js`, in the returned object (after the `get detonated()` line, around line 134), add two getters. Change:

```js
    get windingUp() { return t >= travel && t < detonateAt; },
    get detonated() { return t >= detonateAt; },
    get done() { return t >= burstEnd; },
```

to:

```js
    get windingUp() { return t >= travel && t < detonateAt; },
    get detonated() { return t >= detonateAt; },
    get shouldBlind() { return t >= detonateAt; },
    get blindKind() { return 'overlay'; },
    get destroyed() { return false; }, // projectile flashes are not destructible
    get done() { return t >= burstEnd; },
```

- [ ] **Step 2: Verify it still parses**

Run: `node -e "global.THREE={};require('./js/flash.js');console.log(typeof Flash)"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add js/flash.js
git commit -m "refactor: add shouldBlind/blindKind/destroyed to Flash for a unified blind path"
```

---

### Task 6: Nearsight overlay + hitmarker in the HUD

**Files:**
- Modify: `index.html` (CSS + two HUD elements)
- Modify: `js/hud.js` (`triggerNearsight`, `updateNearsight`, `showHitmarker`)

- [ ] **Step 1: Add CSS**

In `index.html`, inside `<style>`, after the `#flash-overlay { ... }` rule (line 27-28), add:

```css
    #nearsight-overlay { position: absolute; inset: 0; opacity: 0; pointer-events: none; z-index: 19;
      background: radial-gradient(circle at 50% 50%,
        rgba(0,0,0,0) 16%, var(--ns-tint, rgba(120,120,140,0.25)) 40%, rgba(6,6,10,0.94) 96%);
      -webkit-backdrop-filter: blur(var(--ns-blur, 0px)); backdrop-filter: blur(var(--ns-blur, 0px)); }
    #hitmarker { position: absolute; left: 50%; top: 50%; width: 18px; height: 18px;
      transform: translate(-50%, -50%) rotate(45deg); opacity: 0; pointer-events: none; z-index: 21; }
    #hitmarker::before, #hitmarker::after { content: ""; position: absolute; background: #fff;
      box-shadow: 0 0 2px #000; }
    #hitmarker::before { left: 8px; top: 0; width: 2px; height: 18px; }
    #hitmarker::after { left: 0; top: 8px; width: 18px; height: 2px; }
```

- [ ] **Step 2: Add the HUD elements**

In `index.html`, inside `<div id="hud">`, after the `<div id="flash-overlay"></div>` line (line 77), add:

```html
    <div id="nearsight-overlay"></div>
    <div id="hitmarker"></div>
```

- [ ] **Step 3: Implement the HUD methods**

In `js/hud.js`, after the line `const overlay = document.getElementById('flash-overlay');` (line 8), add:

```js
  const nearsight = document.getElementById('nearsight-overlay');
  const hitmarker = document.getElementById('hitmarker');
  let nsElapsed = 0, nsDuration = 0, nsFactor = 0;
  let hmTimer = null;
```

Then, after the `updateBlind` function (after line 29), add:

```js
  function triggerNearsight(durationSec, factor, tintColor) {
    nsDuration = Math.max(0, durationSec || 0);
    nsElapsed = 0;
    nsFactor = Math.max(0, Math.min(1, factor || 0));
    if (nearsight && tintColor != null) nearsight.style.setProperty('--ns-tint', toCss(tintColor));
  }
  function updateNearsight(dt) {
    if (!nearsight) return;
    if (nsDuration <= 0) { nearsight.style.opacity = '0'; return; }
    nsElapsed += dt;
    const intensity = nearsightIntensity(nsElapsed, VALO.FLASH.rampUp * 3, nsDuration, 0.4) * nsFactor;
    nearsight.style.opacity = String(intensity);
    nearsight.style.setProperty('--ns-blur', (intensity * VALO.FLASH.nearsight.maxBlur).toFixed(2) + 'px');
    if (nsElapsed >= nsDuration) { nsDuration = 0; nearsight.style.opacity = '0'; }
  }
  function showHitmarker() {
    if (!hitmarker) return;
    hitmarker.style.opacity = '1';
    if (hmTimer) clearTimeout(hmTimer);
    hmTimer = setTimeout(() => { hitmarker.style.opacity = '0'; }, 90);
  }
```

Then add the three names to the returned object. Change:

```js
  return { update, drawCrosshair, showShotFeedback, triggerBlind, updateBlind, setPeekHint };
```

to:

```js
  return { update, drawCrosshair, showShotFeedback, triggerBlind, updateBlind,
           triggerNearsight, updateNearsight, showHitmarker, setPeekHint };
```

- [ ] **Step 4: Commit**

```bash
git add index.html js/hud.js
git commit -m "feat: nearsight overlay + hitmarker in HUD"
```

---

### Task 7: Report flash hits from the weapon

**Files:**
- Modify: `js/weapon.js` (add `hitFlash` to the `on.shot` payload)

- [ ] **Step 1: Add the flag**

In `js/weapon.js`, in the `deps.on.shot({ ... })` call (lines 66-74), add one field. Change:

```js
    deps.on.shot({
      hitZone,
      isHead: hitZone === 'head',
      aimX,
```

to:

```js
    deps.on.shot({
      hitZone,
      isHead: hitZone === 'head',
      hitFlash: !!(bot && bot.isFlash),
      aimX,
```

- [ ] **Step 2: Verify it still parses**

Run: `node -e "global.THREE={Raycaster:function(){},Vector2:function(){}};global.VALO={FIRE_RATE:9.75};global.fireInterval=()=>0;require('./js/weapon.js');console.log(typeof Weapon)"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add js/weapon.js
git commit -m "feat: weapon reports hitFlash in shot info"
```

---

### Task 8: Settings toggles for the two new flashes

**Files:**
- Modify: `js/settings.js` (defaults + two checkboxes)

- [ ] **Step 1: Add defaults**

In `js/settings.js`, in the `defaults` object, after the `flashYoru: false,` line (line 18), add:

```js
    flashEyeOrb: false,
    flashTrackDrone: false,
```

- [ ] **Step 2: Add the checkbox rows**

In `js/settings.js`, in `build()`, after the `row('Flash: Yoru (Blindside)', ...)` line (line 128), add:

```js
      row('Flash: Eye Blind Orb (ยิงทำลาย)', checkbox(s.flashEyeOrb, v => s.flashEyeOrb = v),
        'Destructible nearsight orb — flick and shoot it before it arms.');
      row('Flash: Tracking Blind Drone (ยิงทำลาย)', checkbox(s.flashTrackDrone, v => s.flashTrackDrone = v),
        'Moving scanner — track and shoot it before it locks on and fires.');
```

- [ ] **Step 3: Verify it still parses**

Run: `node -e "global.document={getElementById:()=>null};global.localStorage={getItem:()=>null,setItem:()=>{}};global.VALO={DISTANCE:{medium:18},PEEK:{min:0.3,max:2.5},RESPAWN_DELAY:0.5,SPAWN_DELAY:{min:0.2,max:1.5},YAW_CONST:0.07};global.cm360=()=>0;require('./js/settings.js');console.log(typeof Settings)"`
Expected: prints `function`.

- [ ] **Step 4: Commit**

```bash
git add js/settings.js
git commit -m "feat: settings toggles for eye-orb + tracking-drone flashes"
```

---

### Task 9: Wire the destructible flashes into game.js

**Files:**
- Modify: `js/game.js`

This is the integration task. It threads the new agents through the flash-round pool, makes them shootable, and routes their blind through a single unified path.

- [ ] **Step 1: Track the picked flash key**

In `js/game.js`, in the flash-round lifecycle declarations (around line 18), change:

```js
  let flash = null;
  let flashAgent = null;
```

to:

```js
  let flash = null;
  let flashAgent = null;
  let flashKey = null;
```

- [ ] **Step 2: Include the new flashes as shootable targets**

In `getShootables` (lines 31-40), change the `hold` branch. Replace:

```js
      getShootables: () => {
        if (mode === 'hold') {
          return { targets: enemy ? [enemy] : [], occluders: enemy ? [enemy.wall] : [] };
        }
        return {
          targets: peekMode ? peekMode.getTargets() : [],
          occluders: peekMode ? peekMode.occluders() : [],
        };
      },
```

with:

```js
      getShootables: () => {
        if (mode === 'hold') {
          const targets = [];
          if (enemy) targets.push(enemy);              // enemy first so it stays the feedback "primary"
          if (flash && flash.isFlash) targets.push(flash);
          return { targets, occluders: enemy ? [enemy.wall] : [] };
        }
        return {
          targets: peekMode ? peekMode.getTargets() : [],
          occluders: peekMode ? peekMode.occluders() : [],
        };
      },
```

- [ ] **Step 3: Handle flash hits/kills in the weapon callbacks**

In the `on` object (lines 42-65), change the `shot` handler. Replace:

```js
        shot: info => {
          recordShot(stats);
          const kind = mode === 'hold'
            ? classifyShotTimingByLateral(info.visible, info.hitZone, info.aimX, info.botX,
                info.movementDir, info.fullPeeked, VALO.AIM_FEEDBACK.perfectHeadHalfWidth)
            : classifyStationaryShot(info.hitZone);
          if (kind) hud.showShotFeedback(kind);
        },
```

with:

```js
        shot: info => {
          recordShot(stats);
          if (info.hitFlash) { hud.showHitmarker(); return; } // shooting a flash: marker only
          const kind = mode === 'hold'
            ? classifyShotTimingByLateral(info.visible, info.hitZone, info.aimX, info.botX,
                info.movementDir, info.fullPeeked, VALO.AIM_FEEDBACK.perfectHeadHalfWidth)
            : classifyStationaryShot(info.hitZone);
          if (kind) hud.showShotFeedback(kind);
        },
```

Then change the `kill` handler. Replace:

```js
        kill: () => {
          if (mode === 'hold') {
```

with:

```js
        kill: (bot) => {
          if (bot && bot.isFlash) return; // flash destroyed: handled in updateState; not an enemy kill
          if (mode === 'hold') {
```

- [ ] **Step 4: Add a flash factory and use it in startFlashRound**

In `js/game.js`, replace `startFlashRound` (lines 222-240) entirely with:

```js
  // Build the right flash object for the picked agent. Breach/Phoenix/Yoru are the cosmetic
  // projectile flashes; eyeorb/trackdrone are destructible (shootable) flashes.
  function makeFlash(key, side) {
    const a = VALO.FLASH[key];
    const distance = settings.get().distance;
    if (key === 'eyeorb') {
      return EyeOrb(three.scene, {
        color: a.color, travel: a.travel, windup: a.windup,
        destroyHits: a.destroyHits, side, distance,
      });
    }
    if (key === 'trackdrone') {
      return TrackDrone(three.scene, {
        color: a.color, flightTime: a.flightTime, scanStartDelay: a.scanStartDelay,
        lockOnTime: a.lockOnTime, scanRange: a.scanRange, scanConeDeg: a.scanConeDeg,
        destroyHits: a.destroyHits, side, distance,
        getPlayerPos: () => ({ x: player.position.x, z: player.position.z }),
      });
    }
    return Flash(three.scene, {
      color: a.color, windup: a.windup, flight: a.flight,
      travel: a.travel, speed: a.speed, side, distance,
    });
  }

  // Spawn the enemy hidden behind cover (the angle is held), then play the flash. The enemy
  // is released to peek shortly after the blind (or after the flash is destroyed/expires).
  function startFlashRound(enabled) {
    if (flash) { flash.dispose(); flash = null; } // defensive: never leak a previous flash
    flashKey = pickFlashAgent(enabled, Math.random);
    flashAgent = VALO.FLASH[flashKey];
    const side = resolveSide();
    spawnEnemy({ side, peekWidth: resolvePeekWidth() }); // wall + bot, hidden; sets state 'active'
    state = 'flashing';                                  // override: hold the bot until the blind
    flash = makeFlash(flashKey, side);
    windupSoundPlayed = false;
    detonationHandled = false;
  }
```

- [ ] **Step 5: Add the new agents to the round pool**

In `startRound` (lines 207-218), add two pushes. Change:

```js
    if (cfg.flashBreach) enabled.push('breach');
    if (cfg.flashPhoenix) enabled.push('phoenix');
    if (cfg.flashYoru) enabled.push('yoru');
```

to:

```js
    if (cfg.flashBreach) enabled.push('breach');
    if (cfg.flashPhoenix) enabled.push('phoenix');
    if (cfg.flashYoru) enabled.push('yoru');
    if (cfg.flashEyeOrb) enabled.push('eyeorb');
    if (cfg.flashTrackDrone) enabled.push('trackdrone');
```

- [ ] **Step 6: Replace handleDetonation with a unified handleBlind**

In `js/game.js`, replace `handleDetonation` (lines 242-255) with:

```js
  // Trigger the blind for whatever flash just became ready. Nearsight (orb) and the cosmetic
  // projectile flashes are gated by the view angle to the flash; the drone is a direct hit
  // (full strength). Then queue the held enemy's peek.
  function handleBlind(nowSec) {
    let factor = 1;
    if (flashKey !== 'trackdrone') {
      const camPos = new THREE.Vector3();
      const fwd = new THREE.Vector3();
      three.camera.getWorldPosition(camPos);
      three.camera.getWorldDirection(fwd);
      const toFlash = flash.position.clone().sub(camPos).normalize();
      const cos = Math.max(-1, Math.min(1, fwd.dot(toFlash)));
      const angleDeg = (Math.acos(cos) * 180) / Math.PI;
      factor = blindFactor(angleDeg, VALO.FLASH.blindFullDeg, VALO.FLASH.blindZeroDeg);
    }
    const dur = blindDuration(flashAgent.blind, factor);
    if (flash.blindKind === 'nearsight') hud.triggerNearsight(dur, factor, flashAgent.color);
    else hud.triggerBlind(dur, flashAgent.color);
    if (settings.get().flashSound) effects.playFlashPop();
    enemyPeekAt = nowSec + VALO.FLASH.enemyPeekDelay;
  }
```

- [ ] **Step 7: Update the flash advance block to use the unified path**

In `updateState` (lines 265-279), replace the whole `if (flash) { ... }` block with:

```js
    if (flash) {
      flash.update(lastDt);
      if (!windupSoundPlayed && flash.windingUp) {
        windupSoundPlayed = true;
        if (settings.get().flashSound) effects.playFlashWindup(flashAgent.windup);
      }
      // Destroyed before any blind -> success: release the enemy, no blind.
      if (!detonationHandled && flash.destroyed) {
        detonationHandled = true;
        enemyPeekAt = nowSec + VALO.FLASH.enemyPeekDelay;
      }
      // Otherwise the flash becomes ready (projectile detonates / orb arms / drone fires).
      if (!detonationHandled && flash.shouldBlind) {
        detonationHandled = true;
        handleBlind(nowSec);
      }
      if (state === 'flashing' && detonationHandled && nowSec >= enemyPeekAt) {
        state = 'active'; // release the held enemy; it begins peeking next frame
      }
      if (flash.done) { flash.dispose(); flash = null; }
    }
```

- [ ] **Step 8: Drive the nearsight overlay each frame**

In `update` (lines 306-318), after the `hud.updateBlind(dt);` line, add:

```js
    hud.updateNearsight(dt);
```

- [ ] **Step 9: Verify all unit tests still pass**

Run: `node --test tests/logic.test.js tests/constants.test.js`
Expected: PASS (48 + the constants tests), 0 fail.

- [ ] **Step 10: Commit**

```bash
git add js/game.js
git commit -m "feat: wire eye-orb + tracking-drone flashes into the game loop"
```

---

### Task 10: Browser verification + docs

**Files:**
- Modify: `README.md` (document the two new flashes)

- [ ] **Step 1: Serve and open the app**

Start a static server and open the preview:
- Use the preview tooling (`preview_start`) pointed at the project root, or run `node -e "require('http').createServer((q,s)=>{const f=require('fs'),p='.'+ (q.url==='/'?'/index.html':q.url);f.readFile(p,(e,d)=>{if(e){s.writeHead(404);s.end()}else{s.end(d)}})}).listen(8080)"` and open `http://localhost:8080`.

- [ ] **Step 2: Verify Eye Blind Orb**

1. Open settings (ESC), Training mode = Hold angle, set Flash frequency to 100%, enable only "Flash: Eye Blind Orb".
2. Click to play. Confirm: an orb emerges from behind the corner wall, floats out, hovers and pulses faster (warning), then — if not shot — a **nearsight** effect appears (dark vignette + blur, center still readable, NOT a full white screen), after which the held enemy peeks.
3. Restart a round and shoot the orb during its hover: confirm a hitmarker shows, the orb shatters, and **no** nearsight effect plays; the enemy then peeks.
4. Check the browser console for errors (`preview_console_logs`). Expected: none.

- [ ] **Step 3: Verify Tracking Blind Drone**

1. Settings: disable the orb, enable only "Flash: Tracking Blind Drone", Flash frequency 100%.
2. Play. Confirm: a drone launches from behind the wall and crosses the view, shows a scan cone that aims at you, charges (lock-on), then fires a strong overlay blind (tinted), after which the enemy peeks.
3. Restart and destroy the drone while it flies/locks: confirm hitmarker + shatter, **no** blind, enemy peeks.
4. Console: no errors.

- [ ] **Step 4: Regression check existing flashes**

Enable only "Flash: Breach", play one flash round, confirm the projectile flash + white blind still work exactly as before (no nearsight, not shootable). Repeat quickly for Phoenix and Yoru.

- [ ] **Step 5: Update the README**

In `README.md`, find the section that documents the flash training modes (Breach/Phoenix/Yoru) and add a short subsection. Use this content (adapt headings to match the file's existing style):

```markdown
### Destructible flashes (Hold mode)

Two flashes can be **shot to cancel the blind**:

- **Eye Blind Orb** — emerges from behind the corner and hovers. If you don't destroy it
  before it arms, it applies a *nearsight* effect (dark vignette + blur; near objects stay
  visible). Flick to it and destroy it fast (2 hits). Look away to reduce the blind.
- **Tracking Blind Drone** — launches from behind the wall and crosses your view while
  scanning. If it locks on and fires, it applies a strong screen blind. Track it and destroy
  it (2 hits) before it fires.

Enable them in Settings (Hold mode) alongside the projectile flashes; they share the Flash
frequency control.
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document destructible eye-orb + tracking-drone flashes"
```

---

## Self-review notes

- **Spec coverage:** Animation states (orb spawn/active/warning/destroy; drone launch/flight/scan/lockOn/fire/destroy) → Tasks 3-4. Movement (orb emerge+hover; drone lateral cross + lock slowdown) → Tasks 3-4. Effect (nearsight vs overlay) → Tasks 1, 6, 9. Range/FOV/cone/LOS/lock-on persistence → Tasks 1, 4, 9 (LOS in Hold mode = drone emerged + in range; player stationary). Destruction (HP in hits, hitbox, hitmarker, cancel blind, success/fail) → Tasks 3-4, 6, 7, 9. Settings → Task 8. Constants/defaults → Task 2. Unified events handled inline via the state machine (Task 9). Out-of-scope items (6 classes, 4 tiers, event bus, debug viz, movement-based LOS, new stats) are intentionally omitted per the spec.
- **Type consistency:** Every flash module (Flash, EyeOrb, TrackDrone) exposes `position`, `shouldBlind`, `blindKind`, `destroyed`, `done`, and (where relevant) `windingUp`; `game.js` reads only those plus `isFlash`/`alive`/`applyDamage`/`hitboxes`/`updateMatrixWorld`. `hud` methods `triggerNearsight`/`updateNearsight`/`showHitmarker` are defined in Task 6 and called in Task 9. `nearsightIntensity`/`lockOnProgress`/`inScanCone` defined in Task 1 are used in Tasks 4 and 6.
- **No placeholders:** every code step contains complete code.
