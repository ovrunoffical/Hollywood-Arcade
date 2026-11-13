// Hollywood Arcade 3.2: two Xbox 360 styles (look-alikes with our own artwork, no avatars or Microsoft art).
//   x360  : the 2005 "blades" dashboard. Up/down changes blade, left/right moves through its panels.
//   x360n : the 2011 tiled dashboard. A row of tabs on top, a grid of tiles below.
// They reuse the icons and item lists from the PS3 style (v34.js).

let bld = 'games', bpan = 0, bPrev = '', ntab = 'home', nOnTile = false, nPrev = '';
const is360 = () => uiStyle() === 'x360', is360n = () => uiStyle() === 'x360n';
const attrsOf = (e) => e.style ? `data-v33="style" data-v="${e.style}"` : e.act ? `data-act="${e.act}"${e.id ? ` data-id="${esc(e.id)}"` : ''}` : `data-act="goto" data-v="${e.v}"${e.plug ? ` data-plug="${esc(e.plug)}"` : ''}`;
const coverOf = (it) => { const isIco = it.category === 'app' && !it.art && !it.cover && it.icon; return isIco ? '' : it.cover ? toURL(it.cover) : it.art ? toURL(it.art) : it.appid ? `https://cdn.akamai.steamstatic.com/steam/apps/${it.appid}/library_600x900_2x.jpg` : ''; };
const logoSVG = '<svg class="x3logo" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50"/><g><rect x="25" y="20" width="12" height="60" rx="3"/><rect x="63" y="20" width="12" height="60" rx="3"/><rect x="33" y="44" width="34" height="12"/></g></svg>';

// ================= 2005 blades =================
function bPanels(cid) {
  const p = xmbItems(cid);
  if (cid === 'games') p.unshift({ profile: true, v: 'ach', label: 'Profile' });
  return p;
}
function bPanelHTML(e, i) {
  if (e.profile) {
    const name = typeof v21Name === 'function' ? v21Name() : 'Hollywood', sc = typeof arcScore === 'function' ? arcScore() : 0;
    const last = [...S.items.filter(x => x.category === 'game')].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)).slice(0, 4);
    return `<button class="bc profile" data-i="${i}" ${attrsOf(e)}><span class="bpf"><b class="bn">${esc(name)}</b><span class="bsc">${sc.toLocaleString()} <i>★</i></span><small>Latest games</small><span class="bth">${last.map(g => xmbThumb(g)).join('')}</span><b class="bsi">Signed in</b><small>Hollywood Arcade</small></span></button>`;
  }
  const src = e.it ? coverOf(e.it) : '';
  const body = e.it ? `<span class="bcv"><b>${esc((e.it.name[0] || '?').toUpperCase())}</b>${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}</span>` : `<span class="bic">${xsvg(e.ic)}</span>`;
  return `<button class="bc" data-i="${i}" ${attrsOf(e)}>${body}<span class="bcl"><b>${esc(e.label)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ''}</span></button>`;
}
function bHome() {
  const cats = xmbCats();
  if (!cats.find(c => c.id === bld)) bld = 'games';
  const si = cats.findIndex(c => c.id === bld), pans = bPanels(bld);
  if (bpan >= pans.length) bpan = 0;
  return `<div class="blades" style="--sel:${si}">
    <nav class="bl" aria-label="Blades">${cats.map((c, i) => `<button class="bli${i === si ? ' sel' : ''}${i > si ? ' aft' : ''}" tabindex="-1" data-i="${i}" data-cat="${esc(c.id)}" style="--k:${i - si}">${esc(c.label)}</button>`).join('')}</nav>
    <div class="bcards" id="bcards" style="--p:${bpan}">${pans.map(bPanelHTML).join('')}</div>
    <div class="bhint"><i>A</i> Select<i>B</i> Back</div>${logoSVG}
  </div>`;
}
function bSync() {
  const cs = $$('.bcards .bc'); cs.forEach((c, i) => { c.dataset.d = Math.max(-1, Math.min(7, i - bpan)); c.classList.toggle('sel', i === bpan); });
  const bx = $('#bcards'); if (bx) bx.style.setProperty('--p', bpan);
}
function bSelectBlade(id) {
  if (id === bld) return;
  bld = id; bpan = 0;
  const cats = xmbCats(), si = cats.findIndex(c => c.id === id);
  const bl = $('.blades'); if (bl) bl.style.setProperty('--sel', si);
  $$('.bli').forEach((b, i) => { b.classList.toggle('sel', i === si); b.classList.toggle('aft', i > si); b.style.setProperty('--k', i - si); });
  const bx = $('#bcards'); if (bx) { bx.classList.remove('swap'); void bx.offsetWidth; bx.innerHTML = bPanels(id).map(bPanelHTML).join(''); bx.classList.add('swap'); }
  bSync();
}

// ================= 2011 tiles =================
function nCover(e, cls, big) {
  const src = e.it ? coverOf(e.it) : '';
  if (e.it) return `<button class="nti cv ${cls}" ${attrsOf(e)}><i class="nlt">${esc((e.it.name[0] || '?').toUpperCase())}</i>${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}<span class="nl">${esc(e.label)}</span></button>`;
  return `<button class="nti gr ${cls}" ${attrsOf(e)}><span class="ng">${xsvg(e.ic)}</span><span class="nl">${esc(e.label)}</span></button>`;
}
function nTabs() { return [{ id: 'home', label: 'home' }, ...xmbCats().map(c => ({ id: c.id, label: c.label.toLowerCase() }))]; }
function nPane(tab) {
  if (tab === 'home') {
    const g = [...S.items.filter(x => x.category === 'game')].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (b.cover ? 1 : 0) - (a.cover ? 1 : 0));
    const play = (it, pre) => ({ act: 'play', id: it.id, label: (pre || '') + it.name, it });
    const run = window.__running;
    const gm = (n, cls, pre) => g[n] ? nCover(play(g[n], pre), cls) : '';
    const res = run && run.running ? nCover({ act: 'resume', label: 'Resume ' + (run.name || 'game'), ic: 'games' }, 'a') : (g[0] ? nCover(play(g[0], 'Play '), 'a') : nCover({ act: 'scanAll', label: 'Scan my games', ic: 'games' }, 'a'));
    return res + gm(1, 'h') + gm(2, 's1') + gm(3, 's2') +
      nCover({ v: 'ach', label: 'Achievements', ic: 'ach' }, 'p') + nCover({ v: 'store', label: 'Store', ic: 'store' }, 'q') +
      nCover({ v: 'apps', label: 'Apps', ic: 'apps' }, 'r') + nCover({ v: 'watch', label: 'Watch', ic: 'watch' }, 'w') +
      (g[4] ? gm(4, 'g') : nCover({ v: 'games', label: 'Games', ic: 'games' }, 'g')) + nCover({ v: 'music', label: 'Music', ic: 'music' }, 'm');
  }
  return xmbItems(tab).map((e, i) => nCover(e, i === 0 ? 'first' : '')).join('');
}
function nHome() {
  const tabs = nTabs();
  if (!tabs.find(t => t.id === ntab)) ntab = 'home';
  const name = typeof v21Name === 'function' ? v21Name() : 'Hollywood';
  return `<div class="ntiles">
    <div class="nwho"><span>${esc(name)}</span><b>${(typeof arcScore === 'function' ? arcScore() : 0).toLocaleString()} ★</b></div>
    <nav class="ntabs" aria-label="Tabs">${tabs.map(t => `<button class="nt${t.id === ntab ? ' sel' : ''}" data-tab="${esc(t.id)}">${esc(t.label)}</button>`).join('')}</nav>
    <button class="nsearch" data-act="gsearch" aria-label="Search"><svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">${XI.search}</svg></button>
    <div class="npane ${ntab === 'home' ? 'is-home' : 'is-list'}" id="npane">${nPane(ntab)}</div>
    <div class="nhint"><i>A</i> Select<i>B</i> Back</div>
  </div>`;
}
function nSelectTab(id) {
  if (id === ntab) return;
  ntab = id;
  $$('.nt').forEach(b => b.classList.toggle('sel', b.dataset.tab === id));
  const p = $('#npane'); if (p) { p.className = 'npane swap ' + (id === 'home' ? 'is-home' : 'is-list'); p.innerHTML = nPane(id); }
}

// ================= wiring =================
{ const _h = home; home = function () { return is360() ? bHome() : is360n() ? nHome() : _h.apply(this, arguments); }; }

document.addEventListener('focusin', (e) => {
  if (view !== 'home' || !e.target.closest) return;
  if (is360()) {
    const l = e.target.closest('.bli'); const c = e.target.closest('.bc');
    if (l) { bSelectBlade(l.dataset.cat); const f = $('.bcards .bc'); if (f) f.focus({ preventScroll: true }); }
    else if (c) { bpan = +c.dataset.i; bSync(); }
  } else if (is360n()) {
    const t = e.target.closest('.nt');
    if (t) { nOnTile = false; nSelectTab(t.dataset.tab); } else if (e.target.closest('.nti')) nOnTile = true;
  }
});

{
  const _m = move;
  move = function (dir) {
    if (view !== 'home' || document.querySelector('dialog[open]') || !(is360() || is360n())) return _m.apply(this, arguments);
    const a = document.activeElement;
    if (is360()) {
      const panels = $$('.bcards .bc'), cats = xmbCats(), bi = cats.findIndex(c => c.id === bld);
      const i = panels.indexOf(a);
      if (i < 0) { if (a && a.closest && a.closest('.player')) return _m.apply(this, arguments); (panels[bpan] || panels[0])?.focus({ preventScroll: true }); return; }
      if (dir === 'left' || dir === 'right') { const n = panels[i + (dir === 'left' ? -1 : 1)]; if (n) n.focus({ preventScroll: true }); return; }
      const nb = cats[bi + (dir === 'up' ? -1 : 1)];
      if (nb) { bSelectBlade(nb.id); $('.bcards .bc')?.focus({ preventScroll: true }); } else if (dir === 'down') return _m.apply(this, arguments);
      return;
    }
    const tabs = $$('.ntabs .nt'), tiles = $$('.npane .nti');
    const onTab = a && a.classList && a.classList.contains('nt');
    if (onTab) {
      const ti = tabs.indexOf(a);
      if (dir === 'left' || dir === 'right') { const n = tabs[ti + (dir === 'left' ? -1 : 1)]; if (n) n.focus({ preventScroll: true }); }
      else if (dir === 'down') { (tiles[0] || null)?.focus({ preventScroll: true }); }
      return;
    }
    if (a && a.classList && a.classList.contains('nti')) {
      focusMove(tiles, dir);
      if (document.activeElement === a && dir === 'up') ($('.ntabs .nt.sel') || tabs[0])?.focus({ preventScroll: true });
      return;
    }
    if (a && a.closest && a.closest('.player')) return _m.apply(this, arguments);
    ($('.ntabs .nt.sel') || tabs[0])?.focus({ preventScroll: true });
  };
}

// Enter / A on a tab opens the first tile; a mouse click only selects it
document.addEventListener('click', (e) => {
  if (view !== 'home' || !is360n()) return;
  const t = e.target.closest('.nt'); if (!t) return;
  e.stopPropagation(); t.focus({ preventScroll: true });
  if (e.detail === 0) $('.npane .nti')?.focus({ preventScroll: true });
}, true);

{
  const _r = render;
  render = function () {
    const r = _r.apply(this, arguments);
    try {
      const st = uiStyle();
      document.body.classList.toggle('ui-x360', st === 'x360');
      document.body.classList.toggle('ui-x360n', st === 'x360n');
      if (view === 'home' && (st === 'x360' || st === 'x360n')) {
        const fromSub = xmbPrev360 && xmbPrev360 !== 'home';
        if (fromSub && typeof ogLast === 'string') {
          if (st === 'x360' && xmbCats().some(c => c.id === ogLast) && ogLast !== bld) { bld = ogLast; bpan = 0; const k = $('.blades'); if (k) { const t = document.createElement('div'); t.innerHTML = bHome(); k.replaceWith(t.firstElementChild); } }
          if (st === 'x360n' && nTabs().some(c => c.id === ogLast) && ogLast !== ntab) { ntab = ogLast; const k = $('.ntiles'); if (k) { const t = document.createElement('div'); t.innerHTML = nHome(); k.replaceWith(t.firstElementChild); } }
        }
        if (st === 'x360') bSync();
        const a = document.activeElement;
        if (padOn || !a || a === document.body || !a.isConnected) {
          const t = st === 'x360' ? $('.bcards .bc.sel') : ((nOnTile && $('.npane .nti')) || $('.ntabs .nt.sel'));
          if (t) t.focus({ preventScroll: true });
        }
      }
      xmbPrev360 = view;
    } catch { /* styling must never break the page */ }
    return r;
  };
}
var xmbPrev360 = '';
