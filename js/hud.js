// Draws a Valorant-style crosshair on the #crosshair canvas and renders live stats text.
// crosshairCfg: { color, length, gap, thickness, dot }
function Hud(crosshairCfg) {
  const cv = document.getElementById('crosshair');
  const ctx = cv.getContext('2d');
  const statsEl = document.getElementById('stats');
  const feedbackStack = document.getElementById('shot-feedback-stack');
  const overlay = document.getElementById('flash-overlay');
  const nearsight = document.getElementById('nearsight-overlay');
  const hitmarker = document.getElementById('hitmarker');
  let nsElapsed = 0, nsDuration = 0, nsFactor = 0;
  let hmTimer = null;
  const peekHint = document.getElementById('peek-hint');
  let blindElapsed = 0, blindDuration = 0, blindTint = '#ffffff';

  function toCss(color) {
    return typeof color === 'number'
      ? '#' + color.toString(16).padStart(6, '0')
      : (color || '#ffffff');
  }
  function triggerBlind(durationSec, tintColor) {
    blindDuration = Math.max(0, durationSec || 0);
    blindElapsed = 0;
    blindTint = toCss(tintColor);
  }
  function updateBlind(dt) {
    if (!overlay) return;
    if (blindDuration <= 0) { overlay.style.opacity = '0'; return; }
    blindElapsed += dt;
    overlay.style.background = blindElapsed < blindDuration * 0.15 ? blindTint : '#ffffff';
    overlay.style.opacity = String(flashOverlayOpacity(blindElapsed, blindDuration, VALO.FLASH.rampUp));
    if (blindElapsed >= blindDuration) { blindDuration = 0; overlay.style.opacity = '0'; }
  }
  function triggerNearsight(durationSec, factor, tintColor) {
    nsDuration = Math.max(0, durationSec || 0);
    nsElapsed = 0;
    nsFactor = Math.max(0, Math.min(1, factor || 0));
    if (nearsight && tintColor != null) nearsight.style.setProperty('--ns-tint', toCss(tintColor));
  }
  function updateNearsight(dt) {
    if (!nearsight) return;
    if (nsDuration <= 0) { nearsight.style.opacity = '0'; return; }
    nsElapsed += dt;
    const intensity = nearsightIntensity(nsElapsed, VALO.FLASH.rampUp * 3, nsDuration, 0.4) * nsFactor;
    nearsight.style.opacity = String(intensity);
    nearsight.style.setProperty('--ns-blur', (intensity * VALO.FLASH.nearsight.maxBlur).toFixed(2) + 'px');
    if (nsElapsed >= nsDuration) { nsDuration = 0; nearsight.style.opacity = '0'; }
  }
  function showHitmarker() {
    if (!hitmarker) return;
    hitmarker.style.opacity = '1';
    if (hmTimer) clearTimeout(hmTimer);
    hmTimer = setTimeout(() => { hitmarker.style.opacity = '0'; }, 90);
  }
  const feedbackText = {
    fast: 'ยิงเร็วไป',
    nearFast: 'เกือบเร็ว',
    perfect: 'ยิงเป๊ะ',
    good: 'จังหวะดี',
    nearSlow: 'เกือบช้า',
    slow: 'ยิงช้าไป',
    missLeft: 'ซ้าย',
    missRight: 'ขวา',
    missHigh: 'สูง',
    missLow: 'ต่ำ',
    noTarget: 'ไม่มีเป้า',
    preVisible: 'รอก่อน',
    wallBlocked: 'ติดกำแพง',
    oneTapFail: 'First bullet พลาด',
  };

  function setPeekHint(show) {
    if (peekHint) peekHint.style.display = show ? 'block' : 'none';
  }

  function drawCrosshair(cfg) {
    const c = cfg || crosshairCfg;
    const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = c.color;
    const t = c.thickness, g = c.gap, len = c.length;
    // four lines
    ctx.fillRect(cx - t / 2, cy - g - len, t, len); // up
    ctx.fillRect(cx - t / 2, cy + g, t, len);       // down
    ctx.fillRect(cx - g - len, cy - t / 2, len, t); // left
    ctx.fillRect(cx + g, cy - t / 2, len, t);       // right
    if (c.dot) ctx.fillRect(cx - t / 2, cy - t / 2, t, t);
  }

  function update(stats, sessionSec) {
    const avgReaction = (stats.reactionSamples || 0) ? `${statAvgReaction(stats).toFixed(0)}<small>ms</small>` : '-';
    statsEl.innerHTML =
      '<div class="st-hdr">สด</div>' +
      row('Kill', stats.kills, 'accent') +
      row('Acc ถูกจังหวะ', (statValidAccuracy(stats) * 100).toFixed(0) + '<small>%</small>', 'accent') +
      row('First bullet', (statFirstBulletPct(stats) * 100).toFixed(0) + '<small>%</small>') +
      row('Acc รวม', (statAccuracy(stats) * 100).toFixed(0) + '<small>%</small>') +
      row('HS', (statHeadshotPct(stats) * 100).toFixed(0) + '<small>%</small>') +
      row('No target', stats.noTargetShots || 0) +
      row('ยิงก่อนเห็น', stats.preVisibleShots || 0) +
      row('React', avgReaction) +
      row('เวลา', sessionSec.toFixed(0) + '<small>s</small>');
  }

  function row(k, v, cls) {
    return `<div class="st-row"><span class="st-k">${k}</span><span class="st-v ${cls || ''}">${v}</span></div>`;
  }

  function showShotFeedback(kind) {
    if (!feedbackStack) return;
    const el = document.createElement('div');
    el.className = `shot-feedback ${kind}`;
    el.textContent = feedbackText[kind] || kind;
    feedbackStack.appendChild(el);
    while (feedbackStack.children.length > 6) feedbackStack.removeChild(feedbackStack.firstChild);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  drawCrosshair(crosshairCfg);
  return { update, drawCrosshair, showShotFeedback, triggerBlind, updateBlind,
           triggerNearsight, updateNearsight, showHitmarker, setPeekHint };
}
