// Hollywood Arcade 3.1: Discord voice button and status, Apple Music auto-play settings.
async function v31voice() {
  if (!S.settings.discordVoice) return toast('Paste your voice channel link in Settings first.');
  toast('Opening your voice channel…');
  const r = await fetch('/api/discord/voice', { method: 'POST' }).then(x => x.json()).catch(() => ({ ok: false, error: 'Arcade did not answer' }));
  if (!r.ok) toast(r.error || "Couldn't open Discord");
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-v31]'); if (!b) return;
  if (b.dataset.v31 === 'voice') { e.stopPropagation(); v31voice(); }
}, true);

const v31sel = (k, opts, def) => `<select class="keyin" data-set="${k}">${opts.map(([v, l]) => `<option value="${v}"${(S.settings[k] || def) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
const v31row = (t, s, ctl) => `<div class="setting"><div><b>${t}</b><small>${s}</small></div><div class="ctl">${ctl}</div></div>`;
const v31in = (k, ph) => `<input class="keyin" data-set="${k}" value="${esc(S.settings[k] || '')}" placeholder="${esc(ph || '')}" autocomplete="off">`;

{ const _sv = v2Settings; v2Settings = function () {
  return _sv() +
    '<div class="mixh">Discord</div>' +
    v31row('Voice channel link', 'In Discord, right-click your voice channel, Copy Link. Stays on this PC; it only works for people already in your server.', v31in('discordVoice', 'https://discord.com/channels/…')) +
    v31row('Join voice', 'Opens the channel, then tucks Discord away so you stay in Arcade.', '<button class="btn" data-v31="voice">Join now</button>') +
    v31row('Keep Discord out of the way', 'Minimise Discord a few seconds after joining.', v31sel('discordVoiceHide', [['on', 'On'], ['off', 'Off']], 'on')) +
    v31row('Show what I am playing', 'Needs the Application ID below. Friends see the game you launched from Arcade.', v31sel('discordPresence', [['on', 'On'], ['off', 'Off']], 'on')) +
    v31row('Application ID', 'From discord.com/developers/applications, your app named Hollywood Arcade. Public, safe to paste.', v31in('discordAppId', '123456789012345678')) +
    v31row('Status headline', 'Game title, or the app name (Hollywood Arcade).', v31sel('discordHeadline', [['title', 'Game title'], ['app', 'Hollywood Arcade']], 'title')) +
    '<div class="mixh">Apple Music (experimental)</div>' +
    v31row('Press play for me', 'After you pick a song in Arcade, Arcade presses keys in Apple Music to start it, then sends it to the background.', v31sel('applePlay', [['on', 'On'], ['off', 'Off']], 'on')) +
    v31row('Keys to press', 'Enter by default. Examples: {ENTER}, {TAB}{ENTER}, {DOWN}{ENTER}, " " for Space.', v31in('applePlayKeys', '{ENTER}')) +
    v31row('Wait before pressing (ms)', 'Raise this if the song page loads slowly. 3000 is 3 seconds.', v31in('applePlayDelay', '3000'));
}; }
{ const _d = discord; discord = function () {
  return _d().replace('data-act="open-discord">Open Discord</button>', 'data-act="open-discord">Open Discord</button> <button class="btn" data-v31="voice">Join voice</button>');
}; }
