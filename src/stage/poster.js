// SVG renderings of the same geo data: the no-WebGL poster and the Hialeah site plan.
const NS = 'http://www.w3.org/2000/svg';

function pathOf(flat, X, Y, close) {
  let d = '';
  for (let i = 0; i < flat.length; i += 2) d += (i ? 'L' : 'M') + X(flat[i]).toFixed(1) + ' ' + Y(flat[i + 1]).toFixed(1);
  return close ? d + 'Z' : d;
}

export function posterSVG(geo) {
  // portrait-friendly frame over the urban corridor; slice to cover
  const x0 = -62, x1 = 30, y0 = -52, y1 = 125, s = 6;
  const X = (x) => (x - x0) * s, Y = (y) => (y1 - y) * s;
  const W = (x1 - x0) * s, H = (y1 - y0) * s;
  let out = `<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><rect width="100%" height="100%" fill="#07090c"/>`;
  out += geo.land.map((a) => `<path d="${pathOf(a, X, Y, 1)}" fill="#0f141b"/>`).join('');
  out += geo.water.map((a) => `<path d="${pathOf(a, X, Y, 1)}" fill="#07090c"/>`).join('');
  out += `<g fill="none" stroke="#1d2632" stroke-width="1">${geo.arterials.map((a) => `<path d="${pathOf(a, X, Y)}"/>`).join('')}</g>`;
  out += `<g fill="none" stroke="#36475a" stroke-width="1.6">${geo.highways.map((a) => `<path d="${pathOf(a, X, Y)}"/>`).join('')}</g>`;
  out += `<g fill="none" stroke="#8193a8" stroke-width="1.4">${geo.coast.map((a) => `<path d="${pathOf(a, X, Y)}"/>`).join('')}</g>`;
  out += `<g fill="#ffb347">${geo.builders.map((b, i) => `<circle cx="${X(b[0]).toFixed(1)}" cy="${Y(b[1]).toFixed(1)}" r="${(2 + (i % 5) * 0.4).toFixed(1)}" opacity="${(0.35 + (i % 7) * 0.09).toFixed(2)}"/>`).join('')}</g>`;
  out += '</svg>';
  return out;
}

export function drawPlan(svg, geo) {
  // Hialeah city limits, fit to a 400 box with margin
  const pts = geo.hialeah.flat();
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let i = 0; i < pts.length; i += 2) { minx = Math.min(minx, pts[i]); maxx = Math.max(maxx, pts[i]); miny = Math.min(miny, pts[i + 1]); maxy = Math.max(maxy, pts[i + 1]); }
  const pad = 2.2, span = Math.max(maxx - minx, maxy - miny) + pad * 2;
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, s = 400 / span;
  const X = (x) => 200 + (x - cx) * s, Y = (y) => 200 - (y - cy) * s;
  const inView = (a) => { for (let i = 0; i < a.length; i += 2) { const x = X(a[i]), y = Y(a[i + 1]); if (x > -20 && x < 420 && y > -20 && y < 420) return true; } return false; };
  let html = `<defs><clipPath id="planclip"><rect width="400" height="400" rx="28"/></clipPath></defs><g clip-path="url(#planclip)">`;
  html += geo.water.filter(inView).map((a) => `<path class="p-water" d="${pathOf(a, X, Y, 1)}"/>`).join('');
  html += geo.arterials.filter(inView).map((a) => `<path class="p-road" d="${pathOf(a, X, Y)}"/>`).join('');
  html += geo.highways.filter(inView).map((a) => `<path class="p-hwy" d="${pathOf(a, X, Y)}"/>`).join('');
  html += geo.hialeah.map((a) => `<path class="p-city p-stroke" d="${pathOf(a, X, Y, 1)}"/>`).join('');
  const hx = X(0), hy = Y(0);
  html += `<circle class="p-pin-ring" cx="${hx}" cy="${hy}" r="7"/><circle class="p-pin" cx="${hx}" cy="${hy}" r="6"/>`;
  html += `<text class="p-label" x="${hx + 14}" y="${hy + 3}">THE STUDIO</text>`;
  html += `<text class="p-label p-label--soft" x="22" y="34">HIALEAH, FL</text><text class="p-label p-label--soft" x="22" y="48">N ↑</text>`;
  // scale bar: 2 km
  const bar = 2 * s;
  html += `<g transform="translate(22 372)"><path d="M0 0H${bar.toFixed(1)}" stroke="#0e1013" stroke-width="1.4"/><path d="M0 -4V4M${bar.toFixed(1)} -4V4" stroke="#0e1013"/><text class="p-label p-label--soft" x="${(bar + 8).toFixed(1)}" y="3">2 KM</text></g>`;
  html += '</g>';
  svg.innerHTML = html;
  svg.querySelectorAll('.p-stroke').forEach((p) => p.style.setProperty('--len', Math.ceil(p.getTotalLength())));
}
