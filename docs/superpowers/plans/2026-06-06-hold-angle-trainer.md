# Valorant Hold-Angle Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A double-click-to-run browser FPS that recreates Valorant's first-person feel for practicing holding an angle — stand still, react to an enemy swinging out from cover, hit Valorant-accurate Vandal damage.

**Architecture:** Vanilla JS + a vendored Three.js UMD build (global `THREE`), loaded as ordered classic `<script>` tags so `index.html` runs from `file://` with no server/build. Pure game logic (damage, peek-width sampling, sensitivity, fire-rate, recoil, stats) lives in dependency-free files (`constants.js`, `logic.js`) that are unit-tested with Node's built-in test runner. THREE/DOM "glue" (scene, player input, enemy, weapon, HUD, settings) lives in separate files and is verified manually in the browser. `game.js` is the composition root: it creates everything, runs the render loop, and owns the state machine.

**Tech Stack:** Three.js r128 (UMD), vanilla JS (classic scripts), Node `node --test` (built-in) for logic tests, Python `http.server` / PowerShell as optional launcher.

---

## File Structure

```
index.html          loads three.min.js then js/* in order; #hud, #settings, #blocker overlays
three.min.js        Three.js r128 UMD build (vendored, offline, exposes global THREE)
start.bat           optional localhost launcher (Python, fallback PowerShell)
README.md           how to run
js/constants.js     pure: VALO reference values + hfovToVfov(). dual browser/node export. TESTED
js/logic.js         pure: damage/health, peek-width sampling, sensitivity, fire-rate, recoil, stats.
                    dual browser/node export. TESTED
js/scene.js         Scene3D(): renderer, camera (103° H FOV), lights, range environment, resize
js/player.js        Player(): pointer lock, yaw/pitch mouse look, applies sensitivity
js/enemy.js         Enemy(): bot model with head/body/legs hitboxes, peek-swing movement, health
js/weapon.js        Weapon(): hitscan raycast, per-zone damage, fire-rate gate, recoil application
js/hud.js           Hud(): Valorant-style crosshair + live stats overlay
js/settings.js      Settings(): state + localStorage + settings-panel DOM binding
js/game.js          composition root: creates all modules, render loop, WAITING/PEEKING/HOLDING/DEAD
tests/constants.test.js   node --test for constants.js
tests/logic.test.js       node --test for logic.js
```

**Note on architecture refinement vs spec:** the spec listed `weapon.js/enemy.js/hud.js/scene.js/game.js/settings.js/constants.js`. This plan adds `js/logic.js` (consolidates all *pure, testable* functions so one test file covers them and no THREE/DOM dependency leaks into Node) and `js/player.js` (separates pointer-lock/mouse-look input from the render loop). This improves testability and keeps each file single-responsibility.

**Dual-export pattern** (used by `constants.js` and `logic.js`): top-level `function`/`const` declarations are globals in the browser (classic scripts share global lexical scope, so other scripts reference them by name). At the bottom, a guarded `module.exports` makes them `require`-able in Node. Browser-side `typeof module` is `'undefined'`, so the guard is skipped:

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { /* names */ };
}
```

---

## Task 1: Project scaffold + vendor Three.js + blank canvas

**Files:**
- Create: `three.min.js` (downloaded)
- Create: `index.html`
- Create: `js/.gitkeep` (placeholder so the dir exists; removed once real files land)

- [ ] **Step 1: Download the Three.js r128 UMD build**

Run (project root):
```bash
curl -L -o three.min.js https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
```
Expected: a file ~600 KB. Verify it exposes a global and is not an error page:
```bash
wc -c three.min.js
grep -c "THREE" three.min.js
```
Expected: size ≈ 600000+, grep count ≥ 1. If the download fails, fall back to `https://unpkg.com/three@0.137.5/build/three.min.js` (also a UMD global build).

- [ ] **Step 2: Create `index.html` with overlays and ordered script tags**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Valorant Hold-Angle Trainer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #1b1b22;
      font-family: "Segoe UI", system-ui, sans-serif; color: #e8e8ec; }
    #app { position: fixed; inset: 0; }
    canvas { display: block; }

    /* Click-to-play blocker */
    #blocker { position: fixed; inset: 0; display: flex; align-items: center;
      justify-content: center; background: rgba(15,15,20,0.72); cursor: pointer; z-index: 30; }
    #blocker .msg { text-align: center; }
    #blocker h1 { font-size: 26px; margin-bottom: 10px; letter-spacing: 1px; }
    #blocker p { opacity: 0.75; font-size: 14px; }

    /* HUD */
    #hud { position: fixed; inset: 0; pointer-events: none; z-index: 10; }
    #crosshair { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); }
    #stats { position: absolute; top: 14px; left: 16px; font-size: 13px; line-height: 1.5;
      text-shadow: 0 1px 2px #000; }
    #stats b { color: #4ad6c8; }

    /* Settings panel */
    #settings { position: fixed; top: 0; right: 0; width: 320px; height: 100%;
      background: rgba(20,20,28,0.96); padding: 18px 18px 40px; overflow-y: auto; z-index: 20;
      box-shadow: -4px 0 18px rgba(0,0,0,0.4); display: none; }
    #settings.open { display: block; }
    #settings h2 { font-size: 16px; margin-bottom: 12px; color: #4ad6c8; }
    #settings .row { margin-bottom: 12px; }
    #settings label { display: block; font-size: 12px; margin-bottom: 4px; opacity: 0.85; }
    #settings input[type="range"] { width: 100%; }
    #settings select, #settings input[type="number"] { width: 100%; padding: 5px 7px;
      background: #2a2a36; color: #e8e8ec; border: 1px solid #3a3a48; border-radius: 4px; }
    #settings .val { float: right; color: #4ad6c8; }
    #settings .hint { font-size: 11px; opacity: 0.55; margin-top: 2px; }
    #settings button { margin-top: 8px; padding: 7px 12px; background: #4ad6c8; color: #11151a;
      border: none; border-radius: 5px; cursor: pointer; font-weight: 600; }
  </style>
</head>
<body>
  <div id="app"></div>

  <div id="hud">
    <canvas id="crosshair" width="60" height="60"></canvas>
    <div id="stats"></div>
  </div>

  <div id="blocker"><div class="msg">
    <h1>HOLD ANGLE TRAINER</h1>
    <p>Click to play &nbsp;·&nbsp; ESC for settings</p>
  </div></div>

  <div id="settings"><h2>Settings</h2><div id="settings-body"></div></div>

  <!-- Three.js (global THREE) -->
  <script src="three.min.js"></script>
  <!-- Game (order matters: pure logic first, then glue, then composition root) -->
  <script src="js/constants.js"></script>
  <script src="js/logic.js"></script>
  <script src="js/scene.js"></script>
  <script src="js/player.js"></script>
  <script src="js/enemy.js"></script>
  <script src="js/weapon.js"></script>
  <script src="js/hud.js"></script>
  <script src="js/settings.js"></script>
  <script src="js/game.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create placeholder so `js/` exists**

Run:
```bash
mkdir -p js tests && echo "" > js/.gitkeep
```

- [ ] **Step 4: Manual verify the page loads with THREE available**

Open `index.html` in a browser (double-click). Open DevTools console and type `THREE.REVISION`.
Expected: page shows the "HOLD ANGLE TRAINER" blocker; console prints `"128"`. (Scripts under `js/` 404 for now — that is expected; they are created in later tasks.)

- [ ] **Step 5: Commit**

```bash
git add three.min.js index.html js/.gitkeep
git commit -m "chore: scaffold project, vendor Three.js r128, blank page"
```

---

## Task 2: constants.js (Valorant reference values + FOV helper) + test

**Files:**
- Create: `js/constants.js`
- Test: `tests/constants.test.js`

- [ ] **Step 1: Write the failing test**

`tests/constants.test.js`:
```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { VALO, hfovToVfov } = require('../js/constants.js');

test('VALO holds Valorant reference values', () => {
  assert.strictEqual(VALO.RUN_SPEED, 6.75);
  assert.strictEqual(VALO.FIRE_RATE, 9.75);
  assert.strictEqual(VALO.FOV_H, 103);
  assert.strictEqual(VALO.YAW_CONST, 0.07);
  assert.deepStrictEqual(VALO.VANDAL, { head: 160, body: 40, legs: 33 });
  assert.strictEqual(VALO.ENEMY.hp + VALO.ENEMY.armor, 150);
  assert.strictEqual(VALO.RESPAWN_DELAY, 0.5);
});

test('hfovToVfov converts 103 H-FOV at 16:9 to ~71 V-FOV', () => {
  const v = hfovToVfov(103, 16 / 9);
  assert.ok(Math.abs(v - 70.5) < 1.0, `expected ~70.5, got ${v}`);
});

test('hfovToVfov keeps horizontal FOV constant across aspect ratios', () => {
  // Wider aspect -> smaller vertical FOV (since horizontal is fixed)
  const wide = hfovToVfov(103, 21 / 9);
  const std = hfovToVfov(103, 16 / 9);
  assert.ok(wide < std, `expected wider aspect to give smaller V-FOV: ${wide} < ${std}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/constants.test.js`
Expected: FAIL — `Cannot find module '../js/constants.js'`.

- [ ] **Step 3: Write `js/constants.js`**

```javascript
// Valorant reference constants. Pure data + a FOV math helper.
// Works as a browser global (classic script) and as a Node module (tests).

const VALO = {
  RUN_SPEED: 6.75,        // m/s — Valorant base running speed (enemy peek/swing speed)
  FIRE_RATE: 9.75,        // rounds/sec — Vandal
  FOV_H: 103,             // degrees — Valorant horizontal FOV (locked)
  YAW_CONST: 0.07,        // degrees of view rotation per mouse count per 1.0 sensitivity
  VANDAL: { head: 160, body: 40, legs: 33 },   // damage, no range falloff
  ENEMY: { hp: 100, armor: 50 },               // 150 EHP -> body kills in 4 (40*4=160)
  DISTANCE: { near: 8, medium: 18, far: 35 },  // meters, player <-> enemy
  PEEK: { min: 0.3, max: 2.5 },                // meters past the wall edge (shoulder..wide)
  RESPAWN_DELAY: 0.5,     // seconds after a kill before the next enemy
};

// Convert horizontal FOV (degrees) to the vertical FOV (degrees) a THREE camera needs,
// keeping the horizontal FOV constant for a given aspect ratio (width/height).
function hfovToVfov(hfovDeg, aspect) {
  const h = (hfovDeg * Math.PI) / 180;
  const v = 2 * Math.atan(Math.tan(h / 2) / aspect);
  return (v * 180) / Math.PI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VALO, hfovToVfov };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/constants.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add js/constants.js tests/constants.test.js
git commit -m "feat: Valorant reference constants + FOV helper (tested)"
```

---

## Task 3: logic.js — damage & health resolution + test

**Files:**
- Create: `js/logic.js`
- Test: `tests/logic.test.js`

- [ ] **Step 1: Write the failing test**

`tests/logic.test.js`:
```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const L = require('../js/logic.js');

const TABLE = { head: 160, body: 40, legs: 33 };

test('damageForZone returns Vandal damage per zone, 0 for unknown', () => {
  assert.strictEqual(L.damageForZone('head', TABLE), 160);
  assert.strictEqual(L.damageForZone('body', TABLE), 40);
  assert.strictEqual(L.damageForZone('legs', TABLE), 33);
  assert.strictEqual(L.damageForZone('miss', TABLE), 0);
});

test('headshot one-shots a 150-EHP enemy', () => {
  assert.ok(L.applyDamage(150, 160) <= 0);
});

test('body shots: 3 do not kill, 4 kills (150 EHP)', () => {
  let ehp = 150;
  for (let i = 0; i < 3; i++) ehp = L.applyDamage(ehp, 40);
  assert.ok(ehp > 0, `after 3 body shots ehp=${ehp} should be > 0`);
  ehp = L.applyDamage(ehp, 40);
  assert.ok(ehp <= 0, `after 4 body shots ehp=${ehp} should be <= 0`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `Cannot find module '../js/logic.js'`.

- [ ] **Step 3: Write `js/logic.js` (initial: damage/health)**

```javascript
// Pure game logic. No THREE, no DOM — safe to require() in Node tests and to load
// as a browser global. Functions are dependency-free; callers pass any config values.

// --- Damage & health ---
function damageForZone(zone, table) {
  return table[zone] || 0;
}
function applyDamage(ehp, dmg) {
  return ehp - dmg;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { damageForZone, applyDamage };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/logic.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat: damage/health resolution logic (tested)"
```

---

## Task 4: logic.js — peek-width sampling (wider = rarer) + test

**Files:**
- Modify: `js/logic.js`
- Modify: `tests/logic.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/logic.test.js`:
```javascript
test('peekWeight decreases as width increases (wider = less likely)', () => {
  assert.ok(L.peekWeight(0.5, 2.5) > L.peekWeight(2.0, 2.5));
  assert.strictEqual(L.peekWeight(2.5, 2.5), 0);  // weight 0 at max width
});

test('samplePeekWidth stays within [min,max] and maps endpoints', () => {
  const min = 0.3, max = 2.5;
  assert.ok(Math.abs(L.samplePeekWidth(min, max, () => 1) - min) < 1e-9); // u=1 -> min
  assert.ok(Math.abs(L.samplePeekWidth(min, max, () => 0) - max) < 1e-9); // u=0 -> max
});

test('samplePeekWidth: larger u yields narrower (smaller) width', () => {
  const min = 0, max = 2.5;
  const a = L.samplePeekWidth(min, max, () => 0.1);
  const b = L.samplePeekWidth(min, max, () => 0.9);
  assert.ok(a > b, `u=0.1 width ${a} should exceed u=0.9 width ${b}`);
});

test('samplePeekWidth midpoint check: u=0.25 -> halfway', () => {
  // width = max - sqrt(u)*(max-min); u=0.25 -> sqrt=0.5 -> midpoint
  assert.ok(Math.abs(L.samplePeekWidth(0, 2.5, () => 0.25) - 1.25) < 1e-9);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `L.peekWeight is not a function`.

- [ ] **Step 3: Implement in `js/logic.js`**

Add these functions (above the export guard):
```javascript
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
```

Update the export guard to include the new names:
```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { damageForZone, applyDamage, peekWeight, samplePeekWidth };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/logic.test.js`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat: peek-width sampling, wider peeks rarer (tested)"
```

---

## Task 5: logic.js — sensitivity + fire-rate gating + test

**Files:**
- Modify: `js/logic.js`
- Modify: `tests/logic.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/logic.test.js`:
```javascript
test('degPerCount = valSens * yawConst', () => {
  assert.ok(Math.abs(L.degPerCount(0.4, 0.07) - 0.028) < 1e-9);
});

test('cm360 ≈ 40.8 cm for 0.4 sens @ 800 DPI', () => {
  const cm = L.cm360(0.4, 800, 0.07);
  assert.ok(Math.abs(cm - 40.8) < 0.5, `got ${cm}`);
});

test('effectiveDeg scales movement by sens, yawConst and fine-tune multiplier', () => {
  // 10px * 0.4 * 0.07 * 2 = 0.56
  assert.ok(Math.abs(L.effectiveDeg(10, 0.4, 0.07, 2) - 0.56) < 1e-9);
});

test('fireInterval = 1 / fireRate', () => {
  assert.ok(Math.abs(L.fireInterval(9.75) - (1 / 9.75)) < 1e-9);
});

test('canFire only after the interval elapsed', () => {
  const interval = L.fireInterval(9.75); // ~0.1026 s
  assert.strictEqual(L.canFire(1.0, 1.0 + interval * 0.5, interval), false);
  assert.strictEqual(L.canFire(1.0, 1.0 + interval * 1.01, interval), true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `L.degPerCount is not a function`.

- [ ] **Step 3: Implement in `js/logic.js`**

Add (above the export guard):
```javascript
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
```

Update the export guard:
```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    damageForZone, applyDamage, peekWeight, samplePeekWidth,
    degPerCount, cm360, effectiveDeg, fireInterval, canFire,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/logic.test.js`
Expected: PASS (12 tests total).

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat: sensitivity conversion + fire-rate gating (tested)"
```

---

## Task 6: logic.js — recoil pattern + stats + test

**Files:**
- Modify: `js/logic.js`
- Modify: `tests/logic.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/logic.test.js`:
```javascript
test('recoilOffset: first shot has no offset', () => {
  assert.deepStrictEqual(L.recoilOffset(0, 1), { yaw: 0, pitch: 0 });
});

test('recoilOffset: vertical climb grows over the first shots', () => {
  assert.ok(L.recoilOffset(2, 1).pitch > L.recoilOffset(1, 1).pitch);
  assert.strictEqual(L.recoilOffset(2, 1).yaw, 0); // no horizontal sway in first 5
});

test('recoilOffset: intensity 0 disables recoil', () => {
  assert.deepStrictEqual(L.recoilOffset(8, 0), { yaw: 0, pitch: 0 });
});

test('stats: accuracy, headshot %, average reaction', () => {
  const s = L.makeStats();
  L.recordShot(s); L.recordShot(s); L.recordShot(s); L.recordShot(s); // 4 shots
  L.recordHit(s, true);   // headshot hit
  L.recordHit(s, false);  // body hit  -> 2 hits
  L.recordKill(s, 300);
  L.recordKill(s, 500);   // 2 kills, reaction 300 & 500
  assert.ok(Math.abs(L.statAccuracy(s) - 0.5) < 1e-9);      // 2 hits / 4 shots
  assert.ok(Math.abs(L.statHeadshotPct(s) - 0.5) < 1e-9);   // 1 hs / 2 hits
  assert.ok(Math.abs(L.statAvgReaction(s) - 400) < 1e-9);   // (300+500)/2
});

test('stats: empty stats report zeros, not NaN', () => {
  const s = L.makeStats();
  assert.strictEqual(L.statAccuracy(s), 0);
  assert.strictEqual(L.statHeadshotPct(s), 0);
  assert.strictEqual(L.statAvgReaction(s), 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/logic.test.js`
Expected: FAIL — `L.recoilOffset is not a function`.

- [ ] **Step 3: Implement in `js/logic.js`**

Add (above the export guard):
```javascript
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
```

Update the export guard to the final full list:
```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    damageForZone, applyDamage, peekWeight, samplePeekWidth,
    degPerCount, cm360, effectiveDeg, fireInterval, canFire,
    recoilOffset, makeStats, recordShot, recordHit, recordKill,
    statAccuracy, statHeadshotPct, statAvgReaction,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/logic.test.js`
Expected: PASS (17 tests total). Also run the full suite: `node --test tests/` → all green.

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat: Vandal recoil pattern + session stats (tested)"
```

---

## Task 7: scene.js + minimal game.js bootstrap (renderer, FOV-103 camera, range environment)

**Files:**
- Create: `js/scene.js`
- Create: `js/game.js`

THREE/DOM glue — verified by looking at the browser, not unit tests.

- [ ] **Step 1: Write `js/scene.js`**

```javascript
// Builds the renderer, the FOV-locked camera, lights, and the practice-range environment.
// Returns handles the rest of the game uses. No game logic here.
function Scene3D(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x20242c);
  scene.fog = new THREE.Fog(0x20242c, 40, 90);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // Camera at standing eye height, looking down -Z. Vertical FOV derived to keep H-FOV = 103.
  const camera = new THREE.PerspectiveCamera(71, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 1.6, 0);
  applyFov();

  function applyFov() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.fov = hfovToVfov(VALO.FOV_H, aspect); // keep horizontal FOV = 103
    camera.updateProjectionMatrix();
  }

  // Lighting
  scene.add(new THREE.HemisphereLight(0xbfd4e6, 0x404048, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(-8, 20, 6);
  scene.add(dir);

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 200),
    new THREE.MeshStandardMaterial({ color: 0x3a3f48 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -60;
  scene.add(floor);

  // Back wall behind the enemy (for depth/reference)
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(120, 12, 1),
    new THREE.MeshStandardMaterial({ color: 0x2c313a })
  );
  back.position.set(0, 6, -110);
  scene.add(back);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyFov();
  }
  window.addEventListener('resize', resize);

  return { scene, camera, renderer, render: () => renderer.render(scene, camera) };
}
```

- [ ] **Step 2: Write minimal `js/game.js` bootstrap (composition root)**

```javascript
// Composition root: creates modules, runs the render loop, owns game state.
// Grows across later tasks (player, enemy, weapon, hud, settings, state machine).
(function () {
  let three, lastT = 0;

  function init() {
    three = Scene3D(document.getElementById('app'));
    requestAnimationFrame(loop);
  }

  function loop(t) {
    const dt = Math.min((t - lastT) / 1000, 0.05); // seconds, clamped
    lastT = t;
    update(dt);
    three.render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // extended in later tasks
  }

  window.addEventListener('DOMContentLoaded', init);
})();
```

- [ ] **Step 3: Manual verify the range renders**

Open `index.html`. Expected: a grey floor extending into the distance with a darker back wall, soft lighting, fog fading the far end. No console errors. (Camera does not move yet.)

- [ ] **Step 4: Commit**

```bash
git add js/scene.js js/game.js
git commit -m "feat: 3D range scene + FOV-103 camera + render loop bootstrap"
```

---

## Task 8: player.js — pointer lock + mouse look + sensitivity

**Files:**
- Create: `js/player.js`
- Modify: `js/game.js`

- [ ] **Step 1: Write `js/player.js`**

```javascript
// First-person look: pointer lock + yaw/pitch from mouse movement, scaled by Valorant-style
// sensitivity. Reads live sensitivity from a getSens() callback so Settings can change it.
// getSens() returns { valSens, multiplier }.
function Player(camera, getSens) {
  let yaw = 0;
  let pitch = 0;
  const MAX_PITCH = (89 * Math.PI) / 180;

  function onMouseMove(e) {
    if (document.pointerLockElement == null) return;
    const { valSens, multiplier } = getSens();
    const dYaw = effectiveDeg(e.movementX, valSens, VALO.YAW_CONST, multiplier);
    const dPitch = effectiveDeg(e.movementY, valSens, VALO.YAW_CONST, multiplier);
    yaw -= (dYaw * Math.PI) / 180;        // moving mouse right -> look right
    pitch -= (dPitch * Math.PI) / 180;    // moving mouse down -> look down
    pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
    apply();
  }
  document.addEventListener('mousemove', onMouseMove);

  // Recoil kicks the view; recovery eases it back when not firing (driven by Weapon via addKick).
  let kickYaw = 0, kickPitch = 0;
  function addKick(yawDeg, pitchDeg) {
    kickYaw += (yawDeg * Math.PI) / 180;
    kickPitch += (pitchDeg * Math.PI) / 180;
    apply();
  }
  function update(dt) {
    // ease kick back toward 0
    const rec = Math.min(1, dt * 6);
    kickYaw -= kickYaw * rec;
    kickPitch -= kickPitch * rec;
    apply();
  }

  function apply() {
    camera.rotation.y = yaw + kickYaw;
    camera.rotation.x = pitch + kickPitch;
  }

  return { update, addKick, get yaw() { return yaw; }, get pitch() { return pitch; } };
}
```

- [ ] **Step 2: Wire pointer lock + player into `js/game.js`**

In `js/game.js`, replace the IIFE body with:
```javascript
(function () {
  let three, player, lastT = 0;
  const blocker = () => document.getElementById('blocker');

  // Temporary sensitivity source until Settings exists (Task 12 replaces this).
  function getSens() { return { valSens: 0.4, multiplier: 1.0 }; }

  function init() {
    three = Scene3D(document.getElementById('app'));
    player = Player(three.camera, getSens);
    setupPointerLock();
    requestAnimationFrame(loop);
  }

  function setupPointerLock() {
    const b = blocker();
    b.addEventListener('click', () => document.body.requestPointerLock());
    document.addEventListener('pointerlockchange', () => {
      b.style.display = document.pointerLockElement ? 'none' : 'flex';
    });
  }

  function loop(t) {
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    update(dt);
    three.render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    player.update(dt);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
```

- [ ] **Step 3: Manual verify look controls**

Open `index.html`, click to lock the pointer. Expected: moving the mouse rotates the view (right→right, up→up); pitch stops near straight up/down (cannot flip over). Press `Esc` → pointer unlocks and the blocker reappears.

- [ ] **Step 4: Commit**

```bash
git add js/player.js js/game.js
git commit -m "feat: pointer-lock first-person look with Valorant sensitivity"
```

---

## Task 9: enemy.js — bot model, hitbox zones, peek-swing movement

**Files:**
- Create: `js/enemy.js`
- Modify: `js/game.js`

- [ ] **Step 1: Write `js/enemy.js`**

```javascript
// A practice bot: a group with separate head/body/legs meshes tagged for hit detection,
// plus a cover wall it swings out from. Movement: hidden behind the wall, then strafe
// laterally at Valorant run speed to the target peek width, then hold until killed.
//
// cfg: { distance, peekWidth, side }  side = -1 (left) or +1 (right).
function Enemy(scene, cfg) {
  const group = new THREE.Group();

  // Cover wall the bot peeks from. Inner edge sits at x = 0 on the chosen side line.
  const wallX = cfg.side * 1.4;          // wall centered just off to the side
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 8, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x4a5160 })
  );
  wall.position.set(wallX + cfg.side * 1.2, 4, -cfg.distance);
  scene.add(wall);

  // Bot body parts (rough Valorant agent proportions, meters).
  const mat = new THREE.MeshStandardMaterial({ color: 0xc94f4f });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xe0a64f });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.35), mat);
  legs.position.y = 0.45;
  legs.userData.zone = 'legs';

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.35), mat);
  body.position.y = 1.25;
  body.userData.zone = 'body';

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), headMat);
  head.position.y = 1.8;
  head.userData.zone = 'head';

  group.add(legs, body, head);
  scene.add(group);

  const hitboxes = [legs, body, head];

  // Lateral motion: start fully hidden behind the wall, emerge toward center by peekWidth.
  const edgeX = wallX;                       // inner edge of cover
  const hiddenX = edgeX + cfg.side * 1.0;    // behind the wall (occluded)
  const targetX = edgeX - cfg.side * cfg.peekWidth; // emerged past the edge
  let x = hiddenX;
  group.position.set(x, 0, -cfg.distance);

  let visible = false;        // has the bot crossed the wall edge into view?
  let alive = true;

  function update(dt) {
    if (!alive) return;
    // move toward targetX at run speed
    const dir = Math.sign(targetX - x);
    if (dir !== 0) {
      x += dir * VALO.RUN_SPEED * dt;
      if ((dir > 0 && x > targetX) || (dir < 0 && x < targetX)) x = targetX; // clamp/stop
      group.position.x = x;
    }
    // visible once past the wall's inner edge toward center
    if (!visible && cfg.side * (edgeX - x) > 0) visible = true;
  }

  function kill() { alive = false; scene.remove(group); }
  function dispose() { scene.remove(group); scene.remove(wall); }

  return {
    update, kill, dispose,
    hitboxes,
    get visible() { return visible; },
    get alive() { return alive; },
  };
}
```

- [ ] **Step 2: Temporarily spawn one enemy in `js/game.js` to verify**

In `js/game.js`, add an enemy field and spawn it in `init` (this is replaced by the state machine in Task 13):
```javascript
// add near other lets:
let enemy;
// at end of init(), before requestAnimationFrame:
enemy = Enemy(three.scene, { distance: VALO.DISTANCE.medium, peekWidth: 1.2, side: -1 });
// in update(dt), after player.update(dt):
if (enemy) enemy.update(dt);
```

- [ ] **Step 3: Manual verify the swing**

Open `index.html`, click to lock, look slightly left toward the wall. Expected: at medium distance (~18 m) a red bot with an orange head strafes out from behind the grey cover wall and stops ~1.2 m past the edge, then holds still. Movement looks like a quick Valorant-speed swing (not a slow crawl).

- [ ] **Step 4: Commit**

```bash
git add js/enemy.js js/game.js
git commit -m "feat: peeking enemy bot with head/body/legs hitboxes"
```

---

## Task 10: weapon.js — hitscan, per-zone damage, fire-rate gate, recoil

**Files:**
- Create: `js/weapon.js`
- Modify: `js/game.js`

- [ ] **Step 1: Write `js/weapon.js`**

```javascript
// Vandal: hitscan from crosshair center on click/hold, gated to the real fire rate.
// Resolves damage by hit zone, applies it to the current enemy's EHP, applies recoil to
// the player view. Reports events to callbacks so game.js can update stats/state.
//
// deps: { camera, player, getEnemy, getSettings, on }
//   getEnemy()    -> current enemy object (from Enemy()) or null
//   getSettings() -> { recoilOn, recoilIntensity }
//   on            -> { shot(), hit(zone, isHead), kill() }
function Weapon(deps) {
  const ray = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const interval = fireInterval(VALO.FIRE_RATE);
  const ehpMax = VALO.ENEMY.hp + VALO.ENEMY.armor;

  let firing = false;
  let lastShot = -Infinity;
  let burstIndex = 0;     // shots since fire started (for recoil)
  let ehp = ehpMax;
  let trackedEnemy = null;

  function onDown(e) {
    if (e.button === 0 && document.pointerLockElement) { firing = true; }
  }
  function onUp(e) {
    if (e.button === 0) { firing = false; burstIndex = 0; }
  }
  document.addEventListener('mousedown', onDown);
  document.addEventListener('mouseup', onUp);

  // Reset EHP/burst when a fresh enemy appears.
  function syncEnemy() {
    const en = deps.getEnemy();
    if (en !== trackedEnemy) { trackedEnemy = en; ehp = ehpMax; }
    return en;
  }

  function update(dt, nowSec) {
    const en = syncEnemy();
    if (!firing || !en || !en.alive) return;
    if (!canFire(lastShot, nowSec, interval)) return;
    lastShot = nowSec;
    fireOne(en);
  }

  function fireOne(en) {
    deps.on.shot();
    // recoil kick (added before the shot's index increments feel; first shot index 0 = no kick)
    const s = deps.getSettings();
    if (s.recoilOn) {
      const r = recoilOffset(burstIndex, s.recoilIntensity);
      deps.player.addKick(r.yaw, r.pitch);
    }
    burstIndex += 1;

    ray.setFromCamera(center, deps.camera);
    const hits = ray.intersectObjects(en.hitboxes, false);
    if (hits.length === 0) return;
    const zone = hits[0].object.userData.zone;
    const isHead = zone === 'head';
    deps.on.hit(zone, isHead);
    ehp = applyDamage(ehp, damageForZone(zone, VALO.VANDAL));
    if (ehp <= 0) { en.kill(); deps.on.kill(); }
  }

  return { update };
}
```

- [ ] **Step 2: Wire weapon into `js/game.js` (temporary stats logging)**

In `js/game.js`:
```javascript
// add lets:
let weapon;
const stats = makeStats();

// in init(), after enemy spawn:
weapon = Weapon({
  camera: three.camera,
  player,
  getEnemy: () => enemy,
  getSettings: () => ({ recoilOn: false, recoilIntensity: 1.0 }),
  on: {
    shot: () => recordShot(stats),
    hit: (zone, isHead) => recordHit(stats, isHead),
    kill: () => { recordKill(stats, 0); console.log('KILL', stats); },
  },
});

// in update(dt), pass wall-clock seconds:
weapon.update(dt, performance.now() / 1000);
```

- [ ] **Step 3: Manual verify shooting + damage model**

Open `index.html`, lock pointer, shoot the bot. Expected:
- One shot to the orange head → instant kill (console logs `KILL`).
- Body-only shots → 4 shots to kill (watch the console `KILL` after the 4th body hit; 3 do not kill).
- Holding the mouse fires at a steady ~9–10 rounds/sec, not faster.

- [ ] **Step 4: Commit**

```bash
git add js/weapon.js js/game.js
git commit -m "feat: Vandal hitscan, per-zone damage, fire-rate gating, recoil hook"
```

---

## Task 11: hud.js — Valorant-style crosshair + live stats overlay

**Files:**
- Create: `js/hud.js`
- Modify: `js/game.js`

- [ ] **Step 1: Write `js/hud.js`**

```javascript
// Draws a Valorant-style crosshair on the #crosshair canvas and renders live stats text.
// crosshairCfg: { color, length, gap, thickness, dot }
function Hud(crosshairCfg) {
  const cv = document.getElementById('crosshair');
  const ctx = cv.getContext('2d');
  const statsEl = document.getElementById('stats');

  function drawCrosshair(cfg) {
    const c = cfg || crosshairCfg;
    const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = c.color;
    const t = c.thickness, g = c.gap, len = c.length;
    // four lines
    ctx.fillRect(cx - t / 2, cy - g - len, t, len); // up
    ctx.fillRect(cx - t / 2, cy + g, t, len);       // down
    ctx.fillRect(cx - g - len, cy - t / 2, len, t); // left
    ctx.fillRect(cx + g, cy - t / 2, len, t);       // right
    if (c.dot) ctx.fillRect(cx - t / 2, cy - t / 2, t, t);
  }

  function update(stats, sessionSec) {
    statsEl.innerHTML =
      `Kills: <b>${stats.kills}</b><br>` +
      `Accuracy: <b>${(statAccuracy(stats) * 100).toFixed(0)}%</b><br>` +
      `Headshot: <b>${(statHeadshotPct(stats) * 100).toFixed(0)}%</b><br>` +
      `Avg reaction: <b>${statAvgReaction(stats).toFixed(0)} ms</b><br>` +
      `Time: <b>${sessionSec.toFixed(0)}s</b>`;
  }

  drawCrosshair(crosshairCfg);
  return { update, drawCrosshair };
}
```

- [ ] **Step 2: Wire HUD into `js/game.js`**

```javascript
// add let:
let hud;
let sessionStart = 0;

// in init(), after weapon:
hud = Hud({ color: '#33ff88', length: 7, gap: 4, thickness: 2, dot: false });
sessionStart = performance.now();

// in update(dt):
hud.update(stats, (performance.now() - sessionStart) / 1000);
```

- [ ] **Step 3: Manual verify HUD**

Open `index.html`. Expected: a green cross (4 ticks, center gap, no dot) at screen center; top-left shows Kills / Accuracy / Headshot / Avg reaction / Time updating live as you shoot.

- [ ] **Step 4: Commit**

```bash
git add js/hud.js js/game.js
git commit -m "feat: Valorant-style crosshair + live stats HUD"
```

---

## Task 12: settings.js — settings panel, localStorage, live bindings

**Files:**
- Create: `js/settings.js`
- Modify: `js/game.js`

- [ ] **Step 1: Write `js/settings.js`**

```javascript
// Owns all tunable settings, persists to localStorage, and builds the #settings-body panel.
// Other modules read settings via getters; some changes call onChange to apply immediately.
function Settings(onChange) {
  const KEY = 'holdangle.settings.v1';
  const defaults = {
    distance: VALO.DISTANCE.medium,   // meters
    peekMode: 'random',               // 'fixed' | 'random'
    peekWidth: 1.2,                   // meters (fixed mode)
    peekMaxWidth: VALO.PEEK.max,      // meters (random mode upper bound)
    side: 'random',                   // 'left' | 'right' | 'random'
    respawnDelay: VALO.RESPAWN_DELAY, // seconds
    valSens: 0.4,
    dpi: 800,
    sensMultiplier: 1.0,
    recoilOn: false,
    recoilIntensity: 1.0,
    chColor: '#33ff88',
    chLength: 7,
    chGap: 4,
    chThickness: 2,
    chDot: false,
  };
  let s = load();

  function load() {
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch (e) { return Object.assign({}, defaults); }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(s)); }

  // --- panel construction ---
  const body = document.getElementById('settings-body');

  function row(label, control, hint) {
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = `<label>${label}</label>`;
    div.appendChild(control);
    if (hint) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = hint; div.appendChild(h); }
    body.appendChild(div);
    return div;
  }
  function select(options, value, fn) {
    const el = document.createElement('select');
    options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (String(v) === String(value)) o.selected = true; el.appendChild(o); });
    el.addEventListener('change', () => { fn(el.value); save(); onChange && onChange(); });
    return el;
  }
  function range(min, max, step, value, fmt, fn) {
    const el = document.createElement('input');
    el.type = 'range'; el.min = min; el.max = max; el.step = step; el.value = value;
    const tag = document.createElement('span'); tag.className = 'val'; tag.textContent = fmt(value);
    el.addEventListener('input', () => { const v = parseFloat(el.value); tag.textContent = fmt(v); fn(v); save(); onChange && onChange(); });
    const wrap = document.createElement('div'); wrap.appendChild(tag); wrap.appendChild(el);
    return wrap;
  }
  function checkbox(value, fn) {
    const el = document.createElement('input'); el.type = 'checkbox'; el.checked = value;
    el.addEventListener('change', () => { fn(el.checked); save(); onChange && onChange(); });
    return el;
  }

  function build() {
    body.innerHTML = '';
    row('Distance (player ↔ enemy)', select(
      [[VALO.DISTANCE.near, 'Near (8m)'], [VALO.DISTANCE.medium, 'Medium (18m)'], [VALO.DISTANCE.far, 'Far (35m)']],
      s.distance, v => s.distance = parseFloat(v)));
    row('Peek mode', select([['fixed', 'Fixed width'], ['random', 'Random (wider = rarer)']],
      s.peekMode, v => s.peekMode = v));
    row('Peek width / max (m)', range(VALO.PEEK.min, VALO.PEEK.max, 0.1,
      s.peekMode === 'fixed' ? s.peekWidth : s.peekMaxWidth, v => v.toFixed(1) + 'm',
      v => { if (s.peekMode === 'fixed') s.peekWidth = v; else s.peekMaxWidth = v; }));
    row('Peek side', select([['left', 'Left'], ['right', 'Right'], ['random', 'Random']],
      s.side, v => s.side = v));
    row('Respawn delay', range(0, 2, 0.1, s.respawnDelay, v => v.toFixed(1) + 's', v => s.respawnDelay = v));

    row('Valorant sensitivity', range(0.05, 2.0, 0.01, s.valSens, v => v.toFixed(2), v => s.valSens = v),
      'Uses Valorant yaw constant (sens × 0.07°/count).');
    row('Mouse DPI', range(100, 3200, 100, s.dpi, v => String(v), v => s.dpi = v));
    row('Sens fine-tune', range(0.5, 2.0, 0.05, s.sensMultiplier, v => '×' + v.toFixed(2), v => s.sensMultiplier = v),
      'Approx cm/360 shown below; tune to match your feel.');
    const cm = document.createElement('div'); cm.className = 'hint';
    cm.id = 'cm360'; body.appendChild(cm); refreshCm();

    row('Vandal recoil', checkbox(s.recoilOn, v => s.recoilOn = v));
    row('Recoil intensity', range(0.2, 2.0, 0.1, s.recoilIntensity, v => '×' + v.toFixed(1), v => s.recoilIntensity = v));

    row('Crosshair color', (() => { const el = document.createElement('input'); el.type = 'color'; el.value = s.chColor;
      el.addEventListener('input', () => { s.chColor = el.value; save(); onChange && onChange(); }); return el; })());
    row('Crosshair length', range(0, 20, 1, s.chLength, v => String(v), v => s.chLength = v));
    row('Crosshair gap', range(0, 15, 1, s.chGap, v => String(v), v => s.chGap = v));
    row('Crosshair thickness', range(1, 6, 1, s.chThickness, v => String(v), v => s.chThickness = v));
    row('Crosshair dot', checkbox(s.chDot, v => s.chDot = v));

    const reset = document.createElement('button'); reset.textContent = 'Reset stats';
    reset.addEventListener('click', () => onChange && onChange('reset-stats'));
    body.appendChild(reset);
  }

  function refreshCm() {
    const el = document.getElementById('cm360');
    if (el) el.textContent = '≈ ' + cm360(s.valSens, s.dpi, VALO.YAW_CONST).toFixed(1) + ' cm/360 (approx)';
  }

  build();

  return {
    get: () => s,
    sens: () => ({ valSens: s.valSens, multiplier: s.sensMultiplier }),
    crosshair: () => ({ color: s.chColor, length: s.chLength, gap: s.chGap, thickness: s.chThickness, dot: s.chDot }),
    weaponCfg: () => ({ recoilOn: s.recoilOn, recoilIntensity: s.recoilIntensity }),
    refreshCm,
    rebuild: build,
  };
}
```

- [ ] **Step 2: Wire settings into `js/game.js` + open/close on Esc**

In `js/game.js`:
```javascript
// add let:
let settings;

// in init(), BEFORE creating player/weapon/hud, create settings:
settings = Settings(onSettingsChange);

// replace the temporary getSens with settings:
//   player = Player(three.camera, () => settings.sens());
// replace weapon getSettings:
//   getSettings: () => settings.weaponCfg(),
// replace hud creation:
//   hud = Hud(settings.crosshair());

function onSettingsChange(action) {
  settings.refreshCm();
  if (hud) hud.drawCrosshair(settings.crosshair());
  if (action === 'reset-stats') Object.assign(stats, makeStats());
  // distance/peek/side changes take effect on the next spawn (Task 13).
}

// Show the settings panel whenever the pointer is unlocked; hide while locked.
document.addEventListener('pointerlockchange', () => {
  const panel = document.getElementById('settings');
  panel.classList.toggle('open', document.pointerLockElement == null);
});
```

(Make sure `player`, `weapon`, and `hud` now use the `settings`-backed callbacks shown above, replacing the temporary literals from Tasks 8/10/11.)

- [ ] **Step 3: Manual verify settings**

Open `index.html`. Press `Esc` → settings panel slides in on the right. Expected:
- Changing **crosshair** color/length/gap/thickness/dot updates the crosshair live.
- Changing **Valorant sensitivity** / **DPI** updates the "≈ cm/360" readout; lock and confirm look speed changes; **fine-tune** scales it.
- Toggling **Vandal recoil** on then spraying makes the view climb; off keeps it still.
- Reload the page → settings persist (localStorage).

- [ ] **Step 4: Commit**

```bash
git add js/settings.js js/game.js
git commit -m "feat: settings panel (distance/peek/sens/recoil/crosshair) with persistence"
```

---

## Task 13: game.js — state machine (spawn / peek / hold / dead / respawn) + reaction time

**Files:**
- Modify: `js/game.js`

This task replaces the temporary single-enemy spawn with a proper lifecycle and wires reaction-time measurement.

- [ ] **Step 1: Add the spawn/respawn state machine to `js/game.js`**

Replace the enemy handling with a state machine. Final relevant parts of `js/game.js`:
```javascript
// state lets:
let enemy = null;
let state = 'waiting';        // 'waiting' | 'active' | 'dead'
let respawnAt = 0;            // seconds (wall clock) when next enemy spawns
let visibleAt = null;         // seconds when current enemy became visible (for reaction time)

function resolveSide() {
  const v = settings.get().side;
  if (v === 'left') return -1;
  if (v === 'right') return 1;
  return Math.random() < 0.5 ? -1 : 1;
}
function resolvePeekWidth() {
  const cfg = settings.get();
  if (cfg.peekMode === 'fixed') return cfg.peekWidth;
  return samplePeekWidth(VALO.PEEK.min, cfg.peekMaxWidth, Math.random);
}
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

// in init(), replace the temporary Enemy(...) spawn with:
//   respawnAt = performance.now() / 1000;   // spawn immediately on start

// stat hook: capture reaction time on kill (replace the temporary kill handler):
//   kill: () => {
//     const reaction = visibleAt != null ? (performance.now() / 1000 - visibleAt) * 1000 : 0;
//     recordKill(stats, reaction);
//     state = 'dead';
//     respawnAt = performance.now() / 1000 + settings.get().respawnDelay;
//   },

function updateState(nowSec) {
  if (state === 'waiting' || state === 'dead') {
    if (nowSec >= respawnAt) spawnEnemy();
  }
  if (enemy && enemy.alive) {
    enemy.update(lastDt);
    if (visibleAt == null && enemy.visible) visibleAt = nowSec; // reaction clock starts
  }
}
```

Wire it into `loop`/`update`. The final `update(dt)` body:
```javascript
let lastDt = 0;
function update(dt) {
  lastDt = dt;
  const nowSec = performance.now() / 1000;
  player.update(dt);
  updateState(nowSec);
  weapon.update(dt, nowSec);
  hud.update(stats, (performance.now() - sessionStart) / 1000);
}
```

Ensure `init()` sets `respawnAt = performance.now() / 1000;` instead of spawning directly, and that the weapon's `getEnemy: () => enemy` still points at the live enemy.

- [ ] **Step 2: Manual verify the full loop**

Open `index.html`, lock pointer. Expected end-to-end behavior:
- An enemy swings out; after you kill it, ~0.5 s later a new one peeks (change Respawn delay in settings and confirm the gap changes).
- **Random peek mode:** over ~15 spawns, narrow peeks are common and wide peeks rare; **Fixed mode** always peeks the set width.
- **Side = random** alternates sides; left/right force the side.
- **Avg reaction** in the HUD reflects how quickly you kill after the enemy appears (faster kills → lower ms).
- Changing **Distance** in settings makes the next spawn near/medium/far.

- [ ] **Step 3: Run the full logic test suite (regression check)**

Run: `node --test tests/`
Expected: all tests PASS (constants + logic, 20 tests).

- [ ] **Step 4: Commit**

```bash
git add js/game.js
git commit -m "feat: spawn/hold/respawn state machine + reaction-time tracking"
```

---

## Task 14: start.bat + README + final verification

**Files:**
- Create: `start.bat`
- Create: `README.md`
- Delete: `js/.gitkeep`

- [ ] **Step 1: Write `start.bat` (optional localhost launcher)**

```bat
@echo off
REM Optional: serve over localhost (not required — index.html also opens directly).
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8000/index.html
  python -m http.server 8000
  goto :eof
)
REM Fallback: PowerShell static server (no Python needed).
powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "$l=[System.Net.HttpListener]::new();$l.Prefixes.Add('http://localhost:8000/');$l.Start();" ^
  "Start-Process 'http://localhost:8000/index.html';" ^
  "while($l.IsListening){$c=$l.GetContext();$p=$c.Request.Url.LocalPath.TrimStart('/');" ^
  "if([string]::IsNullOrEmpty($p)){$p='index.html'};$f=Join-Path (Get-Location) $p;" ^
  "if(Test-Path $f){$b=[System.IO.File]::ReadAllBytes($f);$c.Response.OutputStream.Write($b,0,$b.Length)}" ^
  "else{$c.Response.StatusCode=404};$c.Response.Close()}"
```

- [ ] **Step 2: Write `README.md`**

```markdown
# Valorant Hold-Angle Trainer

A browser FPS for practicing holding an angle: stand still, react to an enemy swinging out
from cover, and hit Valorant-accurate Vandal damage. No install, no build.

## Run
- **Double-click `index.html`** (works offline; Three.js is vendored locally), **or**
- run `start.bat` to serve it at http://localhost:8000.

Click the screen to play (pointer lock). Press **Esc** for settings.

## Valorant references
- Enemy peek speed 6.75 m/s · Vandal head 160 (one-shot) / body 40 (4 shots) / legs 33 ·
  fire rate 9.75/s · FOV 103° H · enemy 150 EHP.

## Settings
Distance (near/med/far), peek mode (fixed or random — wider peeks rarer), peek side, respawn
delay, Valorant sensitivity + DPI + fine-tune, Vandal recoil on/off + intensity, crosshair.

## Develop / test
Pure logic is unit-tested: `node --test tests/`
```

- [ ] **Step 3: Remove the placeholder**

Run: `rm js/.gitkeep`

- [ ] **Step 4: Final full verification**

Run: `node --test tests/`
Expected: all PASS.

Open `index.html` and confirm the full checklist from Task 13 Step 2 plus: crosshair customization persists across reload, recoil toggle works, stats reset button zeroes the HUD.

- [ ] **Step 5: Commit**

```bash
git add start.bat README.md
git rm --cached js/.gitkeep 2>/dev/null; git add -A
git commit -m "chore: launcher, README, final verification"
```

---

## Self-Review

**Spec coverage check (each spec requirement → task):**
- 3D FPS, Valorant view, no abilities/movement, stand still → Tasks 7–8 (scene, FOV 103, pointer-lock look only).
- Enemy peek at Valorant speed (6.75 m/s) → `VALO.RUN_SPEED` (Task 2), enemy movement (Task 9).
- Horizontal-plane interpretation = no walk, full free aim → Task 8 (yaw+pitch, no WASD).
- Enemy holds until killed, no return fire → Task 9 (stops at target), Task 13 (state machine).
- Respawn delay 0.5 s default, adjustable → `VALO.RESPAWN_DELAY` (Task 2), settings (Task 12), state machine (Task 13).
- Unlimited ammo, no reload → Weapon has no magazine (Task 10).
- Peek distance fixed or random, wider = rarer → `samplePeekWidth`/`peekWeight` (Task 4), settings + spawn (Tasks 12–13).
- Player↔enemy distance near/med/far → `VALO.DISTANCE` (Task 2), settings (Task 12), spawn (Task 13).
- Vandal damage: head one-shot, body 4 shots → Tasks 3 + 10 (160/40/33 vs 150 EHP).
- Reference Valorant physics/values → constants (Task 2), FOV 103 (Task 7), fire rate 9.75 (Tasks 5/10).
- Sensitivity with Valorant multiplier → Tasks 5 + 8 + 12.
- Vandal recoil on/off toggle → Tasks 6 + 10 + 12.

**Placeholder scan:** No "TBD/TODO/handle edge cases" steps; all code steps include full code. ✓

**Type/name consistency check:** logic exports (`damageForZone, applyDamage, peekWeight, samplePeekWidth, degPerCount, cm360, effectiveDeg, fireInterval, canFire, recoilOffset, makeStats, recordShot, recordHit, recordKill, statAccuracy, statHeadshotPct, statAvgReaction`) match every call site in scene/player/enemy/weapon/hud/settings/game. Enemy public API (`update, kill, dispose, hitboxes, visible, alive`) matches usage in game.js/weapon.js. Settings API (`get, sens, crosshair, weaponCfg, refreshCm, rebuild`) matches game.js usage. `Scene3D` returns `{scene, camera, renderer, render}` as used. ✓

**Note for executor:** `js/game.js` is the composition root and is intentionally edited across Tasks 7–13; later tasks replace the temporary literals (sensitivity, weapon settings, single-enemy spawn) with `settings`-backed callbacks and the state machine. When in doubt, the final shape of each wired callback is the one shown in Tasks 12–13.
```
