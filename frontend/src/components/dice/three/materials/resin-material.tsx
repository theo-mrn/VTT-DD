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
) {
  shader.uniforms.uResin = { value: texture };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vResinPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvResinPos = position;');
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nuniform samplerCube uResin;\nvarying vec3 vResinPos;',
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
vec4 resin = textureCube( uResin, normalize( vResinPos ) );
diffuseColor.rgb = resin.rgb;
float resinFlake = resin.a;`,
    )
    // Paillettes : métal lisse (insérées avant l'encre, qui garde le dernier mot)
    .replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.12, resinFlake );',
    )
    .replace(
      '#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\nmetalnessFactor = mix( metalnessFactor, 1.0, resinFlake );',
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
      injectResin(shader, texture);
    },
    [texture, engraving],
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
      customProgramCacheKey={() => `resin${engraving ? '-engraved' : ''}`}
      {...(engraving ? { normalMap: engraving.map, normalScale: ENGRAVING_NORMAL_SCALE } : {})}
    />
  );
};
