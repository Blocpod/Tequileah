import '@fontsource-variable/mona-sans/wdth.css';
import '@fontsource-variable/martian-mono/wdth.css';
import './styles/main.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initChrome } from './chrome.js';
import { splitHeadings, revealHeading, makeGather, proximity } from './ui/kinetic.js';
import { initButtons } from './ui/buttons.js';
import { initCursor } from './ui/cursor.js';
import { createSound } from './ui/sound.js';

gsap.registerPlugin(ScrollTrigger);

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = matchMedia('(max-width: 860px)').matches;
const FINE = matchMedia('(pointer: fine)').matches;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let stage = null, geo = null, ACTIVITIES = [], lastT = 0;
let hideTag = () => {};
const canvas = document.querySelector('.stage__canvas');

// ---------- boot: a real progress readout while the world loads ----------
const boot = document.querySelector('.boot');
const bootN = document.querySelector('[data-boot-n]');
let shownP = 0, targetP = 6, bootDone = false;
const bootTick = () => {
  if (bootDone) return;
  shownP += (targetP - shownP) * 0.12;
  if (targetP - shownP < 0.4) shownP = targetP;
  bootN.textContent = String(Math.round(shownP)).padStart(3, '0');
  boot.style.setProperty('--p', (shownP / 100).toFixed(3));
  if (shownP >= 100) { finishBoot(); return; }
  requestAnimationFrame(bootTick);
};
if (RM) document.documentElement.classList.add('no-boot'); else requestAnimationFrame(bootTick);
const progress = (p) => { targetP = Math.max(targetP, p); };
const bootTimeout = setTimeout(() => progress(100), 4500);

// ---------- smooth scroll ----------
let lenis = null;
if (!RM) {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
initChrome({ lenis });

// ---------- interaction layer ----------
const sound = createSound(document.querySelector('.sound'));
if (FINE && !RM) initCursor();
initButtons({
  fine: FINE, reduced: RM,
  onPulse: (x, y, color, k) => { stage?.pulse(x, y, color); if (k >= 1) sound.thump(); },
  onHover: () => sound.tick(),
});
const heads = splitHeadings();
const gather = makeGather(document.querySelector('.gather'));
if (FINE && !RM) proximity(document.querySelector('.foot__mark'));

// ---------- chapters drive T ----------
const chapters = [...document.querySelectorAll('.chapter')];
const hero = document.querySelector('.chapter--hero .hero');
const beats = [...document.querySelectorAll('.beat')];
const roomCh = document.querySelector('.chapter--room');
const pipeEls = document.querySelectorAll('.chapter--pipe .pipe > *');
const rail = document.querySelector('.rail');
const railLinks = [...rail.querySelectorAll('a')];

function onChapter(ch, p) {
  if (ch.classList.contains('chapter--hero')) {
    const k = sm(0.35, 1, p);
    hero.style.opacity = String(1 - k);
    hero.style.translate = `0 ${(-k * 70).toFixed(1)}px`;
    hero.style.filter = k > 0.01 ? `blur(${(k * 8).toFixed(1)}px)` : '';
  }
  if (ch.classList.contains('chapter--turn')) {
    const span = 0.17;
    let ping = null;
    beats.forEach((b, i) => {
      const a = i * span + 0.02, z = i === beats.length - 1 ? 2 : a + span;
      const o = sm(a, a + 0.05, p) * (1 - sm(z - 0.04, z, p));
      b.style.opacity = o.toFixed(3);
      b.style.transform = `translate3d(0, calc(-50% + ${((1 - sm(a, a + 0.06, p)) * 30 - sm(z - 0.04, z, p) * 30).toFixed(1)}px), 0)`;
      b.style.filter = o < 0.99 ? `blur(${((1 - o) * 10).toFixed(1)}px)` : '';
      if (i === beats.length - 1) b.style.fontVariationSettings = `'wdth' ${(75 + sm(a, a + 0.12, p) * 43).toFixed(1)}, 'wght' ${(200 + sm(a, a + 0.12, p) * 520).toFixed(0)}`;
      if (o > 0.5 && b.dataset.ping) ping = b.dataset.ping;
    });
    stage?.setPing(ping);
  }
  if (ch === roomCh) roomCh.classList.toggle('is-day', p > 0.1);
  if (ch.classList.contains('chapter--pipe')) {
    pipeEls.forEach((el, i) => {
      const a = 0.27 + i * 0.03, k = sm(a, a + 0.1, p);
      el.style.opacity = k.toFixed(3);
      el.style.translate = `0 ${((1 - k) * 28).toFixed(1)}px`;
    });
  }
  if (ch.classList.contains('chapter--close')) gather(sm(0.12, 0.62, p));
}

if (!RM) {
  const triggers = chapters.map((ch) => ScrollTrigger.create({ trigger: ch, start: 'top top', end: 'bottom bottom' }));
  const sync = () => {
    const y = window.scrollY;
    let T = 0;
    triggers.forEach((st, i) => {
      onChapter(chapters[i], st.progress);
      if (y >= st.start - 1) T = +chapters[i].dataset.t + st.progress;
    });
    lastT = T;
    stage?.setT(T);
    sound.setT(T);
    if (T > 0.85) hideTag();
    const idx = T < 0.95 ? 0 : T < 1.95 ? 1 : T < 2.98 ? 2 : T < 3.98 ? 3 : 4;
    railLinks.forEach((a, i) => a.classList.toggle('is-on', i === idx));
    rail.style.setProperty('--rp', (T / 5).toFixed(3));
  };
  ScrollTrigger.addEventListener('refresh', sync);
  window.addEventListener('scroll', sync, { passive: true });
  sync();
} else {
  const ends = { 0: 0, 1: 1.97, 2: 2.92, 3: 3.95, 4: 5 };
  let current = 0;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const T = ends[e.target.dataset.t];
      if (T === current) continue;
      current = T; lastT = T;
      canvas.style.opacity = '0';
      setTimeout(() => { stage?.setT(T, true); canvas.style.opacity = '1'; }, 220);
      if (e.target === roomCh) roomCh.classList.add('is-day');
    }
  }, { threshold: 0.5 });
  chapters.forEach((c) => io.observe(c));
  gather(1);
}

// rail tone follows what's under it; scroll velocity leans the type and streaks the lights
const toneAt = (y) => {
  for (const s of document.querySelectorAll('main > section, .foot')) {
    const r = s.getBoundingClientRect();
    if (r.top <= y && r.bottom > y) return s.classList.contains('chapter--room') ? (s.classList.contains('is-day') ? 'day' : 'night') : s.dataset.tone || 'night';
  }
  return 'night';
};
let skew = 0;
if (lenis) {
  lenis.on('scroll', ({ velocity }) => {
    stage?.setScrollVelocity(velocity);
    skew += (clamp(-velocity * 0.035, -2.4, 2.4) - skew) * 0.3;
  });
}
const foot = document.querySelector('.foot');
let tickN = 0, lastSkew = '';
gsap.ticker.add(() => {
  // reads first, writes after: no forced layout inside the frame
  if (tickN++ % 6 === 0) {
    const tone = toneAt(innerHeight / 2), off = foot.getBoundingClientRect().top < innerHeight * 0.6;
    rail.dataset.tone = tone; rail.classList.toggle('is-off', off);
  }
  skew *= 0.9;
  const sk = Math.abs(skew) < 0.005 ? '0deg' : `${skew.toFixed(3)}deg`;
  if (sk !== lastSkew) { lastSkew = sk; document.documentElement.style.setProperty('--skew', sk); }
});

// sunrise: the next sheet rises over the night map from the horizon
if (!RM) {
  document.querySelectorAll('.sheet--rise').forEach((el) => {
    gsap.fromTo(el, { '--rise': '0vmax' }, { '--rise': '160vmax', ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 10%', scrub: true } });
  });
}

// roster: each role widens and darkens as the light reaches it
const roster = [...document.querySelectorAll('.roster li')];
const rosterUpdate = () => {
  for (const li of roster) {
    const k = RM ? 1 : sm(0.92, 0.5, li.getBoundingClientRect().top / innerHeight);
    li.style.setProperty('--rk', k.toFixed(3));
    li.classList.toggle('is-lit', k > 0.5);
  }
};
window.addEventListener('scroll', rosterUpdate, { passive: true });
rosterUpdate();
document.querySelectorAll('.rules li').forEach((el) => ScrollTrigger.create({ trigger: el, start: 'top 78%', end: 'bottom 10%', toggleClass: 'is-in' }));

// ---------- the lamp: every light is someone ----------
function wireStage() {
  const visible = new Set();
  const vio = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
    stage.setVisible(visible.size > 0 && !document.hidden);
  });
  chapters.forEach((c) => vio.observe(c));
  document.querySelectorAll('.sheet--rise').forEach((c) => vio.observe(c));
  document.addEventListener('visibilitychange', () => stage.setVisible(visible.size > 0 && !document.hidden));

  const tag = document.querySelector('.tag');
  const tagTown = tag.querySelector('.tag__town'), tagWhat = tag.querySelector('.tag__what');
  let lastMove = 0, current = -1;
  const inHero = () => stage.getT() < 0.85;
  const showTag = (hit, x, y) => {
    if (!hit) { tag.classList.remove('is-on'); current = -1; stage.setFocus(null); return; }
    if (hit.i !== current) { current = hit.i; tagTown.textContent = hit.town; tagWhat.textContent = ACTIVITIES[(hit.i * 7) % ACTIVITIES.length]; }
    const w = tag.offsetWidth || 220;
    tag.style.transform = `translate3d(${Math.min(innerWidth - w - 12, x + 22)}px, ${Math.max(84, y - 48)}px, 0)`;
    tag.classList.add('is-on');
    stage.setFocus(hit.pos);
  };
  hideTag = () => { if (current !== -1) showTag(null); };
  const offMap = (t) => t.closest('a, button, .hero, .nav, .rail');
  if (FINE && !RM) {
    window.addEventListener('pointermove', (e) => {
      lastMove = performance.now();
      if (!inHero() || offMap(e.target)) { stage.setMouse(null); showTag(null); return; }
      stage.setMouse(e.clientX, e.clientY);
      showTag(stage.nearestBuilder(e.clientX, e.clientY, 40), e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener('pointerleave', () => { stage.setMouse(null); showTag(null); });
    window.addEventListener('pointerdown', (e) => { if (inHero() && !offMap(e.target)) { stage.pulse(e.clientX, e.clientY); sound.thump(); } });
  }
  if (!RM) {
    setInterval(() => {
      if (!inHero() || performance.now() - lastMove < 3500) { if (!inHero()) showTag(null); return; }
      for (let k = 0; k < 30; k++) {
        const x = innerWidth * (MOBILE ? 0.15 + Math.random() * 0.7 : 0.55 + Math.random() * 0.38);
        const y = innerHeight * (MOBILE ? 0.14 + Math.random() * 0.2 : 0.18 + Math.random() * 0.62);
        const hit = stage.nearestBuilder(x, y, 26);
        if (hit) { const s = stage.mapToScreen(hit.pos[0], hit.pos[1], 0.04); showTag(hit, s.x, s.y); return; }
      }
    }, 2600);
  }
}

// ---------- entrance ----------
function finishBoot() {
  if (bootDone) return;
  bootDone = true; clearTimeout(bootTimeout);
  bootN.textContent = '100';
  setTimeout(() => {
    boot.classList.add('is-done');
    document.body.classList.remove('is-loading');
    stage?.startIntro(MOBILE ? 2.4 : 3.0);
    lenis?.start();
    if (RM) return;
    const heroHead = heads.find((h) => h.el.classList.contains('hero__title'));
    revealHeading(heroHead, { delay: 0.7 });
    gsap.from('.chapter--hero .reveal', { opacity: 0, y: 18, filter: 'blur(6px)', duration: 1.3, ease: 'expo.out', stagger: 0.09, delay: 1.25, clearProps: 'filter' });
  }, 260);
}
if (RM) {
  document.body.classList.remove('is-loading');
  document.querySelectorAll('.step').forEach((el) => el.classList.add('is-in'));
}

if (!RM) {
  heads.forEach((h) => {
    if (h.el.classList.contains('hero__title')) return;
    const inChapter = h.el.closest('.chapter');
    revealHeading(h, { scrollTrigger: { trigger: inChapter || h.el, start: inChapter ? 'top top' : 'top 82%', once: true } });
  });
  gsap.from('.chapter--room .lede, .chapter--room .trio li', { opacity: 0, y: 20, duration: 1, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: roomCh, start: 'top top', once: true } });
  gsap.from('.close > :not(.close__title)', { opacity: 0, y: 24, duration: 1.2, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: '.chapter--close', start: 'top 30%', once: true } });
}
document.querySelectorAll('.step').forEach((el) => ScrollTrigger.create({ trigger: el, start: 'top 80%', once: true, onEnter: () => el.classList.add('is-in') }));

// ---------- the world (loaded after first paint) ----------
const plan = document.querySelector('.plan');
(document.fonts?.ready || Promise.resolve()).then(() => progress(30));
async function load() {
  const [mod, poster, data] = await Promise.all([
    import('./stage/stage.js').then((m) => { progress(62); return m; }),
    import('./stage/poster.js'),
    import('./data/geo.json').then((m) => { progress(52); return m; }),
  ]);
  geo = data.default; ACTIVITIES = mod.ACTIVITIES;
  poster.drawPlan(plan.querySelector('svg'), geo);
  ScrollTrigger.create({ trigger: plan, start: 'top 75%', once: true, onEnter: () => plan.classList.add('is-in') });
  const brickell = geo.hubs.find((h) => h[0] === 'Brickell');
  document.querySelector('[data-km="Brickell"]').textContent = `${Math.round(Math.hypot(brickell[1], brickell[2]))} km`;
  progress(78);
  await new Promise((r) => requestAnimationFrame(r));
  try { stage = await mod.createStage({ canvas, labelsEl: document.querySelector('.stage__labels'), geo, mobile: MOBILE, still: RM }); } catch (err) { console.warn('stage failed, using poster', err); stage = null; }
  if (import.meta.env.DEV) window.__stage = stage;
  if (!stage) {
    document.documentElement.classList.add('no-webgl');
    poster.posterCanvas(geo, document.querySelector('.stage__fallback'));
  } else {
    stage.setT(lastT, true);
    if (lastT > 0.5 || bootDone) stage.skipIntro();
    wireStage();
    document.documentElement.classList.add('stage-ready');
  }
  progress(100);
  if (RM) finishBoot();
}
load();

window.addEventListener('load', () => ScrollTrigger.refresh());
