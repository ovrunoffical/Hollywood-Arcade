// Hollywood Arcade 3.2: art that fits. Every cover is shown whole at its own shape (no cropping, stretching or blur):
// tiles take their width from the picture's real proportions, and the rows that slide (Deck, Shelf) are positioned from those widths.
const AR = (() => { try { const o = JSON.parse(localStorage.getItem('ha.ar') || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } })();
let arSaveT = 0, arFitT = 0;
function arSave() {
  clearTimeout(arSaveT);
  arSaveT = setTimeout(() => { try { if (Object.keys(AR).length > 4000) for (const k of Object.keys(AR)) delete AR[k]; localStorage.setItem('ha.ar', JSON.stringify(AR)); } catch { /* storage is optional */ } }, 1500);
}
const AR_HOST = '.tile,.dkt,.nst,.nti,.bc';
function arApply(im) {
  const k = im.getAttribute('src'); if (!k) return false;
  let r = AR[k];
  if (!r && im.complete && im.naturalWidth && im.naturalHeight) { r = Math.round(Math.max(.55, Math.min(1.8, im.naturalWidth / im.naturalHeight)) * 1000) / 1000; AR[k] = r; arSave(); }
  if (!r) return false;
  if (im.complete && im.naturalWidth) { const p = im.parentElement && im.parentElement.querySelector(':scope > .ph'); if (p) p.style.display = 'none'; }
  const h = im.closest(AR_HOST); if (!h || h.dataset.ar === String(r)) return false;
  h.dataset.ar = r; h.style.setProperty('--ar', r); return true;
}
const arVu = () => Math.min(innerWidth / 100, innerHeight * 1.7778 / 100);
function fitDeck() {
  const row = document.getElementById('dkrow'); if (!row || typeof dk === 'undefined') return;
  const vu = arVu(); let x = 0;
  for (let k = 0; k < dk && k < row.children.length; k++) x += 11.5 * vu * (+row.children[k].dataset.ar || .75) + 6 + .25 * vu;
  if (!row.dataset.fx) { row.style.transition = 'none'; row.style.setProperty('--x', (21.8 * vu - x) + 'px'); void row.offsetWidth; row.style.transition = ''; row.dataset.fx = '1'; }
  else row.style.setProperty('--x', (21.8 * vu - x) + 'px');
}
function fitShelf() {
  const row = document.getElementById('nsrow'); if (!row || typeof ns === 'undefined') return;
  const j = Math.max(0, ns - 2), t = row.children[j]; if (!t) return;
  const x = 7.8 * arVu() - t.offsetLeft;
  if (!row.dataset.fx) { row.style.transition = 'none'; row.style.setProperty('--x', x + 'px'); void row.offsetWidth; row.style.transition = ''; row.dataset.fx = '1'; }
  else row.style.setProperty('--x', x + 'px');
}
function fitTiles() {
  const sh = document.querySelector('.nshelf'); if (!sh) return;
  const kids = [...sh.children]; kids.forEach(k => { k.hidden = false; });
  const box = sh.getBoundingClientRect(); let over = false;
  for (const k of kids) { if (over || k.getBoundingClientRect().right - box.left > sh.clientWidth + 1) { k.hidden = true; over = true; } }
}
// Blades: game cards take the shape of their cover, and the cards that follow slide along to make room
const BL = [[40, 27, 7.5], [33, 24.4], [26, 14.4], [19, 8.1], [16.5, 6.9], [14, 6]];   // height in vh, default width in vu
function fitBlades() {
  const box = document.getElementById('bcards'); if (!box) return;
  const vu = arVu(), vh = innerHeight / 100; let x = 7.5 * vu;
  const first = !box.dataset.fx;
  for (const c of box.querySelectorAll('.bc')) {
    const d = +c.dataset.d, row = BL[d];
    if (!row) { c.style.left = c.style.width = ''; continue; }
    const w = c.classList.contains('gm') ? row[0] * vh * (+c.dataset.ar || .75) : row[1] * vu;
    if (first) c.style.transition = 'none';
    c.style.left = x + 'px'; c.style.width = w + 'px';
    x += w + .25 * vu;
  }
  if (first) { void box.offsetWidth; box.querySelectorAll('.bc').forEach(c => { c.style.transition = ''; }); box.dataset.fx = '1'; }
}
function arFit() { try { fitBlades(); fitDeck(); fitShelf(); fitTiles(); } catch { /* layout is cosmetic */ } }
function arSoon() { cancelAnimationFrame(arFitT); arFitT = requestAnimationFrame(arFit); }

document.addEventListener('load', (e) => { const im = e.target; if (im instanceof HTMLImageElement && im.classList.contains('cv')) { if (arApply(im)) arSoon(); } }, true);
// a logo or fan-art picture that will not load: the wide box falls back to the game's name
document.addEventListener('error', (e) => {
  const im = e.target; if (!(im instanceof HTMLImageElement)) return;
  if (im.classList.contains('lg')) { const b = im.closest('.wl'); if (b) { const s = document.createElement('span'); s.className = 'wlt'; s.textContent = im.getAttribute('alt') || ''; im.replaceWith(s); } }
  else if (im.classList.contains('fan') || im.classList.contains('dsc')) im.remove();
}, true);

{
  const _r = render;
  render = function () {
    const r = _r.apply(this, arguments);
    try { document.querySelectorAll('img.cv').forEach(arApply); arFit(); } catch { /* cosmetic */ }
    return r;
  };
  const _d = dkSync, _n = nsSync;
  const _b = bSync;
  bSync = function () { const r = _b.apply(this, arguments); arFit(); return r; };
  dkSync = function () { const r = _d.apply(this, arguments); arFit(); return r; };
  nsSync = function () { const r = _n.apply(this, arguments); arFit(); return r; };
  let tm = 0;
  addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(arFit, 100); });
}
