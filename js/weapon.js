// Vandal: hitscan from crosshair center on click/hold, gated to the real fire rate.
// Resolves damage by hit zone, applies it to the current enemy's EHP, applies recoil to
// the player view. Reports events to callbacks so game.js can update stats/state.
//
// deps: { camera, player, effects, getEnemy, getSettings, on }
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
    // recoil kick: first shot (index 0) has no offset; later shots climb/sway
    const s = deps.getSettings();
    if (s.recoilOn) {
      const r = recoilOffset(burstIndex, s.recoilIntensity);
      deps.player.addKick(r.yaw, r.pitch);
    }
    burstIndex += 1;

    ray.setFromCamera(center, deps.camera);
    let hits = [];
    let aimX = en ? rayXAtZ(ray.ray, en.z) : NaN;
    let timing = 'fast';

    if (!en || !en.alive || !en.visible) {
      timing = classifyShotTimingByLateral(false, null, aimX, en ? en.x : NaN, en ? en.movementDir : 0, false);
      deps.on.shot({ timing });
      if (deps.effects) { deps.effects.playShot(); deps.effects.addTracer(ray.ray, null); }
      return;
    }

    if (en.updateMatrixWorld) en.updateMatrixWorld();
    hits = ray.intersectObjects(en.hitboxes, false);
    const hit = hits[0];
    if (hit) aimX = hit.point.x;
    timing = classifyShotTimingByLateral(
      true,
      hit && hit.object.userData.zone,
      aimX,
      en.x,
      en.movementDir,
      en.fullPeeked
    );
    deps.on.shot({ timing });

    if (deps.effects) { deps.effects.playShot(); deps.effects.addTracer(ray.ray, hits[0] && hits[0].point); }
    if (hits.length === 0) return;
    const zone = hits[0].object.userData.zone;
    const isHead = zone === 'head';
    deps.on.hit(zone, isHead);
    ehp = applyDamage(ehp, damageForZone(zone, VALO.VANDAL));
    if (ehp <= 0) { en.kill(); deps.on.kill(); }
  }

  function rayXAtZ(rayObj, z) {
    if (!rayObj || Math.abs(rayObj.direction.z) < 1e-6) return NaN;
    const t = (z - rayObj.origin.z) / rayObj.direction.z;
    if (t <= 0) return NaN;
    return rayObj.origin.x + rayObj.direction.x * t;
  }

  return { update };
}
