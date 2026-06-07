// Owns all tunable settings, persists to localStorage, and builds the #settings-body panel.
// Other modules read settings via getters; some changes call onChange to apply immediately.
function Settings(onChange) {
  const KEY = 'holdangle.settings.v1';
  const defaults = {
    distance: VALO.DISTANCE.medium,   // meters
    peekMode: 'random',               // 'fixed' | 'random'
    peekWidth: 1.2,                   // meters (fixed mode)
    peekMaxWidth: VALO.PEEK.max,      // meters (random mode upper bound)
    side: 'random',                   // 'left' | 'right' | 'random'
    spawnDelayMode: 'fixed',          // 'fixed' | 'random'
    respawnOnFullPeek: false,
    respawnDelay: VALO.RESPAWN_DELAY, // seconds
    respawnDelayMin: VALO.SPAWN_DELAY.min,
    respawnDelayMax: VALO.SPAWN_DELAY.max,
    flashBreach: false,
    flashPhoenix: false,
    flashYoru: false,
    flashEyeOrb: false,
    flashTrackDrone: false,
    flashChance: 0.3,   // fraction of spawns that become flash rounds (needs an agent enabled)
    flashSound: true,
    trainingMode: 'hold',     // 'hold' | 'wallpeek' | 'smoke'
    enemyCountMode: 'fixed',  // 'fixed' | 'random'
    enemyCount: 3,            // fixed wave size (1..5)
    enemyCountMax: 5,         // random upper bound (1..5)
    valSens: 0.4,
    dpi: 800,
    sensMultiplier: 1.0,
    recoilOn: false,
    recoilIntensity: 1.0,
    chColor: '#33ff88',
    chLength: 7,
    chGap: 4,
    chThickness: 2,
    chDot: false,
    logRecord: false,
  };
  let s = load();

  function load() {
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch (e) { return Object.assign({}, defaults); }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(s)); }

  // --- panel construction ---
  const body = document.getElementById('settings-body');

  function row(label, control, hint) {
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = `<label>${label}</label>`;
    div.appendChild(control);
    if (hint) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = hint; div.appendChild(h); }
    body.appendChild(div);
    return div;
  }
  function select(options, value, fn) {
    const el = document.createElement('select');
    options.forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t;
      if (String(v) === String(value)) o.selected = true; el.appendChild(o);
    });
    el.addEventListener('change', () => { fn(el.value); save(); onChange && onChange(); });
    return el;
  }
  function range(min, max, step, value, fmt, fn) {
    const el = document.createElement('input');
    el.type = 'range'; el.min = min; el.max = max; el.step = step; el.value = value;
    const tag = document.createElement('span'); tag.className = 'val'; tag.textContent = fmt(value);
    el.addEventListener('input', () => { const v = parseFloat(el.value); tag.textContent = fmt(v); fn(v); save(); onChange && onChange(); });
    const wrap = document.createElement('div'); wrap.appendChild(tag); wrap.appendChild(el);
    return wrap;
  }
  function checkbox(value, fn) {
    const el = document.createElement('input'); el.type = 'checkbox'; el.checked = value;
    el.addEventListener('change', () => { fn(el.checked); save(); onChange && onChange(); });
    return el;
  }

  function build() {
    body.innerHTML = '';
    const actions = document.createElement('div');
    actions.className = 'actions';
    const resetTop = document.createElement('button');
    resetTop.textContent = 'Reset stats';
    resetTop.addEventListener('click', () => onChange && onChange('reset-stats'));
    actions.appendChild(resetTop);
    body.appendChild(actions);

    row('Training mode', select(
      [['hold', 'Hold angle (รับ peek)'], ['wallpeek', 'Wall peek (เรา peek)'], ['smoke', 'Smoke (ยืนในควัน)']],
      s.trainingMode, v => { s.trainingMode = v; build(); }));

    row('Distance (player ↔ enemy)', select(
      [[VALO.DISTANCE.near, 'Near (8m)'], [VALO.DISTANCE.medium, 'Medium (18m)'], [VALO.DISTANCE.far, 'Far (35m)']],
      s.distance, v => s.distance = parseFloat(v)));

    if (s.trainingMode === 'hold') {
      row('Peek mode', select([['fixed', 'Fixed width'], ['random', 'Random (wider = rarer)']],
        s.peekMode, v => { s.peekMode = v; build(); }));
      row('Peek width / max (m)', range(VALO.PEEK.min, VALO.PEEK.max, 0.1,
        s.peekMode === 'fixed' ? s.peekWidth : s.peekMaxWidth, v => v.toFixed(1) + 'm',
        v => { if (s.peekMode === 'fixed') s.peekWidth = v; else s.peekMaxWidth = v; }));
      row('Peek side', select([['left', 'Left'], ['right', 'Right'], ['random', 'Random']],
        s.side, v => s.side = v));
      row('Respawn at full peek', checkbox(s.respawnOnFullPeek, v => s.respawnOnFullPeek = v));
    } else {
      row('Enemy count mode', select([['fixed', 'Fixed'], ['random', 'Random (1–max)']],
        s.enemyCountMode, v => { s.enemyCountMode = v; build(); }));
      if (s.enemyCountMode === 'fixed') {
        row('Enemy count', range(1, 5, 1, s.enemyCount, v => String(v), v => s.enemyCount = v));
      } else {
        row('Enemy max', range(1, 5, 1, s.enemyCountMax, v => String(v), v => s.enemyCountMax = v));
      }
    }

    row('Spawn delay mode', select([['fixed', 'Fixed delay'], ['random', 'Random delay']],
      s.spawnDelayMode, v => { s.spawnDelayMode = v; build(); }));
    if (s.spawnDelayMode === 'fixed') {
      row('Respawn delay', range(0, 2, 0.1, s.respawnDelay, v => v.toFixed(1) + 's', v => s.respawnDelay = v));
    } else {
      row('Random delay min', range(0, 3, 0.1, s.respawnDelayMin, v => v.toFixed(1) + 's', v => s.respawnDelayMin = v));
      row('Random delay max', range(0, 3, 0.1, s.respawnDelayMax, v => v.toFixed(1) + 's', v => s.respawnDelayMax = v));
    }

    if (s.trainingMode === 'hold') {
      row('Flash: Breach (Flashpoint)', checkbox(s.flashBreach, v => s.flashBreach = v));
      row('Flash: Phoenix (Curveball)', checkbox(s.flashPhoenix, v => s.flashPhoenix = v));
      row('Flash: Yoru (Blindside)', checkbox(s.flashYoru, v => s.flashYoru = v));
      row('Flash: Eye Blind Orb (ยิงทำลาย)', checkbox(s.flashEyeOrb, v => s.flashEyeOrb = v),
        'Destructible nearsight orb — flick and shoot it before it arms.');
      row('Flash: Tracking Blind Drone (ยิงทำลาย)', checkbox(s.flashTrackDrone, v => s.flashTrackDrone = v),
        'Moving scanner — track and shoot it before it locks on and fires.');
      row('Flash frequency', range(0, 1, 0.05, s.flashChance, v => Math.round(v * 100) + '%',
        v => s.flashChance = v), 'Chance a spawn is a flash round (needs an agent enabled).');
      row('Flash sound', checkbox(s.flashSound, v => s.flashSound = v));
    }

    row('Valorant sensitivity', range(0.05, 2.0, 0.01, s.valSens, v => v.toFixed(2), v => s.valSens = v),
      'Uses Valorant yaw constant (sens × 0.07°/count).');
    row('Mouse DPI', range(100, 3200, 100, s.dpi, v => String(v), v => s.dpi = v));
    row('Sens fine-tune', range(0.5, 2.0, 0.05, s.sensMultiplier, v => '×' + v.toFixed(2), v => s.sensMultiplier = v),
      'Approx cm/360 shown below; tune to match your feel.');
    const cm = document.createElement('div'); cm.className = 'hint'; cm.id = 'cm360';
    body.appendChild(cm); refreshCm();

    row('Vandal recoil', checkbox(s.recoilOn, v => s.recoilOn = v));
    row('Recoil intensity', range(0.2, 2.0, 0.1, s.recoilIntensity, v => '×' + v.toFixed(1), v => s.recoilIntensity = v));

    row('Crosshair color', (() => {
      const el = document.createElement('input'); el.type = 'color'; el.value = s.chColor;
      el.addEventListener('input', () => { s.chColor = el.value; save(); onChange && onChange(); });
      return el;
    })());
    row('Crosshair length', range(0, 20, 1, s.chLength, v => String(v), v => s.chLength = v));
    row('Crosshair gap', range(0, 15, 1, s.chGap, v => String(v), v => s.chGap = v));
    row('Crosshair thickness', range(1, 6, 1, s.chThickness, v => String(v), v => s.chThickness = v));
    row('Crosshair dot', checkbox(s.chDot, v => s.chDot = v));

    row('Log recording (อัดข้อมูลการเล็ง)', checkbox(s.logRecord, v => s.logRecord = v),
      'อัด yaw/pitch + ตำแหน่งบอท 128Hz ระหว่างเล่น; ปิดสวิตช์เพื่อดาวน์โหลดไฟล์ JSON (หยุดเองที่ ~10 นาที).');

  }

  function refreshCm() {
    const el = document.getElementById('cm360');
    if (el) el.textContent = '≈ ' + cm360(s.valSens, s.dpi, VALO.YAW_CONST).toFixed(1) + ' cm/360 (approx)';
  }

  build();

  return {
    get: () => s,
    sens: () => ({ valSens: s.valSens, multiplier: s.sensMultiplier }),
    crosshair: () => ({ color: s.chColor, length: s.chLength, gap: s.chGap, thickness: s.chThickness, dot: s.chDot }),
    weaponCfg: () => ({ recoilOn: s.recoilOn, recoilIntensity: s.recoilIntensity }),
    setLogRecord: v => { s.logRecord = v; save(); build(); },
    refreshCm,
    rebuild: build,
  };
}
