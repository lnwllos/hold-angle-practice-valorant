// Eye Blind Orb: a DESTRUCTIBLE nearsight flash. Emerges from behind the corner wall,
// floats a short distance to the player side, then hovers until shot or armed. Original
// abstract glowing orb — not an eye. Exposes the same shootable interface as a bot
// (hitboxes / alive / applyDamage) tagged isFlash, so weapon.js hits it unchanged.
// HP is counted in bullet HITS (one hit = -1), not EHP.
//
// Geometry mirrors enemy.js / flash.js: wallZ = -distance + 2, innerEdge = side * 1.0.
// cfg: { color, travel, windup, destroyHits, side, distance }
function EyeOrb(scene, cfg) {
  const side = cfg.side;
  const wallZ = -cfg.distance + 2;
  const innerEdge = side * 1.0;

  // Emerge from inside the wall, float toward the player, stop and hover.
  const startPos = new THREE.Vector3(innerEdge - side * 0.2, 1.60, wallZ - 0.1);
  const restPos  = new THREE.Vector3(innerEdge - side * 0.3, 1.55, wallZ + 1.5);
  const travel = cfg.travel;
  const windup = cfg.windup;
  const armAt = travel + windup;       // full effect arms here (if not destroyed)
  const lifetime = armAt + 2.0;        // expire if never destroyed

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 18, 18),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.95 })
  );
  orb.position.copy(startPos);
  orb.scale.setScalar(0.05);
  scene.add(orb);

  // Faint ring = "shoot me now" affordance / blind-radius hint.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.28, 24),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0, side: THREE.DoubleSide })
  );
  ring.position.copy(restPos);
  scene.add(ring);

  const light = new THREE.PointLight(cfg.color, 0, 10);
  light.position.copy(startPos);
  scene.add(light);

  // Fixed, generous, invisible hitbox so the orb is fair to shoot (the visible orb pulses).
  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 12),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.copy(startPos);
  scene.add(hitbox);

  let hp = cfg.destroyHits;
  let t = 0;
  let alive = true;
  let destroyed = false;
  let disposed = false;
  let burstT = -1; // >= 0 while the destroy burst plays

  function update(dt) {
    if (disposed) return;
    t += dt;

    if (destroyed) {
      if (burstT >= 0) {
        burstT += dt;
        const k = Math.min(1, burstT / 0.25);
        orb.scale.setScalar(Math.max(0.01, (1 - k) * 1.2));
        orb.material.opacity = (1 - k) * 0.95;
        light.intensity = 4 * (1 - k);
      }
      return;
    }

    if (t < travel) {
      const k = travel > 0 ? t / travel : 1;
      orb.position.lerpVectors(startPos, restPos, k);
      orb.scale.setScalar(0.05 + k * 0.95);
      orb.material.opacity = 0.3 + k * 0.65;
      light.intensity = 0.4 * k;
    } else {
      // hovering + warning pulse that speeds up as it approaches the arm time
      orb.position.copy(restPos);
      orb.position.y = restPos.y + Math.sin(t * 2.2) * 0.06;
      orb.rotation.y += dt * 1.2;
      const armK = windup > 0 ? Math.min(1, (t - travel) / windup) : 1;
      const pulseSpeed = 4 + armK * 14;
      const pulse = 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(t * pulseSpeed));
      orb.scale.setScalar(pulse);
      orb.material.opacity = 0.92;
      light.intensity = 0.8 + armK * 2.2;
      ring.position.copy(orb.position);
      ring.lookAt(0, orb.position.y, 0);
      ring.material.opacity = 0.25 + armK * 0.35;
    }
    light.position.copy(orb.position);
    hitbox.position.copy(orb.position);
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
    ring.material.opacity = 0;
  }

  function disposeObj(o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(orb); scene.remove(ring); scene.remove(light); scene.remove(hitbox);
    disposeObj(orb); disposeObj(ring); disposeObj(hitbox);
  }

  const api = {
    update, dispose, applyDamage,
    hitboxes: [hitbox],
    isFlash: true,
    updateMatrixWorld: () => hitbox.updateMatrixWorld(true),
    get position() { return orb.position; },
    get alive() { return alive; },
    get shouldBlind() { return alive && t >= armAt; },
    get blindKind() { return 'nearsight'; },
    get destroyed() { return destroyed; },
    get done() { return destroyed ? burstT >= 0.25 : t >= lifetime; },
  };
  hitbox.userData.bot = api;
  hitbox.userData.zone = 'core';
  return api;
}
