// Hollywood Arcade 2.0 features: patch notes, and (added below) Guide, sounds, keyboard, backup and more.
'use strict';
window.APP_VERSION = '3.1.0-test1';

// ---------- patch notes ----------
// Add a new entry at the TOP for every release. The What's New screen shows automatically once per version.
const PATCH_NOTES = [
  {
    v: '3.1.0-test1', date: 'November 2026', title: 'Plugins, and a smoother Guide',
    groups: [
      ['New', [
        'Plugins. Put a plugin folder in Arcade\u2019s plugins folder and switch it on in Settings. Plugins can add a shelf to Home, a page to the sidebar, and use your library, but they run in a sandbox, start off until you approve them, and cannot launch programs or see your files. Tap Add examples in Settings to try two.',
        'Your Arcade score now shows next to your name on Home and in the sidebar.',
        'The Guide has a Back to game row, and closing it with B, Esc or the Guide button puts you straight back into the game.'
      ]],
      ['Fixed', [
        'Achievements are checked when you finish playing a game, even one that had none recorded before, and a game that failed a check is retried the next day instead of the next week. Settings shows when they were last checked.',
        'A Guide left alone for a while starts fresh the next time you open it.',
        'If a game gets minimized when the Guide opens, the Guide tells you to switch the game to Borderless.'
      ]]
    ]
  },
  {
    v: '3.0.1', date: 'November 2026', title: 'App icons and a new Apps page',
    groups: [['New', ['The Apps page is now a Launchpad-style grid: bigger rounded icons on a soft glass panel.']], ['Fixed', ['App icons: well-known apps (Jellyfin, Proton VPN, Apple Music, Discord and many more) now get their real logo, and a screenshot from Wikipedia is no longer used as an icon. Arcade looks your apps up again once after updating.']]]
  },
  {
    v: '3.0.0', date: 'November 2026', title: 'Hollywood Arcade 3.0: the first official release',
    groups: [
      ['New', [
        'Hollywood Arcade is out of beta. Everything from the 2.x series is here: the console home screen, the in-game Guide, profiles, achievements, the Store, Watch, the System menu, shell mode and the self-updater.',
        'A guided first-run setup, which you can run again from Settings.',
        'Join your Discord voice channel from the Guide, the Discord page or Settings, with Discord tucked away afterwards.',
        'Your Discord status shows the game you launched from Arcade, like "Ultimate Spider-Man on PCSX2". Add your Application ID in Settings.',
        'Experimental: pick a song in Arcade and it presses play in Apple Music for you. The keys and delay are adjustable in Settings.'
      ]],
      ['Improved', [
        'The Guide now takes real focus when it opens in a game, so the controller works without clicking it first.',
        'Resume game returns to the game window itself, not an emulator\u2019s library window.',
        'Safer saving with automatic backup recovery, a steadier updater, and a Guide that gets ready off-screen instead of flashing at start-up.'
      ]]
    ]
  },
  {
    v: '2.3.1', date: 'November 2026', title: 'Start-up fix',
    groups: [['Fixed', ['The Guide no longer flashes on screen for a moment a few seconds after Arcade opens. It now gets ready off-screen.']]]
  },
  {
    v: '2.3.0', date: 'November 2026', title: 'Release polish',
    groups: [
      ['Improved', [
        'Saving is sturdier: your library is written safely so a crash or power cut cannot leave a half-written file, saves report a problem instead of hiding it, and a damaged library file is replaced by your newest automatic backup.',
        'Restoring a backup first keeps a copy of what you had.',
        'The update installer now handles a broken checksum file without failing, and the release build refuses to publish if the version in the code does not match the release tag.',
        'Built-in automatic tests for saving, updating, backups and the private local server.'
      ]]
    ]
  },
  {
    v: '2.2.3', date: 'November 2026', title: 'Update test',
    groups: [
      ['Improved', ['This release changes nothing. It only exists to check that updating from inside Arcade works.']]
    ]
  },
  {
    v: '2.2.2', date: 'November 2026', title: 'Guide diagnostics',
    groups: [
      ['Improved', ['The log now records which controller buttons Arcade can still see while a game is in front, to track down why the Guide shortcut does not open in some games.']]
    ]
  },
  {
    v: '2.2.1', date: 'November 2026', title: 'Quick fixes',
    groups: [
      ['Fixed', [
        'The PlayStation button no longer opens the Guide in games that are not from Steam. Steam grabs that button and opened Big Picture too. Use L3 + R3 or hold the touchpad. You can still choose the PS button in Settings.',
        'The on-screen keyboard no longer pops up the moment the search bar is highlighted. It opens when you press A (or click) on a text box, and with a mouse or keyboard you can just type.',
        'Apple Music now starts in the background: songs you play from Arcade, and the Apple Music app tile, minimise Apple Music as soon as it opens, so you stay in Arcade.'
      ]]
    ]
  },
  {
    v: '2.2.0', date: 'November 2026', title: 'Updates, notifications and a sturdier Guide',
    groups: [
      ['New', [
        'A brand-new first-run setup: nine quick steps for your profile and photo, controller (with the right Guide shortcut), game scan, achievements, accent colour and sounds, Jellyfin, and privacy choices, ending with a recap. B on a controller goes back a step. You can run it again from Settings.',
        'Updates inside Arcade: it checks the project\u2019s releases on GitHub after start-up and shows what changed. Press Update now and it downloads the new version, checks it against the published checksum, restarts itself, and puts the old version back if the new one will not start. It never installs anything without asking, and you can turn the check off in Settings.',
        'Live achievement pop-ups: while a game you started from Arcade is running, its achievements are checked every 30 seconds (Steam, RetroAchievements and Xbox titles you have set up). A new unlock shows a pop-up over the game with its own chime.',
        'Notification Center: the bell on Home and in the top bar (and a row in the Guide) lists achievements, updates and downloads, with a count of what is new.',
        'Close game: if a game freezes, the Guide has a Close game row. The System page also opens File Explorer and Task Manager.',
        'Controller test now has Open the Guide now (to tell a drawing problem from a button problem) and Copy report, which gathers what is needed to debug a controller.'
      ]],
      ['Improved', [
        'The Guide window is prepared in the background at start-up, so the first press opens it at once.',
        'Games that are not from Steam now accept any of L3 + R3, the touchpad or the PS button to open the Guide. Xbox controllers use L3 + R3 in every game.',
        'Arcade notices controllers that are switched on after it starts, instead of only the ones connected at launch.'
      ]],
      ['Fixed', [
        'The search box could not be reached with a controller, so the on-screen keyboard never opened. Pressing up from the games now lands on it.',
        'Home no longer wraps onto a second row while a game is running, and the Watch page\u2019s streaming tiles are no longer cut off.',
        'The Guide now matches the rest of Arcade: dark panels with the green highlight instead of the old silver look.'
      ]]
    ]
  },
  {
    v: '2.1.0', date: 'November 2026', title: 'Profiles, achievements and the living room',
    groups: [
      ['New', [
        'Profiles: everyone gets their own picture (shown on Home), play history, favourites, achievements, theme, sounds and accounts. Switch from the Guide or Settings, and choose whether Arcade asks who is playing at start-up. Your existing data moved into the first profile.',
        'Achievements: a new page with a progress ring for every game. Steam works with just your Steam ID if your profile is public, retro games use RetroAchievements, and Xbox titles use an OpenXBL key (experimental). Each game\u2019s info card shows its list with rarity and unlock dates.',
        'Arcade badges and an Arcade score for things you do here, like building a library, playing at night or setting up a second profile.',
        'Streaming on the Watch page: YouTube, Netflix, Disney+, Max, Prime Video, Hulu, Twitch and more open in their own full-screen window, and your controller acts like a keyboard there.',
        'System menu in the Guide: Wi-Fi networks, Bluetooth, Display, Sound, Windows Update, power mode and screen brightness (on laptops) without leaving the couch.',
        'Screensaver: after a quiet spell Arcade shows your game art, the clock and what is playing. Any button wakes it.',
        'Install for me: Xenia, RPCS3, Azahar, PCSX2, DuckStation, melonDS, mGBA, Cemu and Flycast can be downloaded and set up from the Emulators tab (experimental).',
        'Your own lists: add retro games and emulators by editing two small text files in the data folder.',
        'Health check and a bug report that hides your user name and folders.',
        'New look for the logo and app icon, and a short start-up animation (you can turn it off in Settings).'
      ]],
      ['Improved', [
        'Automatic backups: Arcade keeps copies of your library as you use it and can restore them.',
        'Backups made from Settings no longer include your API keys unless you choose Back up with keys.',
        'Hollywood Arcade is now open source under the GPL-3.0 license.'
      ]]
    ]
  },
  {
    v: '2.0.0', date: 'November 2026', title: 'Hollywood Arcade 2.0',
    groups: [
      ['New', [
        'The Guide: an Xbox 360 style menu with side blades for Store, Games, Media and Settings. Resume your game, play music, change volume, jump to Discord or open the power options. It opens over a game too.',
        'Choose how to open the Guide: hold L3 + R3, hold the touchpad, or press the PS button. Steam and PS5-native games use L3 + R3 and everything else uses the touchpad, and every game can override it. Settings has a controller test.',
        'Interface sounds: opening the Guide, moving around, selecting, notifications and a start-up chime. Pick Classic, Soft or Off, and set the volume.',
        'Watch: your Jellyfin shows, movies and Live TV channels (ErsatzTV too) in a Fire TV style page with a big banner and rows like Continue Watching. Add your server and API key in Settings.',
        'On-screen keyboard that opens when you move into a text box with the controller.',
        'Resume tile on Home when a game you started from Arcade is still running, plus a rough play time on each game.',
        'Retro classics: new PS3, Xbox 360 and 3DS tabs, much bigger PS2, PSP and Wii lists, and a filter by console. Xenia and Azahar join the Emulators tab, with setup presets for RPCS3, PPSSPP, Xenia and Azahar.',
        'Patch notes: this screen. It shows once after every update and lives in Settings.',
        'Back up and restore your library, settings and covers in one file.',
        'First-run setup for new installs, an error log you can copy, an About page with credits, and an optional update check.',
        'Optional: look for new games every time Arcade starts.'
      ]],
      ['Improved', [
        'Sharper pictures: Steam covers use the high resolution version, and Wikipedia, Apple Music and app icons are much larger.',
        'Apps now get icons, descriptions and website info, like games do.',
        'The controller no longer opens the Mixer on R3. The Guide has the volume controls instead.'
      ]]
    ]
  },
  {
    v: 'Before 2.0', date: '', title: 'Where it started',
    groups: [['Included', [
      'Xbox-style Home, library, Store and Game Pass tab.',
      'Game and music info with covers from free sources, plus a cover chooser and themes.',
      'Controller navigation, an in-game music and volume panel, and a Windows power menu.'
    ]]]
  }
];

const pndlg = document.getElementById('pndlg');
function pnCard(n) {
  return `<section class="pn"><h3>${esc(n.title)} <small>${esc(n.v)}${n.date ? ' · ' + esc(n.date) : ''}</small></h3>` +
    n.groups.map(([g, items]) => `<h4>${esc(g)}</h4><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('') + '</section>';
}
function showPatchNotes(all) {
  document.getElementById('pntitle').textContent = all ? 'Patch notes' : 'What’s new in ' + window.APP_VERSION;
  document.getElementById('pnbody').innerHTML = (all ? PATCH_NOTES : PATCH_NOTES.slice(0, 1)).map(pnCard).join('');
  document.getElementById('pnall').hidden = !!all;
  if (!pndlg.open) pndlg.showModal();
  document.getElementById('pnclose').focus();
}
document.getElementById('pnall').addEventListener('click', () => showPatchNotes(true));
document.getElementById('pnclose').addEventListener('click', () => { pndlg.close(); });
pndlg.addEventListener('close', () => { if (S.settings.seenVersion !== window.APP_VERSION) { S.settings.seenVersion = window.APP_VERSION; save(); } });

// ---------- start-up hook (called by app.js once the library is loaded) ----------
async function v2boot() {
  SFX.config(sndCfg());
  maybeWizard();
  if (S.settings.autoScan && S.settings.setupDone && typeof runScanAll === 'function') setTimeout(() => runScanAll().catch(() => {}), 6000);
  if (S.settings.autoUpdate !== false) setTimeout(() => checkUpdate(false), 8000);
  setTimeout(() => SFX.play('startup'), 700);
  fetch('/api/guidebind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bind: S.settings.guideDefault && S.settings.guideDefault !== 'auto' ? S.settings.guideDefault : 'chord', ps: (S.settings.guidePs || 13) - 1, touch: (S.settings.guideTouch || 14) - 1 }) }).catch(() => {});
  pollRunning();
  if (S.settings.jellyfinKey) jfSend();
  try { const r = await fetch('/api/version').then(x => x.json()); if (r && r.version) window.APP_VERSION = r.version; } catch { /* keep built-in */ }
  if (S.settings.seenVersion !== window.APP_VERSION && !wizd.open && S.settings.setupDone) setTimeout(() => showPatchNotes(false), 900);
}

// ================= Guide =================
const gde = document.createElement('dialog');
gde.id = 'guide360';
gde.innerHTML = '<iframe id="gframe" title="Guide" allow="gamepad"></iframe>';
document.body.appendChild(gde);
const gframe = gde.querySelector('iframe');
function openGuide() {
  if (gde.open) return;
  window.__guideOpen = true;
  gframe.onload = () => { try { gframe.contentWindow.focus(); } catch { /* ignore */ } };
  gframe.src = '/overlay.html?embed=1';
  gde.showModal();
}
function closeGuideView() {
  if (!gde.open) return;
  gde.close(); gframe.src = 'about:blank'; window.__guideOpen = false;
  if (typeof padResync !== 'undefined') padResync = true;
  SFX.play('close');
}
gde.addEventListener('cancel', (e) => { e.preventDefault(); closeGuideView(); });
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || !e.data || e.data.ha !== 'guide') return;
  if (e.data.cmd === 'close') closeGuideView();
  else if (e.data.cmd === 'nav') { closeGuideView(); handleNav(e.data.go); }
});
function handleNav(go) {
  if (!go) return;
  const [a, b] = go.split(/:(.*)/s);
  document.querySelectorAll('dialog[open]').forEach(d => { if (d !== gde) d.close(); });
  appFrame = null;
  if (a === 'launch') return launch(b);
  if (a === 'store') { view = 'store'; storeTab = b || 'top_sellers'; storeQ = ''; render(); return; }
  if (a === 'patchnotes') return showPatchNotes(true);
  if (a === 'padtest') return openPadTest();
  if (a === 'backup') { view = 'settings'; render(); setTimeout(() => document.getElementById('v2backup')?.scrollIntoView({ block: 'center' }), 50); return; }
  if (['home', 'games', 'apps', 'watch', 'music', 'discord', 'settings'].includes(a)) { view = a; render(); $('#main').scrollTop = 0; }
}
// the Guide window that floats over a game sends its requests here; a held-open request makes it instant
(async function navLoop() {
  for (;;) {
    try { const r = await fetch('/api/nav').then(x => x.json()); if (r && r.go) handleNav(r.go); }
    catch { await new Promise(r => setTimeout(r, 3000)); }
  }
})();

// opening the Guide with the controller while Arcade itself is in front: PS button, touchpad (hold) or L3+R3 (hold)
(function guidePad() {
  const since = {}, fired = {};
  const hold = (k, on, ms) => { if (!on) { since[k] = 0; fired[k] = false; return false; } if (!since[k]) since[k] = Date.now(); if (!fired[k] && Date.now() - since[k] >= ms) { fired[k] = true; return true; } return false; };
  (function loop() {
    requestAnimationFrame(loop);
    if (!document.hasFocus() || document.visibilityState !== 'visible' || window.__guideOpen) { for (const k in since) { since[k] = 0; fired[k] = false; } return; }
    const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(x => x && x.connected);
    let ps = false, touch = false, l3 = false, r3 = false;
    for (const p of pads) {
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      if (p.mapping === 'standard') { ps = ps || b(16); touch = touch || b(17); l3 = l3 || b(10); r3 = r3 || b(11); }
      else if (/054c|dualsense|dualshock|wireless controller|playstation/i.test(p.id)) { ps = ps || b(12); touch = touch || b(13); l3 = l3 || b(10); r3 = r3 || b(11); }
    }
    if (hold('ps', ps, 0) || hold('touch', touch, 450) || hold('chord', l3 && r3, 320)) openGuide();
  })();
})();

// ================= running game, resume tile, play time =================
let v2session = null;
window.__running = { running: false };
function v2Launched(it) {
  v2session = { id: it.id, t: Date.now(), seen: false };
  const s = S.settings;
  fetch('/api/guidebind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bind: guideBindFor(it, s), ps: (s.guidePs || 13) - 1, touch: (s.guideTouch || 14) - 1 }) }).catch(() => {});
}
function endSession() {
  if (!v2session) return;
  const it = S.items.find(i => i.id === v2session.id), mins = Math.round((Date.now() - v2session.t) / 60000);
  v2session = null;
  if (it && mins >= 1 && mins < 60 * 14) { it.playtime = (it.playtime || 0) + mins; save(); if (typeof infoId !== 'undefined' && infoId === it.id && document.getElementById('gdlg')?.open) openInfo(it.id); }
}
async function pollRunning() {
  const r = await fetch('/api/running').then(x => x.json()).catch(() => null);
  if (!r) return;
  const was = window.__running; window.__running = r;
  if (v2session) { if (r.running) v2session.seen = true; else if (v2session.seen) endSession(); }
  if (was.running !== r.running && view === 'home' && !document.querySelector('dialog[open]')) render();
}
setInterval(pollRunning, 4000);
window.addEventListener('focus', () => { pollRunning(); if (v2session && !v2session.seen && Date.now() - v2session.t > 120000) endSession(); });
function v2ResumeTile() {
  const r = window.__running; if (!r || !r.running) return '';
  const it = S.items.find(i => i.name === r.name && i.category === 'game');
  if (it) return tile(it, { sq: true }).replace('class="tile ', 'class="tile resume ').replace(/data-id="[^"]*"/, 'data-act="resume"').replace('<span class="badge">', '<span class="badge gp">RESUME · ').replace(/<small>[^<]*<\/small>/, '<small>Playing now</small>');
  return `<button class="tile game sq resume" data-act="resume"><div class="art" style="--ta:#107c10;--tb:#0b3d0b"><span class="glyph">▶</span><span class="badge gp">RESUME</span></div><div class="cap"><b>${esc(r.name || 'Your game')}</b><small>Playing now</small></div></button>`;
}
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act="resume"]'); if (!t) return;
  e.stopPropagation(); e.preventDefault();
  const r = await fetch('/api/resume', { method: 'POST' }).then(x => x.json()).catch(() => null);
  if (!r || !r.ok) toast('That game is not running any more');
}, true);
const fmtPlay = (m) => m >= 60 ? (m / 60).toFixed(m >= 600 ? 0 : 1).replace(/\.0$/, '') + ' h' : m + ' min';

// ================= sounds =================
const sndCfg = () => (S.settings.sound = S.settings.sound || { on: true, vol: 0.6, theme: 'classic' });
let lastPtr = 0, lastTick = 0;
document.addEventListener('pointerdown', () => { lastPtr = Date.now(); }, true);
document.addEventListener('focusin', (e) => {
  if (window.__guideOpen || Date.now() - lastPtr < 250 || Date.now() - lastTick < 70) return;
  if (e.target.closest && e.target.closest('.tile, .nav, .chip, .btn, .stile, .ecard')) { lastTick = Date.now(); SFX.play('tick'); }
}, true);
document.addEventListener('click', (e) => { if (!window.__guideOpen && e.target.closest && e.target.closest('.tile, .btn, .chip, .nav, [data-act]')) SFX.play('select'); }, true);
document.addEventListener('close', (e) => { if (e.target.tagName === 'DIALOG' && e.target.id !== 'guide360' && !window.__guideOpen) SFX.play('back'); }, true);
const _toast = window.toast;
window.toast = function (m) { _toast(m); SFX.play('toast'); };
window.addEventListener('gamepadconnected', (e) => { if (document.hasFocus()) toast('Controller connected: ' + e.gamepad.id.replace(/\s*\(.*$/, '')); });
window.addEventListener('gamepaddisconnected', () => { if (document.hasFocus()) toast('Controller disconnected'); });

// ================= controller test =================
const ptdlg = document.getElementById('ptdlg');
let ptTimer = null;
function openPadTest() {
  const s = S.settings;
  document.getElementById('ptps').value = s.guidePs || 13; document.getElementById('pttouch').value = s.guideTouch || 14;
  if (!ptdlg.open) ptdlg.showModal();
  clearInterval(ptTimer);
  ptTimer = setInterval(async () => {
    const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(x => x && x.connected);
    const raw = await fetch('/api/padraw').then(x => x.json()).catch(() => null);
    const bits = (n) => { const o = []; for (let i = 0; i < 32; i++) if (n & (1 << i)) o.push(i + 1); return o.length ? o.join(', ') : 'none'; };
    let h = '<h3>In the app (what the browser sees)</h3>';
    h += pads.length ? pads.map(p => `<p><b>${esc(p.id)}</b><br>mapping: ${esc(p.mapping || 'raw')} · pressed: ${p.buttons.map((b, i) => b.pressed ? i : '').filter(x => x !== '').join(', ') || 'none'}</p>`).join('') : '<p>No controller found. Press any button on it.</p>';
    h += '<h3>In Windows (works while a game is running)</h3>' + (raw ? `<p>Xbox-style buttons pressed: ${bits(raw.xinput)}<br>PlayStation / other buttons pressed (numbers): <b>${bits(raw.joy)}</b></p>` : '<p>Not available.</p>');
    document.getElementById('ptbody').innerHTML = h;
  }, 150);
}
ptdlg.addEventListener('close', () => clearInterval(ptTimer));
document.getElementById('ptclose').addEventListener('click', () => ptdlg.close());
// opens the Guide window the same way the controller would, to tell a drawing problem from a button problem
document.getElementById('ptguide').addEventListener('click', () => { fetch('/api/overlay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open' }) }).catch(() => {}); toast('Opening the Guide\u2026'); });
// everything needed to work out a controller problem, as text to paste
document.getElementById('ptcopy').addEventListener('click', async () => {
  const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(x => x && x.connected);
  const raw = await fetch('/api/padraw').then(x => x.json()).catch(() => null);
  const lg = await fetch('/api/log').then(x => x.json()).catch(() => ({ log: '' }));
  const s = S.settings;
  const t = ['Hollywood Arcade ' + window.APP_VERSION + ' controller report',
    'Controllers (browser): ' + (pads.map(p => p.id + ' [' + (p.mapping || 'raw') + ']').join('; ') || 'none'),
    'Windows buttons now: xinput=' + (raw ? raw.xinput : '?') + ' joy=' + (raw ? raw.joy : '?'),
    'Guide setting: ' + (s.guideDefault || 'auto') + ', PS button #' + (s.guidePs || 13) + ', touchpad #' + (s.guideTouch || 14),
    'Recent log:', String(lg.log || '').split('\n').slice(-25).join('\n')].join('\n');
  try { await navigator.clipboard.writeText(t); toast('Report copied'); } catch { prompt('Copy this report', t); }
});
for (const [id, key] of [['ptps', 'guidePs'], ['pttouch', 'guideTouch']]) {
  document.getElementById(id).addEventListener('change', (e) => {
    const n = Math.max(1, Math.min(32, +e.target.value || 1)); S.settings[key] = n; save();
    fetch('/api/guidebind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ps: (S.settings.guidePs || 13) - 1, touch: (S.settings.guideTouch || 14) - 1 }) }).catch(() => {});
  });
}

// ================= Settings sections for 2.0 =================
function v2Settings() {
  const s = S.settings, snd = sndCfg();
  const row = (title, sub, ctl, id) => `<div class="setting"${id ? ` id="${id}"` : ''}><div><b>${title}</b><small>${sub}</small></div><div class="ctl">${ctl}</div></div>`;
  const chip = (k, v, lab, on) => `<button class="chip ${on ? 'on' : ''}" data-v2="${k}" data-val="${v}">${lab}</button>`;
  const opt = (v, lab, cur) => `<option value="${v}"${cur === v ? ' selected' : ''}>${lab}</option>`;
  return row('Sounds', 'Little tones when you move around, open the Guide and get notifications. They are made by the app, nothing to download.',
      `<button class="switch ${snd.on !== false ? 'on' : ''}" role="switch" aria-checked="${snd.on !== false}" data-v2="snd-on"></button>`) +
    row('Sound style', 'Classic is bright and glassy. Soft is quieter.', chip('snd-theme', 'classic', 'Classic', snd.theme !== 'soft' && snd.theme !== 'off') + chip('snd-theme', 'soft', 'Soft', snd.theme === 'soft') + chip('snd-theme', 'off', 'Off', snd.theme === 'off')) +
    row('Sound volume', 'How loud the interface sounds are.', `<input type="range" min="0" max="100" value="${Math.round((snd.vol ?? 0.6) * 100)}" data-v2="snd-vol" style="width:160px"><button class="btn" data-v2="snd-test">Try</button>`) +
    row('Guide button', 'Which button opens the Guide inside a game. Automatic uses L3+R3 (hold) for Steam and PS5-native games, and any of L3+R3, the touchpad or the PS button for everything else. Xbox controllers always use L3+R3. Each game can override this in its info card.',
      `<select class="keyin" data-v2="guide-default">${opt('auto', 'Automatic', s.guideDefault || 'auto')}${opt('chord', 'L3 + R3 (hold)', s.guideDefault)}${opt('touch', 'Touchpad (hold)', s.guideDefault)}${opt('ps', 'PS button', s.guideDefault)}${opt('any', 'Any of them', s.guideDefault)}</select>`) +
    row('Jellyfin address', 'Where your Jellyfin server runs. ErsatzTV channels you added to Jellyfin show up under Live TV on the Watch page.', `<input class="keyin" data-v2="jf-url" value="${esc(s.jellyfinUrl || '')}" placeholder="${esc(jfBase())}" autocomplete="off">`) +
    row('Jellyfin API key', 'Jellyfin Dashboard \u203a API Keys \u203a add one named Hollywood Arcade, then paste it here. It stays on this PC.', `<input class="keyin" type="password" data-v2="jf-key" value="${esc(s.jellyfinKey || '')}" placeholder="Paste key" autocomplete="off"><button class="btn" data-v2="jf-test">Test</button>`) +
    row('Controller test', 'See which buttons Arcade and Windows actually receive from your controller, and set the PS and touchpad button numbers if they differ.', '<button class="btn" data-v2="padtest">Open</button>');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-v2]'); if (!b) return;
  const k = b.dataset.v2, snd = sndCfg();
  if (k === 'snd-on') { snd.on = snd.on === false; }
  else if (k === 'snd-theme') { snd.theme = b.dataset.val; }
  else if (k === 'snd-test') { SFX.config(snd); SFX.play('open'); setTimeout(() => SFX.play('select'), 350); return; }
  else if (k === 'padtest') return openPadTest();
  else if (k === 'jf-test') { jfTestNow(); return; }
  else return;
  SFX.config(snd); save(); render(); SFX.play('select');
});
document.addEventListener('input', (e) => { const b = e.target.closest && e.target.closest('[data-v2="snd-vol"]'); if (!b) return; const snd = sndCfg(); snd.vol = +b.value / 100; SFX.config(snd); S.settings.sound = snd; });
document.addEventListener('change', (e) => {
  const b = e.target.closest && e.target.closest('[data-v2]'); if (!b) return;
  if (b.dataset.v2 === 'snd-vol') { SFX.play('tick'); save(); }
  if (b.dataset.v2 === 'jf-url') { S.settings.jellyfinUrl = b.value.trim(); save(); watchState = { status: 'idle', rows: [], hero: null, err: '', at: 0 }; jfSend(); }
  if (b.dataset.v2 === 'jf-key') { S.settings.jellyfinKey = b.value.trim(); save(); watchState = { status: 'idle', rows: [], hero: null, err: '', at: 0 }; jfSend(); }
  if (b.dataset.v2 === 'guide-default') { S.settings.guideDefault = b.value; save(); toast('Guide button set'); }
});

async function jfTestNow() {
  await jfSend(); toast('Checking Jellyfin\u2026');
  const r = await jfGet('/Users').catch(() => null);
  if (!r) return toast("Couldn't reach Jellyfin. Is it running, and is the address right?");
  if (r.error) return toast(r.error);
  toast('Connected to Jellyfin. ' + (r.length || 0) + ' user' + (r.length === 1 ? '' : 's') + ' found.');
}

// ================= on-screen keyboard (opens when you move into a text box with the controller) =================
let padAct = 0, oskFor = null, oskShift = false, oskSym = false;
const oskd = document.createElement('dialog');
oskd.id = 'osk';
document.body.appendChild(oskd);
['mousedown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { padAct = 0; }, true));
(function watchPad() {
  requestAnimationFrame(watchPad);
  if (window.__guideOpen) return;
  const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(x => x && x.connected);
  for (const p of pads) if (p.buttons.some(b => b.pressed) || Math.hypot(p.axes[0] || 0, p.axes[1] || 0) > 0.5) { padAct = Date.now(); return; }
})();
const isTextBox = (el) => el && el.tagName === 'INPUT' && /^(text|search|password|url|email|number|)$/i.test(el.type) || (el && el.tagName === 'TEXTAREA');
function oskKeys() {
  const L = oskSym ? [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'], ['-', '_', '=', '+', '/', '\\', ':', ';', '"', "'"], ['.', ',', '?', '<', '>', '[', ']', '{', '}', '~']]
    : [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], 'qwertyuiop'.split(''), 'asdfghjkl\''.split(''), 'zxcvbnm.-_'.split('')];
  const cap = (k) => (!oskSym && oskShift && k.length === 1 ? k.toUpperCase() : k);
  const key = (k, cls) => `<button type="button" class="ok ${cls || ''}" data-k="${esc(k)}">${esc(cap(k))}</button>`;
  return L.map((r, i) => '<div class="orow">' + r.map(k => key(k)).join('') + (i === 0 ? '<button type="button" class="ok wide" data-k="⌫">⌫</button>' : '') + (i === 3 ? `<button type="button" class="ok wide${oskShift ? ' on' : ''}" data-k="⇧">Shift</button>` : '') + '</div>').join('') +
    `<div class="orow"><button type="button" class="ok wide" data-k="sym">${oskSym ? 'ABC' : '123 #+='}</button><button type="button" class="ok" data-k="@">@</button><button type="button" class="ok space" data-k=" ">space</button><button type="button" class="ok" data-k=".com">.com</button><button type="button" class="ok wide" data-k="clear">Clear</button><button type="button" class="ok wide done" data-k="done">Done</button></div>`;
}
function oskDraw(keepFocus) {
  const v = oskFor ? (oskFor.type === 'password' ? '•'.repeat(oskFor.value.length) : oskFor.value) : '';
  oskd.innerHTML = `<div class="oprev">${esc(oskFor && (oskFor.placeholder || oskFor.getAttribute('aria-label')) || 'Type here')}: <b>${esc(v)}</b><i></i></div>${oskKeys()}`;
  const f = keepFocus && oskd.querySelector(`[data-k="${CSS.escape(keepFocus)}"]`) || oskd.querySelector('[data-k="q"]') || oskd.querySelector('.ok');
  f && f.focus();
}
function oskOpen(el) {
  if (oskd.open || window.__guideOpen) return;
  oskFor = el; oskShift = false; oskSym = false; oskDraw(); oskd.showModal(); oskd.querySelector('[data-k="q"]')?.focus();
}
function oskClose() {
  const el = oskFor; oskFor = null; if (oskd.open) oskd.close();
  if (el) { el.dataset.noosk = '1'; el.focus(); setTimeout(() => { delete el.dataset.noosk; }, 400); }
}
oskd.addEventListener('close', () => { if (oskFor) { const el = oskFor; oskFor = null; el.dataset.noosk = '1'; el.focus(); setTimeout(() => { delete el.dataset.noosk; }, 400); } });
oskd.addEventListener('click', (e) => {
  const b = e.target.closest('.ok'); if (!b || !oskFor) return;
  if (!oskFor.isConnected && oskFor.id) { const n = document.getElementById(oskFor.id); if (n) { n.value = oskFor.value; oskFor = n; } } // the page redrew behind the keyboard
  const k = b.dataset.k, el = oskFor;
  if (k === 'done') return oskClose();
  if (k === 'sym') { oskSym = !oskSym; return oskDraw('sym'); }
  if (k === '⇧') { oskShift = !oskShift; return oskDraw('⇧'); }
  const s = el.selectionStart ?? el.value.length, en = el.selectionEnd ?? el.value.length;
  let nv = el.value, pos = s;
  if (k === '⌫') { if (s !== en) { nv = el.value.slice(0, s) + el.value.slice(en); pos = s; } else if (s > 0) { nv = el.value.slice(0, s - 1) + el.value.slice(en); pos = s - 1; } }
  else if (k === 'clear') { nv = ''; pos = 0; }
  else { const ch = (!oskSym && oskShift && k.length === 1) ? k.toUpperCase() : k; nv = el.value.slice(0, s) + ch + el.value.slice(en); pos = s + ch.length; if (oskShift && k.length === 1) { oskShift = false; el.value = nv; try { el.setSelectionRange(pos, pos); } catch { /* number inputs */ } el.dispatchEvent(new Event('input', { bubbles: true })); return oskDraw(k); } }
  el.value = nv; try { el.setSelectionRange(pos, pos); } catch { /* number inputs */ }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const prev = oskd.querySelector('.oprev b'); if (prev) prev.textContent = el.type === 'password' ? '•'.repeat(el.value.length) : el.value;
});
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!isTextBox(el) || el.dataset.noosk || oskd.contains(el) || oskd.open) return;
  // the keyboard opens on A / click (see padClick), not just because a box got focus
});
document.addEventListener('keydown', (e) => { if (oskd.open && e.key === 'Escape') { e.preventDefault(); oskClose(); } }, true);

// ================= error log =================
const errBuf = [];
function logError(msg) {
  const m = String(msg).slice(0, 1500);
  if (errBuf.length && errBuf[errBuf.length - 1] === m) return;
  errBuf.push(m); if (errBuf.length > 60) errBuf.shift();
  fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ msg: m }) }).catch(() => {});
  showErrBar();
}
let errBarT = 0;
function showErrBar() {
  let b = document.getElementById('errbar');
  if (!b) { b = document.createElement('div'); b.id = 'errbar'; b.innerHTML = '<span>Something went wrong.</span><button class="btn" id="errview">View log</button><button class="btn" id="errx" aria-label="Dismiss">✕</button>'; document.body.appendChild(b); b.querySelector('#errview').onclick = () => { b.classList.remove('show'); openLog(); }; b.querySelector('#errx').onclick = () => b.classList.remove('show'); }
  if (Date.now() - errBarT > 20000) { errBarT = Date.now(); b.classList.add('show'); setTimeout(() => b.classList.remove('show'), 9000); }
}
window.addEventListener('error', (e) => logError('Error: ' + e.message + ' (' + String(e.filename || '').split('/').pop() + ':' + e.lineno + ')'));
window.addEventListener('unhandledrejection', (e) => logError('Promise: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
async function openLog() {
  const r = await fetch('/api/log').then(x => x.json()).catch(() => ({ log: '' }));
  document.getElementById('logtext').textContent = `Hollywood Arcade ${window.APP_VERSION}\n${navigator.userAgent}\n\n` + (r.log || '').trim() + (errBuf.length ? '\n\nThis session:\n' + errBuf.join('\n') : '') || 'No errors recorded.';
  const d = document.getElementById('logdlg'); if (!d.open) d.showModal();
}
document.getElementById('logclose').onclick = () => document.getElementById('logdlg').close();
document.getElementById('logcopy').onclick = async () => { try { await navigator.clipboard.writeText(document.getElementById('logtext').textContent); toast('Copied'); } catch { toast("Couldn't copy. Select the text and press Ctrl+C."); } };

// ================= about, credits =================
const CREDITS = [
  ['Game info and covers', 'Steam store, SteamGridDB, RAWG, IGDB (Twitch), GOG, Epic Games Store, Libretro thumbnails, Wikipedia and Wikimedia Commons'],
  ['Music info', 'iTunes Search API (artwork, album, genre, year)'],
  ['TV and movies', 'Your own Jellyfin server'],
  ['Emulators', 'Dolphin, PCSX2, RPCS3, PPSSPP, Xenia, Azahar, Cemu, DuckStation, melonDS, mGBA, RetroArch, Flycast and xemu belong to their authors. Arcade only links to their official sites.']
];
function openAbout() {
  document.getElementById('abbody').innerHTML = `<div style="display:flex;align-items:center;gap:16px;margin-bottom:6px"><img src="logo.png" alt="" style="width:72px;height:72px;border-radius:16px"><div><b style="font-size:20px">Hollywood Arcade</b><br><span class="hint">Version ${esc(window.APP_VERSION)}</span></div></div>` + CREDITS.map(([t, d]) => `<h4 style="margin:14px 0 2px">${esc(t)}</h4><p class="hint">${esc(d)}</p>`).join('') +
    '<p class="hint" style="margin-top:16px">Hollywood Arcade is an independent project. It is not made by, or connected to, Microsoft, Sony, Nintendo, Valve, Epic Games or Apple. Names and pictures belong to their owners. Arcade does not download or provide games, and nothing you add leaves this PC.</p>';
  const d = document.getElementById('abdlg'); if (!d.open) d.showModal();
}
document.getElementById('abclose').onclick = () => document.getElementById('abdlg').close();
document.getElementById('ablog').onclick = () => { document.getElementById('abdlg').close(); openLog(); };

// ================= backup, restore, updates, scan =================
async function doBackup() {
  const r = await fetch('/api/backup'); if (!r.ok) return toast("Couldn't make a backup");
  const blob = await r.blob(), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'HollywoodArcade-backup-' + new Date().toISOString().slice(0, 10) + '.zip';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Backup saved to your Downloads folder');
}
function doRestore() {
  const f = document.createElement('input'); f.type = 'file'; f.accept = '.zip';
  f.onchange = async () => {
    const file = f.files[0]; if (!file) return;
    const r = await fetch('/api/restore', { method: 'POST', body: file }).then(x => x.json()).catch(() => null);
    if (!r || !r.ok) return toast((r && r.error) || "Couldn't restore that file");
    toast('Restored. Reloading…'); setTimeout(() => location.reload(), 900);
  };
  f.click();
}
const verNum = (v) => String(v || '0').replace(/^v/i, '').split('.').map(x => parseInt(x, 10) || 0);
const verNewer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
window.__update = null;
async function checkUpdate(manual) {
  const r = await fetch('/api/update/check').then(x => x.json()).catch(() => null);
  if (!r || !r.ok) { if (manual) toast((r && r.error) || "Couldn't check for updates"); return; }
  if (r.newer) {
    const first = !window.__update || window.__update.version !== r.latest;
    window.__update = { version: r.latest, notes: r.notes || '', canInstall: r.canInstall, page: r.page };
    if (view === 'home' || view === 'settings') render();
    if (first || manual) { toast('Update available: ' + r.latest); if (typeof notify === 'function') notify('Update available', 'Version ' + r.latest + ' is ready to install.', 'update'); }
    if (manual) updateDialog();
  } else { window.__update = null; if (manual) toast('You are up to date (' + window.APP_VERSION + ')'); }
}
function v2UpdateBanner() {
  const i = window.__update; if (!i) return '';
  return `<div class="updbar"><b>Update available: ${esc(i.version)}</b><span>You have ${esc(window.APP_VERSION)}</span><button class="btn primary" data-v2="upd-get">See what\u2019s new</button></div>`;
}
// shows the release notes and installs the update when the person agrees
function updateDialog() {
  const i = window.__update; if (!i) return;
  const notes = String(i.notes || 'No notes for this release.').replace(/\r/g, '');
  const body = `<h2>Update to ${esc(i.version)}</h2><p class="hint">You have ${esc(window.APP_VERSION)}. Arcade checks the download against its published checksum, restarts itself, and puts the old version back if the new one will not start.</p><pre class="updnotes">${esc(notes)}</pre><p id="updmsg" class="hint"></p>`;
  const btns = i.canInstall
    ? [{ label: 'Update now', primary: true, close: false, fn: async () => {
        const m = document.getElementById('updmsg'); if (m) m.textContent = 'Downloading\u2026 Arcade will restart in a moment.';
        const r = await fetch('/api/update/install', { method: 'POST' }).then(x => x.json()).catch(() => null);
        if (r && r.ok) { if (m) m.textContent = 'Installed ' + r.version + '. Restarting\u2026'; }
        else if (m) m.textContent = (r && r.error) || 'The update could not be installed.';
      } }, { label: 'Later' }]
    : [{ label: 'Open the release page', primary: true, fn: () => { if (i.page) api.launch({ kind: 'url', target: i.page, name: 'Update' }); } }, { label: 'Later' }];
  v21show(body, btns, true);
}

// ================= Settings: backup, updates, about =================
const _v2Settings = v2Settings;
v2Settings = function () {
  const s = S.settings;
  const row = (title, sub, ctl, id) => `<div class="setting"${id ? ` id="${id}"` : ''}><div><b>${title}</b><small>${sub}</small></div><div class="ctl">${ctl}</div></div>`;
  return v2UpdateBanner() + _v2Settings() +
    row('Look for new games at start-up', 'Scans Steam, Epic, GOG, Ubisoft and Game Pass every time Arcade opens and adds anything new.', `<button class="switch ${s.autoScan ? 'on' : ''}" role="switch" aria-checked="${!!s.autoScan}" data-v2="autoscan"></button>`) +
    row('Back up and restore', 'Saves your library, settings and covers to one file, or loads one back.', '<button class="btn" data-v2="backup">Back up</button><button class="btn" data-v2="restore">Restore</button>', 'v2backup') +
    row('Updates', 'Arcade checks the project\u2019s releases on GitHub a few seconds after start-up and tells you when a new version is out. It never installs anything without asking.', `<button class="switch ${s.autoUpdate !== false ? 'on' : ''}" role="switch" aria-checked="${s.autoUpdate !== false}" data-v2="autoupd"></button><button class="btn" data-v2="upd-check">Check now</button>`) +
    row('About and credits', 'Version ' + esc(window.APP_VERSION) + '. Data sources and error log.', '<button class="btn" data-v2="about">Open</button>');
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-v2]'); if (!b) return; const k = b.dataset.v2;
  if (k === 'backup') doBackup(); else if (k === 'restore') doRestore(); else if (k === 'about') openAbout();
  else if (k === 'upd-check') checkUpdate(true);
  else if (k === 'upd-get') updateDialog();
  else if (k === 'autoupd') { S.settings.autoUpdate = S.settings.autoUpdate === false; save(); render(); }
  else if (k === 'autoscan') { S.settings.autoScan = !S.settings.autoScan; save(); render(); }
});

// ================= first-run setup =================
const wizd = document.getElementById('wizdlg');
let wizStep = 0;
const WIZ = [
  () => '<h2>Welcome to Hollywood Arcade</h2><p class="hint">Your games, apps, music and shows in one console-style place. This takes about a minute and you can change everything later in Settings.</p>',
  () => `<h2>Find your games</h2><p class="hint">Arcade can look for installed games from Steam, Epic, GOG, Ubisoft and Game Pass. It only reads what is already on this PC.</p><div class="toolbar"><button class="btn primary" id="wizscan">Scan this PC now</button></div><p class="hint" id="wizscanmsg"></p>`,
  () => `<h2>Jellyfin (optional)</h2><p class="hint">If you run Jellyfin, add its address and an API key to get the Watch page. Skip this if you do not use it.</p><div class="wizf"><input class="keyin" id="wizjfu" placeholder="http://localhost:8096" value="${esc(S.settings.jellyfinUrl || '')}" autocomplete="off"><input class="keyin" id="wizjfk" type="password" placeholder="API key" value="${esc(S.settings.jellyfinKey || '')}" autocomplete="off"></div>`,
  () => '<h2>Using a controller</h2><p class="hint">Move with the D-pad or left stick, press ✕ or A to select, ○ or B to go back. In a game, hold L3 + R3 (or the touchpad) to open the Guide for music, volume and getting back to Arcade. You can change the button in Settings and test your controller there too.</p>',
  () => '<h2>You are all set</h2><p class="hint">Browse the Store for free games and emulators, and open Settings any time to change the look, sounds and more.</p>'
];
function wizDraw() {
  document.getElementById('wizbody').innerHTML = WIZ[wizStep]();
  document.getElementById('wizback').hidden = wizStep === 0;
  document.getElementById('wiznext').textContent = wizStep === WIZ.length - 1 ? 'Finish' : 'Next';
  const sc = document.getElementById('wizscan');
  if (sc) sc.onclick = async () => { sc.disabled = true; document.getElementById('wizscanmsg').textContent = 'Looking…'; S.settings.autoScan = true; try { await runScanAll(); } catch { /* shown by toast */ } document.getElementById('wizscanmsg').textContent = S.items.filter(i => i.category === 'game').length + ' games in your library.'; sc.disabled = false; };
  (document.getElementById('wiznext') || {}).focus && document.getElementById('wiznext').focus();
}
function wizSaveStep() {
  const u = document.getElementById('wizjfu'), k = document.getElementById('wizjfk');
  if (u) { S.settings.jellyfinUrl = u.value.trim(); S.settings.jellyfinKey = (k.value || '').trim(); jfSend(); }
}
function wizFinish() { wizSaveStep(); S.settings.setupDone = true; S.settings.seenVersion = window.APP_VERSION; save(); if (wizd.open) wizd.close(); render(); }
document.getElementById('wiznext').onclick = () => { wizSaveStep(); if (wizStep >= WIZ.length - 1) return wizFinish(); wizStep++; wizDraw(); };
document.getElementById('wizback').onclick = () => { if (wizStep > 0) { wizStep--; wizDraw(); } };
document.getElementById('wizskip').onclick = wizFinish;
wizd.addEventListener('cancel', (e) => { e.preventDefault(); wizFinish(); });
function maybeWizard() {
  if (S.settings.setupDone) return;
  if (S.items.some(i => i.category === 'game') || S.settings.steamPath || S.settings.musicFolder) { S.settings.setupDone = true; save(); return; } // an existing library
  wizStep = 0; wizDraw(); wizd.showModal(); document.getElementById('wiznext').focus();
}
