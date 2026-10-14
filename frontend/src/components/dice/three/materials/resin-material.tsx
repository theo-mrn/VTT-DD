'use client';

/**
 * Matériau « résine » (skins de test, `skin.resin`) : le motif est cuit UNE fois dans une cubemap
 * (lue par la direction depuis le centre du dé : un point par direction sur un dé convexe), puis
 * le dé ne fait qu'une lecture de texture par pixel, sous un vernis (clearcoat). Les skins
 * procéduraux recalculent leur bruit fractal à chaque pixel et à chaque image ; ici, la cuisson
 * peut se permettre plus de détail (7 octaves, domaine déformé) pour un coût nul ensuite.
 *
 * Alpha de la cubemap : masque des paillettes (métal lisse : elles scintillent sous la lumière).
 */
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { DiceSkin, ResinLook } from '../dice-definitions';
import { ENGRAVING_NORMAL_SCALE, injectInk } from '../engraving';
import { bakeCube } from './bake';
import type { EngravingProps } from './procedural-material';

const PATTERN_ID: Record<ResinLook['pattern'], number> = {
  marble: 0,
  nebula: 1,
  smoke: 2,
  jade: 3,
  crystal: 4,
  bark: 5,
  stone: 6,
  rust: 7,
};

const BAKE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform int uPattern;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform float uSeed;
uniform float uFlakes;
uniform float uScale;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 7; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}

// Cellules (Voronoï) : distance au germe le plus proche, au second, teinte de la cellule
vec3 cells(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;
  for (int k = -1; k <= 1; k++)
    for (int j = -1; j <= 1; j++)
      for (int n = -1; n <= 1; n++) {
        vec3 g = vec3(float(n), float(j), float(k));
        vec3 o = vec3(hash(i + g), hash(i + g + vec3(7.1, 3.3, 1.7)), hash(i + g + vec3(2.9, 8.1, 5.3)));
        vec3 r = g + o - f;
        float d = dot(r, r);
        if (d < f1) { f2 = f1; f1 = d; id = hash(i + g + vec3(4.4, 1.1, 9.9)); }
        else if (d < f2) { f2 = d; }
      }
  return vec3(sqrt(f1), sqrt(f2), id);
}

void main() {
  vec3 p = normalize(vDir) * uScale + vec3(uSeed * 31.0, uSeed * 17.0, uSeed * 7.0);
  vec3 col = uC1;
  float flake = 0.0;
  if (uPattern == 0) {
    // Marbre : domaine déformé deux fois, veines fines et nettes
    vec3 q = vec3(fbm(p), fbm(p + vec3(5.2, 1.3, 2.7)), fbm(p + vec3(1.7, 9.2, 4.4)));
    vec3 r = vec3(fbm(p + 4.0 * q), fbm(p + 4.0 * q + vec3(8.3, 2.8, 0.0)), fbm(p + 4.0 * q + vec3(3.1, 5.6, 7.2)));
    float body = fbm(p + 4.0 * r);
    float t = abs(fbm(p * 1.6 + r * 2.5) - 0.5) * 2.0;
    col = mix(uC1, uC2, smoothstep(0.3, 0.75, body));
    col = mix(col, uC3, smoothstep(0.16, 0.02, t) * 0.35);
    col = mix(col, uC3, smoothstep(0.05, 0.0, t) * 0.9);
  } else if (uPattern == 1) {
    // Nuit pailletée : nuages profonds et paillettes
    float c = fbm(p * 1.4 + fbm(p * 0.8) * 1.2);
    col = mix(uC1, uC2, smoothstep(0.42, 0.85, c) * 0.85);
    float g = hash(floor(p * 70.0));
    flake = step(1.0 - 0.02 * uFlakes, g);
    col = mix(col, uC3, flake * 0.8);
  } else if (uPattern == 2) {
    // Fumée : volutes laiteuses dans une résine teintée
    float f = fbm(p * 1.2 + fbm(p * 2.0) * 1.8);
    col = mix(uC1, uC2, smoothstep(0.35, 0.72, f));
    col = mix(col, uC3, smoothstep(0.6, 0.72, f) * 0.55);
  } else if (uPattern == 4) {
    // Cristal (gemmes) : zones de croissance anguleuses, chacune sa nuance, nuages laiteux pris
    // dans la masse, quelques éclats ; le fond reste profond
    vec3 v = cells(p * 1.25 + vec3(fbm(p * 1.4), fbm(p * 1.4 + 3.1), fbm(p * 1.4 + 6.2)) * 0.7);
    float edge = v.y - v.x;
    float cloud = fbm(p * 1.8 + fbm(p * 0.9) * 1.4);
    float tone = clamp(v.z * 0.55 + cloud * 0.65 - 0.15, 0.0, 1.0);
    col = mix(uC1, uC2, smoothstep(0.1, 0.95, tone));
    col = mix(col, mix(uC2, uC3, 0.3), smoothstep(0.05, 0.0, edge) * 0.14);
    float milk = smoothstep(0.6, 0.82, fbm(p * 3.2 + vec3(3.0, 1.0, 7.0)));
    col = mix(col, uC3, milk * 0.4);
    flake = step(1.0 - 0.012 * max(uFlakes, 0.3), hash(floor(p * 85.0)));
    col = mix(col, uC3, flake * 0.5);
  } else if (uPattern == 5) {
    // Écorce : sillons étroits et allongés (lignes de niveau d'un bruit très étiré), plaques
    // larges entre eux, fibres dans le sens du bois, dessus des plaques usés, lichen sur les
    // plaques. Étirés selon l'axe vertical, et selon un axe couché près des pôles (pas de point
    // où tout converge). L'alpha porte la hauteur (relief).
    vec3 d = normalize(vDir);
    vec3 o = vec3(uSeed * 31.0, uSeed * 17.0, uSeed * 7.0);
    vec3 qa = vec3(d.x * 6.5, d.y * 0.7, d.z * 6.5) * uScale + o;
    vec3 qb = vec3(d.x * 0.7, d.y * 6.5, d.z * 6.5) * uScale + o;
    float w = smoothstep(0.6, 0.9, abs(d.y));
    float n = mix(fbm(qa), fbm(qb), w);
    float plate = smoothstep(0.0, 0.2, abs(n - 0.5));
    float cut = smoothstep(0.6, 0.68, fbm(p * 1.6 + 4.0));
    plate *= 1.0 - cut * 0.5;
    float fibre = mix(fbm(qa * 2.5), fbm(qb * 2.5), w);
    float h = clamp(plate * 0.88 + fibre * 0.12, 0.0, 1.0);
    col = mix(uC1, uC2, smoothstep(0.05, 0.6, h));
    col *= mix(0.86, 1.1, fibre);
    col = mix(col, uC2 * 1.4, smoothstep(0.82, 0.98, h) * 0.4);
    float lichen = smoothstep(0.57, 0.7, fbm(p * 2.4 + 9.0)) * smoothstep(0.5, 0.78, h);
    col = mix(col, uC3, lichen * 0.65);
    flake = h;
  } else if (uPattern == 6) {
    // Pierre de donjon : granit (tons en plusieurs échelles, grains minéraux clairs et sombres),
    // fissures (bords de grandes cellules), trous et écaillures, crasse dans les creux, mousse
    // logée dans les fissures et les trous. L'alpha porte la hauteur (relief).
    float tone = fbm(p * 0.8) * 0.7 + fbm(p * 3.0) * 0.3;
    col = mix(uC1, uC2, smoothstep(0.32, 0.72, tone));
    vec3 g = cells(p * 42.0);
    float clair = step(0.82, g.z) * smoothstep(0.42, 0.15, g.x);
    float sombre = step(g.z, 0.12) * smoothstep(0.42, 0.15, g.x);
    col = mix(col, vec3(0.86, 0.84, 0.8), clair * 0.28);
    col = mix(col, uC1 * 0.5, sombre * 0.35);
    vec3 c = cells(p * 1.15 + vec3(fbm(p * 2.0), fbm(p * 2.0 + 3.0), fbm(p * 2.0 + 6.0)) * 0.9);
    // Fissures : seulement une partie des bords, de largeur variable (jamais un réseau régulier)
    float fissure = smoothstep(0.05 * (0.5 + fbm(p * 6.0)), 0.0, c.y - c.x)
      * smoothstep(0.38, 0.55, fbm(p * 1.8 + 15.0));
    float trou = smoothstep(0.66, 0.78, fbm(p * 5.0 + 11.0));
    float grain = fbm(p * 18.0);
    float h = clamp(0.7 + (tone - 0.5) * 0.4 + (grain - 0.5) * 0.12 - fissure * 0.7 - trou * 0.4, 0.0, 1.0);
    col *= mix(0.62, 1.0, smoothstep(0.2, 0.7, h));
    float mousse = max(fissure, trou) * smoothstep(0.4, 0.6, fbm(p * 2.2 + 21.0));
    col = mix(col, uC3, mousse * 0.9);
    col = mix(col, uC3 * 0.7, smoothstep(0.62, 0.7, fbm(p * 4.0 + 31.0)) * smoothstep(0.55, 0.8, fbm(p * 1.3 + 41.0)) * 0.5);
    flake = h;
  } else if (uPattern == 7) {
    // Fer rouillé : fer sombre brossé, rongé par plaques de rouille (du brun à l'orangé), bord
    // des plaques plus sombre, piqûres dans la rouille. L'alpha est le masque du métal nu.
    float fine = fbm(p * 12.0);
    float brosse = fbm(vec3(p.x * 40.0, p.y * 2.0, p.z * 40.0));
    float couv = fbm(p * 1.2) * 0.6 + fbm(p * 3.5) * 0.4 + (fine - 0.5) * 0.18;
    float rouille = smoothstep(0.44, 0.6, couv);
    vec3 fer = uC1 * mix(0.8, 1.2, brosse);
    vec3 rc = mix(uC2, uC3, smoothstep(0.3, 0.8, fbm(p * 6.0 + 3.0))) * mix(0.7, 1.12, fine);
    col = mix(fer, rc, rouille);
    col *= 1.0 - smoothstep(0.0, 0.1, rouille) * smoothstep(0.35, 0.1, rouille) * 0.25;
    float pique = smoothstep(0.68, 0.8, fbm(p * 9.0 + 7.0)) * rouille;
    col = mix(col, uC2 * 0.55, pique * 0.5);
    flake = clamp(1.0 - rouille - pique * 0.3, 0.0, 1.0);
  } else {
    // Jade : marbrures douces et inclusions claires
    float f = fbm(p * 2.0);
    float g = fbm(p * 6.0 + f);
    col = mix(uC1, uC2, smoothstep(0.32, 0.72, f));
    col = mix(col, uC3, smoothstep(0.58, 0.78, g) * 0.4);
  }
  gl_FragColor = vec4(col, flake);
}`;

/** Motif cuit d'un skin résine (une fois par contexte WebGL et par skin). */
export function bakeResin(gl: THREE.WebGLRenderer, id: string, look: ResinLook, seed = seedOf(id)) {
  return bakeCube(gl, `resin:${id}`, BAKE_FRAGMENT, {
    uPattern: { value: PATTERN_ID[look.pattern] },
    uC1: { value: new THREE.Color(look.colors[0]) },
    uC2: { value: new THREE.Color(look.colors[1]) },
    uC3: { value: new THREE.Color(look.colors[2]) },
    uSeed: { value: seed },
    uFlakes: { value: look.flakes ?? 0 },
    uScale: { value: look.scale ?? 1.6 },
  });
}

function seedOf(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** Ajoute le motif cuit (et ses paillettes) au programme d'un matériau physique. */
export function injectResin(
  shader: THREE.WebGLProgramParametersWithUniforms,
  texture: THREE.CubeTexture,
  /** Force du bosselage (l'alpha sert de hauteur) ; 0 : aucun. */
  relief = 0,
  /** Ce que porte l'alpha : paillettes, hauteur seule, ou masque du métal nu. */
  alpha: 'flakes' | 'height' | 'metal' = relief > 0 ? 'height' : 'flakes',
  /** Rugosité du métal nu (masque `metal`). */
  metalRoughness = 0.3,
  /**
   * Éclat propre du métal (nu, avec le masque `metal`), selon sa couleur : l'environnement des
   * dés est sombre, un métal poli n'y refléterait que du noir (même principe que l'émission de
   * l'argent). À doser bas : trop fort, le métal ne se reconnaît plus.
   */
  metalFill = 0,
) {
  shader.uniforms.uResin = { value: texture };
  shader.uniforms.uRelief = { value: relief };
  shader.uniforms.uMetalRough = { value: metalRoughness };
  shader.uniforms.uMetalFill = { value: metalFill };
  const mode = alpha === 'flakes' ? 0 : alpha === 'height' ? 1 : 2;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vResinPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvResinPos = position;');
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>\nuniform samplerCube uResin;\nuniform float uRelief;\nuniform float uMetalRough;\nuniform float uMetalFill;\nvarying vec3 vResinPos;\n#define RESIN_MODE ${mode}`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
vec4 resin = textureCube( uResin, normalize( vResinPos ) );
diffuseColor.rgb = resin.rgb;
float resinFlake = RESIN_MODE == 0 ? resin.a : 0.0;
float resinMetal = RESIN_MODE == 2 ? resin.a : 0.0;`,
    )
    // Paillettes : métal lisse (insérées avant l'encre, qui garde le dernier mot)
    .replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.12, resinFlake );\nroughnessFactor = mix( roughnessFactor, uMetalRough, resinMetal );',
    )
    .replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uMetalFill * ( RESIN_MODE == 2 ? resinMetal : 1.0 );',
    )
    .replace(
      '#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\nmetalnessFactor = mix( metalnessFactor, 1.0, max( resinFlake, resinMetal ) );',
    );
  // Relief : bosselage par la pente de la hauteur à l'écran (méthode de three, perturbNormalArb)
  if (relief > 0)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
{
  float hr = resin.a;
  vec2 dh = vec2( dFdx( hr ), dFdy( hr ) ) * uRelief;
  vec3 sx = dFdx( -vViewPosition );
  vec3 sy = dFdy( -vViewPosition );
  vec3 r1 = cross( sy, normal );
  vec3 r2 = cross( normal, sx );
  float det = dot( sx, r1 ) * ( float( gl_FrontFacing ) * 2.0 - 1.0 );
  normal = normalize( abs( det ) * normal - sign( det ) * ( dh.x * r1 + dh.y * r2 ) );
}`,
    );
}

export const ResinMaterial = ({
  skin,
  engraving,
}: {
  skin: DiceSkin & { resin: ResinLook };
  engraving?: EngravingProps;
}) => {
  const gl = useThree((s) => s.gl);
  const look = skin.resin;
  const texture = useMemo(() => bakeResin(gl, skin.id, look), [gl, skin.id, look]);
  const onBeforeCompile = useMemo(
    () => (shader: THREE.WebGLProgramParametersWithUniforms) => {
      if (engraving) injectInk(shader, engraving.ink);
      injectResin(
        shader,
        texture,
        look.relief ?? 0,
        look.alpha,
        look.metalRoughness,
        look.metalFill,
      );
    },
    [texture, engraving, look.relief, look.alpha, look.metalRoughness, look.metalFill],
  );

  return (
    <meshPhysicalMaterial
      color="#ffffff"
      metalness={skin.metalness}
      roughness={skin.roughness}
      envMapIntensity={skin.envMapIntensity}
      clearcoat={look.clearcoat ?? 1}
      clearcoatRoughness={look.clearcoatRoughness ?? 0.06}
      onBeforeCompile={onBeforeCompile}
      customProgramCacheKey={() =>
        `resin-${look.alpha ?? (look.relief ? 'height' : 'flakes')}${look.relief ? '-relief' : ''}${engraving ? '-engraved' : ''}`
      }
      {...(engraving ? { normalMap: engraving.map, normalScale: ENGRAVING_NORMAL_SCALE } : {})}
    />
  );
};
