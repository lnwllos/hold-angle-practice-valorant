# Valorant Hold-Angle Trainer

A browser FPS for practicing **holding an angle**: stand still, pre-aim a corner, and react to
an enemy swinging out from cover. Damage and physics are referenced to Valorant. No install,
no build step.

## How to run
- **Double-click `index.html`** — works offline (Three.js is vendored locally), **or**
- run **`start.bat`** to serve it at http://localhost:8000.

Click the screen to play (mouse is captured — pointer lock). Press **Esc** to open Settings or
pause. Left-click to shoot (unlimited ammo, no reload).
Every shot plays a Vandal sound, draws a 1-second fading tracer, and gives timing feedback:
too early if the shot passes ahead of the bot, too slow if it passes behind the bot, and
perfect if the shot lands near the head center. Headshots outside the center zone show
almost-early/almost-late based on the leading/trailing half of the head.

## What it models from Valorant
- Enemy peek/swing speed **5.4 m/s** (Vandal/rifle run speed).
- **Vandal**: head **160** → one-shot headshot at any range (no falloff) · body **40** (4 shots
  to kill) · legs **33**. Enemy has **150 EHP** (100 HP + 50 armor).
- Fire rate **9.75 rounds/sec** · horizontal **FOV 103°**.
- The enemy hides behind a corner and only becomes visible once it strafes past the edge.

## Settings (Esc)
- **Distance** player ↔ enemy: Near 8m / Medium 18m / Far 35m.
- **Training mode**: *Hold angle* (react to an enemy peek — the original drill) · *Wall peek*
  (you hide behind a wall and **WASD** out to clear 1–5 stationary bots, then retreat behind
  cover to spawn the next wave) · *Smoke* (you stand behind a smoke that fully blocks for ~3 s
  then fades, revealing 1–5 bots; clear them and the next wave's smoke re-covers).
- **Enemy count** (peek modes): fixed, or random 1–5. Bots stand at random positions in front
  (random left/right and depth, never beyond the set distance) and do not shoot back.
- **Peek mode**: Fixed width, or Random where **wider peeks are rarer**.
- **Peek side**: Left / Right / Random.
- **Spawn delay mode**: fixed respawn delay (default 0.5s) or random delay with min/max.
- **Respawn at full peek**: starts the normal fixed/random respawn delay when the current bot
  reaches its configured peek width.
- **Flash training**: enable **Breach (Flashpoint)**, **Phoenix (Curveball)**, and/or **Yoru
  (Blindside)**. When at least one is on, **Flash frequency** sets the chance a spawn becomes a
  flash round: an agent-colored flash pops at the angle with that agent's real windup and blind
  duration — look away to reduce the blind — and then the enemy peeks. **Flash sound** toggles a
  synthesized windup/pop cue.
- **Reset stats**: button at the top of Settings.
- **Sensitivity**: Valorant sens value + mouse DPI (shows approximate cm/360) + a fine-tune
  multiplier to match your feel. *(Browsers report mouse movement in pixels, not raw DPI
  counts, so cm/360 is approximate — use the fine-tune slider.)*
- **Vandal recoil**: on/off + intensity (off by default; first shot is always accurate).
- **Crosshair**: color, length, gap, thickness, center dot. All settings persist (localStorage).

The HUD tracks **kills, accuracy %, headshot %, average reaction time**, and session time
(reaction time = from when the enemy clears the corner to your killing shot).

## Develop / test
Pure game logic (damage, peek sampling, sensitivity, fire-rate, recoil, stats, FOV) is
unit-tested with Node's built-in runner:

```
node --test tests/constants.test.js tests/logic.test.js
```

## Layout
```
index.html       overlays + ordered <script> tags
three.min.js      Three.js r128 (vendored)
js/constants.js   Valorant reference values + FOV helper   (tested)
js/logic.js       pure game logic                          (tested)
js/scene.js       renderer, FOV-103 camera, environment
js/player.js      pointer lock + mouse look + sensitivity + gated WASD movement
js/effects.js     shot/kill sound effects + fading bullet tracers
js/enemy.js       peeking bot with head/body/legs hitboxes
js/bot.js         shared bot geometry (head/body/legs hitboxes)
js/targets.js     stationary peek-mode bots + wave (each owns its HP)
js/peekmode.js    peek modes: wall/smoke cover + wave state machine
js/flash.js       practice flash: per-agent flight (Breach through-wall / Phoenix curve / Yoru float) + windup + burst
js/weapon.js      Vandal hitscan over a target set; damage, fire-rate, recoil, wall occlusion
js/hud.js         crosshair + stats overlay
js/settings.js    settings panel + persistence
js/game.js        composition root + spawn/hold/respawn state machine
```
