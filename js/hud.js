// Draws a Valorant-style crosshair on the #crosshair canvas and renders live stats text.
// crosshairCfg: { color, length, gap, thickness, dot }
function Hud(crosshairCfg) {
  const cv = document.getElementById('crosshair');
  const ctx = cv.getContext('2d');
  const statsEl = document.getElementById('stats');

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

  drawCrosshair(crosshairCfg);
  return { update, drawCrosshair };
}
