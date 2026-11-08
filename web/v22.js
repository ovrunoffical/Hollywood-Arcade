// Hollywood Arcade 2.2: Notification Center and live achievement pop-ups.

// ================= Notification Center =================
const NOTE_ICON = { achievement: '\u{1F3C6}', update: '⬆️', install: '\u{1F4E6}', info: '\u{1F514}' };
function notify(title, text, kind) {
  const list = (S.notes = S.notes || []), now = Date.now();
  if (list[0] && list[0].title === title && list[0].text === (text || '') && now - list[0].t < 60000) return;
  if (kind === 'update' && list.some(n => n.kind === 'update' && n.title === title && n.text === (text || ''))) return; // once per version, not every start-up
  list.unshift({ id: now.toString(36) + Math.random().toString(36).slice(2, 5), t: now, title, text: text || '', kind: kind || 'info', read: false });
  if (list.length > 100) list.length = 100;
  save(); v22Bell();
}
const notUnread = () => (S.notes || []).filter(n => !n.read).length;
function v22Bell() {
  const c = notUnread();
  for (const b of document.querySelectorAll('#notbell, .xbell')) {
    b.classList.toggle('has', c > 0); const i = b.querySelector('i'); if (i) i.textContent = c > 9 ? '9+' : (c || '');
    b.title = c ? c + ' new notification' + (c === 1 ? '' : 's') : 'Notifications';
  }
}
function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60); if (h < 24) return h + ' h ago';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function notifCenter() {
  const list = S.notes || [];
  const body = `<h2>Notifications</h2>` + (list.length
    ? `<div class="notlist">${list.map(n => `<div class="note${n.read ? '' : ' new'}"><span class="ni">${NOTE_ICON[n.kind] || NOTE_ICON.info}</span><div><b>${esc(n.title)}</b><small>${esc(n.text)}</small></div><em>${ago(n.t)}</em></div>`).join('')}</div>`
    : '<p class="hint">Nothing yet. Achievements you unlock, updates and downloads show up here.</p>');
  list.forEach(n => { n.read = true; }); save(); v22Bell();
  v21show(body, [{ label: 'Close', primary: true }].concat(list.length ? [{ label: 'Clear all', fn: () => { S.notes = []; save(); v22Bell(); } }] : []), true);
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-v22="notes"]'); if (b) { e.stopPropagation(); notifCenter(); } }, true);
{ const _hn = handleNav; handleNav = function (go) { if (go === 'notes') { document.querySelectorAll('dialog[open]').forEach(d => d.close()); return setTimeout(notifCenter, 200); } return _hn(go); }; }
setTimeout(v22Bell, 1500);

// downloads and installs land here too
{ const _vi = v21install; v21install = async function (e, btn) {
  const exes = () => (S.settings.emulators || []).map(x => x.exe).join('|'), before = exes();
  const r = await _vi(e, btn);
  if (exes() !== before) notify('Installed ' + (e && e.n || 'emulator'), 'Pick the folder with your games to finish setting it up.', 'install');
  return r;
}; }

// ================= Live achievement pop-ups =================
// While a game Arcade started is running, its achievements are checked every half minute. A new unlock gets a pop-up
// over the game, a line in the Notification Center and the achievement chime.
const liveSeen = {};
let liveBusy = false;
async function liveAchTick() {
  if (liveBusy) return; liveBusy = true;
  try {
    const run = window.__running;
    if (!run || !run.running || S.settings.liveAch === false) { for (const k of Object.keys(liveSeen)) delete liveSeen[k]; return; }
    const it = S.items.find(i => i.category === 'game' && i.name === run.name);
    if (!it || !achWays(it).some(w => !w.need)) return;
    const r = await achFetch(it);
    if (!r || !r.ok) return;
    const now = (r.items || []).filter(x => x.u);
    const ids = new Set(now.map(x => x.i || x.n));
    if (!liveSeen[it.id]) { liveSeen[it.id] = ids; return; } // first look is only the starting point
    const fresh = now.filter(x => !liveSeen[it.id].has(x.i || x.n));
    liveSeen[it.id] = ids;
    if (!fresh.length) return;
    it.ach = { u: r.unlocked, t: r.total, at: Date.now(), p: r.provider }; save();
    for (const a of fresh.slice(0, 4)) {
      const line = a.d ? a.d : it.name;
      fetch('/api/toast/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: a.n, text: it.name + (a.d ? ' · ' + a.d : ''), icon: a.ic || '' }) }).catch(() => {});
      notify('\u{1F3C6} ' + a.n, it.name + (a.d ? ' · ' + a.d : ''), 'achievement');
      if (document.hasFocus()) { try { SFX.play('achieve'); } catch { /* ignore */ } toast('\u{1F3C6} ' + a.n + ' (' + line + ')'); }
    }
    arcCheck();
  } finally { liveBusy = false; }
}
setInterval(liveAchTick, 30000);

// ================= Settings =================
{ const _sv = v2Settings; v2Settings = function () {
  const s = S.settings;
  const row = (title, sub, ctl) => `<div class="setting"><div><b>${title}</b><small>${sub}</small></div><div class="ctl">${ctl}</div></div>`;
  return _sv() + row('Live achievement pop-ups', 'While a game is running, Arcade checks its achievements every 30 seconds and shows a pop-up over the game when you unlock one. Works for Steam, RetroAchievements and Xbox titles you have set up.', `<button class="switch ${s.liveAch !== false ? 'on' : ''}" role="switch" aria-checked="${s.liveAch !== false}" data-v22="live"></button>`) +
    row('Notification Center', 'Achievements, updates and downloads in one list.', `<button class="btn" data-v22="notes">Open</button>`);
}; }
document.addEventListener('click', (e) => { const b = e.target.closest('[data-v22="live"]'); if (b) { e.stopPropagation(); S.settings.liveAch = S.settings.liveAch === false; save(); render(); } }, true);

{ const _r = render; render = function () { const r = _r.apply(this, arguments); try { v22Bell(); } catch { /* ignore */ } return r; }; }
