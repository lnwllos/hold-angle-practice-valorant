// Builds the renderer, the FOV-locked camera, lights, and the practice-range environment.
// Returns handles the rest of the game uses. No game logic here.
function Scene3D(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x20242c);
  scene.fog = new THREE.Fog(0x20242c, 45, 95);

  // Live nearsight darkness: lerp the fog/background from the base range toward a tight, near-
  // black range so distant geometry fades to black while close range stays visible. k in 0..1.
  const _nsBaseCol = new THREE.Color(0x20242c);
  const _nsDarkCol = new THREE.Color(VALO.FLASH.nearsightColor);
  const _nsLerp = (a, b, t) => a + (b - a) * t;
  function setNearsight(k) {
    k = Math.max(0, Math.min(1, k || 0));
    scene.fog.near = _nsLerp(45, VALO.FLASH.nearsightNear, k);
    scene.fog.far = _nsLerp(95, VALO.FLASH.nearsightFar, k);
    scene.fog.color.copy(_nsBaseCol).lerp(_nsDarkCol, k);
    scene.background.copy(_nsBaseCol).lerp(_nsDarkCol, k);
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // Camera at standing eye height, looking down -Z. Vertical FOV derived to keep H-FOV = 103.
  const camera = new THREE.PerspectiveCamera(71, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 1.6, 0);
  applyFov();

  function applyFov() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.fov = hfovToVfov(VALO.FOV_H, aspect); // keep horizontal FOV = 103
    camera.updateProjectionMatrix();
  }

  // Lighting
  scene.add(new THREE.HemisphereLight(0xbfd4e6, 0x404048, 0.95));
  const dir = new THREE.DirectionalLight(0xffffff, 0.55);
  dir.position.set(-8, 20, 6);
  scene.add(dir);

  // Range floor. It extends behind the player too, so turning away from the
  // shooting lane does not reveal the edge of the world.
  const rangeCenterZ = -40;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 360),
    new THREE.MeshStandardMaterial({ color: 0x3a3f48 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = rangeCenterZ;
  scene.add(floor);

  // Subtle grid for depth perception
  const grid = new THREE.GridHelper(320, 160, 0x2a2e36, 0x2a2e36);
  grid.position.set(0, 0.01, rangeCenterZ);
  scene.add(grid);

  // Back wall behind the enemy (for depth/reference)
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(140, 14, 1),
    new THREE.MeshStandardMaterial({ color: 0x2c313a })
  );
  back.position.set(0, 7, -120);
  scene.add(back);

  // Rear wall behind the player, only seen when turning away from the angle.
  const rear = new THREE.Mesh(
    new THREE.BoxGeometry(320, 14, 1),
    new THREE.MeshStandardMaterial({ color: 0x282d36 })
  );
  rear.position.set(0, 7, 125);
  scene.add(rear);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyFov();
  }
  window.addEventListener('resize', resize);

  return { scene, camera, renderer, setNearsight, render: () => renderer.render(scene, camera) };
}
