// Vandal: hitscan from crosshair center on click/hold, gated to the real fire rate.
// Fires at a SET of targets (each owns its own HP via applyDamage) plus a set of occluder
// meshes (cover walls) that block shots. Reports raw raycast info to game.js, which decides
// the per-mode feedback. No HP/EHP lives here anymore.
//
// deps: { camera, player, effects, getShootables, getSettings, on }
//   getShootables() -> { targets: [bot,...], occluders: [mesh,...] }
//                      each bot: { hitboxes, alive, x, z, movementDir, fullPeeked, visible,
//                                  applyDamage(zone)->killed, updateMatrixWorld() }
//   getSettings()   -> { recoilOn, recoilIntensity }
//   on              -> { shot(info), hit(zone, isHead), kill(bot) }
function Weapon(deps) {
  const ray = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const interval = fireInterval(VALO.FIRE_RATE);

  let firing = false;
  let lastShot = -Infinity;
  let burstIndex = 0;     // shots since fire started (for recoil)

  function onDown(e) { if (e.button === 0 && document.pointerLockElement) firing = true; }
  function onUp(e) { if (e.button === 0) { firing = false; burstIndex = 0; } }
  document.addEventListener('mousedown', onDown);
  document.addEventListener('mouseup', onUp);

  function update(dt, nowSec) {
    if (!firing) return;
    if (!canFire(lastShot, nowSec, interval)) return;
    lastShot = nowSec;
    fireOne();
  }

  function fireOne() {
    const s = deps.getSettings();
    const shotBurstIndex = burstIndex + 1;
    let recoil = { yaw: 0, pitch: 0 };
    if (s.recoilOn) {
      recoil = recoilOffset(burstIndex, s.recoilIntensity);
      deps.player.addKick(recoil.yaw, recoil.pitch);
    }
    burstIndex += 1;

    const { targets, occluders } = deps.getShootables();
    const alive = targets.filter(t => t.alive);
    // Primary = the enemy bot for miss-side feedback. Never a destructible flash: those expose
    // only a single hitbox, and targetInfo reads the bot's head at hitboxes[2]. If the enemy is
    // already dead but a flash is still alive, primary is null (no enemy aim context).
    const primary = pickPrimaryTarget(alive);

    ray.setFromCamera(center, deps.camera);

    const meshes = [];
    alive.forEach(t => { if (t.updateMatrixWorld) t.updateMatrixWorld(); t.hitboxes.forEach(h => meshes.push(h)); });
    occluders.forEach(o => meshes.push(o));

    const hits = ray.intersectObjects(meshes, false);
    const nearest = hits[0];
    const blockedByWall = !!(nearest && !nearest.object.userData.bot);

    // aimX defaults to where the ray would cross the primary target's depth (miss-side calc).
    let aimX = primary ? rayXAtZ(ray.ray, primary.z) : NaN;
    let hitZone = null;
    let bot = null;

    if (nearest) {
      const owner = nearest.object.userData.bot;
      const zone = nearest.object.userData.zone;
      if (owner && zone) { bot = owner; hitZone = zone; aimX = nearest.point.x; }
      // else: nearest is an occluder (cover wall) -> blocked shot, treated as a miss.
    }

    deps.on.shot({
      hitZone,
      isHead: hitZone === 'head',
      hitFlash: !!(bot && bot.isFlash),
      target: primary,
      hitTarget: bot,
      burstIndex: shotBurstIndex,
      recoilYawDeg: recoil.yaw,
      recoilPitchDeg: recoil.pitch,
      blockedByWall,
      aimX,
      botX: primary ? primary.x : NaN,
      movementDir: primary ? primary.movementDir : 0,
      fullPeeked: primary ? primary.fullPeeked : false,
      visible: primary ? primary.visible : false,
    });

    if (deps.effects) { deps.effects.playShot(); deps.effects.addTracer(ray.ray, nearest ? nearest.point : null); }

    if (bot && hitZone) {
      deps.on.hit(hitZone, hitZone === 'head', bot);
      const killed = bot.applyDamage(hitZone);
      if (killed) deps.on.kill(bot);
    }
  }

  function rayXAtZ(rayObj, z) {
    if (!rayObj || Math.abs(rayObj.direction.z) < 1e-6) return NaN;
    const t = (z - rayObj.origin.z) / rayObj.direction.z;
    if (t <= 0) return NaN;
    return rayObj.origin.x + rayObj.direction.x * t;
  }

  return { update, isFiring: () => firing };
}
