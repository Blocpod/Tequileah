// Shared GLSL chunks.

// Ashima simplex 3D noise (MIT) + a 2D curl built from it.
export const NOISE = /* glsl */`
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
vec2 curl2(vec2 p, float t){
  const float e = 0.08;
  float n1 = snoise(vec3(p.x, p.y + e, t)), n2 = snoise(vec3(p.x, p.y - e, t));
  float n3 = snoise(vec3(p.x + e, p.y, t)), n4 = snoise(vec3(p.x - e, p.y, t));
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
}
`;

// The analytic route each light wants to follow. Shared by the simulation (as a spring target)
// and anything else that needs to know where a light "should" be.
export const PATH = /* glsl */`
const float PI = 3.14159265;
uniform float uConv, uClose;
vec2 bez(vec2 a, vec2 c, vec2 b, float t){ float u = 1.0 - t; return u*u*a + 2.0*u*t*c + t*t*b; }
// hs = (home.xy, seat.xy); r = per-light randoms. Returns target position; trav = 0..1 how "in flight" it is.
vec3 pathPos(vec4 hs, vec4 r, out float trav){
  vec2 home = hs.xy, seat = hs.zw;
  float d = length(home);
  float delay = (1.0 - clamp(d / 150.0, 0.0, 1.0)) * 0.42 + r.x * 0.16;
  float k = smoothstep(delay, delay + 0.42, uConv);
  vec2 dir = seat - home; vec2 perp = vec2(-dir.y, dir.x);
  vec2 p = bez(home, mix(home, seat, 0.5) + perp * (0.26 + r.y * 0.12), seat, k);
  float lift = sin(k * PI) * (length(dir) * 0.14 + 0.3);
  trav = sin(k * PI);
  if (uClose > 0.0) {
    float dc = clamp(d / 150.0, 0.0, 1.0) * 0.35 + r.y * 0.15;
    float kc = smoothstep(dc, dc + 0.5, uClose);
    vec2 dir2 = home - seat; vec2 perp2 = vec2(-dir2.y, dir2.x);
    p = bez(seat, mix(seat, home, 0.5) - perp2 * 0.18, home, kc);
    lift = sin(kc * PI) * (length(dir2) * 0.1 + 0.3);
    trav = sin(kc * PI);
  }
  return vec3(p, 0.04 + lift);
}
`;
