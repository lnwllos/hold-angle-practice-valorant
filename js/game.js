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
  let flashKey = null;
  let enemyPeekAt = 0;
  let windupSoundPlayed = false;
  let detonationHandled = false;
  let recorder = null;

  // --- aim log helpers ---
  const R2D = 180 / Math.PI;
  const _camPos = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _head = new THREE.Vector3();
  const round2 = n => Math.round(n * 100) / 100;
  const round3 = n => Math.round(n * 1000) / 1000;

  // The bot the player should currently be aiming at: the held enemy in hold mode, else the
  // nearest alive peek-mode target. null when there is no live bot.
  function aimTarget() {
    if (mode === 'hold') return enemy && enemy.alive ? enemy : null;
    if (!peekMode) return null;
    const bots = peekMode.getTargets().filter(b => b.alive);
    if (bots.length === 0) return null;
    let best = bots[0], bestD = Infinity;
    for (const b of bots) {
      const dx = b.x - player.position.x, dz = b.z - player.position.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  // Head world position, visibility, and crosshair->head angle for the current aim target.
  function targetInfo() {
    const tgt = aimTarget();
    if (!tgt) return null;
    three.camera.getWorldPosition(_camPos);
    three.camera.getWorldDirection(_fwd);
    tgt.updateMatrixWorld();
    tgt.hitboxes[2].getWorldPosition(_head); // head is index 2 in makeBotParts()
    const to = [_head.x - _camPos.x, _head.y - _camPos.y, _head.z - _camPos.z];
    return {
      head: [round3(_head.x), round3(_head.y), round3(_head.z)],
      visible: !!tgt.visible,
      aimErrorDeg: round2(angleBetweenDeg([_fwd.x, _fwd.y, _fwd.z], to)),
    };
  }

  // One 128Hz sample of player aim/position/firing + target info.
  function snapshot() {
    return {
      yaw: round2(player.yaw * R2D),
      pitch: round2(player.pitch * R2D),
      pos: [round3(player.position.x), round3(player.position.y), round3(player.position.z)],
      firing: weapon.isFiring(),
      target: targetInfo(),
    };
  }

  // Session metadata captured when recording starts.
  function buildLogMeta() {
    const c = settings.get();
    return {
      startedAt: new Date().toISOString(),
      trainingMode: c.trainingMode,
      distanceM: c.distance,
      fovDeg: VALO.FOV_H,
      sensitivity: {
        valSens: c.valSens, dpi: c.dpi, multiplier: c.sensMultiplier,
        cm360Approx: Math.round(cm360(c.valSens, c.dpi, VALO.YAW_CONST) * 10) / 10,
      },
      crosshair: { color: c.chColor, length: c.chLength, gap: c.chGap, thickness: c.chThickness, dot: c.chDot },
      recoil: { on: c.recoilOn, intensity: c.recoilIntensity },
    };
  }

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
          const targets = [];
          if (enemy) targets.push(enemy);              // enemy first so it stays the feedback "primary"
          if (flash && flash.isFlash) targets.push(flash);
          return { targets, occluders: enemy ? [enemy.wall] : [] };
        }
        return {
          targets: peekMode ? peekMode.getTargets() : [],
          occluders: peekMode ? peekMode.occluders() : [],
        };
      },
      getSettings: () => settings.weaponCfg(),
      on: {
        shot: info => {
          if (recorder && recorder.isRecording()) {
            const ti = targetInfo();
            recorder.logEvent('shot', {
              yaw: round2(player.yaw * R2D),
              pitch: round2(player.pitch * R2D),
              aimErrorDeg: ti ? ti.aimErrorDeg : null,
              hitZone: info.hitZone || 'miss',
              hit: !!info.hitZone && !info.hitFlash,
            });
          }
          recordShot(stats);
          if (info.hitFlash) { hud.showHitmarker(); return; } // shooting a flash: marker only
          const kind = mode === 'hold'
            ? classifyShotTimingByLateral(info.visible, info.hitZone, info.aimX, info.botX,
                info.movementDir, info.fullPeeked, VALO.AIM_FEEDBACK.perfectHeadHalfWidth)
            : classifyStationaryShot(info.hitZone);
          if (kind) hud.showShotFeedback(kind);
        },
        hit: (zone, isHead) => recordHit(stats, isHead),
        kill: (bot) => {
          if (bot && bot.isFlash) return; // flash destroyed: handled in updateState; not an enemy kill
          if (mode === 'hold') {
            const reaction = visibleAt != null ? (performance.now() / 1000 - visibleAt) * 1000 : 0;
            recordKill(stats, reaction);
            if (recorder && recorder.isRecording()) recorder.logEvent('kill', { reactionMs: Math.round(reaction) });
            effects.playKill();
            state = 'dead';
            respawnAt = performance.now() / 1000 + resolveRespawnDelay();
          } else {
            recordKill(stats, 0); // peek modes do not time reactions
            if (recorder && recorder.isRecording()) recorder.logEvent('kill', { reactionMs: 0 });
            effects.playKill();
            // PeekMode detects the wave being cleared in its own update().
          }
        },
      },
    });
    hud = Hud(settings.crosshair());
    recorder = Recorder({
      getStats: () => stats,
      onCap: () => {
        settings.setLogRecord(false);
        alert('Aim log: ถึงลิมิต ~10 นาที — หยุดอัดและดาวน์โหลดไฟล์แล้ว');
      },
    });
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
    // Log recording toggle (use the recorder's own state as the previous value).
    if (recorder) {
      const wantLog = settings.get().logRecord;
      if (wantLog && !recorder.isRecording()) recorder.start(buildLogMeta());
      else if (!wantLog && recorder.isRecording()) recorder.stop('toggle');
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
    const side = opts && opts.side != null ? opts.side : resolveSide();
    const peekWidth = opts && opts.peekWidth != null ? opts.peekWidth : resolvePeekWidth();
    enemy = Enemy(three.scene, { distance: settings.get().distance, peekWidth, side });
    state = 'active';
    visibleAt = null;
    if (recorder && recorder.isRecording()) {
      recorder.logEvent('spawn', {
        side: side < 0 ? 'left' : 'right',
        peekWidthM: round2(peekWidth),
        distanceM: settings.get().distance,
      });
    }
  }

  // Decide whether the next spawn is a plain enemy or a flash round.
  function startRound() {
    const cfg = settings.get();
    const enabled = [];
    if (cfg.flashBreach) enabled.push('breach');
    if (cfg.flashPhoenix) enabled.push('phoenix');
    if (cfg.flashYoru) enabled.push('yoru');
    if (cfg.flashEyeOrb) enabled.push('eyeorb');
    if (cfg.flashTrackDrone) enabled.push('trackdrone');
    if (shouldFlashRound(cfg.flashChance, enabled.length > 0, Math.random)) {
      startFlashRound(enabled);
    } else {
      spawnEnemy();
    }
  }

  // Build the right flash object for the picked agent. Breach/Phoenix/Yoru are the cosmetic
  // projectile flashes; eyeorb/trackdrone are destructible (shootable) flashes.
  function makeFlash(key, side) {
    const a = VALO.FLASH[key];
    const distance = settings.get().distance;
    // Destructible flashes spawn at a random high position so the player must aim up.
    const H = VALO.FLASH.highSpawnY;
    const spawnY = H.min + Math.random() * (H.max - H.min);
    if (key === 'eyeorb') {
      return EyeOrb(three.scene, {
        color: a.color, travel: a.travel, windup: a.windup,
        destroyHits: a.destroyHits, side, distance, spawnY,
      });
    }
    if (key === 'trackdrone') {
      return TrackDrone(three.scene, {
        color: a.color, flightTime: a.flightTime, scanStartDelay: a.scanStartDelay,
        lockOnTime: a.lockOnTime, scanRange: a.scanRange, scanConeDeg: a.scanConeDeg,
        destroyHits: a.destroyHits, side, distance, spawnY,
        getPlayerPos: () => ({ x: player.position.x, z: player.position.z }),
      });
    }
    return Flash(three.scene, {
      color: a.color, windup: a.windup, flight: a.flight,
      travel: a.travel, speed: a.speed, side, distance,
    });
  }

  // Spawn the enemy hidden behind cover (the angle is held), then play the flash. The enemy
  // is released to peek shortly after the blind (or after the flash is destroyed/expires).
  function startFlashRound(enabled) {
    if (flash) { flash.dispose(); flash = null; } // defensive: never leak a previous flash
    flashKey = pickFlashAgent(enabled, Math.random);
    flashAgent = VALO.FLASH[flashKey];
    const side = resolveSide();
    spawnEnemy({ side, peekWidth: resolvePeekWidth() }); // wall + bot, hidden; sets state 'active'
    state = 'flashing';                                  // override: hold the bot until the blind
    flash = makeFlash(flashKey, side);
    if (recorder && recorder.isRecording()) {
      recorder.logEvent('flash', { agent: flashKey, windupS: flashAgent.windup, blindMaxS: flashAgent.blind });
    }
    windupSoundPlayed = false;
    detonationHandled = false;
  }

  // Trigger the blind for whatever flash just became ready. Nearsight (orb) and the cosmetic
  // projectile flashes are gated by the view angle to the flash; the drone is a direct hit
  // (full strength). Then queue the held enemy's peek.
  function handleBlind(nowSec) {
    let factor = 1;
    if (flashKey !== 'trackdrone') {
      const camPos = new THREE.Vector3();
      const fwd = new THREE.Vector3();
      three.camera.getWorldPosition(camPos);
      three.camera.getWorldDirection(fwd);
      const toFlash = flash.position.clone().sub(camPos).normalize();
      const cos = Math.max(-1, Math.min(1, fwd.dot(toFlash)));
      const angleDeg = (Math.acos(cos) * 180) / Math.PI;
      factor = blindFactor(angleDeg, VALO.FLASH.blindFullDeg, VALO.FLASH.blindZeroDeg);
    }
    const dur = blindDuration(flashAgent.blind, factor);
    if (recorder && recorder.isRecording()) {
      recorder.logEvent('blind', { agent: flashKey, durationS: round2(dur), factor: round2(factor) });
    }
    // Nearsight scales BOTH duration and peak intensity by factor (a stronger look-away
    // incentive than the overlay blind, which scales duration only).
    if (flash.blindKind === 'nearsight') hud.triggerNearsight(dur, factor, flashAgent.color);
    else hud.triggerBlind(dur, flashAgent.color);
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
      // Destroyed before any blind -> success: release the enemy, no blind.
      if (!detonationHandled && flash.destroyed) {
        detonationHandled = true;
        enemyPeekAt = nowSec + VALO.FLASH.enemyPeekDelay;
      }
      // Otherwise the flash becomes ready (projectile detonates / orb arms / drone fires).
      if (!detonationHandled && flash.shouldBlind) {
        detonationHandled = true;
        handleBlind(nowSec);
      }
      if (state === 'flashing' && detonationHandled && nowSec >= enemyPeekAt) {
        state = 'active'; // release the held enemy; it begins peeking next frame
      }
      if (flash.done) { flash.dispose(); flash = null; }
    }

    if (state === 'active' && enemy && enemy.alive) {
      const wasFullPeeked = enemy.fullPeeked;
      enemy.update(lastDt);
      if (visibleAt == null && enemy.visible) {
        visibleAt = nowSec; // reaction clock starts
        if (recorder && recorder.isRecording()) recorder.logEvent('visible', {});
      }
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
    if (recorder.isRecording()) recorder.tick(dt, snapshot);
    if (!autoRespawned) weapon.update(dt, nowSec);
    effects.update(dt);
    hud.updateBlind(dt);
    hud.updateNearsight(dt);
    hud.update(stats, (performance.now() - sessionStart) / 1000);
    hud.setPeekHint(mode === 'wallpeek' && !!peekMode && peekMode.isAwaitingCover());
  }

  window.addEventListener('DOMContentLoaded', init);
})();
