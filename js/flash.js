// A practice flash: an agent-colored orb emerges from behind the corner, flies into view,
// winds up, then bursts. Mirrors enemy.js — owns its THREE objects and disposes them.
//
// Geometry reuses the enemy's corner: innerEdge = side*1.0, cover wall at z = -distance + 2.
// Timeline from creation: travel -> windup -> detonate -> burst fade -> done. The
// Valorant-accurate piece is `windup`; `travel` is our added flight animation. The caller
// reads `position` at detonation to compute the blind from the player's view angle.
//
// cfg: { color, windup, travel, side, distance }   side = -1 (left) or +1 (right)
function Flash(scene, cfg) {
  const side = cfg.side;
  const wallZ = -cfg.distance + 2;
  const innerEdge = side * 1.0;
  const eyeY = 1.5;

  const startPos = new THREE.Vector3(innerEdge + side * 0.8, eyeY, wallZ); // behind corner (occluded)
  const detPos = new THREE.Vector3(innerEdge - side * 0.3, eyeY, wallZ);   // past corner, in view

  const travel = cfg.travel;
  const windup = cfg.windup;
  const detonateAt = travel + windup;
  const burstDur = 0.3;
  const burstEnd = detonateAt + burstDur;

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 16),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.95 })
  );
  orb.position.copy(startPos);
  scene.add(orb);

  const light = new THREE.PointLight(cfg.color, 0, 14);
  light.position.copy(startPos);
  scene.add(light);

  const burst = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
  );
  burst.position.copy(detPos);
  burst.visible = false;
  scene.add(burst);

  let t = 0;
  let disposed = false;

  function update(dt) {
    if (disposed) return;
    t += dt;
    if (t < travel) {
      const k = travel > 0 ? t / travel : 1;
      orb.position.lerpVectors(startPos, detPos, k);
      light.position.copy(orb.position);
      light.intensity = 0.5 * k;
    } else if (t < detonateAt) {
      const k = windup > 0 ? (t - travel) / windup : 1;
      orb.position.copy(detPos);
      orb.scale.setScalar(1 + k * 1.5);
      light.position.copy(detPos);
      light.intensity = 0.5 + k * 2.5;
    } else if (t < burstEnd) {
      const k = burstDur > 0 ? (t - detonateAt) / burstDur : 1;
      orb.visible = false;
      burst.visible = true;
      burst.scale.setScalar(1 + k * 8);
      burst.material.opacity = (1 - k) * 0.9;
      light.position.copy(detPos);
      light.intensity = 6 * (1 - k);
    } else {
      burst.visible = false;
      light.intensity = 0;
    }
  }

  function disposeObj(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(orb);
    scene.remove(light);
    scene.remove(burst);
    disposeObj(orb);
    disposeObj(burst);
  }

  return {
    update,
    dispose,
    position: detPos,
    get windingUp() { return t >= travel && t < detonateAt; },
    get detonated() { return t >= detonateAt; },
    get done() { return t >= burstEnd; },
  };
}
