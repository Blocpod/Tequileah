// Generative score (Web Audio, no files). Off by default; the toggle remembers your choice.
// A low pad whose filter opens as the lights gather, sparse plucks for the lights, soft interface ticks.
const KEY = 'tl-sound';
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17];

export function createSound(button) {
  let ctx = null, master, padFilter, lfo, plucker = 0, on = false, T = 0;
  const read = () => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } };
  const write = (v) => { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* private mode */ } };

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3;
    // reverb from generated noise
    const verb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.42;
    master.connect(comp); comp.connect(ctx.destination);
    verb.connect(wet); wet.connect(master);
    // pad: A minor-ish drone, detuned pairs
    padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 280; padFilter.Q.value = 0.7;
    const padGain = ctx.createGain(); padGain.gain.value = 0.11;
    padFilter.connect(padGain); padGain.connect(master); padGain.connect(verb);
    for (const [f, type, det] of [[55, 'sawtooth', -6], [55, 'sawtooth', 7], [82.41, 'triangle', 3], [110, 'triangle', -4], [164.8, 'sine', 0]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = type === 'sawtooth' ? 0.18 : 0.32;
      o.connect(g); g.connect(padFilter); o.start();
    }
    lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 120;
    lfo.connect(lfoAmt); lfoAmt.connect(padFilter.frequency); lfo.start();
    master.pluckBus = ctx.createGain(); master.pluckBus.gain.value = 0.5; master.pluckBus.connect(verb); master.pluckBus.connect(master);
  }
  function pluck(gain = 0.05) {
    if (!ctx || !on) return;
    const n = PENTA[Math.floor(Math.random() * PENTA.length)] + (Math.random() < 0.3 ? 12 : 0);
    const f = 440 * Math.pow(2, (n + 3) / 12);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(g); g.connect(master.pluckBus); o.start(t); o.stop(t + 1.9);
  }
  function loop() {
    // lights "speak" more often while they travel and when the room is full
    const busy = T > 1 && T < 2 ? 0.35 : T > 3.2 && T < 4.2 ? 0.55 : 1;
    plucker = setTimeout(() => { pluck(0.03 + Math.random() * 0.03); loop(); }, (900 + Math.random() * 2600) * busy);
  }
  function set(v) {
    on = v; write(v);
    button?.setAttribute('aria-pressed', String(v));
    button?.setAttribute('aria-label', v ? 'Sound on' : 'Sound off');
    if (v) {
      if (!ctx) build();
      ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.8, ctx.currentTime, 0.8);
      clearTimeout(plucker); loop();
    } else if (ctx) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      clearTimeout(plucker);
    }
  }
  button?.addEventListener('click', () => set(!on));
  // honour a remembered "on" at the first gesture (browsers block audio before one)
  if (read()) { const arm = () => { set(true); window.removeEventListener('pointerdown', arm); window.removeEventListener('keydown', arm); }; window.addEventListener('pointerdown', arm); window.addEventListener('keydown', arm); }
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (on) ctx.resume(); });

  return {
    setT(t) {
      T = t;
      if (!ctx || !on) return;
      const open = 260 + Math.min(1, Math.max(0, (t - 0.8) / 1.4)) * 900 + (t > 3.2 ? 500 : 0);
      padFilter.frequency.setTargetAtTime(open, ctx.currentTime, 0.4);
    },
    tick() {
      if (!ctx || !on) return;
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = 'sine'; o.frequency.value = 1760;
      g.gain.setValueAtTime(0.02, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.07);
    },
    thump() {
      if (!ctx || !on) return;
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.25);
      g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.42);
      pluck(0.06);
    },
  };
}
