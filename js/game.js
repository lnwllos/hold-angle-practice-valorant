// Composition root: creates every module, runs the render loop, and owns the game state
// machine (spawn -> peek -> hold -> dead -> respawn) plus reaction-time tracking.
(function () {
  let three, player, weapon, hud, settings, effects;
  let lastT = 0, lastDt = 0, sessionStart = 0;
  const stats = makeStats();

  // Enemy lifecycle
  let enemy = null;
  let state = 'waiting';   // 'waiting' | 'active' | 'dead'
  let respawnAt = 0;       // wall-clock seconds when the next enemy spawns
  let visibleAt = null;    // wall-clock seconds the current enemy became visible (reaction clock)

  function init() {
    settings = Settings(onSettingsChange);
    three = Scene3D(document.getElementById('app'));
    player = Player(three.camera, () => settings.sens());
    effects = Effects(three.scene, three.camera);
    weapon = Weapon({
      camera: three.camera,
      player,
      effects,
      getEnemy: () => enemy,
      getSettings: () => settings.weaponCfg(),
      on: {
        shot: info => {
          recordShot(stats);
          hud.showShotFeedback(info.timing);
        },
        hit: (zone, isHead) => recordHit(stats, isHead),
        kill: () => {
          const reaction = visibleAt != null ? (performance.now() / 1000 - visibleAt) * 1000 : 0;
          recordKill(stats, reaction);
          effects.playKill();
          state = 'dead';
          respawnAt = performance.now() / 1000 + resolveRespawnDelay();
        },
      },
    });
    hud = Hud(settings.crosshair());
    sessionStart = performance.now();
    respawnAt = performance.now() / 1000;  // spawn immediately on start
    setupPointerLock();
    requestAnimationFrame(loop);
  }

  function setupPointerLock() {
    const b = document.getElementById('blocker');
    const panel = document.getElementById('settings');
    const hint = b.querySelector('p');
    const lockTarget = three.renderer.domElement;

    function showPointerLockFallback() {
      b.style.display = 'flex';
      panel.classList.add('open');
      if (hint) hint.textContent = 'Pointer lock is blocked in this preview. Open index.html or start.bat in your browser to play.';
    }

    b.addEventListener('click', () => {
      if (hint) hint.textContent = 'Click to play · ESC for settings';
      try {
        const pending = lockTarget.requestPointerLock();
        if (pending && typeof pending.catch === 'function') pending.catch(showPointerLockFallback);
      } catch (e) {
        showPointerLockFallback();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement != null;
      b.style.display = locked ? 'none' : 'flex';
      panel.classList.toggle('open', !locked);
    });
    document.addEventListener('pointerlockerror', showPointerLockFallback);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.pointerLockElement == null) {
        panel.classList.toggle('open');
      }
    });
  }

  function onSettingsChange(action) {
    settings.refreshCm();
    if (hud) hud.drawCrosshair(settings.crosshair());
    if (action === 'reset-stats') {
      Object.assign(stats, makeStats());
      sessionStart = performance.now();
    }
    // distance/peek/side changes take effect on the next spawn.
  }

  // --- spawn helpers ---
  function resolveSide() {
    const v = settings.get().side;
    if (v === 'left') return -1;
    if (v === 'right') return 1;
    return Math.random() < 0.5 ? -1 : 1;
  }
  function resolvePeekWidth() {
    const cfg = settings.get();
    if (cfg.peekMode === 'fixed') return cfg.peekWidth;
    return samplePeekWidth(VALO.PEEK.min, cfg.peekMaxWidth, Math.random);
  }
  function resolveRespawnDelay() {
    const cfg = settings.get();
    return sampleSpawnDelay(
      cfg.spawnDelayMode,
      cfg.respawnDelay,
      cfg.respawnDelayMin,
      cfg.respawnDelayMax,
      Math.random
    );
  }
  function spawnEnemy() {
    if (enemy) enemy.dispose();
    enemy = Enemy(three.scene, {
      distance: settings.get().distance,
      peekWidth: resolvePeekWidth(),
      side: resolveSide(),
    });
    state = 'active';
    visibleAt = null;
  }

  function updateState(nowSec) {
    if (state === 'waiting' || state === 'dead') {
      if (nowSec >= respawnAt) spawnEnemy();
    }
    if (enemy && enemy.alive) {
      const wasFullPeeked = enemy.fullPeeked;
      enemy.update(lastDt);
      if (visibleAt == null && enemy.visible) visibleAt = nowSec; // reaction clock starts
      if (settings.get().respawnOnFullPeek && !wasFullPeeked && enemy.fullPeeked) {
        hud.showShotFeedback('slow');
        // Keep the cover wall during the respawn delay; dispose it only when the next
        // enemy is created so the angle does not flicker open between spawns.
        enemy.kill();
        state = 'dead';
        respawnAt = nowSec + resolveRespawnDelay();
        return true;
      }
    }
    return false;
  }

  // --- main loop ---
  function loop(t) {
    const dt = Math.min((t - lastT) / 1000, 0.05); // seconds, clamped
    lastT = t;
    update(dt);
    three.render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    lastDt = dt;
    const nowSec = performance.now() / 1000;
    player.update(dt);
    const autoRespawned = updateState(nowSec);
    if (!autoRespawned) weapon.update(dt, nowSec);
    effects.update(dt);
    hud.update(stats, (performance.now() - sessionStart) / 1000);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
