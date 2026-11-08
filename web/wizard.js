// Hollywood Arcade 2.2: the first-run setup, rebuilt as a guided tour. Replaces the steps in v2.js.
const W = { pad: null, detected: '', timer: null, done: false };
const wizSteps = ['Welcome', 'You', 'Controller', 'Games', 'Achievements', 'Look and sound', 'Watch', 'Privacy', 'Ready'];
const wizPadTip = {
  ps: 'In a game, hold <b>L3 + R3</b> (press both sticks in) in Steam games, or hold the <b>touchpad</b> (or press the <b>PS button</b>) in everything else, to open the Guide.',
  xbox: 'In any game, hold <b>L3 + R3</b> (press both sticks in) to open the Guide.',
  none: 'Everything works with a keyboard and mouse too. Press <b>Ctrl+Alt+H</b> in a game for the music and volume panel.'
};
const wizOn = (v) => v ? ' on' : '';
const wizProg = () => `<div class="wizprog" aria-hidden="true">${wizSteps.map((_, i) => `<i class="${i < wizStep ? 'past' : i === wizStep ? 'now' : ''}"></i>`).join('')}</div><div class="wizstep">${esc(wizSteps[wizStep])} · ${wizStep + 1} of ${wizSteps.length}</div>`;
const wizGames = () => S.items.filter(i => i.category === 'game');

WIZ.length = 0;
WIZ.push(
  // 0 welcome
  () => `<div class="wizhero"><img class="wizlogo" src="logo.png" alt=""><h2>Hollywood Arcade</h2><p class="wizsub">Every game, show and song you own. One console.</p>
    <div class="wizchips"><span>\u{1F3AE} Steam, Epic, GOG, Game Pass, emulators</span><span>\u{1F3C6} Achievements</span><span>\u{1F579}️ Made for a controller</span><span>\u{1F3AC} Jellyfin and streaming</span></div>
    <p class="hint">About two minutes. Everything is optional, and you can change it all later in Settings.</p></div>`,
  // 1 profile
  () => { const p = curProfile() || {}; return `${wizProg()}<h2>Who is playing?</h2><p class="hint">Your name, colour and picture show on Home. Others on this PC can add their own profile later.</p>
    <div class="wizme"><div id="wizav">${v21Avatar(p, 'pbig')}</div><div class="wizf"><input class="keyin" id="wizname" maxlength="24" placeholder="Your name" value="${esc(p.name || '')}" autocomplete="off">
    <div class="pcols">${PCOLORS.map(c => `<button type="button" class="pcol${p.color === c && !p.pic ? ' on' : ''}" data-wiz="color" data-c="${c}" style="background:${c}" aria-label="Colour"></button>`).join('')}</div>
    <div><button type="button" class="btn" data-wiz="photo">Choose a photo</button></div></div></div>`; },
  // 2 controller
  () => `${wizProg()}<h2>What do you play with?</h2><p class="hint">Press any button on your controller and Arcade will spot it.</p>
    <div class="wizopts">${[['ps', '\u{1F3AE}', 'PlayStation', 'DualSense or DualShock'], ['xbox', '\u{1F579}️', 'Xbox or other', 'Xbox pads and most others'], ['none', '⌨️', 'Keyboard and mouse', 'No controller']].map(([k, ic, t, s]) => `<button type="button" class="wizopt${wizOn(W.pad === k)}" data-wiz="pad" data-k="${k}"><span>${ic}</span><b>${t}</b><small>${s}</small></button>`).join('')}</div>
    <p class="wizdet" id="wizdet">${W.detected ? '✓ Detected: ' + esc(W.detected) : ''}</p><p class="wiztip" id="wiztip">${W.pad ? wizPadTip[W.pad] : ''}</p>`,
  // 3 games
  () => { const g = wizGames(), by = {}; g.forEach(i => { const s = i.source || 'Other'; by[s] = (by[s] || 0) + 1; });
    return `${wizProg()}<h2>Find your games</h2><p class="hint">Arcade looks for installed games from Steam, Epic, GOG, Ubisoft and Game Pass. It only reads what is already on this PC.</p>
    <div class="toolbar"><button class="btn primary" id="wizscan">${g.length ? 'Scan again' : 'Scan this PC now'}</button><span class="hint" id="wizscanmsg">${g.length ? g.length + ' games in your library.' : ''}</span></div>
    <div class="wizchips" id="wizsrc">${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([s, n]) => `<span>${esc(s)} <b>${n}</b></span>`).join('')}</div>
    <p class="hint">Emulators are in the Store: open <b>Emulators</b> and press <b>Install for me</b> to set one up in a click.</p>`; },
  // 4 achievements
  () => { const s = S.settings; return `${wizProg()}<h2>Achievements</h2><p class="hint">Optional. Connect an account and every game gets a progress ring, and you get a pop-up over the game when you unlock something.</p>
    <div class="wizf"><label>Steam ID <small>(your Steam profile’s Game details must be Public)</small><input class="keyin" id="wizsteam" placeholder="7656119…" value="${esc(s.steamId || '')}" autocomplete="off"></label>
    <label>RetroAchievements user <small>(for retro games)</small><input class="keyin" id="wizrau" value="${esc(s.raUser || '')}" autocomplete="off"></label>
    <label>RetroAchievements Web API key<input class="keyin" id="wizrak" type="password" value="${esc(s.raKey || '')}" autocomplete="off"></label></div>`; },
  // 5 look and sound
  () => { const t = S.settings.theme || {}, cur = (t.ac && t.ac[0]) || (!t.ac && !t.acHex ? ACCENTS[0][1][0] : ''), snd = sndCfg();
    return `${wizProg()}<h2>Make it yours</h2><p class="hint">Changes show straight away.</p>
    <div class="setting"><div><b>Accent colour</b></div><div class="ctl">${ACCENTS.map(([n, c], i) => `<button type="button" class="sw${cur === c[0] ? ' on' : ''}" style="--sw:${c[1]}" title="${n}" aria-label="${n}" data-wiz="acc" data-i="${i}"></button>`).join('')}</div></div>
    <div class="setting"><div><b>Background</b></div><div class="ctl">${BGS.map(([n, c]) => `<button type="button" class="sw${(t.bg || '#0f0f0f') === c ? ' on' : ''}" style="--sw:${c}" title="${n}" aria-label="${n}" data-wiz="bg" data-v="${c}"></button>`).join('')}</div></div>
    <div class="setting"><div><b>Corners</b></div><div class="ctl"><button type="button" class="chip${t.round ? '' : ' on'}" data-wiz="round" data-v="">Square</button><button type="button" class="chip${t.round ? ' on' : ''}" data-wiz="round" data-v="1">Rounded</button></div></div>
    <div class="setting"><div><b>Sounds</b><small>Press one to hear it.</small></div><div class="ctl">${[['classic', 'Classic'], ['soft', 'Soft'], ['off', 'Off']].map(([k, l]) => `<button type="button" class="chip${(snd.on === false ? 'off' : snd.theme) === k ? ' on' : ''}" data-wiz="snd" data-k="${k}">${l}</button>`).join('')}</div></div>`; },
  // 6 watch
  () => { const s = S.settings; return `${wizProg()}<h2>Movies and shows</h2><p class="hint">Netflix, YouTube, Disney+, Max, Prime Video, Hulu and Twitch are already under <b>Watch</b>, with nothing to set up. If you run Jellyfin (or ErsatzTV through it), add it here to get a big-screen library.</p>
    <div class="wizf"><input class="keyin" id="wizjfu" placeholder="Jellyfin address, like http://localhost:8096" value="${esc(s.jellyfinUrl || '')}" autocomplete="off"><input class="keyin" id="wizjfk" type="password" placeholder="Jellyfin API key" value="${esc(s.jellyfinKey || '')}" autocomplete="off"></div>`; },
  // 7 privacy and options
  () => { const s = S.settings; const sw = (k, on) => `<button type="button" class="switch${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" data-wiz="opt" data-k="${k}"></button>`;
    return `${wizProg()}<h2>Your call</h2><p class="hint">Everything stays on this PC. Arcade only talks to the services behind features you use.</p>
    <div class="setting"><div><b>Check for updates</b><small>Looks at this project’s releases on GitHub after start-up. Never installs without asking.</small></div><div class="ctl">${sw('autoUpdate', s.autoUpdate !== false)}</div></div>
    <div class="setting"><div><b>Achievement pop-ups in games</b><small>Checks your achievements every 30 seconds while a game runs.</small></div><div class="ctl">${sw('liveAch', s.liveAch !== false)}</div></div>
    <div class="setting"><div><b>Start full screen</b><small>Like a console. You can still switch away any time.</small></div><div class="ctl">${sw('fullscreen', !!s.fullscreen)}</div></div>
    <div class="setting"><div><b>Look for new games at start-up</b><small>Adds anything you install later.</small></div><div class="ctl">${sw('autoScan', s.autoScan !== false)}</div></div>`; },
  // 8 ready
  () => { const s = S.settings, p = curProfile() || {}, g = wizGames().length;
    const line = (ok, t) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '–'} ${t}</li>`;
    return `<div class="wizhero"><div class="wizdone">${v21Avatar(p, 'pbig')}</div><h2>You’re all set${p.name ? ', ' + esc(p.name) : ''}</h2>
    <ul class="wizlist">${line(true, 'Profile: ' + esc(p.name || 'Player'))}${line(!!W.pad, W.pad ? 'Controller: ' + ({ ps: 'PlayStation', xbox: 'Xbox or other', none: 'keyboard and mouse' })[W.pad] : 'Controller: not chosen')}${line(g > 0, g + ' games in your library')}${line(!!(s.steamId || s.raKey), s.steamId || s.raKey ? 'Achievements connected' : 'Achievements: add an account any time in Settings')}${line(!!s.jellyfinKey, s.jellyfinKey ? 'Jellyfin connected' : 'Jellyfin: not set up')}</ul>
    <p class="wiztip">${W.pad ? wizPadTip[W.pad] : wizPadTip.xbox}</p>
    <p class="hint">Next: open the <b>Store</b> for free games and emulators, and earn your first <b>Arcade badge</b> by launching a game.</p></div>`; }
);

function wizDraw() {
  clearInterval(W.timer);
  document.getElementById('wizbody').innerHTML = WIZ[wizStep]();
  document.getElementById('wizback').hidden = wizStep === 0;
  document.getElementById('wiznext').textContent = wizStep === 0 ? 'Let’s go' : wizStep === WIZ.length - 1 ? 'Open Arcade' : 'Next';
  document.getElementById('wizskip').hidden = wizStep === WIZ.length - 1;
  const sc = document.getElementById('wizscan');
  if (sc) sc.onclick = async () => {
    sc.disabled = true; const m = document.getElementById('wizscanmsg'); m.textContent = 'Looking…'; S.settings.autoScan = true;
    try { await runScanAll(); } catch { /* shown by toast */ }
    const g = wizGames(); m.textContent = g.length ? g.length + ' games found.' : 'No games found yet. You can add some by hand or from the Store.';
    const by = {}; g.forEach(i => { const s = i.source || 'Other'; by[s] = (by[s] || 0) + 1; });
    document.getElementById('wizsrc').innerHTML = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([s, n]) => `<span>${esc(s)} <b>${n}</b></span>`).join('');
    sc.disabled = false; sc.textContent = 'Scan again';
  };
  if (wizStep === 2) W.timer = setInterval(wizDetect, 500);
  document.getElementById('wiznext').focus();
}
function wizDetect() {
  const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(x => x && x.connected);
  if (!pads.length) return;
  const id = pads[0].id.replace(/\s*\(.*$/, ''), ps = /054c|dualsense|dualshock|wireless controller|playstation/i.test(pads[0].id);
  const el = document.getElementById('wizdet'); if (el) el.textContent = '✓ Detected: ' + id;
  if (W.detected !== id) { W.detected = id; if (!W.pad) wizPick(ps ? 'ps' : 'xbox'); }
}
function wizPick(k) {
  W.pad = k; S.settings.padPref = k;
  try { padKind = k === 'ps' ? 'ps' : 'xbox'; } catch { /* ignore */ }
  document.querySelectorAll('.wizopt').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  const t = document.getElementById('wiztip'); if (t) t.innerHTML = wizPadTip[k];
}
function wizSaveStep() {
  const v = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : null; };
  const n = v('wizname'); if (n) { const p = curProfile(); if (p && p.name !== n) { p.name = n; } }
  const st = v('wizsteam'); if (st !== null) { S.settings.steamId = st; S.settings.raUser = v('wizrau'); S.settings.raKey = v('wizrak'); }
  const u = v('wizjfu'); if (u !== null) { S.settings.jellyfinUrl = u; S.settings.jellyfinKey = v('wizjfk') || ''; try { jfSend(); } catch { /* ignore */ } }
}
function wizFinish() {
  W.done = true; clearInterval(W.timer); wizSaveStep();
  S.settings.setupDone = true; S.settings.seenVersion = window.APP_VERSION; save();
  try { api.applySettings(S.settings); } catch { /* ignore */ }
  if (wizd.open) wizd.close();
  render(); if (typeof arcCheck === 'function') arcCheck();
  try { SFX.play('achieve'); } catch { /* ignore */ }
  const p = curProfile(); toast('Welcome' + (p && p.name ? ', ' + p.name : '') + '!');
}
document.getElementById('wizskip').onclick = wizFinish;
// B on a controller (and Esc) goes back a step instead of throwing the setup away
wizd.addEventListener('cancel', (e) => { e.preventDefault(); e.stopImmediatePropagation(); if (wizStep > 0) { wizSaveStep(); wizStep--; wizDraw(); } }, true);
wizd.addEventListener('close', () => {
  if (W.done) return;
  if (wizStep > 0) { wizSaveStep(); wizStep--; }
  wizDraw(); if (!wizd.open) wizd.showModal();
});
wizd.addEventListener('click', (e) => {
  const b = e.target.closest('[data-wiz]'); if (!b) return; const k = b.dataset.wiz;
  if (k === 'pad') wizPick(b.dataset.k);
  else if (k === 'color') { const p = curProfile(); if (p) { p.color = b.dataset.c; delete p.pic; } wizSaveStep(); wizDraw(); }
  else if (k === 'photo') { wizSaveStep(); v21pickPicture(); }
  else if (k === 'acc') { const t = (S.settings.theme = S.settings.theme || {}); t.ac = ACCENTS[+b.dataset.i][1]; delete t.acHex; applyTheme(); wizDraw(); }
  else if (k === 'bg') { const t = (S.settings.theme = S.settings.theme || {}); t.bg = b.dataset.v; applyTheme(); wizDraw(); }
  else if (k === 'round') { const t = (S.settings.theme = S.settings.theme || {}); t.round = b.dataset.v ? 1 : 0; applyTheme(); wizDraw(); }
  else if (k === 'snd') { const c = sndCfg(); c.on = b.dataset.k !== 'off'; if (c.on) c.theme = b.dataset.k; SFX.config(c); try { SFX.play('select'); } catch { /* ignore */ } wizDraw(); }
  else if (k === 'opt') {
    const key = b.dataset.k, on = b.classList.contains('on'), s = S.settings;
    s[key] = key === 'fullscreen' ? !on : !on; b.classList.toggle('on', !on); b.setAttribute('aria-checked', String(!on));
  }
});
// the picture dialog sits on top of this one; redraw the avatar when it closes
document.getElementById('v21dlg').addEventListener('close', () => { if (wizd.open && wizStep === 1) wizDraw(); });

// run it again from Settings
{ const _sv = v2Settings; v2Settings = function () {
  return _sv() + `<div class="setting"><div><b>Run setup again</b><small>Walks through your profile, controller, games, achievements, look and privacy choices.</small></div><div class="ctl"><button class="btn" data-wizrun="1">Start</button></div></div>`;
}; }
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-wizrun]')) return; e.stopPropagation();
  W.done = false; wizStep = 0; wizDraw(); wizd.showModal();
}, true);
