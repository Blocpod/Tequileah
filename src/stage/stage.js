// Gravity 2: one map, one living field of light, one timeline value T.
// T 0..1 scattered · 1..2 gather to Hialeah · 2..3 the room (daylight maquette) · 3..4 pipeline · 4..5 connected
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { createParticles } from './particles.js';
import { roomLayout, createRoom } from './room.js';
import { createPost } from './post.js';

const NIGHT = new THREE.Color('#07090c');
const PAPER = new THREE.Color('#f1ede4');
const DUSK = new THREE.Color('#3a2018');
const SUN = new THREE.Color('#e9c9a0');
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const ACTIVITIES = [
  'shipping v0.4', 'training a small model', 'debugging at 2am', 'sketching a new brand', 'editing a short film',
  'soldering a prototype', 'writing the first API', 'pitch deck, draft 9', 'testing with ten users', 'designing onboarding',
  'building an agent', 'recording a demo', 'rewriting the landing page', 'cutting a trailer', 'fixing the checkout',
  'mapping a hardware BOM', 'scoring a game', 'porting to iOS', 'cleaning a dataset', 'launching on Friday',
];

// Camera keyframes along T. tx/ty map km, dist km ('room' = fit the model), tilt rad from top-down, yaw rad,
// off = horizontal view offset (desktop), m = mobile overrides
const KEYS = [
  { t: 0.0, tx: -12, ty: 38, dist: 214, tilt: 0.64, yaw: -0.1, off: -0.2 },
  { t: 1.0, tx: -10, ty: 30, dist: 198, tilt: 0.68, yaw: -0.04, off: -0.18 },
  { t: 1.62, tx: -1, ty: 3, dist: 38, tilt: 0.74, yaw: 0.28, off: -0.12 },
  { t: 2.0, tx: 0, ty: 0.15, dist: 'room', tilt: 0.78, yaw: 0.46, off: -0.2 },
  { t: 3.0, tx: 0, ty: 0, dist: 'room', tilt: 0.58, yaw: -0.32, off: -0.2 },
  { t: 3.55, tx: 3, ty: 15, dist: 112, tilt: 1.04, yaw: 1.42, off: -0.27, m: { tx: -2, ty: 26, dist: 150, tilt: 0.8, yaw: -0.12 } },
  { t: 4.0, tx: 2, ty: 24, dist: 140, tilt: 0.99, yaw: 1.3, off: -0.22, m: { tx: -6, ty: 34, dist: 190, tilt: 0.72, yaw: -0.1 } },
  { t: 5.0, tx: -12, ty: 44, dist: 238, tilt: 0.46, yaw: 0.06, off: 0 },
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
    g.translate(0, 0, z); geos.push(g);
  }
  return mergeGeometries(geos);
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export async function createStage({ canvas, labelsEl, geo, mobile = false, mode = 'home', still = false }) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }); } catch (e) { return null; }
  const gl = renderer.getContext();
  if (!gl || !renderer.capabilities.isWebGL2) { renderer.dispose(); return null; }
  const forced = new URLSearchParams(location.search).get('quality');
  // no GPU (software rasteriser): the live world would crawl, so show the designed poster instead
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  if (!forced && /swiftshader|llvmpipe|software|basic render/i.test(gpuName)) { renderer.dispose(); return null; }
  let tier = forced === 'low' ? 0 : forced === 'mid' ? 1 : 2;
  const locked = !!forced;
  const DPR_MAX = mobile ? 1.5 : 1.75;
  let DPR = Math.min(window.devicePixelRatio || 1, DPR_MAX);
  renderer.setPixelRatio(DPR);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = NIGHT.clone();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 3000);
  const world = new THREE.Group();
  scene.add(world);

  // shared uniforms
  const U = {
    uFog: { value: new THREE.Vector2(1e5, 2e5) }, uBg: { value: NIGHT.clone() }, uDayMix: { value: 0 }, uFade: { value: 1 },
    tGlow: { value: null }, uGlowBox: { value: new THREE.Vector4() }, uNightK: { value: 1 }, uTime: { value: 0 },
  };

  // ---------------- city glow: particle density rendered top-down, blurred, fed to ground + roads ----------------
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const a of geo.land) for (let i = 0; i < a.length; i += 2) { minx = Math.min(minx, a[i]); maxx = Math.max(maxx, a[i]); miny = Math.min(miny, a[i + 1]); maxy = Math.max(maxy, a[i + 1]); }
  U.uGlowBox.value.set(minx, miny, maxx - minx, maxy - miny);
  const GW = mobile ? 160 : 256, GH = Math.round((GW * (maxy - miny)) / (maxx - minx));
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const glowA = new THREE.WebGLRenderTarget(GW, GH, rtOpts), glowB = new THREE.WebGLRenderTarget(GW, GH, rtOpts);
  const glowCam = new THREE.OrthographicCamera(minx, maxx, maxy, miny, -10, 10);
  const glowScene = new THREE.Scene();
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv; void main(){ float w[7]; w[0]=0.196; w[1]=0.174; w[2]=0.121; w[3]=0.066; w[4]=0.028; w[5]=0.009; w[6]=0.002; vec4 s = texture2D(tSrc, vUv) * w[0]; for (int i = 1; i < 7; i++){ s += texture2D(tSrc, vUv + uDir * float(i)) * w[i]; s += texture2D(tSrc, vUv - uDir * float(i)) * w[i]; } gl_FragColor = s; }',
  });
  const blurQuad = new FullScreenQuad(blurMat);

  await nextFrame();
  // ---------------- ocean (and lakes): moonlit water ----------------
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uCam: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3(0, 1, 0.4) }, uNightCol: { value: new THREE.Color('#050a10') }, uDayCol: { value: new THREE.Color('#e2e5df') } },
    vertexShader: 'varying vec3 vW; varying float vD; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: /* glsl */`
      uniform vec3 uCam, uMoon, uNightCol, uDayCol, uBg; uniform vec2 uFog; uniform float uTime, uDayMix, uFade;
      varying vec3 vW; varying float vD;
      float h(vec2 p){ return sin(p.x) * sin(p.y); }
      float wave(vec2 p, float t){ return h(p * 0.9 + vec2(t * 0.6, t * 0.4)) * 0.5 + h(p * 2.1 - vec2(t * 0.9, -t * 0.5)) * 0.25 + h(p * 5.3 + vec2(-t * 1.4, t)) * 0.12; }
      void main(){
        vec2 p = vW.xy * 1.7;
        float e = 0.05, t = uTime;
        float hx = wave(p + vec2(e, 0.0), t) - wave(p - vec2(e, 0.0), t);
        float hy = wave(p + vec2(0.0, e), t) - wave(p - vec2(0.0, e), t);
        vec3 N = normalize(vec3(-hx * 0.35, -hy * 0.35, 1.0));
        vec3 V = normalize(uCam - vW);
        vec3 R = reflect(-V, N);
        float s = pow(max(dot(R, uMoon), 0.0), 260.0) * 1.8 + pow(max(dot(R, uMoon), 0.0), 30.0) * 0.025;
        float fres = pow(1.0 - max(dot(V, vec3(0.0, 0.0, 1.0)), 0.0), 5.0) * 0.5;
        vec3 night = uNightCol + vec3(0.55, 0.62, 0.78) * s + vec3(0.02, 0.03, 0.05) * fres;
        vec3 c = mix(night, uDayCol + vec3(0.04) * s, uDayMix);
        float f = smoothstep(uFog.x, uFog.y, vD);
        c = mix(c, uBg, max(f, 1.0 - uFade));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800, 1, 1), waterMat);
  ocean.position.set(0, 40, -0.06);
  ocean.renderOrder = 0;
  world.add(ocean);

  // ---------------- land: night ground lit from below by the people on it ----------------
  const landMat = new THREE.ShaderMaterial({
    transparent: false, depthWrite: false,
    uniforms: { ...U, uNight: { value: new THREE.Color('#0c1117') }, uDay: { value: new THREE.Color('#e7e1d4') } },
    vertexShader: 'varying vec2 vP; varying float vD; void main(){ vP = position.xy; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: /* glsl */`
      uniform vec3 uNight, uDay, uBg; uniform float uDayMix, uFade, uNightK; uniform vec2 uFog; uniform sampler2D tGlow; uniform vec4 uGlowBox;
      varying vec2 vP; varying float vD;
      void main(){
        vec2 g = abs(fract(vP / 5.0 - 0.5) - 0.5) / fwidth(vP / 5.0);
        float grid = 1.0 - min(min(g.x, g.y), 1.0);
        vec3 c = mix(uNight, uDay, uDayMix);
        c += grid * mix(0.03, -0.028, uDayMix);
        float gl = texture2D(tGlow, (vP - uGlowBox.xy) / uGlowBox.zw).r;
        float glow = 1.0 - exp(-gl * 2.4);
        c += vec3(1.0, 0.36, 0.07) * glow * 0.16 * uNightK;
        float f = smoothstep(uFog.x, uFog.y, vD);
        c = mix(c, uBg, max(f * 0.96, 1.0 - uFade));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  landMat.extensions = { derivatives: true };
  const land = new THREE.Mesh(fillGeometry(geo.land, 0), landMat); land.renderOrder = 1; world.add(land);
  const lakes = new THREE.Mesh(fillGeometry(geo.water, 0.001), waterMat); lakes.renderOrder = 2; world.add(lakes);

  const lineMat = (night, day, alpha, glowK) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { ...U, uNight: { value: new THREE.Color(night) }, uDay: { value: new THREE.Color(day) }, uAlpha: { value: alpha }, uGlowK: { value: glowK } },
    vertexShader: 'varying float vD; varying vec2 vP; void main(){ vP = position.xy; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: /* glsl */`
      uniform vec3 uNight, uDay; uniform float uDayMix, uAlpha, uFade, uGlowK, uNightK; uniform vec2 uFog; uniform sampler2D tGlow; uniform vec4 uGlowBox;
      varying float vD; varying vec2 vP;
      void main(){
        float gl = texture2D(tGlow, (vP - uGlowBox.xy) / uGlowBox.zw).r;
        float glow = 1.0 - exp(-gl * 3.0);
        vec3 c = mix(uNight, uDay, uDayMix) + vec3(1.0, 0.45, 0.12) * glow * uGlowK * uNightK;
        float f = 1.0 - smoothstep(uFog.x, uFog.y, vD) * 0.95;
        gl_FragColor = vec4(c, uAlpha * uFade * f);
      }`,
  });
  const mkLines = (polys, mat, z = 0.002, order = 3) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(flatToSegments(polys), 3)); const m = new THREE.LineSegments(g, mat); m.position.z = z; m.renderOrder = order; world.add(m); return m; };
  const mapLines = [
    mkLines(geo.arterials, lineMat('#18202a', '#d2cbbb', 1, 0.55), 0.002, 3),
    mkLines(geo.highways, lineMat('#2c394a', '#aaa293', 1, 1.6), 0.003, 4),
    mkLines(geo.borders, lineMat('#222a35', '#cbc4b4', 0.7, 0), 0.003, 5),
    mkLines(geo.coast, lineMat('#7d8fa6', '#5d6066', 0.9, 0.3), 0.004, 6),
  ];
  const city = mkLines(geo.hialeah.map((a) => [...a, a[0], a[1]]), lineMat('#ffb347', '#0e1013', 0.0, 0), 0.005, 7);

  await nextFrame();
  // ---------------- the room ----------------
  const builders = geo.builders, N = builders.length;
  const layout = roomLayout(builders);
  const room = createRoom({ layout, builders, mobile });
  world.add(room.group);
  const { roomW, roomH } = layout;

  await nextFrame();
  // ---------------- particles ----------------
  const SIZE = mobile ? 128 : 256;
  const P = createParticles({ renderer, geo, seats: layout.seats, size: SIZE, mobile });
  world.add(P.mesh);
  glowScene.add(P.glowPoints);

  // ---------------- the connected region (close) ----------------
  await nextFrame();
  const net = [], netOrder = [];
  for (let k = 0; k < geo.net.length; k += 2) {
    const [xi, yi] = builders[geo.net[k]], [xj, yj] = builders[geo.net[k + 1]];
    net.push(xi, yi, 0, xj, yj, 0); const o = Math.min(1, Math.hypot(xi, yi) / 150); netOrder.push(o, o);
  }
  for (let i = 0; i < N; i += 9) { net.push(builders[i][0], builders[i][1], 0, 0, 0, 0); const o = Math.min(1, Math.hypot(builders[i][0], builders[i][1]) / 150); netOrder.push(o, 0); }
  const netGeo = new THREE.BufferGeometry();
  netGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(net), 3));
  netGeo.setAttribute('aOrder', new THREE.BufferAttribute(new Float32Array(netOrder), 1));
  const netMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uReveal: { value: 0 }, uAlpha: { value: 0 }, uTime: U.uTime },
    vertexShader: 'attribute float aOrder; varying float vO; void main(){ vO = aOrder; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uReveal, uAlpha, uTime; varying float vO; void main(){ float a = smoothstep(vO, vO + 0.06, uReveal * 1.06); float front = smoothstep(0.06, 0.0, abs(vO - uReveal * 1.06 + 0.03)) * 3.0; gl_FragColor = vec4(vec3(1.0, 0.45, 0.1) * (a * uAlpha + front * uAlpha), 1.0); }',
  });
  const netMesh = new THREE.LineSegments(netGeo, netMat); netMesh.position.z = 0.05; netMesh.renderOrder = 10; world.add(netMesh);

  // ---------------- investors + the pipeline ----------------
  const inv = geo.investors, NI = inv.length;
  const iGeo = new THREE.BufferGeometry();
  const iPos = new Float32Array(NI * 3), iRand = new Float32Array(NI);
  inv.forEach((p, i) => { iPos.set([p[0], p[1], 0.06], i * 3); iRand[i] = (i * 0.618) % 1; });
  iGeo.setAttribute('position', new THREE.BufferAttribute(iPos, 3));
  iGeo.setAttribute('aR', new THREE.BufferAttribute(iRand, 1));
  const iMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.uTime, uShow: { value: 0 }, uPx: { value: 4 } },
    vertexShader: 'attribute float aR; uniform float uTime, uShow, uPx; varying float vA; varying float vR; void main(){ float s = smoothstep(aR * 0.6, aR * 0.6 + 0.4, uShow); vA = s; vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = uPx * 3.4 * (0.5 + 0.5 * s); }',
    fragmentShader: 'uniform float uTime; varying float vA; varying float vR; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard; float core = exp(-r * r * 40.0) * 2.4; float ph = fract(uTime * 0.5 + vR); float ring = smoothstep(0.06, 0.0, abs(r - ph)) * (1.0 - ph) * 1.4; float ring2 = smoothstep(0.035, 0.0, abs(r - 0.42)) * 0.6; vec3 aqua = vec3(0.06, 0.75, 0.6); gl_FragColor = vec4(aqua * (core + ring + ring2) * vA + vec3(0.9) * core * 0.3 * vA, 1.0); }',
  });
  const iPoints = new THREE.Points(iGeo, iMat); iPoints.renderOrder = 21; iPoints.frustumCulled = false; world.add(iPoints);

  const hubs = geo.hubs;
  const arcPoint = (hx, hy, t) => { const L = Math.hypot(hx, hy); return new THREE.Vector3(hx * t, hy * t, 0.05 + Math.sin(t * Math.PI) * (L * 0.2 + 1)); };
  const arcMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uShow: { value: 0 }, uTime: U.uTime },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: /* glsl */`
      uniform float uShow, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float t = vUv.x, head = uShow * 1.04;
        if (t > head) discard;
        float core = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
        float flow = pow(fract(t * 4.0 - uTime * 0.35), 8.0);
        float tip = smoothstep(head - 0.08, head, t) * 2.0;
        vec3 amber = vec3(1.0, 0.42, 0.08), aqua = vec3(0.06, 0.78, 0.62);
        vec3 c = mix(amber, aqua, smoothstep(0.1, 0.9, t));
        gl_FragColor = vec4(c * core * (0.35 + flow * 2.6 + tip), 1.0);
      }`,
  });
  const ribbons = new THREE.Group();
  hubs.forEach(([, hx, hy]) => {
    const pts = []; for (let i = 0; i <= 40; i++) pts.push(arcPoint(hx, hy, i / 40));
    const L = Math.hypot(hx, hy);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.07 + L * 0.0024, 6, false), arcMat);
    tube.renderOrder = 22; tube.frustumCulled = false; ribbons.add(tube);
  });
  world.add(ribbons);

  const flowHub = [], flowR = [];
  const PER = mobile ? 60 : 140;
  hubs.forEach(([, hx, hy]) => { for (let i = 0; i < PER; i++) { flowHub.push(hx, hy); flowR.push(Math.random(), i % 3 === 0 ? 1 : 0, Math.random()); } });
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flowR.length), 3));
  fGeo.setAttribute('aHub', new THREE.BufferAttribute(new Float32Array(flowHub), 2));
  fGeo.setAttribute('aR', new THREE.BufferAttribute(new Float32Array(flowR), 3));
  const fMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.uTime, uShow: { value: 0 }, uPx: { value: 4 } },
    vertexShader: `attribute vec2 aHub; attribute vec3 aR; uniform float uTime, uShow, uPx; varying float vA; varying float vBack;
      vec3 arc(vec2 hub, float t){ float L = length(hub); return vec3(hub * t, 0.05 + sin(t * 3.14159) * (L * 0.2 + 1.0)); }
      void main(){ float sp = 0.06 + aR.z * 0.07; float t = fract(aR.x + uTime * sp); vBack = aR.y; if (aR.y > 0.5) t = 1.0 - t;
        vA = sin(t * 3.14159) * uShow; gl_Position = projectionMatrix * modelViewMatrix * vec4(arc(aHub, t), 1.0); gl_PointSize = uPx * (0.9 + aR.z * 0.8); }`,
    fragmentShader: 'varying float vA; varying float vBack; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard; float a = exp(-r * r * 6.0); vec3 c = mix(vec3(1.0, 0.45, 0.08), vec3(0.08, 0.85, 0.68), vBack); gl_FragColor = vec4(c * a * vA * 2.2, 1.0); }',
  });
  const flows = new THREE.Points(fGeo, fMat); flows.renderOrder = 23; flows.frustumCulled = false; world.add(flows);

  // ---------------- shockwave ring (button presses, map clicks) ----------------
  const ringMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uAge: { value: 99 }, uR: { value: 10 }, uColor: { value: new THREE.Color(1.0, 0.45, 0.1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uAge, uR; uniform vec3 uColor; varying vec2 vUv; void main(){ float r = length(vUv); float k = clamp(uAge / 1.6, 0.0, 1.0); float rr = 1.0 - pow(1.0 - k, 3.0); float ring = exp(-pow((r - rr) * 26.0, 2.0)) * (1.0 - k); float inner = exp(-pow((r - rr * 0.7) * 40.0, 2.0)) * (1.0 - k) * 0.4; gl_FragColor = vec4(uColor * (ring + inner) * 2.0, 1.0); }',
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ringMat); ring.renderOrder = 30; ring.visible = false; world.add(ring);

  // ---------------- "you" light (apply pages) ----------------
  const youGeo = new THREE.BufferGeometry();
  youGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.1]), 3));
  const youMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uShow: { value: 0 }, uPx: { value: 4 }, uTime: U.uTime, uColor: { value: new THREE.Color(1.0, 0.42, 0.08) } },
    vertexShader: 'uniform float uPx, uShow, uTime; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = uPx * (9.0 + sin(uTime * 2.2)) * uShow; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uShow, uTime; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard; float core = exp(-r * r * 60.0) * 3.0; float halo = exp(-r * r * 6.0) * 0.8; float ph = fract(uTime * 0.6); float ring = smoothstep(0.05, 0.0, abs(r - ph)) * (1.0 - ph) * 1.6; gl_FragColor = vec4((uColor * (halo + ring) + vec3(1.0) * core) * uShow, 1.0); }',
  });
  const you = new THREE.Points(youGeo, youMat); you.renderOrder = 50; you.frustumCulled = false; world.add(you);

  // ---------------- labels ----------------
  const labels = [];
  const addLabel = (text, x, y, cls, z = 0) => { const el = document.createElement('span'); el.className = 'lbl ' + (cls || ''); el.textContent = text; labelsEl.appendChild(el); const l = { el, v: new THREE.Vector3(x, y, z), op: 0, target: 0 }; labels.push(l); return l; };
  const townLabels = {};
  for (const [name, x, y] of geo.towns) if (['Miami', 'Fort Lauderdale', 'Boca Raton', 'West Palm Beach', 'Homestead', 'Kendall', 'Doral', 'Jupiter', 'Miami Beach'].includes(name)) townLabels[name] = addLabel(name, x, y, 'lbl--town');
  const roomLabel = addLabel('Hialeah · The studio', 0, 0, 'lbl--room');
  const youLabel = addLabel('You', 0, 0, 'lbl--you');
  const hubLabels = hubs.filter(([n]) => ['Brickell', 'Las Olas', 'Boca Raton', 'Palm Beach', 'Aventura', 'Coral Gables'].includes(n)).map(([n, x, y]) => addLabel(n, x, y, 'lbl--hub'));

  // ---------------- post ----------------
  const post = createPost({ renderer, scene, camera, mobile });

  // ---------------- state ----------------
  const state = { T: 0, Tdraw: 0, mouse: null, lamp: 0, intro: still ? 1 : 0, introRun: false, introDur: 3.2, ping: null, focus: null, you: null, youShow: 0, mode, w: 1, h: 1, visible: true, scrollVel: 0, pulseAge: 99, day: 0, frame: 0 };
  const v3 = new THREE.Vector3();
  const cam = { tx: 0, ty: 0, dist: 1, tilt: 0, yaw: 0, off: 0 };

  function roomDist() {
    const fov = (camera.fov * Math.PI) / 180, aspect = state.w / state.h;
    const fitH = (roomH + 0.9) / (2 * Math.tan(fov / 2));
    const usable = mobile ? 1 : 0.6;
    const fitW = (roomW + 0.8) / (2 * Math.tan(fov / 2) * aspect * usable);
    return Math.max(fitH, fitW) * (mobile ? 1.12 : 0.98);
  }
  function camAt(T) {
    let i = 0; while (i < KEYS.length - 2 && T > KEYS[i + 1].t) i++;
    const a = mobile && KEYS[i].m ? { ...KEYS[i], ...KEYS[i].m } : KEYS[i], b = mobile && KEYS[i + 1].m ? { ...KEYS[i + 1], ...KEYS[i + 1].m } : KEYS[i + 1];
    const t = sm(a.t, b.t, T);
    const da = a.dist === 'room' ? roomDist() : a.dist * (mobile ? 1.1 : 1), db = b.dist === 'room' ? roomDist() : b.dist * (mobile ? 1.1 : 1);
    cam.tx = lerp(a.tx, b.tx, t); cam.ty = lerp(a.ty, b.ty, t);
    cam.dist = Math.exp(lerp(Math.log(da), Math.log(db), t));
    cam.tilt = lerp(a.tilt, b.tilt, t); cam.yaw = lerp(a.yaw, b.yaw, t);
    cam.off = mobile ? 0 : lerp(a.off, b.off, t);
    // orbital descent: start far above Florida, settle into the scene
    if (state.intro < 1) {
      const k = easeIO(state.intro);
      cam.dist = Math.exp(lerp(Math.log(cam.dist * 7.5), Math.log(cam.dist), k));
      cam.tilt = lerp(0.02, cam.tilt, k); cam.yaw = lerp(cam.yaw + 0.9, cam.yaw, k);
      cam.ty = lerp(cam.ty - 18, cam.ty, k);
    }
    return cam;
  }
  function placeCamera(c, time) {
    const yaw = c.yaw + Math.sin(time * 0.07) * 0.02;
    const x = c.tx + Math.sin(c.tilt) * Math.sin(yaw) * c.dist;
    const y = c.ty - Math.sin(c.tilt) * Math.cos(yaw) * c.dist;
    camera.position.set(x, y, Math.cos(c.tilt) * c.dist);
    camera.up.set(-Math.sin(yaw), Math.cos(yaw), 0);
    camera.lookAt(c.tx, c.ty, 0);
    camera.near = Math.max(0.005, c.dist * 0.008); camera.far = c.dist * 12 + 200;
    const offY = mobile ? (state.mode === 'home' ? 0.2 : 0.26) * state.h : 0;
    if (c.off || offY) camera.setViewOffset(state.w, state.h, c.off * state.w, offY, state.w, state.h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  function applyTier() {
    DPR = Math.min(window.devicePixelRatio || 1, tier === 2 ? DPR_MAX : tier === 1 ? 1.25 : 1);
    renderer.setPixelRatio(DPR);
    renderer.setSize(state.w, state.h, false);
    post.setSize(state.w, state.h, DPR);
    P.mesh.geometry.instanceCount = tier === 0 ? Math.floor(P.count / 2) : P.count;
  }
  function resize() {
    state.w = window.innerWidth; state.h = window.innerHeight;
    camera.aspect = state.w / state.h;
    applyTier();
  }
  resize();
  window.addEventListener('resize', resize);

  const bg = new THREE.Color();
  const clock = new THREE.Clock();
  let raf = 0, slow = 0, frames = 0;
  const camFwd = new THREE.Vector3();
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!state.visible) { state.Tdraw = state.T; clock.getDelta(); return; }
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 1 / 30);
    // quality governor: step down if frames stay slow
    if (!locked && !still) {
      frames++; if (rawDt > 1 / 38) slow++;
      if (frames >= 90) { if (slow > 55 && tier > 0) { tier--; applyTier(); } frames = 0; slow = 0; }
    }
    const time = still ? 6.0 : clock.elapsedTime;
    state.Tdraw += (state.T - state.Tdraw) * (1 - Math.pow(0.002, dt));
    if (Math.abs(state.T - state.Tdraw) < 1e-4) state.Tdraw = state.T;
    const T = state.Tdraw;
    if (state.introRun && state.intro < 1) state.intro = Math.min(1, state.intro + dt / state.introDur);
    state.scrollVel *= Math.pow(0.02, dt);

    const day = sm(2.0, 2.24, T) * (1 - sm(3.02, 3.26, T));
    const conv = sm(1.0, 1.98, T);
    const sync = sm(2.25, 2.8, T) * (1 - sm(3.9, 4.6, T));
    const invShow = sm(3.2, 3.75, T);
    const flowShow = sm(3.35, 3.85, T) * (1 - sm(4.2, 4.7, T) * 0.55);
    const closeK = sm(4.0, 4.62, T);
    const netK = sm(4.4, 4.98, T);
    const mapFade = 1 - sm(1.85, 2.15, T) * (1 - sm(3.05, 3.45, T)) * 0.55;
    state.day = day;

    if (day < 0.4) bg.copy(NIGHT).lerp(DUSK, day / 0.4);
    else if (day < 0.75) bg.copy(DUSK).lerp(SUN, (day - 0.4) / 0.35);
    else bg.copy(SUN).lerp(PAPER, (day - 0.75) / 0.25);
    scene.background.copy(bg);
    U.uBg.value.copy(bg); U.uDayMix.value = day; U.uFade.value = mapFade; U.uNightK.value = 1 - day; U.uTime.value = time;
    for (const m of [landMat, waterMat, ...mapLines.map((l) => l.material)]) { m.uniforms.uBg.value.copy(bg); m.uniforms.uDayMix.value = day; m.uniforms.uFade.value = mapFade; m.uniforms.uNightK.value = 1 - day; m.uniforms.uTime.value = time; m.uniforms.tGlow.value = glowA.texture; }
    city.material.uniforms.uDayMix.value = day;
    city.material.uniforms.uAlpha.value = 0.6 * (sm(1.3, 1.7, T) * (1 - sm(2.0, 2.3, T)) + sm(4.7, 5, T) * 0.6) + (state.mode !== 'home' ? 0.5 : 0);

    const c = camAt(T);
    placeCamera(c, time);
    U.uFog.value.set(c.dist * (0.85 + c.tilt * 0.1), c.dist * (1.55 + (1 - c.tilt) * 1.2));
    for (const m of [landMat, waterMat, ...mapLines.map((l) => l.material)]) m.uniforms.uFog.value.copy(U.uFog.value);
    waterMat.uniforms.uCam.value.copy(camera.position);
    camera.getWorldDirection(camFwd); camFwd.z = 0; camFwd.normalize();
    waterMat.uniforms.uMoon.value.set(camFwd.x, camFwd.y, 0.32).normalize();

    // particles
    const S = P.shared, V = P.velUniforms;
    V.uTime.value = time; V.uConv.value = conv; V.uClose.value = closeK; V.uStill.value = still ? 1 : 0;
    V.uTurb.value = mobile ? 0.8 : 1;
    state.lamp += ((state.mouse && T < 0.9 ? 1 : 0) - state.lamp) * 0.08;
    const lampR = c.dist * 0.045;
    if (state.mouse) { V.uMouse.value.set(state.mouse.x, state.mouse.y, state.lamp, lampR); S.uMouse.value.copy(V.uMouse.value); }
    else { V.uMouse.value.z = state.lamp; S.uMouse.value.z = state.lamp; }
    state.pulseAge += dt;
    V.uPulse.value.z = state.pulseAge; V.uPulseSpeed.value = c.dist * 0.16;
    P.step(dt);
    S.uView.value.set(state.w, state.h);
    S.uTime.value = time; S.uSync.value = sync; S.uDay.value = day;
    S.uIntro.value = sm(0.12, 0.8, state.intro);
    S.uScrollVel.value = Math.max(-70, Math.min(70, state.scrollVel * 1.1));
    S.uPx.value = Math.min(9, Math.max(2.6, 3.4 * Math.pow(210 / c.dist, 0.2))) * (mobile ? 1.15 : 1) * Math.min(DPR, 1.5) / 1.25;
    if (state.focus) S.uFocus.value.set(state.focus[0], state.focus[1]); else S.uFocus.value.set(1e4, 1e4);
    S.uFog.value.copy(U.uFog.value);
    S.uGain.value = mobile ? 0.9 : 0.62;
    S.uRoomK.value = 0.075 * Math.min(1, Math.pow(6 / c.dist, 0.9));
    S.tGlow.value = glowA.texture; S.uGlowBox.value.copy(U.uGlowBox.value);

    // city glow map (every other frame; every third on lower tiers)
    if (state.frame++ % (tier === 2 ? 2 : 3) === 0 && day < 0.98) {
      const prevRT = renderer.getRenderTarget();
      renderer.setRenderTarget(glowA); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(glowScene, glowCam);
      blurMat.uniforms.tSrc.value = glowA.texture; blurMat.uniforms.uDir.value.set(1.6 / GW, 0); renderer.setRenderTarget(glowB); blurQuad.render(renderer);
      blurMat.uniforms.tSrc.value = glowB.texture; blurMat.uniforms.uDir.value.set(0, 1.6 / GH); renderer.setRenderTarget(glowA); blurQuad.render(renderer);
      renderer.setRenderTarget(prevRT);
    }

    // room maquette
    room.update({ show: sm(1.97, 2.1, T) * (1 - sm(3.15, 3.4, T)), rise: sm(1.95, 2.45, T), light: day, sunT: sm(2.0, 3.0, T) });

    netMat.uniforms.uReveal.value = netK; netMat.uniforms.uAlpha.value = 0.55 * netK;
    iMat.uniforms.uShow.value = invShow; iMat.uniforms.uPx.value = S.uPx.value;
    arcMat.uniforms.uShow.value = invShow; ribbons.visible = invShow > 0.001;
    fMat.uniforms.uShow.value = flowShow; fMat.uniforms.uPx.value = S.uPx.value * 1.4;
    youMat.uniforms.uPx.value = S.uPx.value;
    state.youShow += ((state.you ? 1 : 0) - state.youShow) * 0.08;
    youMat.uniforms.uShow.value = state.youShow;
    if (state.you) { you.geometry.attributes.position.array.set([state.you[0], state.you[1], state.you[2] || 0.1]); you.geometry.attributes.position.needsUpdate = true; }
    ringMat.uniforms.uAge.value = state.pulseAge; ring.visible = state.pulseAge < 1.6;

    // lens: tilt-shift strongest on the miniature room, softer on the map
    const L = post.lens.uniforms;
    const blur = mobile || tier === 0 ? 0 : (0.22 + sm(1.4, 2.1, T) * 0.75 * (1 - sm(3.05, 3.5, T)) + sm(3.4, 3.8, T) * 0.25 * (1 - sm(4.4, 4.9, T))) * (tier === 2 ? 1 : 0.6);
    L.uBlur.value = blur * (state.intro < 1 ? lerp(2.2, 1, state.intro) : 1);
    L.uFocus.value = mobile ? 0.35 : 0.5; L.uBand.value = lerp(0.2, 0.14, day);
    L.uTime.value = time; L.uGrain.value = lerp(0.055, 0.03, day); L.uVig.value = lerp(0.42, 0, day); L.uCA.value = lerp(0.9, 0.2, day);
    post.bloom.strength = lerp(0.85, 0.25, day) * (tier === 0 ? 0.7 : 1);
    post.render(dt);

    // labels
    const townA = state.mode === 'home' ? (1 - sm(0.6, 1.4, T)) * 0.9 + sm(4.6, 5, T) * 0.5 : 0.55;
    const introA = sm(0.7, 1, state.intro);
    for (const name in townLabels) { const l = townLabels[name]; l.target = (state.ping === name ? 1 : townA) * introA; l.el.classList.toggle('lbl--ping', state.ping === name); }
    roomLabel.target = (state.mode === 'home' ? sm(0.4, 1.0, T) * (1 - sm(1.75, 1.95, T)) + sm(3.3, 3.6, T) * (1 - sm(4.3, 4.6, T)) : 1) * introA;
    youLabel.target = state.you ? state.youShow : 0;
    if (state.you) youLabel.v.set(state.you[0], state.you[1], state.you[2] || 0);
    hubLabels.forEach((l) => { l.target = state.mode === 'home' ? sm(3.4, 3.8, T) * (1 - sm(4.4, 4.7, T)) : 0; });
    for (const l of labels) {
      l.op += (l.target - l.op) * 0.12;
      if (l.op < 0.01) { if (l.el.style.opacity !== '0') l.el.style.opacity = '0'; continue; }
      v3.copy(l.v).project(camera);
      if (v3.z > 1) { l.el.style.opacity = '0'; continue; }
      let sx = (v3.x * 0.5 + 0.5) * state.w + 12;
      if (l === youLabel) sx = Math.min(sx, state.w - l.el.offsetWidth - 10);
      else if (sx > state.w - l.el.offsetWidth - 6) { l.el.style.opacity = '0'; continue; }
      const sy = (-v3.y * 0.5 + 0.5) * state.h - 6;
      l.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
      l.el.style.opacity = l.op.toFixed(3);
    }
  }

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

  // compile every program off the main thread where the browser allows it, then draw
  await nextFrame();
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* older browsers compile on first draw */ }
  P.snap();
  frame();

  return {
    setT(T, instant = false) { state.T = T; if (instant) { state.Tdraw = T; P.snap(); } },
    getT: () => state.Tdraw,
    getDay: () => state.day,
    getTier: () => tier,
    debug: () => ({ T: state.T, Tdraw: state.Tdraw, intro: state.intro, tier, DPR, particles: P.count }),
    startIntro(dur = 3.2) { state.introDur = dur; state.introRun = true; if (still) state.intro = 1; },
    skipIntro() { state.intro = 1; state.introRun = true; },
    setMouse(x, y) { state.mouse = x == null ? null : screenToMap(x, y); },
    setScrollVelocity(v) { if (!still) state.scrollVel = v; },
    pulse(x, y, color = 'amber') {
      if (still) return;
      const p = screenToMap(x, y); if (!p) return;
      state.pulseAge = 0;
      P.velUniforms.uPulse.value.set(p.x, p.y, 0, 1);
      const R = camAt(state.Tdraw).dist * 0.22;
      ring.position.set(p.x, p.y, 0.08); ring.scale.set(R, R, 1);
      ringMat.uniforms.uColor.value.set(color === 'aqua' ? 0x14d8b4 : 0xff6a14);
    },
    setPing(name) { state.ping = name; },
    setFocus(p) { state.focus = p; },
    setYou(p) { state.you = p; },
    setYouColor(hex) { const c = new THREE.Color(hex); youMat.uniforms.uColor.value.copy(c); },
    setVisible(v) { state.visible = v; },
    screenToMap, mapToScreen,
    nearestBuilder(x, y, maxPx = 36) {
      let best = -1, bd = maxPx * maxPx;
      for (let i = 0; i < N; i++) { const s = mapToScreen(builders[i][0], builders[i][1], 0.04); const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = i; } }
      return best < 0 ? null : { i: best, town: geo.towns[builders[best][2]]?.[0] || 'South Florida', pos: builders[best] };
    },
    start() { if (!raf) frame(); },
    destroy() { cancelAnimationFrame(raf); P.dispose(); post.dispose(); room.dispose(); renderer.dispose(); },
  };
}
