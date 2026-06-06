// Draws a Valorant-style crosshair on the #crosshair canvas and renders live stats text.
// crosshairCfg: { color, length, gap, thickness, dot }
function Hud(crosshairCfg) {
  const cv = document.getElementById('crosshair');
  const ctx = cv.getContext('2d');
  const statsEl = document.getElementById('stats');
  const feedbackStack = document.getElementById('shot-feedback-stack');
  const overlay = document.getElementById('flash-overlay');
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
  const feedbackText = {
    fast: 'ยิงเร็วเกิน',
    nearFast: 'เกือบเร็ว',
    perfect: 'ยิงเป๊ะ',
    good: 'จังหวะดี',
    nearSlow: 'เกือบช้า',
    slow: 'ยิงช้าเกิน',
  };

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
    statsEl.innerHTML =
      `Kills: <b>${stats.kills}</b><br>` +
      `Accuracy: <b>${(statAccuracy(stats) * 100).toFixed(0)}%</b><br>` +
      `Headshot: <b>${(statHeadshotPct(stats) * 100).toFixed(0)}%</b><br>` +
      `Avg reaction: <b>${statAvgReaction(stats).toFixed(0)} ms</b><br>` +
      `Time: <b>${sessionSec.toFixed(0)}s</b>`;
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
  return { update, drawCrosshair, showShotFeedback, triggerBlind, updateBlind };
}
