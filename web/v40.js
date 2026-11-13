// Hollywood Arcade 3.2: Settings → Controls (the cheat sheet that used to float in the corner).
function controlsRow() {
  const x = PADS.xbox, p = PADS.ps;
  const rows = [
    ['Move around', 'D-pad or left stick', 'D-pad or left stick', 'Arrow keys'],
    ['Open / select', x.x, p.x, 'Enter'],
    ['Back / close', x.o, p.o, 'Esc'],
    ['Menu for a game', x.o, p.o, 'Right-click'],
    ['Game info', x.sq, p.sq, '-'],
    ['Edit a game', x.tri, p.tri, 'E'],
    ['Previous / next section', x.l1 + ' / ' + x.r1, p.l1 + ' / ' + p.r1, '-'],
    ['Previous / next song', x.l2 + ' / ' + x.r2, p.l2 + ' / ' + p.r2, '-'],
    ['Play / pause music', x.menu, p.menu, '-'],
    ['Power menu', x.view, p.view, '-'],
    ['Volume mixer', x.r3, p.r3, '-'],
    ['Turn your avatar (editor)', x.l2 + ' / ' + x.r2 + ' or right stick', p.l2 + ' / ' + p.r2 + ' or right stick', 'Q / E or drag'],
    ['Search', '-', '-', '/'],
    ['Full screen', '-', '-', 'F11'],
  ];
  return '<div class="mixh">Controls</div><div class="ctlsheet"><div class="ctlh"><span></span><span>Xbox pad</span><span>PlayStation pad</span><span>Keyboard</span></div>' +
    rows.map(r => `<div class="ctlr"><b>${esc(r[0])}</b><span><kbd>${esc(r[1])}</kbd></span><span><kbd>${esc(r[2])}</kbd></span><span><kbd>${esc(r[3])}</kbd></span></div>`).join('') + '</div>';
}
{ const _s = v2Settings; v2Settings = function () { return _s.apply(this, arguments) + controlsRow(); }; }
