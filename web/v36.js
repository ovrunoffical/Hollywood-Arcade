// Hollywood Arcade 3.2: your avatar (made here, fully customisable) and the "Deck" style:
// a single row of square tiles with a big selected tile, a title beside it, and a details panel under it.
//   left / right : move along the row     up : top bar (search, alerts, settings, power)     A : open     B : back

// ---------------- avatar ----------------
const AV_SKIN = ['#fbe0c8', '#f0c8a0', '#e0a878', '#c58c5e', '#9a6a44', '#6b4430'];
const AV_HAIR = ['#1c1410', '#3b2417', '#6b4423', '#b07a3c', '#d9b36a', '#c0392b', '#7a4bc4', '#3a7bd5', '#e8e8e8'];
const AV_SHIRT = ['#4f8f2f', '#2f7fd0', '#d0392f', '#e0a020', '#8a4bc4', '#2aa89a', '#e8e8e8', '#2a2e38', '#e0668c'];
const AV_STYLES = [['short', 'Short'], ['long', 'Long'], ['curly', 'Curly'], ['bun', 'Bun'], ['cap', 'Cap'], ['none', 'Bald']];
const AV_TOPS = [['tee', 'T-shirt'], ['hoodie', 'Hoodie'], ['jacket', 'Jacket']];
const AV_FACES = [['smile', 'Smile'], ['grin', 'Grin'], ['cool', 'Cool']];
const AV_DEFAULT = { skin: AV_SKIN[1], hair: AV_HAIR[1], style: 'short', shirt: AV_SHIRT[0], top: 'tee', face: 'smile', pants: '#2b2f3a' };
const avatarOf = () => Object.assign({}, AV_DEFAULT, (S.settings && S.settings.avatar) || {});

function avatarSVG(a, cls, head) {
  a = a || avatarOf();
  const dk = (c, p) => `color-mix(in srgb, ${c} ${100 - p}%, #000 ${p}%)`;
  const hairBack = a.style === 'long' ? `<path d="M37 46 C34 80 36 92 44 94 L76 94 C84 92 86 80 83 46 Z" fill="${a.hair}"/>` : a.style === 'bun' ? `<circle cx="60" cy="19" r="10" fill="${a.hair}"/>` : '';
  const hairFront = {
    short: `<path d="M37 48 C34 18 86 18 83 48 C78 36 64 32 56 34 C48 36 40 40 37 48 Z" fill="${a.hair}"/>`,
    long: `<path d="M37 50 C34 18 86 18 83 50 C78 38 64 32 56 34 C48 36 40 42 37 50 Z" fill="${a.hair}"/>`,
    curly: [[40, 30], [50, 24], [62, 23], [72, 28], [79, 38], [41, 42], [78, 46], [60, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${a.hair}"/>`).join(''),
    bun: `<path d="M37 48 C34 18 86 18 83 48 C78 36 64 32 56 34 C48 36 40 40 37 48 Z" fill="${a.hair}"/>`,
    cap: `<path d="M36 42 C34 16 86 16 84 42 Z" fill="${a.shirt}"/><path d="M36 42 L92 42 C92 46 84 46 80 46 L36 46 Z" fill="${dk(a.shirt, 25)}"/>`,
    none: '',
  }[a.style] || '';
  const mouth = a.face === 'grin' ? `<path d="M50 58 Q60 71 70 58 Z" fill="#fff" stroke="#3a2418" stroke-width="1.6" stroke-linejoin="round"/>` : a.face === 'cool' ? `<path d="M52 61 Q62 64 69 58" fill="none" stroke="#3a2418" stroke-width="2" stroke-linecap="round"/>` : `<path d="M51 59 Q60 68 69 59" fill="none" stroke="#3a2418" stroke-width="2" stroke-linecap="round"/>`;
  const eyes = a.face === 'cool' ? `<path d="M46 48 H57 M63 48 H74" stroke="#2a1c14" stroke-width="3" stroke-linecap="round"/>` : `<circle cx="52" cy="49" r="2.8" fill="#2a1c14"/><circle cx="68" cy="49" r="2.8" fill="#2a1c14"/>`;
  const topExtra = a.top === 'hoodie' ? `<path d="M44 82 Q60 96 76 82 L72 78 Q60 90 48 78 Z" fill="${dk(a.shirt, 22)}"/><rect x="48" y="112" width="24" height="12" rx="4" fill="${dk(a.shirt, 14)}"/>` : a.top === 'jacket' ? `<path d="M60 80 V132" stroke="${dk(a.shirt, 30)}" stroke-width="2.4"/><path d="M48 80 L60 94 L72 80 L68 76 L60 84 L52 76 Z" fill="${dk(a.shirt, 20)}"/>` : `<path d="M50 80 Q60 90 70 80 L66 76 Q60 84 54 76 Z" fill="${dk(a.shirt, 18)}"/>`;
  const vb = head ? '24 14 72 68' : '0 0 120 200';
  return `<svg class="av ${cls || ''}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${head ? '' : `<ellipse cx="60" cy="193" rx="34" ry="5" fill="rgba(0,0,0,.25)"/>
    <rect x="42" y="124" width="16" height="62" rx="7" fill="${a.pants}"/><rect x="62" y="124" width="16" height="62" rx="7" fill="${a.pants}"/>
    <ellipse cx="48" cy="187" rx="12" ry="6" fill="#ececec"/><ellipse cx="72" cy="187" rx="12" ry="6" fill="#ececec"/>
    <path d="M34 80 Q34 74 44 74 L76 74 Q86 74 86 80 L88 128 Q88 134 80 134 L40 134 Q32 134 32 128 Z" fill="${a.shirt}"/>${topExtra}
    <path d="M34 82 L24 124" stroke="${a.shirt}" stroke-width="12" stroke-linecap="round"/><circle cx="23" cy="129" r="6.5" fill="${a.skin}"/>
    <path d="M86 82 L102 50" stroke="${a.shirt}" stroke-width="12" stroke-linecap="round"/><circle cx="105" cy="43" r="7" fill="${a.skin}"/>
    <rect x="53" y="64" width="14" height="14" fill="${a.skin}"/>`}
    ${hairBack}
    <circle cx="38" cy="52" r="5" fill="${a.skin}"/><circle cx="82" cy="52" r="5" fill="${a.skin}"/>
    <ellipse cx="60" cy="50" rx="22" ry="25" fill="${a.skin}"/>
    ${hairFront}
    <path d="M45 42 Q52 39 57 42 M63 42 Q68 39 75 42" fill="none" stroke="${a.hair}" stroke-width="2.2" stroke-linecap="round" opacity="${a.style === 'none' || a.style === 'cap' ? 1 : .0}"/>
    ${eyes}${mouth}<ellipse cx="45" cy="57" rx="4" ry="2.6" fill="#e86a5a" opacity=".22"/><ellipse cx="75" cy="57" rx="4" ry="2.6" fill="#e86a5a" opacity=".22"/>
  </svg>`;
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
