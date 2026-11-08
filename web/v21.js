// Hollywood Arcade 2.1: profiles, achievements, streaming hub, ambient mode, data files, installer, health check.
'use strict';
window.APP_REPO = window.APP_REPO || 'ovrunoffical/Hollywood-Arcade'; // "owner/name" on GitHub; enables the prefilled issue button
const v21j = (path, body) => fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const v21try = async (path, body) => { try { return await v21j(path, body); } catch { return null; } };
const v21row = (title, sub, ctl, id) => `<div class="setting"${id ? ` id="${id}"` : ''}><div><b>${title}</b><small>${sub}</small></div><div class="ctl">${ctl}</div></div>`;
const v21btn = (k, label, extra = '') => `<button class="btn" data-v21="${k}" ${extra}>${label}</button>`;

// ---------- a small general-purpose dialog ----------
const v21dlg = document.createElement('dialog');
v21dlg.id = 'v21dlg'; v21dlg.innerHTML = '<div id="v21body"></div><div class="dlgbtns" id="v21btns"></div>';
document.body.appendChild(v21dlg);
function v21show(html, buttons, wide) {
  v21dlg.classList.toggle('wide', !!wide);
  $('#v21body').innerHTML = html;
  const bx = $('#v21btns'); bx.innerHTML = '';
  for (const b of buttons || [{ label: 'Close' }]) {
    const el = document.createElement('button'); el.type = 'button'; el.className = 'btn' + (b.primary ? ' primary' : ''); el.textContent = b.label;
    el.onclick = () => { if (b.close !== false) v21dlg.close(); if (b.fn) b.fn(); };
    bx.appendChild(el);
  }
  if (!v21dlg.open) v21dlg.showModal();
  (bx.querySelector('.primary') || bx.querySelector('button') || {}).focus && (bx.querySelector('.primary') || bx.querySelector('button')).focus();
}
function v21ask(title, label, value) {
  return new Promise((res) => {
    let done = false;
    v21show(`<h2>${esc(title)}</h2><label>${esc(label)}<input id="v21in" value="${esc(value || '')}" maxlength="24" autocomplete="off"></label>`, [
      { label: 'OK', primary: true, close: false, fn: () => { done = true; const v = $('#v21in').value.trim(); v21dlg.close(); res(v || null); } },
      { label: 'Cancel', fn: () => { done = true; res(null); } }]);
    v21dlg.addEventListener('close', () => { if (!done) res(null); }, { once: true });
    setTimeout(() => { const i = $('#v21in'); if (i) { i.focus(); i.select(); } }, 30);
  });
}

// ================= Profiles =================
const PITEM = ['lastPlayed', 'plays', 'playtime', 'favorite', 'guideBind', 'vol', 'ach', 'achMiss'];
const PSET = ['theme', 'sound', 'guideDefault', 'guidePs', 'guideTouch', 'jellyfinUser', 'steamId', 'steamKey', 'raUser', 'raKey', 'xblKey', 'musicHistory', 'arcAch', 'arcFlags'];
const PCOLORS = ['#107c10', '#0f6cbd', '#7a3fd1', '#c42b1c', '#d9730d', '#d6336c'];
const curProfile = () => (S.profiles || []).find(p => p.id === S.activeProfile);
const v21Name = () => (curProfile() || {}).name || 'Hollywood';
// the signed-in profile's picture: a photo you chose, or a colour tile with their initial
function v21Avatar(p, cls) {
  p = p || curProfile(); if (!p) return '<img src="logo.png" alt="">';
  if (p.pic) return `<img class="${cls || 'pimg'}" src="${esc(p.pic)}" alt="">`;
  return `<span class="${cls || 'pimg'} pinit" style="background:${esc(p.color || PCOLORS[0])}">${esc((p.name || '?')[0].toUpperCase())}</span>`;
}
function v21pickPicture() {
  const p = curProfile(); if (!p) return;
  const sw = PCOLORS.map(c => `<button type="button" class="pcol${p.color === c && !p.pic ? ' on' : ''}" data-v21="pic-color" data-c="${c}" style="background:${c}" aria-label="Colour"></button>`).join('');
  v21show(`<h2>Profile picture</h2><div class="ppreview">${v21Avatar(p, 'pbig')}</div><p class="hint">Pick a photo, or use a colour with your initial.</p><div class="pcols">${sw}</div>`, [
    { label: 'Choose photo…', primary: true, close: false, fn: () => {
      const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*';
      f.onchange = () => { const file = f.files[0]; if (!file) return; const im = new Image(); const u = URL.createObjectURL(file);
        im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), m = Math.min(im.width, im.height);
          g.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, 256, 256); URL.revokeObjectURL(u);
          p.pic = c.toDataURL('image/jpeg', 0.86); save(); render(); v21pickPicture(); };
        im.onerror = () => toast("Couldn't read that picture"); im.src = u; };
      f.click(); } },
    ...(p.pic ? [{ label: 'Remove photo', close: false, fn: () => { delete p.pic; save(); render(); v21pickPicture(); } }] : []),
    { label: 'Done' }]);
}
function v21capture() {
  const p = curProfile(); if (!p) return;
  const items = {};
  for (const it of S.items) { const o = {}; let any = false; for (const k of PITEM) if (it[k] !== undefined && it[k] !== null && it[k] !== '') { o[k] = it[k]; any = true; } if (any) items[it.id] = o; }
  const st = {}; for (const k of PSET) if (S.settings[k] !== undefined) st[k] = JSON.parse(JSON.stringify(S.settings[k]));
  p.data = { items, settings: st };
}
function v21apply(p) {
  const d = p.data || { items: {}, settings: {} };
  for (const it of S.items) { for (const k of PITEM) delete it[k]; Object.assign(it, d.items[it.id] || {}); }
  for (const k of PSET) delete S.settings[k];
  Object.assign(S.settings, JSON.parse(JSON.stringify(d.settings || {})));
}
function v21switch(id, quiet) {
  const p = (S.profiles || []).find(x => x.id === id); if (!p) return;
  if (id !== S.activeProfile) { v21capture(); v21apply(p); S.activeProfile = id; }
  api.save(S); achMem = {}; watchState = { status: 'idle', rows: [], hero: null, err: '', at: 0 };
  try { SFX.config(sndCfg()); } catch { /* sounds not ready */ }
  if (typeof jfSend === 'function') jfSend();
  render(); if (!quiet) toast('Signed in as ' + p.name);
}
function v21migrate() {
  if (S.profiles && S.profiles.length && curProfile()) return;
  const id = 'p-' + Math.random().toString(36).slice(2, 8);
  S.profiles = [{ id, name: 'Hollywood', color: PCOLORS[0], data: { items: {}, settings: {} } }];
  S.activeProfile = id; S.schema = 2; v21capture();
}
function v21addProfile(name) {
  v21capture();
  const id = 'p-' + Math.random().toString(36).slice(2, 8);
  S.profiles.push({ id, name, color: PCOLORS[S.profiles.length % PCOLORS.length], data: { items: {}, settings: { theme: JSON.parse(JSON.stringify(S.settings.theme || {})) } } });
  v21switch(id);
}
function v21whoPlaying() {
  const ps = S.profiles || []; if (ps.length < 2) return;
  v21show('<h2>Who’s playing?</h2><div class="whop">' + ps.map(p => `<button type="button" class="whob" data-v21="who" data-id="${esc(p.id)}">${v21Avatar(p, 'avatar')}<b>${esc(p.name)}</b></button>`).join('') + '</div>', [{ label: 'Keep ' + (curProfile() || {}).name }]);
}

// ================= Achievements =================
let achMem = {}; // full lists fetched this session
const ARC = [
  ['firstplay', 'Press Start', 'Launch a game from Arcade.', 10, (c) => c.plays >= 1],
  ['lib10', 'Collector', 'Have 10 games in your library.', 10, (c) => c.games >= 10],
  ['lib50', 'Hoarder', 'Have 50 games in your library.', 25, (c) => c.games >= 50],
  ['lib100', 'Curator', 'Have 100 games in your library.', 50, (c) => c.games >= 100],
  ['plays25', 'Regular', 'Launch games 25 times.', 15, (c) => c.plays >= 25],
  ['plays100', 'Dedicated', 'Launch games 100 times.', 40, (c) => c.plays >= 100],
  ['hours10', 'Settling In', 'About 10 hours played.', 20, (c) => c.mins >= 600],
  ['hours100', 'Lifer', 'About 100 hours played.', 60, (c) => c.mins >= 6000],
  ['retro', 'Retro Fan', 'Add a game for an emulator.', 15, (c) => c.roms >= 1],
  ['emus', 'Emulator Enthusiast', 'Set up two emulators.', 20, (c) => c.emus >= 2],
  ['watch', 'Movie Night', 'Connect Jellyfin.', 10, (c) => c.jf],
  ['roommates', 'Roommates', 'Create a second profile.', 10, (c) => c.profiles >= 2],
  ['night', 'Night Owl', 'Start a game between midnight and 4 am.', 15, (c) => c.flags.night],
  ['backup', 'Safe Keeping', 'Back up your library.', 10, (c) => c.flags.backup],
  ['couch', 'Couch Mode', 'Open a streaming service.', 10, (c) => c.flags.stream],
  ['hunter', 'Trophy Hunter', 'Unlock 10 achievements in your games.', 25, (c) => c.unl >= 10],
  ['hunter100', 'Relentless', 'Unlock 100 achievements in your games.', 75, (c) => c.unl >= 100],
  ['complete', 'Completionist', 'Unlock every achievement in one game.', 50, (c) => c.done >= 1]
];
const achGames = () => S.items.filter(i => i.ach && i.ach.t > 0);
function arcCtx() {
  const g = S.items.filter(i => i.category === 'game'), ag = achGames();
  return { games: g.length, plays: g.reduce((n, i) => n + (i.plays || 0), 0), mins: g.reduce((n, i) => n + (i.playtime || 0), 0), roms: g.filter(i => i.kind === 'rom').length,
    emus: (S.settings.emulators || []).length, jf: !!S.settings.jellyfinKey, profiles: (S.profiles || []).length, flags: S.settings.arcFlags || {},
    unl: ag.reduce((n, i) => n + i.ach.u, 0), done: ag.filter(i => i.ach.u >= i.ach.t).length };
}
function arcCheck(silent) {
  const got = (S.settings.arcAch = S.settings.arcAch || {}), c = arcCtx(), fresh = [];
  for (const [id, name, , pts, test] of ARC) { if (!got[id] && test(c)) { got[id] = Date.now(); fresh.push([name, pts]); } }
  if (!fresh.length) return;
  save();
  if (!silent) { try { SFX.play('toast'); } catch { /* ignore */ } toast('\u{1F3C6} Achievement unlocked: ' + fresh.map(f => f[0] + ' (+' + f[1] + ')').join(', ')); }
  if (view === 'ach') render();
}
function arcFlag(k) { const f = (S.settings.arcFlags = S.settings.arcFlags || {}); if (!f[k]) { f[k] = Date.now(); arcCheck(); } }
function arcScore() {
  const got = S.settings.arcAch || {}, ag = achGames();
  return ARC.filter(a => got[a[0]]).reduce((n, a) => n + a[3], 0) + ag.reduce((n, i) => n + i.ach.u * 5 + (i.ach.u >= i.ach.t ? 100 : 0), 0);
}
const RA_EXT = { nes: 7, sfc: 3, smc: 3, gb: 4, gbc: 6, gba: 5, md: 1, gen: 1, smd: 1, n64: 2, z64: 2, v64: 2, nds: 18 };
function raConsoles(it) {
  if (it.kind !== 'rom') return [];
  const emu = ((S.settings.emulators || []).find(e => e.id === it.emuId) || {}).name || it.source || '', n = emu.toLowerCase();
  if (/pcsx2/.test(n)) return [21]; if (/duckstation/.test(n)) return [12]; if (/ppsspp/.test(n)) return [41]; if (/dolphin/.test(n)) return [16, 19];
  if (/flycast/.test(n)) return [40]; if (/melonds/.test(n)) return [18]; if (/mgba/.test(n)) return [5, 4, 6];
  const ext = ((it.rom || '').split('.').pop() || '').toLowerCase();
  return RA_EXT[ext] ? [RA_EXT[ext]] : [];
}
function achWays(it) {
  const s = S.settings, w = [];
  if (steamId(it)) w.push({ provider: 'steam', key: s.steamKey || '', steamId: s.steamId || '', appid: steamId(it), title: it.name, need: s.steamId ? '' : 'Add your Steam ID in Settings.' });
  for (const c of raConsoles(it)) w.push({ provider: 'ra', user: s.raUser || '', key: s.raKey || '', title: it.name, console: String(c), need: s.raUser && s.raKey ? '' : 'Add your RetroAchievements name and key in Settings.' });
  if (s.xblKey && /game pass|xbox|xenia/i.test(it.source || '')) w.push({ provider: 'xbox', key: s.xblKey, title: it.name, need: '' });
  return w;
}
async function achFetch(it) {
  const ways = achWays(it); let last = null;
  if (!ways.length) return { ok: false, error: 'No achievement source for this game yet. Steam games, RetroAchievements consoles and Xbox titles are supported.' };
  for (const w of ways) {
    if (w.need) { last = last || { ok: false, error: w.need }; continue; }
    const r = await v21try('/api/ach', w);
    if (r && r.ok) { achMem[it.id] = r; return r; }
    last = r || { ok: false, error: "Couldn't reach the achievements service." };
  }
  return last;
}
async function achRefresh(it, quiet) {
  const before = it.ach ? it.ach.u : 0, r = await achFetch(it);
  if (r && r.ok) {
    it.ach = { u: r.unlocked, t: r.total, at: Date.now(), p: r.provider }; delete it.achMiss;
    if (!quiet || r.unlocked > before) { /* saved below */ }
    if (r.unlocked > before && before >= 0 && quiet === 'announce') { try { SFX.play('toast'); } catch { /* ignore */ } toast('\u{1F3C6} ' + (r.unlocked - before) + ' new achievement' + (r.unlocked - before === 1 ? '' : 's') + ' in ' + it.name); }
  } else it.achMiss = Date.now();
  save(); arcCheck();
  return r;
}
let achBusy = false;
async function achRefreshAll() {
  if (achBusy) return; achBusy = true;
  const list = S.items.filter(i => i.category === 'game' && achWays(i).some(w => !w.need) && !(i.achMiss && Date.now() - i.achMiss < 7 * 864e5));
  if (!list.length) { achBusy = false; return toast('Nothing to check. Add your Steam ID or RetroAchievements details in Settings first.'); }
  let n = 0;
  for (const it of list) {
    n++; if (n === 1 || n % 5 === 0) toast(`Checking achievements ${n}/${list.length}…`);
    await achRefresh(it, true);
    await new Promise(r => setTimeout(r, 250));
  }
  achBusy = false; render(); toast('Done. ' + achGames().length + ' games have achievements.');
}
function ring(u, t, size) {
  const p = t ? Math.round(u / t * 100) : 0;
  return `<span class="ring${p >= 100 ? ' full' : ''}" style="--p:${p};--s:${size || 54}px"><b>${p}%</b></span>`;
}
function achView() {
  const ag = achGames().sort((a, b) => (b.ach.u / b.ach.t) - (a.ach.u / a.ach.t) || b.ach.at - a.ach.at);
  const unl = ag.reduce((n, i) => n + i.ach.u, 0), tot = ag.reduce((n, i) => n + i.ach.t, 0), done = ag.filter(i => i.ach.u >= i.ach.t).length;
  const got = S.settings.arcAch || {}, s = S.settings, prof = curProfile();
  const stat = (n, l) => `<div class="astat"><b>${n}</b><small>${l}</small></div>`;
  let h = `<h1 class="title">Achievements${prof && (S.profiles || []).length > 1 ? ` <small class="hint">${esc(prof.name)}</small>` : ''}</h1><div class="astats">${stat(arcScore().toLocaleString(), 'Arcade score')}${stat(unl.toLocaleString() + (tot ? ' / ' + tot.toLocaleString() : ''), 'Game achievements')}${stat(done, 'Games completed')}${stat(ARC.filter(a => got[a[0]]).length + ' / ' + ARC.length, 'Arcade badges')}</div>`;
  const have = [s.steamId ? 'Steam' : '', s.raKey ? 'RetroAchievements' : '', s.xblKey ? 'Xbox' : ''].filter(Boolean);
  h += `<div class="toolbar"><button class="btn primary" data-v21="ach-all">${ag.length ? 'Refresh all' : 'Find my achievements'}</button><button class="btn" data-act="gsettings">Set up accounts</button><span class="hint">${have.length ? 'Connected: ' + have.join(', ') : 'No accounts connected yet'}</span></div>`;
  if (!ag.length) h += `<div class="welcome"><h2>Your trophy room</h2><p>Connect an account in Settings and press Find my achievements. Steam games work with just your Steam ID if your profile is public, retro games use a free RetroAchievements account, and Xbox titles use an OpenXBL key. Achievements for each game also show up in its info card.</p></div>`;
  else h += '<h2 class="row-title">Your games</h2><div class="grid">' + ag.map(it => `<button class="tile game achg" data-v21="ach-open" data-id="${esc(it.id)}">${artHTML(it, ring(it.ach.u, it.ach.t))}<div class="cap"><b>${esc(it.name)}</b><small>${it.ach.u} / ${it.ach.t}${it.ach.p ? ' · ' + esc(it.ach.p) : ''}</small></div></button>`).join('') + '</div>';
  h += '<h2 class="row-title">Arcade badges</h2><div class="abadges">' + ARC.map(([id, n, d, p]) => `<div class="abadge${got[id] ? ' on' : ''}"><span class="aico">${got[id] ? '\u{1F3C6}' : '\u{1F512}'}</span><div><b>${esc(n)}</b><small>${esc(d)}</small></div><em>${p}</em></div>`).join('') + '</div>';
  return h;
}
function achDetail(it, filter) {
  const r = achMem[it.id];
  const when = (t) => t ? new Date(t * 1000).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const f = filter || 'all';
  const rows = r ? r.items.filter(a => f === 'all' || (f === 'got' ? a.u : !a.u)) : [];
  v21show(`<h2>${esc(it.name)}</h2><p class="hint">${r ? r.unlocked + ' of ' + r.total + ' unlocked · ' + esc(r.provider) : 'Loading…'}</p>` +
    (r ? `<div class="chips tabs">${[['all', 'All'], ['got', 'Unlocked'], ['lock', 'Locked']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-v21="ach-filter" data-id="${esc(it.id)}" data-k="${k}">${l}</button>`).join('')}</div><div class="alist">` +
      rows.map(a => `<div class="arow${a.u ? ' got' : ''}">${a.ic ? `<img src="${esc(a.ic)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="aph"></span>'}<div><b>${esc(a.n)}</b><small>${esc(a.d || (a.h ? 'Hidden achievement' : ''))}</small></div><div class="ameta">${a.r ? `<span>${a.r < 10 ? a.r.toFixed(1) : Math.round(a.r)}%</span>` : ''}${a.p ? `<span>${a.p} pts</span>` : ''}${a.u ? `<small>${when(a.t) || 'Unlocked'}</small>` : ''}</div></div>`).join('') + '</div>' : '<div class="alist"></div>'),
    [{ label: 'Refresh', close: false, fn: async () => { delete achMem[it.id]; await achOpen(it.id, true); } }, { label: 'Close' }], true);
}
async function achOpen(id, force) {
  const it = S.items.find(i => i.id === id); if (!it) return;
  if (!force && achMem[id]) return achDetail(it);
  achDetail(it);
  const r = await achRefresh(it, 'announce');
  if (!r || !r.ok) { v21show(`<h2>${esc(it.name)}</h2><p class="hint">${esc((r && r.error) || 'No achievements found.')}</p>`, [{ label: 'Set up accounts', fn: () => { if (gdlg.open) gdlg.close(); view = 'settings'; render(); } }, { label: 'Close' }]); return; }
  achDetail(it); if (view === 'ach') render();
}

// ================= Streaming hub (Watch) =================
const STREAMS = [
  ['YouTube', 'https://www.youtube.com/tv', '#ff0033', 'youtube.com'], ['YouTube TV', 'https://tv.youtube.com', '#ff3d3d', 'tv.youtube.com'],
  ['Netflix', 'https://www.netflix.com', '#e50914', 'netflix.com'], ['Disney+', 'https://www.disneyplus.com', '#113ccf', 'disneyplus.com'],
  ['Max', 'https://play.max.com', '#5b2bd1', 'max.com'], ['Prime Video', 'https://www.primevideo.com', '#00a8e1', 'primevideo.com'],
  ['Hulu', 'https://www.hulu.com', '#1ce783', 'hulu.com'], ['Apple TV', 'https://tv.apple.com', '#2b2b2b', 'tv.apple.com'],
  ['Paramount+', 'https://www.paramountplus.com', '#0064ff', 'paramountplus.com'], ['Peacock', 'https://www.peacocktv.com', '#c9a400', 'peacocktv.com'],
  ['Twitch', 'https://www.twitch.tv', '#9146ff', 'twitch.tv'], ['Plex', 'https://app.plex.tv', '#e5a00d', 'plex.tv']
];
function streamHub() {
  return '<h2 class="row-title">Streaming</h2><div class="shub">' + STREAMS.map(([n, u, c, d], i) => `<button class="stl" data-v21="stream" data-i="${i}" data-a="${c}" data-b="${c}"><span class="slogo" style="background:${c}"><i>${esc(n[0])}</i><img src="https://www.google.com/s2/favicons?domain=${d}&sz=128" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span><b>${esc(n)}</b></button>`).join('') + '</div>';
}
const _watchView = typeof watchView === 'function' ? watchView : null;
if (_watchView) watchView = function () { const h = _watchView(); const hub = streamHub(), at = h.indexOf('<div class="whero"'); return at >= 0 ? h.slice(0, at) + hub + h.slice(at) : hub + h; };

// ================= Ambient (screensaver) mode =================
let ambientOn = false, ambientT = 0, ambientLast = Date.now(), ambientPics = [], ambientI = 0;
const ambientEl = document.createElement('div');
ambientEl.id = 'ambient'; ambientEl.hidden = true;
ambientEl.innerHTML = '<div class="abg a1"></div><div class="abg a2"></div><div class="ashade"></div><div class="atxt"><div id="aclock"></div><div id="adate"></div><div id="asub"></div></div>';
document.body.appendChild(ambientEl);
function ambientTick() {
  const d = new Date();
  $('#aclock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('#adate').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const last = S.items.filter(i => i.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed)[0];
  $('#asub').textContent = np && np.active && np.title ? '♪ ' + np.title + (np.artist ? ' · ' + np.artist : '') : last ? 'Jump back in: ' + last.name : '';
}
function ambientNext() {
  if (!ambientPics.length) return;
  const url = ambientPics[ambientI++ % ambientPics.length], a = [$('.abg.a1', ambientEl), $('.abg.a2', ambientEl)], on = ambientI % 2;
  const im = new Image(); im.onload = () => { a[on].style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`; a[on].classList.add('show'); a[1 - on].classList.remove('show'); };
  im.onerror = () => { ambientNext(); }; im.src = url;
}
function ambientStart() {
  if (ambientOn) return;
  const pics = S.items.filter(i => i.category === 'game').map(i => i.hero ? toURL(i.hero) : steamId(i) ? `https://cdn.akamai.steamstatic.com/steam/apps/${steamId(i)}/library_hero.jpg` : '').filter(Boolean);
  for (let i = pics.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pics[i], pics[j]] = [pics[j], pics[i]]; }
  ambientPics = pics.slice(0, 24); ambientI = 0;
  ambientOn = true; window.__guideOpen = true; ambientEl.hidden = false; ambientEl.classList.remove('gone');
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  ambientTick(); ambientNext(); clearInterval(ambientT);
  ambientT = setInterval(() => { ambientTick(); if (Math.round(Date.now() / 1000) % 14 === 0) ambientNext(); }, 1000);
  try { document.activeElement && document.activeElement.blur(); } catch { /* ignore */ }
}
function ambientStop() {
  if (!ambientOn) return;
  ambientOn = false; clearInterval(ambientT); ambientEl.hidden = true; ambientLast = Date.now();
  // keep the controller quiet until every button is let go, so the press that woke us doesn't also click something
  const wait = setInterval(() => {
    const pressed = (navigator.getGamepads ? [...navigator.getGamepads()] : []).some(p => p && p.connected && (p.buttons.some(b => b.pressed) || p.axes.some(a => Math.abs(a) > .5)));
    if (!pressed) { clearInterval(wait); window.__guideOpen = false; }
  }, 120);
  setTimeout(() => { clearInterval(wait); window.__guideOpen = false; }, 4000);
}
for (const ev of ['keydown', 'pointerdown', 'wheel', 'touchstart']) {
  window.addEventListener(ev, (e) => { if (ambientOn) { e.stopPropagation(); e.preventDefault(); ambientStop(); } ambientLast = Date.now(); }, true);
}
let lastMX = -1;
window.addEventListener('mousemove', (e) => { if (Math.abs(e.screenX - lastMX) > 3 || ambientOn) { if (ambientOn && lastMX >= 0 && Math.abs(e.screenX - lastMX) > 6) ambientStop(); } lastMX = e.screenX; ambientLast = Date.now(); }, true);
setInterval(() => {
  const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(p => p && p.connected);
  if (pads.some(p => p.buttons.some(b => b.pressed) || p.axes.some(a => Math.abs(a) > .6))) { if (ambientOn) ambientStop(); ambientLast = Date.now(); }
  const mins = +S.settings.ambientMin || 0;
  if (mins > 0 && !ambientOn && Date.now() - ambientLast > mins * 60000 && document.visibilityState === 'visible' && document.hasFocus() && !window.__guideOpen && !(window.__running && window.__running.running)) ambientStart();
}, 500);

// ================= Data files (extend the retro lists and emulator presets) =================
async function v21loadData() {
  const d = await v21try('/api/userdata'); if (!d) return;
  let n = 0;
  try {
    for (const sys of ((d.retro || {}).systems || [])) {
      if (!sys || !sys.name || !Array.isArray(sys.games) || RETRO.some(r => r[0] === sys.name)) continue;
      const games = sys.games.filter(g => g && g.name).map(g => [String(g.name), String(g.file || g.name), +g.year || 0]);
      const row = [String(sys.name), String(sys.emu || 'RetroArch'), String(sys.sys || ''), games, sys.note ? String(sys.note) : ''];
      RETRO.push(row);
      for (const [gn, f, y] of games) retroFlat.push({ n: gn, con: row[0], emu: row[1], y, note: row[4], img: row[2] ? LB + encodeURIComponent(row[2]) + '/Named_Boxarts/' + encodeURIComponent(f.replace(/[&*\/:`<>?\\|"]/g, '_')) + '.png' : '' });
      n++;
    }
    for (const e of ((d.emulators || {}).emulators || [])) {
      if (!e || !e.id || !e.name || e.id === 'example' || EMU_STORE.some(x => x.n === e.name)) continue;
      EMU_PRESETS[e.id] = { name: String(e.name), exts: String(e.exts || ''), args: String(e.args || '"{rom}"') };
      EMU_STORE.push({ n: String(e.name), sys: (e.systems || []).join(', '), url: e.repo ? 'https://github.com/' + e.repo + '/releases' : (e.url || ''), preset: e.id, d: 'Added from your data file.' });
      n++;
    }
  } catch { /* a bad data file must never break the app */ }
  if (n && view === 'store') render();
}

// ================= One-click emulator install =================
const INSTALLABLE = { xenia: 'xenia', rpcs3: 'rpcs3', azahar: 'azahar', pcsx2: 'pcsx2', duckstation: 'duckstation', melonds: 'melonds', mgba: 'mgba', cemu: 'cemu', flycast: 'flycast' };
const v21installId = (e) => INSTALLABLE[e.preset || (e.n || '').toLowerCase()];
function v21canInstall(e) { return !!v21installId(e); }
async function v21install(e, btn) {
  const id = v21installId(e); if (!id) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Installing…'; }
  toast('Downloading ' + e.n + '. This can take a minute.');
  const r = await v21try('/api/install', { id });
  if (btn) { btn.disabled = false; btn.textContent = 'Install for me'; }
  if (!r || !r.ok) return toast((r && r.error) || "Couldn't install it.");
  const pre = EMU_PRESETS[e.preset] || {}, list = (S.settings.emulators = S.settings.emulators || []);
  let emu = list.find(x => x.name === (pre.name || e.n));
  if (!emu) { emu = { id: crypto.randomUUID(), name: pre.name || e.n, exe: r.exe, romFolder: '', exts: pre.exts || '', args: pre.args || '"{rom}"' }; } else emu.exe = r.exe;
  save(); toast(e.n + ' ' + (r.version || '') + ' installed. Now pick the folder with your games.');
  openEmu(emu);
}

// ================= Settings =================
const v21splashOn = () => { try { return localStorage.getItem('ha_nosplash') !== '1'; } catch { return true; } };
const _v2SettingsB = v2Settings;
v2Settings = function () {
  const s = S.settings, ps = S.profiles || [], me = curProfile();
  const chips = ps.map(p => `<button class="chip ${p.id === S.activeProfile ? 'on' : ''}" data-v21="prof-switch" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('');
  const key = (k, ph, pw) => `<input class="keyin" ${pw ? 'type="password"' : ''} data-v21in="${k}" value="${esc(s[k] || '')}" placeholder="${ph}" autocomplete="off">`;
  const ambOpt = (v, l) => `<option value="${v}"${(+s.ambientMin || 0) === v ? ' selected' : ''}>${l}</option>`;
  return _v2SettingsB() +
    v21row('Profiles', 'Each profile has its own play history, favourites, achievements, theme, sounds and accounts. The game library itself is shared.', `<div class="chips">${chips}</div>${v21btn('prof-pic', 'Picture')}${v21btn('prof-add', 'Add')}${v21btn('prof-rename', 'Rename')}${ps.length > 1 ? v21btn('prof-del', 'Delete') : ''}`, 'v21prof') +
    (ps.length > 1 ? v21row('Ask who’s playing at start-up', 'Shows a profile picker every time Arcade opens.', `<button class="switch ${s.askProfile ? 'on' : ''}" role="switch" aria-checked="${!!s.askProfile}" data-v21="ask-prof"></button>`) : '') +
    v21row('Steam achievements', 'Your Steam ID (the long number, or your profile name) works with a public profile. A Steam Web API key from steamcommunity.com/dev/apikey makes it more reliable. For ' + esc(me ? me.name : 'this profile') + '.', key('steamId', 'Steam ID') + key('steamKey', 'Web API key (optional)', true)) +
    v21row('RetroAchievements', 'Free account at retroachievements.org. Your name and Web API key (on your Settings page there). Covers NES, SNES, Genesis, N64, GB/GBC/GBA, DS, PS1, PS2, PSP, GameCube, Wii and more.', key('raUser', 'Username') + key('raKey', 'Web API key', true)) +
    v21row('Xbox achievements (experimental)', 'Uses OpenXBL, a free third-party service that reads your Xbox Live profile. Paste your OpenXBL key. Helps for Game Pass and Xbox 360 titles.', key('xblKey', 'OpenXBL key', true)) +
    v21row('Start-up animation', 'The short Hollywood Arcade intro when the app opens. Press any button to skip it.', `<button class="switch ${v21splashOn() ? 'on' : ''}" role="switch" aria-checked="${v21splashOn()}" data-v21="splash"></button>`) +
    v21row('Screensaver', 'After a while without input, Arcade shows your game art, the clock and what is playing. Any button or key wakes it.', `<select class="keyin" data-v21in="ambientMin">${ambOpt(0, 'Off')}${ambOpt(2, '2 minutes')}${ambOpt(5, '5 minutes')}${ambOpt(10, '10 minutes')}${ambOpt(20, '20 minutes')}</select>${v21btn('ambient', 'Preview')}`) +
    v21row('Backups', 'Arcade keeps your last few automatic copies. Back up as a file with or without your API keys.', `${v21btn('autobk', 'Automatic copies')}${v21btn('bk-keys', 'Back up with keys')}`) +
    v21row('Your own game lists and emulators', 'Add extra retro games or emulators by editing two small text files. Restart Arcade afterwards.', v21btn('opendata', 'Open data folder')) +
    v21row('Health check and bug reports', 'Checks that Arcade can run and save. Make a report with private details removed.', `${v21btn('health', 'Run check')}`, 'v21health');
};
document.addEventListener('change', (e) => {
  const b = e.target.closest && e.target.closest('[data-v21in]'); if (!b) return;
  const k = b.dataset.v21in; S.settings[k] = k === 'ambientMin' ? +b.value : b.value.trim();
  save(); if (k === 'ambientMin') toast(+b.value ? 'Screensaver after ' + b.value + ' minutes' : 'Screensaver off');
  if (/^(steam|ra|xbl)/.test(k)) { achMem = {}; for (const it of S.items) delete it.achMiss; }
});

async function v21health() {
  const r = await v21try('/api/health'); if (!r) return toast("Couldn't run the check.");
  const log = await v21try('/api/log');
  const checks = r.checks.concat([{ name: 'Library', ok: true, detail: S.items.length + ' items, ' + (S.profiles || []).length + ' profile(s)' }]);
  const text = ['Hollywood Arcade ' + r.version + ' (' + r.os + ')', ...checks.map(c => (c.ok ? 'OK   ' : 'FAIL ') + c.name + ': ' + c.detail), '', 'Recent log:', ((log && log.log) || '(empty)').trim().split('\n').slice(-15).join('\n')].join('\n');
  const issue = window.APP_REPO ? 'https://github.com/' + window.APP_REPO + '/issues/new?title=' + encodeURIComponent('Problem report') + '&body=' + encodeURIComponent('What happened:\n\n\n```\n' + text.slice(0, 3000) + '\n```') : '';
  v21show('<h2>Health check</h2><div class="hlist">' + checks.map(c => `<div class="hrow ${c.ok ? 'ok' : 'bad'}"><span>${c.ok ? '✓' : '!'}</span><div><b>${esc(c.name)}</b><small>${esc(c.detail)}</small></div></div>`).join('') + '</div><p class="hint">The report below has your user name and folders removed. API keys are never included.</p>', [
    { label: 'Copy report', primary: true, close: false, fn: () => { navigator.clipboard.writeText(text).then(() => toast('Report copied'), () => toast("Couldn't copy it")); } },
    ...(issue ? [{ label: 'Report on GitHub', fn: () => api.launch({ kind: 'url', target: issue, name: 'GitHub' }) }] : []), { label: 'Close' }]);
}
async function v21autoBackups() {
  const r = await v21try('/api/backups'), list = (r && r.backups) || [];
  v21show('<h2>Automatic copies</h2><p class="hint">Arcade saves a copy of your library when you change something (at most every 30 minutes) and keeps the newest 8.</p>' + (list.length ? '<div class="hlist">' + list.map(b => `<div class="hrow"><div><b>${new Date(b.time * 1000).toLocaleString()}</b><small>${Math.max(1, Math.round(b.size / 1024))} KB</small></div><button class="btn" data-v21="bk-restore" data-name="${esc(b.name)}">Restore</button></div>`).join('') + '</div>' : '<p class="hint">None yet.</p>'), [{ label: 'Close' }]);
}

// ================= Events =================
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-v21]'); 
  if (el) {
    const k = el.dataset.v21; e.stopPropagation();
    if (k === 'prof-switch') { v21dlg.open && v21dlg.close(); return v21switch(el.dataset.id); }
    if (k === 'who') { v21dlg.close(); return v21switch(el.dataset.id); }
    if (k === 'pic-color') { const p = curProfile(); if (p) { p.color = el.dataset.c; delete p.pic; save(); render(); v21pickPicture(); } return; }
    if (k === 'prof-pic') return v21pickPicture();
    if (k === 'prof-add') { const n = await v21ask('New profile', 'Name', ''); if (n) v21addProfile(n); return; }
    if (k === 'prof-rename') { const p = curProfile(); const n = p && await v21ask('Rename profile', 'Name', p.name); if (n) { p.name = n; save(); render(); } return; }
    if (k === 'prof-del') {
      const p = curProfile(); if (!p || S.profiles.length < 2) return;
      return v21show(`<h2>Delete ${esc(p.name)}?</h2><p class="hint">Their play history, achievements and settings are removed. Your games stay.</p>`, [{ label: 'Delete', primary: true, fn: () => { const i = S.profiles.indexOf(p); S.profiles.splice(i, 1); v21switch(S.profiles[0].id, true); toast('Deleted ' + p.name); } }, { label: 'Keep' }]);
    }
    if (k === 'ask-prof') { S.settings.askProfile = !S.settings.askProfile; save(); return render(); }
    if (k === 'ach-all') return achRefreshAll();
    if (k === 'ach-open') return achOpen(el.dataset.id);
    if (k === 'ach-filter') { const it = S.items.find(i => i.id === el.dataset.id); if (it) achDetail(it, el.dataset.k); return; }
    if (k === 'stream') {
      const [n, u] = STREAMS[+el.dataset.i]; toast('Opening ' + n + '… Your controller works like a keyboard there: D-pad to move, A to select, B to go back.');
      const r = await v21try('/api/stream', { url: u }); if (!r || !r.ok) toast((r && r.error) || "Couldn't open it."); else arcFlag('stream'); return;
    }
    if (k === 'splash') { try { localStorage.setItem('ha_nosplash', v21splashOn() ? '1' : '0'); } catch { /* ignore */ } return render(); }
    if (k === 'ambient') return ambientStart();
    if (k === 'bk-keys') { const r = await fetch('/api/backup?keys=1'); if (!r.ok) return toast("Couldn't make a backup"); const bl = await r.blob(), a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = 'HollywoodArcade-backup-with-keys-' + new Date().toISOString().slice(0, 10) + '.zip'; document.body.appendChild(a); a.click(); a.remove(); toast('Backup saved. It contains your API keys, so keep it private.'); arcFlag('backup'); return; }
    if (k === 'autobk') return v21autoBackups();
    if (k === 'bk-restore') { const r = await v21try('/api/backups/restore', { name: el.dataset.name }); if (!r || !r.ok) return toast((r && r.error) || "Couldn't restore"); toast('Restored. Reloading…'); setTimeout(() => location.reload(), 800); return; }
    if (k === 'opendata') { const r = await v21try('/api/opendata', {}); if (r && !r.ok) toast(r.error || "Couldn't open the folder"); return; }
    if (k === 'health') return v21health();
    return;
  }
  const a = e.target.closest('[data-act="emu-install"]');
  if (a) { e.stopPropagation(); v21install(EMU_STORE[+a.dataset.i], a); }
}, true);
document.getElementById('gach').addEventListener('click', () => { if (typeof infoId !== 'undefined' && infoId) achOpen(infoId); });

// plain "Back up" in Settings also counts toward the Safe Keeping badge
{ const _db = doBackup; doBackup = async function () { const r = await _db(); arcFlag('backup'); return r; }; }
// extra places the Guide and other windows can send you
{ const _hn = handleNav; handleNav = function (go) {
  const [a, b] = (go || '').split(/:(.*)/s);
  if (a === 'profile') { document.querySelectorAll('dialog[open]').forEach(d => d.close()); return v21switch(b); }
  if (a === 'ambient') { return setTimeout(ambientStart, 250); }
  if (a === 'ach') { view = 'ach'; render(); return; }
  return _hn(go);
}; }
// remember the last launched game and check its achievements when you come back
let v21last = null, v21lastAt = 0;
{ const _vl = v2Launched; v2Launched = function (it) { _vl(it); v21last = it.id; v21lastAt = Date.now(); if (new Date().getHours() < 4) arcFlag('night'); else arcCheck(); }; }
window.addEventListener('focus', () => {
  if (!v21last || Date.now() - v21lastAt < 20000) return;
  const it = S.items.find(i => i.id === v21last); v21last = null;
  if (it && it.ach && it.ach.t) achRefresh(it, 'announce').then(() => { if (view === 'ach') render(); });
});

// ================= start-up =================
function v21init() {
  v21migrate();
  { const _s = api.save; api.save = (d) => { try { v21capture(); } catch { /* never block a save */ } return _s(d); }; }
  setTimeout(async () => {
    v21loadData();
    const first = !S.settings.arcSeeded;
    if (first) { S.settings.arcSeeded = true; arcCheck(true); const n = Object.keys(S.settings.arcAch || {}).length; if (n) toast('Achievements are new in 2.1. You already earned ' + n + ' Arcade badge' + (n === 1 ? '' : 's') + '.'); } else arcCheck();
    save();
    if (S.settings.askProfile && (S.profiles || []).length > 1 && S.settings.setupDone) v21whoPlaying();
  }, 1500);
}
