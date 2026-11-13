// v45: profile picture or avatar for the small badges, profile screen tabs, each look keeps its own colours, and the "Change look" picker
(function () {
  'use strict';
  const BADGE = /\b(nav|dkav|nsav|x3pf)\b/;
  const badgePic = () => !!(S.settings && S.settings.badge === 'pic' && typeof curProfile === 'function' && curProfile());

  // ---- badge: avatar (default) or profile picture in the corner badges; the full-body avatar on Blades stays
  const _av = avatarSVG;
  avatarSVG = function (a, cls, head) {
    if (head === true && BADGE.test(cls || '') && badgePic()) return v21Avatar(null, 'bpic ' + cls);
    return _av.apply(this, arguments);
  };
  const _row = avatarRow;
  avatarRow = function () {
    const on = badgePic() || (S.settings.badge === 'pic');
    const chip = (v, l) => `<button class="chip ${(on ? 'pic' : 'av') === v ? 'on' : ''}" data-v45="badge" data-v="${v}">${l}</button>`;
    return _row() + `<div class="setting"><div><b>Corner badge</b><small>What shows in the corner of Blades, Tiles, Deck and Shelf: your avatar or your profile picture.</small></div><div class="ctl"><span class="avprev">${v21Avatar(null, 'pimg bpicp')}</span>${chip('av', 'Avatar')}${chip('pic', 'Picture')}<button class="btn" data-v45="pick">Choose picture</button></div></div>`;
  };

  // ---- every look keeps its own accent, background and glow, so switching never carries colours across
  const COLOR_KEYS = ['ac', 'acHex', 'bg', 'bgimg', 'glow', 'styleBg'];
  const ACC = { arcade: 0, og: 0, xmb: 2, x360: 4, x360n: 0, ps4: 1, nsw: 3 };   // default accent index per look
  const defaults = (k) => ({ ac: ACCENTS[ACC[k] || 0][1], bg: STYLE_BG[k] || '#0f0f0f', styleBg: STYLE_BG[k] ? 1 : undefined });
  const grab = (t) => { const o = {}; for (const c of COLOR_KEYS) if (t[c] !== undefined) o[c] = t[c]; return o; };
  const _set = setStyle;
  setStyle = function (k) {
    const t = (S.settings.theme = S.settings.theme || {}), st = (S.settings.styleTheme = S.settings.styleTheme || {}), old = uiStyle();
    if (k !== old) {
      st[old] = grab(t);
      const nx = st[k] || defaults(k);
      for (const c of COLOR_KEYS) delete t[c];
      Object.assign(t, nx);
      if (t.styleBg === undefined) delete t.styleBg;
      applyTheme();
    }
    return _set.apply(this, arguments);
  };

  // ---- Change look: one picker for all seven looks, usable with the controller
  const LOOKS = { arcade: 'Classic grid', og: 'Glowing orb menu', xmb: 'Flowing categories', x360: 'Side-by-side blades', x360n: 'Big live tiles', ps4: 'One row of tiles', nsw: 'A clean shelf' };
  window.v45Looks = function () {
    const st = S.settings.styleTheme || {}, cur = uiStyle();
    const card = ([k, n]) => {
      const th = k === cur ? (S.settings.theme || {}) : (st[k] || defaults(k)), ac = (th.ac && th.ac[0]) || (th.acHex) || ACCENTS[ACC[k] || 0][1][0];
      return `<button type="button" class="lookc${k === cur ? ' on' : ''}" data-v33="style" data-v="${k}"><i style="background:${th.bg || '#0f0f0f'}"><u style="background:${ac}"></u></i><b>${n}</b><small>${LOOKS[k]}</small></button>`;
    };
    v21show(`<h2>Change look</h2><p class="hint">Each look remembers its own colours.</p><div class="lookgrid">${UI_STYLES.map(card).join('')}</div>`, [{ label: 'Close' }], true);
  };
  document.addEventListener('click', (e) => {
    const c = e.target.closest('.lookc'); if (c && typeof v21dlg !== 'undefined' && v21dlg.open) v21dlg.close();
    if (e.target.closest('.x3pf, .nwho')) { view = 'profile'; render(); return; }
    const b = e.target.closest('[data-v45]'); if (!b) return;
    e.stopPropagation();
    if (b.dataset.v45 === 'ptab') { profTab = b.dataset.v; render(); }
    else if (b.dataset.v45 === 'pside') { profSide = b.dataset.v; render(); }
    else if (b.dataset.v45 === 'badge') { S.settings.badge = b.dataset.v === 'pic' ? 'pic' : 'av'; save(); render(); }
    else if (b.dataset.v45 === 'pick') { S.settings.badge = 'pic'; save(); v21pickPicture(); }
  }, true);
  // after the picture dialog closes, redraw so badges update
  if (typeof v21dlg !== 'undefined') v21dlg.addEventListener('close', () => { if (S.settings.badge === 'pic') { try { render(); } catch { /* ignore */ } } });
})();
