// Hollywood Arcade 3.2: interface styles.
// A style changes the whole look and how you move around, not just the colours. The accent colour and the
// background colour in Settings still apply to every style.
//
//   arcade : the current layout
//   og     : the green orb menu of the original Xbox, with the Arcade logo in the middle

const UI_STYLES = [['arcade', 'Arcade'], ['og', 'Original Xbox']];
const uiStyle = () => ((S.settings && S.settings.uiStyle) || 'arcade');
const UI_TITLES = { games: 'Games', apps: 'Apps', store: 'Store', watch: 'Watch', ach: 'Achievements', music: 'Music', discord: 'Discord', settings: 'Settings', app: 'App', plug: 'Plugin' };
let ogLast = 'games'; // the entry you came from, so coming back lands on it

// ---- the original-Xbox style: orb menu ----
function ogEntries() {
  const e = [];
  const run = window.__running;
  if (run && run.running) e.push({ act: 'resume', label: 'Resume ' + (run.name || 'game') });
  e.push({ v: 'games', label: 'Games' }, { v: 'apps', label: 'Apps' }, { v: 'store', label: 'Store' }, { v: 'watch', label: 'Watch' },
    { v: 'ach', label: 'Achievements' }, { v: 'music', label: 'Music' }, { v: 'discord', label: 'Discord' },
    ...Object.keys(typeof PLUG !== 'undefined' ? PLUG.pages : {}).map(id => ({ v: 'plug', plug: id, label: PLUG.pages[id].title })),
    { act: 'gsearch', label: 'Search' }, { v: 'settings', label: 'Settings' }, { act: 'power-menu', label: 'Power' });
  return e;
}

function ogHome() {
  const name = typeof v21Name === 'function' ? v21Name() : 'Hollywood';
  const sc = typeof arcScore === 'function' ? arcScore() : 0;
  const item = (e, i) => `<button class="ogi${e.v && e.v === ogLast ? ' last' : ''}" ${e.act ? `data-act="${e.act}"` : `data-act="goto" data-v="${e.v}"`}${e.plug ? ` data-plug="${esc(e.plug)}"` : ''} style="--i:${i}"><i class="ogo"></i><span class="ogl"><span>${esc(e.label)}</span></span></button>`;
  return `<div class="og">
    <div class="og-top"><span class="og-who"><b>${esc(name)}</b> <em>★ ${sc.toLocaleString()}</em></span><span class="og-clock" id="xclock">${clockText()}</span></div>
    <div class="og-orb" aria-hidden="true"><i class="p p1"></i><i class="p p2"></i><i class="p p3"></i><div class="og-core"></div><svg class="og-logo" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50"/><g><rect x="25" y="20" width="12" height="60" rx="3"/><rect x="63" y="20" width="12" height="60" rx="3"/><rect x="33" y="44" width="34" height="12"/></g></svg></div>
    <nav class="og-menu" aria-label="Main menu">${ogEntries().map(item).join('')}</nav>
    <div class="og-foot">Hollywood Arcade</div>
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
      const og = uiStyle() === 'og';
      document.body.classList.toggle('ui-og', og);
      if (og) {
        if (view === 'home') {
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
  if (uiStyle() !== 'og' || e.key !== 'Escape') return;
  if (document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement ? document.activeElement.tagName : '')) return;
  if (view !== 'home') { view = 'home'; render(); }
}, true);

// ---- Settings: choose the style ----
function styleRow() {
  const cur = uiStyle();
  return '<div class="mixh">Style</div><div class="setting"><div><b>Interface style</b><small>How Arcade looks and how you move around it. Your accent and background colours still apply.</small></div><div class="ctl">' +
    UI_STYLES.map(([k, n]) => `<button class="chip ${cur === k ? 'on' : ''}" data-v33="style" data-v="${k}">${n}</button>`).join('') + '</div></div>';
}
{ const _sv = v2Settings; v2Settings = function () { return styleRow() + _sv(); }; }

function setStyle(k) {
  const t = (S.settings.theme = S.settings.theme || {});
  if (k === 'og' && (!t.bg || t.bg === '#0f0f0f')) { t.bg = '#0a140c'; t.ogBg = 1; }          // a deep green to start with
  if (k !== 'og' && t.ogBg && t.bg === '#0a140c') { t.bg = '#0f0f0f'; delete t.ogBg; }          // and back again, unless you changed it
  S.settings.uiStyle = k;
  save(); view = k === 'og' ? 'home' : view; render();
  toast(k === 'og' ? 'Original Xbox style. Press B or Esc to go back to the menu.' : 'Arcade style');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-v33="style"]'); if (!b) return;
  e.stopPropagation(); setStyle(b.dataset.v);
}, true);
