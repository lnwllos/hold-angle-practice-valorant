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
  SPAWN_DELAY: { min: 0.2, max: 1.5 }, // seconds, default random-delay range
  TRACER: { life: 1.0, distance: 80 }, // seconds visible, meters for misses
  AIM_FEEDBACK: { perfectHeadHalfWidth: 0.045 }, // meters around head center counted as perfect
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
