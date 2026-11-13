// Hollywood Arcade 3.2: your avatar (made here, fully customisable) and the "Deck" style:
// a single row of square tiles with a big selected tile, a title beside it, and a details panel under it.
//   left / right : move along the row     up : top bar (search, alerts, settings, power)     A : open     B : back

// ---------------- avatar ----------------
const AV_SKIN = ['#fbe0c8', '#f0c8a0', '#e0a878', '#c58c5e', '#9a6a44', '#6b4430'];
const AV_HAIR = ['#1c1410', '#3b2417', '#6b4423', '#b07a3c', '#d9b36a', '#c0392b', '#7a4bc4', '#3a7bd5', '#e8e8e8'];
const AV_SHIRT = ['#4f8f2f', '#2f7fd0', '#d0392f', '#e0a020', '#8a4bc4', '#2aa89a', '#e8e8e8', '#2a2e38', '#e0668c'];
const AV_STYLES = [['short', 'Short'], ['long', 'Long'], ['curly', 'Curly'], ['bun', 'Bun'], ['cap', 'Cap'], ['none', 'Bald']];
const AV_TOPS = [['tee', 'T-shirt'], ['hoodie', 'Hoodie'], ['jacket', 'Jacket']];
const AV_FACES = [['smile', 'Smile'], ['grin', 'Grin'], ['happy', 'Happy'], ['cool', 'Cool']];
const AV_DEFAULT = { skin: AV_SKIN[1], hair: AV_HAIR[1], style: 'short', shirt: AV_SHIRT[0], top: 'tee', face: 'smile', pants: '#2b2f3a' };
const avatarOf = () => Object.assign({}, AV_DEFAULT, (S.settings && S.settings.avatar) || {});

let avUid = 0;
const _hex = (h) => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
const avMix = (h, o, p) => { const a = _hex(h), b = _hex(o); return '#' + a.map((x, i) => Math.round(x + (b[i] - x) * p).toString(16).padStart(2, '0')).join(''); };
const avLight = (h, p) => avMix(h, '#ffffff', p), avDark = (h, p) => avMix(h, '#000000', p);

function avatarSVG(a, cls, head) {
  a = a || avatarOf();
  const u = 'g' + (++avUid), sk = a.skin, hr = a.hair, sh = a.shirt;
  const defs = `<defs>
    <radialGradient id="${u}s" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="${avLight(sk, .32)}"/><stop offset=".55" stop-color="${sk}"/><stop offset="1" stop-color="${avDark(sk, .2)}"/></radialGradient>
    <linearGradient id="${u}t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${avLight(sh, .22)}"/><stop offset="1" stop-color="${avDark(sh, .25)}"/></linearGradient>
    <linearGradient id="${u}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9ccd2"/></linearGradient>
    <linearGradient id="${u}p" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${avLight(a.pants, .12)}"/><stop offset="1" stop-color="${avDark(a.pants, .35)}"/></linearGradient>
    <radialGradient id="${u}h" cx=".4" cy=".25" r=".9"><stop offset="0" stop-color="${avLight(hr, .28)}"/><stop offset="1" stop-color="${avDark(hr, .3)}"/></radialGradient>
  </defs>`;
  const S = `url(#${u}s)`, T = `url(#${u}t)`, W = `url(#${u}w)`, P = `url(#${u}p)`, H = `url(#${u}h)`;
  const hairBack = a.style === 'long' ? `<path d="M60 84 C52 140 58 156 72 160 L128 160 C142 156 148 140 140 84 Z" fill="${H}"/>` : a.style === 'bun' ? `<circle cx="100" cy="36" r="15" fill="${H}"/>` : a.style === 'curly' ? [[58, 70], [64, 96], [142, 70], [136, 96], [100, 38]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${H}"/>`).join('') : '';
  const hairFront = {
    short: `<path d="M61 80 C56 30 144 30 139 80 C134 62 120 54 100 55 C80 54 66 62 61 80 Z" fill="${H}"/>`,
    long: `<path d="M61 84 C54 30 146 30 139 84 C134 64 122 54 100 55 C78 54 66 64 61 84 Z" fill="${H}"/>`,
    curly: [[70, 52], [86, 42], [104, 40], [120, 44], [132, 56], [64, 68], [138, 68], [100, 52]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${H}"/>`).join(''),
    bun: `<path d="M61 80 C56 30 144 30 139 80 C134 62 120 54 100 55 C80 54 66 62 61 80 Z" fill="${H}"/>`,
    cap: `<path d="M60 72 C58 28 142 28 140 72 Z" fill="${T}"/><path d="M58 70 L160 70 C160 78 148 80 138 80 L58 80 Z" fill="${avDark(sh, .3)}"/>`,
    none: '',
  }[a.style] || '';
  const brows = a.style === 'cap' || a.face === 'cool' ? '' : `<path d="M74 72 Q84 67 94 72 M106 72 Q116 67 126 72" fill="none" stroke="${avDark(hr, .1)}" stroke-width="3" stroke-linecap="round"/>`;
  const eyes = a.face === 'happy' ? `<path d="M74 88 Q84 76 94 88 M106 88 Q116 76 126 88" fill="none" stroke="#2a1a12" stroke-width="3.6" stroke-linecap="round"/>`
    : a.face === 'cool' ? `<g class="av-eyes"><path d="M72 86 H95 M105 86 H128" stroke="#2a1a12" stroke-width="4" stroke-linecap="round"/></g>`
    : `<g class="av-eyes"><ellipse cx="84" cy="87" rx="5.2" ry="6.4" fill="#25160f"/><ellipse cx="116" cy="87" rx="5.2" ry="6.4" fill="#25160f"/><circle cx="85.8" cy="84.6" r="1.8" fill="#fff"/><circle cx="117.8" cy="84.6" r="1.8" fill="#fff"/></g>`;
  const mouth = a.face === 'grin' ? `<path d="M84 103 Q100 124 116 103 Z" fill="#fff" stroke="#3a2016" stroke-width="2.4" stroke-linejoin="round"/><path d="M90 110 Q100 120 110 110" fill="#c0504a" stroke="none"/>`
    : a.face === 'cool' ? `<path d="M88 106 Q102 111 114 102" fill="none" stroke="#3a2016" stroke-width="3" stroke-linecap="round"/>`
    : `<path d="M86 104 Q100 117 114 104" fill="none" stroke="#3a2016" stroke-width="3" stroke-linecap="round"/>`;
  const sleeve = (d) => `<path d="${d}" stroke="${T}" stroke-width="22" stroke-linecap="round" fill="none"/>`;
  const jacket = a.top === 'jacket', hood = a.top === 'hoodie';
  const torso = `<path d="M60 152 Q60 134 80 134 L120 134 Q140 134 140 152 L144 220 Q144 228 135 228 L65 228 Q56 228 56 220 Z" fill="${jacket ? W : T}"/>` +
    (jacket ? `<path d="M60 152 Q60 134 80 134 L90 134 L96 228 L65 228 Q56 228 56 220 Z" fill="${T}"/><path d="M140 152 Q140 134 120 134 L110 134 L104 228 L135 228 Q144 228 144 220 Z" fill="${T}"/><path d="M90 134 L100 160 L110 134" fill="none" stroke="${avDark(sh, .35)}" stroke-width="2.4"/>` :
      hood ? `<rect x="80" y="196" width="40" height="22" rx="7" fill="${avDark(sh, .16)}"/><path d="M82 136 Q100 160 118 136 L112 132 Q100 148 88 132 Z" fill="${avDark(sh, .25)}"/><path d="M93 146 V170 M107 146 V170" stroke="#f0f0f0" stroke-width="2.4" stroke-linecap="round"/>` :
      `<path d="M84 134 Q100 150 116 134 Z" fill="${avDark(sh, .3)}"/>`);
  const body = `
    <ellipse cx="100" cy="326" rx="52" ry="7" fill="rgba(0,0,0,.28)"/>
    <g class="av-sway">
      <path d="M66 222 L96 222 L94 306 Q94 312 88 312 L74 312 Q68 312 68 306 Z" fill="${P}"/><path d="M104 222 L134 222 L132 306 Q132 312 126 312 L112 312 Q106 312 106 306 Z" fill="${P}"/>
      <path d="M62 306 Q62 296 80 298 L96 300 Q100 312 96 316 L66 316 Q60 316 62 306 Z" fill="#3a3d46"/><path d="M104 300 L120 298 Q138 296 138 306 Q140 316 134 316 L104 316 Q100 312 104 300 Z" fill="#3a3d46"/>
      <path d="M62 314 H98 M102 314 H138" stroke="#e8e8ea" stroke-width="3" stroke-linecap="round"/>
      <g class="av-larm">${sleeve('M66 150 Q52 180 56 212')}<circle cx="56" cy="222" r="10.5" fill="${S}"/><circle cx="47" cy="226" r="4.6" fill="${S}"/></g>
      ${torso}
      <rect x="90" y="120" width="20" height="20" rx="6" fill="${avDark(sk, .08)}"/>
      <g class="av-rarm">${sleeve('M134 150 L160 176')}
        <g class="av-wave">${sleeve('M160 176 L172 132')}<circle cx="174" cy="120" r="11" fill="${S}"/><circle cx="163" cy="116" r="4.8" fill="${S}"/><path d="M168 110 v-7 M175 108 v-9 M182 111 v-7" stroke="${S}" stroke-width="5" stroke-linecap="round"/></g></g>
    </g>`;
  const headSvg = `<g class="av-head">
    ${hairBack}
    <circle cx="62" cy="90" r="9" fill="${S}"/><circle cx="138" cy="90" r="9" fill="${S}"/>
    <ellipse cx="100" cy="84" rx="39" ry="43" fill="${S}"/>
    ${hairFront}${brows}${eyes}
    <path d="M97 94 Q100 99 103 94" fill="none" stroke="${avDark(sk, .25)}" stroke-width="2" stroke-linecap="round" opacity=".7"/>
    ${mouth}
    <ellipse cx="76" cy="100" rx="7" ry="4.2" fill="#e86a5a" opacity=".24"/><ellipse cx="124" cy="100" rx="7" ry="4.2" fill="#e86a5a" opacity=".24"/>
  </g>`;
  const vb = head ? '48 30 104 108' : '0 0 200 340';
  return `<svg class="av ${cls || ''}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}${head ? '' : body}${headSvg}</svg>`;
}

function avatarRow() {
  return `<div class="mixh">Avatar</div><div class="setting"><div><b>Your avatar</b><small>Shown in the Blades, Tiles and Deck styles. Make it look like you.</small></div><div class="ctl"><span class="avprev">${avatarSVG(null, '', true)}</span><button class="btn" data-v36="avatar">Customise</button></div></div>`;
}
{ const _s = v2Settings; v2Settings = function () { return avatarRow() + _s.apply(this, arguments); }; }

function avatarDialog() {
  const a = avatarOf();
  const sw = (key, list) => list.map(c => `<button type="button" class="avsw${a[key] === c ? ' on' : ''}" data-av="${key}" data-val="${c}" style="background:${c}" aria-label="${key} colour"></button>`).join('');
  const ch = (key, list) => list.map(([k, n]) => `<button type="button" class="chip${a[key] === k ? ' on' : ''}" data-av="${key}" data-val="${k}">${n}</button>`).join('');
  v21show(`<h2>Your avatar</h2><div class="avedit"><div class="avbig">${avatarSVG(a)}</div><div class="avopts">
    <div class="avr"><b>Skin</b><div>${sw('skin', AV_SKIN)}</div></div>
    <div class="avr"><b>Hair</b><div>${ch('style', AV_STYLES)}</div></div>
    <div class="avr"><b>Hair colour</b><div>${sw('hair', AV_HAIR)}</div></div>
    <div class="avr"><b>Top</b><div>${ch('top', AV_TOPS)}</div></div>
    <div class="avr"><b>Top colour</b><div>${sw('shirt', AV_SHIRT)}</div></div>
    <div class="avr"><b>Face</b><div>${ch('face', AV_FACES)}</div></div></div></div>`,
  [{ label: 'Random', close: false, fn: () => { const r = (l) => l[Math.floor(Math.random() * l.length)]; S.settings.avatar = { skin: r(AV_SKIN), hair: r(AV_HAIR), style: r(AV_STYLES)[0], shirt: r(AV_SHIRT), top: r(AV_TOPS)[0], face: r(AV_FACES)[0], pants: AV_DEFAULT.pants }; save(); avatarDialog(); } },
    { label: 'Reset', close: false, fn: () => { delete S.settings.avatar; save(); avatarDialog(); } },
    { label: 'Done', primary: true, fn: () => render() }], true);
}
document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-v36="avatar"]'); if (o) { e.stopPropagation(); avatarDialog(); return; }
  const b = e.target.closest('[data-av]'); if (!b) return;
  e.stopPropagation();
  S.settings.avatar = Object.assign(avatarOf(), { [b.dataset.av]: b.dataset.val }); save(); avatarDialog();
  const again = document.querySelector(`#v21body [data-av="${b.dataset.av}"][data-val="${b.dataset.val}"]`); if (again) again.focus();
}, true);

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
