// Builds the renderer, the FOV-locked camera, lights, and the practice-range environment.
// Returns handles the rest of the game uses. No game logic here.
function Scene3D(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x20242c);
  scene.fog = new THREE.Fog(0x20242c, 45, 95);

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

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 240),
    new THREE.MeshStandardMaterial({ color: 0x3a3f48 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -70;
  scene.add(floor);

  // Subtle grid for depth perception
  const grid = new THREE.GridHelper(140, 70, 0x2a2e36, 0x2a2e36);
  grid.position.set(0, 0.01, -70);
  scene.add(grid);

  // Back wall behind the enemy (for depth/reference)
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(140, 14, 1),
    new THREE.MeshStandardMaterial({ color: 0x2c313a })
  );
  back.position.set(0, 7, -120);
  scene.add(back);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyFov();
  }
  window.addEventListener('resize', resize);

  return { scene, camera, renderer, render: () => renderer.render(scene, camera) };
}
