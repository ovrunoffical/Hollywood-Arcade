// Hollywood Arcade 3.2: the "Deck" style (your avatar lives in v37.js):
// a single row of square tiles with a big selected tile, a title beside it, and a details panel under it.
//   left / right : move along the row     up : top bar (search, alerts, settings, power)     A : open     B : back

// ---------------- Deck ----------------
let dk = -1, dkPrev = '', dkOnTile = true;
const isDeck = () => uiStyle() === 'ps4';
const dkAttrs = (e) => e.act ? `data-act="${e.act}"${e.id ? ` data-id="${esc(e.id)}"` : ''}` : `data-act="goto" data-v="${e.v}"${e.plug ? ` data-plug="${esc(e.plug)}"` : ''}`;

function dkEntries() {
  const e = [];
  e.push({ v: 'ach', label: 'Achievements', ic: 'ach' }, { v: 'music', label: 'Music', ic: 'music' }, { v: 'discord', label: 'Discord', ic: 'discord' }, { v: 'watch', label: 'Watch', ic: 'watch' }, { v: 'store', label: 'Store', ic: 'store' }, { v: 'apps', label: 'Apps', ic: 'apps' });
  if (typeof PLUG !== 'undefined') for (const id of Object.keys(PLUG.pages)) e.push({ v: 'plug', plug: id, label: PLUG.pages[id].title, ic: 'plug' });
  e.push({ v: 'games', label: 'All games', ic: 'games' });
  const run = window.__running;
  if (run && run.running) e.push({ act: 'resume', label: run.name || 'Resume', ic: 'games', resume: true });
  const games = [...S.items.filter(i => i.category === 'game')].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.name.localeCompare(b.name));
  for (const g of games.slice(0, 60)) e.push({ act: 'play', id: g.id, label: g.name, it: g });
  return e;
}
const dkFirstGame = (es) => Math.max(0, es.findIndex(x => x.it || x.resume));

function dkInfo(e) {
  if (!e || !e.it) return e && e.resume ? `<div class="dkh">Playing now</div><div class="dkline">Press A to jump back in.</div>` : '';
  const it = e.it, ach = it.ach && it.ach.t ? it.ach : null;
  const pct = ach ? Math.round(ach.u / ach.t * 100) : 0;
  const when = it.lastPlayed ? new Date(it.lastPlayed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Never';
  const fp = typeof fmtPlay === 'function' && it.playtime ? fmtPlay(it.playtime) : '-';
  return `<div class="dkh">Achievements</div>
    <div class="dkach">${ach ? `<div class="dkprog"><span>Progress</span><span>${pct}%</span><i><b style="width:${pct}%"></b></i></div><div class="dkcnt"><b>${ach.u}</b> of ${ach.t} unlocked</div>` : `<div class="dkline">Not checked yet. Open the game's info to look for achievements.</div>`}</div>
    <div class="dkh">Details</div>
    <div class="dkstats"><div><small>Last played</small><b>${esc(when)}</b></div><div><small>Launches</small><b>${it.plays || 0}</b></div><div><small>Time played</small><b>${esc(fp)}</b></div><div><small>From</small><b>${esc(it.source || '-')}</b></div></div>`;
}
function dkTile(e, i) {
  const src = e.it ? coverOf(e.it) : '';
  const art = e.it ? `<span class="dka"><i>${esc((e.it.name[0] || '?').toUpperCase())}</i>${artImgHTML(e.it, false)}</span>` : `<span class="dka fn">${xsvg(e.ic)}</span>`;
  return `<button class="dkt" data-i="${i}" ${dkAttrs(e)}>${art}<span class="dkb">${e.it || e.resume ? 'Start' : 'Open'}</span><span class="dkn">${esc(e.label)}</span></button>`;
}
function deckHome() {
  const es = dkEntries();
  if (dk < 0 || dk >= es.length) dk = dkFirstGame(es);
  const name = typeof v21Name === 'function' ? v21Name() : 'Hollywood', sc = typeof arcScore === 'function' ? arcScore() : 0;
  const btn = (attrs, svg, label) => `<button class="dkq" ${attrs} aria-label="${label}"><svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">${svg}</svg></button>`;
  return `<div class="deck" style="--i:${dk}">
    <div class="dktop">
      <span class="dkl">${btn('data-act="gsearch"', XI.search, 'Search')}${btn('data-v22="notes"', '<path d="M12 22a2.400 2.400 0 0 0 2.400-2.400h-4.800A2.400 2.400 0 0 0 12 22zm7-6.400V11a7 7 0 0 0-5.500-6.800V3.500a1.500 1.500 0 0 0-3 0v.7A7 7 0 0 0 5 11v4.600l-2 2v1h18v-1z"/>', 'Notifications')}${btn('data-act="gsettings"', XI.settings, 'Settings')}${btn('data-act="power-menu"', XI.power, 'Power')}</span>
      <button class="dkq dkme" data-act="goto" data-v="ach">${avatarSVG(null, 'dkav', true)}<span>${esc(name)}</span></button>
      <span class="dksc"><svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">${XI.ach}</svg> ${sc.toLocaleString()}</span>
      <span class="dkclock" id="xclock">${clockText()}</span>
    </div>
    <div class="dkrow" id="dkrow">${es.map(dkTile).join('')}</div>
    <div class="dkinfo" id="dkinfo">${dkInfo(es[dk])}</div>
    <i class="dkwave w1"></i><i class="dkwave w2"></i>
  </div>`;
}
{ const _h = home; home = function () { return isDeck() ? deckHome() : _h.apply(this, arguments); }; }

function dkSync() {
  const t = $$('.dkrow .dkt'); t.forEach((el, i) => el.classList.toggle('sel', i === dk));
  const d = $('.deck'); if (d) d.style.setProperty('--i', dk);
  const inf = $('#dkinfo'); if (inf) inf.innerHTML = dkInfo(dkEntries()[dk]);
}
document.addEventListener('focusin', (e) => {
  if (!isDeck() || view !== 'home' || !e.target.closest) return;
  const t = e.target.closest('.dkt');
  if (t) { dkOnTile = true; const n = +t.dataset.i; if (n !== dk) { dk = n; dkSync(); } }
  else if (e.target.closest('.dktop')) dkOnTile = false;
});
{
  const _m = move;
  move = function (dir) {
    if (!isDeck() || view !== 'home' || document.querySelector('dialog[open]')) return _m.apply(this, arguments);
    const a = document.activeElement, tiles = $$('.dkrow .dkt'), tops = $$('.dktop button');
    if (a && a.classList && a.classList.contains('dkt')) {
      const i = tiles.indexOf(a);
      if (dir === 'left' || dir === 'right') { const n = tiles[i + (dir === 'left' ? -1 : 1)]; if (n) n.focus({ preventScroll: true }); }
      else if (dir === 'up') (tops[0])?.focus({ preventScroll: true });
      else if (dir === 'down') return _m.apply(this, arguments);
      return;
    }
    if (a && a.closest && a.closest('.dktop')) {
      const i = tops.indexOf(a);
      if (dir === 'left' || dir === 'right') { const n = tops[i + (dir === 'left' ? -1 : 1)]; if (n) n.focus({ preventScroll: true }); }
      else if (dir === 'down') (tiles[dk] || tiles[0])?.focus({ preventScroll: true });
      return;
    }
    if (a && a.closest && a.closest('.player')) return _m.apply(this, arguments);
    (tiles[dk] || tiles[0])?.focus({ preventScroll: true });
  };
}
{
  const _r = render;
  render = function () {
    const r = _r.apply(this, arguments);
    try {
      const d = isDeck();
      document.body.classList.toggle('ui-ps4', d);
      if (d && view === 'home') {
        if (dkPrev && dkPrev !== 'home' && typeof ogLast === 'string') {
          const es = dkEntries(), j = es.findIndex(x => x.v === ogLast);
          if (j >= 0 && j !== dk) { dk = j; const k = $('.deck'); if (k) { const t = document.createElement('div'); t.innerHTML = deckHome(); k.replaceWith(t.firstElementChild); } }
        }
        dkSync();
        const a = document.activeElement;
        if (padOn || !a || a === document.body || !a.isConnected) ((dkOnTile ? $('.dkrow .dkt.sel') : $('.dktop button')) || $('.dkrow .dkt'))?.focus({ preventScroll: true });
      }
      dkPrev = view;
    } catch { /* styling must never break the page */ }
    return r;
  };
}
