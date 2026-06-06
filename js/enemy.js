// A practice bot plus the corner wall it peeks from.
//
// Geometry: the player stands at the origin looking down -Z. The enemy lives at depth
// z = -distance. A tall cover wall sits 2 m IN FRONT of the enemy (closer to the player) and
// covers the outer side from a corner edge outward — so the camera cannot see the enemy until
// it strafes inward past that corner. Movement is at Valorant run speed; once at the target
// peek width it stops and holds until killed.
//
// cfg: { distance, peekWidth, side }   side = -1 (left) or +1 (right).
function Enemy(scene, cfg) {
  const side = cfg.side;
  const dist = cfg.distance;
  const z = -dist;
  const wallZ = z + 2;            // cover wall 2 m toward the player from the enemy
  const innerEdge = side * 1.0;   // x of the wall's inner (corner) edge

  // Cover wall: a tall slab covering the outer side, inner edge at innerEdge, extending outward.
  const wallW = 8;
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(wallW, 8, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x4a5160 })
  );
  wall.position.set(innerEdge + side * (wallW / 2), 4, wallZ);
  scene.add(wall);

  // Bot body parts (rough Valorant agent proportions, meters).
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc94f4f });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xe0a64f });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.35), mat);
  legs.position.y = 0.45;
  legs.userData.zone = 'legs';

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.35), mat);
  body.position.y = 1.25;
  body.userData.zone = 'body';

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), headMat);
  head.position.y = 1.8;
  head.userData.zone = 'head';

  group.add(legs, body, head);
  scene.add(group);
  const hitboxes = [legs, body, head];

  // Lateral motion at the enemy's depth: hidden behind the wall (outer side), emerge inward.
  const hiddenX = innerEdge + side * 1.2;            // behind the wall (occluded)
  const targetX = innerEdge - side * cfg.peekWidth;  // emerged inward past the corner
  let x = hiddenX;
  group.position.set(x, 0, z);

  // The enemy clears the corner when, seen from the camera at the origin, it passes the wall
  // edge. Project the corner (innerEdge, wallZ) to the enemy's depth z:
  //   edgeAtEnemy = innerEdge * dist / (dist - 2)
  // Visible once the enemy is inward (toward center) of that line.
  const edgeAtEnemy = innerEdge * (dist / (dist - 2));
  let visible = false;
  let alive = true;

  function update(dt) {
    if (!alive) return;
    const dir = Math.sign(targetX - x);
    if (dir !== 0) {
      x += dir * VALO.RUN_SPEED * dt;
      if ((dir > 0 && x > targetX) || (dir < 0 && x < targetX)) x = targetX; // stop at target
      group.position.x = x;
    }
    // side=-1: visible when x > edgeAtEnemy; side=+1: when x < edgeAtEnemy
    if (!visible && side * (x - edgeAtEnemy) < 0) visible = true;
  }

  function kill() { alive = false; scene.remove(group); }
  function dispose() { scene.remove(group); scene.remove(wall); }

  return {
    update, kill, dispose,
    hitboxes,
    get visible() { return visible; },
    get alive() { return alive; },
  };
}
