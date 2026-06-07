// Tracking Blind Drone: a DESTRUCTIBLE, MOVING flash. Launches from behind the corner and
// crosses the view laterally while scanning. Its scan cone eases from the flight direction
// toward the player; once the player stays inside the cone (in range) for lockOnTime, it
// fires a blind pulse. Generic flying scanner — not a creature. Same shootable interface as
// EyeOrb (isFlash, fixed invisible hitbox; HP counted in bullet hits).
//
// In Hold mode the player is stationary, so detection reduces to: drone visible + in range,
// cone aimed at the player, lock held for lockOnTime. Destroy it before it fires to succeed.
//
// cfg: { color, flightTime, scanStartDelay, lockOnTime, scanRange, scanConeDeg,
//        destroyHits, side, distance, getPlayerPos }
function TrackDrone(scene, cfg) {
  const side = cfg.side;
  const wallZ = -cfg.distance + 2;
  const innerEdge = side * 1.0;

  // Launch from behind the corner, fly laterally inward across the view (player must track it).
  const startPos = new THREE.Vector3(innerEdge + side * 0.6, 1.70, wallZ + 0.2);
  const endPos   = new THREE.Vector3(innerEdge - side * 2.2, 1.70, wallZ + 1.2);
  const flightFwd = new THREE.Vector3(endPos.x - startPos.x, 0, endPos.z - startPos.z).normalize();

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 16),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.95 })
  );
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  body.add(core);
  body.position.copy(startPos);
  scene.add(body);

  // Scan cone visual (thin, semi-transparent). ConeGeometry points +Y; we re-orient it.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.4, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
  );
  cone.visible = false;
  scene.add(cone);

  const light = new THREE.PointLight(cfg.color, 0.6, 10);
  light.position.copy(startPos);
  scene.add(light);

  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 12),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.copy(startPos);
  scene.add(hitbox);

  let hp = cfg.destroyHits;
  let t = 0;
  let prog = 0;       // 0..1 along the flight path (advances slower while locking)
  let coneTime = 0;   // continuous seconds the player has been inside the cone
  let alive = true;
  let destroyed = false;
  let fired = false;
  let firedT = -1;
  let disposed = false;
  let burstT = -1;

  const _toP = new THREE.Vector3();
  const _coneFwd = new THREE.Vector3();
  function lockK() { return lockOnProgress(coneTime, cfg.lockOnTime); }
  function flightTime() { return cfg.flightTime; }

  function update(dt) {
    if (disposed) return;
    t += dt;

    if (destroyed) {
      if (burstT >= 0) {
        burstT += dt;
        const k = Math.min(1, burstT / 0.25);
        body.scale.setScalar(Math.max(0.01, 1 - k));
        body.material.opacity = (1 - k) * 0.95;
        light.intensity = 4 * (1 - k);
        cone.visible = false;
      }
      return;
    }

    // advance along the path; slow down as the lock builds
    const slow = 1 - 0.55 * lockK();           // 1.0 -> 0.45
    if (flightTime() > 0) prog = Math.min(1, prog + (dt / flightTime()) * slow);
    body.position.lerpVectors(startPos, endPos, prog);
    body.position.y = startPos.y + Math.sin(t * 5) * 0.08; // bob
    light.position.copy(body.position);
    hitbox.position.copy(body.position);

    // scanning + detection
    const scanning = t >= cfg.scanStartDelay && !fired;
    let inCone = false;
    if (scanning) {
      const p = cfg.getPlayerPos();
      _toP.set(p.x - body.position.x, 0, p.z - body.position.z);
      const dist = _toP.length();
      if (dist > 1e-6) _toP.divideScalar(dist);
      // ease the cone's aim from the flight direction toward the player over 0.3 s
      const ease = Math.min(1, (t - cfg.scanStartDelay) / 0.3);
      _coneFwd.copy(flightFwd).lerp(_toP, ease);
      if (_coneFwd.lengthSq() > 1e-9) _coneFwd.normalize();
      const cos = Math.max(-1, Math.min(1, _coneFwd.dot(_toP)));
      const angleDeg = (Math.acos(cos) * 180) / Math.PI;
      inCone = dist <= cfg.scanRange && inScanCone(angleDeg, cfg.scanConeDeg);

      cone.visible = true;
      cone.position.copy(body.position).add(_coneFwd.clone().multiplyScalar(0.7));
      cone.lookAt(body.position.x + _coneFwd.x, body.position.y, body.position.z + _coneFwd.z);
      cone.rotateX(Math.PI / 2);
    } else {
      cone.visible = false;
    }
    coneTime = inCone ? coneTime + dt : Math.max(0, coneTime - dt * 2);

    const lk = lockK();
    light.intensity = 0.6 + lk * 2.4;
    core.scale.setScalar(1 + lk * 1.5);

    if (!fired && lk >= 1) { fired = true; firedT = t; }
    // expired without firing -> just drops/dissolves
    if (!fired && t >= flightTime()) destroy();
  }

  function applyDamage(/* zone */) {
    if (!alive) return false;
    hp -= 1;
    if (hp <= 0) { destroy(); return true; }
    return false;
  }

  function destroy() {
    if (!alive) return;
    alive = false;
    destroyed = true;
    burstT = 0;
    cone.visible = false;
  }

  function disposeObj(o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(body); scene.remove(cone); scene.remove(light); scene.remove(hitbox);
    disposeObj(core); disposeObj(body); disposeObj(cone); disposeObj(hitbox);
  }

  const api = {
    update, dispose, applyDamage,
    hitboxes: [hitbox],
    isFlash: true,
    updateMatrixWorld: () => hitbox.updateMatrixWorld(true),
    get position() { return body.position; },
    get alive() { return alive; },
    get shouldBlind() { return alive && fired; },
    get blindKind() { return 'overlay'; },
    get windingUp() { return false; }, // no windup sound: the lock-on glow is the cue
    get destroyed() { return destroyed; },
    get done() { return destroyed ? burstT >= 0.25 : (fired ? t >= firedT + 0.3 : false); },
  };
  hitbox.userData.bot = api;
  hitbox.userData.zone = 'core';
  return api;
}
