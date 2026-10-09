// Variable-font choreography. Headlines are split into characters that assemble from thin and narrow
// to their full width and weight; "alone" stays apart; the closing "alone." pulls its letters together.
import gsap from 'gsap';

function splitInto(el, cls) {
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'w';
          for (const c of part) { const s = document.createElement('span'); s.className = cls; s.textContent = c; w.appendChild(s); }
          frag.appendChild(w);
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === 1) walk(child);
    }
  };
  walk(el);
  return [...el.querySelectorAll('.' + cls)];
}

export function splitHeadings(root = document) {
  const out = [];
  root.querySelectorAll('.kin').forEach((h) => {
    if (h.dataset.split) return;
    h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
    h.querySelectorAll('.kin__line').forEach((l) => l.setAttribute('aria-hidden', 'true'));
    const chars = splitInto(h, 'ch');
    h.dataset.split = '1';
    out.push({ el: h, chars });
  });
  return out;
}

export function revealHeading({ el, chars }, { delay = 0, scrollTrigger } = {}) {
  const hero = el.dataset.kin === 'hero';
  const targets = chars.map((c) => (c.closest('.alone') ? { wd: 75, wg: 260 } : hero ? { wd: 112, wg: 660 } : { wd: 108, wg: 640 }));
  return gsap.fromTo(chars,
    { opacity: 0, yPercent: 38, '--wd': 75, '--wg': 180, filter: 'blur(10px)' },
    {
      opacity: 1, yPercent: 0, filter: 'blur(0px)', duration: 1.25, ease: 'expo.out', delay,
      '--wd': (i) => targets[i].wd, '--wg': (i) => targets[i].wg,
      stagger: { each: 0.018, from: 'start' },
      scrollTrigger,
      onComplete: () => gsap.set(chars, { clearProps: 'filter,--wd,--wg,transform' }),
    });
}

// closing word: letters start apart and thin, come together wide and heavy as k goes 0 → 1
export function makeGather(el) {
  splitInto(el, 'gc');
  return (k) => {
    el.style.setProperty('--gwd', (75 + 45 * k).toFixed(1));
    el.style.setProperty('--gwg', (250 + 470 * k).toFixed(0));
    el.style.setProperty('--gsp', (0.12 * (1 - k)).toFixed(3) + 'em');
  };
}

// footer wordmark: letters swell toward the cursor
export function proximity(el) {
  const chars = splitInto(el, 'pc');
  let raf = 0, mx = -1e4;
  const update = () => {
    raf = 0;
    for (const c of chars) {
      const r = c.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mx);
      const k = Math.max(0, 1 - d / (window.innerWidth * 0.22));
      const e = k * k * (3 - 2 * k);
      c.style.setProperty('--pwd', (mx < -1e3 ? 108 : 90 + e * 35).toFixed(1));
      c.style.setProperty('--pwg', (mx < -1e3 ? 700 : 480 + e * 420).toFixed(0));
    }
  };
  el.closest('footer').addEventListener('pointermove', (e) => { mx = e.clientX; if (!raf) raf = requestAnimationFrame(update); });
  el.closest('footer').addEventListener('pointerleave', () => { mx = -1e4; if (!raf) raf = requestAnimationFrame(update); });
  update();
}
