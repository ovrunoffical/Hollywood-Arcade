// Hollywood Arcade 3.1: plugins, and your Arcade score next to your name.
//
// A plugin never touches this page. Its script runs inside a sandboxed frame that has no network and cannot reach
// anything here. It can only send a request ("give me the library", "show this shelf") and this file decides, from
// the permissions you approved, whether to answer. What it shows is plain data that this file draws itself.

const PLUG = { list: [], run: {}, shelves: {}, pages: {}, cur: '', errs: {}, perms: {}, dir: '' };

// ---- the code that runs inside the sandbox (gives the plugin its `ha` object) ----
const PLUG_BOOT = `(() => {
  const pend = {}; let n = 0; const hs = {};
  const call = (name, a) => new Promise((res, rej) => { const id = ++n; pend[id] = [res, rej]; parent.postMessage({ ha: 1, t: 'call', id, n: name, a }, '*'); });
  const fire = (name, d) => (hs[name] || []).forEach(f => { try { const r = f(d); if (r && r.catch) r.catch(e => call('log', String(e && e.message || e))); } catch (e) { call('log', String(e && e.message || e)); } });
  addEventListener('message', (e) => {
    const d = e.data; if (!d || d.ha !== 1) return;
    if (d.t === 'res') { const p = pend[d.id]; delete pend[d.id]; if (p) d.ok ? p[0](d.v) : p[1](new Error(d.e)); }
    else if (d.t === 'event') fire(d.n, d.d);
  });
  addEventListener('error', (e) => { call('log', String(e.message)); });
  addEventListener('unhandledrejection', (e) => { call('log', String(e.reason && e.reason.message || e.reason)); });
  window.ha = {
    on: (name, f) => { (hs[name] = hs[name] || []).push(f); },
    library: () => call('library'),
    fetch: (u) => call('fetch', { url: String(u) }).then(r => ({ ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.text, json: async () => JSON.parse(r.text) })),
    storage: { get: () => call('sget'), set: (v) => call('sset', v) },
    shelf: (id, d) => call('shelf', { id: String(id), d }),
    page: (d) => call('page', d),
    toast: (m) => call('toast', String(m))
  };
})();`;

const plugOk = (id, perm) => !!(PLUG.run[id] && (PLUG.run[id].p.granted || []).includes(perm));
const plugHost = (u, hosts) => { try { const x = new URL(u); return x.protocol === 'https:' && (hosts || []).some(h => x.hostname === h || x.hostname.endsWith('.' + h)); } catch { return false; } };
const plugStr = (s, n) => String(s == null ? '' : s).slice(0, n);

async function plugBoot() {
  const r = await fetch('/api/plugins').then(x => x.json()).catch(() => null);
  if (!r) return;
  PLUG.list = r.plugins || []; PLUG.perms = r.perms || {}; PLUG.dir = r.dir || '';
  const want = new Set(PLUG.list.filter(p => p.on && !p.error).map(p => p.id));
  for (const id of Object.keys(PLUG.run)) if (!want.has(id)) plugStop(id, true);
  for (const p of PLUG.list) {
    if (!want.has(p.id)) continue;
    if (PLUG.run[p.id]) PLUG.run[p.id].p = p; else await plugStart(p);
  }
  plugRefresh();
}

async function plugStart(p) {
  const code = await fetch('/api/plugins/code?id=' + encodeURIComponent(p.id)).then(x => x.ok ? x.text() : null).catch(() => null);
  if (code == null) { PLUG.errs[p.id] = 'The script could not be read.'; return; }
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts'); // no same-origin, no forms, no popups, no navigation
  f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.title = 'Plugin ' + p.name;
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
  const safe = (t) => t.replace(/<\/script/gi, '<\\/script');
  f.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'"><script>' + safe(PLUG_BOOT) + '</script><script>' + safe(code) + '</script>';
  f.addEventListener('load', () => { try { f.contentWindow.postMessage({ ha: 1, t: 'event', n: 'ready', d: null }, '*'); } catch { /* ignore */ } });
  delete PLUG.errs[p.id];
  PLUG.run[p.id] = { frame: f, p };
  document.body.appendChild(f);
}

function plugStop(id, quiet) {
  const r = PLUG.run[id]; if (r) r.frame.remove();
  delete PLUG.run[id]; delete PLUG.shelves[id]; delete PLUG.pages[id];
  if (!quiet) plugRefresh();
}

function plugEmit(name, d) {
  for (const id of Object.keys(PLUG.run)) {
    if (!plugOk(id, 'events')) continue;
    try { PLUG.run[id].frame.contentWindow.postMessage({ ha: 1, t: 'event', n: name, d }, '*'); } catch { /* ignore */ }
  }
}

// ---- answering a plugin's requests ----
addEventListener('message', async (e) => {
  const d = e.data;
  if (!d || d.ha !== 1 || d.t !== 'call') return;
  const id = Object.keys(PLUG.run).find(k => PLUG.run[k].frame.contentWindow === e.source);
  if (!id) return;
  const run = PLUG.run[id];
  const reply = (ok, v, err) => { try { e.source.postMessage({ ha: 1, t: 'res', id: d.id, ok, v, e: err }, '*'); } catch { /* ignore */ } };
  const need = (perm) => { if (!plugOk(id, perm)) throw new Error('This plugin was not given the "' + perm + '" permission.'); };
  try {
    const a = d.a;
    switch (d.n) {
      case 'log': PLUG.errs[id] = plugStr(a, 300); return reply(true);
      case 'library':
        need('library.read');
        return reply(true, S.items.map(i => ({ id: i.id, name: i.name, category: i.category, source: i.source || '', playtime: i.playtime || 0, ach: i.ach ? { unlocked: i.ach.u, total: i.ach.t } : null })));
      case 'fetch': {
        need('net');
        const r = await fetch('/api/plugins/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, url: plugStr(a && a.url, 2000) }) }).then(x => x.json());
        if (!r.ok) throw new Error(r.error || 'The request failed.');
        return reply(true, { status: r.status, text: r.text });
      }
      case 'sget': case 'sset': {
        need('storage');
        const r = await fetch('/api/plugins/storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d.n === 'sset' ? { id, set: true, data: a } : { id }) }).then(x => x.json());
        if (!r.ok) throw new Error(r.error || 'Storage failed.');
        return reply(true, r.data == null ? null : r.data);
      }
      case 'shelf': {
        need('ui');
        const sid = plugStr(a && a.id, 40), s = a && a.d;
        if (!sid || !s) throw new Error('shelf needs an id and a description.');
        const items = (Array.isArray(s.items) ? s.items : []).slice(0, 20).map(c => ({ title: plugStr(c.title, 80), sub: plugStr(c.sub, 80), item: plugStr(c.item, 80), image: plugHost(c.image, run.p.net) ? String(c.image) : '' }));
        (PLUG.shelves[id] = PLUG.shelves[id] || {})[sid] = { title: plugStr(s.title, 60), items };
        plugRefresh(); return reply(true);
      }
      case 'page': {
        need('ui');
        const blocks = (Array.isArray(a && a.blocks) ? a.blocks : []).slice(0, 60).map(b => {
          if (b.h != null) return { h: plugStr(b.h, 80) };
          if (b.p != null) return { p: plugStr(b.p, 600) };
          if (b.stats) return { stats: b.stats.slice(0, 8).map(x => ({ label: plugStr(x.label, 30), value: plugStr(x.value, 20) })) };
          if (b.list) return { list: b.list.slice(0, 60).map(x => ({ title: plugStr(x.title, 80), sub: plugStr(x.sub, 80), right: plugStr(x.right, 30), item: plugStr(x.item, 80) })) };
          return { p: '' };
        });
        PLUG.pages[id] = { title: plugStr(a && a.title, 40) || run.p.name, blocks };
        plugRefresh(); return reply(true);
      }
      case 'toast': need('ui'); toast(plugStr(run.p.name + ': ' + a, 160)); return reply(true);
      default: throw new Error('Unknown request: ' + plugStr(d.n, 30));
    }
  } catch (err) { reply(false, null, String((err && err.message) || err)); }
});

// ---- drawing what plugins contributed ----
let plugTimer = 0;
function plugRefresh() {
  clearTimeout(plugTimer);
  plugTimer = setTimeout(() => {
    plugNav();
    if ((view === 'home' || view === 'plug') && !document.querySelector('dialog[open]')) render();
  }, 120);
}

function plugNav() {
  const nav = document.querySelector('.side nav'); if (!nav) return;
  nav.querySelectorAll('.nav[data-plug]').forEach(n => n.remove());
  for (const id of Object.keys(PLUG.pages)) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.view = 'plug'; b.dataset.plug = id;
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 2v4h6V2h2v4h1a2 2 0 0 1 2 2v3h-3a2 2 0 0 0 0 4h3v3a2 2 0 0 1-2 2h-3v-3a2 2 0 0 0-4 0v3H6a2 2 0 0 1-2-2v-3h3a2 2 0 0 0 0-4H4V8a2 2 0 0 1 2-2h1V2z"/></svg>' + esc(PLUG.pages[id].title);
    nav.appendChild(b);
  }
}

const plugCard = (c) => {
  const it = c.item && S.items.find(i => i.id === c.item);
  if (it) return tile(it); // a card for something in your library is the normal tile, so it opens like any other
  return `<button class="tile pcard" data-plug-item="${esc(c.item)}"><div class="art" style="--ta:#3a2f6b;--tb:#1d1838"><span class="glyph">${esc((c.title[0] || '?').toUpperCase())}</span>${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</div><div class="cap"><b>${esc(c.title)}</b><small>${esc(c.sub)}</small></div></button>`;
};

function plugShelvesHTML() {
  let h = '';
  for (const id of Object.keys(PLUG.shelves)) for (const s of Object.values(PLUG.shelves[id])) {
    if (!s.items.length) continue;
    h += `<h2 class="xtitle plugshelf" title="From the plugin ${esc((PLUG.run[id] || {}).p ? PLUG.run[id].p.name : id)}">${esc(s.title)}</h2><div class="rail">${s.items.map(plugCard).join('')}</div>`;
  }
  return h;
}

function plugView() {
  const pg = PLUG.pages[PLUG.cur], run = PLUG.run[PLUG.cur];
  if (!pg) return '<h1 class="title">Plugin</h1><div class="empty">This plugin has no page right now.</div>';
  const row = (x) => `<button class="plrow" ${x.item ? `data-plug-item="${esc(x.item)}"` : 'tabindex="-1"'}><span><b>${esc(x.title)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span><em>${esc(x.right)}</em></button>`;
  return `<h1 class="title">${esc(pg.title)}</h1><p class="hint">From the plugin “${esc(run ? run.p.name : '')}”. You can turn it off in Settings.</p>` + pg.blocks.map(b =>
    b.h ? `<h2 class="xtitle">${esc(b.h)}</h2>` :
      b.p ? `<p class="hint">${esc(b.p)}</p>` :
        b.stats ? `<div class="pstats">${b.stats.map(x => `<div><b>${esc(x.value)}</b><small>${esc(x.label)}</small></div>`).join('')}</div>` :
          b.list ? `<div class="plist">${b.list.map(row).join('')}</div>` : '').join('');
}

document.addEventListener('click', (e) => {
  const n = e.target.closest('.nav[data-plug]'); if (n) { PLUG.cur = n.dataset.plug; return; }
  const c = e.target.closest('[data-plug-item]');
  if (c && c.dataset.plugItem && S.items.some(i => i.id === c.dataset.plugItem)) { e.stopPropagation(); openInfo(c.dataset.plugItem); }
}, true);

// ---- events, and the name + score by your picture ----
{ const _l = v2Launched; v2Launched = function (it) { _l(it); try { plugEmit('game.launched', { name: it.name, source: it.source || '' }); } catch { /* ignore */ } }; }
{ const _e = endSession; endSession = function () { const id = v2session && v2session.id; _e(); if (id) { try { const it = S.items.find(i => i.id === id); plugEmit('game.closed', { name: it ? it.name : '' }); } catch { /* ignore */ } } }; }

// a small icon (many sites only have a 16 or 32 pixel one) is shown at about its real size instead of stretched blurry
function v32Icons() {
  document.querySelectorAll('.art.ico img, .gcover.ico img').forEach(img => {
    const mark = () => { if (img.naturalWidth && img.naturalWidth < 128 && !/\.svg(\?|$)/i.test(img.currentSrc || img.src)) img.classList.add('lo'); };
    if (img.complete) mark(); else img.addEventListener('load', mark, { once: true });
  });
}

function v32Brand() {
  const b = document.querySelector('.side .brand'); if (!b) return;
  const name = typeof v21Name === 'function' ? v21Name() : 'Hollywood', sc = typeof arcScore === 'function' ? arcScore() : 0, key = name + '|' + sc;
  if (b.dataset.k === key) return;
  b.dataset.k = key;
  b.innerHTML = `<img class="logo-img" src="logo.png" alt=""><span class="bname"><b>${esc(name)}</b><small>★ ${sc.toLocaleString()}</small></span>`;
}

{
  const _r = render; let lastV = '';
  render = function () {
    const r = _r.apply(this, arguments);
    try {
      v32Brand(); v32Icons();
      if (view !== lastV) { lastV = view; if (view === 'home' || view === 'plug') for (const id of Object.keys(PLUG.run)) { try { PLUG.run[id].frame.contentWindow.postMessage({ ha: 1, t: 'event', n: 'view', d: view }, '*'); } catch { /* ignore */ } } }
      document.querySelectorAll('.nav[data-plug]').forEach(n => n.classList.toggle('on', view === 'plug' && n.dataset.plug === PLUG.cur));
      if (view === 'home') { const h = plugShelvesHTML(); if (h) document.getElementById('main').insertAdjacentHTML('beforeend', h); }
    } catch { /* a plugin problem must never break the page */ }
    return r;
  };
}

// ---- Settings: switch plugins on and off, with what each one asks for in plain words ----
const plugAskText = (p) => p.permissions.map(k => '• ' + (PLUG.perms[k] || k) + (k === 'net' ? ': ' + p.net.join(', ') : '')).join('<br>');

async function plugToggle(id) {
  const p = PLUG.list.find(x => x.id === id); if (!p) return;
  const set = async (on) => { await fetch('/api/plugins/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, on, perms: on ? p.permissions : [] }) }); await plugBoot(); render(); };
  if (p.on) return set(false);
  v21show(`<h2>Turn on “${esc(p.name)}”?</h2><p class="hint">${esc(p.description || '')}</p><p>This plugin asks to:</p><p style="line-height:1.7">${p.permissions.length ? plugAskText(p) : 'Nothing. It cannot do anything.'}</p><p class="hint">It runs in a sandbox and cannot launch programs or touch your files. Only turn on plugins from people you trust.</p>`,
    [{ label: 'Turn on', primary: true, fn: () => set(true) }, { label: 'Cancel' }]);
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-v32]'); if (!b) return;
  e.stopPropagation();
  const k = b.dataset.v32;
  if (k === 'toggle') return plugToggle(b.dataset.id);
  if (k === 'folder') { await fetch('/api/plugins/folder', { method: 'POST' }); return toast('Opened the plugins folder. Put each plugin in its own folder there.'); }
  if (k === 'examples') { const r = await fetch('/api/plugins/examples', { method: 'POST' }).then(x => x.json()).catch(() => ({})); await plugBoot(); render(); return toast(r.ok ? (r.added ? 'Added ' + r.added + ' example plugin' + (r.added === 1 ? '' : 's') + '. Turn them on below.' : 'The example plugins are already there.') : "Couldn't add the examples"); }
  if (k === 'reload') { for (const id of Object.keys(PLUG.run)) plugStop(id, true); await plugBoot(); render(); return toast('Plugins reloaded'); }
}, true);

{ const _sv = v2Settings; v2Settings = function () {
  const rows = PLUG.list.map(p => `<div class="setting"><div><b>${esc(p.name)}${p.version ? ' <small>' + esc(p.version) + '</small>' : ''}</b><small>${esc(p.description || '')}${p.error ? '<br><span style="color:#ff8a8a">' + esc(p.error) + '</span>' : ''}${p.on && PLUG.errs[p.id] ? '<br><span style="color:#ffd27a">Problem: ' + esc(PLUG.errs[p.id]) + '</span>' : ''}${p.permissions.length ? '<br>' + plugAskText(p) : ''}</small></div><div class="ctl">${p.error ? '' : `<button class="switch ${p.on ? 'on' : ''}" role="switch" aria-checked="${p.on}" data-v32="toggle" data-id="${esc(p.id)}"><i></i></button>`}</div></div>`).join('');
  return _sv() + '<div class="mixh">Plugins</div>' +
    '<div class="setting"><div><b>Plugins folder</b><small>Each plugin is a folder with a plugin.json and a script. Plugins stay off until you turn them on here.</small></div><div class="ctl"><button class="btn" data-v32="folder">Open folder</button> <button class="btn" data-v32="examples">Add examples</button> <button class="btn" data-v32="reload">Reload</button></div></div>' +
    (rows || '<div class="setting"><div><b>No plugins yet</b><small>Tap Add examples to try two, or drop a plugin folder into the plugins folder and tap Reload.</small></div></div>');
}; }

setTimeout(() => { plugBoot().catch(() => { /* plugins are optional */ }); }, 1500);
