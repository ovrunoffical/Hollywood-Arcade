// Hollywood Arcade 3.2: "Waves": a cross-shaped menu with soft ribbons (our own icons and artwork).
// A row of categories runs across the screen. The one you are on opens a column of things underneath it.
//   left / right : change category     up / down : pick something     A / Enter : open it     B / Esc : back

let xmbCat = 'games', xmbItem = 0, xmbOnItem = false, xmbPrev = '';
const XI = {
  games: '<path d="M7 7h10a5 5 0 0 1 4.800 6.400l-1 3.600a2.600 2.600 0 0 1-4.300 1.200L15 16.500H9l-1.500 1.700a2.600 2.600 0 0 1-4.300-1.200l-1-3.600A5 5 0 0 1 7 7zm.2 3v1.400H5.800v1.800h1.400v1.400H9v-1.400h1.400v-1.800H9V10zm9.300.6a1.100 1.100 0 1 0 0 2.200 1.100 1.100 0 0 0 0-2.200zm2.200 2.200a1.100 1.100 0 1 0 0 2.200 1.100 1.100 0 0 0 0-2.200z"/>',
  apps: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  store: '<path d="M7 7V6a5 5 0 0 1 10 0v1h3l-1 14H5L4 7zm2 0h6V6a3 3 0 0 0-6 0z"/>',
  watch: '<path fill-rule="evenodd" d="M3 4h18v16H3zm2 2v2h2V6zm0 4v2h2v-2zm0 4v2h2v-2zm12-8v2h2V6zm0 4v2h2v-2zm0 4v2h2v-2zM9 6v12h6V6z"/>',
  ach: '<path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.900V17h3v2H8v-2h3v-2.100A5 5 0 0 1 8.300 12H8a4 4 0 0 1-4-4V5h3zM6 7v1a2 2 0 0 0 1 1.700V7zm12 0h-1v2.700A2 2 0 0 0 18 8z"/>',
  music: '<path d="M9 4h10v12.500a3 3 0 1 1-2-2.800V8H11v10.500a3 3 0 1 1-2-2.800z"/>',
  discord: '<path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
  plug: '<path d="M12 2l3 7 7 .8-5.300 4.700 1.600 7.500L12 18l-6.300 4 1.600-7.500L2 9.800 9 9z"/>',
  settings: '<path fill-rule="evenodd" d="M9 4h6a1 1 0 0 1 1 1v2h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4V5a1 1 0 0 1 1-1zm1 2v1h4V6zM4 12v2h5v-1h6v1h5v-2z"/>',
  search: '<path d="M10 3a7 7 0 1 0 4.200 12.600l4.900 4.900 1.400-1.400-4.900-4.900A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/>',
  power: '<path d="M11 2h2v10h-2zM6.300 5.300l1.400 1.400a7 7 0 1 0 8.600 0l1.400-1.400a9 9 0 1 1-11.400 0z"/>',
  style: '<path d="M12 3a9 9 0 1 0 0 18c1.600 0 2-1 1.500-2-.6-1.200.2-2.500 1.700-2.500H17a4 4 0 0 0 4-4C21 6.700 17 3 12 3zM7.500 11a1.300 1.300 0 1 1 0-2.600 1.300 1.300 0 0 1 0 2.600zm3-3.500a1.300 1.300 0 1 1 0-2.600 1.300 1.300 0 0 1 0 2.600zm4 0a1.300 1.300 0 1 1 0-2.600 1.300 1.300 0 0 1 0 2.600z"/>',
  open: '<path d="M8 5l9 7-9 7z"/>',
};
const xsvg = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${XI[k] || XI.open}</svg>`;

function xmbCats() {
  const c = [{ id: 'games', label: 'Games' }, { id: 'apps', label: 'Apps' }, { id: 'store', label: 'Store' }, { id: 'watch', label: 'Watch' },
    { id: 'music', label: 'Music' }, { id: 'discord', label: 'Discord' }];
  if (typeof PLUG !== 'undefined') for (const id of Object.keys(PLUG.pages)) c.push({ id: 'plug:' + id, label: PLUG.pages[id].title, ic: 'plug', plug: id });
  c.push({ id: 'settings', label: 'Settings' });
  return c;
}

function xmbThumb(it) {
  const isIco = it.category === 'app' && !it.art && !it.cover && it.icon;
  const src = isIco ? toURL(it.icon) : it.cover ? toURL(it.cover) : it.art ? toURL(it.art) : '';
  return `<span class="xic thumb${isIco ? ' ico' : ''}"><b>${esc((it.name[0] || '?').toUpperCase())}</b>${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}</span>`;
}

function xmbItems(cid) {
  const games = S.items.filter(i => i.category === 'game'), apps = S.items.filter(i => i.category === 'app');
  const run = window.__running, out = [];
  const open = (v, label, sub, ic) => ({ v, label, sub, ic: ic || v });
  if (cid === 'games') {
    if (run && run.running) out.push({ act: 'resume', label: 'Resume ' + (run.name || 'game'), sub: 'Playing now', ic: 'games' });
    out.push(open('games', 'All games', games.length + ' in your library', 'games'));
    const list = [...games].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.name.localeCompare(b.name));
    for (const g of list) out.push({ act: 'play', id: g.id, label: g.name, sub: g.lastPlayed ? 'Played recently' : (g.source || ''), it: g });
    out.push({ act: 'scanAll', label: 'Scan all my games', sub: 'Steam, Epic, Xbox and more', ic: 'games' }, { act: 'scanFolder', label: 'Add games from a folder', ic: 'games' }, { act: 'add-game', label: 'Add a game', sub: 'By hand', ic: 'games' }, { act: 'add-emu', label: 'Add an emulator', ic: 'games' });
  } else if (cid === 'apps') {
    out.push(open('apps', 'All apps', apps.length + ' ready', 'apps'));
    for (const a of [...apps].sort((x, y) => (y.lastPlayed || 0) - (x.lastPlayed || 0) || x.name.localeCompare(y.name))) out.push({ act: 'play', id: a.id, label: a.name, sub: a.source && !/^windows$/i.test(a.source) ? a.source : '', it: a });
    out.push({ act: 'add-app', label: 'Add an app', sub: 'A program or a website', ic: 'apps' }, { act: 'essentials', label: 'Add my essentials', sub: 'Browser, file explorer', ic: 'apps' });
  } else if (cid === 'store') {
    out.push(open('store', 'Open the Store', 'Find games', 'store'), { act: 'add-store', label: 'Add a store', sub: 'An app or website', ic: 'store' });
    for (const s of S.items.filter(i => i.category === 'store')) out.push({ act: 'play', id: s.id, label: s.name, sub: 'Store', it: s });
  }
  else if (cid === 'watch') out.push(open('watch', 'Open Watch', 'Jellyfin, live TV and more', 'watch'));
  else if (cid === 'music') out.push(open('music', 'Open Music', 'Now playing', 'music'));
  else if (cid === 'discord') out.push(open('discord', 'Open Discord', '', 'discord'));
  else if (cid.startsWith('plug:')) out.push({ v: 'plug', plug: cid.slice(5), label: 'Open ' + ((PLUG.pages[cid.slice(5)] || {}).title || 'plugin'), ic: 'plug' });
  else if (cid === 'settings') {
    out.push(open('settings', 'Settings', 'Everything about Arcade', 'settings'));
    out.push({ act: 'looks', label: 'Change look', sub: 'Pick how Arcade looks', ic: 'style' });
    for (const [k, n] of UI_STYLES) out.push({ style: k, label: 'Style: ' + n, sub: uiStyle() === k ? 'In use' : 'Switch to this look', ic: 'style' });
    out.push({ act: 'gsearch', label: 'Search', sub: 'Find a game', ic: 'search' }, { act: 'power-menu', label: 'Power', sub: 'Sleep, restart, shut down', ic: 'power' });
  }
  return out;
}

function xmbItemHTML(e, i) {
  const attrs = e.style ? `data-v33="style" data-v="${e.style}"` : e.act ? `data-act="${e.act}"${e.id ? ` data-id="${esc(e.id)}"` : ''}` : `data-act="goto" data-v="${e.v}"${e.plug ? ` data-plug="${esc(e.plug)}"` : ''}`;
  const ic = e.it ? xmbThumb(e.it) : `<span class="xic">${xsvg(e.ic)}</span>`;
  return `<button class="xmi" data-i="${i}" ${attrs}>${ic}<span class="xtx"><b>${esc(e.label)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ''}</span></button>`;
}

function xmbHome() {
  const cats = xmbCats();
  if (!cats.find(c => c.id === xmbCat)) xmbCat = 'games';
  const si = cats.findIndex(c => c.id === xmbCat);
  const items = xmbItems(xmbCat);
  if (xmbItem >= items.length) xmbItem = 0;
  const name = typeof v21Name === 'function' ? v21Name() : 'Hollywood';
  const sc = typeof arcScore === 'function' ? arcScore() : 0;
  return `<div class="xmb" style="--n:${cats.length}">
    <div class="xmb-stat"><span class="xs-who">${esc(name)}</span><span class="xs-sc">★ ${sc.toLocaleString()}</span><span class="xs-clock" id="xclock">${clockText()}</span></div>
    <nav class="xmb-cats" style="--sel:${si}" aria-label="Categories">${cats.map((c, i) => `<button class="xmc${i === si ? ' sel' : ''}" data-i="${i}" data-cat="${esc(c.id)}"><span class="xci">${xsvg(c.ic || c.id)}</span><span class="xcl">${esc(c.label)}</span></button>`).join('')}</nav>
    <div class="xmb-clip"><div class="xmb-items" id="xmbi" style="--cur:${xmbItem}">${items.map(xmbItemHTML).join('')}</div></div>
  </div>`;
}

{ const _h = home; home = function () { return uiStyle() === 'xmb' ? xmbHome() : _h.apply(this, arguments); }; }

// the moving background (ribbons and stars) lives outside the page so every screen in this style has it
function xmbBg() {
  if (document.getElementById('xmbbg')) return;
  const d = document.createElement('div'); d.id = 'xmbbg'; d.setAttribute('aria-hidden', 'true');
  const rib = (cls, y, a) => `<svg class="rib ${cls}" viewBox="0 0 1920 1080" preserveAspectRatio="none"><defs><linearGradient id="rg${cls}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".35" stop-color="#fff" stop-opacity="${a}"/><stop offset=".7" stop-color="#fff" stop-opacity="${a * 0.6}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><path fill="url(#rg${cls})" d="M-100 ${y + 120} C 300 ${y - 80}, 700 ${y + 60}, 1100 ${y + 10} S 1700 ${y + 60}, 2020 ${y + 200} L2020 ${y + 230} C1700 ${y + 120} 1300 ${y + 110} 1000 ${y + 100} S 300 ${y + 40} -100 ${y + 170} Z"/></svg>`;
  d.innerHTML = '<i class="stars"></i>' + rib('r1', 560, .42) + rib('r2', 600, .26) + rib('r3', 520, .16);
  document.body.prepend(d);
}

function xmbSync(focusFirst) {
  const items = $$('.xmb .xmi'); if (!items.length) return;
  const box = document.getElementById('xmbi'); if (box) box.style.setProperty('--cur', xmbItem);
  items.forEach((el, i) => el.classList.toggle('cur', i === xmbItem));
}

function xmbSelectCat(btn) {
  const id = btn.dataset.cat; if (id === xmbCat) return;
  xmbCat = id; xmbItem = 0;
  const cats = xmbCats(), si = cats.findIndex(c => c.id === id);
  $$('.xmb .xmc').forEach((b, i) => b.classList.toggle('sel', i === si));
  const nav = $('.xmb-cats'); if (nav) nav.style.setProperty('--sel', si);
  const box = document.getElementById('xmbi');
  if (box) { box.classList.remove('swap'); void box.offsetWidth; box.innerHTML = xmbItems(id).map(xmbItemHTML).join(''); box.classList.add('swap'); }
  xmbSync();
}

document.addEventListener('focusin', (e) => {
  if (uiStyle() !== 'xmb' || view !== 'home') return;
  const c = e.target.closest && e.target.closest('.xmc'); const it = e.target.closest && e.target.closest('.xmi');
  if (c) { xmbOnItem = false; xmbSelectCat(c); }
  else if (it) { xmbOnItem = true; xmbItem = +it.dataset.i; xmbSync(); }
});

// moving around: the cross
{
  const _m = move;
  move = function (dir) {
    if (uiStyle() !== 'xmb' || view !== 'home' || document.querySelector('dialog[open]')) return _m.apply(this, arguments);
    const a = document.activeElement, cats = $$('.xmb .xmc'), items = $$('.xmb .xmi');
    const onItem = a && a.classList && a.classList.contains('xmi'), onCat = a && a.classList && a.classList.contains('xmc');
    if (!onItem && !onCat) { const cur = $('.xmb .xmc.sel'); if (cur && !(a && a.closest && a.closest('.player'))) { cur.focus({ preventScroll: true }); return; } return _m.apply(this, arguments); }
    const ci = Math.max(0, cats.findIndex(c => c.classList.contains('sel')));
    if (dir === 'left' || dir === 'right') { const n = cats[ci + (dir === 'left' ? -1 : 1)]; if (n) n.focus({ preventScroll: true }); return; }
    if (onCat) { if (dir === 'down') { if (items[0]) items[0].focus({ preventScroll: true }); else return _m.apply(this, arguments); } return; }
    const i = items.indexOf(a);
    if (dir === 'up') { (i > 0 ? items[i - 1] : cats[ci]).focus({ preventScroll: true }); return; }
    if (dir === 'down') { if (items[i + 1]) items[i + 1].focus({ preventScroll: true }); else return _m.apply(this, arguments); }
  };
}

// Enter / A on a category opens its first entry; a mouse click only selects it
document.addEventListener('click', (e) => {
  if (uiStyle() !== 'xmb' || view !== 'home') return;
  const c = e.target.closest('.xmc'); if (!c) return;
  e.stopPropagation();
  c.focus({ preventScroll: true });
  if (e.detail === 0) { const f = $('.xmb .xmi'); if (f) f.click(); }
}, true);

// keep the cross where it was when other things redraw the page; coming back from a screen lands on its category
{
  const _r = render;
  render = function () {
    const r = _r.apply(this, arguments);
    try {
      const x = uiStyle() === 'xmb';
      if (x) xmbBg();
      if (x && view === 'home') {
        if (xmbPrev !== 'home' && typeof ogLast === 'string' && xmbCats().some(c => c.id === ogLast) && xmbPrev) { xmbCat = ogLast; xmbItem = 0; const k = $('.xmb'); if (k) { const t = document.createElement('div'); t.innerHTML = xmbHome(); k.replaceWith(t.firstElementChild); } }
        xmbSync();
        const a = document.activeElement;
        if (padOn || !a || a === document.body || !a.isConnected) { const target = (xmbOnItem && $('.xmb .xmi.cur')) || $('.xmb .xmc.sel'); if (target) target.focus({ preventScroll: true }); }
      }
      xmbPrev = view;
    } catch { /* styling must never break the page */ }
    return r;
  };
}
