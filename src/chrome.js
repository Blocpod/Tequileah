// Shared page chrome: nav tone, Miami clock, mobile menu, anchor scrolling.
export function initChrome({ lenis = null } = {}) {
  const nav = document.querySelector('.nav');
  const sections = [...document.querySelectorAll('main > section, .foot, .form-page')];

  function toneAt(y) {
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      if (r.top <= y && r.bottom > y) {
        if (s.classList.contains('chapter--room')) return s.classList.contains('is-day') ? 'day' : 'night';
        return { tone: s.dataset.tone || 'night', sheet: s.classList.contains('sheet') };
      }
    }
    return 'night';
  }
  let ticking = false;
  function update() {
    ticking = false;
    const t = toneAt(36);
    const tone = typeof t === 'string' ? t : t.tone;
    nav.dataset.tone = tone;
    nav.classList.toggle('is-scrolled', typeof t === 'object' && t.sheet);
  }
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  (lenis ? lenis.on.bind(lenis, 'scroll') : (fn) => window.addEventListener('scroll', fn, { passive: true }))(req);
  window.addEventListener('resize', req);
  setInterval(req, 500); // room chapter flips tone without scrolling while T eases
  update();

  // Miami clock
  const clock = document.querySelector('[data-clock]');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
    const tick = () => { clock.textContent = `Miami ${fmt.format(new Date())}`; };
    tick(); setInterval(tick, 15000);
  }

  // mobile menu
  const btn = document.querySelector('.nav__menu'), menu = document.getElementById('menu');
  if (btn && menu) {
    const set = (open) => {
      btn.setAttribute('aria-expanded', String(open)); menu.hidden = !open;
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) { lenis?.stop(); nav.dataset.tone = 'night'; menu.querySelector('a')?.focus(); } else { lenis?.start(); }
    };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); } });
  }

  // in-page anchors through Lenis
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const el = id === '#main' ? document.body : document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(el, { offset: id === '#main' ? 0 : -8, duration: 1.6 });
    else el.scrollIntoView();
    history.replaceState(null, '', id);
  });
}
