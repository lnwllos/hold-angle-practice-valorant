// Owns all tunable settings, persists to localStorage, and builds the #settings-body panel.
// Other modules read settings via getters; some changes call onChange to apply immediately.
function Settings(onChange) {
  const LEGACY_KEY = 'holdangle.settings.v1';
  const KEY = 'holdangle.settings.v2';

  const requestedDefaults = {
    trainingMode: 'hold',
    distance: VALO.DISTANCE.medium,
    peekMode: 'fixed',
    peekWidth: 1.2,
    side: 'left',
    respawnOnFullPeek: true,
    spawnDelayMode: 'random',
    flashBreach: true,
    flashPhoenix: true,
    flashYoru: true,
    flashEyeOrb: true,
    flashTrackDrone: true,
    flashChance: 0.55,
    flashSound: true,
    firstBulletOnly: false,
    showMissDirection: true,
    valSens: 0.5,
    recoilOn: true,
  };

  const defaults = Object.assign({
    distance: VALO.DISTANCE.medium,   // meters
    peekMode: 'fixed',                // 'fixed' | 'random'
    peekWidth: 1.2,                   // meters (fixed mode)
    peekMaxWidth: VALO.PEEK.max,      // meters (random mode upper bound)
    side: 'left',                     // 'left' | 'right' | 'random'
    spawnDelayMode: 'random',         // 'fixed' | 'random'
    respawnOnFullPeek: true,
    respawnDelay: VALO.RESPAWN_DELAY, // seconds
    respawnDelayMin: VALO.SPAWN_DELAY.min,
    respawnDelayMax: VALO.SPAWN_DELAY.max,
    flashBreach: true,
    flashPhoenix: true,
    flashYoru: true,
    flashEyeOrb: true,
    flashTrackDrone: true,
    flashChance: 0.55,                // fraction of spawns that become flash rounds
    flashSound: true,
    trainingMode: 'hold',             // 'hold' | 'wallpeek' | 'smoke'
    enemyCountMode: 'fixed',          // 'fixed' | 'random'
    enemyCount: 3,                    // fixed wave size (1..5)
    enemyCountMax: 5,                 // random upper bound (1..5)
    firstBulletOnly: false,           // hold mode: end the round after the first non-kill enemy shot
    showMissDirection: true,
    valSens: 0.5,
    dpi: 800,
    sensMultiplier: 1.0,
    recoilOn: true,
    recoilIntensity: 1.0,
    chColor: '#33ff88',
    chLength: 7,
    chGap: 4,
    chThickness: 2,
    chDot: false,
    logRecord: false,
  }, requestedDefaults);

  let s = load();
  let activeTab = 'drill';

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (stored && typeof stored === 'object') return Object.assign({}, defaults, stored);

      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if (legacy && typeof legacy === 'object') {
        const migrated = Object.assign({}, defaults, legacy);
        Object.keys(requestedDefaults).forEach(k => { migrated[k] = requestedDefaults[k]; });
        return migrated;
      }
    } catch (e) {}
    return Object.assign({}, defaults);
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(s)); }
    catch (e) {}
  }

  const body = document.getElementById('settings-body');

  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function label(parent, text) {
    const el = make('div', 'set-fieldlabel');
    el.appendChild(make('span', 'dot'));
    el.appendChild(document.createTextNode(text));
    parent.appendChild(el);
    return el;
  }

  function section(parent, title) {
    parent.appendChild(make('div', 'pane-title', title));
  }

  function group(parent, title) {
    const el = make('div', 'sub-group');
    if (title) el.appendChild(make('div', 'sub-title', title));
    parent.appendChild(el);
    return el;
  }

  function note(parent, text) {
    parent.appendChild(make('div', 'pane-note', text));
  }

  function row(parent, text, control, hint) {
    const div = make('div', 'row');
    div.appendChild(make('label', '', text));
    div.appendChild(control);
    if (hint) div.appendChild(make('div', 'hint', hint));
    parent.appendChild(div);
    return div;
  }

  function change(fn, options) {
    const opts = options || {};
    fn();
    save();
    if (onChange) onChange(opts.action);
    if (opts.after) opts.after();
    if (opts.rebuild) build();
  }

  function segmented(options, value, fn, cols, rebuild) {
    const wrap = make('div', 'seg cols-' + (cols || options.length));
    options.forEach(([v, title, sub]) => {
      const btn = make('button', 'seg-btn' + (String(v) === String(value) ? ' active' : ''));
      btn.type = 'button';
      btn.textContent = title;
      if (sub) btn.appendChild(make('small', '', sub));
      btn.addEventListener('click', () => {
        if (String(v) === String(value)) return;
        change(() => fn(v), { rebuild: rebuild !== false });
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function range(min, max, step, value, fmt, fn, after) {
    const el = document.createElement('input');
    el.type = 'range';
    el.min = min;
    el.max = max;
    el.step = step;
    el.value = value;

    const tag = make('span', 'val', fmt(value));
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      tag.textContent = fmt(v);
      change(() => fn(v), { after });
    });

    const wrap = make('div', 'range-wrap');
    wrap.appendChild(tag);
    wrap.appendChild(el);
    return wrap;
  }

  function toggle(title, hint, value, fn) {
    const wrap = make('label', 'toggle-row' + (value ? ' on' : ''));
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => {
      change(() => {
        fn(input.checked);
        wrap.classList.toggle('on', input.checked);
      });
    });

    const text = make('span', 'tg-text');
    text.appendChild(make('span', 'tg-label', title));
    if (hint) text.appendChild(make('span', 'tg-hint', hint));

    wrap.appendChild(input);
    wrap.appendChild(text);
    wrap.appendChild(make('span', 'switch'));
    return wrap;
  }

  function colorInput(after) {
    const el = document.createElement('input');
    el.type = 'color';
    el.value = s.chColor;
    el.addEventListener('input', () => change(() => { s.chColor = el.value; }, { after }));
    return el;
  }

  function makeHeader() {
    const head = make('div', 'set-head');
    const title = make('div', 'titlewrap');
    title.appendChild(make('div', 'eyebrow', 'คอนโซลซ้อม'));
    title.appendChild(make('h2', '', 'ตั้งค่า'));

    const actions = make('div', 'head-actions');
    const reset = make('button', 'set-btn danger compact', 'รีเซ็ตสถิติ');
    reset.type = 'button';
    reset.addEventListener('click', () => { if (onChange) onChange('reset-stats'); });
    actions.appendChild(reset);
    actions.appendChild(make('div', 'esc', 'ESC'));

    head.appendChild(title);
    head.appendChild(actions);
    body.appendChild(head);
  }

  function makePrimary() {
    const primary = make('div', 'set-primary');

    const mode = make('div');
    label(mode, 'โหมด');
    mode.appendChild(segmented([
      ['hold', 'Hold', 'angle'],
      ['wallpeek', 'Wall', 'peek'],
      ['smoke', 'Smoke', 'บัง'],
    ], s.trainingMode, v => {
      s.trainingMode = v;
      if (v !== 'hold' && activeTab === 'threats') activeTab = 'drill';
    }, 3));

    const distance = make('div');
    label(distance, 'ระยะ');
    distance.appendChild(segmented([
      [VALO.DISTANCE.near, 'ใกล้', '8m'],
      [VALO.DISTANCE.medium, 'กลาง', '18m'],
      [VALO.DISTANCE.far, 'ไกล', '35m'],
    ], s.distance, v => { s.distance = parseFloat(v); }, 3));

    primary.appendChild(mode);
    primary.appendChild(distance);
    body.appendChild(primary);
  }

  function makeTabs() {
    const tabs = make('div', 'set-tabs');
    [
      ['drill', '01', 'Drill'],
      ['threats', '02', 'Flash'],
      ['controls', '03', 'ควบคุม'],
      ['crosshair', '04', 'Crosshair'],
    ].forEach(([id, idx, title]) => {
      const btn = make('button', 'tab-btn' + (activeTab === id ? ' active' : ''));
      btn.type = 'button';
      btn.appendChild(make('span', 'idx', idx));
      btn.appendChild(make('span', 'lbl', title));
      btn.addEventListener('click', () => { activeTab = id; build(); });
      tabs.appendChild(btn);
    });
    body.appendChild(tabs);
  }

  function buildDrillPane(parent) {
    section(parent, 'ตั้งค่า Angle');
    const setup = group(parent, s.trainingMode === 'hold' ? 'พฤติกรรม Hold angle' : 'Wave ใน Peek mode');

    if (s.trainingMode === 'hold') {
      row(setup, 'โหมด Peek', segmented([
        ['fixed', 'คงที่', '1 ระยะ'],
        ['random', 'สุ่ม', 'ถ่วงน้ำหนัก'],
      ], s.peekMode, v => { s.peekMode = v; }, 2), 'โหมดคงที่เหมาะกับ drill ที่ต้องซ้อม timing ซ้ำ ๆ');

      if (s.peekMode === 'fixed') {
        row(setup, 'ระยะ Peek คงที่', range(VALO.PEEK.min, VALO.PEEK.max, 0.1,
          s.peekWidth, v => v.toFixed(1) + 'm', v => { s.peekWidth = v; }));
      } else {
        row(setup, 'ระยะ Peek สูงสุด', range(VALO.PEEK.min, VALO.PEEK.max, 0.1,
          s.peekMaxWidth, v => v.toFixed(1) + 'm', v => { s.peekMaxWidth = v; }),
          'Peek กว้างยังมีโอกาสออกน้อยกว่า แม้อยู่ใน cap นี้');
      }

      row(setup, 'ฝั่ง Peek', segmented([
        ['left', 'ซ้าย', 'L'],
        ['right', 'ขวา', 'R'],
        ['random', 'สุ่ม', 'ผสม'],
      ], s.side, v => { s.side = v; }, 3));

      setup.appendChild(toggle('Respawn ตอน full peek', 'เข้ารอบถัดไปเมื่อ bot peek จนสุดระยะแล้ว', s.respawnOnFullPeek,
        v => { s.respawnOnFullPeek = v; }));
      setup.appendChild(toggle('First bullet drill', 'นับหนึ่ง valid shot ต่อ peek; miss หรือ body shot จะจบรอบ', s.firstBulletOnly,
        v => { s.firstBulletOnly = v; }));
      setup.appendChild(toggle('Feedback ทิศทาง miss', 'แสดง ซ้าย, ขวา, สูง, ต่ำ หลัง valid miss', s.showMissDirection,
        v => { s.showMissDirection = v; }));
    } else {
      row(setup, 'โหมดจำนวนเป้า', segmented([
        ['fixed', 'คงที่', 'กำหนด'],
        ['random', 'สุ่ม', '1-max'],
      ], s.enemyCountMode, v => { s.enemyCountMode = v; }, 2));

      if (s.enemyCountMode === 'fixed') {
        row(setup, 'จำนวนเป้า', range(1, 5, 1, s.enemyCount, v => String(v), v => { s.enemyCount = v; }));
      } else {
        row(setup, 'เป้าสูงสุด', range(1, 5, 1, s.enemyCountMax, v => String(v), v => { s.enemyCountMax = v; }));
      }
    }

    section(parent, 'เวลา Spawn');
    const timing = group(parent, 'จังหวะ Respawn');
    row(timing, 'โหมดดีเลย์ Spawn', segmented([
      ['fixed', 'คงที่', 'นิ่ง'],
      ['random', 'สุ่ม', 'แปรผัน'],
    ], s.spawnDelayMode, v => { s.spawnDelayMode = v; }, 2));

    if (s.spawnDelayMode === 'fixed') {
      row(timing, 'ดีเลย์ Respawn', range(0, 2, 0.1, s.respawnDelay,
        v => v.toFixed(1) + 's', v => { s.respawnDelay = v; }));
    } else {
      row(timing, 'ดีเลย์สุ่ม ต่ำสุด', range(0, 3, 0.1, s.respawnDelayMin,
        v => v.toFixed(1) + 's', v => { s.respawnDelayMin = v; }));
      row(timing, 'ดีเลย์สุ่ม สูงสุด', range(0, 3, 0.1, s.respawnDelayMax,
        v => v.toFixed(1) + 's', v => { s.respawnDelayMax = v; }));
    }
  }

  function buildThreatsPane(parent) {
    section(parent, 'ฝึก Flash');
    if (s.trainingMode !== 'hold') {
      note(parent, 'Flash round ใช้ได้ใน Hold angle mode');
      return;
    }

    const tuning = group(parent, 'โอกาสในรอบ');
    row(tuning, 'ความถี่ Flash', range(0, 1, 0.05, s.flashChance,
      v => Math.round(v * 100) + '%', v => { s.flashChance = v; }),
      'โอกาสที่ spawn ถัดไปจะเป็น flash round');
    tuning.appendChild(toggle('เสียง Flash', 'เสียง windup และ pop cue', s.flashSound, v => { s.flashSound = v; }));

    const agents = group(parent, 'Flash ที่เปิดใช้');
    agents.appendChild(toggle('Breach Flashpoint', 'Flash windup ทะลุกำแพง', s.flashBreach, v => { s.flashBreach = v; }));
    agents.appendChild(toggle('Phoenix Curveball', 'Flash โค้งเร็วรอบมุม', s.flashPhoenix, v => { s.flashPhoenix = v; }));
    agents.appendChild(toggle('Yoru Blindside', 'Flash สีน้ำเงินลอยออกจาก angle', s.flashYoru, v => { s.flashYoru = v; }));
    agents.appendChild(toggle('Eye Blind Orb', 'Orb nearsight ที่ยิงทำลายได้', s.flashEyeOrb, v => { s.flashEyeOrb = v; }));
    agents.appendChild(toggle('Tracking Blind Drone', 'Drone scanner ที่ lock-on และยิงทำลายได้', s.flashTrackDrone, v => { s.flashTrackDrone = v; }));
  }

  function buildControlsPane(parent) {
    section(parent, 'อินพุต Aim');
    const aim = group(parent, 'ฟีลเมาส์');
    row(aim, 'Sens Valorant', range(0.05, 2.0, 0.01, s.valSens,
      v => v.toFixed(2), v => { s.valSens = v; }, refreshCm),
      'ใช้ Valorant yaw constant: sensitivity x 0.07 deg/count');
    row(aim, 'Mouse DPI', range(100, 3200, 100, s.dpi,
      v => String(v), v => { s.dpi = v; }, refreshCm));
    row(aim, 'จูน Sens ละเอียด', range(0.5, 2.0, 0.05, s.sensMultiplier,
      v => 'x' + v.toFixed(2), v => { s.sensMultiplier = v; }, refreshCm));
    aim.appendChild(make('div', 'hint cm-readout', cmReadoutText()));

    section(parent, 'อาวุธ');
    const weapon = group(parent, 'Vandal');
    weapon.appendChild(toggle('Recoil Vandal', 'นัดแรกยังตรง; นัดต่อไปจะไต่ขึ้น', s.recoilOn,
      v => { s.recoilOn = v; }));
    row(weapon, 'ความแรง Recoil', range(0.2, 2.0, 0.1, s.recoilIntensity,
      v => 'x' + v.toFixed(1), v => { s.recoilIntensity = v; }));

    section(parent, 'ข้อมูล Session');
    const data = group(parent, 'Aim log');
    data.appendChild(toggle('อัด Log', 'บันทึก valid shot, first bullet, ทิศทาง miss, flash และตำแหน่ง bot', s.logRecord,
      v => { s.logRecord = v; }));
  }

  function drawSettingsCrosshair() {
    const cv = document.getElementById('settings-crosshair-preview');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = s.chColor;
    const t = s.chThickness, g = s.chGap, len = s.chLength;
    ctx.fillRect(cx - t / 2, cy - g - len, t, len);
    ctx.fillRect(cx - t / 2, cy + g, t, len);
    ctx.fillRect(cx - g - len, cy - t / 2, len, t);
    ctx.fillRect(cx + g, cy - t / 2, len, t);
    if (s.chDot) ctx.fillRect(cx - t / 2, cy - t / 2, t, t);
  }

  function buildCrosshairPane(parent) {
    section(parent, 'Crosshair');
    const preview = make('div', 'ch-preview');
    preview.appendChild(make('div', 'tag', 'พรีวิว'));
    const cv = document.createElement('canvas');
    cv.id = 'settings-crosshair-preview';
    cv.width = 80;
    cv.height = 80;
    preview.appendChild(cv);
    parent.appendChild(preview);
    drawSettingsCrosshair();

    const shape = group(parent, 'รูปทรง');
    row(shape, 'สี Crosshair', colorInput(drawSettingsCrosshair));
    row(shape, 'ความยาว Crosshair', range(0, 20, 1, s.chLength,
      v => String(v), v => { s.chLength = v; }, drawSettingsCrosshair));
    row(shape, 'ช่องว่าง Crosshair', range(0, 15, 1, s.chGap,
      v => String(v), v => { s.chGap = v; }, drawSettingsCrosshair));
    row(shape, 'ความหนา Crosshair', range(1, 6, 1, s.chThickness,
      v => String(v), v => { s.chThickness = v; }, drawSettingsCrosshair));
    shape.appendChild(toggle('จุดกลาง', 'เพิ่มจุดเล็กที่กลาง Crosshair', s.chDot,
      v => { s.chDot = v; drawSettingsCrosshair(); }));
  }

  function makePanes() {
    const pane = make('div', 'set-panes');
    if (activeTab === 'drill') buildDrillPane(pane);
    else if (activeTab === 'threats') buildThreatsPane(pane);
    else if (activeTab === 'controls') buildControlsPane(pane);
    else buildCrosshairPane(pane);
    body.appendChild(pane);
  }

  function build() {
    body.innerHTML = '';
    makeHeader();
    makePrimary();
    makeTabs();
    makePanes();
  }

  function refreshCm() {
    const el = body ? body.querySelector('.cm-readout') : null;
    if (el) el.textContent = cmReadoutText();
  }

  function cmReadoutText() {
    return 'ประมาณ ' + cm360(s.valSens, s.dpi, VALO.YAW_CONST).toFixed(1) + ' cm/360';
  }

  build();
  save();

  return {
    get: () => s,
    sens: () => ({ valSens: s.valSens, multiplier: s.sensMultiplier }),
    crosshair: () => ({ color: s.chColor, length: s.chLength, gap: s.chGap, thickness: s.chThickness, dot: s.chDot }),
    weaponCfg: () => ({ recoilOn: s.recoilOn, recoilIntensity: s.recoilIntensity }),
    // Intentionally skips onChange (unlike the panel controls): the safety-cap path calls this
    // from inside recorder.stop, and routing through onChange would re-enter recorder start/stop.
    setLogRecord: v => { s.logRecord = v; save(); build(); },
    refreshCm,
    rebuild: build,
  };
}
