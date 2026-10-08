// The Gravity stage: one map, one set of lights, one timeline value T.
// T 0..1 hero (scattered) · 1..2 gather to Hialeah · 2..3 the room (day) · 3..4 pipeline · 4..5 close (connected)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const NIGHT = new THREE.Color('#07090c');
const PAPER = new THREE.Color('#f1ede4');
const AMBER = new THREE.Color('#ffb347');
const AQUA = new THREE.Color('#46e0c9');
const INK = new THREE.Color('#0e1013');

const FOG = { value: new THREE.Vector2(1e5, 2e5) };
const DUSK = new THREE.Color('#2b1a1c');
const SUN = new THREE.Color('#e9c9a0');
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const ACTIVITIES = [
  'shipping v0.4', 'training a small model', 'debugging at 2am', 'sketching a new brand', 'editing a short film',
  'soldering a prototype', 'writing the first API', 'pitch deck, draft 9', 'testing with ten users', 'designing onboarding',
  'building an agent', 'recording a demo', 'rewriting the landing page', 'cutting a trailer', 'fixing the checkout',
  'mapping a hardware BOM', 'scoring a game', 'porting to iOS', 'cleaning a dataset', 'launching on Friday',
];

// Camera keyframes along T. tx/ty map km, dist km, tilt rad from top-down, yaw rad, off = horizontal view offset (desktop)
const KEYS = [
  { t: 0.0, tx: -12, ty: 38, dist: 214, tilt: 0.58, yaw: -0.1, off: -0.2 },
  { t: 1.0, tx: -10, ty: 32, dist: 212, tilt: 0.6, yaw: -0.05, off: -0.18 },
  { t: 1.62, tx: -1, ty: 4, dist: 44, tilt: 0.62, yaw: 0.22, off: -0.12 },
  { t: 2.0, tx: 0, ty: 0, dist: 'room', tilt: 0.0, yaw: 0.0, off: -0.2 },
  { t: 3.0, tx: 0, ty: 0, dist: 'room', tilt: 0.12, yaw: 0.06, off: -0.2 },
  { t: 3.55, tx: 3, ty: 15, dist: 112, tilt: 1.03, yaw: 1.42, off: -0.27, m: { tx: -2, ty: 26, dist: 150, tilt: 0.78, yaw: -0.12 } },
  { t: 4.0, tx: 2, ty: 24, dist: 140, tilt: 0.98, yaw: 1.3, off: -0.22, m: { tx: -6, ty: 34, dist: 190, tilt: 0.7, yaw: -0.1 } },
  { t: 5.0, tx: -12, ty: 44, dist: 238, tilt: 0.42, yaw: 0.06, off: 0 },
];

function flatToSegments(polys) {
  const out = [];
  for (const a of polys) for (let i = 0; i < a.length - 2; i += 2) out.push(a[i], a[i + 1], 0, a[i + 2], a[i + 3], 0);
  return new Float32Array(out);
}
function fillGeometry(polys, z) {
  const geos = [];
  for (const a of polys) {
    const pts = []; for (let i = 0; i < a.length; i += 2) pts.push(new THREE.Vector2(a[i], a[i + 1]));
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
    g.translate(0, 0, z);
    geos.push(g);
  }
  return mergeGeometries(geos);
}

const lineMat = (night, day, alpha) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uNight: { value: new THREE.Color(night) }, uDay: { value: new THREE.Color(day) }, uDayMix: { value: 0 }, uAlpha: { value: alpha }, uFade: { value: 1 }, uFog: FOG },
  vertexShader: 'varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform vec3 uNight; uniform vec3 uDay; uniform float uDayMix; uniform float uAlpha; uniform float uFade; uniform vec2 uFog; varying float vD; void main(){ float f = 1.0 - smoothstep(uFog.x, uFog.y, vD) * 0.94; gl_FragColor = vec4(mix(uNight,uDay,uDayMix), uAlpha*uFade*f); }',
});

export function createStage({ canvas, labelsEl, geo, mobile = false, mode = 'home', still = false }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  const DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(NIGHT, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 2000);
  const world = new THREE.Group();
  scene.add(world);

  // ---------------- map ----------------
  const landMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uNight: { value: new THREE.Color('#0f141b') }, uDay: { value: new THREE.Color('#e9e4d8') }, uDayMix: { value: 0 }, uAlpha: { value: 1 }, uFade: { value: 1 }, uFog: FOG },
    vertexShader: 'varying vec2 vP; varying float vD; void main(){ vP = position.xy; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uNight; uniform vec3 uDay; uniform float uDayMix; uniform float uAlpha; uniform float uFade; uniform vec2 uFog; varying vec2 vP; varying float vD;
      void main(){ // faint survey grid on land, every 5 km
        vec2 g = abs(fract(vP/5.0 - 0.5) - 0.5) / fwidth(vP/5.0);
        float grid = 1.0 - min(min(g.x,g.y),1.0);
        vec3 c = mix(uNight, uDay, uDayMix);
        c += grid * mix(0.035, -0.03, uDayMix);
        gl_FragColor = vec4(c, uAlpha*uFade*(1.0 - smoothstep(uFog.x, uFog.y, vD) * 0.96)); }`,
  });
  landMat.extensions = { derivatives: true };
  const land = new THREE.Mesh(fillGeometry(geo.land, 0), landMat);
  const waterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uNight: { value: NIGHT.clone() }, uDay: { value: new THREE.Color('#dfe5df') }, uDayMix: { value: 0 }, uAlpha: { value: 1 }, uFade: { value: 1 }, uFog: { value: new THREE.Vector2(1e5, 2e5) } },
    vertexShader: lineMat().vertexShader, fragmentShader: lineMat().fragmentShader,
  });
  const water = new THREE.Mesh(fillGeometry(geo.water, 0.001), waterMat);
  const mkLines = (polys, mat, z = 0.002) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(flatToSegments(polys), 3)); const m = new THREE.LineSegments(g, mat); m.position.z = z; return m; };
  const arterials = mkLines(geo.arterials, lineMat('#1d2632', '#cfc8b8', 1));
  const highways = mkLines(geo.highways, lineMat('#36475a', '#a8a090', 1));
  const borders = mkLines(geo.borders, lineMat('#27303c', '#c9c2b2', 0.8));
  const coast = mkLines(geo.coast, lineMat('#8193a8', '#5d6066', 0.85));
  const city = mkLines(geo.hialeah.map((a) => [...a, a[0], a[1]]), lineMat('#ffb347', '#0e1013', 0.0), 0.004);
  const mapLayers = [land, water, arterials, highways, borders, coast];
  [land, water, arterials, highways, borders, coast, city].forEach((o, i) => { o.renderOrder = i; world.add(o); });

  // ---------------- the room (seats + drawing) ----------------
  const builders = geo.builders;
  const N = builders.length;
  const TABLES = 8, PER_SIDE = Math.ceil(N / (TABLES * 2));
  const SP = 0.05; // km between seats
  const tableLen = PER_SIDE * SP, rowGap = 0.3, sideGap = 0.075;
  const roomW = tableLen + 0.6, roomH = TABLES * rowGap + 0.4;
  const seats = new Float32Array(N * 2);
  // assign seats so lights from the same part of the map sit near each other (by angle around Hialeah)
  const order = [...Array(N).keys()].sort((a, b) => Math.atan2(builders[a][1], builders[a][0]) - Math.atan2(builders[b][1], builders[b][0]));
  order.forEach((bi, k) => {
    const table = Math.floor(k / (PER_SIDE * 2)), r = k % (PER_SIDE * 2), side = r % 2, idx = Math.floor(r / 2);
    seats[bi * 2] = -tableLen / 2 + SP / 2 + idx * SP;
    seats[bi * 2 + 1] = -((TABLES - 1) * rowGap) / 2 + table * rowGap + (side ? sideGap : -sideGap);
  });
  const roomLines = [];
  const rect = (x0, y0, x1, y1) => roomLines.push(x0, y0, 0, x1, y0, 0, x1, y0, 0, x1, y1, 0, x1, y1, 0, x0, y1, 0, x0, y1, 0, x0, y0, 0);
  const hw = roomW / 2, hh = roomH / 2, door = 0.36;
  // walls, double line, with a door gap on the south wall
  for (const o of [0, 0.03]) {
    roomLines.push(-hw - o, -hh - o, 0, -door / 2, -hh - o, 0, door / 2, -hh - o, 0, hw + o, -hh - o, 0);
    roomLines.push(hw + o, -hh - o, 0, hw + o, hh + o, 0, hw + o, hh + o, 0, -hw - o, hh + o, 0, -hw - o, hh + o, 0, -hw - o, -hh - o, 0);
  }
  for (let t = 0; t < TABLES; t++) { const y = -((TABLES - 1) * rowGap) / 2 + t * rowGap; rect(-tableLen / 2, y - 0.03, tableLen / 2, y + 0.03); }
  // door swing
  for (let i = 0; i < 16; i++) { const a0 = (i / 16) * Math.PI / 2, a1 = ((i + 1) / 16) * Math.PI / 2; roomLines.push(-door / 2 + Math.cos(a0) * door, -hh + Math.sin(a0) * door, 0, -door / 2 + Math.cos(a1) * door, -hh + Math.sin(a1) * door, 0); }
  const roomGeo = new THREE.BufferGeometry();
  roomGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(roomLines), 3));
  const roomMat = lineMat('#ffb347', '#0e1013', 0.0);
  const room = new THREE.LineSegments(roomGeo, roomMat); room.position.z = 0.006; room.renderOrder = 8; world.add(room);

  // collaboration links inside the room (each seat to one nearby seat at another table)
  const seatLinks = [], seatOrder = [];
  let s2 = 7;
  const r2 = () => ((s2 = (s2 * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const j = Math.floor(r2() * N); if (i === j) continue;
    const dx = seats[i * 2] - seats[j * 2], dy = seats[i * 2 + 1] - seats[j * 2 + 1];
    if (Math.hypot(dx, dy) > 0.75 || Math.abs(dy) < 0.2) continue;
    seatLinks.push(seats[i * 2], seats[i * 2 + 1], 0, seats[j * 2], seats[j * 2 + 1], 0);
    const o = r2(); seatOrder.push(o, o);
  }
  const linkMat = (night, day) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uReveal: { value: 0 }, uAlpha: { value: 0 }, uNight: { value: new THREE.Color(night) }, uDay: { value: new THREE.Color(day) }, uDayMix: { value: 0 } },
    vertexShader: 'attribute float aOrder; varying float vO; void main(){ vO = aOrder; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uReveal; uniform float uAlpha; uniform vec3 uNight; uniform vec3 uDay; uniform float uDayMix; varying float vO; void main(){ float a = smoothstep(vO, vO+0.08, uReveal*1.08); gl_FragColor = vec4(mix(uNight,uDay,uDayMix), a*uAlpha); }',
  });
  const slGeo = new THREE.BufferGeometry();
  slGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seatLinks), 3));
  slGeo.setAttribute('aOrder', new THREE.BufferAttribute(new Float32Array(seatOrder), 1));
  const seatLinkMat = linkMat('#ffb347', '#0e1013');
  const seatLinkMesh = new THREE.LineSegments(slGeo, seatLinkMat); seatLinkMesh.position.z = 0.007; seatLinkMesh.renderOrder = 9; world.add(seatLinkMesh);

  // the connected region (close): each builder to its nearest neighbours, revealed outward from Hialeah
  const net = [], netOrder = [];
  for (let i = 0; i < N; i++) {
    const [xi, yi] = builders[i];
    const near = [];
    for (let j = 0; j < N; j++) { if (j === i) continue; const d = Math.hypot(builders[j][0] - xi, builders[j][1] - yi); if (d < 9) near.push([d, j]); }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, j] of near.slice(0, 2)) { if (j < i) continue; net.push(xi, yi, 0, builders[j][0], builders[j][1], 0); const o = Math.min(1, Math.hypot(xi, yi) / 150); netOrder.push(o, o); }
  }
  // spokes: a share of builders keep a line to the room
  for (let i = 0; i < N; i += 9) { net.push(builders[i][0], builders[i][1], 0, 0, 0, 0); const o = Math.min(1, Math.hypot(builders[i][0], builders[i][1]) / 150); netOrder.push(o, 0); }
  const netGeo = new THREE.BufferGeometry();
  netGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(net), 3));
  netGeo.setAttribute('aOrder', new THREE.BufferAttribute(new Float32Array(netOrder), 1));
  const netMat = linkMat('#ffb347', '#0e1013');
  const netMesh = new THREE.LineSegments(netGeo, netMat); netMesh.position.z = 0.05; netMesh.renderOrder = 10; world.add(netMesh);

  // ---------------- builder lights ----------------
  const bGeo = new THREE.BufferGeometry();
  const home = new Float32Array(N * 2), rand = new Float32Array(N * 4), posDummy = new Float32Array(N * 3);
  let s3 = 99;
  const r3 = () => ((s3 = (s3 * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) { home[i * 2] = builders[i][0]; home[i * 2 + 1] = builders[i][1]; rand[i * 4] = r3(); rand[i * 4 + 1] = r3(); rand[i * 4 + 2] = r3(); rand[i * 4 + 3] = r3(); }
  bGeo.setAttribute('position', new THREE.BufferAttribute(posDummy, 3));
  bGeo.setAttribute('aHome', new THREE.BufferAttribute(home, 2));
  bGeo.setAttribute('aSeat', new THREE.BufferAttribute(seats, 2));
  bGeo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  bGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 30, 0), 400);
  const bMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 }, uConv: { value: 0 }, uClose: { value: 0 }, uSync: { value: 0 }, uDay: { value: 0 },
      uPx: { value: 4 }, uIntro: { value: 0 }, uMouse: { value: new THREE.Vector3(1e4, 1e4, 0) }, uLamp: { value: 0 },
      uAmber: { value: AMBER }, uInk: { value: INK }, uFog: FOG, uFocus: { value: new THREE.Vector3(1e4, 1e4, 0) }, uYou: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute vec2 aHome; attribute vec2 aSeat; attribute vec4 aRand;
      uniform float uTime, uConv, uClose, uSync, uDay, uPx, uIntro, uLamp;
      uniform vec3 uMouse, uFocus;
      uniform vec2 uFog;
      varying float vB; varying float vTrav;
      vec2 bez(vec2 a, vec2 c, vec2 b, float t){ float u = 1.0-t; return u*u*a + 2.0*u*t*c + t*t*b; }
      void main(){
        float d = length(aHome);
        // gather: far lights leave first, so the arrival is a wave
        float delay = (1.0 - clamp(d/150.0, 0.0, 1.0)) * 0.42 + aRand.x * 0.16;
        float k = smoothstep(delay, delay + 0.42, uConv);
        vec2 dir = aSeat - aHome; vec2 perp = vec2(-dir.y, dir.x);
        vec2 p = bez(aHome, mix(aHome, aSeat, 0.5) + perp * 0.32, aSeat, k);
        float lift = sin(k * 3.14159) * (length(dir) * 0.14 + 0.3);
        // close: back home along a gentler curve
        float dc = clamp(d/150.0, 0.0, 1.0) * 0.35 + aRand.y * 0.15;
        float kc = smoothstep(dc, dc + 0.5, uClose);
        if (uClose > 0.0) {
          vec2 dir2 = aHome - aSeat; vec2 perp2 = vec2(-dir2.y, dir2.x);
          p = bez(aSeat, mix(aSeat, aHome, 0.5) - perp2 * 0.18, aHome, kc);
          lift = sin(kc * 3.14159) * (length(dir2) * 0.1 + 0.3);
        }
        vTrav = max(sin(k * 3.14159), sin(kc * 3.14159));
        vec4 mv = modelViewMatrix * vec4(p, 0.03 + lift, 1.0);
        gl_Position = projectionMatrix * mv;
        // flicker: out of sync alone, in rhythm together
        float ph = mix(aRand.y * 6.2831, 0.0, uSync);
        float sp = mix(0.5 + aRand.z * 1.7, 1.15, uSync);
        float tw = 0.5 + 0.5 * sin(uTime * sp + ph);
        float b = mix(0.42 + 0.58 * tw * tw, 0.8 + 0.2 * tw, uSync);
        b = max(b, vTrav * 1.2);
        float lamp = uLamp * smoothstep(14.0, 0.0, distance(p, uMouse.xy));
        b += lamp * 1.1;
        float focus = smoothstep(1.2, 0.0, distance(p, uFocus.xy));
        b += focus * 1.5;
        b *= step(aRand.x, uIntro * 1.02);
        b *= 1.0 - smoothstep(uFog.x, uFog.y, -mv.z) * 0.8;
        vB = b;
        float size = uPx * (0.75 + aRand.w * 0.6) * (1.0 + lamp * 0.9 + vTrav * 0.5 + focus * 1.4);
        size = mix(size, uPx * 0.95, uDay);
        gl_PointSize = size;
      }`,
    fragmentShader: /* glsl */`
      uniform float uDay; uniform vec3 uAmber; uniform vec3 uInk;
      varying float vB; varying float vTrav;
      void main(){
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        float core = smoothstep(0.42, 0.0, r);
        float halo = exp(-r * r * 4.0) * 0.55;
        vec3 night = mix(uAmber, vec3(1.0, 0.95, 0.85), core * 0.6);
        float aN = (core + halo) * vB;
        float aD = smoothstep(0.62, 0.45, r);
        vec3 c = mix(night, uInk, uDay);
        float a = mix(aN, aD * min(1.0, 0.45 + vB), uDay);
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
      }`,
  });
  const bPoints = new THREE.Points(bGeo, bMat); bPoints.renderOrder = 20; bPoints.frustumCulled = false; world.add(bPoints);

  // ---------------- investors + the pipeline ----------------
  const inv = geo.investors, NI = inv.length;
  const iGeo = new THREE.BufferGeometry();
  const iPos = new Float32Array(NI * 3), iRand = new Float32Array(NI);
  inv.forEach((p, i) => { iPos[i * 3] = p[0]; iPos[i * 3 + 1] = p[1]; iPos[i * 3 + 2] = 0.05; iRand[i] = (i * 0.618) % 1; });
  iGeo.setAttribute('position', new THREE.BufferAttribute(iPos, 3));
  iGeo.setAttribute('aR', new THREE.BufferAttribute(iRand, 1));
  const iMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uShow: { value: 0 }, uPx: { value: 4 }, uAqua: { value: AQUA } },
    vertexShader: 'attribute float aR; uniform float uTime, uShow, uPx; varying float vA; void main(){ float s = smoothstep(aR*0.6, aR*0.6+0.4, uShow); vA = s * (0.7 + 0.3*sin(uTime*1.3 + aR*20.0)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = uPx * 1.5 * (0.6 + 0.4*s); }',
    fragmentShader: 'uniform vec3 uAqua; varying float vA; void main(){ float r = length(gl_PointCoord-0.5)*2.0; if(r>1.0) discard; float core = smoothstep(0.38,0.0,r); float ring = smoothstep(0.08,0.0,abs(r-0.78))*0.7; float halo = exp(-r*r*4.0)*0.4; gl_FragColor = vec4(mix(uAqua, vec3(0.9,1.0,0.98), core*0.5), (core+halo+ring)*vA); }',
  });
  const iPoints = new THREE.Points(iGeo, iMat); iPoints.renderOrder = 21; iPoints.frustumCulled = false; world.add(iPoints);

  const hubs = geo.hubs; // [name, x, y]
  const arcPts = [], arcT = [];
  const flowHub = [], flowR = [];
  const PER = mobile ? 50 : 90;
  hubs.forEach(([, hx, hy]) => {
    for (let i = 0; i < 48; i++) { arcPts.push(i / 48, hx, hy, (i + 1) / 48, hx, hy); }
    for (let i = 0; i < PER; i++) { flowHub.push(hx, hy); flowR.push(Math.random(), i % 3 === 0 ? 1 : 0, Math.random()); }
  });
  // arcs: position.x carries t, .yz carry the hub; the shader builds the curve
  const arcVS = /* glsl */`
    vec3 arc(vec2 hub, float t){ vec2 p = mix(vec2(0.0), hub, t); float L = length(hub); return vec3(p, 0.04 + sin(t*3.14159) * (L*0.2 + 1.0)); }`;
  const arcGeo = new THREE.BufferGeometry();
  const arcArr = new Float32Array(arcPts.length);
  for (let i = 0; i < arcPts.length; i += 3) { arcArr[i] = arcPts[i]; arcArr[i + 1] = arcPts[i + 1]; arcArr[i + 2] = arcPts[i + 2]; }
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcArr, 3));
  arcGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 30, 0), 400);
  const arcMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uShow: { value: 0 }, uColor: { value: AQUA } },
    vertexShader: arcVS + 'uniform float uShow; varying float vT; void main(){ vT = position.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(arc(position.yz, position.x),1.0); }',
    fragmentShader: 'uniform float uShow; uniform vec3 uColor; varying float vT; void main(){ float a = smoothstep(vT, vT+0.05, uShow*1.05); gl_FragColor = vec4(uColor, a*0.32); }',
  });
  const arcs = new THREE.LineSegments(arcGeo, arcMat); arcs.renderOrder = 22; arcs.frustumCulled = false; world.add(arcs);

  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flowR.length), 3));
  fGeo.setAttribute('aHub', new THREE.BufferAttribute(new Float32Array(flowHub), 2));
  fGeo.setAttribute('aR', new THREE.BufferAttribute(new Float32Array(flowR), 3));
  const fMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uShow: { value: 0 }, uPx: { value: 4 }, uAmber: { value: AMBER }, uAqua: { value: AQUA } },
    vertexShader: arcVS + `attribute vec2 aHub; attribute vec3 aR; uniform float uTime, uShow, uPx; varying float vA; varying float vBack;
      void main(){ float sp = 0.07 + aR.z*0.06; float t = fract(aR.x + uTime*sp); vBack = aR.y; if (aR.y > 0.5) t = 1.0 - t;
        vA = sin(t*3.14159) * uShow; gl_Position = projectionMatrix * modelViewMatrix * vec4(arc(aHub, t),1.0); gl_PointSize = uPx * (0.6 + aR.z*0.5); }`,
    fragmentShader: 'uniform vec3 uAmber; uniform vec3 uAqua; varying float vA; varying float vBack; void main(){ float r = length(gl_PointCoord-0.5)*2.0; if(r>1.0) discard; float a = exp(-r*r*5.0); gl_FragColor = vec4(mix(uAmber,uAqua,vBack)*a*vA, a*vA); }',
  });
  const flows = new THREE.Points(fGeo, fMat); flows.renderOrder = 23; flows.frustumCulled = false; world.add(flows);

  // ---------------- "you" light (apply pages) ----------------
  const youGeo = new THREE.BufferGeometry();
  youGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.1]), 3));
  const youMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uShow: { value: 0 }, uPx: { value: 4 }, uTime: { value: 0 }, uColor: { value: AMBER.clone() } },
    vertexShader: 'uniform float uPx, uShow, uTime; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = uPx * (5.0 + sin(uTime*2.2)*0.8) * uShow; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uShow; void main(){ float r = length(gl_PointCoord-0.5)*2.0; if(r>1.0) discard; float core = smoothstep(0.22,0.0,r); float halo = exp(-r*r*3.0)*0.7; float ring = smoothstep(0.05,0.0,abs(r-0.72))*0.8; gl_FragColor = vec4(mix(uColor, vec3(1.0), core*0.7), (core+halo+ring)*uShow); }',
  });
  const you = new THREE.Points(youGeo, youMat); you.renderOrder = 30; you.frustumCulled = false; world.add(you);

  // ---------------- labels ----------------
  const labels = [];
  const addLabel = (text, x, y, cls, z = 0) => { const el = document.createElement('span'); el.className = 'lbl ' + (cls || ''); el.textContent = text; labelsEl.appendChild(el); const l = { el, v: new THREE.Vector3(x, y, z), op: 0, target: 0, ping: false, cls }; labels.push(l); return l; };
  const townLabels = {};
  for (const [name, x, y] of geo.towns) {
    if (['Miami', 'Fort Lauderdale', 'Boca Raton', 'West Palm Beach', 'Homestead', 'Kendall', 'Doral', 'Jupiter', 'Miami Beach'].includes(name)) townLabels[name] = addLabel(name, x, y, 'lbl--town');
  }
  const roomLabel = addLabel('Hialeah · The studio', 0, 0, 'lbl--room');
  const youLabel = addLabel('You', 0, 0, 'lbl--you');
  const hubLabels = hubs.filter(([name]) => ['Brickell', 'Las Olas', 'Boca Raton', 'Palm Beach', 'Aventura', 'Coral Gables'].includes(name)).map(([name, x, y]) => addLabel(name, x, y, 'lbl--hub'));

  // ---------------- state ----------------
  const state = { T: 0, Tdraw: 0, mouse: null, lamp: 0, intro: 0, ping: null, focus: null, you: null, youShow: 0, mode, w: 1, h: 1, running: true, visible: true };
  const v3 = new THREE.Vector3();
  const tmpCam = { tx: 0, ty: 0, dist: 1, tilt: 0, yaw: 0, off: 0 };

  function roomDist() {
    const fov = (camera.fov * Math.PI) / 180, aspect = state.w / state.h;
    const fitH = (roomH + 0.6) / (2 * Math.tan(fov / 2));
    const usable = mobile ? 1 : 0.62; // desktop: room sits in the right part of the frame
    const fitW = (roomW + 0.5) / (2 * Math.tan(fov / 2) * aspect * usable);
    return Math.max(fitH, fitW) * (mobile ? 1.18 : 1);
  }
  function camAt(T) {
    let i = 0; while (i < KEYS.length - 2 && T > KEYS[i + 1].t) i++;
    const a = mobile && KEYS[i].m ? { ...KEYS[i], ...KEYS[i].m } : KEYS[i], b = mobile && KEYS[i + 1].m ? { ...KEYS[i + 1], ...KEYS[i + 1].m } : KEYS[i + 1];
    const t = sm(a.t, b.t, T);
    const da = a.dist === 'room' ? roomDist() : a.dist * (mobile ? 1.1 : 1), db = b.dist === 'room' ? roomDist() : b.dist * (mobile ? 1.1 : 1);
    tmpCam.tx = lerp(a.tx, b.tx, t); tmpCam.ty = lerp(a.ty, b.ty, t);
    tmpCam.dist = Math.exp(lerp(Math.log(da), Math.log(db), t));
    tmpCam.tilt = lerp(a.tilt, b.tilt, t); tmpCam.yaw = lerp(a.yaw, b.yaw, t);
    tmpCam.off = mobile ? 0 : lerp(a.off, b.off, t);
    return tmpCam;
  }
  function placeCamera(c, time) {
    const sway = state.mode === 'home' ? Math.sin(time * 0.07) * 0.02 : Math.sin(time * 0.05) * 0.03;
    const yaw = c.yaw + sway;
    const tilt = c.tilt;
    const x = c.tx + Math.sin(tilt) * Math.sin(yaw) * c.dist;
    const y = c.ty - Math.sin(tilt) * Math.cos(yaw) * c.dist;
    const z = Math.cos(tilt) * c.dist;
    camera.position.set(x, y, z);
    camera.up.set(Math.sin(yaw) * 0.0001 - Math.sin(yaw), Math.cos(yaw), 0);
    camera.lookAt(c.tx, c.ty, 0);
    camera.near = Math.max(0.01, c.dist * 0.01); camera.far = c.dist * 10 + 50;
    const offY = mobile ? (state.mode === 'home' ? 0.2 : 0.26) * state.h : 0;
    if (c.off || offY) camera.setViewOffset(state.w, state.h, c.off * state.w, offY, state.w, state.h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  function resize() {
    state.w = window.innerWidth; state.h = window.innerHeight;
    renderer.setSize(state.w, state.h, false);
    camera.aspect = state.w / state.h; camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  const bg = new THREE.Color();
  const clock = new THREE.Clock();
  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    state.frames = (state.frames || 0) + 1;
    if (!state.visible) { state.Tdraw = state.T; return; }
    state.drawn = (state.drawn || 0) + 1;
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = still ? 6.0 : clock.elapsedTime;
    // ease the drawn T toward the target T so scrubbing feels weighted
    state.Tdraw += (state.T - state.Tdraw) * (1 - Math.pow(0.0016, dt));
    if (Math.abs(state.T - state.Tdraw) < 1e-4) state.Tdraw = state.T;
    const T = state.Tdraw;
    state.intro = still ? 1 : Math.min(1, state.intro + dt * 0.55);

    const day = sm(2.0, 2.34, T) * (1 - sm(3.0, 3.3, T));
    const conv = sm(1.0, 1.98, T);
    const sync = sm(2.25, 2.8, T) * (1 - sm(3.9, 4.6, T));
    const roomA = sm(1.7, 2.15, T) * (1 - sm(3.1, 3.4, T));
    const links = sm(2.35, 2.95, T);
    const linksA = (1 - sm(3.05, 3.3, T));
    const invShow = sm(3.2, 3.75, T);
    const flowShow = sm(3.35, 3.85, T) * (1 - sm(4.2, 4.7, T) * 0.6);
    const closeK = sm(4.0, 4.62, T);
    const netK = sm(4.4, 4.98, T);
    const mapFade = 1 - sm(1.85, 2.15, T) * (1 - sm(3.05, 3.45, T)) * 0.82;

    if (day < 0.4) bg.copy(NIGHT).lerp(DUSK, day / 0.4);
    else if (day < 0.75) bg.copy(DUSK).lerp(SUN, (day - 0.4) / 0.35);
    else bg.copy(SUN).lerp(PAPER, (day - 0.75) / 0.25);
    renderer.setClearColor(bg, 1);
    waterMat.uniforms.uNight.value.copy(bg); waterMat.uniforms.uDay.value.copy(bg);
    for (const m of [land.material, water.material, arterials.material, highways.material, borders.material, coast.material]) { m.uniforms.uDayMix.value = day; m.uniforms.uFade.value = mapFade; }
    city.material.uniforms.uDayMix.value = day;
    city.material.uniforms.uAlpha.value = 0.55 * (sm(1.3, 1.7, T) * (1 - sm(3.4, 3.8, T)) + sm(4.7, 5, T) * 0.6) + (state.mode !== 'home' ? 0.5 : 0);

    const c = camAt(T);
    placeCamera(c, time);
    FOG.value.set(c.dist * (0.85 + c.tilt * 0.1), c.dist * (1.55 + (1 - c.tilt) * 1.2));
    state.day = day;

    const px = DPR * Math.min(14, Math.max(5, 6.4 * Math.pow(210 / c.dist, 0.22)));
    const u = bMat.uniforms;
    u.uTime.value = time; u.uConv.value = conv; u.uClose.value = closeK; u.uSync.value = sync; u.uDay.value = day;
    u.uPx.value = day > 0.5 ? DPR * Math.max(3, 5.4 * (roomDist() / c.dist)) : px;
    u.uIntro.value = state.intro;
    state.lamp += ((state.mouse && T < 0.9 ? 1 : 0) - state.lamp) * 0.08;
    u.uLamp.value = state.lamp;
    if (state.mouse) u.uMouse.value.set(state.mouse.x, state.mouse.y, 0);
    if (state.focus) u.uFocus.value.set(state.focus[0], state.focus[1], 0); else u.uFocus.value.set(1e4, 1e4, 0);

    roomMat.uniforms.uAlpha.value = roomA * 0.85; roomMat.uniforms.uDayMix.value = day;
    seatLinkMat.uniforms.uReveal.value = links; seatLinkMat.uniforms.uAlpha.value = 0.22 * linksA; seatLinkMat.uniforms.uDayMix.value = day;
    netMat.uniforms.uReveal.value = netK; netMat.uniforms.uAlpha.value = 0.3 * netK; netMat.uniforms.uDayMix.value = 0;
    iMat.uniforms.uShow.value = invShow; iMat.uniforms.uTime.value = time; iMat.uniforms.uPx.value = px;
    arcMat.uniforms.uShow.value = invShow;
    fMat.uniforms.uShow.value = flowShow; fMat.uniforms.uTime.value = time; fMat.uniforms.uPx.value = px * 1.2;
    youMat.uniforms.uTime.value = time; youMat.uniforms.uPx.value = px;
    state.youShow += ((state.you ? 1 : 0) - state.youShow) * 0.08;
    youMat.uniforms.uShow.value = state.youShow;
    if (state.you) you.geometry.attributes.position.array.set([state.you[0], state.you[1], state.you[2] || 0.1]), (you.geometry.attributes.position.needsUpdate = true);

    renderer.render(scene, camera);

    // labels: project world points to screen
    const townA = state.mode === 'home' ? (1 - sm(0.6, 1.4, T)) * 0.9 + sm(4.6, 5, T) * 0.5 : 0.55;
    for (const name in townLabels) {
      const l = townLabels[name];
      l.target = state.ping === name ? 1 : townA * state.intro;
      l.el.classList.toggle('lbl--ping', state.ping === name);
    }
    roomLabel.target = state.mode === 'home' ? (sm(0.4, 1.0, T) * (1 - sm(1.75, 1.95, T)) + sm(3.3, 3.6, T) * (1 - sm(4.3, 4.6, T))) : 1;
    youLabel.target = state.you ? state.youShow : 0;
    if (state.you) youLabel.v.set(state.you[0], state.you[1], state.you[2] || 0);
    hubLabels.forEach((l) => { l.target = state.mode === 'home' ? sm(3.4, 3.8, T) * (1 - sm(4.4, 4.7, T)) : 0; });
    for (const l of labels) {
      l.op += (l.target - l.op) * 0.12;
      if (l.op < 0.01) { if (l.el.style.opacity !== '0') l.el.style.opacity = '0'; continue; }
      v3.copy(l.v).applyMatrix4(world.matrixWorld).project(camera);
      if (v3.z > 1) { l.el.style.opacity = '0'; continue; }
      const sx = Math.min((v3.x * 0.5 + 0.5) * state.w + 12, state.w - l.el.offsetWidth - 10), sy = (-v3.y * 0.5 + 0.5) * state.h - 6;
      l.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
      l.el.style.opacity = l.op.toFixed(3);
    }
  }
  frame();

  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
  function screenToMap(x, y) {
    ndc.set((x / state.w) * 2 - 1, -(y / state.h) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.y } : null;
  }
  function mapToScreen(x, y, z = 0) {
    v3.set(x, y, z).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * state.w, y: (-v3.y * 0.5 + 0.5) * state.h, behind: v3.z > 1 };
  }

  return {
    setT(T, instant = false) { state.T = T; if (instant) state.Tdraw = T; },
    getT: () => state.Tdraw,
    getDay: () => state.day || 0,
    debug: () => ({ ...state, mouse: !!state.mouse }),
    setMouse(x, y) { state.mouse = x == null ? null : screenToMap(x, y); },
    setPing(name) { state.ping = name; },
    setFocus(p) { state.focus = p; },
    setYou(p) { state.you = p; },
    setYouColor(hex) { youMat.uniforms.uColor.value.set(hex); },
    setVisible(v) { state.visible = v; if (v) clock.getDelta(); },
    skipIntro() { state.intro = 1; },
    screenToMap, mapToScreen,
    nearestBuilder(x, y, maxPx = 36) {
      let best = -1, bd = maxPx * maxPx;
      for (let i = 0; i < N; i++) { const s = mapToScreen(builders[i][0], builders[i][1], 0.03); const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = i; } }
      return best < 0 ? null : { i: best, town: geo.towns[builders[best][2]]?.[0] || 'South Florida', pos: builders[best] };
    },
    destroy() { cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
