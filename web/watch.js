// Watch: your Jellyfin library (and ErsatzTV channels, which Jellyfin shows as Live TV) in a Fire TV style layout.
'use strict';
const jfBase = () => (S.settings.jellyfinUrl || ((S.items.find(i => i.id === 'preset-jellyfin') || {}).target) || 'http://localhost:8096').replace(/\/+$/, '');
const jfSend = () => fetch('/api/jfconfig', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: jfBase(), key: S.settings.jellyfinKey || '' }) }).catch(() => {});
const jfGet = (p) => fetch('/api/jf?p=' + encodeURIComponent(p)).then(r => r.json());
const jfImg = (p) => '/api/jfimg?p=' + encodeURIComponent(p);

let watchState = { status: 'idle', rows: [], hero: null, err: '', at: 0 };

async function watchLoad(force) {
  if (watchState.status === 'loading') return;
  if (!force && watchState.status === 'ok' && Date.now() - watchState.at < 180000) return;
  if (!S.settings.jellyfinKey) { if (watchState.status === 'nokey') return; watchState = { status: 'nokey', rows: [], hero: null, err: '', at: 0 }; if (view === 'watch') render(); return; }
  watchState.status = 'loading'; if (view === 'watch') render();
  await jfSend();
  try {
    const users = await jfGet('/Users');
    if (users.error) throw new Error(users.error);
    const want = (S.settings.jellyfinUser || '').toLowerCase();
    const u = users.find(x => want && x.Name.toLowerCase() === want) || users.find(x => x.Policy && x.Policy.IsAdministrator) || users[0];
    if (!u) throw new Error('Jellyfin has no users yet.');
    const uid = u.Id, F = 'Overview,PrimaryImageAspectRatio,ProductionYear,OfficialRating,RunTimeTicks,CurrentProgram';
    const q = async (p) => { const r = await jfGet(p); return r && !r.error ? (r.Items || r) : []; };
    const [resume, next, chans, movies, shows] = await Promise.all([
      q(`/Users/${uid}/Items/Resume?Limit=14&MediaTypes=Video&Fields=${F}&EnableImageTypes=Primary,Backdrop,Thumb`),
      q(`/Shows/NextUp?userId=${uid}&Limit=14&Fields=${F}`),
      q(`/LiveTv/Channels?userId=${uid}&Limit=30&AddCurrentProgram=true&EnableFavoriteSorting=true`),
      q(`/Users/${uid}/Items/Latest?IncludeItemTypes=Movie&Limit=16&Fields=${F}`),
      q(`/Users/${uid}/Items/Latest?IncludeItemTypes=Series&Limit=16&Fields=${F}`)
    ]);
    const rows = [
      ['Continue watching', 'wide', resume], ['Next up', 'wide', next], ['Live TV', 'chan', chans],
      ['New movies', 'poster', movies], ['New shows', 'poster', shows]
    ].filter(r => r[2] && r[2].length);
    const first = (resume[0] || next[0] || movies[0] || shows[0] || null);
    watchState = { status: 'ok', rows, hero: first, err: '', at: Date.now(), uid };
  } catch (e) {
    watchState = { status: 'error', rows: [], hero: null, err: String(e.message || e), at: 0 };
  }
  if (view === 'watch') render();
}

const jfItemUrl = (id) => jfBase() + '/web/index.html#!/details?id=' + encodeURIComponent(id);
function jfThumb(it, kind) {
  const tag = (it.ImageTags || {}), bk = it.BackdropImageTags || [];
  if (kind === 'poster') return it.ImageTags && it.ImageTags.Primary ? jfImg(`/Items/${it.Id}/Images/Primary?maxHeight=480&quality=90`) : '';
  if (kind === 'chan') return it.ImageTags && it.ImageTags.Primary ? jfImg(`/Items/${it.Id}/Images/Primary?maxHeight=240&quality=90`) : '';
  if (tag.Thumb) return jfImg(`/Items/${it.Id}/Images/Thumb?maxWidth=640&quality=90`);
  if (bk.length) return jfImg(`/Items/${it.Id}/Images/Backdrop?maxWidth=640&quality=90`);
  if (it.ParentBackdropItemId && (it.ParentBackdropImageTags || []).length) return jfImg(`/Items/${it.ParentBackdropItemId}/Images/Backdrop?maxWidth=640&quality=90`);
  if (it.SeriesId && it.SeriesPrimaryImageTag) return jfImg(`/Items/${it.SeriesId}/Images/Primary?maxHeight=480&quality=90`);
  return tag.Primary ? jfImg(`/Items/${it.Id}/Images/Primary?maxWidth=640&quality=90`) : '';
}
function jfHeroImg(it) {
  if ((it.BackdropImageTags || []).length) return jfImg(`/Items/${it.Id}/Images/Backdrop?maxWidth=1600&quality=85`);
  if (it.ParentBackdropItemId && (it.ParentBackdropImageTags || []).length) return jfImg(`/Items/${it.ParentBackdropItemId}/Images/Backdrop?maxWidth=1600&quality=85`);
  return jfThumb(it, 'wide');
}
const jfTitle = (it) => it.Type === 'Episode' ? (it.SeriesName || it.Name) : it.Name;
const jfSub = (it) => it.Type === 'Episode' ? `S${it.ParentIndexNumber || '?'}:E${it.IndexNumber || '?'} · ${it.Name}` : it.Type === 'TvChannel' ? (it.CurrentProgram ? 'Now: ' + it.CurrentProgram.Name : (it.Number ? 'Channel ' + it.Number : 'Live TV')) : [it.ProductionYear, it.OfficialRating].filter(Boolean).join(' · ');
const jfMins = (it) => it.RunTimeTicks ? Math.round(it.RunTimeTicks / 600000000) + ' min' : '';

function watchTile(it, kind, ri, ci) {
  const [a, b] = cols(jfTitle(it)), img = jfThumb(it, kind);
  const pct = it.UserData && it.UserData.PlayedPercentage ? Math.min(100, Math.round(it.UserData.PlayedPercentage)) : 0;
  return `<button class="wt ${kind}" data-wr="${ri}" data-wc="${ci}" data-a="${a}" data-b="${b}"><div class="wart" style="--ta:${a};--tb:${b}"><span class="glyph">${esc((jfTitle(it)[0] || '?').toUpperCase())}</span>${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}${pct ? `<i class="wprog"><b style="width:${pct}%"></b></i>` : ''}${kind === 'chan' && it.CurrentProgram ? '<span class="badge gp">LIVE</span>' : ''}</div><div class="cap"><b>${esc(kind === 'chan' ? it.Name : jfTitle(it))}</b><small>${esc(jfSub(it))}</small></div></button>`;
}
function watchHero(it) {
  if (!it) return '';
  const img = jfHeroImg(it), meta = [it.ProductionYear, it.OfficialRating, jfMins(it)].filter(Boolean).join(' · ');
  const ov = (it.Overview || (it.CurrentProgram && it.CurrentProgram.Overview) || '').slice(0, 260);
  return `<div class="whero" id="whero" data-id="${esc(it.Id)}">${img ? `<img src="${esc(img)}" alt="">` : ''}<div class="whtxt"><small>${esc(it.Type === 'Episode' ? 'TV SHOW' : it.Type === 'TvChannel' ? 'LIVE TV' : (it.Type || '').toUpperCase())}</small><h1>${esc(jfTitle(it))}</h1><p class="wmeta">${esc(meta || jfSub(it))}</p><p class="wov">${esc(ov)}</p>
    <div class="whbtn"><button class="btn primary" data-wplay="${esc(it.Id)}">▶ Play</button><button class="btn" data-act="watch-refresh">Refresh</button></div></div></div>`;
}

function watchView() {
  watchLoad(false);
  const st = watchState;
  let h = '<h1 class="title">Watch</h1>';
  if (st.status === 'nokey') return h + `<div class="welcome"><h2>Connect Jellyfin</h2><p>Add your Jellyfin address and an API key in Settings and your shows, movies and live channels (including ErsatzTV) show up here. In Jellyfin: Dashboard › API Keys › add one named Hollywood Arcade.</p><div class="toolbar"><button class="btn primary" data-act="gsettings">Open Settings</button></div></div>`;
  if (st.status === 'loading' || st.status === 'idle') return h + '<p class="hint">Loading your library…</p>';
  if (st.status === 'error') return h + `<div class="empty">${esc(st.err)}</div><div class="toolbar"><button class="btn primary" data-act="watch-refresh">Try again</button><button class="btn" data-act="gsettings">Settings</button></div>`;
  if (!st.rows.length) return h + '<div class="empty">Jellyfin is connected, but there is nothing to show yet. Add a library in Jellyfin first.</div>';
  return `<div class="watch">${watchHero(st.hero)}` + st.rows.map(([t, kind, items], ri) => `<h2 class="row-title">${esc(t)}</h2><div class="wrail">${items.map((it, ci) => watchTile(it, kind, ri, ci)).join('')}</div>`).join('') + '</div>';
}

function watchOpen(id, isChan) {
  const it = { id: 'jf-' + id, name: 'Jellyfin', kind: 'url', target: jfItemUrl(id) };
  openAppInside(it).then((ok) => { if (!ok) api.launch(it); });
}
document.addEventListener('click', (e) => {
  const p = e.target.closest('[data-wplay]'); if (p) { watchOpen(p.dataset.wplay); return; }
  const t = e.target.closest('.wt'); if (t) { const r = watchState.rows[+t.dataset.wr]; const it = r && r[2][+t.dataset.wc]; if (it) watchOpen(it.Id, it.Type === 'TvChannel'); return; }
  if (e.target.closest('[data-act="watch-refresh"]')) { watchLoad(true); }
});
// the banner follows the tile you hover or focus on
const watchHover = (e) => {
  if (view !== 'watch') return; const t = e.target.closest && e.target.closest('.wt'); if (!t) return;
  const r = watchState.rows[+t.dataset.wr], it = r && r[2][+t.dataset.wc], hero = document.getElementById('whero');
  if (!it || !hero || hero.dataset.id === it.Id) return;
  hero.outerHTML = watchHero(it);
};
document.addEventListener('focusin', watchHover); document.addEventListener('mouseover', watchHover);
