# Valorant Hold-Angle Trainer — Design Spec

**Date:** 2026-06-06
**Status:** Approved design, pending implementation plan

## Purpose

A browser-based 3D FPS trainer that recreates the Valorant first-person experience for the
specific skill of **holding an angle**: stand still, hold a pre-aim on a corner, and react to an
enemy swinging out from behind cover. No abilities, no movement, no walking — pure aim + reaction
practice, with physics and damage values referenced to Valorant as closely as possible.

## Platform & How to Run

- **Three.js (UMD build)** vendored locally as `three.min.js`; game code as ordered classic
  `<script>` files (no ES modules, so no `file://` CORS issues).
- **Double-click `index.html` to run** — no install, no build step, no server, works offline once
  `three.min.js` is vendored.
- `start.bat` provided as an optional convenience: serves the folder over `localhost` using
  PowerShell's built-in `HttpListener` (no Python/Node dependency) and opens the browser.
- Click the canvas → Pointer Lock (FPS mouse look). `Esc` releases the lock and opens the Settings
  overlay.

## Valorant Reference Values (physics / damage)

| Item | Value |
|---|---|
| Enemy peek (swing) speed | **6.75 m/s** (Valorant run speed) |
| Vandal — head | **160 dmg**, no range falloff → one-shot headshot at all distances |
| Vandal — body | **40 dmg** |
| Vandal — legs | **33 dmg** |
| Enemy HP | **100 HP + 50 armor = 150 EHP** → body kills in 4 shots (40×4 = 160 ≥ 150) |
| Fire rate | **9.75 rounds/sec** (~103 ms min interval; holding fire cannot exceed this) |
| Magazine / ammo | Unlimited, no reload |
| FOV | **103° horizontal**, locked regardless of window aspect ratio |

- Player stands still (no WASD, no abilities). **Full free aim (yaw + pitch)** via mouse.
- Shooting is **hitscan** (raycast from crosshair center). First shot is perfectly accurate.

## Gameplay Model

State machine in `game.js`:

1. **WAITING** — no enemy; respawn timer counting down.
2. **PEEKING** — enemy spawns behind the cover wall, swings laterally out at 6.75 m/s to the
   target peek distance.
3. **HOLDING** — enemy reaches peek distance, decelerates to a stop, and **stands still until
   killed** (no return fire, no time limit — pure aim practice).
4. **DEAD** — enemy killed; record stats; wait `respawnDelay` (default 0.5 s, adjustable) → back
   to WAITING/PEEKING.

The enemy **does not shoot back**. There is no fail/death state for the player.

## Scene & Enemy

- "The Range"-style environment: clean grey floor, a cover wall the enemy peeks from, optional
  back wall, even lighting.
- Enemy is a simple humanoid bot with **separated hitbox zones**: head (sphere), torso/body (box),
  legs — so head vs body shots resolve to the correct Valorant damage.
- **Two independently configurable distances:**
  - **Player ↔ enemy distance:** presets Near 8 m / Medium 18 m / Far 35 m, plus custom meters.
  - **Peek distance (how far the enemy emerges past the wall edge):** either
    - **fixed** via slider (~0.3 m shoulder-peek to ~2.5 m wide-peek), or
    - **random**, where **wider peeks are less likely** (probability weight decreases as width
      increases — e.g. weight ∝ (maxWidth − width), normalized).
- **Peek side:** left wall / right wall / random.

## Weapon: Vandal

- Hitscan raycast from crosshair on left-click (and on hold, gated to 9.75 rounds/sec).
- Damage resolved by hit zone: head 160 / body 40 / legs 33. Applied to enemy EHP (150).
- **Recoil toggle (off by default):** when ON, applies an approximate Vandal spray pattern —
  vertical climb over the first several shots, then horizontal sway, with crosshair recovery when
  fire stops. Intensity adjustable. First shot always accurate, so tapping is unaffected.

## Sensitivity

- **Valorant-matched sensitivity:** settings field for Valorant sens value (e.g. 0.4). In-app
  rotation uses `degreesPerCount = ValSens × 0.07` (the Valorant yaw constant), applied to mouse
  `movementX/movementY`.
- **DPI field:** used only to display an approximate `cm/360 = 360 / (ValSens × 0.07 × DPI) × 2.54`
  for reference.
- **Fine-tune multiplier slider (×0.5–×2.0):** multiplies the effective sensitivity so the user can
  match the feel by hand.
- **Caveat:** browsers report mouse movement in CSS pixels, not raw DPI counts, so cm/360 matching
  is approximate, not bit-exact. The fine-tune slider compensates.

## Settings Panel

- Player ↔ enemy distance (preset or custom)
- Peek mode (fixed / random) + width (or max width)
- Peek side (left / right / random)
- Respawn delay (default 0.5 s)
- Sensitivity: Valorant sens, DPI, fine-tune multiplier
- Recoil: on/off + intensity
- Crosshair: color, size/length, gap, thickness, center dot (Valorant-style)
- All settings persisted to `localStorage`.

## HUD & Stats

- Valorant-style crosshair at screen center.
- Live stats overlay (to track hold-angle improvement):
  - Kills
  - Accuracy % (hits / shots)
  - Headshot %
  - **Average reaction time** (from enemy first becoming visible to the killing shot)
  - Session time
  - Reset button.

## Code Architecture

Each file has a single clear responsibility; loaded in order as classic scripts.

```
index.html          loads three.min.js then js/* in order, then init
three.min.js        Three.js UMD build (vendored, offline)
start.bat           optional localhost launcher (PowerShell HttpListener)
js/constants.js     all Valorant reference values (speed, damage, FOV, distances)
js/settings.js      settings state + localStorage + UI binding
js/scene.js         renderer, camera (FOV 103° horizontal), lights, environment
js/enemy.js         Enemy class: model, peek movement, hitbox zones, health
js/weapon.js        Vandal: hitscan raycast, per-zone damage, fire-rate gating, recoil pattern
js/hud.js           crosshair + stats overlay
js/game.js          state machine (waiting/peeking/holding/dead), spawn/respawn, main loop
```

## Out of Scope (YAGNI)

- Enemy return fire / player death.
- Movement (WASD), crouch, jump, abilities, multiple weapons.
- Online features, accounts, leaderboards.
- Exact recoil pattern fidelity (approximate pattern only).

## Open Notes

- `three.min.js` is vendored at build time (download once); if offline at build time, fall back to
  a CDN `<script>` with a note in the README.
- Distance presets (8 / 18 / 35 m) are starting values and user-adjustable.
