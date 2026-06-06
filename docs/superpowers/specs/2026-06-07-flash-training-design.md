# Flash Training (Breach / Phoenix / Yoru) — Design

Date: 2026-06-07
Status: Approved (pending spec review)

## Problem / Goal

The trainer currently spawns an enemy that peeks a held angle. Add an option to
practice **reacting to flashes**: on some rounds, instead of a plain enemy peek, an
agent's flash is thrown at the angle. The player must turn away to reduce the blind,
then turn back to kill the peeker. Flash detonation timing, blind duration, and color
follow real Valorant for Breach (Flashpoint), Phoenix (Curveball), and Yoru (Blindside).

## Decisions (from brainstorming)

- **Core mechanic:** realistic. Looking toward the flash at detonation → full blind;
  turned away → little or no blind. This trains turning away.
- **Round shape:** flash detonates, then an enemy peeks (a realistic entry). Player turns
  away from the flash, then turns back to kill the peeker.
- **Frequency:** a slider controls the chance a given spawn becomes a flash round.
- **Animation fidelity:** Approach A — a glowing, agent-colored orb emerges from the
  corner, flies in briefly, winds up, then bursts. Per-agent character comes from
  **color + timing + burst**, not from reproducing each ability's real flight path.
- **Extras:** synthesized flash sound (windup + pop). No on-screen dodge/hit feedback text.

## Reference values (current-patch approximations; tunable constants)

| Agent   | Ability    | Windup before pop | Max blind (looking at it) | Theme color   |
|---------|------------|-------------------|---------------------------|---------------|
| Breach  | Flashpoint | ~0.5 s            | ~2.0 s                    | yellow-white  |
| Phoenix | Curveball  | ~0.6 s            | ~1.3 s                    | orange (fire) |
| Yoru    | Blindside  | ~0.6 s            | ~1.75 s                   | blue-white    |

Sources (values vary by patch; treat as defaults):
- Breach Flashpoint — https://valorant.fandom.com/wiki/Flashpoint
- Phoenix Curveball — https://valorant.fandom.com/wiki/Curveball
- Yoru Blindside — https://valorant.fandom.com/wiki/Blindside
- Blind mechanic (facing/angle determines effective duration) — https://valorant.fandom.com/wiki/Blind

## Architecture

Follows the existing module layout: pure logic in `logic.js` (Node-testable + browser
global), Valorant data in `constants.js`, a THREE object module mirroring `enemy.js`,
DOM in `hud.js`, scene/audio effects in `effects.js`, UI in `settings.js`, wiring in
`game.js`. New code is small, focused, and unit-tested where it is pure.

### 1. Constants — `constants.js`, add `VALO.FLASH`

```js
FLASH: {
  breach:  { windup: 0.5, blind: 2.0,  color: 0xfff2b0 },
  phoenix: { windup: 0.6, blind: 1.3,  color: 0xffb060 },
  yoru:    { windup: 0.6, blind: 1.75, color: 0xbcd6ff },
  travel: 0.35,          // s — orb flight from corner into view before windup (our animation)
  enemyPeekDelay: 0.15,  // s — after detonation before the enemy starts peeking
  blindFullDeg: 35,      // within ±this angle (view vs flash) → full blind
  blindZeroDeg: 100,     // beyond this angle → no blind
  rampUp: 0.05,          // s — white overlay rises to full this fast
}
```

`windup` and `blind` are the Valorant-accurate pieces. `travel` is our added flight time
for the animation. Detonation happens at `travel + windup` after the orb spawns.

### 2. Pure logic — `logic.js` (each gets unit tests)

- `pickFlashAgent(enabledKeys, rng)` — returns one key at random from `enabledKeys`
  (array of `'breach'|'phoenix'|'yoru'`), or `null` if the array is empty.
- `shouldFlashRound(chance, hasAgent, rng)` — `hasAgent && rng() < chance`.
- `blindFactor(angleDeg, fullDeg, zeroDeg)` — returns `1` for `angle <= fullDeg`, `0` for
  `angle >= zeroDeg`, linear in between. `angle` is the angle between the camera forward
  vector and the direction from the camera to the flash at detonation.
- `blindDuration(maxBlind, factor)` — `maxBlind * factor`.
- `flashOverlayOpacity(elapsed, duration, rampUp)` — overlay opacity for the current frame:
  ramps `0→1` over `rampUp`, then decays `1→0` over the remainder of `duration`; `0` once
  `elapsed >= duration` (or when `duration <= 0`).

All exported via the existing `module.exports` block and available as browser globals.

### 3. Flash visual — new `js/flash.js`

`Flash(scene, cfg)` mirrors `enemy.js` structure. `cfg`: `{ color, windup, travel, side,
distance }`. Geometry reuses the enemy's corner: `innerEdge = side * 1.0`, cover wall at
`z = -distance + 2`.

- Builds a small emissive sphere (agent `color`) plus a short-range `PointLight` for glow.
- Starts behind the corner (occluded side), flies to a detonation point near the corner
  edge at ~eye height over `travel` seconds.
- During `windup`, the orb/glow grows and brightens.
- At `travel + windup`, sets `detonated = true`, exposes the detonation world `position`,
  and spawns a brief expanding **burst** (bright sphere scaling up and fading) over ~0.3 s,
  after which `done = true`.
- API: `update(dt)`, `dispose()`, getters `detonated`, `position` (THREE.Vector3),
  `done`. Disposes geometry/materials/lights like `enemy.js` does.

### 4. Blind overlay — `hud.js` + `index.html`

- `index.html`: add `<div id="flash-overlay"></div>` inside `#hud` (full-screen, white,
  `opacity:0`, `pointer-events:none`, above other HUD). CSS sets background white; JS
  drives opacity each frame (no CSS transition).
- `hud.js`: `triggerBlind(durationSec, tintColor)` starts an internal blind timer and sets
  the overlay tint; `update(dt)` advances it and sets `opacity` via `flashOverlayOpacity`.
  The first `rampUp` window is tinted with the agent color, then white, then fades out.
  (The in-game blind is white; the agent **color** is carried by the orb/burst in the scene.)

### 5. Synthesized sound — `effects.js`

Add a tiny WebAudio synth (lazy `AudioContext`):
- `playFlashWindup()` — a short rising tone over the windup.
- `playFlashPop()` — a brief noise/impulse burst at detonation.
Both gated by a `flashSound` setting. Existing file-based `SoundPool` is untouched.

### 6. Orchestration — `game.js`

Extend the lifecycle (`'waiting' | 'active' | 'dead'`) with a `'flashing'` phase:

1. When `nowSec >= respawnAt` in `waiting`/`dead`, evaluate
   `shouldFlashRound(flashChance, enabledAgents.length > 0, Math.random)`.
2. If a flash round: `pickFlashAgent(enabledAgents, Math.random)`, resolve `side`/`distance`
   /`peekWidth` once (same values the follow-up enemy will use), create `Flash(...)`,
   set `state = 'flashing'`, play windup sound at windup start.
3. While `'flashing'`, call `flash.update(dt)`. On the frame it first reports `detonated`:
   - Compute camera forward (`camera.getWorldDirection`) and the direction from the camera
     to `flash.position`; convert the angle between them to degrees.
   - `factor = blindFactor(angleDeg, FLASH.blindFullDeg, FLASH.blindZeroDeg)`,
     `dur = blindDuration(agent.blind, factor)`.
   - `hud.triggerBlind(dur, agent.color)`; `effects.playFlashPop()`.
   - Schedule the enemy peek at `nowSec + FLASH.enemyPeekDelay`.
4. At the scheduled time, `spawnEnemy()` with the stored `side`/`peekWidth` → `state =
   'active'`. The flash burst keeps fading then disposes.
5. From there, kill / respawn / reaction / shot-timing all use the existing paths unchanged.

Non-flash rounds behave exactly as today.

### 7. Settings — `settings.js` + persisted keys

New "Flash training" section:
- checkboxes: `flashBreach`, `flashPhoenix`, `flashYoru` (default `false`)
- slider: `flashChance` 0–100% (stored as fraction, default `0.3`)
- checkbox: `flashSound` (default `true`)

Persisted in the existing `localStorage` settings object; exposed via getters consumed by
`game.js`/`effects.js`. The slider has no effect when no agent is enabled.

## Files touched

- `js/constants.js` — add `VALO.FLASH`
- `js/logic.js` — add the 5 pure functions
- `js/flash.js` — new flash visual module
- `js/hud.js` — blind overlay control
- `js/effects.js` — synthesized flash sound
- `js/settings.js` — Flash training UI + keys
- `js/game.js` — flash-round orchestration (`'flashing'` state)
- `index.html` — `#flash-overlay` div + CSS, add `<script src="js/flash.js">` (after `enemy.js`)
- `tests/logic.test.js` — tests for the new pure functions
- `tests/constants.test.js` — assert `VALO.FLASH` shape/values
- `README.md` — document the new settings and behavior

## Testing

- Unit tests (Node `node --test`) for `pickFlashAgent`, `shouldFlashRound`, `blindFactor`
  (boundaries at `fullDeg`/`zeroDeg` and a midpoint), `blindDuration`, and
  `flashOverlayOpacity` (ramp-up, decay, past-duration zero).
- `constants.test.js`: assert `VALO.FLASH` has all three agents with `windup`/`blind`/`color`
  and the tuning fields.
- Manual: enable each agent, fire a flash round, confirm color, windup feel, that looking
  away reduces the white-out, that the enemy peeks after the pop, and that the synth sound
  plays.

## Out of scope

- Per-agent real flight paths (Breach through-wall, Phoenix curve, Yoru bounce).
- On-screen dodge/hit feedback text for flashes.
- Distance-based blind falloff (only view angle affects blind here).
