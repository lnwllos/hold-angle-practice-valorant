// Vandal: hitscan from crosshair center on click/hold, gated to the real fire rate.
// Resolves damage by hit zone, applies it to the current enemy's EHP, applies recoil to
// the player view. Reports events to callbacks so game.js can update stats/state.
//
// deps: { camera, player, effects, getEnemy, getSettings, getReactionMs, on }
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
    if (!firing) return;
    if (!canFire(lastShot, nowSec, interval)) return;
    lastShot = nowSec;
    fireOne(en);
  }

  function fireOne(en) {
    const reactionMs = deps.getReactionMs ? deps.getReactionMs() : null;
    const timing = classifyShotTiming(reactionMs, VALO.SHOT_TIMING.fastMs, VALO.SHOT_TIMING.slowMs);
    deps.on.shot({ timing, reactionMs });

    // recoil kick: first shot (index 0) has no offset; later shots climb/sway
    const s = deps.getSettings();
    if (s.recoilOn) {
      const r = recoilOffset(burstIndex, s.recoilIntensity);
      deps.player.addKick(r.yaw, r.pitch);
    }
    burstIndex += 1;

    ray.setFromCamera(center, deps.camera);
    if (!en || !en.alive || !en.visible) {
      if (deps.effects) { deps.effects.playShot(); deps.effects.addTracer(ray.ray, null); }
      return;
    }
    if (en.updateMatrixWorld) en.updateMatrixWorld();
    const hits = ray.intersectObjects(en.hitboxes, false);
    if (deps.effects) { deps.effects.playShot(); deps.effects.addTracer(ray.ray, hits[0] && hits[0].point); }
    if (hits.length === 0) return;
    const zone = hits[0].object.userData.zone;
    const isHead = zone === 'head';
    deps.on.hit(zone, isHead);
    ehp = applyDamage(ehp, damageForZone(zone, VALO.VANDAL));
    if (ehp <= 0) { en.kill(); deps.on.kill(); }
  }

  return { update };
}
