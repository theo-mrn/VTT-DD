// Fonds de fiche animés (WebGL pur). Chaque entrée = { id, label, Component }. Ajoutez-en librement :
// une nouvelle fonction makeShaderBackground(...) et une entrée dans BACKGROUNDS.
import { makeShaderBackground } from './shader';

// ── Champ d'étoiles lent, ambiance spatiale sobre (bon défaut derrière une fiche) ──
const Starfield = makeShaderBackground(`
uniform vec2 iResolution;
uniform float iTime;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  vec3 col = vec3(0.02, 0.03, 0.06);           // noir spatial légèrement bleuté
  for (float i = 0.0; i < 3.0; i++) {
    float depth = 1.0 + i;
    vec2 g = uv * (6.0 + i * 5.0);
    g.y += iTime * 0.04 * depth;               // dérive lente
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float star = hash(id + i * 13.0);
    if (star > 0.94) {
      float tw = 0.5 + 0.5 * sin(iTime * 2.0 + star * 40.0);
      float d = smoothstep(0.12, 0.0, length(f));
      col += vec3(0.7, 0.8, 1.0) * d * tw / depth;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`);

// ── Hyperespace / warp : traits radiaux filant vers l'extérieur ──
const Hyperspace = makeShaderBackground(`
uniform vec2 iResolution;
uniform float iTime;
float hash(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float a = atan(uv.y, uv.x);
  float r = length(uv);
  vec3 col = vec3(0.01, 0.02, 0.05);
  float streaks = 0.0;
  for (float i = 0.0; i < 40.0; i++) {
    float seed = hash(i * 1.37);
    float ang = seed * 6.2831;
    float da = abs(mod(a - ang + 3.1415, 6.2831) - 3.1415);
    float speed = 0.6 + seed;
    float len = fract(seed * 7.0 + iTime * speed);   // position le long du rayon, boucle
    float rr = len * 1.4;
    float line = smoothstep(0.05, 0.0, da) * smoothstep(0.02, 0.0, abs(r - rr));
    streaks += line * len;
  }
  col += vec3(0.6, 0.8, 1.0) * streaks;
  col += vec3(0.4, 0.6, 1.0) * smoothstep(0.4, 0.0, r) * 0.15;  // halo central
  gl_FragColor = vec4(col, 1.0);
}
`);

// ── Nébuleuse / brume colorée douce ──
const Nebula = makeShaderBackground(`
uniform vec2 iResolution;
uniform float iTime;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec2 q = uv * 3.0;
  q.x += iTime * 0.03;
  float n = fbm(q + fbm(q * 1.5 + iTime * 0.05));
  vec3 a = vec3(0.03, 0.02, 0.08);
  vec3 b = vec3(0.35, 0.12, 0.45);   // violet
  vec3 c = vec3(0.05, 0.25, 0.45);   // bleu
  vec3 col = mix(a, mix(c, b, n), smoothstep(0.2, 0.9, n));
  col += vec3(hash(uv * 800.0) > 0.997 ? 0.8 : 0.0);  // quelques étoiles
  gl_FragColor = vec4(col, 1.0);
}
`);

// ── "Starship" par @XorDev (Shadertoy, adapté) — traînées lumineuses d'un vaisseau sur fond noir.
// Port GLSL ES 1.0 : texture() → texture2D(), tanh() polyfillé (absent en ES 1.0, clampé contre les
// NaN d'overflow d'exp), T figé à l'initialisation comme dans l'original.
const Starship = makeShaderBackground(`
uniform vec2 iResolution;
uniform float iTime;
uniform sampler2D iChannel0;
vec3 tanh3(vec3 x){
  vec3 e = exp(2.0 * clamp(x, 0.0, 10.0));
  return (e - 1.0) / (e + 1.0);
}
void main(){
  vec2 r = iResolution.xy;
  vec2 I = gl_FragCoord.xy;
  vec2 p = (I + I - r) / r.y * mat2(3., 4., 4., -3.) / 1e2;
  vec4 S = vec4(0.0);
  vec4 C = vec4(1., 2., 3., 0.);
  vec4 W;
  float t = iTime;
  float T = .1 * t + p.y;
  for (float i = 0.; i < 50.; i += 1.) {
    W = sin(i) * C;
    S += (cos(W) + 1.)
         * exp(sin(i + i * T))
         / length(max(p,
             p / vec2(2.0, texture2D(iChannel0, p / exp(W.x) + vec2(i, t) / 8.).r * 40.0)
           )) / 1e4;
    p += .02 * cos(i * (C.xz + 8.0 + i) + T + T);
  }
  gl_FragColor = vec4(tanh3((S * S).rgb), 1.0);
}
`, { noise: true });

// La fiche préfixe elle-même l'option "Aucun" — on ne fournit que les fonds actifs.
export const BACKGROUNDS = [
  { id: 'starfield', label: 'Champ d’étoiles', Component: Starfield },
  { id: 'hyperspace', label: 'Hyperespace', Component: Hyperspace },
  { id: 'nebula', label: 'Nébuleuse', Component: Nebula },
  { id: 'starship', label: 'Starship', Component: Starship },
];
