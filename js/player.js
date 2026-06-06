// First-person look: pointer lock + yaw/pitch from mouse movement, scaled by Valorant-style
// sensitivity. Reads live sensitivity from a getSens() callback so Settings can change it.
// getSens() returns { valSens, multiplier }.
function Player(camera, getSens) {
  let yaw = 0;
  let pitch = 0;
  const MAX_PITCH = (89 * Math.PI) / 180;

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
  }

  function apply() {
    camera.rotation.y = yaw + kickYaw;
    camera.rotation.x = pitch + kickPitch;
  }

  return { update, addKick, get yaw() { return yaw; }, get pitch() { return pitch; } };
}
