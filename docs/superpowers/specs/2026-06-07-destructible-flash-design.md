# Destructible Flash Training — Eye Blind Orb & Tracking Blind Drone

**Date:** 2026-06-07
**Status:** Approved design, pending implementation plan

## Goal

Add two new, *destructible* flash agents to the existing flash-round system in **Hold
mode**: a stationary nearsight **Eye Blind Orb** (flick-to-destroy) and a moving
**Tracking Blind Drone** (track-and-destroy / lock-on). Both emerge from behind the
corner cover wall, matching the existing flash flight conventions. Unlike the current
three flashes (Breach/Phoenix/Yoru), these can be shot to cancel the blind.

Generic, original visuals and names only — no official VALORANT names, assets, or VFX.

## Scope decisions (locked)

- **Fit existing architecture** — lean vanilla-JS modules, not a 6-class Unity hierarchy.
- **Fixed default difficulty** — single tuned config per flash, no Easy/Normal/Hard/Expert.
- **Hold mode only** — joins the breach/phoenix/yoru flash-round pool; not wired into
  wallpeek/smoke.
- **Generic names in UI and code** — "Eye Blind Orb" / "Tracking Blind Drone".

### Explicitly out of scope (from the source spec)
- 6 separate controller classes (FlashBase/Movement/Detection/BlindEffect/VFX/Stats) →
  one focused module per flash type instead, mirroring `flash.js`.
- 4 difficulty tiers and multi-tier scoring → single default config; success = destroyed
  before the blind triggers, fail = blinded.
- 14-callback event bus → meaningful transitions handled inline via the existing state
  machine and `effects`/`hud` calls.
- Debug visualization overlays (hitbox/cone/LOS/lock-on rings) → omitted; can be added
  later.
- "Break line of sight by moving" and new stat fields (times blinded, etc.) → player is
  stationary in Hold mode; drone is a pure tracking challenge. Reuse existing stats.

## Existing system (reference)

- `js/flash.js` — `Flash(scene, cfg)`: cosmetic projectile that travels from behind the
  corner, winds up, detonates, bursts. Exposes `position`, `windingUp`, `detonated`,
  `done`. **Not destructible.** Blind strength comes from the view-angle at detonation.
- `js/game.js` — composition root + state machine (`waiting`/`active`/`flashing`/`dead`).
  `startRound()` rolls a flash round via `shouldFlashRound` + `pickFlashAgent`;
  `startFlashRound()` spawns the enemy hidden behind cover, plays the flash, and on
  detonation calls `handleDetonation()` (computes `blindFactor` from view angle, calls
  `hud.triggerBlind`, queues the enemy peek at `enemyPeekAt`).
- `js/weapon.js` — hitscan raycast against a target set + occluders. Each target exposes
  `{ hitboxes, alive, applyDamage(zone)->killed, updateMatrixWorld }`; each hitbox carries
  `userData.bot` (the target api) and `userData.zone`. Callbacks: `on.shot(info)`,
  `on.hit(zone,isHead)`, `on.kill(bot)`.
- `js/hud.js` — `triggerBlind(duration, tint)` + `updateBlind(dt)` drive a full-screen
  white overlay (`#flash-overlay`) via the pure `flashOverlayOpacity`.
- `js/logic.js` — pure, tested helpers: `pickFlashAgent`, `shouldFlashRound`,
  `blindFactor`, `blindDuration`, `flashOverlayOpacity`, etc.
- `js/enemy.js` — corner geometry: `innerEdge = side * 1.0`, cover wall at `wallZ = z + 2`
  where `z = -distance`.

## Design

### 1. Constants (`VALO.FLASH` additions, `js/constants.js`)

Two new agent entries plus nearsight tuning. HP is measured in **bullet hits**, not EHP.

```js
eyeorb: {
  type: 'destructible', effect: 'nearsight',
  color: 0xff5fae,        // abstract magenta-pink glow (NOT an eye)
  flight: 'emerge',       // emerges from the wall, floats ~1.5 m forward, stops + hovers
  travel: 0.25,           // s — spawn travel to resting position
  windup: 0.45,           // s — active -> full-effect arm delay (fair reaction window)
  destroyHits: 2,         // bullets to destroy
  blind: 1.6,             // s — max nearsight duration (looking straight at it)
},
trackdrone: {
  type: 'destructible', effect: 'overlay',
  color: 0x66e0a0,        // abstract green glow (NOT a creature)
  flight: 'scan',         // launches from the wall, crosses view laterally while scanning
  flightTime: 1.4,        // s — active flight duration before expire
  scanStartDelay: 0.2,    // s — after launch before scanning begins
  lockOnTime: 0.4,        // s — player must stay locked this long before it fires
  destroyHits: 2,
  blind: 1.5,             // s — strong overlay blind on a successful hit
  scanRange: 26,          // m
  scanConeDeg: 60,        // total cone angle for detection
},
nearsight: { maxBlur: 6, vignetteStrength: 0.85 }, // CSS effect tuning
```

`blindFullDeg`/`blindZeroDeg`/`rampUp`/`enemyPeekDelay` are reused as-is.

### 2. Pure logic (`js/logic.js`) + tests (`tests/logic.test.js`)

New dependency-free helpers (each unit-tested):

- `nearsightIntensity(elapsed, armDelay, blindDur, fadeOut)` → `0..1`. Ramps up after the
  arm delay, holds, then fades over `fadeOut`. Drives vignette + blur strength.
- `lockOnProgress(elapsedInCone, lockTime)` → `0..1` (clamped). Lock completes at `1`.
- `inScanCone(angleDeg, coneDeg)` → bool (`angleDeg <= coneDeg/2`).
- `flashDestroyedInTime(destroyed, blindStarted)` → bool — success classification
  (destroyed before the blind began).

`pickFlashAgent` is already generic over keys; it just receives the new keys. No change to
`shouldFlashRound`.

### 3. Render modules

#### `js/eyeorb.js` — `EyeOrb(scene, cfg)`
`cfg: { color, travel, windup, destroyHits, side, distance }`

- Geometry: starts behind the corner (inside the wall, `wallZ = -distance + 2`,
  `innerEdge = side * 1.0`), travels ~1.5 m to the player side, stops, hovers (subtle bob).
- Animation states: **spawn** (scale 0→1 + glow fade-in) → **active** (slow rotate, brightness
  pulse, faint ring showing blind radius) → **warning** (faster pulse approaching the arm) →
  **destroy** (quick shatter + particle fragments) / **expire** (collapse fade).
- HP = `destroyHits`; `applyDamage(zone)` subtracts 1 per hit regardless of zone.
- Shootable interface: `{ hitboxes:[orbMesh], alive, applyDamage, updateMatrixWorld }` with
  `isFlash:true`; the hitbox sets `userData.bot = api`, `userData.zone = 'core'`.
- Getters: `position` (current orb position, for the view-angle blind), `armed`
  (windup elapsed while active and not destroyed), `shouldBlind` (= `armed`),
  `blindKind` (`'nearsight'`), `destroyed`, `done`.

#### `js/trackdrone.js` — `TrackDrone(scene, cfg)`
`cfg: { color, flightTime, scanStartDelay, lockOnTime, scanRange, scanConeDeg, destroyHits, side, distance, getPlayerPos, getCamForward }`

- Geometry: launches from behind the corner and flies a lateral/arc path across the view
  (so the player must track it). Bobs while flying; slows on lock-on.
- Animation states: **launch** → **flight** (bob + visible scan glow/cone) → **lockOn**
  (charge glow, slowdown) → **fire** (pulse projectile toward the player) →
  **destroy** / **expire**.
- Detection (per frame): once emerged past the corner (LOS to player clear, mirroring
  `enemy.js` visibility), check distance ≤ `scanRange` and player within the scan cone
  (`inScanCone`). Accumulate `lockOnProgress`; if the player leaves the cone the timer
  resets. When lock completes → **fire**.
- HP/shootable interface identical to EyeOrb (`isFlash:true`, `userData.zone = 'core'`).
- Getters: `position`, `fired` (lock completed and not destroyed first),
  `shouldBlind` (= `fired`), `blindKind` (`'overlay'`), `destroyed`, `done`.

> Note: `flash.js` gains `get shouldBlind()` (= `detonated`) and `blindKind` (`'overlay'`)
> so `game.js` drives all flash types through one code path.

### 4. `game.js` wiring

- `startRound()`: build the `enabled` list including `'eyeorb'`/`'trackdrone'` from the new
  settings flags, then `pickFlashAgent` as today.
- `startFlashRound(enabled)`: branch on `flashAgent.type`. For `'destructible'`, call a
  factory that constructs `EyeOrb` or `TrackDrone` (passing `getPlayerPos`/`getCamForward`
  for the drone). The enemy is still spawned hidden behind cover and held (`state =
  'flashing'`) exactly as now.
- `getShootables()` (hold branch): return
  `targets: [enemy, activeFlash].filter(t => t && t.alive)` with the enemy first
  (so `primary` stays the enemy and peek feedback is unaffected), occluders unchanged.
- `weapon.js`: add `info.hitFlash = !!(bot && bot.isFlash)` to the `on.shot` payload
  (one-line change).
- `on.shot`: if `info.hitFlash`, show a hitmarker and skip peek-timing feedback.
- `on.kill(bot)`: if `bot.isFlash` → destroy the flash (cancel any pending blind, dispose,
  mark success); do **not** `recordKill`, do **not** touch enemy state. (`on.hit` already
  runs `recordHit`, so flash hits count toward accuracy.)
- Blind handling unified: each frame, if a flash exists and `flash.shouldBlind` and the
  blind hasn't been handled:
  - `blindKind === 'nearsight'` → compute `blindFactor` from the view angle to
    `flash.position` (as in `handleDetonation`), call `hud.triggerNearsight(...)`.
  - `blindKind === 'overlay'` → call `hud.triggerBlind(...)` (drone hit; full strength,
    color-tinted). The existing three agents keep this path.
  - Then queue the enemy peek at `enemyPeekAt` (unchanged).
  - If the flash is destroyed before `shouldBlind`, no blind fires and the held enemy is
    released to peek normally.

### 5. HUD / CSS — nearsight effect

- New overlay element `#nearsight-overlay` in `index.html`, styled with a radial-gradient
  vignette (transparent center → dark edges) and `backdrop-filter: blur(var)` so near/center
  objects stay readable while far/peripheral vision is obscured. Never a full white screen.
- `hud.js`: add `triggerNearsight(duration, factor, tint)` and `updateNearsight(dt)` that
  drive the overlay's opacity/blur via `nearsightIntensity`.
- The drone reuses the existing `#flash-overlay` white/colored blind (`triggerBlind`).

### 6. VFX / sound

- Reuse `effects.js` (`playFlashWindup`, `playFlashPop`) for the orb arm and drone fire.
- Particle burst on destroy and the drone fire-pulse live inside their own modules (own +
  dispose their THREE objects), mirroring the `burst` mesh pattern in `flash.js`.
- Add a small hitmarker on shooting a flash (HUD).

### 7. Settings UI (`js/settings.js`)

In the Hold-mode flash section add two checkboxes:

- `flashEyeOrb` → "Flash: Eye Blind Orb (ยิงทำลาย, nearsight)"
- `flashTrackDrone` → "Flash: Tracking Blind Drone (เคลื่อนที่, lock-on)"

Both default `false`. They feed the `startRound()` enabled list and respect the existing
`flashChance` / `flashSound` controls.

## Testing

- Unit tests in `tests/logic.test.js` for `nearsightIntensity`, `lockOnProgress`,
  `inScanCone`, `flashDestroyedInTime`.
- Render modules (`eyeorb.js`, `trackdrone.js`) are untested, consistent with
  `flash.js`/`enemy.js`.

## Success criteria

- Enabling either flash in Hold mode produces flash rounds where the object emerges from
  behind the wall and is destroyable.
- Destroying the orb before it arms / the drone before it fires cancels the blind
  (success); failing to do so blinds the player (nearsight for the orb, overlay for the
  drone), after which the held enemy peeks.
- Eye Blind Orb feels like a flick-to-destroy stationary threat; Tracking Blind Drone feels
  like a moving track-and-destroy threat.
- Existing flashes and all other modes are unaffected; `logic.test.js` passes.
