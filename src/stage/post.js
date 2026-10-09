// Cinematic finish: HDR bloom, tilt-shift depth of field, lens edge dispersion, film grain, vignette.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const LensShader = {
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uFocus: { value: 0.5 }, uBand: { value: 0.22 }, uBlur: { value: 0 }, uCA: { value: 0.6 }, uGrain: { value: 0.04 }, uVig: { value: 0.35 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uFocus, uBand, uBlur, uCA, uGrain, uVig;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec2 uv = vUv;
      // tilt-shift: blur grows away from a horizontal focus band
      float away = max(abs(uv.y - uFocus) - uBand, 0.0) / (1.0 - uBand);
      float rad = uBlur * away * away * 14.0;
      vec2 c = uv - 0.5;
      float edge = dot(c, c);
      vec2 ca = c * edge * uCA * 0.018;
      vec3 col;
      if (rad > 0.25) {
        vec3 acc = vec3(0.0); float wsum = 0.0;
        float ang = hash(uv * uRes + uTime) * 6.2831;
        for (int i = 0; i < 16; i++) {
          float fi = float(i);
          float rr = sqrt((fi + 0.5) / 16.0) * rad;
          float a = ang + fi * 2.39996;
          vec2 o = vec2(cos(a), sin(a)) * rr / uRes;
          vec3 s = vec3(texture2D(tDiffuse, uv + o + ca).r, texture2D(tDiffuse, uv + o).g, texture2D(tDiffuse, uv + o - ca).b);
          float w = 1.0 + dot(s, vec3(0.33)) * 2.0; // bright taps bloom into bokeh
          acc += s * w; wsum += w;
        }
        col = acc / wsum;
      } else {
        col = vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
      }
      col *= 1.0 - smoothstep(0.25, 0.95, edge * 2.2) * uVig;
      float g = hash(uv * uRes * 0.5 + fract(uTime * 13.0) * 100.0) - 0.5;
      col += g * uGrain * (0.35 + 0.65 * (1.0 - dot(col, vec3(0.3))));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost({ renderer, scene, camera, mobile }) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: mobile ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  const render = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.9, 0.55, 0.92);
  const lens = new ShaderPass(LensShader);
  composer.addPass(render);
  composer.addPass(bloom);
  composer.addPass(lens);
  composer.addPass(new OutputPass());
  return {
    composer, bloom, lens,
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr); composer.setSize(w, h);
      lens.uniforms.uRes.value.set(w * dpr, h * dpr);
      bloom.resolution.set((w * dpr) / 2, (h * dpr) / 2);
    },
    render(dt) { composer.render(dt); },
    dispose() { composer.dispose(); rt.dispose(); },
  };
}
