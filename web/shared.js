// Shared by the main app and the Guide window: UI sounds and the Guide-button rule.
(function () {
  let ctx = null, cfg = { on: true, vol: 0.6, theme: 'classic' };
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = () => { if (!AC) return null; if (!ctx) ctx = new AC(); if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; };
  // one short synthesized tone with a quick pitch slide
  function blip(f1, f2, dur, type, gain, delay) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
    const v = gain * cfg.vol * (cfg.theme === 'soft' ? 0.55 : 1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
  }
  // a soft rush of air (the Guide opening and closing)
  function whoosh(dur, f1, f2, gain) {
    const c = ac(); if (!c) return;
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    const t = c.currentTime; f.frequency.setValueAtTime(f1, t); f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.value = gain * cfg.vol * (cfg.theme === 'soft' ? 0.5 : 1);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  }
  const S = {
    tick() { blip(1500, 1250, 0.045, 'sine', 0.16); },
    select() { blip(880, 1320, 0.07, 'triangle', 0.22); blip(1320, 1760, 0.09, 'sine', 0.14, 0.05); },
    back() { blip(900, 560, 0.1, 'triangle', 0.2); },
    open() { whoosh(0.32, 500, 2600, 0.5); blip(520, 880, 0.2, 'sine', 0.12, 0.04); },
    close() { whoosh(0.28, 2400, 450, 0.45); },
    toast() { blip(1175, 1175, 0.08, 'sine', 0.2); blip(1568, 1568, 0.12, 'sine', 0.18, 0.09); },
    startup() { [523, 659, 784, 1046].forEach((f, i) => blip(f, f * 1.01, 0.5 - i * 0.04, 'sine', 0.16, i * 0.11)); whoosh(0.7, 300, 3000, 0.25); }
  };
  window.SFX = {
    config(c) { if (c) cfg = { on: c.on !== false, vol: typeof c.vol === 'number' ? c.vol : 0.6, theme: c.theme || 'classic' }; },
    play(name) { if (!cfg.on || cfg.theme === 'off') return; try { S[name] && S[name](); } catch { /* audio not available */ } },
    names: Object.keys(S)
  };

  // Which controller button opens the Guide for a given game.
  // Steam games (Steam Input hides the touchpad) and games tagged as native PS5 use L3+R3; everything else uses the touchpad.
  window.guideBindFor = function (it, s) {
    s = s || {};
    const pick = it && it.guideBind && it.guideBind !== 'auto' ? it.guideBind : (s.guideDefault && s.guideDefault !== 'auto' ? s.guideDefault : 'auto');
    if (pick !== 'auto') return pick;
    if (!it) return 'any';
    const steam = it.appid || /steam/i.test(it.source || '') || /^steam:/i.test(it.target || '');
    if (steam || it.nativePS5) return 'chord';
    return it.category === 'game' ? 'touch' : 'any';
  };
})();
