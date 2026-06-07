// Peek mode: the player does the peeking. Owns the cover (wall or smoke), the current wave
// of stationary bots, and the per-round state machine. game.js delegates here when
// trainingMode is 'wallpeek' or 'smoke'.
//
// cfg: {
//   variant: 'wall' | 'smoke',
//   getConfig: () => ({ distance, countMode, count, countMax }), // read live each wave
//   getRespawnDelay: () => seconds,                              // delay before the next wave
//   getPlayerPos: () => ({ x, z }),
//   onWaveSpawn: ({ variant, count, placements }) => void,
//   onTargetSpawn: (bot, { variant, index, count, pos }) => void,
//   rng: () => [0,1),
// }
function PeekMode(scene, cfg) {
  const rng = cfg.rng || Math.random;
  let wave = null;
  let waveState = '';     // wall: 'live'|'awaitingCover'|'delay'   smoke: 'covered'|'fading'|'live'|'delay'
  let stateClock = 0;     // seconds in the current timed state
  let delayTarget = 0;    // resolved respawn delay for the current 'delay' state

  // --- cover ---
  let wall = null, smoke = null, occluderMeshes = [];
  if (cfg.variant === 'wall') {
    const W = VALO.WALL_PEEK;
    wall = new THREE.Mesh(
      new THREE.BoxGeometry(W.wallW, W.wallH, W.wallThickness),
      new THREE.MeshStandardMaterial({ color: 0x4a5160 })
    );
    wall.position.set(0, W.wallH / 2, W.wallZ);
    scene.add(wall);
    occluderMeshes = [wall];
  } else {
    const S = VALO.SMOKE;
    smoke = new THREE.Mesh(
      new THREE.BoxGeometry(S.w, S.h, 0.5),
      new THREE.MeshBasicMaterial({ color: S.color, transparent: true, opacity: 1 })
    );
    smoke.position.set(0, S.h / 2, S.z);
    scene.add(smoke);
  }

  function setSmokeOpacity(o) {
    if (!smoke) return;
    smoke.material.opacity = o;
    smoke.visible = o > 0.001;
  }

  function placementBounds() {
    const d = cfg.getConfig().distance, P = VALO.PEEK_TARGET;
    const spreadX = Math.max(P.spreadXMin, Math.min(P.spreadXMax, d * P.spreadXFactor));
    const depthSpread = Math.min(P.depthSpreadMax, d * P.depthSpreadFactor);
    return { spreadX, depthMin: d - depthSpread, depthMax: d, minSep: P.minSeparation };
  }

  function spawnWave() {
    if (wave) wave.dispose();
    const c = cfg.getConfig();
    const count = sampleEnemyCount(c.countMode, c.count, c.countMax, rng);
    const placements = randomTargetPlacements(count, placementBounds(), rng);
    if (cfg.onWaveSpawn) cfg.onWaveSpawn({ variant: cfg.variant, count, placements });
    wave = TargetWave(scene, {
      placements,
      onBot: (bot, index, pos) => {
        if (cfg.onTargetSpawn) cfg.onTargetSpawn(bot, { variant: cfg.variant, index, count, pos });
      },
    });
  }

  // initial round
  spawnWave();
  if (cfg.variant === 'wall') {
    waveState = 'live';
  } else {
    waveState = 'covered'; stateClock = 0; setSmokeOpacity(1);
  }

  function updateWall(dt) {
    if (waveState === 'live') {
      if (wave.cleared) waveState = 'awaitingCover';
    } else if (waveState === 'awaitingCover') {
      const p = cfg.getPlayerPos(), W = VALO.WALL_PEEK;
      if (isBehindCover(p.x, p.z, W.behindCoverHalfWidth, W.behindCoverZ)) {
        waveState = 'delay'; stateClock = 0; delayTarget = cfg.getRespawnDelay();
      }
    } else if (waveState === 'delay') {
      stateClock += dt;
      if (stateClock >= delayTarget) { spawnWave(); waveState = 'live'; }
    }
  }

  function updateSmoke(dt) {
    if (waveState === 'covered' || waveState === 'fading') {
      stateClock += dt;
      const S = VALO.SMOKE;
      const ph = smokePhase(stateClock, S.coverDuration, S.fadeDuration);
      setSmokeOpacity(ph.opacity);
      waveState = ph.phase === 'clear' ? 'live' : ph.phase;
    } else if (waveState === 'live') {
      if (wave.cleared) { waveState = 'delay'; stateClock = 0; delayTarget = cfg.getRespawnDelay(); }
    } else if (waveState === 'delay') {
      stateClock += dt;
      if (stateClock >= delayTarget) { spawnWave(); waveState = 'covered'; stateClock = 0; setSmokeOpacity(1); }
    }
  }

  function update(dt) {
    if (cfg.variant === 'wall') updateWall(dt); else updateSmoke(dt);
  }

  function wallAABB() {
    const W = VALO.WALL_PEEK;
    return {
      minX: -W.wallW / 2, maxX: W.wallW / 2,
      minZ: W.wallZ - W.wallThickness / 2, maxZ: W.wallZ + W.wallThickness / 2,
    };
  }

  function playBounds() {
    const b = (cfg.variant === 'wall' ? VALO.WALL_PEEK : VALO.SMOKE).bounds;
    return { minX: -b.x, maxX: b.x, minZ: b.zFront, maxZ: b.zBack };
  }

  function dispose() {
    if (wave) wave.dispose();
    if (wall) { scene.remove(wall); disposeBotObject(wall); }
    if (smoke) { scene.remove(smoke); disposeBotObject(smoke); }
  }

  return {
    update,
    getTargets: () => (wave ? wave.bots : []),
    occluders: () => occluderMeshes,
    colliders: () => (cfg.variant === 'wall' ? [wallAABB()] : []),
    playBounds,
    isAwaitingCover: () => waveState === 'awaitingCover',
    dispose,
  };
}
