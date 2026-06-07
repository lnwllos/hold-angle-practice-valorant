// First-person look: pointer lock + yaw/pitch from mouse movement, scaled by Valorant-style
// sensitivity. Reads live sensitivity from a getSens() callback so Settings can change it.
// getSens() returns { valSens, multiplier }.
function Player(camera, getSens) {
  let yaw = 0;
  let pitch = 0;
  const MAX_PITCH = (89 * Math.PI) / 180;

  const EYE_Y = 1.6;
  const RADIUS = 0.3;              // player collision radius
  const keys = { w: false, a: false, s: false, d: false };
  let moveEnabled = false;
  let colliders = [];             // [{ minX, maxX, minZ, maxZ }]
  let bounds = null;              // { minX, maxX, minZ, maxZ } or null

  function onKey(e, down) {
    const k = e.key.toLowerCase();
    if (k === 'w') keys.w = down;
    else if (k === 'a') keys.a = down;
    else if (k === 's') keys.s = down;
    else if (k === 'd') keys.d = down;
  }
  document.addEventListener('keydown', e => onKey(e, true));
  document.addEventListener('keyup', e => onKey(e, false));

  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _move = new THREE.Vector3();

  function blocked(px, pz) {
    return colliders.some(c =>
      px > c.minX - RADIUS && px < c.maxX + RADIUS &&
      pz > c.minZ - RADIUS && pz < c.maxZ + RADIUS);
  }

  function moveStep(dt) {
    if (!moveEnabled || document.pointerLockElement == null) return;
    camera.getWorldDirection(_fwd); _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-9) return;
    _fwd.normalize();
    _right.crossVectors(_fwd, camera.up).normalize(); // +X when looking -Z

    _move.set(0, 0, 0);
    if (keys.w) _move.add(_fwd);
    if (keys.s) _move.sub(_fwd);
    if (keys.d) _move.add(_right);
    if (keys.a) _move.sub(_right);
    if (_move.lengthSq() === 0) return;
    _move.normalize().multiplyScalar(VALO.RUN_SPEED * dt);

    // per-axis collision against cover walls
    const tx = camera.position.x + _move.x;
    if (!blocked(tx, camera.position.z)) camera.position.x = tx;
    const tz = camera.position.z + _move.z;
    if (!blocked(camera.position.x, tz)) camera.position.z = tz;

    if (bounds) {
      camera.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, camera.position.x));
      camera.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, camera.position.z));
    }
    camera.position.y = EYE_Y;
  }

  function onMouseMove(e) {
    if (document.pointerLockElement == null) return;
    const { valSens, multiplier } = getSens();
    const dYaw = effectiveDeg(e.movementX, valSens, VALO.YAW_CONST, multiplier);
    const dPitch = effectiveDeg(e.movementY, valSens, VALO.YAW_CONST, multiplier);
    yaw -= (dYaw * Math.PI) / 180;        // moving mouse right -> look right
    pitch -= (dPitch * Math.PI) / 180;    // moving mouse down -> look down
    pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
    apply();
  }
  document.addEventListener('mousemove', onMouseMove);

  // Recoil kicks the view; recovery eases it back when not firing (driven by Weapon via addKick).
  let kickYaw = 0, kickPitch = 0;
  function addKick(yawDeg, pitchDeg) {
    kickYaw += (yawDeg * Math.PI) / 180;
    kickPitch += (pitchDeg * Math.PI) / 180;
    apply();
  }
  function update(dt) {
    // ease kick back toward 0
    const rec = Math.min(1, dt * 6);
    kickYaw -= kickYaw * rec;
    kickPitch -= kickPitch * rec;
    apply();
    moveStep(dt);
  }

  function apply() {
    camera.rotation.y = yaw + kickYaw;
    camera.rotation.x = pitch + kickPitch;
  }

  return {
    update, addKick,
    setMovementEnabled: b => { moveEnabled = !!b; if (!b) { keys.w = keys.a = keys.s = keys.d = false; } },
    setColliders: a => { colliders = a || []; },
    setBounds: b => { bounds = b || null; },
    resetPosition: () => { camera.position.set(0, EYE_Y, 0); },
    get position() { return camera.position; },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
  };
}
