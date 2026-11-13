// Hollywood Arcade 3.2: your avatar. Drawn here (nothing borrowed), fully customisable, and it moves.
// Customise it in Settings → Avatar. It shows up in the Blades, Tiles and Deck styles.

const AV = {
  skin: ['#fbe3cf', '#f3cfa8', '#e5b088', '#cf9468', '#a8704a', '#7a4d32', '#5a3624', '#f4d6c4'],
  hair: ['#15100c', '#3b2417', '#6b4423', '#a8742c', '#d9b36a', '#b8442b', '#7a4bc4', '#2f7fd0', '#e6e6e6', '#e86aa0'],
  eyec: ['#3a2a1a', '#6a4220', '#2f6fb0', '#3a8a5a', '#7a8088', '#1c1c20'],
  top: ['#2f7fd0', '#4f8f2f', '#d0392f', '#e0a020', '#8a4bc4', '#2aa89a', '#e8e8e8', '#2a2e38', '#e0668c', '#6b4a2a', '#4a5a3a', '#c05a1a'],
  gfx: ['#f2d33a', '#ffffff', '#2a2e38', '#d0392f', '#4fd0e0'],
  bottom: ['#31445c', '#23262e', '#b59a6a', '#3f7a45', '#6b7078', '#a03a35', '#e0e0e0', '#2f6fb0'],
  shoe: ['#f2f2f2', '#7a4a2a', '#2a2a2e', '#c0392b', '#2f7fd0', '#e0c030'],
  hat: ['#c0392b', '#2a2a2e', '#2f7fd0', '#e8e8e8', '#4f8f2f', '#8a5a2a', '#e0a020', '#8a4bc4'],
  glass: ['#222222', '#6b4a2a', '#c0a050', '#b03a3a', '#2f7fd0'],
};
const AV_LISTS = {
  style: [['sidepart', 'Side part'], ['short', 'Short'], ['quiff', 'Flat top'], ['mop', 'Shaggy'], ['buzz', 'Buzz'], ['long', 'Long'], ['curly', 'Curly'], ['bun', 'Bun'], ['none', 'Bald']],
  hat: [['none', 'None'], ['cap', 'Cap'], ['beanie', 'Beanie'], ['fedora', 'Fedora'], ['tophat', 'Top hat'], ['cowboy', 'Cowboy']],
  eyes: [['round', 'Round'], ['narrow', 'Narrow'], ['sleepy', 'Sleepy'], ['happy', 'Happy']],
  brows: [['thin', 'Thin'], ['normal', 'Normal'], ['bold', 'Bold']],
  nose: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']],
  mouth: [['smile', 'Smile'], ['grin', 'Grin'], ['smirk', 'Smirk'], ['neutral', 'Neutral'], ['open', 'Laugh']],
  beard: [['none', 'Clean'], ['stubble', 'Stubble'], ['moustache', 'Moustache'], ['goatee', 'Goatee'], ['full', 'Full beard']],
  glasses: [['none', 'None'], ['round', 'Round'], ['square', 'Square'], ['shades', 'Shades']],
  ears: [['small', 'Small'], ['normal', 'Normal'], ['big', 'Big']],
  build: [['slim', 'Slim'], ['average', 'Average'], ['broad', 'Broad']],
  height: [['short', 'Short'], ['average', 'Average'], ['tall', 'Tall']],
  tops: [['tee', 'T-shirt'], ['long', 'Long sleeve'], ['hoodie', 'Hoodie'], ['jacket', 'Jacket'], ['collar', 'Collared']],
  gfx: [['none', 'Plain'], ['logo', 'Logo'], ['stripe', 'Stripe'], ['chevron', 'Chevron']],
  bottoms: [['jeans', 'Jeans'], ['flared', 'Flared'], ['chinos', 'Chinos'], ['shorts', 'Shorts']],
  shoes: [['sneakers', 'Sneakers'], ['boots', 'Boots'], ['flats', 'Shoes']],
};
const AV_DEFAULT = { skin: AV.skin[1], hair: AV.hair[1], style: 'sidepart', hat: 'none', hatc: AV.hat[0], eyes: 'round', eyec: AV.eyec[0], brows: 'normal', nose: 'medium', mouth: 'smile', beard: 'none', glasses: 'none', glc: AV.glass[0], ears: 'normal', build: 'average', height: 'average', top: 'jacket', shirt: AV.top[10], gfx: 'none', gc: AV.gfx[0], bottom: 'jeans', pants: AV.bottom[0], shoes: 'sneakers', shoec: AV.shoe[0] };

function avatarOf() {
  const o = (S.settings && S.settings.avatar) || {}, a = Object.assign({}, AV_DEFAULT, o);
  // pictures saved by the first version of the editor
  if (o.face === 'grin' && !o.mouth) a.mouth = 'grin'; if (o.face === 'happy' && !o.eyes) a.eyes = 'happy'; if (o.face === 'cool' && !o.glasses) a.glasses = 'shades';
  if (o.style === 'cap' && !o.hat) { a.hat = 'cap'; a.hatc = o.shirt || a.hatc; a.style = 'short'; }
  if (!AV_LISTS.style.some(x => x[0] === a.style)) a.style = 'short';
  if (o.top === 'tee' || o.top === 'hoodie' || o.top === 'jacket') a.top = o.top;
  return a;
}

// ---------------- drawing ----------------
let avUid = 0;
const _hex = (h) => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
const avMix = (h, o, p) => { const a = _hex(h), b = _hex(o); return '#' + a.map((x, i) => Math.round(x + (b[i] - x) * p).toString(16).padStart(2, '0')).join(''); };
const avLight = (h, p) => avMix(h, '#ffffff', p), avDark = (h, p) => avMix(h, '#000000', p);

function avatarSVG(a, cls, head) {
  a = a || avatarOf();
  const u = 'a' + (++avUid), sk = a.skin, hc = a.hair, tc = a.shirt, bc = a.pants;
  const grad = (id, c1, c2, r) => r ? `<radialGradient id="${u}${id}" cx=".36" cy=".3" r=".9"><stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${avMix(c1, c2, .4)}"/><stop offset="1" stop-color="${c2}"/></radialGradient>` : `<linearGradient id="${u}${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
  const defs = `<defs>${grad('s', avLight(sk, .3), avDark(sk, .22), 1)}${grad('t', avLight(tc, .2), avDark(tc, .28))}${grad('p', avLight(bc, .14), avDark(bc, .38))}${grad('h', avLight(hc, .3), avDark(hc, .3), 1)}${grad('x', avLight(a.hatc, .2), avDark(a.hatc, .3))}${grad('o', avLight(a.shoec, .2), avDark(a.shoec, .25))}</defs>`;
  const S = `url(#${u}s)`, T = `url(#${u}t)`, P = `url(#${u}p)`, Hh = `url(#${u}h)`, X = `url(#${u}x)`, O = `url(#${u}o)`;
  const shirtW = '#e8ecf2';
  const hasHat = a.hat !== 'none';

  // ---- hair ----
  const hairBack = ({ long: `<path d="M60 84 C52 140 58 158 72 162 L128 162 C142 158 148 140 140 84 Z" fill="${Hh}"/>`, bun: `<circle cx="100" cy="34" r="15" fill="${Hh}"/>`,
    curly: [[58, 70], [62, 98], [142, 70], [138, 98], [100, 38]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${Hh}"/>`).join(''),
    mop: `<path d="M58 70 C50 100 56 116 66 118 L134 118 C144 116 150 100 142 70 Z" fill="${Hh}"/>` })[a.style] || '';
  const hairFront = hasHat && (a.hat === 'beanie') ? '' : ({
    short: `<path d="M62 82 C57 34 143 34 138 82 C133 62 120 53 100 54 C80 53 67 62 62 82Z" fill="${Hh}"/>`,
    sidepart: `<path d="M60 80 C56 30 146 28 140 78 C137 60 128 46 108 46 C88 46 70 54 62 80Z" fill="${Hh}"/><path d="M94 46 Q88 55 80 60" stroke="${avDark(hc, .4)}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    quiff: `<path d="M62 78 C57 40 62 28 100 26 C138 28 143 40 138 78 C134 58 126 52 100 52 C74 52 66 58 62 78Z" fill="${Hh}"/>`,
    buzz: `<path d="M62 80 C58 38 142 38 138 80 C134 66 120 59 100 59 C80 59 66 66 62 80Z" fill="${Hh}" opacity=".9"/>`,
    mop: `<path d="M60 82 C56 28 144 28 140 82 C138 64 130 52 100 52 C70 52 62 64 60 82Z" fill="${Hh}"/><path d="M64 66 Q82 50 100 58 Q120 48 136 66 Q120 70 100 64 Q80 70 64 66Z" fill="${Hh}"/>`,
    long: `<path d="M62 84 C56 30 144 30 138 84 C134 64 122 54 100 55 C78 54 66 64 62 84Z" fill="${Hh}"/>`,
    curly: [[70, 52], [86, 42], [104, 40], [120, 44], [132, 56], [64, 68], [138, 68], [100, 52]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${Hh}"/>`).join(''),
    bun: `<path d="M62 82 C57 34 143 34 138 82 C133 62 120 53 100 54 C80 53 67 62 62 82Z" fill="${Hh}"/>`, none: '' })[a.style] || '';

  // ---- headwear ----
  const hat = ({
    cap: `<path d="M60 72 C58 26 142 26 140 72 Z" fill="${X}"/><path d="M62 70 L156 70 Q170 72 170 80 Q130 82 62 76 Z" fill="${avDark(a.hatc, .32)}"/><circle cx="100" cy="52" r="9" fill="rgba(255,255,255,.88)"/><path d="M95 47 v10 M105 47 v10 M95 52 h10" stroke="${avDark(a.hatc, .35)}" stroke-width="2.6" stroke-linecap="round"/>`,
    beanie: `<path d="M58 74 C54 20 146 20 142 74 Q100 66 58 74Z" fill="${X}"/><path d="M56 66 Q100 56 144 66 L144 80 Q100 70 56 80 Z" fill="${avDark(a.hatc, .22)}"/><path d="M62 70 Q100 60 138 70" stroke="rgba(255,255,255,.25)" stroke-width="2" fill="none"/>`,
    fedora: `<ellipse cx="100" cy="66" rx="58" ry="12" fill="${avDark(a.hatc, .2)}"/><path d="M68 66 C64 30 136 30 132 66 Q100 74 68 66Z" fill="${X}"/><path d="M68 62 Q100 70 132 62 L132 56 Q100 64 68 56Z" fill="${avDark(a.hatc, .4)}"/>`,
    tophat: `<ellipse cx="100" cy="66" rx="50" ry="10" fill="${avDark(a.hatc, .25)}"/><rect x="70" y="8" width="60" height="58" rx="5" fill="${X}"/><rect x="70" y="50" width="60" height="9" fill="${avDark(a.hatc, .45)}"/><ellipse cx="100" cy="9" rx="30" ry="4" fill="${avLight(a.hatc, .1)}"/>`,
    cowboy: `<path d="M30 66 Q64 86 100 78 Q136 86 170 66 Q154 64 140 50 Q100 68 60 50 Q46 64 30 66Z" fill="${avDark(a.hatc, .15)}"/><path d="M68 58 C64 24 136 24 132 58 Q100 50 68 58Z" fill="${X}"/><path d="M68 56 Q100 66 132 56 L132 51 Q100 60 68 51Z" fill="${avDark(a.hatc, .4)}"/>`,
    none: '' })[a.hat] || '';

  // ---- face parts ----
  const eyeR = a.ears === 'big' ? 12 : a.ears === 'small' ? 7 : 9.5;
  const bw = { thin: 2.2, normal: 3.4, bold: 5 }[a.brows] || 3.4, bcol = avDark(hc, .08);
  const brows = a.eyes === 'happy' && false ? '' : `<path d="M72 75 Q83 69 94 74 M106 74 Q117 69 128 75" fill="none" stroke="${bcol}" stroke-width="${bw}" stroke-linecap="round"/>`;
  const eye = (x) => a.eyes === 'happy' ? `<path d="M${x - 10} 90 Q${x} 78 ${x + 10} 90" fill="none" stroke="#2a1a12" stroke-width="3.6" stroke-linecap="round"/>`
    : `<ellipse cx="${x}" cy="88" rx="${a.eyes === 'narrow' ? 9 : 8}" ry="${a.eyes === 'narrow' ? 4.6 : a.eyes === 'sleepy' ? 5.4 : 6.6}" fill="#fff"/><circle cx="${x + 0.5}" cy="88.4" r="${a.eyes === 'narrow' ? 3.6 : 4.4}" fill="${a.eyec}"/><circle cx="${x + 0.5}" cy="88.4" r="2" fill="#10080a"/><circle cx="${x + 2}" cy="86.4" r="1.4" fill="#fff"/>` + (a.eyes === 'sleepy' ? `<path d="M${x - 9} 88 Q${x} 78 ${x + 9} 88 L${x + 9} 80 L${x - 9} 80Z" fill="${S}"/><path d="M${x - 9} 88 Q${x} 82 ${x + 9} 88" fill="none" stroke="${avDark(sk, .4)}" stroke-width="1.6"/>` : '');
  const eyes = `<g class="av-eyes">${eye(83)}${eye(117)}</g>`;
  const nsc = { small: .8, medium: 1, large: 1.28 }[a.nose] || 1;
  const nose = `<g transform="translate(100 100) scale(${nsc}) translate(-100 -100)"><path d="M100 88 Q95 100 91 104 Q100 109 109 104 Q105 100 100 88Z" fill="${avDark(sk, .16)}" opacity=".5"/><path d="M92 104 Q100 110 108 104" fill="none" stroke="${avDark(sk, .3)}" stroke-width="1.8" stroke-linecap="round"/></g>`;
  const lip = a.beard === 'full' || a.beard === 'goatee' ? '#f1cfc2' : '#3a2016';
  const mouth = ({ smile: `<path d="M86 108 Q100 120 114 108" fill="none" stroke="${lip}" stroke-width="3" stroke-linecap="round"/>`,
    grin: `<path d="M84 107 Q100 126 116 107 Z" fill="#fff" stroke="${lip}" stroke-width="2.4" stroke-linejoin="round"/><path d="M90 114 Q100 124 110 114Z" fill="#c0504a"/>`,
    smirk: `<path d="M88 111 Q102 114 114 105" fill="none" stroke="${lip}" stroke-width="3" stroke-linecap="round"/>`,
    neutral: `<path d="M90 112 H110" fill="none" stroke="${lip}" stroke-width="3" stroke-linecap="round"/>`,
    open: `<path d="M84 106 Q100 132 116 106 Z" fill="#5a1a22" stroke="${lip}" stroke-width="2.2" stroke-linejoin="round"/><path d="M88 106 H112 L110 111 H90Z" fill="#fff"/>` })[a.mouth] || '';
  const bcolr = avDark(hc, .05);
  const beard = ({ stubble: `<path d="M64 98 Q68 132 100 132 Q132 132 136 98 Q124 116 100 116 Q76 116 64 98Z" fill="${bcolr}" opacity=".28"/>`,
    moustache: `<path d="M80 106 Q90 98 100 103 Q110 98 120 106 Q110 112 100 108 Q90 112 80 106Z" fill="${bcolr}"/>`,
    goatee: `<path d="M80 106 Q90 98 100 103 Q110 98 120 106 Q110 112 100 108 Q90 112 80 106Z" fill="${bcolr}"/><path d="M89 118 Q100 114 111 118 Q112 130 100 132 Q88 130 89 118Z" fill="${bcolr}"/>`,
    full: `<path d="M61 92 Q58 138 100 138 Q142 138 139 92 Q132 114 118 108 Q100 114 82 108 Q68 114 61 92Z" fill="${bcolr}"/>` })[a.beard] || '';
  const glasses = ({ round: `<g fill="rgba(180,220,255,.12)" stroke="${a.glc}" stroke-width="2.8"><circle cx="83" cy="88" r="12.5"/><circle cx="117" cy="88" r="12.5"/></g><path d="M95.5 87 Q100 83 104.5 87" fill="none" stroke="${a.glc}" stroke-width="2.6"/><path d="M70.5 87 L61 88 M129.5 87 L139 88" stroke="${a.glc}" stroke-width="2.4"/>`,
    square: `<g fill="rgba(180,220,255,.12)" stroke="${a.glc}" stroke-width="3"><rect x="69" y="79" width="28" height="19" rx="5"/><rect x="103" y="79" width="28" height="19" rx="5"/></g><path d="M97 85 H103" stroke="${a.glc}" stroke-width="3"/><path d="M69 85 L61 87 M131 85 L139 87" stroke="${a.glc}" stroke-width="2.4"/>`,
    shades: `<rect x="68" y="79" width="30" height="19" rx="7" fill="#111418"/><rect x="102" y="79" width="30" height="19" rx="7" fill="#111418"/><path d="M98 84 H102" stroke="#111418" stroke-width="3"/><path d="M68 84 L61 86 M132 84 L139 86" stroke="#111418" stroke-width="2.6"/><path d="M73 83 L80 83 M107 83 L114 83" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-linecap="round"/>` })[a.glasses] || '';

  const headSvg = `<g class="av-head">${hairBack}
    <circle cx="61" cy="91" r="${eyeR}" fill="${S}"/><circle cx="139" cy="91" r="${eyeR}" fill="${S}"/>
    <ellipse cx="100" cy="84" rx="39" ry="43" fill="${S}"/>${beard}${nose}${mouth}${brows}${eyes}
    <ellipse cx="75" cy="101" rx="7" ry="4.2" fill="#e86a5a" opacity=".2"/><ellipse cx="125" cy="101" rx="7" ry="4.2" fill="#e86a5a" opacity=".2"/>
    ${glasses}${hairFront}${hat}</g>`;

  // ---- body ----
  const long = a.top === 'long' || a.top === 'hoodie' || a.top === 'jacket' || a.top === 'collar';
  const sleeveOf = (c, d, w) => `<path d="${d}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
  const topCol = a.top === 'jacket' ? T : T;
  const arm = (side) => {   // side -1 left, +1 right
    const sx = 100 + side * 36, ex = 100 + side * 44, hx = 100 + side * 46;
    const upperSleeve = sleeveOf(topCol, `M${sx} 152 L${ex} ${long ? 188 : 176}`, 20);
    const foreSleeve = long ? sleeveOf(topCol, `M${ex} 190 L${hx - side * 1} 218`, 18) + sleeveOf(avDark(tc, .2), `M${hx - side * 1} 214 L${hx} 221`, 18) : '';
    return `<g class="av-${side < 0 ? 'l' : 'r'}arm"><g class="av-${side < 0 ? 'l' : 'r'}fore"><path d="M${ex} 188 L${hx} 224" stroke="${S}" stroke-width="14" stroke-linecap="round" fill="none"/><ellipse cx="${hx}" cy="232" rx="8.5" ry="11.5" fill="${S}"/><ellipse cx="${hx - side * 8}" cy="228" rx="3.6" ry="7" fill="${S}" transform="rotate(${side * -14} ${hx - side * 8} 228)"/>${foreSleeve}</g><path d="M${sx} 152 L${ex} 190" stroke="${S}" stroke-width="14" stroke-linecap="round" fill="none"/>${upperSleeve}</g>`;
  };
  const gx = { none: '', logo: `<circle cx="100" cy="176" r="13" fill="none" stroke="${a.gc}" stroke-width="3"/><path d="M94 170 v12 M106 170 v12 M94 176 h12" stroke="${a.gc}" stroke-width="3" stroke-linecap="round"/>`, stripe: `<rect x="58" y="172" width="84" height="12" fill="${a.gc}" opacity=".95"/>`, chevron: `<path d="M84 190 L100 160 L116 190 L108 190 L100 175 L92 190Z" fill="${a.gc}"/>` }[a.gfx] || '';
  const sh = { slim: 0, average: 4, broad: 9 }[a.build] || 4;
  const torsoPath = `M${62 - sh} 154 Q${62 - sh} 136 82 136 L118 136 Q${138 + sh} 136 ${138 + sh} 154 L${142 + sh} 222 Q${142 + sh} 230 132 230 L68 230 Q${58 - sh} 230 ${58 - sh} 222 Z`;
  let torso = `<path d="${torsoPath}" fill="${a.top === 'jacket' ? shirtW : T}"/>`;
  if (a.top === 'jacket') torso += `<path d="M${62 - sh} 154 Q${62 - sh} 136 82 136 L92 136 L96 230 L68 230 Q${58 - sh} 230 ${58 - sh} 222 Z" fill="${T}"/><path d="M${138 + sh} 154 Q${138 + sh} 136 118 136 L108 136 L104 230 L132 230 Q${142 + sh} 230 ${142 + sh} 222 Z" fill="${T}"/><path d="M86 136 L100 150 L114 136 L110 132 L100 142 L90 132Z" fill="#f8f9fb"/><path d="M90 138 L100 162 L110 138" fill="none" stroke="${avDark(tc, .35)}" stroke-width="2.2"/><path d="M96 150 v70 M104 150 v70" stroke="#c7ccd6" stroke-width="1" opacity=".7"/>`;
  else if (a.top === 'collar') torso += `<path d="M84 136 L100 156 L116 136 L110 132 L100 144 L90 132Z" fill="${avLight(tc, .5)}"/><path d="M100 156 v70" stroke="${avDark(tc, .25)}" stroke-width="1.6"/>${[168, 188, 208].map(y => `<circle cx="100" cy="${y}" r="1.8" fill="${avDark(tc, .4)}"/>`).join('')}`;
  else if (a.top === 'hoodie') torso += `<path d="M80 138 Q100 164 120 138 L114 133 Q100 150 86 133Z" fill="${avDark(tc, .28)}"/><path d="M94 150 V176 M106 150 V176" stroke="#f0f0f0" stroke-width="2.4" stroke-linecap="round"/><path d="M78 204 Q100 214 122 204 L128 226 L72 226Z" fill="${avDark(tc, .16)}"/>`;
  else torso += `<path d="M84 136 Q100 152 116 136 L110 132 Q100 144 90 132Z" fill="${avDark(tc, .28)}"/>`;
  if (a.top !== 'jacket' && a.top !== 'collar') torso += gx;
  const hem = a.top === 'hoodie' || a.top === 'jacket' ? '' : '';

  // ---- legs ----
  const bot = a.bottom, short = bot === 'shorts';
  const wL = bot === 'flared' ? 36 : bot === 'chinos' ? 28 : 30;
  const legs = (side) => {
    const x0 = side < 0 ? 66 : 104, x1 = side < 0 ? 96 : 134, cx = side < 0 ? 81 : 119, fx = side < 0 ? 62 : 138;
    const bottomY = short ? 262 : 304, hx0 = side < 0 ? x0 - (bot === 'flared' ? 5 : 0) : x0, hx1 = side < 0 ? x1 : x1 + (bot === 'flared' ? 5 : 0);
    const pant = `<path d="M${x0} 222 L${x1} 222 L${hx1 - (short ? 1 : 0)} ${bottomY} L${hx0 + (short ? 1 : 0)} ${bottomY} Z" fill="${P}"/>` + (!short ? `<path d="M${hx0 + 1} ${bottomY - 6} H${hx1 - 1}" stroke="${avDark(bc, .45)}" stroke-width="2"/>` : '');
    const skinLeg = short ? `<rect x="${cx - 7.5}" y="258" width="15" height="40" rx="6" fill="${S}"/><path d="M${cx - 8} 288 H${cx + 8} V300 H${cx - 8}Z" fill="#eee"/>` : '';
    const shoe = a.shoes === 'boots' ? `<path d="M${cx - 15} 280 H${cx + 15} L${cx + 15} 306 Q${cx + 22 * side} 308 ${cx + 24 * side} 316 H${cx - 20} Q${cx - 18} 306 ${cx - 15} 296Z" fill="${O}"/><path d="M${cx - 17} 314 H${cx + 24 * side}" stroke="${avDark(a.shoec, .5)}" stroke-width="3"/>`
      : a.shoes === 'flats' ? `<path d="M${cx - 16} 298 H${cx + 14} Q${cx + 28 * side} 302 ${cx + 26 * side} 314 H${cx - 18} Q${cx - 18} 304 ${cx - 16} 298Z" fill="${O}"/>`
      : `<path d="M${cx - 16} 296 H${cx + 14} Q${cx + 30 * side} 300 ${cx + 28 * side} 313 Q${cx + 28 * side} 318 ${cx + 20 * side} 318 H${cx - 18} Q${cx - 20} 304 ${cx - 16} 296Z" fill="${O}"/><path d="M${cx - 19} 316 H${cx + 26 * side}" stroke="#d8d8dc" stroke-width="4" stroke-linecap="round"/><path d="M${cx - 8} 300 H${cx + 6} M${cx - 8} 305 H${cx + 6}" stroke="rgba(0,0,0,.25)" stroke-width="1.6"/>`;
    return pant + skinLeg + shoe;
  };
  const hs = { short: .93, average: 1, tall: 1.07 }[a.height] || 1;
  const body = `<ellipse cx="100" cy="320" rx="56" ry="7" fill="rgba(0,0,0,.25)"/>
    <g class="av-fig" transform="translate(100 320) scale(1 ${hs}) translate(-100 -320)"><g class="av-sway"><g class="av-legs">${legs(-1)}${legs(1)}</g>
      <g class="av-body">${arm(-1)}${torso}<rect x="90" y="118" width="20" height="22" rx="6" fill="${S}"/>${arm(1)}</g>
      ${headSvg}</g></g>`;
  const vb = head ? '40 26 120 120' : '0 0 200 340';
  return `<svg class="av ${cls || ''}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}${head ? headSvg : body}</svg>`;
}

// every avatar on screen does a little something every few seconds: wave, dance, look around
(function avLife() {
  const seq = ['wave', 'idle', 'dance', 'idle', 'look', 'idle'];
  let n = 0;
  setInterval(() => {
    const list = document.querySelectorAll('svg.av:not(.avh)'); if (!list.length) return;
    const e = seq[n++ % seq.length];
    list.forEach(s => { s.dataset.emote = e; });
  }, 3200);
})();

// ---------------- editor ----------------
const AV_CATS = [
  ['hair', 'Hairstyles', [['list', 'style', 'Style'], ['sw', 'hair', 'Hair colour', AV.hair]]],
  ['hat', 'Headwear', [['list', 'hat', 'Hat'], ['sw', 'hatc', 'Hat colour', AV.hat]]],
  ['eyes', 'Eyes & brows', [['list', 'eyes', 'Eyes'], ['sw', 'eyec', 'Eye colour', AV.eyec], ['list', 'brows', 'Eyebrows']]],
  ['nose', 'Nose', [['list', 'nose', 'Size']]],
  ['mouth', 'Mouth & chin', [['list', 'mouth', 'Mouth'], ['list', 'beard', 'Facial hair']]],
  ['glasses', 'Glasses', [['list', 'glasses', 'Style'], ['sw', 'glc', 'Colour', AV.glass]]],
  ['ears', 'Ears', [['list', 'ears', 'Size']]],
  ['skin', 'Skin', [['sw', 'skin', 'Tone', AV.skin]]],
  ['body', 'Body size', [['list', 'build', 'Build'], ['list', 'height', 'Height']]],
  ['top', 'Tops', [['list', 'top', 'Top', 'tops'], ['sw', 'shirt', 'Colour', AV.top], ['list', 'gfx', 'Print'], ['sw', 'gc', 'Print colour', AV.gfx]]],
  ['bottom', 'Bottoms', [['list', 'bottom', 'Style', 'bottoms'], ['sw', 'pants', 'Colour', AV.bottom]]],
  ['shoes', 'Shoes', [['list', 'shoes', 'Style'], ['sw', 'shoec', 'Colour', AV.shoe]]],
];
let avCat = 'hair';
function avPanel() {
  const a = avatarOf(), cat = AV_CATS.find(c => c[0] === avCat) || AV_CATS[0];
  return cat[2].map(([kind, key, label, extra]) => kind === 'sw'
    ? `<div class="avr"><b>${label}</b><div class="avsws">${extra.map(c => `<button type="button" class="avsw${a[key] === c ? ' on' : ''}" data-av="${key}" data-val="${c}" style="background:${c}" aria-label="${label}"></button>`).join('')}</div></div>`
    : `<div class="avr"><b>${label}</b><div class="avopts">${AV_LISTS[typeof extra === 'string' ? extra : key].map(([k, n]) => `<button type="button" class="avo${a[key] === k ? ' on' : ''}" data-av="${key}" data-val="${k}">${n}</button>`).join('')}</div></div>`).join('');
}
function avEditor(keep) {
  let d = document.getElementById('avdlg');
  if (!d) { d = document.createElement('dialog'); d.id = 'avdlg'; d.className = 'avdlg'; document.body.appendChild(d); d.addEventListener('close', () => { render(); }); }
  d.innerHTML = `<div class="avhd">My features</div>
    <div class="avcats">${AV_CATS.map(([id, n]) => `<button type="button" class="avcat${id === avCat ? ' on' : ''}" data-avcat="${id}"><span>${n}</span></button>`).join('')}</div>
    <div class="avstage">${avatarSVG(avatarOf(), 'avbig')}</div>
    <div class="avpanel"><h3>${(AV_CATS.find(c => c[0] === avCat) || AV_CATS[0])[1]}</h3>${avPanel()}</div>
    <div class="avbar"><button type="button" class="btn" data-avact="random">Random</button><button type="button" class="btn" data-avact="reset">Reset</button><button type="button" class="btn primary" data-avact="done">Done</button><span class="avhint"><i>LT</i><i>RT</i> Turn <i>A</i> Select <i>B</i> Back</span></div>`;
  if (!d.open) d.showModal();
  if (keep) { const k = d.querySelector(keep); if (k) k.focus(); } else (d.querySelector('.avcat.on') || d.querySelector('button')).focus();
}
function avRandom() {
  const r = (l) => l[Math.floor(Math.random() * l.length)], rk = (l) => r(l)[0];
  S.settings.avatar = { skin: r(AV.skin), hair: r(AV.hair), style: rk(AV_LISTS.style), hat: Math.random() < .3 ? rk(AV_LISTS.hat) : 'none', hatc: r(AV.hat), eyes: rk(AV_LISTS.eyes), eyec: r(AV.eyec), brows: rk(AV_LISTS.brows), nose: rk(AV_LISTS.nose), mouth: rk(AV_LISTS.mouth), beard: Math.random() < .4 ? rk(AV_LISTS.beard) : 'none', glasses: Math.random() < .3 ? rk(AV_LISTS.glasses) : 'none', glc: r(AV.glass), ears: rk(AV_LISTS.ears), build: rk(AV_LISTS.build), height: rk(AV_LISTS.height), top: rk(AV_LISTS.tops), shirt: r(AV.top), gfx: rk(AV_LISTS.gfx), gc: r(AV.gfx), bottom: rk(AV_LISTS.bottoms), pants: r(AV.bottom), shoes: rk(AV_LISTS.shoes), shoec: r(AV.shoe) };
}
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-v36="avatar"]'); if (open) { e.stopPropagation(); avEditor(); return; }
  const d = document.getElementById('avdlg'); if (!d || !d.open || !d.contains(e.target)) return;
  const c = e.target.closest('[data-avcat]'), o = e.target.closest('[data-av]'), x = e.target.closest('[data-avact]');
  if (c) { e.stopPropagation(); avCat = c.dataset.avcat; avEditor(`[data-avcat="${avCat}"]`); }
  else if (o) { e.stopPropagation(); S.settings.avatar = Object.assign(avatarOf(), { [o.dataset.av]: o.dataset.val }); save(); avEditor(`[data-av="${o.dataset.av}"][data-val="${o.dataset.val}"]`); }
  else if (x) { e.stopPropagation(); if (x.dataset.avact === 'done') d.close(); else { if (x.dataset.avact === 'random') avRandom(); else delete S.settings.avatar; save(); avEditor(`[data-avact="${x.dataset.avact}"]`); } }
}, true);

function avatarRow() {
  return `<div class="mixh">Avatar</div><div class="setting"><div><b>Your avatar</b><small>Shown in the Blades, Tiles and Deck styles. Change anything about it.</small></div><div class="ctl"><span class="avprev">${avatarSVG(null, 'avh', true)}</span><button class="btn" data-v36="avatar">Customise</button></div></div>`;
}
{ const _s = v2Settings; v2Settings = function () { return avatarRow() + _s.apply(this, arguments); }; }
