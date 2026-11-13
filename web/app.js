function fatal(m) {
  document.body.insertAdjacentHTML('beforeend', '<pre style="position:fixed;left:16px;bottom:110px;z-index:99;max-width:70vw;background:#5a0016;color:#fff;padding:12px 16px;border-radius:12px;white-space:pre-wrap;font:13px Consolas,monospace">' + String(m).replace(/</g, '&lt;') + '</pre>');
}
window.addEventListener('error', (e) => { if (e.message) fatal('Error: ' + e.message); });
window.addEventListener('unhandledrejection', (e) => fatal('Error: ' + ((e.reason && e.reason.message) || e.reason)));
const api = window.api;
{ const m = api.media; api.media = async (a, n) => { const r = await m(a, n); if (r && r.ok === false && r.error) toast(r.error); return r; }; }
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = { items: [], settings: {} };
let view = 'home', q = '', srcFilter = 'All';
let tracks = [], qi = -1, shuffle = false;
let editing = null, picked = new Set(), impList = [];
const audio = new Audio();
let playMode = 'system';
let hotkeyText = 'Checking the shortcut\u2026';
fetch('/api/hotkey').then(r => r.json()).then(r => { hotkeyText = r.label && r.label !== 'none' ? 'Press ' + r.label + ' on your keyboard, even in a game (not over exclusive-fullscreen games).' : r.label === 'none' ? 'No keyboard shortcut is free. Close other apps that use Ctrl+Alt+H and restart Arcade.' : 'Starting\u2026'; }).catch(() => {});
let shellArm = false, np = { active: false };
try { playMode = localStorage.getItem('pm') || 'system'; } catch { /* ignore */ }

// ---------- helpers ----------
const toURL = (p) => '/file?p=' + encodeURIComponent(p);
// a wide picture (like a Steam header) in a tall tile: show it whole over a blurred copy instead of cropping it
document.addEventListener('load', (e) => {
  const im = e.target;
  if (!(im instanceof HTMLImageElement) || !im.closest('.art, .gcover')) return;
  const box = im.parentElement;
  if (!box.classList.contains('ico') && im.naturalWidth && im.naturalHeight && im.naturalWidth / im.naturalHeight > 1.15) { box.classList.add('land'); box.style.setProperty('--landbg', 'url("' + im.currentSrc.replace(/"/g, '%22') + '")'); }
  else box.classList.remove('land');
}, true);
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const cols = (n) => { const h = hue(n); return [`hsl(${h} 90% 58%)`, `hsl(${(h + 55) % 360} 90% 52%)`]; };
const fmt = (t) => { if (!isFinite(t)) return '0:00'; const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); };
const save = () => api.save(S);
const hit = (it) => !q || it.name.toLowerCase().includes(q);
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), Math.max(2600, msg.length * 60)); }

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6L18 18V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
  shuf: '<svg viewBox="0 0 24 24"><path d="M17 3h4v4h-2V6.400l-4.300 4.300-1.400-1.400L17.600 5H17zM3 6h4.500l9.500 12h1.600V16.500H21V21h-4.500L7 9H3zm10.300 6.600l1.400 1.400L12 16.700 9.600 14.300l1.400-1.400 1.100 1.100zM19 16.400V19h-2z"/></svg>'
};

// ---------- tint ----------
const baseTint = () => view === 'music' && tracks[qi] ? cols(tracks[qi].title) : ['#bf5af2', '#0a84ff'];
function setTint(a, b) { document.documentElement.style.setProperty('--c1', a); document.documentElement.style.setProperty('--c2', b); }
function resetTint() { setTint(...baseTint()); }

// ---------- tiles ----------
const heroSrc = (it) => it.hero ? toURL(it.hero) : steamId(it) ? `https://cdn.akamai.steamstatic.com/steam/apps/${steamId(it)}/library_hero.jpg` : it.cover ? toURL(it.cover) : it.art ? toURL(it.art) : '';
function artHTML(it, extra = '', wide = false) {
  const [a, b] = cols(it.name);
  const isIco = it.category === 'app' && !it.art && !it.cover && it.icon && !wide;
  const src = isIco ? toURL(it.icon) : wide ? heroSrc(it) : it.cover ? toURL(it.cover) : it.art ? toURL(it.art) : '';
  return `<div class="art${isIco ? ' ico' : ''}" style="--ta:${a};--tb:${b}"><span class="glyph">${esc((it.name[0] || '?').toUpperCase())}</span>${!src ? '' : isIco || wide ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<img class="cv" src="${esc(src)}" alt="" loading="lazy">`}${extra}</div>`;
}
function tile(it, o = {}) {
  const [a, b] = cols(it.name);
  const badge = it.category === 'game' && it.source ? `<span class="badge">${esc(String(it.source).toUpperCase())}</span>` : '';
  const info = it.category === 'game' || it.category === 'app' ? `<span class="info" data-act="info" data-id="${esc(it.id)}" role="button" aria-label="${it.category === 'app' ? 'App' : 'Game'} info">i</span>` : '';
  return `<button class="tile ${it.category}${o.sq ? ' sq' : ''}${o.wide ? ' wide' : ''}" data-id="${esc(it.id)}" data-a="${a}" data-b="${b}" style="--ta:${a}">${artHTML(it, badge + info, o.wide)}<div class="cap"><b>${esc(it.name)}</b><small>${esc(it.category === 'app' && /^windows$/i.test(it.source || '') ? '' : (it.source || ''))}</small></div></button>`;
}
const grid = (arr, cls = '') => `<div class="grid ${cls}">${arr.map(t => tile(t)).join('')}</div>`;
const rail = (arr, o) => `<div class="rail">${arr.map(t => tile(t, o)).join('')}</div>`;

// ---------- home (console-style dashboard) ----------
const SVG = {
  lib: '<svg viewBox="0 0 24 24"><path d="M4 4h3v16H4zm5 0h3v16H9zm5.2.6l2.900-.8 4 15.500-2.900.8z"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M7 7V6a5 5 0 0 1 10 0v1h3l-1 14H5L4 7zm2 0h6V6a3 3 0 0 0-6 0zm-1 3v2h2v-2zm6 0v2h2v-2z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.500 3.500 0 1 0 0 7 3.500 3.500 0 0 0 0-7zm8.400 5.300l1.600 1.200-2 3.500-1.900-.7a7.600 7.600 0 0 1-1.800 1l-.3 2H10l-.3-2a7.600 7.600 0 0 1-1.800-1l-1.900.7-2-3.500 1.600-1.200a7.800 7.800 0 0 1 0-2.100L4 10.500l2-3.500 1.900.7a7.600 7.600 0 0 1 1.800-1l.3-2h4l.3 2a7.600 7.600 0 0 1 1.800 1l1.900-.7 2 3.500-1.600 1.200a7.800 7.800 0 0 1 0 2.100z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 1 0 4.200 12.600l4.600 4.600 1.400-1.400-4.600-4.600A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M9 3v12.300A3.500 3.500 0 1 0 11 18.500V8l8-2v7.300A3.500 3.500 0 1 0 21 16.500V3z"/></svg>',
  apps: '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/></svg>'
};
const clockText = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/\s+/g, '').toLowerCase();
setInterval(() => { const c = $('#xclock'); if (c) c.textContent = clockText(); }, 15000);
function homeBg(it) {
  const bg = $('#homebg'); if (!bg) return;
  const src = it ? heroSrc(it) : '';
  if (bg.dataset.src === src) return;
  bg.dataset.src = src;
  if (!src) { bg.innerHTML = ''; return; }
  const im = new Image(); im.alt = '';
  im.onload = () => { if (bg.dataset.src !== src) return; im.className = 'in' + (it.hero || steamId(it) ? '' : ' soft'); bg.appendChild(im); requestAnimationFrame(() => im.classList.add('show')); setTimeout(() => { [...bg.querySelectorAll('img')].slice(0, -1).forEach(x => x.remove()); }, 700); };
  im.src = src;
}
const homeHover = (e) => { if (view !== 'home') return; const t = e.target.closest && e.target.closest('.tile[data-id]'); if (!t) return; const it = S.items.find(i => i.id === t.dataset.id); if (it) homeBg(it); };
document.addEventListener('focusin', homeHover);
document.addEventListener('mouseover', homeHover);

function home() {
  const games = S.items.filter(i => i.category === 'game'), apps = S.items.filter(i => i.category === 'app');
  const head = `<div class="xhead"><button class="xprofile" data-act="goto" data-v="profile" aria-label="Profile">${typeof v21Avatar === 'function' ? v21Avatar() : '<img src="logo.png" alt="">'}<span><b>${esc(typeof v21Name === 'function' ? v21Name() : 'Hollywood')}</b><small><i class="g">\u2605</i> ${typeof arcScore === 'function' ? arcScore().toLocaleString() : 0} \u00b7 ${games.length} games \u00b7 ${apps.length} apps</small></span></button>
    <div class="xright"><button class="xsearch" data-act="gsearch">${SVG.search}<span>Search</span></button><button class="xgear xbell" data-v22="notes" aria-label="Notifications" title="Notifications"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 22a2.4 2.4 0 0 0 2.4-2.4h-4.8A2.4 2.4 0 0 0 12 22zm7-6.4V11a7 7 0 0 0-5.5-6.8V3.5a1.5 1.5 0 0 0-3 0v.7A7 7 0 0 0 5 11v4.6l-2 2v1h18v-1z"/></svg><i></i></button><button class="xgear" data-act="gsettings" aria-label="Settings">${SVG.gear}</button><span class="xclock" id="xclock">${clockText()}</span></div></div>`;
  if (!S.items.length) return head + `<div class="welcome"><h2>Your games, apps and music in one place.</h2><p>Start by pulling in what's already installed.</p><div class="toolbar"><button class="btn primary" data-act="scanAll">Scan my games</button><button class="btn" data-act="startMenu">Import Game Pass / Start menu</button><button class="btn" data-act="add-game">Add a game</button></div></div>`;
  const played = S.items.filter(i => i.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed);
  // the running game has its own Resume tile, so it isn't repeated, and the row never grows past one line
  const resuming = !!(window.__running && window.__running.running), want = resuming ? 5 : 6, isRun = (i) => resuming && i.name === window.__running.name;
  const jump = played.filter(i => !isRun(i)).slice(0, want);
  for (const g of [...games].sort((a, b) => (b.cover ? 1 : 0) - (a.cover ? 1 : 0))) { if (jump.length >= want) break; if (!jump.includes(g) && !isRun(g)) jump.push(g); }
  const gp = games.filter(i => /game ?pass|xbox/i.test(i.source || ''));
  const pick = gp.length ? gp[Math.floor(Date.now() / 86400000) % gp.length] : null;
  const added = [...games].reverse().slice(0, 14);
  homeDefault = jump[0] || null;
  let h = head + `${typeof v2UpdateBanner === 'function' ? v2UpdateBanner() : ''}<h2 class="xtitle">Jump back in</h2><div class="xrow1">${typeof v2ResumeTile === 'function' ? v2ResumeTile() : ''}${jump.map(i => tile(i, { sq: true })).join('')}</div>`;
  h += `<div class="xrow2">
    <button class="xt xgreen" data-act="goto" data-v="games">${SVG.lib}<b>My games<br>&amp; apps</b></button>
    <button class="xt xpurple" data-act="goto" data-v="store">${SVG.bag}<b>Store</b></button>
    <button class="xt xmusic" data-act="goto" data-v="music"><div class="hmart" id="hmart"></div><div class="hmtxt"><small>NOW PLAYING</small><b id="hmt">Music</b><span id="hma"></span></div></button>
    ${pick ? tile(pick, { wide: true }).replace('class="tile ', 'class="tile xt ').replace('<span class="badge">' + esc(String(pick.source).toUpperCase()) + '</span>', '<span class="badge gp">GAME PASS</span>') : `<button class="xt xteal" data-act="scanAll"><b>Find my Game Pass<br>and Steam games</b><small>Scan this PC</small></button>`}
    <button class="xt xblue" data-act="goto" data-v="apps">${SVG.apps}<b>Apps</b><small>${apps.length} ready</small></button></div>`;
  if (added.length) h += `<h2 class="xtitle">Recently added</h2>${rail(added)}`;
  return h;
}
let homeDefault = null;
function paintHomeMusic() {
  const t = $('#hmt'); if (!t) return;
  t.textContent = $('#ptitle').textContent; $('#hma').textContent = $('#partist').textContent; $('#hmart').style.background = $('#pcover').style.background;
}

// ---------- store (Steam + emulators) ----------
const EMU_STORE = [
  { n: 'Dolphin', sys: 'GameCube, Wii', url: 'https://dolphin-emu.org/download/', preset: 'dolphin', d: 'The best GameCube and Wii emulator.' },
  { n: 'PCSX2', sys: 'PlayStation 2', url: 'https://pcsx2.net/downloads', preset: 'pcsx2', d: 'PS2 games in HD with a controller.' },
  { n: 'DuckStation', sys: 'PlayStation 1', url: 'https://www.duckstation.org/', preset: 'duckstation', d: 'Fast, accurate PS1 emulator.' },
  { n: 'RPCS3', sys: 'PlayStation 3', url: 'https://rpcs3.net/download', preset: 'rpcs3', d: 'PS3 emulator. Needs a strong PC.' },
  { n: 'PPSSPP', sys: 'PlayStation Portable', url: 'https://www.ppsspp.org/download', preset: 'ppsspp', d: 'PSP games, upscaled.' },
  { n: 'Cemu', sys: 'Wii U', url: 'https://cemu.info/', preset: 'cemu', d: 'Wii U emulator.' },
  { n: 'mGBA', sys: 'Game Boy, Color, Advance', url: 'https://mgba.io/downloads.html', preset: 'mgba', d: 'Handheld classics.' },
  { n: 'melonDS', sys: 'Nintendo DS', url: 'https://melonds.kuribo64.net/downloads.php', preset: 'melonds', d: 'Nintendo DS emulator.' },
  { n: 'RetroArch', sys: 'NES, SNES, Genesis, N64 and more', url: 'https://www.retroarch.com/?page=platforms', preset: 'retroarch', d: 'One app for dozens of retro consoles.' },
  { n: 'Flycast', sys: 'Dreamcast, Naomi', url: 'https://github.com/flyinghead/flycast/releases', d: 'Sega Dreamcast emulator.' },
  { n: 'Xenia', sys: 'Xbox 360', url: 'https://xenia.jp/', preset: 'xenia', d: 'Xbox 360 emulator. Experimental: many games do not run yet.' },
  { n: 'Azahar', sys: 'Nintendo 3DS', url: 'https://azahar-emu.org/', preset: 'azahar', d: 'Nintendo 3DS emulator, the maintained successor to Citra.' },
  { n: 'xemu', sys: 'Original Xbox', url: 'https://xemu.app/', d: 'Original Xbox emulator.' }
];
const STORE_PRESETS = [['Epic Games Store', 'https://store.epicgames.com'], ['GOG', 'https://www.gog.com'], ['itch.io', 'https://itch.io/games'], ['Humble Store', 'https://www.humblebundle.com/store'], ['Ubisoft Store', 'https://store.ubisoft.com']];
const STORE_TABS = [['top_sellers', 'Top sellers'], ['new_releases', 'New releases'], ['specials', 'On sale'], ['coming_soon', 'Coming soon'], ['free', 'Free to play'], ['gamepass', 'Game Pass'], ['retro', 'Retro classics'], ['emu', 'Emulators'], ['mine', 'My stores']];
// Classic games, for browsing. Arcade can't download them: you add your own game files with the matching emulator.
const LB = 'https://thumbnails.libretro.com/';
const P = (arr) => arr.map((x) => { const [n, f, y] = x.split('|'); let file = f; if (!file) { file = n.replace(/: /g, ' - ').replace(/^The (.*?)( - |$)/, '$1, The$2'); file = file.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u2019/g, "'") + ' (USA)'; } return [n, file, +y]; });
const RETRO = [
  ['Super Nintendo', 'RetroArch', 'Nintendo - Super Nintendo Entertainment System', [['Super Mario World', 'Super Mario World (USA)', 1990], ['The Legend of Zelda: A Link to the Past', 'Legend of Zelda, The - A Link to the Past (USA)', 1991], ['Super Metroid', 'Super Metroid (Japan, USA) (En,Ja)', 1994], ['Chrono Trigger', 'Chrono Trigger (USA)', 1995], ['Donkey Kong Country', 'Donkey Kong Country (USA)', 1994], ['Super Mario Kart', 'Super Mario Kart (USA)', 1992], ['EarthBound', 'EarthBound (USA)', 1995]]],
  ['NES', 'RetroArch', 'Nintendo - Nintendo Entertainment System', [['Super Mario Bros. 3', 'Super Mario Bros. 3 (USA)', 1988], ['The Legend of Zelda', 'Legend of Zelda, The (USA)', 1986], ['Mega Man 2', 'Mega Man 2 (USA)', 1988], ['Metroid', 'Metroid (USA)', 1986], ['Castlevania', 'Castlevania (USA)', 1986]]],
  ['Nintendo 64', 'RetroArch', 'Nintendo - Nintendo 64', [['Super Mario 64', 'Super Mario 64 (USA)', 1996], ['Zelda: Ocarina of Time', 'Legend of Zelda, The - Ocarina of Time (USA)', 1998], ['GoldenEye 007', 'GoldenEye 007 (USA)', 1997], ['Mario Kart 64', 'Mario Kart 64 (USA)', 1996], ['Super Smash Bros.', 'Super Smash Bros. (USA)', 1999]]],
  ['Game Boy', 'mGBA', 'Nintendo - Game Boy', [['Pok\u00e9mon Red', 'Pokemon - Red Version (USA, Europe) (SGB Enhanced)', 1996], ['Tetris', 'Tetris (World) (Rev 1)', 1989]]],
  ['Game Boy Advance', 'mGBA', 'Nintendo - Game Boy Advance', [['Pok\u00e9mon FireRed', 'Pokemon - FireRed Version (USA, Europe)', 2004], ['Metroid Fusion', 'Metroid Fusion (USA)', 2002], ['Zelda: The Minish Cap', 'Legend of Zelda, The - The Minish Cap (USA)', 2004]]],
  ['Nintendo DS', 'melonDS', 'Nintendo - Nintendo DS', [['Mario Kart DS', 'Mario Kart DS (USA) (En,Fr,De,Es,It)', 2005], ['New Super Mario Bros.', 'New Super Mario Bros. (USA, Australia)', 2006], ['Pok\u00e9mon HeartGold', 'Pokemon - HeartGold Version (USA)', 2010]]],
  ['Sega Genesis', 'RetroArch', 'Sega - Mega Drive - Genesis', [['Sonic the Hedgehog 2', 'Sonic The Hedgehog 2 (World)', 1992], ['Streets of Rage 2', 'Streets of Rage 2 (USA)', 1992], ['Phantasy Star IV', 'Phantasy Star IV (USA)', 1993]]],
  ['PlayStation', 'DuckStation', 'Sony - PlayStation', [['Final Fantasy VII', 'Final Fantasy VII (USA) (Disc 1)', 1997], ['Castlevania: Symphony of the Night', 'Castlevania - Symphony of the Night (USA)', 1997], ['Crash Bandicoot', 'Crash Bandicoot (USA)', 1996], ['Metal Gear Solid', 'Metal Gear Solid (USA) (Disc 1) (Rev 1)', 1998], ['Spyro the Dragon', 'Spyro the Dragon (USA)', 1998]]],
  ['GameCube', 'Dolphin', 'Nintendo - GameCube', [['Metroid Prime', 'Metroid Prime (USA)', 2002], ['Zelda: The Wind Waker', 'Legend of Zelda, The - The Wind Waker (USA)', 2002], ['Super Smash Bros. Melee', 'Super Smash Bros. Melee (USA) (En,Ja) (Rev 2)', 2001], ['Mario Kart: Double Dash!!', 'Mario Kart - Double Dash!! (USA)', 2003]]],
  ['PlayStation 2', 'PCSX2', 'Sony - PlayStation 2', P(['Shadow of the Colossus|Shadow of the Colossus (USA)|2005', 'God of War||2005', 'God of War II||2007', 'Grand Theft Auto III||2001', 'Grand Theft Auto: Vice City||2002', 'Grand Theft Auto: San Andreas||2004', 'Kingdom Hearts||2002', 'Kingdom Hearts II||2005', 'Final Fantasy X||2001', 'Final Fantasy XII||2006', 'Gran Turismo 4||2004', 'Metal Gear Solid 3: Snake Eater||2004', 'Resident Evil 4||2005', 'Ratchet & Clank||2002', 'Jak and Daxter: The Precursor Legacy||2001', 'Okami||2006', 'Tekken 5||2005', 'Devil May Cry 3: Dante’s Awakening||2005', 'Burnout 3: Takedown||2004', 'Need for Speed: Most Wanted||2005', 'Silent Hill 2||2001', 'Bully||2006', 'Persona 4||2008', 'Tony Hawk’s Pro Skater 3||2001', 'SSX 3||2003', 'WWE SmackDown! Here Comes the Pain||2003', 'Madden NFL 06||2005', 'NCAA Football 06||2005', 'Guitar Hero III: Legends of Rock||2007']), ''],
  ['PlayStation 3', 'RPCS3', 'Sony - PlayStation 3', P(['The Last of Us||2013', 'God of War III||2010', 'Uncharted 2: Among Thieves||2009', 'Uncharted 3: Drake’s Deception||2011', 'Red Dead Redemption||2010', 'Grand Theft Auto V||2013', 'Metal Gear Solid 4: Guns of the Patriots||2008', 'Demon’s Souls||2009', 'Dark Souls||2011', 'The Elder Scrolls V: Skyrim||2011', 'Persona 5||2017', 'Skate 3||2010', 'Gran Turismo 5||2010', 'LittleBigPlanet||2008', 'Call of Duty: Modern Warfare 2||2009', 'Batman: Arkham City||2011', 'BioShock Infinite||2013', 'Ratchet & Clank Future: Tools of Destruction||2007', 'Heavy Rain||2010', 'Resident Evil 5||2009', 'NCAA Football 14||2013', 'Madden NFL 25||2013', 'Infamous||2009', 'Killzone 2||2009', 'Tekken 6||2009', 'Ni no Kuni: Wrath of the White Witch||2013']), 'PS3 is the hardest console to emulate. You need a strong PC, and some games still have problems.'],
  ['Xbox 360', 'Xenia', 'Microsoft - Xbox 360', P(['Halo 3||2007', 'Halo: Reach||2010', 'Gears of War||2006', 'Gears of War 2||2008', 'Forza Motorsport 4||2011', 'Forza Horizon||2012', 'Fable II||2008', 'Mass Effect 2||2010', 'Mass Effect 3||2012', 'Red Dead Redemption||2010', 'Grand Theft Auto V||2013', 'Skate 3||2010', 'Call of Duty 4: Modern Warfare||2007', 'Call of Duty: Black Ops||2010', 'Call of Duty: Black Ops II||2012', 'Borderlands||2009', 'Borderlands 2||2012', 'The Elder Scrolls V: Skyrim||2011', 'Fallout 3||2008', 'Fallout: New Vegas||2010', 'BioShock||2007', 'Left 4 Dead 2||2009', 'Minecraft: Xbox 360 Edition||2012', 'Dead Rising||2006', 'Dark Souls||2011', 'Batman: Arkham City||2011', 'Burnout Paradise||2008', 'NCAA Football 14||2013', 'Madden NFL 25||2013', 'Assassin’s Creed II||2009', 'Mirror’s Edge||2008', 'Project Gotham Racing 4||2007', 'Alan Wake||2010']), 'Xbox 360 emulation is still young. Some games run well, others do not run at all. Check Xenia’s compatibility list first.'],
  ['PSP', 'PPSSPP', 'Sony - PlayStation Portable', P(['God of War: Chains of Olympus||2008', 'God of War: Ghost of Sparta||2010', 'Crisis Core: Final Fantasy VII||2007', 'Monster Hunter Freedom Unite||2009', 'Grand Theft Auto: Liberty City Stories||2005', 'Grand Theft Auto: Vice City Stories||2006', 'Daxter||2006', 'Patapon||2008', 'LocoRoco||2006', 'Metal Gear Solid: Peace Walker||2010', 'Final Fantasy Tactics: The War of the Lions||2007', 'Tekken: Dark Resurrection||2006', 'Persona 3 Portable||2010', 'Kingdom Hearts: Birth by Sleep||2010', 'Lumines||2005', 'Ridge Racer||2005', 'Burnout Legends||2005', 'Syphon Filter: Dark Mirror||2006', 'Dissidia Final Fantasy||2009', 'Wipeout Pure||2005', 'Ratchet & Clank: Size Matters||2007', 'Jeanne d’Arc||2007', 'Valkyria Chronicles II||2011']), 'PSP is the easiest of these to emulate. Almost anything runs well on a modern PC.'],
  ['Wii', 'Dolphin', 'Nintendo - Wii', P(['Super Mario Galaxy||2007', 'Super Mario Galaxy 2||2010', 'Mario Kart Wii|Mario Kart Wii (USA) (En,Fr,Es) (Rev 1)|2008', 'Wii Sports||2006', 'Wii Sports Resort||2009', 'New Super Mario Bros. Wii||2009', 'Super Smash Bros. Brawl||2008', 'The Legend of Zelda: Twilight Princess||2006', 'The Legend of Zelda: Skyward Sword||2011', 'Metroid Prime 3: Corruption||2007', 'Donkey Kong Country Returns||2010', 'Xenoblade Chronicles||2012', 'Kirby’s Epic Yarn||2010', 'Mario Party 8||2007', 'Resident Evil 4: Wii Edition||2007', 'Punch-Out!!||2009', 'Super Paper Mario||2007', 'Wii Fit||2008', 'Wii Play||2007', 'Epic Mickey||2010', 'Mario Strikers Charged||2007', 'Sonic Colors||2010', 'Okami||2008', 'Mario & Sonic at the Olympic Games||2007', 'Rhythm Heaven Fever||2012', 'Just Dance 3||2011']), 'Wii games usually run great in Dolphin. Games that use the motion bar need it mapped to your controller.'],
  ['Nintendo 3DS', 'Azahar', 'Nintendo - Nintendo 3DS', P(['Super Mario 3D Land||2011', 'Mario Kart 7||2011', 'The Legend of Zelda: Ocarina of Time 3D||2011', 'The Legend of Zelda: A Link Between Worlds||2013', 'The Legend of Zelda: Majora’s Mask 3D||2015', 'Pokémon X||2013', 'Pokémon Y||2013', 'Pokémon Omega Ruby||2014', 'Pokémon Sun||2016', 'Animal Crossing: New Leaf||2013', 'Fire Emblem Awakening||2013', 'Kirby: Planet Robobot||2016', 'Super Smash Bros. for Nintendo 3DS||2014', 'Luigi’s Mansion: Dark Moon||2013', 'Monster Hunter 4 Ultimate||2015', 'Bravely Default||2014', 'Kid Icarus: Uprising||2012', 'Metroid: Samus Returns||2017', 'Paper Mario: Sticker Star||2012', 'Mario & Luigi: Dream Team||2013', 'Donkey Kong Country Returns 3D||2013', 'Resident Evil: Revelations||2012', 'Shin Megami Tensei IV||2013', 'Yoshi’s New Island||2014', 'Star Fox 64 3D||2011']), '3DS emulation is solid. Games run well on most PCs. The original Citra was shut down in 2024, so Azahar is the maintained successor.']
];
const retroFlat = RETRO.flatMap(([con, emu, sys, games, note]) => games.map(([n, f, y]) => ({ n, con, emu, y, note: note || '', img: LB + encodeURIComponent(sys) + '/Named_Boxarts/' + encodeURIComponent(f.replace(/[&*\/:`<>?\\|"]/g, '_')) + '.png' })));

let retroSys = '';
let storeTab = 'top_sellers', storeQ = '', storeData = {}, storeErr = '', gpSub = 'gamepass', storeSort = '';
const GP_SUBS = [['gamepass', 'All on PC'], ['gp_new', 'Recently added'], ['gp_popular', 'Most popular'], ['gp_soon', 'Coming soon'], ['gp_leaving', 'Leaving soon'], ['gp_ea', 'EA Play'], ['gp_console', 'Console games']];
const storeCat = () => storeTab === 'gamepass' ? gpSub : storeTab;
const sKey = () => storeQ ? 'q:' + storeQ : storeCat();
async function loadStore() {
  const key = sKey();
  if (storeData[key] !== undefined) return;
  storeData[key] = null;
  const r = await fetch('/api/store?' + (storeQ ? 'q=' + encodeURIComponent(storeQ) : 'cat=' + storeCat())).then(x => x.json()).catch(() => null);
  storeErr = r && r.ok === false ? (r.error || '') : (r ? '' : "Couldn't reach the store.");
  storeData[key] = (r && r.items) || [];
  if (view === 'store') render();
}
function storeTile(it) {
  const [a, b] = cols(it.name);
  const imgSrc = it.img || `https://cdn.akamai.steamstatic.com/steam/apps/${it.id}/library_600x900_2x.jpg`;
  const price = `<span class="badge price">${esc(it.price || '')}${it.off ? ' · -' + it.off + '%' : ''}</span>`;
  const own = !it.img && S.items.some(i => steamId(i) === it.id);
  return `<button class="tile game stile" data-sid="${esc(it.id)}" data-sname="${esc(it.name)}" data-sprice="${esc(it.price || '')}" data-ssrc="${esc(it.src || 'steam')}" data-simg="${esc(it.img || '')}" data-a="${a}" data-b="${b}" style="--ta:${a}"><div class="art" style="--ta:${a};--tb:${b}"><span class="glyph">${esc((it.name[0] || '?').toUpperCase())}</span><img src="${esc(imgSrc)}" alt="" loading="lazy" referrerpolicy="no-referrer">${price}${own ? '<span class="badge own">IN LIBRARY</span>' : ''}</div><div class="cap"><b>${esc(it.name)}</b><small>${it.src === 'gp' ? 'Game Pass' : 'Steam'}</small></div></button>`;
}
function retroTile(g) {
  const i = retroFlat.indexOf(g), [a, b] = cols(g.n);
  return `<button class="tile game stile" data-rid="${i}" data-a="${a}" data-b="${b}" style="--ta:${a}"><div class="art" style="--ta:${a};--tb:${b}"><span class="glyph">${esc(g.n[0])}</span><img src="${esc(g.img)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="badge price">${g.y}</span></div><div class="cap"><b>${esc(g.n)}</b></div></button>`;
}
function store() {
  let h = '<h1 class="title">Store</h1><div class="asearch"><input id="stq" type="search" placeholder="Search the Steam store" value="' + esc(storeQ) + '" autocomplete="off"><button class="btn primary" data-act="stsearch">Search</button></div>';
  h += '<div class="chips tabs">' + STORE_TABS.map(([k, t]) => `<button class="chip ${!storeQ && k === storeTab ? 'on' : ''}" data-act="sttab" data-k="${k}">${t}</button>`).join('') + (storeQ ? `<button class="chip on" data-act="stclear">Results for “${esc(storeQ)}” ✕</button>` : '') + '</div>';
  if (!storeQ && storeTab === 'mine') {
    const mine = S.items.filter(i => i.category === 'store');
    return h + '<p class="hint" style="margin-bottom:12px">Add a store or launcher where you buy or download games legally: an app on this PC or a website. Arcade only opens it for you. It never downloads or installs games itself.</p>' +
      '<div class="toolbar"><button class="btn primary" data-act="add-store">Add a store</button></div>' +
      '<div class="chips tabs sub">' + STORE_PRESETS.map((p, i) => `<button class="chip" data-act="store-preset" data-i="${i}">${esc(p[0])}</button>`).join('') + '</div>' +
      (mine.length ? '<div class="ecards">' + mine.map(s => `<div class="ecard"><div><b>${esc(s.name)}</b><small>${esc(s.target || '')}</small></div><div class="ctl"><button class="btn primary" data-act="play" data-id="${esc(s.id)}">Open</button><button class="btn" data-act="edit-store" data-id="${esc(s.id)}">Edit</button></div></div>`).join('') + '</div>' : '<div class="empty">No stores yet. Tap Add a store, or a quick-add above to start.</div>');
  }
  if (!storeQ && storeTab === 'retro') {
    const rs = RETRO.map(r => r[0]);
    h += '<div class="chips tabs">' + ['All', ...rs].map(c => `<button class="chip ${(retroSys || 'All') === c ? 'on' : ''}" data-act="rsys" data-k="${esc(c)}">${esc(c)}</button>`).join('') + '</div>';
    return h + '<p class="hint" style="margin-bottom:6px">Classics you can play with an emulator. Arcade can\u2019t download games: use your own game files, add the matching emulator, then Add games from a folder. Tap a game to see which emulator runs it.</p>' +
      RETRO.filter(r => !retroSys || r[0] === retroSys).map(([con, , , games]) => { const base = retroFlat.filter(g => g.con === con); return `<h2 class="row-title">${esc(con)}</h2><div class="grid">${base.map(retroTile).join('')}</div>`; }).join('');
  }
  if (!storeQ && storeTab === 'emu') {
    return h + '<p class="hint" style="margin-bottom:14px">Emulators are free and legal to download. Get one from its official site, then tap Add to Arcade to set it up. You supply your own game files.</p><div class="ecards">' +
      EMU_STORE.map((e, i) => `<div class="ecard"><div><b>${esc(e.n)}</b><small>${esc(e.sys)}</small><p>${esc(e.d)}</p></div><div class="ctl"><button class="btn primary" data-act="emu-get" data-i="${i}">Download</button><button class="btn" data-act="emu-add" data-i="${i}">Add to Arcade</button>${typeof v21canInstall === 'function' && v21canInstall(e) ? `<button class="btn" data-act="emu-install" data-i="${i}">Install for me</button>` : ''}</div></div>`).join('') + '</div>';
  }
  const key = sKey(), items = storeData[key];
  if (items === undefined) { loadStore(); return h + '<p class="hint">Loading…</p>'; }
  if (items === null) return h + '<p class="hint">Loading…</p>';
  if (storeTab === 'gamepass' && !storeQ) h += '<div class="chips tabs sub">' + GP_SUBS.map(([k, t]) => `<button class="chip ${k === gpSub ? 'on' : ''}" data-act="gpsub" data-k="${k}">${t}</button>`).join('') + '</div>';
  if (!items.length) return h + `<div class="empty">${esc(storeErr || 'Nothing found.')}</div>`;
  let list = items.slice();
  const price = (x) => /^free/i.test(x.price || '') ? 0 : parseFloat(String(x.price || '').replace(/[^0-9.]/g, '')) || 0;
  if (storeSort === 'az') list.sort((x, y) => x.name.localeCompare(y.name));
  else if (storeSort === 'low') list.sort((x, y) => price(x) - price(y));
  else if (storeSort === 'off') list.sort((x, y) => (y.off || 0) - (x.off || 0));
  const hero = !storeQ && !storeSort && storeTab !== 'gamepass' && list.find(x => x.price && x.id);
  let hh = '';
  if (hero) {
    const [a, b] = cols(hero.name);
    hh = `<button class="shero stile" data-sid="${esc(hero.id)}" data-sname="${esc(hero.name)}" data-sprice="${esc(hero.price || '')}" data-ssrc="steam" data-simg="" data-a="${a}" data-b="${b}"><img src="https://cdn.akamai.steamstatic.com/steam/apps/${esc(hero.id)}/library_hero.jpg" alt="" referrerpolicy="no-referrer" onerror="this.src='https://cdn.akamai.steamstatic.com/steam/apps/${esc(hero.id)}/header.jpg'"><span class="shtxt"><small>${storeTab === 'coming_soon' ? 'Coming soon' : 'Featured'}</small><b>${esc(hero.name)}</b><em>${esc(hero.price)}${hero.off ? ' \u00b7 -' + hero.off + '%' : ''}</em></span></button>`;
  }
  const sorts = [['', 'Default'], ['az', 'A\u2013Z']].concat(list.some(x => x.price && x.src !== 'gp') ? [['low', 'Price'], ['off', 'Discount']] : []);
  const bar = `<div class="stbar"><input id="stf" type="search" placeholder="Filter these ${list.length} games" autocomplete="off"><span class="chips">${sorts.map(([k, t]) => `<button class="chip ${storeSort === k ? 'on' : ''}" data-act="stsort" data-k="${k}">${t}</button>`).join('')}</span><small id="stcount">${list.length} games</small></div>`;
  return h + hh + bar + `<div class="grid" id="stgrid">${list.map(storeTile).join('')}</div>`;
}
document.addEventListener('input', (e) => {
  if (!e.target || e.target.id !== 'stf') return;
  const q = e.target.value.trim().toLowerCase(); let n = 0;
  $$('#stgrid .stile').forEach(t => { const on = !q || (t.dataset.sname || '').toLowerCase().includes(q); t.hidden = !on; if (on) n++; });
  const c = $('#stcount'); if (c) c.textContent = n + ' games';
});
const sdlg = $('#sdlg');
let storePick = null;
function openStoreItem(t) {
  const gp = t.dataset.ssrc === 'gp';
  storePick = { id: t.dataset.sid, name: t.dataset.sname, price: t.dataset.sprice, gp };
  $('#sname').textContent = storePick.name; $('#sprice').textContent = storePick.price || '';
  $('#scover').innerHTML = `<img src="${esc(gp ? t.dataset.simg : 'https://cdn.akamai.steamstatic.com/steam/apps/' + storePick.id + '/library_600x900.jpg')}" alt="" referrerpolicy="no-referrer">`;
  $('#sinstall').hidden = gp || storePick.price !== 'Free'; $('#sgoemu').hidden = true; $('#sopen').hidden = false;
  $('#sopen').textContent = gp ? 'Open in Microsoft Store' : 'Open in Steam';
  const own = !gp && S.items.find(i => steamId(i) === storePick.id);
  $('#sdesc').textContent = gp ? 'Included with Game Pass on PC. Opens the Microsoft Store, where you can install it. Installed games show up here after you tap Scan all my games.' : own ? 'This game is already in your library.' : 'Opens in the Steam app, where you can buy or install it. Installed games show up here after you tap Scan all my games.';
  $('#smeta').textContent = ''; $('#sshots').innerHTML = '';
  if (!sdlg.open) sdlg.showModal();
  $('#sopen').focus();
  const pid = storePick.id;
  fetch('/api/storeinfo?src=' + (gp ? 'gp' : 'steam') + '&id=' + encodeURIComponent(pid)).then(r => r.json()).then(r => {
    if (!r || !r.ok || !storePick || storePick.id !== pid) return;
    const i = r.info, bits = [i.dev, i.date, (i.genres || []).join(', '), i.score ? 'Metacritic ' + i.score : ''].filter(Boolean);
    $('#smeta').textContent = bits.join(' \u00b7 ');
    if (i.desc) $('#sdesc').textContent = i.desc + (gp ? '' : own ? ' (Already in your library.)' : '');
    $('#sshots').innerHTML = (i.shots || []).map(u => `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join('');
  }).catch(() => { });
}
function openRetro(g) {
  storePick = null;
  $('#sname').textContent = g.n; $('#smeta').textContent = ''; $('#sshots').innerHTML = ''; $('#sprice').textContent = g.con + ' \u00b7 ' + g.y;
  $('#scover').innerHTML = `<img src="${esc(g.img)}" alt="" referrerpolicy="no-referrer">`;
  $('#sinstall').hidden = true; $('#sopen').hidden = true; $('#sgoemu').hidden = false; $('#sgoemu').textContent = 'Find ' + g.emu;
  $('#sdesc').textContent = 'A classic for the ' + g.con + '. Arcade can\u2019t download games for you. If you own it, add your game file with ' + g.emu + ': get the emulator here, then use Add games from a folder.' + (g.note ? ' ' + g.note : '');
  retroEmu = g.emu;
  if (!sdlg.open) sdlg.showModal();
  $('#sgoemu').focus();
}
let retroEmu = '';
$('#sgoemu').addEventListener('click', () => { sdlg.close(); storeTab = 'emu'; storeQ = ''; render(); });
$('#sopen').addEventListener('click', () => { sdlg.close(); if (storePick) api.launch({ kind: 'uri', target: storePick.gp ? 'ms-windows-store://pdp/?productid=' + storePick.id : 'steam://store/' + storePick.id, name: storePick.gp ? 'Microsoft Store' : 'Steam' }); });
$('#sinstall').addEventListener('click', () => { sdlg.close(); if (storePick) { toast('Opening Steam to install ' + storePick.name + '…'); api.launch({ kind: 'uri', target: 'steam://install/' + storePick.id, name: 'Steam' }); } });
$('#sclose').addEventListener('click', () => sdlg.close());

function apps() {
  const list = S.items.filter(i => i.category === 'app' && hit(i));
  return `<h1 class="title">Apps</h1><div class="toolbar"><button class="btn primary" data-act="add-app">Add app</button><button class="btn" data-act="essentials">Add my essentials</button></div>` +
    (list.length ? `<div class="lp">${grid(list, 'apps lpg')}</div>` : '<div class="empty">No apps yet.</div>') +
    `<p class="hint" style="margin-top:26px">Web apps like Jellyfin and ErsatzTV open inside Arcade. Programs like Firefox and File Explorer open in their own window (Alt+Tab or the Arcade window gets you back). If a server runs on another address, right-click its tile to change it.</p>`;
}

function music() {
  if (playMode === 'system') return musicSystem();
  if (!tracks.length) {
    return `<h1 class="title">Music</h1><div class="empty">Pick the folder where your music lives and it plays right here.<div class="toolbar"><button class="btn primary" data-act="pickMusic">Choose music folder</button><button class="btn" data-act="applefolder">Use my Apple Music / iTunes folder</button><button class="btn" data-act="mode-sys">Back to Apple Music</button></div></div>`;
  }
  const cur = tracks[qi];
  const ql = q.toLowerCase();
  const rows = tracks.map((t, i) => ({ t, i })).filter(({ t }) => !ql || (t.title + ' ' + t.artist).toLowerCase().includes(ql));
  const shown = rows.slice(0, 400);
  const [a, b] = cur ? cols(cur.title) : ['#ff375f', '#0a84ff'];
  return `<h1 class="title">Music</h1><div class="music">
    <div class="np" style="--ta:${a};--tb:${b}"><canvas id="viz" width="600" height="600"${cur && cur.cover ? ' hidden' : ''}></canvas>
      ${cur && cur.cover ? `<img class="npart" src="${esc(cur.cover)}" alt="">` : ''}<h2>${esc(cur ? cur.title : 'Pick a song')}</h2><p>${esc(cur ? [cur.artist, cur.album].filter(Boolean).join(' \u00b7 ') : tracks.length + ' songs')}</p>
      <div class="toolbar" style="margin:0"><button class="btn primary" data-act="shufflePlay">Shuffle</button><button class="btn" data-act="pickMusic">Change folder</button><button class="btn" data-act="mode-sys">Apple Music</button></div></div>
    <div class="tracks">${shown.map(({ t, i }) => `<button class="track ${i === qi ? 'on' : ''}" data-act="track" data-i="${i}"><span>${esc(t.title)}</span><small>${esc([t.artist, t.album].filter(Boolean).join(' \u00b7 '))}</small></button>`).join('')}
      ${rows.length > shown.length ? `<p class="hint" style="padding:14px 16px">Showing the first ${shown.length} of ${rows.length}. Search to narrow it down.</p>` : ''}</div></div>`;
}

let netRes = '';
function settings() {
  const s = S.settings;
  const row = (title, sub, ctl) => `<div class="setting"><div><b>${title}</b><small>${sub}</small></div>${ctl}</div>`;
  return `<h1 class="title">Settings</h1>` + appearance() +
    row('Open in full screen', 'Fills the screen when the app opens. F11 toggles it any time.', `<button class="switch ${s.fullscreen ? 'on' : ''}" role="switch" aria-checked="${!!s.fullscreen}" data-act="toggle-fs"></button>`) +
    row('Open web apps inside Arcade', 'Jellyfin, ErsatzTV and other web apps open right here instead of a separate window. Apps that block this (like Discord) open in their own window.', `<button class="switch ${s.appsInside !== false ? 'on' : ''}" role="switch" aria-checked="${s.appsInside !== false}" data-act="toggle-inside"></button>`) +
    row('Start with Windows', 'Boots straight into Hollywood Arcade when you sign in.', `<button class="switch ${s.startWithWindows ? 'on' : ''}" role="switch" aria-checked="${!!s.startWithWindows}" data-act="toggle-boot"></button>`) +
    row('Steam folder', esc(s.steamPath || 'Detected automatically'), `<button class="btn" data-act="pick-steam">Choose</button>`) +
    row('Music folder', esc(s.musicFolder || 'Not set'), `<button class="btn" data-act="pickMusic">Choose</button>`) +
    row('In-game music &amp; volume panel', hotkeyText, `<button class="btn" data-act="overlay-open">Open now</button>`) +
    (typeof v2Settings === 'function' ? v2Settings() : '') +
    row('Patch notes', 'See what changed in every version. You are on ' + (window.APP_VERSION || ''), `<button class="btn" data-act="patchnotes">View</button>`) +
    row('Game info &amp; covers', 'Works with no key: it matches your games against Steam, GOG, Libretro (for ROMs) and Wikipedia. Keys below are optional extras.', `<button class="btn" data-act="meta-all">Fetch now</button>`) +
    row('Test connection', netRes || 'Checks that Arcade can reach the free sources for covers, info and music.', `<button class="btn" data-act="nettest">Run test</button>`) +
    row('IGDB client ID', 'Free: dev.twitch.tv, register an app. Best descriptions, scores, screenshots.', `<input class="keyin" data-set="igdbId" value="${esc(s.igdbId || '')}" placeholder="Client ID" autocomplete="off">`) +
    row('IGDB client secret', 'From the same Twitch app page.', `<input class="keyin" type="password" data-set="igdbSecret" value="${esc(s.igdbSecret || '')}" placeholder="Client secret" autocomplete="off">`) +
    row('RAWG key', 'Free at rawg.io/apidocs: descriptions, genres, release year.', `<input class="keyin" data-set="rawgKey" value="${esc(s.rawgKey || '')}" placeholder="Paste key" autocomplete="off">`) +
    row('TheGamesDB key', 'Free key from thegamesdb.net (cover art). Covers also come from LaunchBox and Wikipedia without a key.', `<input class="keyin" data-set="tgdbKey" value="${esc(s.tgdbKey || '')}" placeholder="Paste key" autocomplete="off">`) +
    row('Use as my Windows shell', s.shellMode ? 'On: after you sign in, Hollywood Arcade replaces the desktop and taskbar. Power menu has "Windows desktop" and a restore file was saved next to the exe.' : 'Replaces the Windows desktop and taskbar for your account, like a console. Windows stays underneath so every game still works. Easy to undo.', s.shellMode ? `<button class="btn" data-act="shell-off">Turn off</button>` : `<button class="btn ${shellArm ? 'primary' : ''}" data-act="shell-on">${shellArm ? 'Tap again to confirm' : 'Turn on'}</button>`) +
    emuSettings() + `<p class="hint" style="margin-top:18px">Controller (PS5 or Xbox): D-pad or left stick moves, \u2715/A opens, \u25cb/B goes back, \u25a1/X shows game info, \u25b3/Y edits, L1/R1 switch sections, L2/R2 change song, Options plays or pauses, Create opens Power, the touchpad (held), L3+R3 (held) or the PS button opens the Guide, right stick scrolls. Press Ctrl+Alt+H on a keyboard to open the music and volume panel over a game.</p>`;
}

// ---------- web apps shown inside Arcade ----------
let appFrame = null, lastView = 'home';
function appview() {
  const f = appFrame; if (!f) return '';
  return `<div class="appbar"><button class="btn" data-act="app-back">&lsaquo; Back</button><b>${esc(f.name)}</b><span class="spacer"></span><small class="hint">Controller: Create / View button goes back</small><button class="btn" data-act="app-reload">Reload</button><button class="btn" data-act="app-window">Open in its own window</button></div>` +
    `<iframe class="appframe" id="appframe" src="${esc(f.url)}" title="${esc(f.name)}" allow="autoplay; fullscreen; gamepad; clipboard-write; picture-in-picture; encrypted-media; microphone; camera"></iframe>`;
}
const appBack = () => { appFrame = null; view = lastView === 'app' ? 'apps' : lastView; render(); };
async function openAppInside(it) {
  const r = await fetch('/api/frameCheck?url=' + encodeURIComponent(it.target)).then(x => x.json()).catch(() => ({ ok: false, reason: '' }));
  if (!r.ok) { if (r.reason) toast(r.reason + ' Opening it in its own window.'); return false; }
  lastView = view === 'app' ? lastView : view; appFrame = { id: it.id, name: it.name, url: it.target, item: it };
  view = 'app'; render(); it.lastPlayed = Date.now(); it.plays = (it.plays || 0) + 1; save();
  return true;
}

// ---------- appearance ----------
const ACCENTS = [['Green', ['#107c10', '#159c15', '#9bf00b']], ['Blue', ['#0f6cbd', '#2b88d8', '#6cb8ff']], ['Purple', ['#7a3fd1', '#9a5ff0', '#cfa8ff']], ['Red', ['#c42b1c', '#e0463a', '#ff9a8f']], ['Orange', ['#d9730d', '#f08a24', '#ffc27a']], ['Pink', ['#d6336c', '#ee5a8f', '#ffa8c8']], ['Mono', ['#5c5c5c', '#8a8a8a', '#ffffff']]];
const BGS = [['Charcoal', '#0f0f0f'], ['Black', '#000000'], ['Slate', '#11161d'], ['Navy', '#0a1022'], ['Plum', '#150f1d'], ['Forest', '#0a140c'], ['Crimson', '#1a0d0f'],
  ['Graphite', '#26282d'], ['Steel', '#2b3644'], ['Midnight', '#0d1b3a'], ['Ocean', '#0a3a5c'], ['Royal', '#14307a'], ['Teal', '#06303a'], ['Emerald', '#0b3d2a'], ['Moss', '#2c3a22'], ['Wine', '#3a0f1f'], ['Rose', '#4a1530'], ['Violet', '#251447'], ['Indigo', '#2a2366'], ['Sunset', '#4a2008'], ['Rust', '#5a2a14'], ['Coffee', '#2e1f17'], ['Stone', '#4a4a4a']];
const BGS_LIGHT = [['Snow', '#f2f2f2'], ['Mist', '#e0e4ea'], ['Sand', '#d8cdb4'], ['Sky', '#bcd8f2'], ['Mint', '#c6e8d4'], ['Blush', '#f0d4dc'], ['Lilac', '#d9d0ee'], ['Silver', '#b8bcc2']];
const TILE_PX = { s: 120, m: 150, l: 190 };
function applyTheme() {
  const t = (S.settings && S.settings.theme) || {}, r = document.documentElement.style;
  let ac = t.ac;
  if (!ac && t.acHex) ac = [t.acHex, `color-mix(in srgb, ${t.acHex} 80%, #fff)`, `color-mix(in srgb, ${t.acHex} 35%, #fff)`];
  if (!ac) ac = ACCENTS[0][1];
  r.setProperty('--xg', ac[0]); r.setProperty('--xg2', ac[1]); r.setProperty('--xhi', ac[2]);
  r.setProperty('--bg', t.bg || '#0f0f0f');
  r.setProperty('--glow', t.glow === undefined ? 30 : t.glow);
  r.setProperty('--tile', (TILE_PX[t.size] || 150) + 'px');
  r.setProperty('--tr', t.round ? '14px' : '2px');
  r.setProperty('--bgimg', t.bgimg ? `url("${toURL(t.bgimg)}")` : 'none');
  document.body.classList.toggle('hasbg', !!t.bgimg);
  { const h = String(t.bg || '#0f0f0f').replace('#', ''), v = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); document.body.classList.toggle('bglight', (v[0] * .2126 + v[1] * .7152 + v[2] * .0722) / 255 > .6); }
  document.body.classList.toggle('caps-on', !!t.caps);
}
function appearance() {
  const t = S.settings.theme || {};
  const row = (title, sub, ctl) => `<div class="setting"><div><b>${title}</b><small>${sub}</small></div><div class="ctl">${ctl}</div></div>`;
  const seg = (k, opts, cur) => opts.map(([v, l]) => `<button class="chip ${String(cur) === String(v) ? 'on' : ''}" data-act="theme" data-k="${k}" data-v="${v}">${l}</button>`).join('');
  const curAc = (t.ac && t.ac[0]) || (!t.ac && !t.acHex ? ACCENTS[0][1][0] : '');
  return '<div class="mixh">Appearance</div>' +
    row('Accent color', 'Buttons, highlights and the selection outline.', ACCENTS.map(([n, c], i) => `<button class="sw ${curAc === c[0] ? 'on' : ''}" style="--sw:${c[1]}" title="${n}" aria-label="${n}" data-act="theme" data-k="ac" data-v="${i}"></button>`).join('') + `<input type="color" class="swpick" data-theme="acHex" value="${esc(t.acHex || '#107c10')}" title="Custom color" aria-label="Custom accent color">`) +
    row('Background color', 'The color behind everything.', BGS.concat(typeof uiStyle === 'function' && uiStyle() === 'nsw' ? BGS_LIGHT : []).map(([n, c]) => `<button class="sw ${(t.bg || '#0f0f0f') === c ? 'on' : ''}" style="--sw:${c}" title="${n}" aria-label="${n}" data-act="theme" data-k="bg" data-v="${c}"></button>`).join('') + `<input type="color" class="swpick" data-theme="bg" value="${esc(t.bg || '#0f0f0f')}" title="Custom color" aria-label="Custom background color">`) +
    row('Background picture', t.bgimg ? esc(t.bgimg) : 'Use any image behind the app (darkened so text stays readable).', `<button class="btn" data-act="bgpick">Choose</button>` + (t.bgimg ? '<button class="btn" data-act="theme" data-k="bgimg" data-v="">Remove</button>' : '')) +
    row('Glow', 'The soft accent light in the corner.', seg('glow', [[0, 'Off'], [16, 'Soft'], [30, 'Normal'], [50, 'Strong']], t.glow === undefined ? 30 : t.glow)) +
    row('Tile size', 'How big game and app tiles are.', seg('size', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], t.size || 'm')) +
    row('Corners', 'Sharp edges, or softly rounded.', seg('round', [['', 'Square'], ['1', 'Rounded']], t.round ? '1' : '')) +
    row('Game names', 'Show names on every cover, or only when selected.', seg('caps', [['', 'When selected'], ['1', 'Always']], t.caps ? '1' : '')) +
    '<div class="mixh">General</div>';
}
function render() {
  applyTheme();
  $$('.nav').forEach(n => n.classList.toggle('on', n.dataset.view === view));
  $('#main').innerHTML = ({ home, games, apps, store, watch: watchView, profile: profileView, music, settings, discord, app: appview, plug: typeof plugView === 'function' ? plugView : home })[view]();
  document.body.classList.toggle('onhome', view === 'home');
  document.body.classList.remove('guide');
  const cnt = (k, n) => { const c = $('.cnt[data-c=' + k + ']'); if (c) c.textContent = n || ''; };
  cnt('games', S.items.filter(i => i.category === 'game').length); cnt('apps', S.items.filter(i => i.category === 'app').length);
  if (view === 'home') { homeBg(homeDefault); paintHomeMusic(); } else { const b = $('#homebg'); if (b) { b.innerHTML = ''; b.dataset.src = ''; } }
  resetTint();
  drawPlayer();
  if (view === 'music' && playMode === 'system') drawApple();
}

// ---------- launching ----------
async function launch(id) {
  const it = S.items.find(i => i.id === id);
  if (!it) return;
  if (S.settings.appsInside !== false && it.kind === 'url' && /^https?:\/\//i.test(it.target || '') && await openAppInside(it)) return;
  toast('Launching ' + it.name + '\u2026');
  const r = await api.launch(it);
  if (!r.ok) return toast(r.error || "Couldn't launch " + it.name);
  it.lastPlayed = Date.now();
  if (typeof v2Launched === 'function') v2Launched(it);
  if (typeof it.vol === 'number') for (const t of [12000, 30000, 70000]) setTimeout(() => setMix({ group: 'games', vol: it.vol }), t);
  it.plays = (it.plays || 0) + 1;
  save();
}

// ---------- edit dialog ----------
const dlg = $('#dlg');
const PRESETS = {
  jellyfin: { name: 'Jellyfin', kind: 'url', target: 'http://localhost:8096', source: 'Media', category: 'app' },
  ersatztv: { name: 'ErsatzTV', kind: 'url', target: 'http://localhost:8409', source: 'Media', category: 'app' }
};
function fill(d) {
  $('#fn').value = d.name || ''; $('#fcat').value = d.category || 'game'; $('#fkind').value = d.kind || 'exe';
  $('#fsrc').value = d.source || ''; $('#ftarget').value = d.target || ''; $('#from').value = d.rom || '';
  $('#fargs').value = d.args || ''; $('#fart').value = d.art || '';
  kindUI();
}
function kindUI() {
  const k = $('#fkind').value;
  $('#lbl-target').textContent = { exe: 'Program', rom: 'Emulator program', url: 'Web address', uri: 'Launch link' }[k];
  $('#ftarget').placeholder = { exe: 'C:\\Games\\MyGame\\game.exe', rom: 'C:\\Emulators\\RetroArch\\retroarch.exe', url: 'http://localhost:8096', uri: 'steam://rungameid/12345' }[k];
  $('#row-rom').hidden = k !== 'rom';
  $('#row-args').hidden = !(k === 'exe' || k === 'rom');
  $('#b-target').hidden = !(k === 'exe' || k === 'rom');
}
function openEdit(it, def = {}) {
  editing = it;
  $('#dlgtitle').textContent = it ? 'Edit ' + it.name : (def.category === 'store' ? 'Add store' : def.category === 'app' ? 'Add app' : 'Add game');
  fill(it || { category: 'game', kind: 'exe', source: 'PC', ...def });
  $('#del').hidden = !it;
  $('#presets').hidden = !!it || (def.category !== 'app');
  dlg.showModal();
  $('#fn').focus();
}
$('#fkind').addEventListener('change', kindUI);
$('#cancel').addEventListener('click', () => dlg.close());
$('#del').addEventListener('click', () => {
  if (!editing) return;
  S.items = S.items.filter(i => i.id !== editing.id);
  save(); dlg.close(); render(); toast('Removed ' + editing.name);
});
$('#presets').addEventListener('click', (e) => {
  const p = PRESETS[e.target.dataset.preset];
  if (p) fill(p);
});
$('#f').addEventListener('submit', (e) => {
  e.preventDefault();
  const kind = $('#fkind').value;
  const d = {
    name: $('#fn').value.trim(), category: $('#fcat').value, kind, source: $('#fsrc').value.trim(),
    target: $('#ftarget').value.trim(), rom: kind === 'rom' ? $('#from').value.trim() : '',
    args: (kind === 'exe' || kind === 'rom') ? $('#fargs').value.trim() : '', art: $('#fart').value.trim()
  };
  if (!d.name || !d.target) return;
  if (editing) { Object.assign(editing, d); if (editing.appid && d.target !== 'steam://rungameid/' + editing.appid) delete editing.appid; }
  else S.items.push({ id: crypto.randomUUID(), ...d });
  save(); dlg.close(); render(); toast('Saved ' + d.name);
});
dlg.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-browse]');
  if (!b) return;
  const p = await api.pick({ mode: 'file', kind: b.dataset.pick });
  if (p) $('#' + b.dataset.browse).value = p;
});

// ---------- Start menu import ----------
const imp = $('#imp');
async function openImport() {
  toast('Reading your Start menu…');
  const r = await api.startApps();
  if (!r.ok) return toast(r.error);
  impList = r.apps; picked = new Set(); $('#impq').value = '';
  renderImp(); imp.showModal();
}
function renderImp() {
  const f = $('#impq').value.toLowerCase();
  $('#implist').innerHTML = impList.filter(a => a.name.toLowerCase().includes(f)).slice(0, 400)
    .map(a => `<label class="chk"><input type="checkbox" value="${esc(a.id)}" ${picked.has(a.id) ? 'checked' : ''}>${esc(a.name)}</label>`).join('');
}
$('#impq').addEventListener('input', renderImp);
$('#implist').addEventListener('change', (e) => { e.target.checked ? picked.add(e.target.value) : picked.delete(e.target.value); });
$('#impcancel').addEventListener('click', () => imp.close());
$('#impgo').addEventListener('click', () => {
  let n = 0;
  for (const a of impList.filter(a => picked.has(a.id))) {
    const target = 'shell:AppsFolder\\' + a.id;
    if (S.items.some(i => i.target === target)) continue;
    S.items.push({ id: crypto.randomUUID(), name: a.name, category: $('#impcat').value, kind: 'uri', target, source: $('#impsrc').value });
    n++;
  }
  save(); imp.close(); render(); toast(n ? `Added ${n} ${n === 1 ? 'item' : 'items'}` : 'Nothing new to add');
});

// ---------- music player ----------
function playTrack(i) {
  if (!tracks.length) return;
  qi = (i + tracks.length) % tracks.length;
  audio.src = tracks[qi].url;
  audio.play().catch(() => toast("Couldn't play that file"));
  if (view === 'music') render(); else { resetTint(); drawPlayer(); }
  { const t0 = tracks[qi]; const m0 = songInfo(t0.title, t0.artist, t0.album); if (m0) applyTrackMeta(t0, m0); }
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: tracks[qi].title, artist: tracks[qi].artist, album: tracks[qi].album || '', artwork: tracks[qi].cover ? [{ src: tracks[qi].cover }] : [] });
}
const nextTrack = () => playMode === 'system' ? api.media('next') : playTrack(shuffle ? Math.floor(Math.random() * tracks.length) : qi + 1);
const prevTrack = () => playMode === 'system' ? api.media('prev') : (audio.currentTime > 3 ? (audio.currentTime = 0) : playTrack(qi - 1));
const togglePlay = () => { if (playMode === 'system') return api.media('playpause'); if (qi < 0) return tracks.length ? playTrack(0) : toast('Choose a music folder first'); audio.paused ? audio.play() : audio.pause(); };

function drawPlayer() {
  document.body.classList.toggle('sysmusic', playMode === 'system');
  const t = tracks[qi];
  $('#ptitle').textContent = t ? t.title : 'Nothing playing';
  $('#partist').textContent = t ? [t.artist, t.album].filter(Boolean).join(' \u00b7 ') : 'Pick a music folder in Music';
  if (t) { const [a, b] = cols(t.title); $('#pcover').style.background = t.cover ? `center/cover url("${t.cover}")` : `linear-gradient(135deg, ${a}, ${b})`; }
  $('#pplay').innerHTML = audio.paused ? ICON.play : ICON.pause;
  $('#pshuf').classList.toggle('on', shuffle);
  $('#pmode').textContent = playMode === 'system' ? 'Apple Music' : 'This PC';
  if (playMode === 'system') {
    sysPlayer();
  }
}
$('#pshuf').innerHTML = ICON.shuf; $('#pprev').innerHTML = ICON.prev; $('#pnext').innerHTML = ICON.next;
$('#pplay').addEventListener('click', () => togglePlay());
$('#pnext').addEventListener('click', () => (playMode === 'system' || tracks.length) && nextTrack());
$('#pprev').addEventListener('click', () => (playMode === 'system' || tracks.length) && prevTrack());
$('#pshuf').addEventListener('click', () => { shuffle = !shuffle; drawPlayer(); });
$('#pseek').addEventListener('input', (e) => { if (isFinite(audio.duration)) audio.currentTime = e.target.value / 1000 * audio.duration; });
$('#pvol').value = Math.round((parseFloat(localStorage.getItem('vol') ?? '.8')) * 100);
audio.volume = $('#pvol').value / 100;
$('#pvol').addEventListener('input', (e) => { audio.volume = e.target.value / 100; try { localStorage.setItem('vol', audio.volume); } catch { /* ignore */ } });
audio.addEventListener('timeupdate', () => {
  if (isFinite(audio.duration)) $('#pseek').value = audio.currentTime / audio.duration * 1000;
  $('#ptime').textContent = fmt(audio.currentTime); $('#pdur').textContent = fmt(audio.duration);
});
audio.addEventListener('play', drawPlayer);
audio.addEventListener('pause', drawPlayer);
audio.addEventListener('ended', () => tracks.length && nextTrack());
audio.addEventListener('error', () => { if (audio.src) toast("Couldn't play that file"); });
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('nexttrack', () => tracks.length && nextTrack());
  navigator.mediaSession.setActionHandler('previoustrack', () => tracks.length && prevTrack());
}

// decorative equalizer (animates while a song plays)
const bars = new Array(28).fill(0);
(function viz(t) {
  const c = $('#viz');
  if (c) {
    const x = c.getContext('2d'), w = c.width, h = c.height, n = bars.length, gap = 10, bw = (w - gap * (n + 1)) / n;
    x.clearRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const target = audio.paused ? .06 : .2 + .8 * Math.abs(Math.sin(t / 380 + i * .7) * Math.cos(t / 610 + i * 1.3));
      bars[i] += (target - bars[i]) * .14;
      const bh = Math.max(10, bars[i] * h * .8), bx = gap + i * (bw + gap);
      x.fillStyle = 'rgba(255,255,255,.88)';
      x.beginPath(); x.roundRect(bx, h - bh - 30, bw, bh, bw / 2); x.fill();
    }
  }
  requestAnimationFrame(viz);
})(0);

// ---------- events ----------
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);

document.addEventListener('click', async (e) => {
  const nav = e.target.closest('.nav');
  if (nav && nav.dataset.view) { appFrame = null; view = nav.dataset.view; render(); $('#main').scrollTop = 0; return; }
  const st = e.target.closest('[data-sid]');
  if (st) return openStoreItem(st);
  const rt = e.target.closest('[data-rid]');
  if (rt) return openRetro(retroFlat[+rt.dataset.rid]);
  const el = e.target.closest('[data-act]');
  if (el) {
    const act = el.dataset.act;
    if (act === 'guide') return document.body.classList.toggle('guide');
    if (act === 'goto') { view = el.dataset.v; appFrame = null; render(); $('#main').scrollTop = 0; return; }
    if (act === 'looks') return typeof v45Looks === 'function' ? v45Looks() : undefined;
    if (act === 'gsearch') { view = 'games'; render(); $('#q').focus(); return; }
    if (act === 'gsettings') { view = 'settings'; render(); return; }
    if (act === 'sttab') { storeTab = el.dataset.k; storeQ = ''; storeSort = ''; return render(); }
    if (act === 'gpsub') { gpSub = el.dataset.k; storeSort = ''; return render(); }
    if (act === 'stsort') { storeSort = el.dataset.k; return render(); }
    if (act === 'patchnotes') return showPatchNotes(true);
    if (act === 'rsys') { retroSys = el.dataset.k === 'All' ? '' : el.dataset.k; return render(); }
    if (act === 'stclear') { storeQ = ''; return render(); }
    if (act === 'stsearch') { storeQ = ($('#stq').value || '').trim(); return render(); }
    if (act === 'emu-get') { const e = EMU_STORE[+el.dataset.i]; toast('Opening the ' + e.n + ' download page\u2026'); api.launch({ kind: 'uri', target: e.url, name: e.n }); return; }
    if (act === 'emu-add') { const e = EMU_STORE[+el.dataset.i]; openEmu(); if (e.preset) { $('#epreset').value = e.preset; $('#epreset').dispatchEvent(new Event('change')); } else { $('#ename').value = e.n; } return; }
    if (act === 'asearch') return appleSearch($('#asq').value);
    if (act === 'aplay-res') return playApple({ link: appleRes[+el.dataset.i]?.link });
    if (act === 'aplay-hist') { const s = (S.settings.musicHistory || [])[+el.dataset.i]; return s && playApple({ term: s.title + ' ' + s.artist }); }
    if (act === 'applefolder') {
      const r = await fetch('/api/apple/folders').then(x => x.json()).catch(() => ({ folders: [] }));
      return r.folders && r.folders.length ? loadMusicFrom(r.folders[0]) : toast("Couldn't find an Apple Music or iTunes folder. Choose your music folder instead.");
    }
    if (act === 'overlay-open') return api.overlay('toggle');
    if (act === 'app-back') return appBack();
    if (act === 'app-reload') { const fr = $('#appframe'); if (fr) fr.src = appFrame.url; return; }
    if (act === 'app-window') { const r = await api.launch(appFrame.item); if (!r.ok) toast(r.error || "Couldn't open it"); return; }
    if (act === 'toggle-inside') { S.settings.appsInside = S.settings.appsInside === false; save(); return render(); }
    if (act === 'essentials') return runEssentials(false);
    if (act === 'info') return openInfo(el.dataset.id);
    if (act === 'mixer') return openMixer();
    if (act === 'theme') {
      const t = (S.settings.theme = S.settings.theme || {}), k = el.dataset.k, v = el.dataset.v;
      if (k === 'ac') { t.ac = ACCENTS[+v][1]; delete t.acHex; }
      else if (k === 'bg') t.bg = v;
      else if (k === 'bgimg') delete t.bgimg;
      else if (k === 'glow') t.glow = +v;
      else if (k === 'round' || k === 'caps') t[k] = v ? 1 : 0;
      else t[k] = v;
      save(); return render();
    }
    if (act === 'bgpick') { const r = await fetch('/api/pick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'file', kind: 'image' }) }).then(x => x.json()).catch(() => ({})); if (r.path) { (S.settings.theme = S.settings.theme || {}).bgimg = r.path; save(); render(); } return; }
    if (act === 'meta-all') return runMeta(true);
    if (act === 'nettest') { netRes = 'Testing\u2026'; render(); const r = await fetch('/api/nettest').then(x => x.json()).catch(() => null); netRes = r ? r.checks.map(c => (c.ok ? '\u2713 ' : '\u2717 ') + c.name + (c.ok ? '' : ' (' + c.detail + ')')).join('  \u00b7  ') : 'Test failed to run.'; return render(); }
    if (act === 'power-menu') return openPower();
    if (act === 'open-discord') return openDiscord();
    if (act === 'shell-on') {
      if (!shellArm) { shellArm = true; render(); setTimeout(() => { shellArm = false; if (view === 'settings') render(); }, 6000); return; }
      shellArm = false; S.settings.shellMode = true; S.settings.fullscreen = true; save(); api.applySettings(S.settings); render();
      return toast('Shell mode on. It takes effect the next time you sign in. Restore-Windows-Desktop.cmd is saved next to the exe.');
    }
    if (act === 'shell-off') { S.settings.shellMode = false; save(); api.applySettings(S.settings); render(); return toast('Shell mode off. Windows desktop returns next sign-in.'); }
    if (act === 'play') return launch(el.dataset.id);
    if (act === 'add-game') return openEdit(null, { category: 'game' });
    if (act === 'add-app') return openEdit(null, { category: 'app', kind: 'url', source: 'Media' });
    if (act === 'add-store') return openEdit(null, { category: 'store', kind: 'url', source: 'Store' });
    if (act === 'edit-store') { const s = S.items.find(i => i.id === el.dataset.id); return s && openEdit(s); }
    if (act === 'store-preset') { const p = STORE_PRESETS[+el.dataset.i]; return p && openEdit(null, { category: 'store', kind: 'url', source: 'Store', name: p[0], target: p[1] }); }
    if (act === 'filter') { srcFilter = el.dataset.s; return render(); }
    if (act === 'startMenu') return openImport();
    if (act === 'scanSteam') {
      toast('Looking for Steam games…');
      const r = await api.scanSteam(S.settings.steamPath);
      if (!r.ok) return toast(r.error);
      const have = new Set(S.items.map(i => i.id));
      const fresh = []; for (const i of r.items) { if (!have.has(i.id)) { have.add(i.id); fresh.push(i); } }
      S.items.push(...fresh); save(); render();
      return toast(fresh.length ? `Added ${fresh.length} Steam ${fresh.length === 1 ? 'game' : 'games'}` : 'Steam library is already up to date');
    }
    if (act === 'pickMusic') {
      const f = await api.pick({ mode: 'folder' });
      if (!f) return;
      S.settings.musicFolder = f; toast('Scanning music…');
      tracks = await api.scanMusic(f); qi = -1; save(); render();
      return toast(tracks.length ? `Found ${tracks.length} songs` : 'No songs found in that folder');
    }
    if (act === 'pick-steam') { const f = await api.pick({ mode: 'folder' }); if (f) { S.settings.steamPath = f; save(); render(); } return; }
    if (act === 'toggle-fs') { S.settings.fullscreen = !S.settings.fullscreen; save(); api.applySettings(S.settings); return render(); }
    if (act === 'toggle-boot') { S.settings.startWithWindows = !S.settings.startWithWindows; save(); api.applySettings(S.settings); return render(); }
    if (act === 'track') return playTrack(+el.dataset.i);
    if (act === 'shufflePlay') { shuffle = true; return playTrack(Math.floor(Math.random() * tracks.length)); }
  }
  const t = e.target.closest('.tile[data-id]');
  if (t) launch(t.dataset.id);
});

document.addEventListener('contextmenu', (e) => {
  const t = e.target.closest('.tile[data-id]');
  if (!t) return;
  e.preventDefault();
  const it = S.items.find(i => i.id === t.dataset.id);
  if (it) openEdit(it);
});

// tint follows whatever you hover or focus
const tint = (e) => { const t = e.target.closest && e.target.closest('[data-a]'); if (t) setTint(t.dataset.a, t.dataset.b); };
document.addEventListener('mouseover', tint);
document.addEventListener('focusin', tint);
document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('[data-a]') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-a]'))) resetTint(); });

$('#q').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); render(); });

// ---------- keyboard + controller navigation ----------
function focusMove(els, dir) {
  const cur = document.activeElement;
  if (!els.includes(cur)) { (els.find(e => e.classList.contains('tile') || e.classList.contains('track')) || els[0])?.focus(); return; }
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best, bs = Infinity;
  for (const e of els) {
    if (e === cur) continue;
    const b = e.getBoundingClientRect(), x = b.left + b.width / 2 - cx, y = b.top + b.height / 2 - cy;
    const along = { left: -x, right: x, up: -y, down: y }[dir];
    // how far off line the target is: the best of its start edge, centre or end edge, so a wider button
    // (a longer label like "Achievements") is not treated as further away than its shorter neighbours
    const across = dir === 'left' || dir === 'right'
      ? Math.min(Math.abs(y), Math.abs(b.top - r.top), Math.abs(b.bottom - r.bottom))
      : Math.min(Math.abs(x), Math.abs(b.left - r.left), Math.abs(b.right - r.right));
    if (along <= 4) continue;
    const s = along + across * 2.5;
    if (s < bs) { bs = s; best = e; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: padOn ? 'center' : 'nearest', inline: 'nearest', behavior: padOn ? 'smooth' : 'auto' }); }
}
function move(dir) {
  const dlg = document.querySelector('dialog[open]');
  if (dlg) return focusMove($$('button, input:not([type=hidden]), select', dlg).filter(e => e.offsetParent !== null && !e.disabled), dir);
  focusMove($$('.side button, .stage button, .player button, .top input, .top button, .stage input[type=search], .stage input[type=text], .stage input[type=password], .stage input[type=url], .stage input:not([type])').filter(e => e.offsetParent !== null && !e.disabled), dir);
}
function editFocused() {
  const t = document.activeElement?.closest?.('.tile[data-id]');
  const it = t && S.items.find(i => i.id === t.dataset.id);
  if (it) openEdit(it);
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'stq') { storeQ = e.target.value.trim(); render(); return; }
  if (e.key === 'Escape') document.body.classList.remove('guide');
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '');
  const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (dirs[e.key] && !typing) { e.preventDefault(); move(dirs[e.key]); }
  else if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); }
  else if (e.key.toLowerCase() === 'e' && !typing) editFocused();
});

// ---------- controller (PS5 DualSense and Xbox, standard mapping) ----------
const PADS = {
  ps: { x: '\u2715', o: '\u25cb', sq: '\u25a1', tri: '\u25b3', l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', menu: 'Options', view: 'Create', r3: 'R3' },
  xbox: { x: 'A', o: 'B', sq: 'X', tri: 'Y', l1: 'LB', r1: 'RB', l2: 'LT', r2: 'RT', menu: 'Menu', view: 'View', r3: 'RS' }
};
const VIEWS = ['home', 'games', 'apps', 'store', 'watch', 'profile', 'music', 'discord', 'settings'];
let padKind = 'xbox', padOn = false, padHeld = {}, padDir = null, padNext = 0, padHint = '';
let padDlg = false;
const setPadMode = (on) => { if (padOn !== on) { padOn = on; document.body.classList.toggle('pad', on); padHint = ''; try { const h = $('#padhints'); on ? h.showPopover() : h.hidePopover(); } catch { /* old browser: hints stay hidden */ } } };
// only a real mouse move (not the fake one Chrome sends after a scroll or window change) hands control back to the mouse
addEventListener('mousemove', (e) => { if (padOn && Math.abs(e.movementX) + Math.abs(e.movementY) >= 3) setPadMode(false); }, { passive: true });
['mousedown', 'touchstart', 'wheel'].forEach(ev => addEventListener(ev, () => { if (padOn) setPadMode(false); }, { passive: true }));
// remember where the controller cursor was, and put it back when the window gets focus again (it is lost when you leave and return)
let lastFocus = null;
document.addEventListener('focusin', (e) => { if (e.target && e.target !== document.body) lastFocus = e.target; });
function restoreFocus() {
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return;
  const el = (lastFocus && lastFocus.isConnected && lastFocus.offsetParent !== null) ? lastFocus : ($('.stage .tile, .stage .track, .stage .btn') || $('.nav.on'));
  el?.focus({ preventScroll: true });
}
addEventListener('gamepadconnected', (e) => { padKind = /054c|dualsense|dualshock|wireless controller|playstation/i.test(e.gamepad.id) ? 'ps' : 'xbox'; toast('Controller connected. Use the D-pad or left stick to move.'); setPadMode(true); });
addEventListener('gamepaddisconnected', () => toast('Controller disconnected'));
function padHints() {
  const g = PADS[padKind], dlg = document.querySelector('dialog[open]');
  const h = dlg ? [[g.x, 'Select'], [g.o, 'Close'], ['\u25c0 \u25b6', 'Adjust slider']]
    : [[g.x, 'Open'], [g.o, 'Menu'], [g.sq, 'Info'], [g.tri, 'Edit'], [g.l1 + ' ' + g.r1, 'Sections'], [g.l2 + ' ' + g.r2, 'Song'], [g.menu, 'Play/Pause'], [g.view, 'Power'], [g.r3, 'Mixer']];
  const s = h.map(([k, v]) => `<span><b>${k}</b>${v}</span>`).join('');
  if (s !== padHint) { padHint = s; $('#padhints').innerHTML = s; }
  if (!!dlg !== padDlg) { padDlg = !!dlg; try { const el = $('#padhints'); el.hidePopover(); el.showPopover(); } catch { /* ignore */ } }
}
function padStep(d) {
  const dlg = document.querySelector('dialog[open]'), f = document.activeElement;
  if (dlg && f && f.type === 'range' && dlg.contains(f) && (d === 'left' || d === 'right')) {
    f.value = +f.value + (d === 'right' ? 5 : -5); f.dispatchEvent(new Event('input', { bubbles: true })); return;
  }
  move(d);
}
const padClick = () => {
  const f = document.activeElement;
  if (f && f.tagName === 'INPUT' && typeof isTextBox === 'function' && isTextBox(f) && typeof oskOpen === 'function') { padReturn = f; oskOpen(f); }
  else if (f && f !== document.body && f.click) { padReturn = f; f.click(); } else move('down');
};
let padReturn = null, padLast = 0;
const padFocusContent = () => ($('.stage .tile, .stage .track, .stage .btn, .stage input') || $('.nav.on'))?.focus();
const padSection = (n) => { view = VIEWS[(VIEWS.indexOf(view) + n + VIEWS.length) % VIEWS.length]; render(); $('#main').scrollTop = 0; padFocusContent(); };
document.addEventListener('close', () => { if (padOn && padReturn && padReturn.isConnected) padReturn.focus(); }, true);
const rumble = (p) => { try { p.vibrationActuator?.playEffect('dual-rumble', { duration: 28, strongMagnitude: 0, weakMagnitude: .35 }); } catch { /* not supported */ } };
// Turn whatever the browser reports (standard layout, or the raw layout a DualSense / Xbox pad gets after
// Steam, a game or a driver has touched it) into one standard layout, and merge every connected pad.
function stdPad(p) {
  const out = { b: new Array(18).fill(false), ax: p.axes[0] || 0, ay: p.axes[1] || 0, ry: p.axes[3] || 0 };
  const pr = (i) => !!p.buttons[i]?.pressed;
  if (p.mapping === 'standard') { for (let i = 0; i < 18; i++) out.b[i] = pr(i); return out; }
  const ps = /054c|dualsense|dualshock|wireless controller|playstation/i.test(p.id);
  if (ps) { // raw: 0 square 1 cross 2 circle 3 triangle 4 L1 5 R1 6 L2 7 R2 8 create 9 options 10 L3 11 R3 12 PS 13 touchpad
    [[0, 1], [1, 2], [2, 0], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [10, 10], [11, 11], [16, 12]].forEach(([s, r]) => { out.b[s] = pr(r); });
    out.ry = p.axes[5] || 0;
  } else { // raw Xbox-style: 0 A 1 B 2 X 3 Y 4 LB 5 RB 6 view 7 menu 8 L3 9 R3
    [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [8, 6], [9, 7], [10, 8], [11, 9]].forEach(([s, r]) => { out.b[s] = pr(r); });
    out.b[6] = out.b[6] || (p.axes[4] || -1) > 0; out.b[7] = out.b[7] || (p.axes[5] || -1) > 0;
  }
  // a hat switch reports the D-pad as one axis: -1 up, then clockwise in steps of 2/7; anything above 1 means "not pressed"
  const hat = p.axes[9];
  if (typeof hat === 'number' && hat <= 1.05 && p.axes.length > 9) {
    const k = Math.round((hat + 1) / (2 / 7));
    out.b[12] = [0, 1, 7].includes(k); out.b[15] = [1, 2, 3].includes(k); out.b[13] = [3, 4, 5].includes(k); out.b[14] = [5, 6, 7].includes(k);
  }
  return out;
}
function readPads() {
  const list = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter(x => x && x.connected);
  if (!list.length) return null;
  const m = { b: new Array(18).fill(false), ax: 0, ay: 0, ry: 0, first: list[0] };
  for (const p of list) {
    const s = stdPad(p);
    s.b.forEach((v, i) => { m.b[i] = m.b[i] || v; });
    if (Math.hypot(s.ax, s.ay) > Math.hypot(m.ax, m.ay)) { m.ax = s.ax; m.ay = s.ay; }
    if (Math.abs(s.ry) > Math.abs(m.ry)) m.ry = s.ry;
  }
  return m;
}
let padResync = true;
addEventListener('blur', () => { padHeld = {}; padDir = null; padResync = true; });
addEventListener('focus', () => { padResync = true; setTimeout(restoreFocus, 60); setTimeout(restoreFocus, 400); });
document.addEventListener('visibilitychange', () => { padResync = true; });
(function poll() {
  // Arcade only listens to the controller while its own window is the one in front. In a game (or any other
  // window) the pad belongs to that program, even if Arcade is still running behind it.
  if (!document.hasFocus() || document.visibilityState !== 'visible' || window.__guideOpen) { padHeld = {}; padDir = null; padResync = true; requestAnimationFrame(poll); return; }
  const st = readPads();
  if (st) {
    const p = st.first, b = (i) => !!st.b[i];
    padKind = /054c|dualsense|dualshock|wireless controller|playstation/i.test(p.id) ? 'ps' : 'xbox';
    if (padResync) { // after coming back to the window, ignore buttons that are still held down from outside
      padResync = false; padHeld = {}; for (let i = 0; i < 18; i++) if (b(i)) padHeld[i] = 1;
      padDir = null; padNext = Date.now() + 400; requestAnimationFrame(poll); return;
    }
    if (view === 'app') { const c = b(8); if (c && !padHeld[8]) { padHeld[8] = 1; appBack(); } else if (!c) padHeld[8] = 0; requestAnimationFrame(poll); return; }
    const now = Date.now();
    if (document.activeElement === document.body && document.hasFocus()) restoreFocus();
    const ax = st.ax, ay = st.ay;
    const stick = Math.hypot(ax, ay) > .5 ? (Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 'left' : 'right') : (ay < 0 ? 'up' : 'down')) : null;
    const d = b(14) ? 'left' : b(15) ? 'right' : b(12) ? 'up' : b(13) ? 'down' : stick;
    let any = !!d;
    if (d && d !== padDir) { setPadMode(true); padStep(d); padNext = now + 380; }
    else if (d && now >= padNext) { padStep(d); padNext = now + 110; }
    padDir = d;
    const once = (i, fn) => { if (b(i)) { any = true; if (!padHeld[i]) { padHeld[i] = 1; setPadMode(true); fn(); } } else padHeld[i] = 0; };
    const dlg = () => document.querySelector('dialog[open]');
    once(0, () => { padClick(); rumble(p); });
    once(1, () => { if (dlg()) dlg().close(); else if (view === 'home' && document.body.classList.contains('ui-alt')) { /* the menu is already the main menu */ } else if (view === 'home') { document.body.classList.toggle('guide'); if (document.body.classList.contains('guide')) $('.nav.on, .nav')?.focus(); else padFocusContent(); } else if (document.body.classList.contains('ui-alt')) { view = 'home'; render(); } else $('.nav.on')?.focus(); });
    once(2, () => { if (!dlg()) infoFocused(); });
    once(3, () => { if (!dlg()) editFocused(); });
    once(4, () => { if (!dlg()) padSection(-1); });
    once(5, () => { if (!dlg()) padSection(1); });
    once(6, () => (playMode === 'system' || tracks.length) && prevTrack());
    once(7, () => (playMode === 'system' || tracks.length) && nextTrack());
    once(8, () => { padReturn = document.activeElement; openPower(); });
    once(9, togglePlay);
    once(10, () => { if (!dlg() && view !== 'profile') { view = 'profile'; render(); } });   // left stick press: your profile
    const ry = st.ry;
    if (Math.abs(ry) > .25) { any = true; (dlg() || $('#main')).scrollBy(0, ry * 22); }
    if (any) { setPadMode(true); padLast = now; }
    if (padOn) { padHints(); $('#padhints').classList.toggle('idle', now - padLast > 7000); }
  }
  requestAnimationFrame(poll);
})();

// ---------- duplicates ----------
function dedupe() {
  const out = [], byId = new Map(), byKey = new Map();
  let removed = 0;
  for (const it of S.items) {
    const key = it.kind + '|' + it.target + '|' + (it.rom || '');
    const prev = byId.get(it.id) || byKey.get(key);
    if (prev) {
      if ((it.lastPlayed || 0) > (prev.lastPlayed || 0)) prev.lastPlayed = it.lastPlayed;
      removed++;
      continue;
    }
    byId.set(it.id, it); byKey.set(key, it); out.push(it);
  }
  S.items = out;
  return removed;
}

// ---------- emulators ----------
const EMU_PRESETS = {
  dolphin: { name: 'Dolphin', exts: 'iso, rvz, gcm, wbfs, gcz', args: '-b -e "{rom}"' },
  pcsx2: { name: 'PCSX2', exts: 'iso, chd', args: '-batch -fullscreen -- "{rom}"' },
  duckstation: { name: 'DuckStation', exts: 'chd, cue, pbp, m3u', args: '-batch -fullscreen -- "{rom}"' },
  cemu: { name: 'Cemu', exts: 'wua, wud, wux, rpx', args: '-g "{rom}" -f' },
  mgba: { name: 'mGBA', exts: 'gba, gb, gbc', args: '-f "{rom}"' },
  rpcs3: { name: 'RPCS3', exts: 'iso, bin', args: '--no-gui "{rom}"', hint: 'PS3 games are usually a folder with an EBOOT.BIN inside. Point Arcade at that file, or use an .iso.' },
  ppsspp: { name: 'PPSSPP', exts: 'iso, cso, pbp', args: '"{rom}" --fullscreen' },
  xenia: { name: 'Xenia', exts: 'iso, xex', args: '"{rom}"' },
  azahar: { name: 'Azahar', exts: '3ds, cci, cxi, 3dsx', args: '-f "{rom}"' },
  melonds: { name: 'melonDS', exts: 'nds', args: '"{rom}"' },
  retroarch: { name: 'RetroArch', exts: 'nes, sfc, smc, gba, gb, gbc, md, n64, z64', args: '-f -L "C:\\RetroArch\\cores\\CORE_libretro.dll" "{rom}"',
    hint: 'RetroArch needs a core. Change CORE_libretro.dll to the core for this console, and add one entry per console.' }
};
const edlg = $('#edlg');
let editingEmu = null;

function openEmu(emu) {
  editingEmu = emu || null;
  $('#edtitle').textContent = emu ? 'Edit ' + emu.name : 'Add emulator';
  $('#epreset').value = ''; $('#epreset').parentElement.hidden = !!emu;
  $('#ename').value = emu ? emu.name : ''; $('#eexe').value = emu ? emu.exe : '';
  $('#efolder').value = emu ? emu.romFolder : ''; $('#eexts').value = emu ? emu.exts : '';
  $('#eargs').value = emu ? emu.args : '"{rom}"'; $('#ehint').textContent = '';
  $('#edel').hidden = !emu;
  edlg.showModal(); $('#ename').focus();
}
$('#epreset').addEventListener('change', (e) => {
  const p = EMU_PRESETS[e.target.value];
  if (!p) return;
  $('#ename').value = p.name; $('#eexts').value = p.exts; $('#eargs').value = p.args;
  $('#ehint').textContent = p.hint || "Launch options differ between emulators. If a game doesn't open, check your emulator's command-line options.";
});
$('#ecancel').addEventListener('click', () => edlg.close());
edlg.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-browse]');
  if (!b) return;
  const p = await api.pick({ mode: b.dataset.pick === 'folder' ? 'folder' : 'file', kind: b.dataset.pick });
  if (p) $('#' + b.dataset.browse).value = p;
});
$('#edel').addEventListener('click', () => {
  if (!editingEmu) return;
  S.settings.emulators = S.settings.emulators.filter(x => x.id !== editingEmu.id);
  S.items = S.items.filter(i => i.emuId !== editingEmu.id);
  save(); edlg.close(); render(); toast('Removed ' + editingEmu.name + ' and its games');
});
$('#ef').addEventListener('submit', async (e) => {
  e.preventDefault();
  const emu = {
    id: editingEmu ? editingEmu.id : crypto.randomUUID(),
    name: $('#ename').value.trim(), exe: $('#eexe').value.trim(), romFolder: $('#efolder').value.trim(),
    exts: $('#eexts').value.split(',').map(x => x.trim().replace(/^\./, '').toLowerCase()).filter(Boolean).join(','),
    args: $('#eargs').value.trim() || '"{rom}"'
  };
  if (!emu.name || !emu.exe || !emu.romFolder || !emu.exts) return;
  const list = S.settings.emulators, idx = list.findIndex(x => x.id === emu.id);
  if (idx >= 0) list[idx] = emu; else list.push(emu);
  for (const it of S.items) if (it.emuId === emu.id) { it.target = emu.exe; it.args = emu.args; it.source = emu.name; }
  edlg.close(); toast('Scanning ' + emu.name + ' games…');
  const r = await scanEmu(emu);
  render(); toast(emuMsg(emu, r));
});

async function scanEmu(emu) {
  const rows = await api.scanRoms(emu.romFolder, emu.exts);
  if (!Array.isArray(rows) || !rows.length) { save(); return { added: 0, removed: 0, total: 0 }; }
  const have = new Set(S.items.map(i => i.id)), ids = new Set();
  let added = 0;
  for (const r of rows) {
    const id = 'rom|' + emu.id + '|' + r.path;
    ids.add(id);
    if (have.has(id)) continue;
    have.add(id); added++;
    S.items.push({ id, name: r.name, category: 'game', kind: 'rom', target: emu.exe, rom: r.path, args: emu.args, source: emu.name, emuId: emu.id });
  }
  const before = S.items.length;
  S.items = S.items.filter(i => i.emuId !== emu.id || ids.has(i.id));
  save();
  return { added, removed: before - S.items.length, total: rows.length };
}
const emuMsg = (emu, r) => !r.total ? 'No ' + emu.exts.split(',').join(', ') + ' files found in that folder'
  : emu.name + ': ' + r.added + ' new, ' + r.total + ' total' + (r.removed ? ', ' + r.removed + ' no longer there' : '');

function emuSettings() {
  const list = S.settings.emulators || [];
  const rows = list.map(e => '<div class="setting"><div><b>' + esc(e.name) + '</b><small>' + esc(e.exe) + ' / ' + esc(e.romFolder) + '</small></div>' +
    '<div class="toolbar" style="margin:0"><button class="btn small" data-act="rescan-emu" data-id="' + esc(e.id) + '">Rescan</button>' +
    '<button class="btn small" data-act="edit-emu" data-id="' + esc(e.id) + '">Edit</button></div></div>').join('');
  return '<h2 class="row-title">Emulators</h2>' + (rows || '<p class="hint">No emulators yet.</p>') +
    '<div class="toolbar" style="margin-top:12px"><button class="btn primary" data-act="add-emu">Add emulator</button></div>';
}

// ---------- Apple Music mode ----------
function musicSystem() {
  return '<h1 class="title">Music</h1><div class="nowcard"><div class="nowart" id="npart"></div><div class="nowtxt"><small>NOW PLAYING</small><h2 class="npbig" id="npt">Apple Music</h2><p id="npa"></p><div id="npg" class="chips"></div>' +
    '<div class="toolbar"><button class="btn primary" data-act="find-apple">Add Apple Music to Apps</button><button class="btn" data-act="mode-local">Play music files from this PC instead</button></div></div></div>' +
    '<div class="asearch"><input id="asq" type="search" placeholder="Search Apple Music: song, artist or album" autocomplete="off"><button class="btn primary" data-act="asearch">Search</button></div>' +
    '<div id="ares"></div><div class="mixh">Recently played in Apple Music</div><div id="ahist" class="tracks"></div>';
}
let appleRes = [], appleSearched = false;
async function appleSearch(term) {
  term = (term || '').trim(); if (!term) return;
  appleSearched = true; const res = $('#ares'); if (res) res.innerHTML = '<p class="hint">Searching\u2026</p>';
  const r = await fetch('/api/apple/search?term=' + encodeURIComponent(term)).then(x => x.json()).catch(() => null);
  appleRes = (r && r.songs) || []; drawApple();
  if (!appleRes.length) toast(r ? 'Nothing found for that.' : "Couldn't reach Apple's music search. Check your internet.");
}
const songRow = (s, i, act) => `<button class="track asong" data-act="${act}" data-i="${i}">${s.art ? `<img src="${esc(s.art)}" alt="" loading="lazy">` : '<i class="noart"></i>'}<span>${esc(s.title)}</span><small>${esc([s.artist, s.album].filter(Boolean).join(' \u00b7 '))}</small></button>`;
function drawApple() {
  const res = $('#ares'), h = $('#ahist');
  if (res) res.innerHTML = appleRes.length ? `<div class="tracks">${appleRes.map((s, i) => songRow(s, i, 'aplay-res')).join('')}</div>` : (appleSearched ? '<p class="hint">Nothing found.</p>' : '');
  if (h) { const hist = S.settings.musicHistory || []; h.innerHTML = hist.length ? hist.map((s, i) => songRow(s, i, 'aplay-hist')).join('') : '<p class="hint">Songs you play in Apple Music show up here, so you can replay them from Arcade without opening it.</p>'; }
}
async function playApple(o) {
  toast('Opening in Apple Music\u2026');
  const r = await fetch('/api/apple/play', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) }).then(x => x.json()).catch(() => ({ ok: false, error: 'Something went wrong' }));
  if (!r.ok) toast(r.error || "Couldn't play that");
}
async function loadMusicFrom(f) {
  S.settings.musicFolder = f; toast('Scanning music\u2026');
  tracks = await api.scanMusic(f); qi = -1; save(); render();
  toast(tracks.length ? `Found ${tracks.length} songs` : 'No songs found in that folder');
}
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'asq') appleSearch(e.target.value); });

document.addEventListener('click', async (e) => {
  const m = e.target.closest('[data-media]');
  if (m) return api.media(m.dataset.media, +m.dataset.n || 1);
  if (e.target.closest('#pmode')) {
    playMode = playMode === 'system' ? 'local' : 'system';
    try { localStorage.setItem('pm', playMode); } catch { /* ignore */ }
    if (playMode === 'system') audio.pause();
    return render();
  }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'scanAll') return runScanAll();
  if (act === 'scanFolder') return runScanFolder();
  if (act === 'sort') { sortMode = el.dataset.s; try { localStorage.setItem('sort', sortMode); } catch { /* ignore */ } return render(); }
  if (act === 'add-emu') return openEmu(null);
  if (act === 'edit-emu') return openEmu(S.settings.emulators.find(x => x.id === el.dataset.id));
  if (act === 'rescan-emu' || act === 'rescan-emus') {
    const list = act === 'rescan-emu' ? S.settings.emulators.filter(x => x.id === el.dataset.id) : S.settings.emulators;
    toast('Rescanning…');
    const msgs = [];
    for (const emu of list) msgs.push(emuMsg(emu, await scanEmu(emu)));
    render(); return toast(msgs.join(' | '));
  }
  if (act === 'mode-sys') { playMode = 'system'; audio.pause(); try { localStorage.setItem('pm', playMode); } catch { /* ignore */ } return render(); }
  if (act === 'mode-local') { playMode = 'local'; try { localStorage.setItem('pm', 'local'); } catch { /* ignore */ } return render(); }
  if (act === 'find-apple') { await openImport(); $('#impq').value = 'apple'; $('#impcat').value = 'app'; $('#impsrc').value = 'Media'; renderImp(); }
});

// ---------- games view: sorting + one-click scan of every launcher ----------
const SORTS = [['az', 'A to Z'], ['za', 'Z to A'], ['recent', 'Recently played'], ['most', 'Most played'], ['source', 'By launcher']];
let sortMode = 'az';
try { sortMode = localStorage.getItem('sort') || 'az'; } catch { /* ignore */ }
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
function sortGames(list) {
  const cmp = {
    az: byName,
    za: (a, b) => byName(b, a),
    recent: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || byName(a, b),
    most: (a, b) => (b.plays || 0) - (a.plays || 0) || byName(a, b),
    source: (a, b) => (a.source || 'Other').localeCompare(b.source || 'Other') || byName(a, b)
  }[sortMode] || byName;
  return [...list].sort(cmp);
}
function games() {
  const all = S.items.filter(i => i.category === 'game');
  const sources = ['All', ...[...new Set(all.map(i => i.source || 'Other'))].sort((a, b) => a.localeCompare(b))];
  if (!sources.includes(srcFilter)) srcFilter = 'All';
  const list = sortGames(all.filter(i => hit(i) && (srcFilter === 'All' || (i.source || 'Other') === srcFilter)));
  let h = '<h1 class="title">Games<span class="count">' + all.length + '</span></h1><div class="toolbar">' +
    '<button class="btn primary" data-act="scanAll">Scan all my games</button>' +
    '<button class="btn" data-act="scanFolder">Add games from a folder</button>' +
    '<button class="btn" data-act="startMenu">Import from Start menu</button>' +
    '<button class="btn" data-act="add-game">Add game</button>' +
    '<button class="btn" data-act="add-emu">Add emulator</button>' +
    ((S.settings.emulators || []).length ? '<button class="btn" data-act="rescan-emus">Rescan emulators</button>' : '') + '</div>';
  h += '<div class="chips tabs">' + sources.map(s => '<button class="chip ' + (s === srcFilter ? 'on' : '') + '" data-act="filter" data-s="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>';
  h += '<div class="chips sortrow"><span class="lbl">Sort by</span>' + SORTS.map(([k, t]) => '<button class="chip ' + (k === sortMode ? 'on' : '') + '" data-act="sort" data-s="' + k + '">' + t + '</button>').join('') + '</div>';
  if (!list.length) return h + '<div class="empty">' + (all.length ? 'No games match.' : 'No games yet. Tap "Scan all my games" to find them.') + '</div>';
  if (sortMode === 'source' && srcFilter === 'All') {
    const groups = new Map();
    for (const it of list) { const k = it.source || 'Other'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    for (const [k, arr] of groups) h += '<h2 class="row-title">' + esc(k) + '<span class="count">' + arr.length + '</span></h2>' + grid(arr);
    return h;
  }
  return h + grid(list);
}

const normTitle = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '');
async function runScanAll() {
  toast('Scanning Steam, Epic, GOG, Ubisoft, EA, Game Pass and more…');
  const r = await api.scanAll(S.settings.steamPath);
  if (!r || !r.ok) return toast((r && r.error) || "Couldn't scan your games");
  const found = new Set(r.items.map(i => i.id)), okSrc = new Set(r.sources || []);
  // 1) forget auto-found games that are gone (or that Steam says aren't yours)
  const before = S.items.length;
  S.items = S.items.filter(i => !((i.auto || String(i.id).startsWith('steam-')) && okSrc.has(i.source) && !found.has(i.id)));
  const removed = before - S.items.length;
  // 2) add what's new
  const have = new Set(S.items.map(i => i.id)), names = new Set(S.items.filter(i => i.category === 'game').map(i => normTitle(i.name)));
  let added = 0;
  for (const it of r.items) {
    if (have.has(it.id) || names.has(normTitle(it.name))) continue;
    have.add(it.id); names.add(normTitle(it.name)); S.items.push({ ...it, auto: true }); added++;
  }
  save(); render();
  const per = Object.entries(r.counts || {}).map(([k, v]) => k + ' ' + v).join(', ');
  let msg = r.items.length ? 'Found ' + r.items.length + ' games (' + per + '). ' + added + ' new' + (removed ? ', ' + removed + ' removed' : '') + '.' : 'No games found. Try "Add games from a folder".';
  if (r.skipped && r.skipped.length) msg += ' Skipped ' + r.skipped.length + ' Steam game' + (r.skipped.length === 1 ? '' : 's') + ' that belong to another Steam account: ' + r.skipped.slice(0, 3).join(', ') + (r.skipped.length > 3 ? '…' : '') + '.';
  toast(msg);
  setTimeout(() => runMeta(false), 4500);
}
async function runScanFolder() {
  const f = await api.pick({ mode: 'folder' });
  if (!f) return;
  toast('Looking for games…');
  const rows = await api.scanFolder(f);
  if (!Array.isArray(rows) || !rows.length) return toast('No games found in that folder. Each game should be in its own sub folder.');
  const have = new Set(S.items.map(i => i.id)), names = new Set(S.items.map(i => normTitle(i.name)));
  let added = 0;
  for (const it of rows) {
    if (have.has(it.id) || names.has(normTitle(it.name))) continue;
    have.add(it.id); names.add(normTitle(it.name)); S.items.push({ ...it, category: 'game', auto: true }); added++;
  }
  save(); render(); toast('Found ' + rows.length + ' games, ' + added + ' new');
}

// ---------- one-click essentials (File Explorer, Firefox, Discord, Apple Music, Jellyfin, ErsatzTV) ----------
async function runEssentials(auto) {
  const r = await fetch('/api/essentials').then(x => x.json()).catch(() => null);
  if (!r || !r.ok) return auto ? undefined : toast("Couldn't look for your apps");
  const names = new Set(S.items.map(i => normTitle(i.name))), added = [];
  for (const it of r.items) {
    if (names.has(normTitle(it.name)) || S.items.some(i => i.id === it.id)) continue;
    S.items.push(it); names.add(normTitle(it.name)); added.push(it.name);
  }
  save(); render();
  const miss = (r.missing || []).length ? ' Not found: ' + r.missing.join(', ') + '.' : '';
  toast((added.length ? 'Added ' + added.join(', ') + '.' : 'Your essentials are already here.') + miss);
}

// ---------- start ----------
(async function init() {
  S = await api.load();
  S.items = S.items || [];
  S.settings.emulators = S.settings.emulators || [];
  if (typeof v21init === 'function') v21init();
  const dupes = dedupe();
  if (dupes) save();
  render();
  if (dupes) toast('Cleaned up ' + dupes + ' duplicate ' + (dupes === 1 ? 'entry' : 'entries'));
  setTimeout(() => runMeta(false), 4000);
  if (typeof v2boot === 'function') v2boot();
  if (!S.settings.essentialsDone) { S.settings.essentialsDone = true; runEssentials(true); }
  if (S.settings.musicFolder) { tracks = await api.scanMusic(S.settings.musicFolder); if (view === 'music') render(); }
})();


// ---------- now playing (Apple Music via Windows media session) ----------
let lastNP = '', histTimer = null;
function sysPlayer() {
  let on = np && np.active && np.title;
  let title = on ? np.title : 'Apple Music', artist = on ? np.artist : '', album = on ? np.album : '';
  if (!on && np && np.win && !/^(apple music|itunes)$/i.test(np.win.trim())) { // fall back to the Apple Music window title
    const w = np.win.replace(/\s*[-\u2013\u2014|]\s*(Apple Music|iTunes)\s*$/i, ''); if (w) { title = w; on = true; }
  }
  const sub = on ? [artist, album].filter(Boolean).join(' \u00b7 ') : (np && np.error ? "Can't read what's playing: " + np.error : 'Nothing playing. Start a song in the Apple Music app, or pick one below.');
  $('#ptitle').textContent = title; $('#partist').textContent = sub;
  const [c1, c2] = on ? cols(title) : ['#ff375f', '#bf5af2'];
  const sm = on ? songInfo(title, artist, album) : null;
  $('#pcover').style.background = sm && sm.art ? `center/cover url("${toURL(sm.art)}")` : `linear-gradient(135deg, ${c1}, ${c2})`;
  paintSong(sm, [c1, c2]);
  $('#pplay').innerHTML = on && np.status === 'Playing' ? ICON.pause : ICON.play;
  $('#pseek').value = on && np.dur > 0 ? Math.min(1000, np.pos / np.dur * 1000) : 0;
  $('#ptime').textContent = on && np.dur ? fmt(np.pos) : '0:00'; $('#pdur').textContent = on && np.dur ? fmt(np.dur) : '0:00';
  const t = $('#npt'); if (t) { t.textContent = title; $('#npa').textContent = sub; }
  const key = on ? title + '|' + artist : '';
  if (key && key !== lastNP) {
    lastNP = key;
    const h = (S.settings.musicHistory = (S.settings.musicHistory || []).filter(x => x.title + '|' + x.artist !== key));
    h.unshift({ title, artist, album, at: Date.now() }); h.length = Math.min(h.length, 100);
    clearTimeout(histTimer); histTimer = setTimeout(save, 1500);
    if (view === 'music') drawApple();
  }
}
// music info (cover, album, genre, year) from Apple's free catalog
const songMemo = {};
function songInfo(title, artist, album) {
  const k = (title + '|' + artist).toLowerCase();
  if (!(k in songMemo)) {
    songMemo[k] = null;
    fetch('/api/songmeta?title=' + encodeURIComponent(title) + '&artist=' + encodeURIComponent(artist || '') + '&album=' + encodeURIComponent(album || ''))
      .then(r => r.json()).then(m => {
        songMemo[k] = m && m.ok ? m : false;
        if (m && m.ok && m.art) {
          const h = (S.settings.musicHistory || []).find(x => (x.title + '|' + x.artist).toLowerCase() === k);
          if (h) { h.art = toURL(m.art); clearTimeout(histTimer); histTimer = setTimeout(save, 1500); }
        }
        if (playMode === 'system') sysPlayer(); else if (tracks[qi] && (tracks[qi].title + '|' + tracks[qi].artist).toLowerCase() === k) applyTrackMeta(tracks[qi], m);
        if (view === 'music') drawApple();
      }).catch(() => { songMemo[k] = false; });
  }
  return songMemo[k] || null;
}
function paintSong(sm, c) {
  const a = $('#npart'); if (a) a.style.background = sm && sm.art ? `center/cover url("${toURL(sm.art)}")` : `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
  const g = $('#npg'); if (g) g.innerHTML = sm ? [sm.album, sm.genre, sm.year].filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join('') : '';
}
function applyTrackMeta(t, m) {
  if (!m || !m.ok) return;
  if (!t.cover && m.art) t.cover = toURL(m.art);
  if (!t.album && m.album) t.album = m.album;
  if (m.genre) t.genre = m.genre; if (m.year) t.year = m.year;
  if (tracks[qi] === t) { if (view === 'music') render(); else drawPlayer(); }
}
(async function pollNP() {
  if (playMode === 'system') {
    try { np = await fetch('/api/nowplaying').then(r => r.json()); } catch { /* ignore */ }
    sysPlayer();
  }
  paintHomeMusic();
  setTimeout(pollNP, 2000);
})();

// ---------- game info + covers ----------
const steamId = (it) => it.appid || ((/steam:\/\/rungameid\/(\d+)/.exec(it.target || '') || [])[1]) || '';
async function fetchAppInfo(it) {
  const r = await fetch('/api/appmeta', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: it.id, name: it.name, kind: it.kind || '', target: it.target || '' }) }).then(x => x.json()).catch(() => null);
  if (!r) return false;
  it.metaAt = Date.now(); it.metaV = 6; it.appV = 2; it.metaLog = (r.meta && r.meta.log) || [];
  if (!r.ok) return false;
  const m = r.meta;
  if (m.icon) it.icon = m.icon;
  if (m.desc) it.desc = m.desc;
  it.tagline = m.tagline || ''; it.site = m.site || ''; it.infoFrom = (m.sources || []).join(', ');
  return true;
}
async function fetchInfo(it) {
  if (it.category === 'app') return fetchAppInfo(it);
  const s = S.settings;
  const r = await fetch('/api/metadata', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: it.id, name: it.name, appid: steamId(it), rawgKey: s.rawgKey || '', sgdbKey: '', igdbId: s.igdbId || '', igdbSecret: s.igdbSecret || '', tgdbKey: s.tgdbKey || '', rom: it.rom || '' }) }).then(x => x.json()).catch(() => null);
  if (!r) return false;
  it.metaAt = Date.now(); it.metaV = r.meta && r.meta.retry ? 5 : 6; it.metaLog = (r.meta && r.meta.log) || [];
  if (!r.ok) return false;
  const m = r.meta;
  if (m.cover && !it.coverLock) it.cover = m.cover;
  if (m.logo) it.logo = m.logo;
  if (m.disc) it.disc = m.disc;
  if (m.fan) it.fan = m.fan;
  if (m.desc) it.desc = m.desc;
  it.genres = m.genres || []; it.year = m.year || ''; it.dev = m.dev || ''; it.rating = m.rating || 0; it.score = m.score || 0; it.hero = m.hero || ''; it.shots = m.shots || []; it.infoFrom = (m.sources || []).join(', ');
  return true;
}
let metaBusy = false;
async function runMeta(force) {
  if (metaBusy) return toast('Already fetching game info\u2026');
  const list = S.items.filter(i => (i.category === 'game' || i.category === 'app') && (force || !i.metaAt || i.metaV !== 6 || (i.category === 'app' && i.appV !== 2)));
  if (!list.length) return force ? toast('Add some games or apps first') : undefined;
  metaBusy = true; let done = 0, found = 0, next = 0;
  const worker = async () => {
    while (next < list.length) {
      const it = list[next++];
      if (await fetchInfo(it)) found++;
      done++;
      if (done % 4 === 0) toast(`Fetching game info\u2026 ${done}/${list.length}`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  metaBusy = false; await save(); render();
  toast(`Got info for ${found} of ${list.length} items.` + (found < list.length ? ' For the rest, open Settings and tap Test connection.' : ''));
}
const gdlg = $('#gdlg');
let infoId = null;
function openInfo(id) {
  const it = S.items.find(i => i.id === id); if (!it) return;
  infoId = id;
  const [a, b] = cols(it.name);
  const isApp = it.category === 'app';
  $('#gcover').classList.toggle('ico', isApp && !it.cover && !it.art && !!it.icon);
  const src = isApp && !it.cover && !it.art && it.icon ? toURL(it.icon) : it.cover ? toURL(it.cover) : it.art ? toURL(it.art) : '';
  $('#gcover').style.background = `linear-gradient(135deg, ${a}, ${b})`;
  $('#gcover').innerHTML = esc((it.name[0] || '?').toUpperCase()) + (src ? `<img src="${esc(src)}" alt="">` : '');
  $('#gname').textContent = it.name;
  const chips = isApp ? [it.source, it.tagline, it.site ? it.site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '') : ''].filter(Boolean) : [it.source, it.year, it.dev, ...(it.genres || []), it.playtime ? '~' + fmtPlay(it.playtime) + ' played' : '', it.ach && it.ach.t ? '\u{1F3C6} ' + it.ach.u + '/' + it.ach.t : '', it.score ? 'Score ' + it.score : '', !it.score && it.rating ? '\u2605 ' + it.rating.toFixed(1) : ''].filter(Boolean);
  $('#gchips').innerHTML = chips.map(c => `<span class="chip">${esc(c)}</span>`).join('');
  $('#gdesc').textContent = it.desc || 'No description yet. Press "Refresh info" to look it up.';
  $('#gcovers').hidden = isApp; $('#gplay').textContent = isApp ? 'Open' : 'Play';
  $('#gfrom').textContent = it.infoFrom ? 'Info from ' + it.infoFrom : (it.metaLog && it.metaLog.length ? 'Nothing found. ' + it.metaLog.join(' \u00b7 ') : '');
  const hero = $('#ghero'); hero.hidden = !it.hero; if (it.hero) hero.style.backgroundImage = `url("${toURL(it.hero)}")`;
  $('#gshots').innerHTML = (it.shots || []).map(u => `<img src="${esc(u)}" alt="" loading="lazy">`).join('');
  $('#gbind').value = it.guideBind || 'auto'; $('#gbind').parentElement.parentElement.hidden = isApp;
  const hasV = typeof it.vol === 'number'; $('#gvol').value = hasV ? it.vol : 50; $('#gvolv').textContent = hasV ? it.vol + '%' : 'Auto';
  if (!gdlg.open) gdlg.showModal();
  $('#gplay').focus();
}
$('#gclose').addEventListener('click', () => gdlg.close());
// ---- choose between every cover the free sources found
const cdlg = $('#cdlg');
let coverFor = null;
$('#gcovers').addEventListener('click', async () => {
  const it = S.items.find(i => i.id === infoId); if (!it) return;
  coverFor = it; const s = S.settings;
  $('#cgrid').innerHTML = ''; $('#cstatus').textContent = 'Looking through LaunchBox, Wikipedia' + (s.tgdbKey ? ' and TheGamesDB' : '') + '\u2026';
  if (!cdlg.open) cdlg.showModal();
  const r = await fetch('/api/covers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: it.name, appid: steamId(it), rom: it.rom || '', tgdbKey: s.tgdbKey || '' }) }).then(x => x.json()).catch(() => null);
  if (coverFor !== it) return;
  const list = (r && r.covers) || [];
  $('#cstatus').textContent = list.length ? 'Pick the one you like. Tall pictures look best.' : (r ? 'Nothing found for this name. Use your own picture, or rename the game to its store title.' : "Couldn't search. Check your internet.");
  $('#cgrid').innerHTML = list.map(c => `<button type="button" class="copt ${esc(c.kind)}" data-u="${esc(c.url)}"><img src="${esc(c.url)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${esc(c.source)}</span></button>`).join('');
  $('#cgrid .copt')?.focus();
});
$('#cgrid').addEventListener('click', async (e) => {
  const b = e.target.closest('.copt'); if (!b || !coverFor) return;
  b.classList.add('busy');
  const r = await fetch('/api/setcover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: coverFor.id, url: b.dataset.u }) }).then(x => x.json()).catch(() => null);
  b.classList.remove('busy');
  if (!r || !r.ok) return toast((r && r.error) || "Couldn't use that picture");
  coverFor.cover = r.path; coverFor.coverLock = true; await save(); cdlg.close(); render(); openInfo(coverFor.id); toast('Cover changed');
});
$('#cown').addEventListener('click', async () => {
  if (!coverFor) return;
  const r = await fetch('/api/pick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'file', kind: 'image' }) }).then(x => x.json()).catch(() => ({}));
  if (!r.path) return;
  coverFor.cover = r.path; coverFor.coverLock = true; await save(); cdlg.close(); render(); openInfo(coverFor.id); toast('Cover changed');
});
$('#creset').addEventListener('click', async () => {
  if (!coverFor) return;
  coverFor.coverLock = false; coverFor.cover = ''; cdlg.close(); toast('Looking it up again\u2026');
  await fetchInfo(coverFor); await save(); render(); openInfo(coverFor.id);
});
$('#cclose').addEventListener('click', () => cdlg.close());

$('#gplay').addEventListener('click', () => { gdlg.close(); launch(infoId); });
$('#gedit').addEventListener('click', () => { gdlg.close(); const it = S.items.find(i => i.id === infoId); if (it) openEdit(it); });
$('#grefresh').addEventListener('click', async () => {
  const it = S.items.find(i => i.id === infoId); if (!it) return;
  $('#grefresh').textContent = 'Looking\u2026';
  const ok = await fetchInfo(it); await save(); render(); openInfo(infoId);
  $('#grefresh').textContent = 'Refresh info';
  toast(ok ? 'Updated' : 'Nothing found. Try Settings \u203a Test connection, or rename it to its real title.');
});
document.addEventListener('input', (e) => {
  const k = e.target.dataset && e.target.dataset.theme;
  if (!k) return;
  const t = (S.settings.theme = S.settings.theme || {});
  if (k === 'acHex') { t.acHex = e.target.value; delete t.ac; } else t[k] = e.target.value;
  applyTheme(); clearTimeout(window.__thSave); window.__thSave = setTimeout(() => { save(); if (view === 'settings') render(); }, 600);
});
document.addEventListener('change', (e) => {
  const k = e.target.dataset && e.target.dataset.set;
  if (!k) return;
  S.settings[k] = e.target.value.trim(); save(); toast('Saved');
});
const infoFocused = () => { const t = document.activeElement?.closest?.('.tile.game[data-id], .tile.app[data-id]'); if (t) openInfo(t.dataset.id); };

// ---------- Discord ----------
function discord() {
  const id = (S.settings.discordServer || '').replace(/\D/g, '');
  return '<h1 class="title">Discord</h1><div class="welcome"><h2>Chat with your friends</h2>' +
    '<p>Discord does not let other apps embed its chat, so it opens in its own window and stays one tap away. Paste a server ID below to also see that server\u2019s live member list and invite button right here (turn on Server Widget in that server\u2019s settings first).</p>' +
    '<div class="toolbar"><button class="btn primary" data-act="open-discord">Open Discord</button></div>' +
    `<div class="setting"><div><b>Server ID</b><small>Right-click the server icon in Discord, Copy Server ID (needs Developer Mode on).</small></div><input class="keyin" data-set="discordServer" value="${esc(id)}" placeholder="123456789012345678" inputmode="numeric"></div>` +
    (id ? `<iframe class="dframe" title="Discord server" src="https://discord.com/widget?id=${id}&theme=dark" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"></iframe>` : '') + '</div>';
}
function openDiscord() {
  const app = S.items.find(i => /discord/i.test(i.name) && i.category === 'app') || S.items.find(i => /discord/i.test(i.name));
  if (app) return launch(app.id);
  api.launch({ kind: 'url', target: 'https://discord.com/app', name: 'Discord' }).then(r => { if (!r.ok) toast(r.error || "Couldn't open Discord"); });
}

// ---------- power menu ----------
const pdlg = $('#pdlg');
function openPower() { $$('#pgrid .btn').forEach(b => { b.classList.remove('armed'); b.textContent = b.dataset.label || (b.dataset.label = b.textContent); }); pdlg.showModal(); }
$('#pclose').addEventListener('click', () => pdlg.close());
pdlg.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-p],button[data-ms]');
  if (!b) return;
  if (b.dataset.ms) { const r = await api.launch({ kind: 'uri', target: b.dataset.ms, name: b.textContent }); if (!r.ok) toast(r.error || "Couldn't open that"); return; }
  if (b.dataset.confirm && !b.classList.contains('armed')) {
    $$('#pgrid .btn').forEach(x => { x.classList.remove('armed'); x.textContent = x.dataset.label || x.textContent; });
    b.classList.add('armed'); b.textContent = 'Tap again to confirm'; return;
  }
  const r = await fetch('/api/power', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: b.dataset.p }) }).then(x => x.json()).catch(() => ({ ok: false }));
  if (!r.ok) toast(r.error || "That didn't work");
  else pdlg.close();
});


// ---------- volume mixer ----------
const setMix = (o) => fetch('/api/mixer/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) }).then(r => r.json()).catch(() => ({ ok: false }));
const mdlg = $('#mdlg');
const GNAME = { music: 'Music', chat: 'Chat', games: 'Games', other: 'Other' };
const tagSel = (x) => `<select class="tagsel" data-tag="${esc(x.name)}" aria-label="Group for ${esc(x.name)}"><option value="auto" ${x.tag ? '' : 'selected'}>Auto (${GNAME[x.group] || x.group})</option>${Object.entries(GNAME).map(([k, v]) => `<option value="${k}" ${x.tag === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
const mixRow = (label, attr, val, dis, cls = '', app = null) => `<div class="mixrow ${cls} ${app ? 'withtag' : ''}"><span>${esc(label)}</span><input type="range" min="0" max="100" value="${val}" ${attr} ${dis ? 'disabled' : ''}><small>${dis ? '-' : val + '%'}</small>${app ? tagSel(app) : ''}</div>`;
async function mixRefresh() {
  if (!mdlg.open) return;
  const act = document.activeElement;
  if (act && (act.type === 'range' || act.tagName === 'SELECT') && mdlg.contains(act)) return;
  const r = await fetch('/api/mixer').then(x => x.json()).catch(() => ({ ok: false, error: 'Mixer unavailable' }));
  const body = $('#mixbody');
  if (!r.ok) { body.innerHTML = `<p class="hint">${esc(r.error || 'The mixer needs Windows.')}</p>`; return; }
  const g = r.groups;
  body.innerHTML = mixRow('Master', 'data-g="master"', r.master.vol, false) +
    `<div class="dlgbtns" style="margin:0 0 6px"><button type="button" class="btn" data-mute="1">${r.master.mute ? 'Unmute' : 'Mute'} everything</button></div>` +
    mixRow('Music', 'data-g="music"', g.music.vol, !g.music.n) + mixRow('Chat (Discord)', 'data-g="chat"', g.chat.vol, !g.chat.n) + mixRow('Games', 'data-g="games"', g.games.vol, !g.games.n) +
    `<div class="mixh">Every app making sound (pick a group if one is sorted wrong)</div>` + (r.apps.length ? r.apps.map(x => mixRow(x.name, `data-pid="${x.pid}"`, x.vol, false, 'sub', x)).join('') : '<p class="hint">Nothing is making sound right now.</p>');
}
function openMixer() { if (!mdlg.open) mdlg.showModal(); mixRefresh(); }
setInterval(mixRefresh, 2500);
let mixSend = null, mixPending = null;
mdlg.addEventListener('input', (e) => {
  const t = e.target; if (t.type !== 'range') return;
  const o = t.dataset.g ? { group: t.dataset.g, vol: +t.value } : { pid: +t.dataset.pid, vol: +t.value };
  t.parentElement.querySelector('small').textContent = t.value + '%';
  mixPending = o;
  if (!mixSend) mixSend = setTimeout(async () => { const p = mixPending; mixPending = null; mixSend = null; if (p) { const r = await setMix(p); if (!r.ok) toast(r.error || "Couldn't change that volume"); } }, 90);
});
mdlg.addEventListener('change', async (e) => {
  const t = e.target.closest && e.target.closest('[data-tag]'); if (!t) return;
  await fetch('/api/mixer/tag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: t.dataset.tag, group: t.value }) }).catch(() => {});
  t.blur(); mixRefresh(); toast('Saved. ' + t.dataset.tag + ' is now ' + (t.value === 'auto' ? 'sorted automatically' : GNAME[t.value]));
});
mdlg.addEventListener('click', async (e) => {
  if (e.target.closest('[data-mute]')) { await setMix({ mute: true }); mixRefresh(); }
});
$('#mclose').addEventListener('click', () => mdlg.close());
$('#gvol').addEventListener('input', (e) => {
  const it = S.items.find(i => i.id === infoId); if (!it) return;
  it.vol = +e.target.value; $('#gvolv').textContent = it.vol + '%'; save();
});
$('#gbind').addEventListener('change', () => { const it = S.items.find(i => i.id === infoId); if (!it) return; it.guideBind = $('#gbind').value; save(); toast('Guide button for ' + it.name + ': ' + $('#gbind').selectedOptions[0].textContent); });
$('#gvolreset').addEventListener('click', () => { const it = S.items.find(i => i.id === infoId); if (!it) return; delete it.vol; $('#gvolv').textContent = 'Auto'; save(); });
// Steam's sharper 2x art isn't there for every game: fall back to the normal size
document.addEventListener('error', (e) => { const im = e.target; if (im instanceof HTMLImageElement && /library_600x900_2x\.jpg/.test(im.src)) im.src = im.src.replace('_2x', ''); }, true);
