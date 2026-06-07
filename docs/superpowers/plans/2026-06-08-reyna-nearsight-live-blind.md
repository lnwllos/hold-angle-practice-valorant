# Reyna Live Depth-Blind Nearsight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Reyna `eyeorb` one-shot timed vignette blind with a live, depth-based darkness that stays on while the player faces the armed, still-alive orb (the orb itself stays visible) and fades over ~0.2 s when they look away or destroy it.

**Architecture:** A pure easing helper (`approach`) and the existing `inScanCone` drive a per-frame nearsight level in `game.js`. That level feeds `scene.setNearsight(k)` (lerps `THREE.Fog` near/far/colour for depth darkness) and `hud.setNearsight(level, tint)` (faint full-screen tint + small blur). The orb's materials opt out of fog so it glows through the dark. Thrown/drone flashes keep their unchanged one-shot white-overlay blind.

**Tech Stack:** Vanilla JS (browser globals), THREE.js (`three.min.js`), Node's built-in test runner (`node --test`).

---

### Task 1: Add nearsight constants

**Files:**
- Modify: `js/constants.js` (the `FLASH` object, near `enemyPeekDelay`/`rampUp` at lines 54-57)

- [ ] **Step 1: Add the constants**

In `js/constants.js`, inside the `FLASH: { ... }` object, immediately after the `nearsight: { ... }` line (line 49) add:

```javascript
    blindConeDeg: 110,        // full cone angle for the live nearsight on/off facing test (±55°)
    nearsightNear: 3,         // m — world stays clear up to here at full nearsight
    nearsightFar: 8,          // m — world is fully dark by here at full nearsight
    nearsightColor: 0x06060a, // near-black fog/background colour at full nearsight
    nsRiseTau: 0.06,          // s — nearsight rises to full this fast when facing the orb
    nsFallTau: 0.2,           // s — nearsight fades out this slowly when looking away/destroyed
```

- [ ] **Step 2: Verify constants load (no syntax error)**

Run: `node -e "console.log(require('./js/constants.js').VALO.FLASH.blindConeDeg, require('./js/constants.js').VALO.FLASH.nearsightFar)"`
Expected: `110 8`

- [ ] **Step 3: Run the constants test suite (no regression)**

Run: `node --test tests/constants.test.js`
Expected: PASS (all tests pass).

- [ ] **Step 4: Commit**

```bash
git add js/constants.js
git commit -m "feat: add live nearsight tuning constants"
```

---

### Task 2: Add `approach` easing helper, remove `nearsightIntensity`

**Files:**
- Modify: `js/logic.js` (add `approach` near `angleBetweenDeg` ~line 238; remove `nearsightIntensity` at lines 125-131; update `module.exports` at line 355)
- Test: `tests/logic.test.js` (add `approach` tests; remove the `nearsightIntensity` test at lines 304-312)

- [ ] **Step 1: Write the failing tests**

In `tests/logic.test.js`, append at the end of the file:

```javascript
// --- live nearsight easing ---
test('approach moves toward target frame-rate-independently and clamps', () => {
  // rise: 0 -> 1 with tau 0.06 over dt 0.03 = halfway
  assert.ok(Math.abs(L.approach(0, 1, 0.03, 0.06, 0.2) - 0.5) < 1e-9);
  // fall: 1 -> 0 with tau 0.2 over dt 0.1 = halfway
  assert.ok(Math.abs(L.approach(1, 0, 0.1, 0.06, 0.2) - 0.5) < 1e-9);
  // never overshoots the target
  assert.strictEqual(L.approach(0.9, 1, 1.0, 0.06, 0.2), 1);
  assert.strictEqual(L.approach(0.1, 0, 1.0, 0.06, 0.2), 0);
  // already at target, or zero dt: unchanged
  assert.strictEqual(L.approach(0.4, 0.4, 0.016, 0.06, 0.2), 0.4);
  assert.strictEqual(L.approach(0.3, 1, 0, 0.06, 0.2), 0.3);
});

test('approach rises faster than it falls (shorter rise tau)', () => {
  const up = L.approach(0, 1, 0.02, 0.06, 0.2);   // dt/0.06
  const down = L.approach(1, 0, 0.02, 0.06, 0.2); // 1 - dt/0.2
  assert.ok((up - 0) > (1 - down), 'rise step should exceed fall step for equal dt');
});
```

Then DELETE the existing test block at lines 304-312 (the test titled `nearsightIntensity: 0 before start, ramps, holds at 1, fades to 0` and its body).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `approach` tests error with `L.approach is not a function`.

- [ ] **Step 3: Add `approach`, remove `nearsightIntensity`**

In `js/logic.js`, DELETE the `nearsightIntensity` function (lines 125-131):

```javascript
function nearsightIntensity(elapsed, rampUp, duration, fadeOut) {
  if (duration <= 0 || elapsed <= 0 || elapsed >= duration) return 0;
  if (rampUp > 0 && elapsed < rampUp) return elapsed / rampUp;
  const fadeStart = duration - fadeOut;
  if (fadeOut > 0 && elapsed > fadeStart) return Math.max(0, (duration - elapsed) / fadeOut);
  return 1;
}
```

Then, immediately before `// --- Session stats ---` (line 240), add:

```javascript
// Move `current` toward `target` by a fixed time-constant so transitions are frame-rate
// independent: a full 0->1 sweep takes `riseTau` seconds going up, `fallTau` going down.
// Clamps so it never overshoots `target`. Used to ease the live nearsight on/off.
function approach(current, target, dt, riseTau, fallTau) {
  if (dt <= 0 || current === target) return current;
  const tau = target > current ? riseTau : fallTau;
  if (tau <= 0) return target;
  const next = current + Math.sign(target - current) * (dt / tau);
  if ((target > current && next > target) || (target < current && next < target)) return target;
  return next;
}
```

In `module.exports` (line 355), change:

```javascript
    flashOverlayOpacity, nearsightIntensity, lockOnProgress, inScanCone, flashDestroyedInTime,
```

to:

```javascript
    flashOverlayOpacity, approach, lockOnProgress, inScanCone, flashDestroyedInTime,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/logic.test.js`
Expected: PASS (the `approach` tests pass; the `nearsightIntensity` test is gone).

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat: add approach easing helper, drop timed nearsightIntensity"
```

---

### Task 3: Depth-darkness fog control in the scene

**Files:**
- Modify: `js/scene.js` (add `setNearsight` after `applyFov`/lighting setup; export it in the return at line 70)

- [ ] **Step 1: Add `setNearsight`**

In `js/scene.js`, immediately after the `scene.fog = new THREE.Fog(0x20242c, 45, 95);` line (line 6), add:

```javascript

  // Live nearsight darkness: lerp the fog/background from the base range toward a tight, near-
  // black range so distant geometry fades to black while close range stays visible. k in 0..1.
  const _nsBaseCol = new THREE.Color(0x20242c);
  const _nsDarkCol = new THREE.Color(VALO.FLASH.nearsightColor);
  const _nsLerp = (a, b, t) => a + (b - a) * t;
  function setNearsight(k) {
    k = Math.max(0, Math.min(1, k || 0));
    scene.fog.near = _nsLerp(45, VALO.FLASH.nearsightNear, k);
    scene.fog.far = _nsLerp(95, VALO.FLASH.nearsightFar, k);
    scene.fog.color.copy(_nsBaseCol).lerp(_nsDarkCol, k);
    scene.background.copy(_nsBaseCol).lerp(_nsDarkCol, k);
  }
```

- [ ] **Step 2: Export it**

In `js/scene.js`, change the return (line 70) from:

```javascript
  return { scene, camera, renderer, render: () => renderer.render(scene, camera) };
```

to:

```javascript
  return { scene, camera, renderer, setNearsight, render: () => renderer.render(scene, camera) };
```

- [ ] **Step 3: Commit**

```bash
git add js/scene.js
git commit -m "feat: add scene.setNearsight depth-fog control"
```

(Visual verification happens in Task 7 once the wiring is complete.)

---

### Task 4: Keep the orb visible through the darkness

**Files:**
- Modify: `js/eyeorb.js` (the `orb` material at lines 25-27 and the `ring` material at lines 34-35)

- [ ] **Step 1: Opt the orb and ring materials out of fog**

In `js/eyeorb.js`, change the `orb` mesh material (lines 24-27) from:

```javascript
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 18, 18),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.95 })
  );
```

to:

```javascript
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 18, 18),
    // fog:false so the Reyna orb stays bright through the nearsight darkness — the player can
    // still see/track and shoot it while everything else fades to black by distance.
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.95, fog: false })
  );
```

Then change the `ring` mesh material (lines 33-35) from:

```javascript
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.28, 24),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0, side: THREE.DoubleSide })
  );
```

to:

```javascript
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.28, 24),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0, side: THREE.DoubleSide, fog: false })
  );
```

- [ ] **Step 2: Commit**

```bash
git add js/eyeorb.js
git commit -m "feat: orb ignores fog so it stays visible through nearsight"
```

---

### Task 5: Live HUD nearsight overlay (replace timed model)

**Files:**
- Modify: `js/hud.js` (remove `nsElapsed/nsDuration/nsFactor` at line 11, `triggerNearsight` at lines 34-39, `updateNearsight` at lines 40-48; add `setNearsight`; update the return at lines 120-121)
- Modify: `index.html` (the `#nearsight-overlay` rule at lines 113-116)

- [ ] **Step 1: Replace the HUD nearsight functions**

In `js/hud.js`, remove the nearsight state declaration (line 11):

```javascript
  let nsElapsed = 0, nsDuration = 0, nsFactor = 0;
```

Then replace the `triggerNearsight` and `updateNearsight` functions (lines 34-48):

```javascript
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
```

with the single live function:

```javascript
  // Live nearsight cue, driven each frame by game.js: a faint full-screen tint + small blur
  // scaled by `level` (0..1). The scene's depth fog does the actual darkening; this is just hue.
  function setNearsight(level, tint) {
    if (!nearsight) return;
    const k = Math.max(0, Math.min(1, level || 0));
    if (tint != null) nearsight.style.setProperty('--ns-tint', toCss(tint));
    nearsight.style.opacity = String(k * 0.22);
    nearsight.style.setProperty('--ns-blur', (k * 2).toFixed(2) + 'px');
  }
```

- [ ] **Step 2: Update the HUD export**

In `js/hud.js`, change the return (lines 120-121) from:

```javascript
  return { update, drawCrosshair, showShotFeedback, triggerBlind, updateBlind,
           triggerNearsight, updateNearsight, showHitmarker, setPeekHint };
```

to:

```javascript
  return { update, drawCrosshair, showShotFeedback, triggerBlind, updateBlind,
           setNearsight, showHitmarker, setPeekHint };
```

- [ ] **Step 3: Change the overlay CSS from edge-vignette to flat tint**

In `index.html`, change the `#nearsight-overlay` rule (lines 113-116) from:

```css
    #nearsight-overlay { position: absolute; inset: 0; opacity: 0; pointer-events: none; z-index: 19;
      background: radial-gradient(circle at 50% 50%,
        rgba(0,0,0,0) 16%, var(--ns-tint, rgba(120,120,140,0.25)) 40%, rgba(6,6,10,0.94) 96%);
      -webkit-backdrop-filter: blur(var(--ns-blur, 0px)); backdrop-filter: blur(var(--ns-blur, 0px)); }
```

to:

```css
    #nearsight-overlay { position: absolute; inset: 0; opacity: 0; pointer-events: none; z-index: 19;
      background: var(--ns-tint, rgba(120,120,140,0.4));
      -webkit-backdrop-filter: blur(var(--ns-blur, 0px)); backdrop-filter: blur(var(--ns-blur, 0px)); }
```

- [ ] **Step 4: Commit**

```bash
git add js/hud.js index.html
git commit -m "feat: live HUD nearsight overlay (flat tint, game-driven level)"
```

---

### Task 6: Wire the live nearsight into the game loop

**Files:**
- Modify: `js/game.js` (flash state block lines 18-23; `handleBlind` lines 567-593; `update()` line 674)

- [ ] **Step 1: Add nearsight state**

In `js/game.js`, in the flash-lifecycle state block, change (lines 22-23):

```javascript
  let windupSoundPlayed = false;
  let detonationHandled = false;
```

to:

```javascript
  let windupSoundPlayed = false;
  let detonationHandled = false;
  let nsLevel = 0;                       // eased live-nearsight level (0..1)
  let nsTint = VALO.FLASH.eyeorb.color;  // tint of the most recent nearsight flash
```

- [ ] **Step 2: Split `handleBlind` — nearsight is no longer a timed blind**

In `js/game.js`, replace the whole `handleBlind` function (lines 567-593):

```javascript
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
    if (recorder && recorder.isRecording()) {
      recorder.logEvent('blind', Object.assign(targetEventFields(enemy), {
        agent: flashKey,
        durationS: round2(dur),
        factor: round2(factor),
      }));
    }
    // Nearsight scales BOTH duration and peak intensity by factor (a stronger look-away
    // incentive than the overlay blind, which scales duration only).
    if (flash.blindKind === 'nearsight') hud.triggerNearsight(dur, factor, flashAgent.color);
    else hud.triggerBlind(dur, flashAgent.color);
    if (settings.get().flashSound) effects.playFlashPop();
    enemyPeekAt = nowSec + VALO.FLASH.enemyPeekDelay;
  }
```

with:

```javascript
  function handleBlind(nowSec) {
    enemyPeekAt = nowSec + VALO.FLASH.enemyPeekDelay; // release the held enemy shortly after
    if (settings.get().flashSound) effects.playFlashPop();

    // Nearsight (Reyna orb): NOT a timed blind. The darkness is driven live each frame in
    // driveNearsight() while the player faces the armed, still-alive orb; here we only record
    // the tint and log that it armed.
    if (flash.blindKind === 'nearsight') {
      nsTint = flashAgent.color;
      if (recorder && recorder.isRecording()) {
        recorder.logEvent('blind', Object.assign(targetEventFields(enemy), {
          agent: flashKey, kind: 'nearsight',
        }));
      }
      return;
    }

    // Overlay flashes (Breach/Phoenix/Yoru/drone): one-shot timed white blind, angle-scaled.
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
    if (recorder && recorder.isRecording()) {
      recorder.logEvent('blind', Object.assign(targetEventFields(enemy), {
        agent: flashKey, durationS: round2(dur), factor: round2(factor),
      }));
    }
    hud.triggerBlind(dur, flashAgent.color);
  }

  // Live nearsight: full darkness while the player faces the armed, still-alive Reyna orb;
  // eases on fast and fades over ~nsFallTau when they look away or it is destroyed/disposed.
  // Runs every frame regardless of `flash` so the fade-out finishes after the orb is gone.
  const _nsCam = new THREE.Vector3();
  const _nsFwd = new THREE.Vector3();
  const _nsTo = new THREE.Vector3();
  function driveNearsight(dt) {
    let target = 0;
    if (flash && flash.blindKind === 'nearsight' && flash.shouldBlind) {
      three.camera.getWorldPosition(_nsCam);
      three.camera.getWorldDirection(_nsFwd);
      _nsTo.copy(flash.position).sub(_nsCam).normalize();
      const cos = Math.max(-1, Math.min(1, _nsFwd.dot(_nsTo)));
      const angleDeg = (Math.acos(cos) * 180) / Math.PI;
      if (inScanCone(angleDeg, VALO.FLASH.blindConeDeg)) target = 1;
    }
    nsLevel = approach(nsLevel, target, dt, VALO.FLASH.nsRiseTau, VALO.FLASH.nsFallTau);
    three.setNearsight(nsLevel);
    hud.setNearsight(nsLevel, nsTint);
  }
```

- [ ] **Step 3: Call the driver from the main update (replace the old HUD call)**

In `js/game.js`, in `update()`, change (line 674):

```javascript
    hud.updateNearsight(dt);
```

to:

```javascript
    driveNearsight(dt);
```

- [ ] **Step 4: Verify the page boots clean**

Start the preview (`preview_start` config `trainer`), then check console errors are empty (`preview_console_logs` level `error`). Also confirm in `preview_eval`:

```javascript
(function(){ return { approach: typeof approach, hasSetNearsight: typeof Scene3D === 'function' }; })()
```

Expected: `approach` is `"function"`, no console errors.

- [ ] **Step 5: Commit**

```bash
git add js/game.js
git commit -m "feat: live depth-blind nearsight while facing the Reyna orb"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `node --test tests/logic.test.js tests/constants.test.js`
Expected: PASS, 0 fail (the `approach` tests included, no `nearsightIntensity`).

- [ ] **Step 2: Visual proof of depth darkness with the orb visible**

With the preview running, drive the fog directly and screenshot both ends. In `preview_eval`, the game's `three` is private, so verify `setNearsight` via a fresh scene is impractical — instead confirm the fog responds by temporarily exposing it is unnecessary; rely on the in-game path:

- `preview_screenshot` at `setNearsight(0)` baseline: enter the range (click), observe normal lighting.
- To force the effect without aiming, in `preview_eval` run a scene probe is not available; instead confirm the mechanic by playing: enable only the Eye Blind Orb and set flash chance to 100% via the settings panel, let the orb arm while facing it, and `preview_screenshot`.

Expected: while facing the armed orb, the world darkens with distance (enemy/walls fade to black by ~8 m) while the orb still glows; turning away clears it within ~0.2 s. Confirm `preview_console_logs` (level `error`) is empty.

- [ ] **Step 3: Confirm thrown-flash blind is unchanged**

Enable only Phoenix/Breach/Yoru, flash chance 100%, and verify the white overlay blind still triggers once and fades on its timer (no depth darkness). `preview_console_logs` error-free.

- [ ] **Step 4: Final commit (if any verification tweaks were needed)**

```bash
git add -A
git commit -m "test: verify live nearsight depth-blind"
```

---

## Self-Review

**Spec coverage:**
- Depth darkness (see close, dark far) → Task 3 (`scene.setNearsight` fog lerp) + Task 1 constants. ✓
- Continuous while facing + alive, fades on look-away/destroy → Task 6 (`driveNearsight`, `approach`) + Task 2 (`approach`). ✓
- On/off cone, ~0.2 s fade → Task 6 uses `inScanCone(angle, blindConeDeg)` and `approach(..., nsRiseTau, nsFallTau)`. ✓
- Orb stays visible → Task 4 (`fog:false`). ✓
- Screen cue replaces vignette → Task 5 (`hud.setNearsight`, flat-tint CSS). ✓
- Scope: only `eyeorb`/nearsight changes; overlay path preserved → Task 6 `handleBlind` branch keeps the overlay branch intact. ✓
- Remove `nearsightIntensity` + test, keep `blindFactor`/`blindDuration` → Task 2. ✓
- Recorder logs `{agent, kind:'nearsight'}` at arm, overlay log unchanged → Task 6. ✓

**Deviation from spec:** the spec proposed a new `nearsightConeActive` helper; the plan reuses the existing `inScanCone(angleDeg, coneDeg)` (identical `angle <= coneDeg/2` semantics) for DRY. `blindConeDeg` is the full cone angle, matching `inScanCone`'s contract.

**Placeholder scan:** none — every code step shows full code; commands have expected output.

**Type consistency:** `setNearsight` is `scene.setNearsight(k)` (1 arg, Task 3) and `hud.setNearsight(level, tint)` (2 args, Task 5) — distinct objects, both called correctly in Task 6's `driveNearsight`. `approach(current, target, dt, riseTau, fallTau)` signature matches its call. `nsLevel`/`nsTint` declared in Task 6 Step 1, used in Step 2/3. Constants `blindConeDeg`, `nearsightNear/Far/Color`, `nsRiseTau`, `nsFallTau` defined in Task 1, used in Tasks 3 and 6.
