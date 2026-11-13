// Hollywood Arcade 3.2: the "Shelf" style (light, one row of square game tiles, round buttons underneath).
//   left / right : move along the row     down : round buttons     up : your profile     A : open     B : back
let ns = -1, nsR = 0, nsPrev = '', nsZone = 't';
const isShelf = () => uiStyle() === 'nsw';
const NS_ROUND = [['ach', 'Achievements', 'ach', '#e4483f'], ['store', 'Store', 'store', '#f2a000'], ['apps', 'Apps', 'apps', '#2e6fe0'], ['music', 'Music', 'music', '#8a5ad8'], ['watch', 'Watch', 'watch', '#2aa89a'], ['discord', 'Discord', 'discord', '#5865f2']];

function nsEntries() {
  const e = [], run = window.__running;
  if (run && run.running) e.push({ act: 'resume', label: run.name || 'Resume', resume: true });
  const games = [...S.items.filter(i => i.category === 'game')].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.name.localeCompare(b.name));
  for (const g of games.slice(0, 40)) e.push({ act: 'play', id: g.id, label: g.name, it: g });
  e.push({ v: 'games', label: 'All games', all: true });
  return e;
}
const nsAttrs = (e) => e.act ? `data-act="${e.act}"${e.id ? ` data-id="${esc(e.id)}"` : ''}` : `data-act="goto" data-v="${e.v}"`;
function nsTile(e, i) {
  const art = e.it ? `<span class="nsa">${phHTML(e.it)}${artImgHTML(e.it)}</span>` : `<span class="nsa fn">${xsvg(e.all ? 'games' : 'games')}</span>`;
  return `<button class="nst" data-i="${i}" ${nsAttrs(e)} aria-label="${esc(e.label)}">${art}</button>`;
}
function nsRound() {
  const x = NS_ROUND.map(([v, l, ic, c]) => `<button class="nsr" data-act="goto" data-v="${v}" aria-label="${l}" title="${l}" style="--c:${c}">${xsvg(ic)}</button>`);
  if (typeof PLUG !== 'undefined') for (const id of Object.keys(PLUG.pages)) x.push(`<button class="nsr" data-act="goto" data-v="plug" data-plug="${esc(id)}" aria-label="${esc(PLUG.pages[id].title)}" title="${esc(PLUG.pages[id].title)}" style="--c:#6a7078">${xsvg('plug')}</button>`);
  x.push(`<button class="nsr" data-act="gsettings" aria-label="Settings" title="Settings" style="--c:#6a7078"><svg viewBox="0 0 24 24" fill="currentColor">${XI.settings}</svg></button>`);
  x.push(`<button class="nsr" data-act="power-menu" aria-label="Power" title="Power" style="--c:#6a7078"><svg viewBox="0 0 24 24" fill="currentColor">${XI.power}</svg></button>`);
  return x.join('');
}
function shelfHome() {
  const es = nsEntries(); if (ns < 0 || ns >= es.length) ns = 0;
  const name = typeof v21Name === 'function' ? v21Name() : 'Hollywood';
  return `<div class="shelf" style="--j:${Math.max(0, ns - 2)}">
    <button class="nsme" data-act="goto" data-v="ach" aria-label="${esc(name)}">${avatarSVG(null, 'nsav', true)}</button>
    <button class="nslook" data-act="looks" aria-label="Change look">Change look</button>
    <span class="nsclock" id="xclock">${clockText()}</span>
    <div class="nstitle" id="nstitle">${esc(es[ns].label)}</div>
    <div class="nsrow" id="nsrow">${es.map(nsTile).join('')}</div>
    <div class="nsrnd">${nsRound()}</div>
    <div class="nsfoot"><span><b class="nsk">B</b> Back</span><span><b class="nsk">A</b> Start</span></div>
  </div>`;
}
{ const _h = home; home = function () { return isShelf() ? shelfHome() : _h.apply(this, arguments); }; }

function nsSync() {
  const es = nsEntries();
  $$('.nsrow .nst').forEach((el, i) => el.classList.toggle('sel', i === ns));
  const d = $('.shelf'); if (d) d.style.setProperty('--j', Math.max(0, ns - 2));
  const t = $('#nstitle'); if (t && es[ns]) t.textContent = es[ns].label;
}
document.addEventListener('focusin', (e) => {
  if (!isShelf() || view !== 'home' || !e.target.closest) return;
  const t = e.target.closest('.nst');
  if (t) { nsZone = 't'; const n = +t.dataset.i; if (n !== ns) { ns = n; nsSync(); } }
  else if (e.target.closest('.nsrnd')) { nsZone = 'r'; nsR = $$('.nsrnd .nsr').indexOf(e.target.closest('.nsr')); }
  else if (e.target.closest('.nsme')) nsZone = 'm';
});
{
  const _m = move;
  move = function (dir) {
    if (!isShelf() || view !== 'home' || document.querySelector('dialog[open]')) return _m.apply(this, arguments);
    const a = document.activeElement, tiles = $$('.nsrow .nst'), rs = $$('.nsrnd .nsr'), f = (el) => el && el.focus({ preventScroll: true });
    if (a && a.classList && a.classList.contains('nst')) {
      const i = tiles.indexOf(a);
      if (dir === 'left' || dir === 'right') f(tiles[i + (dir === 'left' ? -1 : 1)]);
      else if (dir === 'down') f(rs[Math.min(nsR, rs.length - 1)] || rs[0]);
      else if (dir === 'up') f($('.nsme'));
      return;
    }
    if (a && a.classList && a.classList.contains('nsr')) {
      const i = rs.indexOf(a);
      if (dir === 'left' || dir === 'right') f(rs[i + (dir === 'left' ? -1 : 1)]);
      else if (dir === 'up') f(tiles[ns] || tiles[0]);
      return;
    }
    if (a && a.classList && a.classList.contains('nsme')) { if (dir === 'down') f(tiles[ns] || tiles[0]); return; }
    if (a && a.closest && a.closest('.player')) return _m.apply(this, arguments);
    f(tiles[ns] || tiles[0]);
  };
}
{
  const _r = render;
  render = function () {
    const r = _r.apply(this, arguments);
    try {
      const on = isShelf();
      document.body.classList.toggle('ui-nsw', on);
      if (on && view === 'home') {
        nsSync();
        const a = document.activeElement;
        if (padOn || !a || a === document.body || !a.isConnected) { const z = nsZone === 'r' ? $$('.nsrnd .nsr')[nsR] : nsZone === 'm' ? $('.nsme') : $('.nsrow .nst.sel'); f2(z || $('.nsrow .nst')); }
      }
      nsPrev = view;
    } catch { /* styling must never break the page */ }
    return r;
  };
  const f2 = (el) => el && el.focus({ preventScroll: true });
}
