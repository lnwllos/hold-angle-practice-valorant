// Valorant reference constants. Pure data + a FOV math helper.
// Works as a browser global (classic script) and as a Node module (tests).

const VALO = {
  RUN_SPEED: 5.4,         // m/s — Vandal/rifle run speed (enemy peek/swing speed)
  FIRE_RATE: 9.75,        // rounds/sec — Vandal
  FOV_H: 103,             // degrees — Valorant horizontal FOV (locked)
  YAW_CONST: 0.07,        // degrees of view rotation per mouse count per 1.0 sensitivity
  VANDAL: { head: 160, body: 40, legs: 33 },   // damage, no range falloff
  ENEMY: { hp: 100, armor: 50 },               // 150 EHP -> body kills in 4 (40*4=160)
  DISTANCE: { near: 8, medium: 18, far: 35 },  // meters, player <-> enemy
  PEEK: { min: 0.3, max: 2.5 },                // meters past the wall edge (shoulder..wide)
  RESPAWN_DELAY: 0.5,     // seconds after a kill before the next enemy
  SPAWN_DELAY: { min: 0.2, max: 1.5 }, // seconds, default random-delay range
  TRACER: { life: 1.0, distance: 80 }, // seconds visible, meters for misses
  AIM_FEEDBACK: { perfectHeadHalfWidth: 0.045 }, // meters around head center counted as perfect
  // Flash abilities (current-patch approximations; tunable). windup = charge time before
  // the pop; blind = max blind seconds when looking straight at it; color = orb/burst tint.
  // flight = per-agent travel style (see flash.js): 'wall' Breach charges through the wall,
  // 'curve' Phoenix curves around the corner, 'float' Yoru floats out from the wall.
  // travel = flight duration (s) for wall/curve; speed = float speed (m/s, Valorant approx).
  FLASH: {
    breach:  { windup: 0.5, blind: 2.0,  color: 0xfff2b0, flight: 'wall',  travel: 0.12 }, // Flashpoint — yellow-white, through-wall at a random spot near the corner
    phoenix: { windup: 0.6, blind: 1.3,  color: 0xffb060, flight: 'curve', travel: 0.22 }, // Curveball  — orange, fast curve around the corner
    yoru:    { windup: 0.6, blind: 1.75, color: 0xbcd6ff, flight: 'float', speed: 6.0 },    // Blindside  — blue, floats out from the wall (speed ≈ m/s, exact not published)
    enemyPeekDelay: 0.15, // s — after detonation before the enemy starts peeking
    blindFullDeg: 35,     // angle(view, flash) <= this -> full blind
    blindZeroDeg: 100,    // angle(view, flash) >= this -> no blind
    rampUp: 0.05,         // s — white overlay rises to full this fast
  },
  PEEK_TARGET: {
    count: { min: 1, max: 5 },
    spreadXFactor: 0.3, spreadXMin: 2.5, spreadXMax: 7, // half-width of bot X spread vs distance
    depthSpreadFactor: 0.4, depthSpreadMax: 6,          // how much NEARER than `distance` bots may stand
    minSeparation: 1.2,                                  // m between bots (no overlap)
  },
  WALL_PEEK: {
    wallZ: -2.5, wallW: 3, wallH: 3, wallThickness: 0.5, // cover wall in front of the player
    behindCoverHalfWidth: 0.6, behindCoverZ: -0.5,        // "safe pocket" that arms the next wave
    bounds: { x: 4, zFront: -1.5, zBack: 1.5 },           // player movement clamp
  },
  SMOKE: {
    coverDuration: 3.0, fadeDuration: 0.6,               // s — block, then fade and stay clear
    z: -3, w: 10, h: 7, color: 0xc9ced6,                 // opaque box that fills the view toward bots
    bounds: { x: 3, zFront: -0.5, zBack: 1.5 },
  },
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
