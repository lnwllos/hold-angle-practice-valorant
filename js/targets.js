// Stationary peek-mode targets: a wave of bots that stand still and own their own HP.
// StationaryBot mirrors the shootable shape Weapon expects (see weapon.js deps).
function StationaryBot(scene, pos) {
  const { group, hitboxes } = makeBotParts();
  group.position.set(pos.x, 0, pos.z);
  scene.add(group);

  let ehp = VALO.ENEMY.hp + VALO.ENEMY.armor;
  let alive = true;
  let disposed = false;

  function applyDamage(zone) {
    if (!alive) return false;
    ehp -= damageForZone(zone, VALO.VANDAL);
    if (ehp <= 0) { kill(); return true; }
    return false;
  }
  function kill() { if (!alive) return; alive = false; scene.remove(group); }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(group);
    group.traverse(disposeBotObject);
  }

  const api = {
    applyDamage, kill, dispose,
    hitboxes,
    updateMatrixWorld: () => group.updateMatrixWorld(true),
    get alive() { return alive; },
    get x() { return pos.x; },
    get z() { return pos.z; },
    // inert hold-angle fields so the shared Weapon pipeline runs unchanged
    movementDir: 0,
    fullPeeked: true,
    visible: true,
  };
  hitboxes.forEach(h => { h.userData.bot = api; });
  return api;
}

// A wave of stationary bots. cfg: { placements: [{x, z}, ...] }.
function TargetWave(scene, cfg) {
  const all = cfg.placements.map(p => StationaryBot(scene, p));
  return {
    get bots() { return all.filter(b => b.alive); },
    get cleared() { return all.length > 0 && all.every(b => !b.alive); },
    dispose() { all.forEach(b => b.dispose()); },
  };
}
