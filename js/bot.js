// Shared bot geometry: head / body / legs with hit zones. Used by the peeking Enemy and by
// stationary peek-mode targets so both share identical hitboxes and proportions.
// Classic script: exposes `makeBotParts` and `disposeBotObject` as browser globals.
function makeBotParts() {
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
  return { group, hitboxes: [legs, body, head] };
}

function disposeBotObject(obj) {
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(m => m.dispose());
  }
}
