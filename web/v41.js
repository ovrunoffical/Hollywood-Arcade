// Hollywood Arcade 3.2: a color wheel for the accent and background colors (the preset dots stay).
const CW = { k: 'ac', h: 0, s: 1, v: 1, keep: null, applied: false };
const cwHex = () => {
  const f = (n) => { const k = (n + CW.h / 60) % 6, c = CW.v - CW.v * CW.s * Math.max(0, Math.min(k, 4 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return '#' + f(5) + f(3) + f(1);
};
const cwParse = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return null;
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: mx ? d / mx : 0, v: mx };
};
function cwApply(live) {
  const t = (S.settings.theme = S.settings.theme || {}), hex = cwHex();
  if (CW.k === 'ac') { t.acHex = hex; delete t.ac; } else { t.bg = hex; delete t.styleBg; }
  applyTheme();
  const q = (id) => document.getElementById(id);
  if (!q('cwwheel')) return;
  const R = q('cwwheel').clientWidth / 2, a = CW.h * Math.PI / 180;
  q('cwdot').style.left = (R + Math.cos(a) * CW.s * R) + 'px'; q('cwdot').style.top = (R + Math.sin(a) * CW.s * R) + 'px';
  q('cwdim').style.opacity = String((1 - CW.v) * .55); q('cwsw').style.background = hex;
  if (live !== 'sliders') { q('cwh').value = Math.round(CW.h); q('cws').value = Math.round(CW.s * 100); q('cwv').value = Math.round(CW.v * 100); }
  if (live !== 'hex') q('cwhex').value = hex;
}
function cwOpen(k) {
  const t = (S.settings.theme = S.settings.theme || {});
  CW.k = k; CW.keep = JSON.parse(JSON.stringify(t)); CW.applied = false;
  const cur = k === 'ac' ? (t.acHex || (t.ac && t.ac[0]) || '#107c10') : (t.bg || '#0f0f0f');
  Object.assign(CW, cwParse(cur) || { h: 120, s: 1, v: .5 });
  v21show(`<h2>${k === 'ac' ? 'Accent color' : 'Background color'}</h2>
    <div class="cwbox"><div id="cwwheel" class="cwwheel"><i id="cwdim"></i><b id="cwdot"></b></div>
    <div class="cwside"><span id="cwsw" class="cwsw"></span>
      <label>Color<input id="cwh" type="range" min="0" max="360"></label>
      <label>Strength<input id="cws" type="range" min="0" max="100"></label>
      <label>Brightness<input id="cwv" type="range" min="0" max="100"></label>
      <label>Hex<input id="cwhex" maxlength="7" autocomplete="off"></label></div></div>`,
    [{ label: 'Done', primary: true, fn: () => { CW.applied = true; save(); render(); } }, { label: 'Cancel' }], true);
  const w = document.getElementById('cwwheel'); let drag = false;
  const pick = (e) => { const r = w.getBoundingClientRect(), R = r.width / 2, x = e.clientX - r.left - R, y = e.clientY - r.top - R; CW.h = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; CW.s = Math.min(1, Math.hypot(x, y) / R); cwApply(); };
  w.addEventListener('pointerdown', (e) => { drag = true; w.setPointerCapture(e.pointerId); pick(e); });
  w.addEventListener('pointermove', (e) => { if (drag) pick(e); });
  w.addEventListener('pointerup', () => { drag = false; });
  for (const [id, key, div] of [['cwh', 'h', 1], ['cws', 's', 100], ['cwv', 'v', 100]]) document.getElementById(id).addEventListener('input', (e) => { CW[key] = +e.target.value / div; cwApply('sliders'); });
  document.getElementById('cwhex').addEventListener('input', (e) => { const p = cwParse(e.target.value); if (p) { Object.assign(CW, p); cwApply('hex'); } });
  cwApply();
}
document.getElementById('v21dlg').addEventListener('close', () => {
  if (CW.keep && !CW.applied) { S.settings.theme = CW.keep; applyTheme(); }
  CW.keep = null;
});
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-v41="wheel"]'); if (b) { e.stopPropagation(); cwOpen(b.dataset.k); } }, true);
{
  const _a = appearance;
  appearance = function () {
    return _a.apply(this, arguments).replace(/<input type="color" class="swpick" data-theme="(acHex|bg)"[^>]*>/g, (m, k) => `<button class="btn cwbtn" data-v41="wheel" data-k="${k === 'acHex' ? 'ac' : 'bg'}"><i class="cwico"></i>Color wheel</button>`);
  };
}
