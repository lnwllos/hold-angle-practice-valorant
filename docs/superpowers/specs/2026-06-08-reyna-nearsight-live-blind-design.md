# Reyna nearsight: live depth-blind

## Problem

The destructible Reyna flash (`eyeorb`, blindKind `nearsight`) currently fires a
**one-shot, timed** blind the moment it arms: `handleBlind()` samples the view angle
once, computes a fixed duration, and plays a screen-edge vignette overlay that fades
over that duration regardless of where the player looks afterwards.

Two things are wrong for the desired Reyna feel:

1. The blind is a screen-edge **vignette** (clear centre, dark edges) — not a
   **distance-based** darkness. We want: the world goes dark so you can only see at
   close range, getting progressively darker further out.
2. The blind is a **timed one-shot**. We want it to persist **while** the player faces
   the armed orb and it is **not yet destroyed**, and to clear when they look away or
   destroy it.

## Scope

**Only the Reyna `eyeorb` (blindKind `nearsight`) changes.** The thrown projectile
flashes (Breach / Phoenix / Yoru) and the tracking drone keep their existing one-shot
white-overlay blind (`blindKind 'overlay'`, via the unchanged `handleBlind()` path).

## Behaviour

- **Arm event (unchanged trigger):** when the orb first arms (`flash.shouldBlind`
  becomes true) we still release the held enemy (`enemyPeekAt = now + enemyPeekDelay`),
  play the pop sound once, and log a `blind` event. We no longer start a timed blind.
- **Per-frame live blind:** every frame compute a target level for the nearsight:
  - `target = 1` when the orb is **armed** (`shouldBlind`) **and alive**
    (not destroyed) **and** the view direction is within the orb's blind cone (on/off).
  - otherwise `target = 0`.
- **Cone (on/off):** blinded iff the angle between the camera forward and the direction
  to the orb is within `blindConeDeg` (full angle ≈ 110°, i.e. ±55° from the crosshair —
  roughly "the orb is on screen"). No angular intensity scaling.
- **Easing:** the rendered level `nsLevel` moves toward `target` frame-rate-independently —
  **rises fast** (`nsRiseTau ≈ 0.06 s`) when the player faces it, **fades over ~0.2 s**
  (`nsFallTau ≈ 0.2 s`) when they look away or it dies. Looking back while still
  armed+alive snaps it on again.
- The easing runs in `game.js` every frame **independent of whether `flash` still
  exists**, so the fade-out completes after the orb is disposed.

### Edge cases

- Destroyed **before** arming → never blinds (existing success path, unchanged).
- Destroyed / expired **after** arming → `target → 0` → fades over ~0.2 s.
- Look away then back while armed+alive → snaps on again.
- Non-hold modes / no flash → `target = 0` → base fog (no darkness).

## Visuals

### Depth darkness — `scene.js`

Add `setNearsight(k)` (`k` clamped 0..1). Lerp the existing `scene.fog` and
`scene.background` between:

- base: `near 45`, `far 95`, colour `0x20242c` (current values), and
- blinded: `near ≈ 3`, `far ≈ 8`, colour `≈ 0x06060a` (near-black).

At `k = 1` everything past ~3 m fades and is ~black by ~8 m; close range stays visible.
At `k = 0` the scene is exactly the normal range. Called every frame with `nsLevel`.

### Orb stays visible — `eyeorb.js`

The orb must remain visible through the darkness so the player can still see/track and
shoot it. Set `material.fog = false` on the orb and ring `MeshBasicMaterial`s (pass
`fog: false` at construction). The `PointLight` is not fogged. Result under nearsight:
world / enemy / walls darken by distance, but the Reyna orb still glows clearly.
(Only `eyeorb` — the dark fog never co-occurs with the drone or thrown flashes.)

### Screen cue — `hud.js` + `index.html`

Replace the timed `triggerNearsight` / `updateNearsight` with a live
`setNearsight(level, tint)`. Change `#nearsight-overlay` from the edge vignette to a
**faint uniform tint** (agent colour) at low alpha scaling with `level`, plus a small
blur (≤ ~2 px). Subtle — the depth fog does the heavy lifting and close range stays
readable.

## Pure helpers — `logic.js` (+ tests)

- `nearsightConeActive(angleDeg, coneDeg)` → boolean; true when `angleDeg <= coneDeg / 2`
  (on/off cone test). Unit-tested.
- `approach(current, target, dt, riseTau, fallTau)` → next eased value; uses `riseTau`
  when moving up, `fallTau` when moving down; clamps so it never overshoots `target`.
  Unit-tested (rises faster than it falls; reaches target; handles dt = 0).
- Remove `nearsightIntensity` (the old timed model) and its test — nothing else uses it
  once `updateNearsight` is replaced. `blindFactor` / `blindDuration` remain (still used
  by the thrown-flash `handleBlind` path).

## Constants — `constants.js`

Add under `FLASH`:

- `blindConeDeg` ≈ 110 (full cone angle for the on/off facing test)
- `nearsightNear` ≈ 3, `nearsightFar` ≈ 8, `nearsightColor` `0x06060a`
- `nsRiseTau` ≈ 0.06, `nsFallTau` ≈ 0.2

`eyeorb.blind` (1.6) is no longer used by the nearsight model (the orb's `lifetime`
caps how long a facing-blind can last). Left in place as harmless; not relied upon.

## Recorder

The `blind` event is logged at **arm time** with `{ agent, kind: 'nearsight' }` (no
`durationS` / `factor` — there is no single duration any more). The thrown-flash path
keeps its existing `blind` log unchanged.

## Testing & verification

- Unit tests for `nearsightConeActive` and `approach`; run the full `node --test` suite.
- Load the preview; drive `three.setNearsight(0)` vs `setNearsight(1)` via eval and
  screenshot to confirm depth-based darkness with the orb still visible; confirm the
  console is clean.
