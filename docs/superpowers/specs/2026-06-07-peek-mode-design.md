# Peek Mode (Wall Peek / Smoke) — Design

Date: 2026-06-07
Status: Approved (pending spec review)

## Problem / Goal

The trainer today is a **hold-angle** drill: the player stands still and reacts to an
enemy that peeks out from cover. Add the inverse drill — **the player does the peeking**.
Two variants:

1. **Wall peek** — the player hides behind a wall, walks out (WASD) to peek, and finds
   1–5 stationary bots standing in front at random positions. Clear them all, retreat
   behind the wall, and the next wave spawns with freshly randomized positions (and a new
   count, if the count is random).
2. **Smoke** — same idea, but the player does not walk out. The player stands behind a
   smoke that fully blocks vision for ~3 s, then permanently fades to reveal 1–5 stationary
   bots in front. Clear them all and the next wave's smoke re-covers, then fades again.

Bots are stationary, do not shoot back, and impose no time pressure (the existing
no-damage-to-player model is preserved).

## Decisions (from brainstorming)

- **Mode selection:** a top-level `trainingMode` setting — `hold` (current behavior +
  flash), `wallpeek`, `smoke`. The hold-angle/flash path is untouched.
- **Peek mechanic (wall peek):** free **WASD** movement. This adds a movement system the
  game does not currently have; it is enabled only in peek modes.
- **Bot behavior:** stationary dummies, no shoot-back, no time limit (matches the current
  no-damage model).
- **Bot placement:** spread in front of the player, within visible range, random in both
  X (left/right) and Z (depth) — but **never farther than the configured distance**.
- **Wave cadence (wall peek):** the next wave spawns only after the player has **retreated
  behind cover** (then a respawn delay), so each wave is a fresh peek rep.
- **Smoke cycle:** the smoke blocks fully for ~3 s, then fades and **stays clear**; the
  player clears the wave at their own pace; once all bots are dead the next wave's smoke
  re-covers and fades again. (No movement required in smoke mode.)
- **Architecture (Approach A):** a new encapsulated `PeekMode` module owns the cover
  (wall/smoke) + the target wave + the per-round state machine. `Weapon` is generalized to
  fire at a list of targets (each target owns its own HP) and to treat cover walls as
  raycast occluders. Bot geometry is extracted into a shared `bot.js`.

## Architecture

Follows the existing module layout: pure logic in `logic.js` (Node-testable + browser
global), Valorant/tuning data in `constants.js`, THREE object modules mirroring `enemy.js`,
DOM in `hud.js`, UI in `settings.js`, wiring in `game.js`. New code is small, focused, and
unit-tested where it is pure. The hold-angle (+flash) path keeps working as-is; peek modes
are a parallel path that `game.js` selects between.

### Coordinate recap

Player starts at `(0, 1.6, 0)` looking down `-Z`. Bots live at negative `Z`. The
`distance` setting (Near 8 / Medium 18 / Far 35 m) is the nominal player↔bot depth.

### 1. Constants — `constants.js`

Reuse `VALO.RUN_SPEED` (5.4 m/s) as the player move speed. Add tuning blocks (values are
defaults, all tunable):

```js
PEEK_TARGET: {
  count: { min: 1, max: 5 },
  spreadXFactor: 0.3, spreadXMin: 2.5, spreadXMax: 7, // half-width of X spread vs distance
  depthSpreadFactor: 0.4, depthSpreadMax: 6,          // how much NEARER than `distance` bots may be
  minSeparation: 1.2,                                  // m between bots (no overlap)
},
WALL_PEEK: {
  wallZ: -2.5, wallW: 3, wallH: 3, wallThickness: 0.5, // cover wall in front of the player
  behindCoverHalfWidth: 0.6, behindCoverZ: -0.5,        // "safe pocket" that arms the next wave
  bounds: { x: 4, zFront: -1.5, zBack: 1.5 },           // player movement clamp (wall blocks forward)
},
SMOKE: {
  coverDuration: 3.0, fadeDuration: 0.6,               // s — block, then fade
  z: -3, w: 10, h: 7, color: 0xc9ced6,                 // opaque box that fills the view toward bots
  bounds: { x: 3, zFront: -0.5, zBack: 1.5 },
},
```

`wallW`/`wallZ` are sized so that, from the start point, the wall occludes the entire bot
zone (worst case: a near, wide bot). The player must strafe ~`wallW/2` sideways to clear an
edge and begin revealing bots — a meaningful peek.

### 2. Pure logic — `logic.js` (each gets unit tests)

- `sampleEnemyCount(mode, fixed, max, rng)` — `fixed` → clamp `fixed` to `[1, max]`;
  `random` → integer in `[1, max]`.
- `randomTargetPlacements(count, { spreadX, depthMin, depthMax, minSep }, rng)` — returns an
  array of `{ x, z }`. Rejection-samples each position so no two are closer than `minSep`
  (capped attempts; falls back to the last sample to guarantee `count` results).
- `classifyStationaryShot(hitZone)` — `'head'` → `'perfect'`, `'body'`/`'legs'` → `'good'`,
  otherwise (`'wall'`/`null`) → `null` (no feedback shown).
- `isBehindCover(x, z, halfWidth, behindZ)` — `Math.abs(x) <= halfWidth && z >= behindZ`.
- `smokePhase(elapsed, coverDur, fadeDur)` — returns `{ phase, opacity }`:
  - `elapsed < coverDur` → `{ 'covered', 1 }`
  - `coverDur <= elapsed < coverDur + fadeDur` → `{ 'fading', 1 - (elapsed-coverDur)/fadeDur }`
  - else → `{ 'clear', 0 }`

All exported via the existing `module.exports` block and available as browser globals.

### 3. Shared bot geometry — new `js/bot.js`

`makeBotParts()` builds the head/body/legs meshes (current Valorant-ish proportions and
materials from `enemy.js`) and returns `{ group, hitboxes }` where each hitbox mesh carries
`userData.zone`. Both `enemy.js` and `targets.js` use it (DRY; the only behavioral change to
`enemy.js` is swapping its inline mesh creation for this helper).

### 4. Target wave — new `js/targets.js`

- `StationaryBot(scene, { x, z })` — places a bot via `makeBotParts()`, owns its EHP
  (`VALO.ENEMY.hp + armor = 150`), and tags every hitbox with `userData.bot = <this>` so the
  weapon can find the owner. API:
  - `applyDamage(zone)` → applies `VALO.VANDAL[zone]`, returns `true` when it dies; on death
    removes the group from the scene.
  - getters `alive`, `x`, `z`; `hitboxes`; `updateMatrixWorld()`; `dispose()`.
  - For weapon compatibility it also exposes inert hold-angle fields
    (`movementDir = 0`, `fullPeeked = true`, `visible = true`) so the same shot pipeline runs.
- `TargetWave(scene, { placements })` — builds one `StationaryBot` per placement. API:
  `bots` (alive list), `hitboxes` (all alive bots' hitboxes), `cleared` (all dead),
  `dispose()`.

### 5. Generalized weapon — `js/weapon.js`

Replace the single-enemy assumption with a shootable-set provided by `game.js`:

- `deps.getShootables()` → `{ targets: [bot,...], occluders: [mesh,...] }`. `game.js`
  returns hold-angle's `[enemy]` + `[peekWall]`, or peek mode's wave bots + cover wall
  (wall peek) / no occluder (smoke — bullets pass through).
- On fire: raycast against all alive targets' hitboxes **plus** occluder meshes; take the
  nearest hit.
  - Nearest is an occluder → blocked shot (no damage). Reported as a miss.
  - Nearest is a bot hitbox → `bot = hit.object.userData.bot`; `zone = userData.zone`;
    `killed = bot.applyDamage(zone)`; fire `on.hit(zone, isHead)`; if `killed`, `on.kill(bot)`.
- HP/EHP moves **out** of `Weapon` and into each target (`applyDamage`). `syncEnemy`/shared
  `ehp` is removed.
- `on.shot(info)` now carries raw raycast data — `{ hitZone, isHead, aimX, botX, movementDir,
  fullPeeked, visible }` — and `game.js` turns it into feedback (mode-specific), instead of
  `Weapon` classifying timing itself. This keeps `Weapon` purely mechanical.

Including the wall as an occluder also fixes hold-angle correctly (shots can no longer pass
through the peek wall regardless of the `visible` flag).

### 6. Player movement — `js/player.js`

Extend `Player` (today: look only) with optional ground movement:

- Track W/A/S/D via `keydown`/`keyup` (ignored when pointer is unlocked / settings open).
- `update(dt)`: when movement is enabled, build a local move vector (forward `-Z`, strafe
  `+X`) rotated by `yaw`, scale by `RUN_SPEED * dt`, apply, then resolve collision:
  per-axis clamp against the wall AABB and against the play-area bounds. `y` stays `1.6`.
- New API: `setMovementEnabled(bool)`, `setColliders([aabb])`, `setBounds({xMin..zMax})`,
  `resetPosition()`, and a `position` getter. Look/recoil behavior is unchanged. In
  hold-angle mode movement stays disabled, preserving today's "stand still" feel.

### 7. PeekMode orchestration — new `js/peekmode.js`

`PeekMode(scene, cfg)` owns the cover + wave + per-round state machine. `cfg`:
`{ variant: 'wall'|'smoke', distance, countMode, count, countMax, respawnDelay, rng,
getPlayerPos }`.

- **Build cover:** wall variant → a cover wall slab (`WALL_PEEK`); smoke variant → an opaque
  box (`SMOKE`). Provides `colliders()` (wall AABB for the player; empty for smoke) and
  `occluders()` (wall mesh; none for smoke) consumed by `game.js`.
- **Spawn wave:** sample count (`sampleEnemyCount`) and placements
  (`randomTargetPlacements` with bounds derived from `distance` + `PEEK_TARGET`), create a
  `TargetWave`.
- **State machine:**
  - Wall: `live` → (wave `cleared`) `awaitingCover` → (`isBehindCover(getPlayerPos())`) start
    `respawnDelay` → spawn next wave → `live`.
  - Smoke: `covered` (opacity 1, bots hidden behind the box, 3 s) → `fading`
    (`smokePhase` drives opacity) → `live` (clear) → (wave `cleared`) brief delay → next wave
    `covered` again → repeat. Bots are created at wave start and simply hidden by the opaque
    box during `covered`/`fading`.
- **API:** `update(dt, nowSec)`, `getTargets()` (alive bots), `colliders()`, `occluders()`,
  `cleared` / round info for the HUD hint, `dispose()`.

### 8. Composition — `js/game.js`

- Read `trainingMode`. On `hold`: existing spawn/flash/respawn path, `getShootables()` =
  `{ targets: [enemy], occluders: [enemy.peekWall] }`, movement disabled.
- On `wallpeek`/`smoke`: create `PeekMode`, enable movement, push `peekMode.colliders()`
  /bounds to the player, `resetPosition()`. Each frame: `peekMode.update()`;
  `getShootables()` = `{ targets: peekMode.getTargets(), occluders: peekMode.occluders() }`.
- `on.kill(bot)`: `recordKill` (reaction = 0 in peek modes); play kill sound; in peek modes
  let `PeekMode` track wave-cleared.
- `on.shot(info)`: compute feedback by mode — `hold` → `classifyShotTimingByLateral(...)`,
  peek → `classifyStationaryShot(info.hitZone)` — then `hud.showShotFeedback`.
- Switching `trainingMode` in settings rebuilds the active path on the next round (dispose
  the old enemy/flash or `PeekMode`, reset state).

### 9. Settings — `js/settings.js`

- New `trainingMode` select at the top: `Hold angle (รับ peek)` / `Wall peek (เรา peek)` /
  `Smoke (ยืนในควัน)`. Default `hold`.
- Peek modes show: **Enemy count mode** (`fixed`/`random`), **Enemy count / max** (1–5),
  reuse **Distance** and **Respawn delay**. Flash, peek-side, and peek-width rows are hidden.
- New persisted keys: `trainingMode`, `enemyCountMode` (`'fixed'`), `enemyCount` (`3`),
  `enemyCountMax` (`5`). `build()` already rebuilds conditionally — add the mode branch.

### 10. HUD — `js/hud.js` + `index.html`

- Reuse `showShotFeedback` (existing styles cover `perfect`/`good`).
- Add a small centered hint element shown only while a wall-peek wave is `awaitingCover`:
  "เคลียร์แล้ว — ถอยกลับหลังกำบัง". Hidden otherwise.
- Stats unchanged; `Avg reaction` simply stays `0` in peek modes.

## Files touched

- `js/constants.js` — `PEEK_TARGET`, `WALL_PEEK`, `SMOKE`
- `js/logic.js` — `sampleEnemyCount`, `randomTargetPlacements`, `classifyStationaryShot`,
  `isBehindCover`, `smokePhase`
- `js/bot.js` — NEW shared bot geometry
- `js/enemy.js` — use `bot.js`; move EHP/`applyDamage` into `Enemy`; tag hitboxes with
  `userData.bot`; expose `peekWall` as an occluder
- `js/targets.js` — NEW `StationaryBot` + `TargetWave`
- `js/peekmode.js` — NEW cover (wall/smoke) + wave round flow
- `js/weapon.js` — shootable-set + occluders; per-target damage; raw `on.shot` info
- `js/player.js` — WASD movement, collision, bounds, position/reset
- `js/game.js` — mode selection + peek delegation + per-mode feedback + movement wiring
- `js/settings.js` — Training mode select + enemy-count UI + conditional sections
- `js/hud.js` — wall-peek "retreat" hint
- `index.html` — `<script>` for `bot.js`, `targets.js`, `peekmode.js` (correct order); hint div
- `tests/logic.test.js` — tests for the 5 new pure functions
- `tests/constants.test.js` — assert `PEEK_TARGET`/`WALL_PEEK`/`SMOKE` shape
- `README.md` — document the new modes

## Testing

- Unit tests (`node --test`):
  - `sampleEnemyCount` — fixed clamps to `[1,max]`; random returns integers in `[1,max]`
    (seeded rng at boundaries).
  - `randomTargetPlacements` — returns `count` items, all within bounds, all ≥ `minSep`
    apart (seeded rng); requesting a count that cannot fit still returns `count`.
  - `classifyStationaryShot` — head/body/legs/wall/null mapping.
  - `isBehindCover` — inside/outside the pocket on both axes (boundaries).
  - `smokePhase` — covered (`<coverDur`), fading midpoint opacity, clear (`>=coverDur+fadeDur`).
  - `constants.test.js` — `PEEK_TARGET`/`WALL_PEEK`/`SMOKE` exist with the documented fields.
- Manual (browser preview): for each peek variant — verify the wall/smoke fully hides bots
  initially; WASD peek reveals bots (wall) / the smoke fades after 3 s (smoke); shots are
  blocked by the wall but not the smoke; clearing a wave + retreating (wall) / waiting
  (smoke) spawns a re-randomized wave; fixed vs random counts behave; switching modes in
  settings resets cleanly; hold-angle + flash still works unchanged.

## Out of scope

- Bots that shoot back, take cover, or move.
- Any time limit / per-wave clear-time stat (`Avg reaction` stays 0 in peek modes).
- Walk (shift) speed; only run-speed movement.
- Partial-obscure smoke (the smoke fully blocks, then fully clears).
- Reworking hold-angle/flash into the mode abstraction (Approach C) — not now (YAGNI).
