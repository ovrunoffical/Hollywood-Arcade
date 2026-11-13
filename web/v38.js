// Hollywood Arcade 3.2: the avatar in real 3D.
// A tiny WebGL renderer (no libraries, no model files): the figure is built from shaded shapes in code,
// lit from the front with a soft rim light, and animated. If WebGL isn't available the flat version from v37.js is used.
// In the editor: LT / RT, the right stick, Q / E or dragging turns him around.

const AV3 = (() => {
  let gl = null, cv = null;
  try {
    cv = document.createElement('canvas'); cv.width = cv.height = 64;
    gl = cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
  } catch { gl = null; }
  if (!gl) return null;

  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, `attribute vec3 aP; attribute vec3 aN; attribute vec2 aU;
      uniform mat4 uVP, uM; uniform mat3 uNM; varying vec3 vN, vW; varying vec2 vU;
      void main(){ vec4 w = uM * vec4(aP, 1.0); vW = w.xyz; vN = uNM * aN; vU = aU; gl_Position = uVP * w; }`));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision mediump float;
      uniform vec3 uC, uCam; uniform float uTex, uFlat, uA; uniform sampler2D uT; varying vec3 vN, vW; varying vec2 vU;
      void main(){
        vec3 base = uTex > .5 ? texture2D(uT, vU).rgb : uC;
        if (uFlat > .5) { gl_FragColor = vec4(base * uA, uA); return; }
        vec3 n = normalize(vN), l = normalize(vec3(-.4, .75, .85)), v = normalize(uCam - vW);
        float d = dot(n, l);
        float lit = smoothstep(-.3, .6, d);
        vec3 col = mix(base * vec3(.5, .52, .62), base * 1.1, lit);
        col *= .84 + .2 * (.5 + .5 * n.y);
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        col += rim * .22 * (.4 + .6 * lit) * vec3(1.0, 1.0, 1.0);
        col += pow(max(dot(n, normalize(l + v)), 0.0), 36.0) * .22 * lit;
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
  } catch { return null; }
  gl.useProgram(prog);
  const loc = (n) => gl.getUniformLocation(prog, n), U = { vp: loc('uVP'), m: loc('uM'), nm: loc('uNM'), c: loc('uC'), cam: loc('uCam'), tex: loc('uTex'), flat: loc('uFlat'), a: loc('uA'), t: loc('uT') };
  const AP = gl.getAttribLocation(prog, 'aP'), AN = gl.getAttribLocation(prog, 'aN'), AU = gl.getAttribLocation(prog, 'aU');
  gl.enable(gl.DEPTH_TEST); gl.uniform1i(U.t, 0);

  // ---- meshes ----
  const mesh = (P, N, UV, I) => {
    const b = (d, t) => { const x = gl.createBuffer(); gl.bindBuffer(t, x); gl.bufferData(t, d, gl.STATIC_DRAW); return x; };
    return { p: b(new Float32Array(P), gl.ARRAY_BUFFER), n: b(new Float32Array(N), gl.ARRAY_BUFFER), u: b(new Float32Array(UV), gl.ARRAY_BUFFER), i: b(new Uint16Array(I), gl.ELEMENT_ARRAY_BUFFER), c: I.length };
  };
  const grid = (rows, cols, fn) => {
    const P = [], N = [], UV = [], I = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) { const o = fn(r / rows, c / cols); P.push(...o[0]); N.push(...o[1]); UV.push(...o[2]); }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const a = r * (cols + 1) + c, b = a + cols + 1; I.push(a, a + 1, b, a + 1, b + 1, b); }
    return mesh(P, N, UV, I);
  };
  const sphereCache = {};
  const sphere = (tm) => { tm = tm || Math.PI; return sphereCache[tm] || (sphereCache[tm] = grid(20, 32, (v, u) => {
    const th = tm * v, ph = Math.PI * 2 * u, p = [-Math.sin(th) * Math.sin(ph), Math.cos(th), -Math.sin(th) * Math.cos(ph)];
    return [p, p, [u, th / Math.PI]]; })); };
  const cyl = (() => {
    const P = [], N = [], UV = [], I = [], seg = 32;
    const side = grid(1, seg, (v, u) => { const a = u * Math.PI * 2, x = Math.sin(a), z = Math.cos(a); return [[x, .5 - v, z], [x, 0, z], [u, v]]; });
    // build caps and side in one mesh by hand
    for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2, x = Math.sin(a), z = Math.cos(a); P.push(x, .5, z, x, -.5, z); N.push(x, 0, z, x, 0, z); UV.push(j / seg, 0, j / seg, 1); }
    for (let j = 0; j < seg; j++) { const a = j * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    for (const [y, ny] of [[.5, 1], [-.5, -1]]) {
      const base = P.length / 3; P.push(0, y, 0); N.push(0, ny, 0); UV.push(.5, .5);
      for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; P.push(Math.sin(a), y, Math.cos(a)); N.push(0, ny, 0); UV.push(.5, .5); }
      for (let j = 0; j < seg; j++) ny > 0 ? I.push(base, base + j + 2, base + j + 1) : I.push(base, base + j + 1, base + j + 2);
    }
    return mesh(P, N, UV, I);
  })();
  const torusCache = {};
  const torus = (r) => torusCache[r] || (torusCache[r] = grid(14, 36, (v, u) => {
    const a = u * Math.PI * 2, b = v * Math.PI * 2, rr = 1 + r * Math.cos(b);
    return [[rr * Math.cos(a), rr * Math.sin(a), r * Math.sin(b)], [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)], [u, v]]; }));

  // ---- matrices (column-major) ----
  const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const T = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  const Sc = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
  const Rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
  const Ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
  const Rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
  const persp = (f, asp, n, fr) => { const t = 1 / Math.tan(f / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, 2 * fr * n / (n - fr), 0]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nmat = (m) => { const c0 = [m[0], m[1], m[2]], c1 = [m[4], m[5], m[6]], c2 = [m[8], m[9], m[10]]; return [...cross(c1, c2), ...cross(c2, c0), ...cross(c0, c1)]; };
  const col = (h) => { const c = _hex(h); return [c[0] / 255, c[1] / 255, c[2] / 255]; };

  let VP = null, CAMP = [0, 0, 10], curTex = null;
  const bindMesh = (m) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.p); gl.enableVertexAttribArray(AP); gl.vertexAttribPointer(AP, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.n); gl.enableVertexAttribArray(AN); gl.vertexAttribPointer(AN, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.u); gl.enableVertexAttribArray(AU); gl.vertexAttribPointer(AU, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.i);
  };
  const draw = (m, N, s, c, o) => {
    const M = mul(N, Sc(s[0], s[1], s[2]));
    bindMesh(m);
    gl.uniformMatrix4fv(U.m, false, M); gl.uniformMatrix3fv(U.nm, false, nmat(M));
    gl.uniform3fv(U.c, c); gl.uniform1f(U.tex, o && o.tex ? 1 : 0); gl.uniform1f(U.flat, o && o.flat ? 1 : 0); gl.uniform1f(U.a, o && o.a || 1);
    gl.drawElements(gl.TRIANGLES, m.c, gl.UNSIGNED_SHORT, 0);
  };

  // ---- face texture (eyes, brows, mouth, beard painted onto the head) ----
  const texCache = new Map();
  const faceTex = (a, blink) => {
    const key = [a.skin, a.hair, a.eyes, a.eyec, a.brows, a.mouth, a.beard, blink ? 1 : 0].join('|');
    let t = texCache.get(key); if (t) { texCache.delete(key); texCache.set(key, t); return t; }
    const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const cx = 512, cy = 256, sk = a.skin, hair = a.hair;
    x.fillStyle = sk; x.fillRect(0, 0, W, H);
    // beard first, then the face is cut back out of it
    const full = a.beard === 'full', goat = a.beard === 'goatee', stub = a.beard === 'stubble', mous = a.beard === 'moustache';
    const bcol = avDark(hair, .05);
    const beardPath = () => { x.beginPath(); x.moveTo(cx - 200, cy - 40); x.bezierCurveTo(cx - 215, cy + 170, cx - 90, cy + 245, cx, cy + 240); x.bezierCurveTo(cx + 90, cy + 245, cx + 215, cy + 170, cx + 200, cy - 40); x.lineTo(cx + 150, cy + 20); x.bezierCurveTo(cx + 100, cy + 60, cx - 100, cy + 60, cx - 150, cy + 20); x.closePath(); };
    if (full || stub) { x.fillStyle = bcol; x.globalAlpha = stub ? .3 : 1; beardPath(); x.fill(); x.globalAlpha = 1; }
    if (goat) { x.fillStyle = bcol; x.beginPath(); x.ellipse(cx, cy + 150, 52, 62, 0, 0, 7); x.fill(); }
    // blush + soft nose shadow
    x.fillStyle = 'rgba(232,106,90,.26)'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * 112, cy + 44, 34, 20, 0, 0, 7); x.fill(); }
    // brows
    const bw = { thin: 5, normal: 9, bold: 14 }[a.brows] || 9; x.strokeStyle = avDark(hair, .1); x.lineWidth = bw; x.lineCap = 'round';
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * 38, cy - 64); x.quadraticCurveTo(cx + s * 66, cy - 86, cx + s * 98, cy - 66); x.stroke(); }
    // eyes
    for (const s of [-1, 1]) {
      const ex = cx + s * 66, ey = cy - 18;
      if (a.eyes === 'happy' || blink) { x.strokeStyle = '#2a1a12'; x.lineWidth = 9; x.beginPath(); if (a.eyes === 'happy') x.arc(ex, ey + 12, 22, Math.PI * 1.1, Math.PI * 1.9); else { x.moveTo(ex - 22, ey + 4); x.quadraticCurveTo(ex, ey + 16, ex + 22, ey + 4); } x.stroke(); continue; }
      const nar = a.eyes === 'narrow', slp = a.eyes === 'sleepy', rx = 20, ry = nar ? 15 : slp ? 19 : 25;
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex, ey, rx, ry, 0, 0, 7); x.fill();
      x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 2; x.stroke();
      x.fillStyle = a.eyec; x.beginPath(); x.arc(ex + s * -1, ey + 1, nar ? 10 : 13, 0, 7); x.fill();
      x.fillStyle = '#0c0608'; x.beginPath(); x.arc(ex + s * -1, ey + 1, nar ? 5 : 6.5, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.arc(ex + 4, ey - 6, 3.6, 0, 7); x.fill();
      if (slp) { x.fillStyle = sk; x.beginPath(); x.rect(ex - rx - 3, ey - ry - 3, rx * 2 + 6, ry + 4); x.fill(); x.strokeStyle = avDark(sk, .45); x.lineWidth = 5; x.beginPath(); x.moveTo(ex - rx, ey + 1); x.quadraticCurveTo(ex, ey - 7, ex + rx, ey + 1); x.stroke(); }
      else { x.strokeStyle = 'rgba(40,20,14,.7)'; x.lineWidth = 4; x.beginPath(); x.arc(ex, ey, ry + 1, Math.PI * 1.08, Math.PI * 1.92); x.stroke(); }
    }
    // moustache + mouth
    if (mous || full || goat) { x.fillStyle = bcol; x.beginPath(); x.moveTo(cx - 56, cy + 62); x.quadraticCurveTo(cx - 24, cy + 36, cx, cy + 52); x.quadraticCurveTo(cx + 24, cy + 36, cx + 56, cy + 62); x.quadraticCurveTo(cx + 26, cy + 70, cx, cy + 62); x.quadraticCurveTo(cx - 26, cy + 70, cx - 56, cy + 62); x.fill(); }
    const my = cy + 88, lip = (full || goat) ? '#e8b7a8' : '#3a2016';
    if ((full || goat) && a.mouth !== 'open' && a.mouth !== 'grin') { x.fillStyle = sk; x.beginPath(); x.ellipse(cx, my + 6, 54, 24, 0, 0, 7); x.fill(); }
    x.strokeStyle = lip; x.lineWidth = 8; x.lineCap = 'round'; x.lineJoin = 'round';
    if (a.mouth === 'smile') { x.beginPath(); x.moveTo(cx - 38, my - 6); x.quadraticCurveTo(cx, my + 32, cx + 38, my - 6); x.stroke(); }
    else if (a.mouth === 'smirk') { x.beginPath(); x.moveTo(cx - 32, my + 8); x.quadraticCurveTo(cx + 4, my + 14, cx + 38, my - 12); x.stroke(); }
    else if (a.mouth === 'neutral') { x.beginPath(); x.moveTo(cx - 32, my + 6); x.lineTo(cx + 32, my + 6); x.stroke(); }
    else { const op = a.mouth === 'open'; x.beginPath(); x.moveTo(cx - 44, my - 8); x.quadraticCurveTo(cx, my + (op ? 78 : 62), cx + 44, my - 8); x.closePath(); x.fillStyle = op ? '#5a1a22' : '#fff'; x.fill(); x.lineWidth = 6; x.stroke();
      x.save(); x.clip(); if (op) { x.fillStyle = '#fff'; x.fillRect(cx - 44, my - 10, 88, 16); x.fillStyle = '#c0504a'; x.beginPath(); x.ellipse(cx, my + 50, 30, 20, 0, 0, 7); x.fill(); } else { x.fillStyle = '#c0504a'; x.beginPath(); x.ellipse(cx, my + 40, 26, 16, 0, 0, 7); x.fill(); } x.restore(); }
    const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    texCache.set(key, tx);
    if (texCache.size > 10) { const k = texCache.keys().next().value; gl.deleteTexture(texCache.get(k)); texCache.delete(k); }
    return tx;
  };

  // ---- the figure ----
  const limb = (N, L, r, c) => { draw(cyl, mul(N, T(0, -L / 2, 0)), [r, L, r], c); draw(sphere(), N, [r, r, r], c); };
  const figure = (a, P, headOnly) => {
    const bs = { slim: .9, average: 1, broad: 1.14 }[a.build] || 1, hh = { short: .95, average: 1, tall: 1.06 }[a.height] || 1;
    const skin = col(a.skin), shirt = col(a.shirt), pants = col(a.pants), hair = col(a.hair), shoe = col(a.shoec);
    const root = mul(mul(T(0, P.bob, 0), mul(Ry(P.yaw), Rz(P.sway))), Sc(hh, hh, hh));
    const long = a.top !== 'tee', hood = a.top === 'hoodie';
    // head
    const HN = mul(root, mul(T(0, 3.1, 0), mul(Ry(P.hy), mul(Rx(P.hx), Rz(P.hz))))), HC = mul(HN, T(0, .75, 0));
    const hrad = [.8, .88, .8];
    if (!headOnly) {
      // legs
      const hip = mul(root, T(0, 1.6, 0)), sh2 = col(avLight(a.shoec, 0));
      for (const s of [-1, 1]) {
        const th = mul(hip, mul(T(s * .3 * bs, 0, 0), Rx(P.leg[s < 0 ? 0 : 1]))), kn = mul(th, mul(T(0, -.72, 0), Rx(P.knee[s < 0 ? 0 : 1])));
        const short = a.bottom === 'shorts', flared = a.bottom === 'flared', r1 = (a.bottom === 'chinos' ? .25 : .26) * (bs > 1 ? 1.06 : 1);
        limb(th, short ? .55 : .72, r1, pants);
        if (short) { limb(mul(th, T(0, -.55, 0)), .0, r1, pants); limb(kn, .66, .17, skin); draw(cyl, mul(kn, T(0, -.5, 0)), [.19, .22, .19], [.94, .94, .96]); }
        else limb(kn, .66, flared ? .31 : .22, pants);
        const an = mul(kn, T(0, -.66, 0));
        const toe = a.shoes === 'flats' ? .4 : .46;
        draw(sphere(), mul(an, T(0, -.04, .17)), [.28, .17, toe], shoe);
        if (a.shoes === 'boots') draw(cyl, mul(an, T(0, .16, 0)), [.27, .36, .27], shoe);
        if (a.shoes === 'sneakers') draw(sphere(), mul(an, T(0, -.15, .19)), [.285, .06, toe + .02], [.95, .95, .97]);
      }
      // hips + torso
      draw(sphere(), mul(root, T(0, 1.62, 0)), [.62 * bs, .36, .39 * bs], pants);
      const tor = mul(root, mul(T(0, 2.25, 0), Sc(1, P.br, 1)));
      draw(sphere(), tor, [.68 * bs, .84, .43 * bs], shirt);
      if (a.top === 'jacket') {
        draw(sphere(), mul(root, T(0, 2.4, .2)), [.26 * bs, .64, .3], [.96, .97, .99]);
        for (const s of [-1, 1]) draw(sphere(), mul(root, mul(T(s * .2, 2.98, .3), Rz(-s * .5))), [.16, .08, .12], [.96, .97, .99]);
      } else if (a.top === 'collar') {
        for (const s of [-1, 1]) draw(sphere(), mul(root, mul(T(s * .17, 2.99, .3), Rz(-s * .5))), [.16, .08, .12], col(avLight(a.shirt, .55)));
        for (const y of [2.55, 2.3, 2.05]) draw(sphere(), mul(root, T(0, y, .445 * bs)), [.035, .035, .03], col(avDark(a.shirt, .4)));
      } else if (hood) {
        draw(sphere(), mul(root, T(0, 3.0, -.24)), [.5, .3, .32], col(avDark(a.shirt, .2)));
        for (const s of [-1, 1]) draw(cyl, mul(root, T(s * .1, 2.7, .42 * bs)), [.025, .5, .025], [.95, .95, .95]);
        draw(sphere(), mul(root, T(0, 1.85, .22 * bs)), [.46 * bs, .22, .3], col(avDark(a.shirt, .12)));
      }
      if (a.top !== 'jacket' && a.top !== 'collar') {
        const gc = col(a.gc);
        if (a.gfx === 'logo') { const d = mul(root, mul(T(0, 2.35, .43 * bs), Rx(Math.PI / 2))); draw(cyl, d, [.2, .06, .2], gc); draw(cyl, mul(d, T(0, .04, 0)), [.12, .04, .12], shirt); draw(cyl, mul(d, T(0, .06, 0)), [.045, .04, .09], gc); }
        else if (a.gfx === 'stripe') draw(sphere(), mul(root, T(0, 2.35, 0)), [.755 * bs, .1, .46 * bs], gc);
        else if (a.gfx === 'chevron') for (const s of [-1, 1]) draw(sphere(), mul(root, mul(T(s * .13, 2.38, .42 * bs), Rz(-s * .65))), [.28, .06, .06], gc);
      }
      // neck
      draw(cyl, mul(root, T(0, 3.05, 0)), [.22, .34, .22], skin);
      // arms
      for (const s of [-1, 1]) {
        const i = s < 0 ? 0 : 1, sx = s * (.72 * bs + .1);
        const up = mul(root, mul(T(sx, 2.85, 0), mul(Rz(s * P.az[i]), Rx(P.ax[i])))), el = mul(up, mul(T(0, -.7, 0), mul(Rz(s * P.ez[i]), Rx(-P.ex[i]))));
        limb(up, .7, .15, skin); limb(el, .62, .13, skin);
        draw(sphere(), mul(el, T(0, -.72, 0)), [.19, .22, .17], skin);
        const sc = long ? shirt : shirt, rr = hood ? .205 : .185;
        limb(up, long ? .72 : .36, rr, sc);
        if (long) { limb(el, .54, rr - .025, sc); }
      }
      // ground shadow
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      draw(sphere(), T(0, .01, 0), [1.2 * hh, .015, .75], [0, 0, 0], { flat: 1, a: .26 });
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    // head
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, faceTex(a, P.blink));
    draw(sphere(), HC, hrad, skin, { tex: 1 });
    const earS = { small: .8, normal: 1, big: 1.3 }[a.ears] || 1;
    for (const s of [-1, 1]) draw(sphere(), mul(HC, T(s * .78, -.02, -.02)), [.1 * earS, .2 * earS, .14 * earS], skin);
    const nsc = { small: .8, medium: 1, large: 1.3 }[a.nose] || 1;
    draw(sphere(), mul(HC, T(0, -.1, .79)), [.1 * nsc, .12 * nsc, .1 * nsc], skin);
    // hair
    const cap = (tm, k, tilt, dy) => draw(sphere(tm), mul(HC, mul(T(0, dy || 0, 0), Rx(-tilt))), [hrad[0] * k, hrad[1] * k, hrad[2] * k], hair);
    const bl = (y, z, s, rz) => draw(sphere(), mul(HC, mul(T(0, y, z), Rz(rz || 0))), s, hair);
    ({
      short: () => cap(1.5, 1.07, .45), buzz: () => cap(1.5, 1.025, .45),
      sidepart: () => { cap(1.5, 1.07, .5); draw(sphere(), mul(HC, mul(T(.14, .6, .6), Rz(-.4))), [.42, .17, .3], hair); },
      quiff: () => { cap(1.4, 1.06, .35); draw(cyl, mul(HC, T(0, .84, -.02)), [.56, .3, .52], hair); },
      mop: () => { cap(1.65, 1.09, .5); bl(.44, .63, [.78, .27, .33]); for (const s of [-1, 1]) draw(sphere(), mul(HC, T(s * .72, -.02, -.02)), [.14, .5, .56], hair); },
      long: () => { cap(1.62, 1.08, .45); bl(-.5, -.34, [.84, 1.05, .5]); for (const s of [-1, 1]) draw(sphere(), mul(HC, T(s * .7, -.25, .02)), [.13, .72, .36], hair); },
      curly: () => { cap(1.55, 1.12, .4); for (const [x, y, z] of [[.5, .75, .2], [-.5, .75, .2], [0, .95, .1], [.7, .35, -.1], [-.7, .35, -.1], [0, .75, -.45], [.4, .6, -.5], [-.4, .6, -.5]]) draw(sphere(), mul(HC, T(x, y, z)), [.3, .3, .3], hair); },
      bun: () => { cap(1.5, 1.07, .45); bl(.98, -.2, [.3, .3, .3]); }, none: () => { }
    }[a.style] || (() => { }))();
    // glasses
    if (a.glasses !== 'none') {
      const gc = col(a.glc), ey = .06, ez = .76;
      for (const s of [-1, 1]) {
        const g = mul(HC, mul(T(s * .29, ey, ez), Ry(-s * .38)));
        if (a.glasses === 'shades') draw(sphere(), mul(g, T(0, 0, .03)), [.22, .15, .05], [.05, .06, .08]);
        else if (a.glasses === 'square') { draw(torus(.12), g, [.2, .15, .2], gc); }
        else draw(torus(.12), g, [.2, .2, .2], gc);
        draw(cyl, mul(HC, mul(T(s * .6, ey, .36), mul(Ry(s * 1.1), Rx(Math.PI / 2)))), [.015, .55, .015], gc);
      }
      draw(cyl, mul(HC, mul(T(0, ey + .02, ez + .02), Rz(Math.PI / 2))), [.015, .1, .015], gc);
    }
    // hats
    if (a.hat !== 'none') {
      const hc = col(a.hatc), hd = col(avDark(a.hatc, .35));
      ({
        cap: () => { draw(sphere(1.5), mul(HC, mul(T(0, .03, 0), Rx(-.3))), [hrad[0] * 1.13, hrad[1] * 1.13, hrad[2] * 1.13], hc); draw(sphere(), mul(HC, mul(T(0, .34, .96), Rx(.12))), [.5, .045, .46], hd); draw(cyl, mul(HC, mul(T(0, .46, .86), Rx(Math.PI / 2 - .2))), [.11, .03, .11], [.95, .95, .95]); },
        beanie: () => { draw(sphere(1.75), mul(HC, mul(T(0, .02, 0), Rx(-.15))), [hrad[0] * 1.15, hrad[1] * 1.16, hrad[2] * 1.15], hc); draw(sphere(), mul(HC, T(0, 1.06, -.05)), [.17, .17, .17], col(avLight(a.hatc, .5))); },
        fedora: () => { draw(cyl, mul(HC, T(0, .88, 0)), [.56, .5, .52], hc); draw(cyl, mul(HC, T(0, .58, 0)), [1.2, .06, 1.12], hd); draw(cyl, mul(HC, T(0, .72, 0)), [.575, .1, .535], hd); },
        tophat: () => { draw(cyl, mul(HC, T(0, 1.3, 0)), [.54, .95, .5], hc); draw(cyl, mul(HC, T(0, .62, 0)), [.9, .06, .84], hd); draw(cyl, mul(HC, T(0, .76, 0)), [.555, .12, .515], hd); },
        cowboy: () => { draw(cyl, mul(HC, T(0, .9, 0)), [.58, .52, .54], hc); draw(sphere(), mul(HC, mul(T(0, .58, 0), Rx(.04))), [1.3, .07, 1.2], hd); draw(cyl, mul(HC, T(0, .75, 0)), [.595, .1, .555], hd); }
      }[a.hat])();
    }
  };

  // ---- animation ----
  const W = { wave: 0, dance: 0, look: 0 };
  let lastT = 0, blinkAt = 3, blinkUntil = 0;
  const mix = (a, b, t) => a + (b - a) * t, clamp = (v) => Math.max(0, Math.min(1, v));
  const pose = (t, dt, emote, yaw) => {
    for (const k of ['wave', 'dance', 'look']) W[k] += ((emote === k ? 1 : 0) - W[k]) * Math.min(1, dt * 6);
    if (t > blinkAt) { blinkUntil = t + .13; blinkAt = t + 2.5 + Math.random() * 3.5; }
    const s6 = Math.sin(t * 6.4), idle = Math.sin(t * 1.5);
    const P = { yaw, bob: 0, sway: Math.sin(t * 1.1) * .012, br: 1 + Math.sin(t * 2.1) * .012, blink: t < blinkUntil,
      hy: Math.sin(t * .8) * .1, hx: Math.sin(t * 1.3) * .03, hz: Math.sin(t * .9) * .03,
      az: [.1 + idle * .03, .1 - idle * .03], ax: [Math.sin(t * 1.5) * .05, -Math.sin(t * 1.5) * .05], ez: [0, 0], ex: [.2, .2], leg: [0, 0], knee: [0, 0] };
    const d = W.dance, w = W.wave, l = W.look;
    P.bob = Math.abs(s6) * .13 * d; P.sway += Math.sin(t * 6.4) * .07 * d; P.hz += s6 * .1 * d; P.hy = mix(P.hy, Math.sin(t * 1.6) * .75, l);
    P.az[0] = mix(P.az[0], 1.5 + s6 * .6, d); P.az[1] = mix(P.az[1], 1.5 - s6 * .6, d);
    P.ex[0] = mix(P.ex[0], .5, d); P.ex[1] = mix(P.ex[1], .5, d);
    P.leg[0] = s6 * .3 * d; P.leg[1] = -s6 * .3 * d; P.knee[0] = Math.max(0, -s6) * .5 * d; P.knee[1] = Math.max(0, s6) * .5 * d;
    P.az[1] = mix(P.az[1], 2.45, w); P.ez[1] = mix(P.ez[1], .3 + Math.sin(t * 9) * .5, w); P.ex[1] = mix(P.ex[1], 0, w); P.hz += .12 * w; P.hy = mix(P.hy, -.15, w);
    return P;
  };

  // ---- targets ----
  let emote = 'idle', emoteN = 0, glW = 0, glH = 0;
  const seq = ['wave', 'idle', 'dance', 'idle', 'look', 'idle'];
  setInterval(() => { emote = seq[emoteN++ % seq.length]; }, 3300);
  const fov = .5, fit = (halfH, halfW, aspect) => Math.max(halfH / Math.tan(fov / 2), halfW / (Math.tan(fov / 2) * aspect));
  const frame = (now) => {
    const t = now / 1000, dt = Math.min(.1, t - lastT || .016); lastT = t;
    const list = document.querySelectorAll('canvas.av3'); if (!list.length) return;
    const a = avatarOf(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    list.forEach((c) => {
      const r = c.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr); if (w > 2048 || h > 2048) return;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      if (glW < w || glH < h) { glW = Math.max(glW, w); glH = Math.max(glH, h); cv.width = glW; cv.height = glH; }
      const head = c.dataset.head === '1', big = c.classList.contains('avbig');
      gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const yaw = big ? AV3.yaw : head ? Math.sin(t * .6) * .28 : (c.dataset.yaw ? +c.dataset.yaw : 0) + Math.sin(t * .5) * .28;
      const cy = head ? 3.85 : 3.0, d = head ? fit(1.25, 1.25, w / h) : fit(3.55, 2.7, w / h);
      CAMP = [0, cy, d]; VP = mul(persp(fov, w / h, .5, 60), T(0, -cy, -d));
      gl.uniformMatrix4fv(U.vp, false, VP); gl.uniform3fv(U.cam, CAMP);
      figure(a, pose(t, dt, head ? 'idle' : (AV3.force || emote), yaw), head);
      const x = c.getContext('2d'); x.clearRect(0, 0, w, h); x.drawImage(cv, 0, glH - h, w, h, 0, 0, w, h);
    });
  };
  let editing = null;
  const loop = (now) => {
    requestAnimationFrame(loop);
    const ed = document.getElementById('avdlg'), open = ed && ed.open;
    if (document.hidden) return;
    if (!open && now - (loop.last || 0) < 32) return; loop.last = now;
    if (open) {
      const gp = (navigator.getGamepads && [...navigator.getGamepads()].find(Boolean)) || null;
      if (gp) { const lt = gp.buttons[6] ? gp.buttons[6].value : 0, rt = gp.buttons[7] ? gp.buttons[7].value : 0, rs = Math.abs(gp.axes[2] || 0) > .25 ? gp.axes[2] : 0; AV3.yaw += (rt - lt + rs) * .06; }
      if (AV3.keys.e) AV3.yaw += .05; if (AV3.keys.q) AV3.yaw -= .05;
    }
    frame(now);
  };
  requestAnimationFrame(loop);
  return { yaw: 0, keys: {}, force: null };
})();

if (AV3) {
  const _flat = avatarSVG;
  avatarSVG = function (a, cls, head) {
    const big = /\bavbig\b/.test(cls || '');
    return `<canvas class="av av3 ${cls || ''}" data-head="${head ? 1 : 0}" width="${head ? 120 : big ? 300 : 300}" height="${head ? 120 : big ? 300 : 340}"></canvas>`;
  };
  document.addEventListener('keydown', (e) => { const d = document.getElementById('avdlg'); if (!d || !d.open) return; const k = e.key.toLowerCase(); if (k === 'q' || k === 'e') AV3.keys[k] = true; });
  document.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k === 'q' || k === 'e') AV3.keys[k] = false; });
  let drag = null;
  document.addEventListener('pointerdown', (e) => { const s = e.target.closest && e.target.closest('.avstage'); if (s) drag = e.clientX; });
  document.addEventListener('pointermove', (e) => { if (drag !== null) { AV3.yaw += (e.clientX - drag) * .012; drag = e.clientX; } });
  document.addEventListener('pointerup', () => { drag = null; });
  const _ed = avEditor;
  avEditor = function () { const d = document.getElementById('avdlg'); if (!d || !d.open) AV3.yaw = 0; return _ed.apply(this, arguments); };
}
