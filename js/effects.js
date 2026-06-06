// Audio and visual shot effects. Kept separate from weapon rules so the weapon can stay
// focused on fire-rate, raycast, damage, and callbacks.
function Effects(scene, camera) {
  const shotSound = SoundPool('se/vandal-shot.wav', 8, 0.55);
  const killSound = SoundPool('se/kill-shot.wav', 4, 0.85);
  const tracers = [];

  // Lazy WebAudio context for synthesized flash cues (no audio files needed).
  let audioCtx = null;
  function ctx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { audioCtx = null; }
    }
    return audioCtx;
  }
  function playFlashWindup(durSec) {
    const ac = ctx(); if (!ac) return;
    const now = ac.currentTime;
    const d = durSec || 0.5;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + d);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + d * 0.85);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + d);
    osc.connect(gain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + d + 0.05);
  }
  function playFlashPop() {
    const ac = ctx(); if (!ac) return;
    const now = ac.currentTime;
    const len = Math.floor(ac.sampleRate * 0.25);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    src.connect(gain).connect(ac.destination);
    src.start(now);
  }

  function addTracer(ray, hitPoint) {
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);

    const dir = ray.direction.clone().normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    const start = origin.clone()
      .add(dir.clone().multiplyScalar(0.45))
      .add(right.multiplyScalar(0.16))
      .add(up.multiplyScalar(-0.12));
    const end = hitPoint ? hitPoint.clone() : origin.clone().add(dir.multiplyScalar(VALO.TRACER.distance));

    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({
      color: 0xffe4a3,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
    });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    tracers.push({ line, age: 0, life: VALO.TRACER.life });
  }

  function update(dt) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.age += dt;
      const remaining = Math.max(0, 1 - t.age / t.life);
      t.line.material.opacity = remaining * 0.95;
      if (t.age >= t.life) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  return {
    addTracer,
    update,
    playShot: () => shotSound.play(),
    playKill: () => killSound.play(),
    playFlashWindup,
    playFlashPop,
  };
}

function SoundPool(src, size, volume) {
  const pool = [];
  for (let i = 0; i < size; i++) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = volume;
    pool.push(audio);
  }
  let index = 0;

  function play() {
    const audio = pool[index];
    index = (index + 1) % pool.length;
    try {
      audio.currentTime = 0;
      const pending = audio.play();
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch (e) {
      // Browsers may block audio until a user gesture; gameplay keeps running either way.
    }
  }

  return { play };
}
