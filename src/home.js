import '@fontsource-variable/funnel-display';
import '@fontsource-variable/funnel-sans';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@fontsource-variable/geist-mono';
import './styles/main.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initChrome } from './chrome.js';

gsap.registerPlugin(ScrollTrigger);

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = matchMedia('(max-width: 860px)').matches;
const FINE = matchMedia('(pointer: fine)').matches;
let hideTag = () => {};
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- stage (loaded after first paint; the page reads fine without it) ----------
const canvas = document.querySelector('.stage__canvas');
let stage = null, geo = null, ACTIVITIES = [], lastT = 0;

// ---------- smooth scroll ----------
let lenis = null;
if (!RM) {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
initChrome({ lenis });

// ---------- chapters drive T ----------
const chapters = [...document.querySelectorAll('.chapter')];
const hero = document.querySelector('.chapter--hero .hero');
const hint = document.querySelector('.hint');
const beats = [...document.querySelectorAll('.beat')];
const roomCh = document.querySelector('.chapter--room');
const pipeEls = document.querySelectorAll('.chapter--pipe .pipe > *');

function onChapter(ch, p) {
  if (ch.classList.contains('chapter--hero')) {
    const k = sm(0.35, 1, p);
    hero.style.opacity = String(1 - k);
    hero.style.transform = `translate3d(0, ${(-k * 60).toFixed(1)}px, 0)`;
    hint.style.opacity = String(1 - sm(0.05, 0.3, p));
  }
  if (ch.classList.contains('chapter--turn')) {
    // five beats; the last one holds
    const span = 0.17;
    let ping = null;
    beats.forEach((b, i) => {
      const a = i * span + 0.02, z = i === beats.length - 1 ? 2 : a + span;
      const o = sm(a, a + 0.05, p) * (1 - sm(z - 0.04, z, p));
      b.style.opacity = o.toFixed(3);
      b.style.transform = `translate3d(0, calc(-50% + ${((1 - sm(a, a + 0.06, p)) * 24 - sm(z - 0.04, z, p) * 24).toFixed(1)}px), 0)`;
      if (o > 0.5 && b.dataset.ping) ping = b.dataset.ping;
    });
    stage?.setPing(ping);
  }
  if (ch === roomCh) roomCh.classList.toggle('is-day', p > 0.16);
  if (ch.classList.contains('chapter--pipe')) {
    // copy arrives once dusk has fallen behind it
    pipeEls.forEach((el, i) => {
      const a = 0.14 + i * 0.035, k = sm(a, a + 0.12, p);
      el.style.opacity = k.toFixed(3);
      el.style.transform = `translate3d(0, ${((1 - k) * 26).toFixed(1)}px, 0)`;
    });
  }
}

if (!RM) {
  // One source of truth: T is the furthest chapter whose start we've scrolled past, plus its progress.
  // Between chapters (while opaque sheets pass) T simply holds the previous chapter's end state.
  const triggers = chapters.map((ch) => ScrollTrigger.create({ trigger: ch, start: 'top top', end: 'bottom bottom' }));
  const sync = () => {
    const y = window.scrollY;
    let T = 0;
    triggers.forEach((st, i) => {
      const ch = chapters[i];
      onChapter(ch, st.progress);
      if (y >= st.start - 1) T = +ch.dataset.t + st.progress;
    });
    lastT = T;
    stage?.setT(T);
    if (T > 0.85) hideTag();
  };
  ScrollTrigger.addEventListener('refresh', sync);
  window.addEventListener('scroll', sync, { passive: true });
  sync();
} else {
  // reduced motion: each chapter shows its composed end state, with a short cross-fade
  const ends = { 0: 0, 1: 1.97, 2: 2.92, 3: 3.95, 4: 5 };
  let current = 0;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const T = ends[e.target.dataset.t];
      if (T === current) continue;
      current = T;
      canvas.style.opacity = '0';
      lastT = T;
      setTimeout(() => { stage?.setT(T, true); canvas.style.opacity = '1'; }, 220);
      if (e.target === roomCh) roomCh.classList.add('is-day');
    }
  }, { threshold: 0.5 });
  chapters.forEach((c) => io.observe(c));
}

function wireStage() {
  // only render while a transparent chapter is on screen
  if (stage) {
    const visible = new Set();
    const vio = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
      stage.setVisible(visible.size > 0 && !document.hidden);
    });
    chapters.forEach((c) => vio.observe(c));
    document.addEventListener('visibilitychange', () => stage.setVisible(visible.size > 0 && !document.hidden));
  }

  // ---------- the lamp: every light is someone ----------
  const tag = document.querySelector('.tag');
  const tagTown = tag.querySelector('.tag__town'), tagWhat = tag.querySelector('.tag__what');
  let lastMove = 0, autoTimer = 0, current = -1;
  const inHero = () => (stage ? stage.getT() < 0.85 : false);
  hideTag = () => { if (current !== -1) showTag(null); };
  function showTag(hit, x, y) {
    if (!hit) { tag.classList.remove('is-on'); current = -1; stage?.setFocus(null); return; }
    if (hit.i !== current) { current = hit.i; tagTown.textContent = hit.town; tagWhat.textContent = ACTIVITIES[(hit.i * 7) % ACTIVITIES.length]; }
    const w = tag.offsetWidth || 220;
    const tx = Math.min(window.innerWidth - w - 12, x + 18), ty = Math.max(80, y - 44);
    tag.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    tag.classList.add('is-on');
    stage?.setFocus(hit.pos);
  }
  if (stage && FINE && !RM) {
    window.addEventListener('pointermove', (e) => {
      lastMove = performance.now();
      if (!inHero() || e.target.closest('a, button, .hero, .nav')) { stage.setMouse(null); showTag(null); return; }
      stage.setMouse(e.clientX, e.clientY);
      showTag(stage.nearestBuilder(e.clientX, e.clientY, 40), e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener('pointerleave', () => { stage.setMouse(null); showTag(null); });
  }
  // ambient: when nobody is pointing, the map introduces someone on its own
  if (stage && !RM) {
    autoTimer = setInterval(() => {
      if (!inHero() || performance.now() - lastMove < 3500) { if (!inHero()) showTag(null); return; }
      for (let k = 0; k < 30; k++) {
        const x = window.innerWidth * (MOBILE ? 0.15 + Math.random() * 0.7 : 0.55 + Math.random() * 0.38);
        const y = window.innerHeight * (MOBILE ? 0.12 + Math.random() * 0.4 : 0.18 + Math.random() * 0.62);
        const hit = stage.nearestBuilder(x, y, 26);
        if (hit) { const s = stage.mapToScreen(hit.pos[0], hit.pos[1], 0.03); showTag(hit, s.x, s.y); return; }
      }
    }, 2600);
  }
}

// ---------- entrance ----------
function intro() {
  document.body.classList.remove('is-loading');
  if (RM) return;
  gsap.from('.hero__title .line > span', { yPercent: 110, duration: 1.4, ease: 'expo.out', stagger: 0.09, delay: 0.15 });
  gsap.from('.chapter--hero .reveal', { opacity: 0, y: 18, duration: 1.2, ease: 'expo.out', stagger: 0.08, delay: 0.55 });
}
(document.fonts?.ready || Promise.resolve()).then(() => requestAnimationFrame(intro));

// ---------- section reveals ----------
if (!RM) {
  document.querySelectorAll('.split').forEach((h) => {
    if (h.closest('.chapter--hero')) return;
    gsap.from(h.querySelectorAll('.line > span'), { yPercent: 110, duration: 1.2, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: h, start: 'top 85%', once: true } });
  });
  gsap.from('.chapter--room .lede, .chapter--room .trio li', { opacity: 0, y: 20, duration: 1, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: roomCh, start: 'top top', once: true } });
  gsap.from('.close > *', { opacity: 0, y: 24, duration: 1.2, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: '.chapter--close', start: 'top 30%', once: true } });
  gsap.from('.rules li', { opacity: 0, y: 40, duration: 1.2, ease: 'expo.out', stagger: 0.12, scrollTrigger: { trigger: '.rules', start: 'top 80%', once: true } });
}
document.querySelectorAll('.step').forEach((el) => ScrollTrigger.create({ trigger: el, start: 'top 80%', once: true, onEnter: () => el.classList.add('is-in') }));
document.querySelectorAll('.roster li').forEach((el) => ScrollTrigger.create({ trigger: el, start: 'top 68%', end: 'bottom 0%', toggleClass: 'is-lit' }));
if (RM) document.querySelectorAll('.step').forEach((el) => el.classList.add('is-in'));

// ---------- Hialeah plan + live distance ----------
const plan = document.querySelector('.plan');

async function boot() {
  const [mod, poster, data] = await Promise.all([import('./stage/stage.js'), import('./stage/poster.js'), import('./data/geo.json')]);
  geo = data.default; ACTIVITIES = mod.ACTIVITIES;
  poster.drawPlan(plan.querySelector('svg'), geo);
  ScrollTrigger.create({ trigger: plan, start: 'top 75%', once: true, onEnter: () => plan.classList.add('is-in') });
  const brickell = geo.hubs.find((h) => h[0] === 'Brickell');
  document.querySelector('[data-km="Brickell"]').textContent = `${Math.round(Math.hypot(brickell[1], brickell[2]))} km`;
  stage = mod.createStage({ canvas, labelsEl: document.querySelector('.stage__labels'), geo, mobile: MOBILE, still: RM });
  if (import.meta.env.DEV) window.__stage = stage;
  if (!stage) {
    document.documentElement.classList.add('no-webgl');
    document.querySelector('.stage__fallback').innerHTML = poster.posterSVG(geo);
    return;
  }
  stage.setT(lastT, true);
  if (lastT > 0.5) stage.skipIntro();
  wireStage();
  document.documentElement.classList.add('stage-ready');
}
boot();

window.addEventListener('load', () => ScrollTrigger.refresh());
