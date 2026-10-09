// Liquid light buttons: cursor-tracked highlight, magnetic pull, direction-aware fill,
// and a pulse that travels into the 3D map when pressed.
export function initButtons({ fine, reduced, onPulse, onHover } = {}) {
  if (/Chrome\//.test(navigator.userAgent) && !/Edg\/|OPR\//.test(navigator.userAgent) && CSS.supports('backdrop-filter', 'url(#liquid)')) document.documentElement.classList.add('refract');
  document.querySelectorAll('.lbtn').forEach((b) => {
    if (b.classList.contains('lbtn--glass') && !b.querySelector('.lbtn__fill')) { const f = document.createElement('span'); f.className = 'lbtn__fill'; f.setAttribute('aria-hidden', 'true'); b.prepend(f); }
    const edge = (e) => { const r = b.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100]; };
    b.addEventListener('pointerenter', (e) => {
      const [x, y] = edge(e);
      b.style.setProperty('--ex', `${x.toFixed(1)}%`); b.style.setProperty('--ey', `${y.toFixed(1)}%`);
      b.classList.add('is-hot');
      onHover?.(b);
      if (b.dataset.pulse && fine) { const r = b.getBoundingClientRect(); onPulse?.(r.left + r.width / 2, r.top + r.height / 2, b.dataset.pulse, 0.5); }
    });
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(0)}px`); b.style.setProperty('--my', `${(e.clientY - r.top).toFixed(0)}px`);
      if (!fine || reduced || !b.hasAttribute('data-magnetic')) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      b.style.setProperty('--tx', `${Math.max(-12, Math.min(12, dx * 0.18)).toFixed(1)}px`);
      b.style.setProperty('--ty', `${Math.max(-10, Math.min(10, dy * 0.3)).toFixed(1)}px`);
    });
    b.addEventListener('pointerleave', (e) => {
      const [x, y] = edge(e);
      b.style.setProperty('--ex', `${x.toFixed(1)}%`); b.style.setProperty('--ey', `${y.toFixed(1)}%`);
      b.classList.remove('is-hot');
      b.style.setProperty('--tx', '0px'); b.style.setProperty('--ty', '0px');
    });
    b.addEventListener('focus', () => b.classList.add('is-hot'));
    b.addEventListener('blur', () => b.classList.remove('is-hot'));
    b.addEventListener('pointerdown', () => {
      if (!b.dataset.pulse) return;
      const r = b.getBoundingClientRect();
      onPulse?.(r.left + r.width / 2, r.top + r.height / 2, b.dataset.pulse, 1);
    });
  });
}
