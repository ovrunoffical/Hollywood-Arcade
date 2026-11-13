// Hollywood Arcade 3.2: interface styles.
// A style changes the whole look and how you move around, not just the colours. The accent colour and the
// background colour in Settings still apply to every style.
//
//   arcade : the current layout
//   og     : a glowing orb menu with the Arcade logo in the middle

const UI_STYLES = [['arcade', 'Arcade'], ['og', 'Orb'], ['xmb', 'Waves'], ['x360', 'Blades'], ['x360n', 'Tiles'], ['ps4', 'Deck'], ['nsw', 'Shelf']];
const STYLE_BG = { og: '#0a140c', xmb: '#2b2358', x360: '#2a1008', x360n: '#7b7b7b', ps4: '#0f3fa8', nsw: '#ebebeb' };
const uiStyle = () => ((S.settings && S.settings.uiStyle) || 'arcade');
const UI_TITLES = { games: 'Games', apps: 'Apps', store: 'Store', watch: 'Watch', profile: 'Profile', music: 'Music', discord: 'Discord', settings: 'Settings', app: 'App', plug: 'Plugin' };
let ogLast = 'games'; // the entry you came from, so coming back lands on it

// ---- Orb: the glowing orb menu ----
function ogEntries() {
  const e = [];
  const run = window.__running;
  if (run && run.running) e.push({ act: 'resume', label: 'Resume ' + (run.name || 'game') });
  e.push({ v: 'games', label: 'Games' }, { v: 'apps', label: 'Apps' }, { v: 'store', label: 'Store' }, { v: 'watch', label: 'Watch' },
    { v: 'music', label: 'Music' }, { v: 'discord', label: 'Discord' },
    ...Object.keys(typeof PLUG !== 'undefined' ? PLUG.pages : {}).map(id => ({ v: 'plug', plug: id, label: PLUG.pages[id].title })),
    { act: 'gsearch', label: 'Search' }, { act: 'looks', label: 'Change look' }, { v: 'profile', label: 'Profile' }, { v: 'settings', label: 'Settings' }, { act: 'power-menu', label: 'Power' });
  return e;
}

const OG_SLOTS = [[22, 60, 16], [36, 28, 13], [50, 76, 13], [67, 32, 14], [79, 62, 16], [89, 27, 11], [11, 26, 11], [30, 86, 11], [70, 86, 11], [56, 12, 11], [91, 78, 10], [8, 80, 10]];
function ogHome() {
  const name = typeof v21Name === 'function' ? v21Name() : 'Hollywood';
  const sc = typeof arcScore === 'function' ? arcScore() : 0;
  const ents = ogEntries();
  const item = (e, i) => {
    const s = OG_SLOTS[i] || [10 + (i - OG_SLOTS.length) * 9, 94, 9];
    return `<button class="ogi${e.v && e.v === ogLast ? ' last' : ''}" ${e.act ? `data-act="${e.act}"` : `data-act="goto" data-v="${e.v}"`}${e.plug ? ` data-plug="${esc(e.plug)}"` : ''} style="--x:${s[0]};--y:${s[1]};--s:${s[2]}vh;--i:${i};--f:${e.label.length > 9 ? .115 : e.label.length > 6 ? .15 : .17}"><i class="ogo"></i><span class="ogl"><span>${esc(e.label)}</span></span></button>`;
  };
  return `<div class="og">
    <i class="og-strands" aria-hidden="true"></i>
    <div class="og-top"><span class="og-who"><b>${esc(name)}</b> <em>★ ${sc.toLocaleString()}</em></span><span class="og-clock" id="xclock">${clockText()}</span></div>
    <div class="og-orb" aria-hidden="true"><i class="p p1"></i><i class="p p2"></i><i class="p p3"></i><div class="og-core"></div><svg class="og-logo" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50"/><g><rect x="25" y="20" width="12" height="60" rx="3"/><rect x="63" y="20" width="12" height="60" rx="3"/><rect x="33" y="44" width="34" height="12"/></g></svg></div>
    <nav class="og-field" aria-label="Main menu">${ents.map(item).join('')}</nav>
    <div class="og-foot"><span class="ogk">a</span> select <span class="ogk b">b</span> back</div>
  </div>`;
}

{ const _h = home; home = function () { return uiStyle() === 'og' ? ogHome() : _h.apply(this, arguments); }; }

// the page header on every other screen in this style
function ogHead() {
  const t = view === 'plug' ? ((typeof PLUG !== 'undefined' && PLUG.pages[PLUG.cur]) || {}).title || 'Plugin' : (UI_TITLES[view] || '');
  return `<div class="og-head"><button class="ogback" data-act="goto" data-v="home" aria-label="Back to the menu"><span>◄</span> Back</button><span class="og-ttl"><i class="ogo sm"></i>${esc(t)}</span></div>`;
}

{
  const _r = render;
  render = function () {
    const r = _r.apply(this, arguments);
    try {
      const st = uiStyle(), og = st === 'og';
      document.body.classList.toggle('ui-og', og);
      document.body.classList.toggle('ui-xmb', st === 'xmb');
      document.body.classList.toggle('ui-alt', st !== 'arcade');
      if (st !== 'arcade') {
        if (view === 'home') {
          if (!og) return r;
          const last = document.querySelector('.ogi.last') || document.querySelector('.ogi');
          if (last && (padOn || document.activeElement === document.body || !document.activeElement || !document.activeElement.isConnected)) last.focus({ preventScroll: true });
        } else {
          if (UI_TITLES[view]) ogLast = view;
          const m = document.getElementById('main');
          if (m && !m.querySelector('.og-head')) m.insertAdjacentHTML('afterbegin', ogHead());
        }
      }
    } catch { /* styling must never break the page */ }
    return r;
  };
}

// Back goes to the menu (B on the controller, Esc on the keyboard)
document.addEventListener('keydown', (e) => {
  if (uiStyle() === 'arcade' || e.key !== 'Escape') return;
  if (document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement ? document.activeElement.tagName : '')) return;
  if (view !== 'home') { view = 'home'; render(); }
}, true);

// ---- Settings: choose the style ----
function styleRow() {
  const cur = uiStyle();
  return '<div class="mixh">Style</div><div class="setting"><div><b>Interface style</b><small>How Arcade looks and how you move around it. Each look keeps its own colours.</small></div><div class="ctl">' +
    UI_STYLES.map(([k, n]) => `<button class="chip ${cur === k ? 'on' : ''}" data-v33="style" data-v="${k}">${n}</button>`).join('') + '</div></div>';
}
{ const _sv = v2Settings; v2Settings = function () { return styleRow() + _sv(); }; }

function setStyle(k) {
  const t = (S.settings.theme = S.settings.theme || {});
  const auto = Object.values(STYLE_BG);
  if (!t.bg || t.bg === '#0f0f0f' || (t.styleBg && auto.includes(t.bg))) {   // only swap the background if you haven't picked your own
    if (STYLE_BG[k]) { t.bg = STYLE_BG[k]; t.styleBg = 1; } else { t.bg = '#0f0f0f'; delete t.styleBg; }
  }
  S.settings.uiStyle = k;
  save(); view = k !== 'arcade' ? 'home' : view; render();
  toast(({ og: 'Orb style. Press B or Esc to go back to the menu.', xmb: 'Waves style. Left and right change category, up and down pick, B goes back.', x360: 'Blades style. Up and down change blade, left and right pick a panel, B goes back.', x360n: 'Tiles style. Left and right change the tab, then move down into the tiles. B goes back.', ps4: 'Deck style. Left and right pick, up goes to the top bar, B goes back.', nsw: 'Shelf style. Left and right pick a game, down reaches the round buttons, up is your profile, B goes back.' })[k] || 'Arcade style');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-v33="style"]'); if (!b) return;
  e.stopPropagation(); setStyle(b.dataset.v);
}, true);
