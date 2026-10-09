// The lamp: a point of light that follows the pointer; over actions it opens into a labelled lens.
export function initCursor() {
  const el = document.querySelector('.cursor');
  if (!el) return null;
  document.documentElement.classList.add('has-cursor');
  const dot = el.querySelector('.cursor__dot'), ring = el.querySelector('.cursor__ring'), label = el.querySelector('.cursor__label');
  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, raf = 0, shown = false;
  const tick = () => {
    rx += (x - rx) * 0.2; ry += (y - ry) * 0.2;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    raf = Math.abs(x - rx) + Math.abs(y - ry) > 0.2 ? requestAnimationFrame(tick) : 0;
  };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    if (!shown) { shown = true; rx = x; ry = y; el.style.opacity = '1'; }
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    const t = e.target;
    const act = t.closest('[data-cursor], a, button, summary, label.chip');
    const text = t.closest('input:not([type=radio]):not([type=checkbox]), textarea');
    el.classList.toggle('is-text', !!text);
    el.classList.toggle('is-hover', !!act);
    label.textContent = act?.dataset.cursor || (act ? (act.tagName === 'SUMMARY' ? 'Open' : 'Go') : '');
    const zone = t.closest('[data-tone]');
    let tone = zone?.dataset.tone || 'night';
    if (zone?.classList.contains('chapter--room')) tone = zone.classList.contains('is-day') ? 'day' : 'night';
    if (t.closest('.lbtn, .investor-card, .room, .pipe')) tone = 'night';
    el.dataset.tone = tone;
  });
  document.addEventListener('pointerdown', () => el.classList.add('is-down'));
  document.addEventListener('pointerup', () => el.classList.remove('is-down'));
  document.addEventListener('pointerleave', () => { el.style.opacity = '0'; shown = false; });
  return el;
}
