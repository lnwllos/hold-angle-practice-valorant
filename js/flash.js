// A practice flash: an agent-colored projectile reaches the angle, winds up, then bursts.
// Each agent has its own flight style, but all share the windup -> detonate -> burst timeline
// and expose the detonation `position` so the caller can compute the blind from the player's
// view angle. The Valorant-accurate pieces are `windup` and the blind; the flight is cosmetic.
//
// Mirrors enemy.js — owns its THREE objects and disposes them. Geometry reuses the enemy's
// corner: innerEdge = side*1.0, cover wall at z = -distance + 2.
//
// cfg: { color, windup, side, distance, flight, travel, speed }
//   flight 'wall'  (Breach)  : emerges through the wall at a random spot near the corner; travel = duration
//   flight 'curve' (Phoenix) : curves ~90deg around the corner into view (quadratic Bezier); travel = duration
//   flight 'float' (Yoru)    : floats out from the wall toward the player at `speed` m/s (travel = distance/speed)
function Flash(scene, cfg) {
  const side = cfg.side;
  const wallZ = -cfg.distance + 2;
  const innerEdge = side * 1.0;

  // Per-agent flight geometry: startPos, optional Bezier control point, detPos, travel time.
  let startPos, ctrlPos = null, detPos, travel;
  if (cfg.flight === 'wall') {
    // Breach: a random spot near the corner, inside the wall, that punches out to the player side.
    const rx = innerEdge + side * (Math.random() * 0.8 - 0.3); // clustered around the corner
    const ry = 1.2 + Math.random() * 0.7;                      // chest..head height
    startPos = new THREE.Vector3(rx, ry, wallZ - 0.1);         // inside the wall
    detPos   = new THREE.Vector3(rx, ry, wallZ + 0.3);         // emerged, player side
    travel = cfg.travel;
  } else if (cfg.flight === 'curve') {
    // Phoenix: starts hidden behind the corner and curves around it into view.
    startPos = new THREE.Vector3(innerEdge + side * 1.0, 1.6, wallZ - 0.6); // behind cover (occluded)
    ctrlPos  = new THREE.Vector3(innerEdge + side * 0.4, 1.6, wallZ + 0.2); // bend point at the corner
    detPos   = new THREE.Vector3(innerEdge - side * 0.4, 1.5, wallZ + 0.3); // in view, past the corner
    travel = cfg.travel;
  } else { // 'float' (Yoru)
    // Yoru: appears at the corner/wall and floats toward the player; travel = distance / speed.
    startPos = new THREE.Vector3(innerEdge - side * 0.2, 1.7, wallZ);
    detPos   = new THREE.Vector3(innerEdge - side * 0.3, 1.4, wallZ + 1.8); // ends closer to the player
    const dist = startPos.distanceTo(detPos);
    travel = cfg.speed > 0 ? dist / cfg.speed : 0.3;
  }

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

  // Quadratic Bezier (start -> ctrl -> det) for the curved flight.
  const _v = new THREE.Vector3();
  function curveAt(k) {
    const a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
    return _v.set(
      a * startPos.x + b * ctrlPos.x + c * detPos.x,
      a * startPos.y + b * ctrlPos.y + c * detPos.y,
      a * startPos.z + b * ctrlPos.z + c * detPos.z
    );
  }

  let t = 0;
  let disposed = false;

  function update(dt) {
    if (disposed) return;
    t += dt;
    if (t < travel) {
      const k = travel > 0 ? t / travel : 1;
      if (cfg.flight === 'curve') {
        orb.position.copy(curveAt(k));
      } else if (cfg.flight === 'float') {
        orb.position.lerpVectors(startPos, detPos, k);
        orb.position.y += Math.sin(k * Math.PI) * 0.25; // subtle single bounce/bob while floating
      } else { // wall
        orb.position.lerpVectors(startPos, detPos, k);
      }
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
