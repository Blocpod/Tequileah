// GPU particle simulation: tens of thousands of lights with spring-to-path physics, curl turbulence,
// a cursor lamp that parts them, and shockwave pulses. Rendered as velocity-stretched streaks.
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { NOISE, PATH } from './glsl.js';

// Land mask so jittered lights never land in the ocean or a lake.
function landMask(geo) {
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const a of geo.land) for (let i = 0; i < a.length; i += 2) { minx = Math.min(minx, a[i]); maxx = Math.max(maxx, a[i]); miny = Math.min(miny, a[i + 1]); maxy = Math.max(maxy, a[i + 1]); }
  const W = 600, H = Math.round((W * (maxy - miny)) / (maxx - minx));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const X = (x) => ((x - minx) / (maxx - minx)) * W, Y = (y) => H - ((y - miny) / (maxy - miny)) * H;
  const poly = (a) => { g.beginPath(); for (let i = 0; i < a.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, X(a[i]), Y(a[i + 1])); g.closePath(); g.fill(); };
  g.fillStyle = '#fff'; geo.land.forEach(poly);
  g.fillStyle = '#000'; geo.water.forEach(poly);
  const data = g.getImageData(0, 0, W, H).data;
  return (x, y) => { const px = Math.floor(X(x)), py = Math.floor(Y(y)); if (px < 0 || py < 0 || px >= W || py >= H) return false; return data[(py * W + px) * 4] > 127; };
}

export function createParticles({ renderer, geo, seats, size, mobile }) {
  const COUNT = size * size;
  const builders = geo.builders, NB = builders.length;
  const onLand = landMask(geo);

  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

  const homeSeat = new Float32Array(COUNT * 4), rands = new Float32Array(COUNT * 4), pos0 = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    const b = Math.floor(rnd() * NB);
    const [bx, by] = builders[b];
    // most lights cluster tightly around a builder (a neighbourhood), some spread wider (suburbs)
    const spread = rnd() < 0.7 ? 0.9 : 2.6;
    let x = bx, y = by;
    for (let tries = 0; tries < 8; tries++) { const tx = bx + gauss() * spread, ty = by + gauss() * spread; if (onLand(tx, ty)) { x = tx; y = ty; break; } }
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.016;
    homeSeat.set([x, y, seats[b * 2] + Math.cos(a) * rr, seats[b * 2 + 1] + Math.sin(a) * rr], i * 4);
    rands.set([rnd(), rnd(), rnd(), rnd()], i * 4);
    pos0.set([x, y, 0.04, 1], i * 4);
  }

  const gpu = new GPUComputationRenderer(size, size, renderer);
  if (renderer.capabilities.isWebGL2 === false) gpu.setDataType(THREE.HalfFloatType);
  const tPos0 = gpu.createTexture(); tPos0.image.data.set(pos0);
  const tVel0 = gpu.createTexture();
  const mkTex = (arr) => { const t = new THREE.DataTexture(arr, size, size, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; return t; };
  const tHome = mkTex(homeSeat), tRand = mkTex(rands);

  const velVar = gpu.addVariable('tVel', /* glsl */`
    uniform float uTime, uDt, uSnap, uStill, uTurb;
    uniform vec4 uMouse;   // xy, strength, radius
    uniform vec4 uPulse;   // xy, age seconds, strength
    uniform float uPulseSpeed;
    uniform sampler2D tHome, tRand;
    ${NOISE}
    ${PATH}
    void main(){
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec3 pos = texture2D(tPos, uv).xyz;
      vec3 vel = texture2D(tVel, uv).xyz;
      vec4 hs = texture2D(tHome, uv), r = texture2D(tRand, uv);
      float trav; vec3 target = pathPos(hs, r, trav);
      if (uSnap > 0.5 || uStill > 0.5) { gl_FragColor = vec4((target - pos) / max(uDt, 1e-3), 1.0); return; }
      const float K = 16.0;
      vec3 acc = (target - pos) * K - vel * (2.0 * sqrt(K) * 0.82);
      // turbulence: a living shimmer at rest, a river while travelling
      float L = length(hs.zw - hs.xy);
      vec2 cn = curl2(pos.xy * 0.045 + r.zw * 7.0, uTime * 0.07 + r.x);
      acc.xy += cn * (0.5 + trav * (1.2 + L * 1.1)) * uTurb;
      // the lamp: lights part around the cursor and lift a little
      vec2 dm = pos.xy - uMouse.xy; float dd = length(dm) + 1e-4;
      float fall = smoothstep(uMouse.w, 0.0, dd) * uMouse.z;
      acc.xy += (dm / dd) * fall * uMouse.w * 9.0;
      acc.z += fall * 3.0;
      // shockwave
      vec2 dp = pos.xy - uPulse.xy; float pd = length(dp) + 1e-4;
      float ring = uPulse.z * uPulseSpeed;
      float band = exp(-pow((pd - ring) / (uPulseSpeed * 0.18), 2.0)) * uPulse.w * exp(-uPulse.z * 1.4);
      acc.xy += (dp / pd) * band * uPulseSpeed * 6.0;
      acc.z += band * uPulseSpeed * 2.0;
      vel += acc * uDt;
      gl_FragColor = vec4(vel, 1.0);
    }`, tVel0);
  const posVar = gpu.addVariable('tPos', /* glsl */`
    uniform float uDt;
    void main(){
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec4 p = texture2D(tPos, uv);
      vec3 v = texture2D(tVel, uv).xyz;
      gl_FragColor = vec4(p.xyz + v * uDt, 1.0);
    }`, tPos0);
  gpu.setVariableDependencies(velVar, [posVar, velVar]);
  gpu.setVariableDependencies(posVar, [posVar, velVar]);
  const vu = velVar.material.uniforms;
  Object.assign(vu, {
    uTime: { value: 0 }, uDt: { value: 1 / 60 }, uSnap: { value: 0 }, uStill: { value: 0 }, uTurb: { value: 1 },
    uConv: { value: 0 }, uClose: { value: 0 },
    uMouse: { value: new THREE.Vector4(1e4, 1e4, 0, 1) }, uPulse: { value: new THREE.Vector4(1e4, 1e4, 99, 0) }, uPulseSpeed: { value: 20 },
    tHome: { value: tHome }, tRand: { value: tRand },
  });
  posVar.material.uniforms.uDt = { value: 1 / 60 };
  const err = gpu.init();
  if (err) throw new Error(err);

  // ---------- streak renderer ----------
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const refs = new Float32Array(COUNT * 2);
  for (let i = 0; i < COUNT; i++) { refs[i * 2] = ((i % size) + 0.5) / size; refs[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size; }
  quad.setAttribute('aRef', new THREE.InstancedBufferAttribute(refs, 2));
  quad.instanceCount = COUNT;

  const shared = {
    tPos: { value: null }, tVel: { value: null }, tRand: { value: tRand },
    uView: { value: new THREE.Vector2(1, 1) }, uPx: { value: 3 }, uTime: { value: 0 }, uSync: { value: 0 }, uDay: { value: 0 },
    uIntro: { value: 0 }, uScrollVel: { value: 0 }, uMouse: { value: new THREE.Vector4(1e4, 1e4, 0, 1) },
    uFocus: { value: new THREE.Vector2(1e4, 1e4) }, uFog: { value: new THREE.Vector2(1e5, 2e5) }, uGain: { value: 1 },
    tGlow: { value: null }, uGlowBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uDensK: { value: 3 }, uRoomK: { value: 0.07 },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: shared,
    vertexShader: /* glsl */`
      attribute vec2 aRef;
      uniform sampler2D tPos, tVel, tRand, tGlow;
      uniform vec2 uView, uFocus, uFog; uniform vec4 uMouse, uGlowBox; uniform float uDensK, uRoomK;
      uniform float uPx, uTime, uSync, uDay, uIntro, uScrollVel;
      varying vec2 vQ; varying float vB; varying float vS;
      void main(){
        vec3 p = texture2D(tPos, aRef).xyz;
        vec3 v = texture2D(tVel, aRef).xyz;
        vec4 r = texture2D(tRand, aRef);
        mat4 vp = projectionMatrix * viewMatrix;
        vec4 c0 = vp * vec4(p, 1.0);
        vec4 c1 = vp * vec4(p + v * 0.045, 1.0);
        vec2 sd = (c1.xy / c1.w - c0.xy / c0.w) * uView * 0.5;
        sd.y -= uScrollVel * (0.4 + r.z * 0.8);
        float len = length(sd);
        vec2 dir = len > 1e-3 ? sd / len : vec2(1.0, 0.0);
        float size = uPx * (0.55 + r.w * 0.9);
        float st = min(len, 90.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        vec2 off = dir * (position.x * (size + st) * 0.5 - st * 0.5) + nrm * position.y * size * 0.5;
        gl_Position = c0;
        gl_Position.xy += off * 2.0 / uView * c0.w;
        vQ = vec2(position.x * (size + st) / size, position.y);
        vS = (size + st) / size;
        // flicker: out of sync alone, one rhythm together
        float ph = mix(r.y * 6.2831, 0.0, uSync);
        float sp = mix(0.4 + r.z * 1.8, 1.1, uSync);
        float tw = 0.5 + 0.5 * sin(uTime * sp + ph);
        float b = mix(0.35 + 0.65 * tw * tw, 0.82 + 0.18 * tw, uSync);
        b += min(length(v) * 0.04, 1.2);
        float lamp = smoothstep(uMouse.w * 1.4, 0.0, distance(p.xy, uMouse.xy)) * uMouse.z;
        b += lamp * 1.6;
        b += smoothstep(1.4, 0.0, distance(p.xy, uFocus)) * 2.0;
        b *= step(r.x, uIntro * 1.02);
        b *= 1.0 - smoothstep(uFog.x, uFog.y, -(viewMatrix * vec4(p, 1.0)).z) * 0.85;
        b *= 1.0 - uDay;
        // local exposure: crowded areas dim each light so the whole reads as a field, not a flare
        float dens = texture2D(tGlow, (p.xy - uGlowBox.xy) / uGlowBox.zw).r * smoothstep(3.0, 0.5, p.z);
        b *= 1.0 / (1.0 + dens * uDensK);
        // inside the room everyone sits close: fixed exposure there
        b *= mix(1.0, uRoomK, smoothstep(3.5, 0.6, length(p.xy)) * smoothstep(2.0, 0.3, p.z));
        vB = b / (1.0 + st / size * 0.35);
      }`,
    fragmentShader: /* glsl */`
      uniform float uGain;
      varying vec2 vQ; varying float vB; varying float vS;
      void main(){
        // capsule falloff: distance to the streak's centre line
        float x = max(abs(vQ.x) - (vS - 1.0), 0.0);
        float d = length(vec2(x, vQ.y));
        float core = exp(-d * d * 9.0);
        float halo = exp(-d * d * 2.2) * 0.18;
        vec3 amber = vec3(1.0, 0.42, 0.075);
        vec3 hot = vec3(1.0, 0.82, 0.55);
        vec3 c = (amber * (core + halo) + hot * core * core * 0.9) * vB * uGain;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(quad, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 40;

  // ---------- glow points (density into a small top-down map, feeds "city glow" on the ground) ----------
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  gGeo.setAttribute('aRef', new THREE.BufferAttribute(refs, 2));
  const gMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tPos: shared.tPos, uDay: shared.uDay, uIntro: shared.uIntro, tRand: shared.tRand },
    vertexShader: 'attribute vec2 aRef; uniform sampler2D tPos, tRand; uniform float uIntro; varying float vA; void main(){ vec3 p = texture2D(tPos, aRef).xyz; vA = step(texture2D(tRand, aRef).x, uIntro) * smoothstep(3.0, 0.0, p.z) * smoothstep(2.0, 5.0, length(p.xy)); gl_Position = projectionMatrix * viewMatrix * vec4(p.xy, 0.0, 1.0); gl_PointSize = 1.0; }',
    fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vA * 0.08, 0.0, 0.0, 1.0); }',
  });
  const glowPoints = new THREE.Points(gGeo, gMat); glowPoints.frustumCulled = false;

  return {
    count: COUNT, mesh, glowPoints, shared, velUniforms: vu, posUniforms: posVar.material.uniforms,
    step(dt) {
      vu.uDt.value = dt; posVar.material.uniforms.uDt.value = dt;
      gpu.compute();
      shared.tPos.value = gpu.getCurrentRenderTarget(posVar).texture;
      shared.tVel.value = gpu.getCurrentRenderTarget(velVar).texture;
      vu.uSnap.value = 0;
    },
    snap() { vu.uSnap.value = 1; },
    dispose() { gpu.dispose(); quad.dispose(); mat.dispose(); gGeo.dispose(); gMat.dispose(); },
  };
}
