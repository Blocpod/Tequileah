// SVG renderings of the same geo data: the no-WebGL poster and the Hialeah site plan.
const NS = 'http://www.w3.org/2000/svg';

function pathOf(flat, X, Y, close) {
  let d = '';
  for (let i = 0; i < flat.length; i += 2) d += (i ? 'L' : 'M') + X(flat[i]).toFixed(1) + ' ' + Y(flat[i + 1]).toFixed(1);
  return close ? d + 'Z' : d;
}

// The no-GPU poster: the same map drawn once onto a 2D canvas (cheap, no DOM weight).
export function posterCanvas(geo, host) {
  const cv = document.createElement('canvas');
  host.replaceChildren(cv);
  const draw = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const g = cv.getContext('2d');
    // frame the urban corridor; cover the viewport
    const x0 = -62, x1 = 30, y0 = -52, y1 = 125;
    const s = Math.max(W / (x1 - x0), H / (y1 - y0)) * dpr;
    const ox = (cv.width - (x1 - x0) * s) / 2 + (W > 860 ? cv.width * 0.18 : 0), oy = (cv.height - (y1 - y0) * s) / 2;
    const X = (x) => ox + (x - x0) * s, Y = (y) => oy + (y1 - y) * s;
    const path = (a, close) => { g.beginPath(); for (let i = 0; i < a.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, X(a[i]), Y(a[i + 1])); if (close) g.closePath(); };
    g.fillStyle = '#07090c'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#0c1117'; geo.land.forEach((a) => { path(a, true); g.fill(); });
    g.fillStyle = '#07090c'; geo.water.forEach((a) => { path(a, true); g.fill(); });
    g.lineWidth = dpr * 0.7; g.strokeStyle = '#18202a'; geo.arterials.forEach((a) => { path(a); g.stroke(); });
    g.lineWidth = dpr * 1.2; g.strokeStyle = '#2c394a'; geo.highways.forEach((a) => { path(a); g.stroke(); });
    g.lineWidth = dpr; g.strokeStyle = '#7d8fa6'; geo.coast.forEach((a) => { path(a); g.stroke(); });
    g.globalCompositeOperation = 'lighter';
    geo.builders.forEach((b, i) => {
      const x = X(b[0]), y = Y(b[1]), r = dpr * (6 + (i % 5));
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,190,110,0.85)'); grd.addColorStop(0.25, 'rgba(255,140,40,0.35)'); grd.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    });
    g.globalCompositeOperation = 'source-over';
  };
  draw();
  let t = 0;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(draw, 200); });
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
