// Hollywood Arcade 3.2: Orb, take two. The home screen is one big glowing orb with a column of small orbs and label bars;
// Games, Apps and Music are framed list screens with an orb preview and an info panel. Colours follow your accent and background.
let oxSel = 0, oxPrev = '', oxRow = 0, oxRows = [];
const isOrb = () => uiStyle() === 'og';
const OX_H = '<svg class="ox-h" viewBox="0 0 100 100" aria-hidden="true"><rect x="25" y="19" width="16" height="62" rx="3"/><rect x="59" y="19" width="16" height="62" rx="3"/><rect x="25" y="43" width="50" height="14" rx="3"/></svg>';

// ---------------- home ----------------
function oxHome() {
  const ents = ogEntries();
  if (oxPrev && oxPrev !== 'home') { const j = ents.findIndex(e => e.v === ogLast); if (j >= 0) oxSel = j; }
  if (oxSel < 0 || oxSel >= ents.length) oxSel = 0;
  const name = typeof v21Name === 'function' ? v21Name() : 'Hollywood', sc = typeof arcScore === 'function' ? arcScore() : 0;
  const it = (e, i) => `<button class="ox-it" data-i="${i}" data-d="${i - oxSel}" style="--i:${i}" ${e.act ? `data-act="${e.act}"` : `data-act="goto" data-v="${e.v}"`}${e.plug ? ` data-plug="${esc(e.plug)}"` : ''}><i class="ox-orb"></i><span class="ox-bar"><b>${esc(e.label)}</b></span></button>`;
  return `<div class="og ox" id="oxhome">
    <i class="og-strands" aria-hidden="true"></i>
    <div class="og-top"><span class="og-who"><b>${esc(name)}</b> <em>★ ${sc.toLocaleString()}</em></span><span class="og-clock" id="xclock">${clockText()}</span></div>
    <div class="og-orb ox-big" aria-hidden="true"><i class="p p1"></i><i class="p p2"></i><i class="p p3"></i><div class="og-core"></div><div class="ox-mark">${OX_H}</div></div>
    <nav class="ox-list" style="--sel:${oxSel}" aria-label="Main menu">${ents.map(it).join('')}</nav>
    <div class="og-foot"><span class="ogk">a</span> select <span class="ogk b">b</span> back</div>
  </div>`;
}
function oxSync() {
  const l = document.querySelector('.ox-list'); if (!l) return;
  l.style.setProperty('--sel', oxSel);
  l.querySelectorAll('.ox-it').forEach(b => b.dataset.d = String(+b.dataset.i - oxSel));
}

// ---------------- list screens ----------------
const oxChips = (arr) => `<div class="ox-chips">${arr.filter(Boolean).map(c => `<span>${esc(String(c))}</span>`).join('')}</div>`;
function oxPreviewImg(it) {
  if (!it) return '<i class="ox-disc"></i>';
  if (it.kind === 'track') return it.cover ? `<img src="${esc(it.cover)}" alt="">` : '<i class="ox-disc"></i>';
  if (it.category === 'app' && !it.cover && !it.art && it.icon) return `<img class="ico" src="${esc(toURL(it.icon))}" alt="">`;
  const a = typeof artImgHTML === 'function' ? artImgHTML(it, true) : '';
  return a || `<span class="ox-let">${esc((it.name[0] || '?').toUpperCase())}</span>`;
}
function oxInfo(row) {
  if (!row) return '';
  if (row.act) return `<h2>${esc(row.label)}</h2><p>${esc(row.tip || '')}</p>`;
  const it = row.it;
  if (it.kind === 'track') return `<h2>${esc(it.title)}</h2>${oxChips([it.artist, it.album])}<p>${row.on ? 'Playing now.' : 'Press A to play this song.'}</p>`;
  const app = it.category === 'app', site = it.site ? it.site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '') : '';
  const chips = app ? [it.source, it.tagline, site] : [it.source, it.year, it.dev, ...(it.genres || []).slice(0, 3), it.playtime ? 'Played ' + fmtPlay(it.playtime) : '', it.plays ? it.plays + (it.plays === 1 ? ' launch' : ' launches') : ''];
  return `<h2>${esc(it.name)}</h2>${oxChips(chips)}<p>${esc(it.desc || (app ? 'No description yet.' : 'No description yet. Open Details and press Refresh info to look it up.'))}</p><div class="ox-btns"><button type="button" class="btn" data-act="info" data-id="${esc(it.id)}">Details</button></div>`;
}
function oxShow(k) {
  const row = oxRows[k]; if (!row) return;
  const pv = document.getElementById('oxpv'), inf = document.getElementById('oxinfo');
  if (pv) pv.innerHTML = oxPreviewImg(row.it);
  if (inf) inf.innerHTML = oxInfo(row);
}
function oxScreen(title, count, rows, head) {
  oxRows = rows;
  if (oxRow >= rows.length) oxRow = 0;
  const list = rows.map((r, k) => r.act
    ? `<button class="ox-row act" data-k="${k}" data-act="${r.act}">${esc(r.label)}</button>`
    : r.it.kind === 'track'
      ? `<button class="ox-row${r.on ? ' on' : ''}" data-k="${k}" data-act="track" data-i="${r.it.i}"><span>${esc(r.it.title)}</span><small>${esc(r.it.artist || '')}</small></button>`
      : `<button class="ox-row" data-k="${k}" data-act="play" data-id="${esc(r.it.id)}"><span>${esc(r.it.name)}</span><small>${esc(r.it.source || '')}</small></button>`).join('');
  return `<div class="og ox-scr">
    <i class="og-strands" aria-hidden="true"></i>
    <div class="ox-pvwrap"><div class="ox-pv"><div class="ox-pvimg" id="oxpv"></div></div></div>
    <div class="ox-fr ox-infofr"><div class="ox-in" id="oxinfo"></div></div>
    <div class="ox-fr ox-listfr"><div class="ox-hd"><b>${esc(title)}</b><em>${count}</em><span class="ox-tools">${head || ''}</span></div><div class="ox-lst" id="oxlst">${list || '<p class="ox-none">Nothing here yet.</p>'}</div></div>
    <div class="og-foot ox-keys"><span class="ogk b">b</span> back <span class="ogk">a</span> select</div>
  </div>`;
}
const OX_ACTS = {
  scanAll: ['Scan all my games', 'Looks for games from Steam, Epic, GOG, Xbox and Game Pass, and your emulators.'],
  scanFolder: ['Add games from a folder', 'Pick a folder and Arcade finds the games inside it.'],
  'add-game': ['Add a game', 'Add one game by hand.'],
  'add-emu': ['Add an emulator', 'Set up an emulator, then add its games.'],
  'add-app': ['Add an app', 'Add a program or a website to Arcade.'],
  essentials: ['Add my essentials', 'Adds common apps like your browser and file explorer.'],
  shufflePlay: ['Shuffle all', 'Plays your whole library in random order.'],
  pickMusic: ['Change music folder', 'Choose where your music lives.']
};
const oxAct = (a) => ({ act: a, label: OX_ACTS[a][0], tip: OX_ACTS[a][1] });
{
  const _h = home;
  home = function () { return isOrb() ? oxHome() : _h.apply(this, arguments); };
}
{
  const _g = games;
  games = function () {
    if (!isOrb()) return _g.apply(this, arguments);
    const all = S.items.filter(i => i.category === 'game');
    const sources = ['All', ...[...new Set(all.map(i => i.source || 'Other'))].sort((a, b) => a.localeCompare(b))];
    if (!sources.includes(srcFilter)) srcFilter = 'All';
    const list = sortGames(all.filter(i => hit(i) && (srcFilter === 'All' || (i.source || 'Other') === srcFilter)));
    const rows = list.map(it => ({ it })).concat(['scanAll', 'scanFolder', 'add-game', 'add-emu'].map(oxAct));
    const st = (SORTS.find(s => s[0] === sortMode) || SORTS[0])[1];
    return oxScreen('Games', all.length, rows, `<button type="button" class="ox-tb" data-ox="sort">Sort: ${esc(st)}</button><button type="button" class="ox-tb" data-ox="src">Show: ${esc(srcFilter)}</button>`);
  };
  const _a = apps;
  apps = function () {
    if (!isOrb()) return _a.apply(this, arguments);
    const list = S.items.filter(i => i.category === 'app' && hit(i)).sort((a, b) => a.name.localeCompare(b.name));
    return oxScreen('Apps', list.length, list.map(it => ({ it })).concat(['add-app', 'essentials'].map(oxAct)));
  };
  const _m = music;
  music = function () {
    if (!isOrb() || playMode === 'system' || !tracks.length) return _m.apply(this, arguments);
    const ql = q.toLowerCase();
    const rows = tracks.map((t, i) => ({ it: Object.assign({}, t, { kind: 'track', i }), on: i === qi })).filter(r => !ql || (r.it.title + ' ' + (r.it.artist || '')).toLowerCase().includes(ql)).slice(0, 400);
    return oxScreen('Music', tracks.length, ['shufflePlay', 'pickMusic'].map(oxAct).concat(rows));
  };
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-ox]'); if (!b) return;
  e.stopPropagation();
  if (b.dataset.ox === 'sort') { const i = SORTS.findIndex(s => s[0] === sortMode); sortMode = SORTS[(i + 1) % SORTS.length][0]; }
  else { const all = S.items.filter(i => i.category === 'game'), src = ['All', ...[...new Set(all.map(i => i.source || 'Other'))].sort((a, b) => a.localeCompare(b))]; srcFilter = src[(src.indexOf(srcFilter) + 1) % src.length]; }
  oxRow = 0; render();
}, true);

// ---------------- focus, movement, rendering ----------------
document.addEventListener('focusin', (e) => {
  if (!isOrb() || !e.target.closest) return;
  const it = e.target.closest('.ox-it');
  if (it && view === 'home') { const n = +it.dataset.i; if (n !== oxSel) { oxSel = n; oxSync(); } return; }
  const row = e.target.closest('.ox-row');
  if (row) { oxRow = +row.dataset.k; oxShow(oxRow); row.scrollIntoView({ block: 'nearest' }); }
});
document.addEventListener('mouseover', (e) => {
  if (!isOrb() || !e.target.closest) return;
  const el = e.target.closest('.ox-it, .ox-row'); if (el && document.activeElement !== el) el.focus({ preventScroll: true });
});
{
  const _mv = move;
  move = function (dir) {
    if (!isOrb() || document.querySelector('dialog[open]')) return _mv.apply(this, arguments);
    const a = document.activeElement;
    if (view === 'home' && a && a.classList && a.classList.contains('ox-it')) {
      const all = [...document.querySelectorAll('.ox-it')], i = all.indexOf(a);
      if (dir === 'up' || dir === 'down') { const n = all[Math.max(0, Math.min(all.length - 1, i + (dir === 'up' ? -1 : 1)))]; if (n) n.focus({ preventScroll: true }); }
      return;
    }
    return _mv.apply(this, arguments);
  };
}
{
  const _r = render;
  render = function () {
    const r = _r.apply(this, arguments);
    try {
      const on = isOrb(), scr = on && document.querySelector('.ox-scr');
      document.body.classList.toggle('ox-scr-on', !!scr);
      if (on && view === 'home') {
        oxSync();
        const a = document.activeElement;
        if (padOn || !a || a === document.body || !a.isConnected) { const t = document.querySelector(`.ox-it[data-i="${oxSel}"]`); if (t) t.focus({ preventScroll: true }); }
      } else if (scr) {
        const a = document.activeElement, row = document.querySelector(`.ox-row[data-k="${oxRow}"]`) || document.querySelector('.ox-row');
        oxShow(row ? +row.dataset.k : 0);
        if (row && (padOn || !a || a === document.body || !a.isConnected || !a.closest('.ox-scr'))) { row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'center' }); }
      }
      oxPrev = view;
    } catch { /* styling must never break the page */ }
    return r;
  };
}
