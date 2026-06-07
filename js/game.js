// Composition root: creates every module, runs the render loop, and owns the game state
// machine (spawn -> peek -> hold -> dead -> respawn) plus reaction-time tracking.
(function () {
  let three, player, weapon, hud, settings, effects;
  let lastT = 0, lastDt = 0, sessionStart = 0;
  const stats = makeStats();

  // Enemy lifecycle
  let enemy = null;
  let state = 'waiting';   // 'waiting' | 'active' | 'flashing' | 'dead'
  let respawnAt = 0;       // wall-clock seconds when the next enemy spawns
  let visibleAt = null;    // wall-clock seconds the current enemy became visible (reaction clock)
  let mode = null;         // set by applyMode(); 'hold' | 'wallpeek' | 'smoke'
  let peekMode = null;     // PeekMode instance when mode !== 'hold'

  // Flash-round lifecycle (a flash pops, then the held enemy peeks)
  let flash = null;
  let flashAgent = null;
  let enemyPeekAt = 0;
  let windupSoundPlayed = false;
  let detonationHandled = false;

  function init() {
    settings = Settings(onSettingsChange);
    three = Scene3D(document.getElementById('app'));
    player = Player(three.camera, () => settings.sens());
    effects = Effects(three.scene, three.camera);
    weapon = Weapon({
      camera: three.camera,
      player,
      effects,
      getShootables: () => {
        if (mode === 'hold') {
          return { targets: enemy ? [enemy] : [], occluders: enemy ? [enemy.wall] : [] };
        }
        return {
          targets: peekMode ? peekMode.getTargets() : [],
          occluders: peekMode ? peekMode.occluders() : [],
        };
      },
      getSettings: () => settings.weaponCfg(),
      on: {
        shot: info => {
          recordShot(stats);
          const kind = mode === 'hold'
            ? classifyShotTimingByLateral(info.visible, info.hitZone, info.aimX, info.botX,
                info.movementDir, info.fullPeeked, VALO.AIM_FEEDBACK.perfectHeadHalfWidth)
            : classifyStationaryShot(info.hitZone);
          if (kind) hud.showShotFeedback(kind);
        },
        hit: (zone, isHead) => recordHit(stats, isHead),
        kill: () => {
          if (mode === 'hold') {
            const reaction = visibleAt != null ? (performance.now() / 1000 - visibleAt) * 1000 : 0;
            recordKill(stats, reaction);
            effects.playKill();
            state = 'dead';
            respawnAt = performance.now() / 1000 + resolveRespawnDelay();
          } else {
            recordKill(stats, 0); // peek modes do not time reactions
            effects.playKill();
            // PeekMode detects the wave being cleared in its own update().
          }
        },
      },
    });
    hud = Hud(settings.crosshair());
    sessionStart = performance.now();
    applyMode();
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

    // Request RAW mouse input (no OS pointer acceleration) so fast flicks map 1:1,
    // like Valorant's raw input. Without unadjustedMovement, Windows "Enhance pointer
    // precision" scales fast swings non-linearly, which makes the view feel like it
    // jumps/warps the faster you turn. Falls back to default input where unsupported.
    function requestLock(raw) {
      let pending;
      try {
        pending = raw
          ? lockTarget.requestPointerLock({ unadjustedMovement: true })
          : lockTarget.requestPointerLock();
      } catch (e) {
        showPointerLockFallback();
        return;
      }
      if (pending && typeof pending.then === 'function') {
        pending.catch(err => {
          // Raw input unsupported on this browser/OS -> retry with default input.
          if (raw && err && err.name === 'NotSupportedError') requestLock(false);
          else showPointerLockFallback();
        });
      }
    }

    b.addEventListener('click', () => {
      if (hint) hint.textContent = 'Click to play · ESC for settings';
      requestLock(true);
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
    applyMode();
  }

  // Build or rebuild the active training mode. Tears down the previous mode's objects.
  function applyMode() {
    const want = settings.get().trainingMode || 'hold';
    if (want === mode && (mode === 'hold' || peekMode)) return; // unchanged
    mode = want;

    if (enemy) { enemy.dispose(); enemy = null; }
    if (flash) { flash.dispose(); flash = null; }
    if (peekMode) { peekMode.dispose(); peekMode = null; }
    state = 'waiting';
    visibleAt = null;

    if (mode === 'hold') {
      player.setMovementEnabled(false);
      player.setColliders([]);
      player.setBounds(null);
      player.resetPosition();
      respawnAt = performance.now() / 1000; // spawn the next enemy immediately
    } else {
      player.setMovementEnabled(true);
      player.resetPosition();
      peekMode = PeekMode(three.scene, {
        variant: mode === 'wallpeek' ? 'wall' : 'smoke',
        getConfig: () => {
          const c = settings.get();
          return { distance: c.distance, countMode: c.enemyCountMode, count: c.enemyCount, countMax: c.enemyCountMax };
        },
        getRespawnDelay: () => resolveRespawnDelay(),
        getPlayerPos: () => ({ x: player.position.x, z: player.position.z }),
        rng: Math.random,
      });
      player.setColliders(peekMode.colliders());
      player.setBounds(peekMode.playBounds());
    }
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
  function spawnEnemy(opts) {
    if (enemy) enemy.dispose();
    enemy = Enemy(three.scene, {
      distance: settings.get().distance,
      peekWidth: opts && opts.peekWidth != null ? opts.peekWidth : resolvePeekWidth(),
      side: opts && opts.side != null ? opts.side : resolveSide(),
    });
    state = 'active';
    visibleAt = null;
  }

  // Decide whether the next spawn is a plain enemy or a flash round.
  function startRound() {
    const cfg = settings.get();
    const enabled = [];
    if (cfg.flashBreach) enabled.push('breach');
    if (cfg.flashPhoenix) enabled.push('phoenix');
    if (cfg.flashYoru) enabled.push('yoru');
    if (shouldFlashRound(cfg.flashChance, enabled.length > 0, Math.random)) {
      startFlashRound(enabled);
    } else {
      spawnEnemy();
    }
  }

  // Spawn the enemy hidden behind cover (so the angle/wall is held), then play a flash that
  // pops in front of the corner. The enemy is held until shortly after detonation.
  function startFlashRound(enabled) {
    if (flash) { flash.dispose(); flash = null; } // defensive: never leak a previous flash
    const key = pickFlashAgent(enabled, Math.random);
    flashAgent = VALO.FLASH[key];
    const side = resolveSide();
    spawnEnemy({ side, peekWidth: resolvePeekWidth() }); // wall + bot, hidden; sets state 'active'
    state = 'flashing';                                  // override: hold the bot until the pop
    flash = Flash(three.scene, {
      color: flashAgent.color,
      windup: flashAgent.windup,
      flight: flashAgent.flight,
      travel: flashAgent.travel,
      speed: flashAgent.speed,
      side,
      distance: settings.get().distance,
    });
    windupSoundPlayed = false;
    detonationHandled = false;
  }

  // At detonation, blind by how far the player's view is from the flash, then queue the peek.
  function handleDetonation(nowSec) {
    const camPos = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    three.camera.getWorldPosition(camPos);
    three.camera.getWorldDirection(fwd);
    const toFlash = flash.position.clone().sub(camPos).normalize();
    const cos = Math.max(-1, Math.min(1, fwd.dot(toFlash)));
    const angleDeg = (Math.acos(cos) * 180) / Math.PI;
    const factor = blindFactor(angleDeg, VALO.FLASH.blindFullDeg, VALO.FLASH.blindZeroDeg);
    hud.triggerBlind(blindDuration(flashAgent.blind, factor), flashAgent.color);
    if (settings.get().flashSound) effects.playFlashPop();
    enemyPeekAt = nowSec + VALO.FLASH.enemyPeekDelay;
  }

  function updateState(nowSec) {
    if (state === 'waiting' || state === 'dead') {
      if (nowSec >= respawnAt) startRound();
    }

    // Advance the flash visual whenever one exists. It outlives the 'flashing' phase by a
    // short burst, so update/dispose it independently of `state` (otherwise the burst would
    // freeze and leak once the enemy is released).
    if (flash) {
      flash.update(lastDt);
      if (!windupSoundPlayed && flash.windingUp) {
        windupSoundPlayed = true;
        if (settings.get().flashSound) effects.playFlashWindup(flashAgent.windup);
      }
      if (!detonationHandled && flash.detonated) {
        detonationHandled = true;
        handleDetonation(nowSec);
      }
      if (state === 'flashing' && detonationHandled && nowSec >= enemyPeekAt) {
        state = 'active'; // release the held enemy; it begins peeking next frame
      }
      if (flash.done) { flash.dispose(); flash = null; }
    }

    if (state === 'active' && enemy && enemy.alive) {
      const wasFullPeeked = enemy.fullPeeked;
      enemy.update(lastDt);
      if (visibleAt == null && enemy.visible) visibleAt = nowSec; // reaction clock starts
      if (settings.get().respawnOnFullPeek && !wasFullPeeked && enemy.fullPeeked) {
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
    let autoRespawned = false;
    if (mode === 'hold') autoRespawned = updateState(nowSec);
    else if (peekMode) peekMode.update(dt);
    if (!autoRespawned) weapon.update(dt, nowSec);
    effects.update(dt);
    hud.updateBlind(dt);
    hud.update(stats, (performance.now() - sessionStart) / 1000);
    hud.setPeekHint(mode === 'wallpeek' && !!peekMode && peekMode.isAwaitingCover());
  }

  window.addEventListener('DOMContentLoaded', init);
})();
