// Builds src/data/geo.json from US Census shapefiles (cb 500k counties + places, TIGER roads).
// Usage: node scripts/geo/build-geo.mjs <dir-with-unzipped-census-folders>
// Output units are kilometres in a local equirectangular projection centred on Hialeah.
import * as shapefile from 'shapefile';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW = process.argv[2];
if (!RAW) throw new Error('pass the raw census directory');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../src/data/geo.json');

const LAT0 = 25.8576, LON0 = -80.2781; // Hialeah city centre
const KX = 111.32 * Math.cos((LAT0 * Math.PI) / 180), KY = 110.57;
const BBOX = { w: -80.98, e: -79.9, s: 25.12, n: 27.08 };
const proj = ([lon, lat]) => [+((lon - LON0) * KX).toFixed(3), +((lat - LAT0) * KY).toFixed(3)];
const inBox = ([lon, lat]) => lon >= BBOX.w && lon <= BBOX.e && lat >= BBOX.s && lat <= BBOX.n;

async function read(path) {
  const src = await shapefile.open(path + '.shp', path + '.dbf');
  const out = [];
  for (;;) { const r = await src.read(); if (r.done) break; out.push(r.value); }
  return out;
}
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const lines = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);

// Douglas-Peucker on projected points
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// Sutherland-Hodgman clip of a ring (lon/lat) to BBOX
function clipRing(ring) {
  const edges = [
    (p) => p[0] >= BBOX.w, (p) => p[0] <= BBOX.e, (p) => p[1] >= BBOX.s, (p) => p[1] <= BBOX.n,
  ];
  const cross = [
    (a, b) => { const t = (BBOX.w - a[0]) / (b[0] - a[0]); return [BBOX.w, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (BBOX.e - a[0]) / (b[0] - a[0]); return [BBOX.e, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (BBOX.s - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), BBOX.s]; },
    (a, b) => { const t = (BBOX.n - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), BBOX.n]; },
  ];
  let out = ring;
  for (let k = 0; k < 4; k++) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      const ci = edges[k](cur), pi = edges[k](prev);
      if (ci) { if (!pi) out.push(cross[k](prev, cur)); out.push(cur); }
      else if (pi) out.push(cross[k](prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1; } return a / 2; };

// ---------- counties: fill polygons + coast / county-line classification ----------
const counties = (await read(join(RAW, 'cb_2023_us_county_500k/cb_2023_us_county_500k')))
  .filter((f) => f.properties.STATEFP === '12');
const key = (p) => p[0].toFixed(6) + ',' + p[1].toFixed(6);
const ekey = (a, b) => { const ka = key(a), kb = key(b); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
const edgeCount = new Map();
const rings = [];
for (const f of counties) for (const poly of polys(f.geometry)) for (const ring of poly) {
  rings.push(ring);
  for (let i = 0; i < ring.length - 1; i++) { const k = ekey(ring[i], ring[i + 1]); edgeCount.set(k, (edgeCount.get(k) || 0) + 1); }
}
const land = [], coast = [], borders = [];
const seenBorder = new Set();
function pushRun(run, target) {
  // split by bbox, project, simplify
  let cur = [];
  const flush = () => { if (cur.length > 1) { const s = simplify(cur.map(proj), 0.06); if (s.length > 1) target.push(s.flat()); } cur = []; };
  for (const p of run) { if (inBox(p)) cur.push(p); else flush(); }
  flush();
}
for (const ring of rings) {
  if (!ring.some(inBox)) continue;
  const clipped = clipRing(ring.slice(0, -1));
  if (clipped.length >= 3) {
    const pr = simplify(clipped.map(proj), 0.05);
    if (pr.length >= 3 && Math.abs(ringArea(pr)) > 0.05) land.push(pr.flat());
  }
  let run = [ring[0]], type = null;
  for (let i = 0; i < ring.length - 1; i++) {
    const k = ekey(ring[i], ring[i + 1]);
    const t = edgeCount.get(k) > 1 ? 'b' : 'c';
    if (type && t !== type) { if (type === 'c') pushRun(run, coast); else pushRun(run, borders); run = [ring[i]]; }
    if (t === 'b') { if (seenBorder.has(k)) { if (run.length > 1) pushRun(run, borders); run = [ring[i + 1]]; type = null; continue; } seenBorder.add(k); }
    run.push(ring[i + 1]); type = t;
  }
  if (type === 'c') pushRun(run, coast); else if (type === 'b') pushRun(run, borders);
}

// ---------- roads: interstates / turnpike / US + state routes ----------
const roadsRaw = await read(join(RAW, 'tl_2023_12_prisecroads/tl_2023_12_prisecroads'));
const highways = [], arterials = [];
for (const f of roadsRaw) {
  const primary = f.properties.MTFCC === 'S1100';
  for (const ln of lines(f.geometry)) {
    if (!ln.some(inBox)) continue;
    pushRun(ln, primary ? highways : arterials);
  }
}
const plen = (a) => { let l = 0; for (let i = 2; i < a.length; i += 2) l += Math.hypot(a[i] - a[i - 2], a[i + 1] - a[i - 1]); return l; };
const arterialsKept = arterials.filter((a) => plen(a) > 0.6);

// ---------- inland water (Lake Okeechobee + the quarry lakes around Hialeah) ----------
const water = [];
const okeechobee = [];
for (const c of ['12086', '12011', '12099', '12043', '12051', '12085', '12093']) {
  for (const f of await read(join(RAW, `tl_2023_${c}_areawater/tl_2023_${c}_areawater`))) {
    const big = f.properties.AWATER > 350000;
    const isLake = /Okeechobee/.test(f.properties.FULLNAME || '');
    if (!big && !isLake) continue;
    for (const poly of polys(f.geometry)) {
      const ring = poly[0];
      if (!ring.some(inBox)) continue;
      const clipped = clipRing(ring.slice(0, -1));
      if (clipped.length < 3) continue;
      const pr = simplify(clipped.map(proj), isLake ? 0.15 : 0.04);
      if (pr.length >= 3 && Math.abs(ringArea(pr)) > 0.15) (isLake ? okeechobee : water).push(pr.flat());
    }
  }
}

// ---------- Hialeah city outline ----------
const places = await read(join(RAW, 'cb_2023_12_place_500k/cb_2023_12_place_500k'));
const hialeah = places.filter((f) => f.properties.NAME === 'Hialeah')
  .flatMap((f) => polys(f.geometry).map((p) => simplify(p[0].slice(0, -1).map(proj), 0.02).flat()));

// ---------- seeded builder + investor positions ----------
let seed = 20261008;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const landProj = land.map((flat) => { const r = []; for (let i = 0; i < flat.length; i += 2) r.push([flat[i], flat[i + 1]]); return r; });
const pip = ([x, y], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const waterProj = [...okeechobee, ...water].map((flat) => { const r = []; for (let i = 0; i < flat.length; i += 2) r.push([flat[i], flat[i + 1]]); return r; });
const onLand = (p) => landProj.some((r) => pip(p, r)) && !waterProj.some((r) => pip(p, r));
// Lake Okeechobee sits inside county polygons; keep people out of it.
const lake = proj([-80.83, 26.95]);
const inLake = ([x, y]) => Math.hypot(x - lake[0], (y - lake[1]) * 0.9) < 26;

const towns = [
  ['Miami', 25.7617, -80.1918, 10], ['Hialeah', 25.8576, -80.2781, 6], ['Kendall', 25.6793, -80.3173, 5],
  ['Doral', 25.8195, -80.3553, 4], ['Miami Beach', 25.7907, -80.13, 3], ['Coral Gables', 25.7215, -80.2684, 3],
  ['Homestead', 25.4687, -80.4776, 3], ['Miami Gardens', 25.942, -80.2456, 3], ['North Miami', 25.8901, -80.1867, 2],
  ['Aventura', 25.9565, -80.1392, 2], ['Cutler Bay', 25.5808, -80.3468, 2], ['Wynwood', 25.801, -80.199, 3],
  ['Little Havana', 25.7654, -80.2214, 2], ['Westchester', 25.7548, -80.3273, 2], ['Fort Lauderdale', 26.1224, -80.1373, 7],
  ['Hollywood', 26.0112, -80.1495, 4], ['Pembroke Pines', 26.0078, -80.2963, 4], ['Miramar', 25.9861, -80.3036, 3],
  ['Weston', 26.1004, -80.3998, 2], ['Plantation', 26.1276, -80.2331, 2], ['Sunrise', 26.167, -80.256, 2],
  ['Coral Springs', 26.2712, -80.2706, 3], ['Pompano Beach', 26.2379, -80.1248, 3], ['Davie', 26.0765, -80.2521, 2],
  ['Boca Raton', 26.3683, -80.1289, 4], ['Delray Beach', 26.4615, -80.0728, 2], ['Boynton Beach', 26.5318, -80.0905, 2],
  ['West Palm Beach', 26.7153, -80.0534, 4], ['Wellington', 26.6618, -80.2684, 2], ['Jupiter', 26.9342, -80.0942, 2],
  ['Palm Beach Gardens', 26.8234, -80.1387, 2], ['Lake Worth', 26.6168, -80.057, 1], ['Belle Glade', 26.6845, -80.6676, 1],
];
const total = towns.reduce((s, t) => s + t[3], 0);
const builders = [];
const N = 760;
while (builders.length < N) {
  let p, town;
  if (rnd() < 0.86) {
    let r = rnd() * total; town = towns.find((t) => (r -= t[3]) < 0);
    const c = proj([town[2], town[1]]); const s = 2 + town[3] * 0.55;
    p = [c[0] + gauss() * s, c[1] + gauss() * s];
  } else {
    p = [(-40 + rnd() * 70), (-60 + rnd() * 180)];
    // nearest town for the label
    town = towns.reduce((b, t) => { const c = proj([t[2], t[1]]); const d = Math.hypot(c[0] - p[0], c[1] - p[1]); return d < b[1] ? [t, d] : b; }, [null, 1e9])[0];
  }
  if (!onLand(p) || inLake(p)) continue;
  builders.push([+p[0].toFixed(2), +p[1].toFixed(2), towns.indexOf(town)]);
}
const hubs = [
  ['Brickell', 25.765, -80.1936, 7], ['Miami Beach', 25.7907, -80.13, 5], ['Coconut Grove', 25.728, -80.2374, 4],
  ['Wynwood', 25.801, -80.199, 3], ['Coral Gables', 25.7215, -80.2684, 3], ['Las Olas', 26.1194, -80.1416, 4],
  ['Boca Raton', 26.3683, -80.1289, 3], ['Palm Beach', 26.7056, -80.0364, 5], ['Aventura', 25.9565, -80.1392, 2],
];
const investors = [];
for (const h of hubs) { const c = proj([h[2], h[1]]); for (let i = 0; i < h[3] * 2; i++) investors.push([+(c[0] + gauss() * 1.6).toFixed(2), +(c[1] + gauss() * 1.6).toFixed(2), hubs.indexOf(h)]); }

const out = {
  meta: { origin: [LAT0, LON0], units: 'km', source: 'US Census Bureau cb_2023 500k counties and places; TIGER 2023 primary/secondary roads' },
  land, water: [...okeechobee, ...water], coast, borders, highways, arterials: arterialsKept, hialeah,
  towns: towns.map((t) => [t[0], ...proj([t[2], t[1]])]),
  hubs: hubs.map((h) => [h[0], ...proj([h[2], h[1]])]),
  builders, investors,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
const n = (a) => a.reduce((s, x) => s + x.length / 2, 0);
console.log({ water: water.length, okeechobee: okeechobee.length, land: land.length, landPts: n(land), coast: n(coast), borders: n(borders), highways: n(highways), arterials: n(arterialsKept), hialeah: n(hialeah), builders: builders.length, investors: investors.length });
