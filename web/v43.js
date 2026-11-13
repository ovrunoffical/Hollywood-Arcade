/* Hollywood Arcade 3.2: one size scale for the new interface styles.
   Tiles follow the window height, and their captions follow the tile width, so nothing is too big or too small. */
{
  const _at = applyTheme;
  const fit = () => {
    const st = (S.settings && S.settings.uiStyle) || 'arcade';
    const k = st === 'arcade' ? 1 : Math.max(.85, Math.min(2.2, innerHeight / 860));
    document.documentElement.style.setProperty('--fit', String(k));
    const t = (S.settings && S.settings.theme) || {};
    document.documentElement.style.setProperty('--tile', Math.round((TILE_PX[t.size] || 150) * k) + 'px');
  };
  applyTheme = function () { const r = _at.apply(this, arguments); try { fit(); } catch { /* sizing is cosmetic */ } return r; };
  let tm = 0;
  addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(() => { try { fit(); } catch { /* ignore */ } }, 80); });
}
