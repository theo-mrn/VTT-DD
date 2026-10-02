'use client';

/**
 * Chiffres gravés des dés, cuits dans une texture (aucun texte 3D) : une seule texture par type
 * de dé, partagée par toutes les skins, faite de
 * - RVB : carte de normales de la gravure (chiffres creusés, bords adoucis) ;
 * - A : masque de l'encre qui remplit les creux.
 *
 * Le matériau du dé la lit sur son second jeu d'UV (`uv1`, cellule de chaque face dans l'atlas,
 * `polyhedra.ts`) : la gravure accroche la lumière, l'encre prend la couleur de la skin (et un
 * peu d'émission, pour rester lisible sur les skins sombres ou lumineuses). Un dé coûte un seul
 * appel de dessin, au lieu d'un texte (et de son contour) par face.
 *
 * Texture construite en données brutes (`DataTexture`) : un canevas prémultiplie l'alpha et
 * perdrait les normales là où il n'y a pas d'encre.
 */
import * as THREE from 'three';
import { dieShape, type AtlasFace, type DieShape } from './polyhedra';

/** Côté d'une cellule de l'atlas, en pixels. */
const CELL_PX = 192;
/** Largeur des bords de la gravure, en pixels (flou du relief). */
const BEVEL_PX = 2;
/** Pente de la gravure (plus fort : plus creusé). */
const DEPTH = 3.2;
/** Intensité de la carte de normales dans le matériau. */
export const ENGRAVING_NORMAL_SCALE = new THREE.Vector2(1, 1);

const FONT = (px: number) => `400 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

/** Hauteur des chiffres selon la forme (part de la cellule). */
const TEXT_SIZE: Record<string, number> = {
  d4: 0.27,
  d6: 0.46,
  d8: 0.36,
  d10: 0.3,
  d12: 0.36,
  d20: 0.3,
};

function drawNumber(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
  angle = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.font = FONT(px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  // 6 et 9 soulignés : lisibles quelle que soit l'orientation
  if (text === '6' || text === '9') {
    const w = px * 0.42;
    ctx.fillRect(-w / 2, px * 0.42, w, Math.max(2, px * 0.08));
  }
  ctx.restore();
}

/** Masque de l'encre (0 à 1), en pixels de canevas (y vers le bas). */
function inkMask(shape: DieShape): { mask: Float32Array; size: number } {
  const { grid, faces } = shape.atlas;
  const size = grid * CELL_PX;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#fff';
  const px = Math.round(CELL_PX * (TEXT_SIZE[shape.type] ?? 0.32));
  for (const f of faces) drawFace(ctx, f, shape, px, grid);
  const data = ctx.getImageData(0, 0, size, size).data;
  const mask = new Float32Array(size * size);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4]! / 255;
  return { mask, size };
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  f: AtlasFace,
  shape: DieShape,
  px: number,
  grid: number,
) {
  const cx = f.cell % grid;
  const cy = Math.floor(f.cell / grid);
  // Coordonnées de cellule (y vers le haut) → canevas
  const at = (x: number, y: number): [number, number] => [
    (cx + x) * CELL_PX,
    (cy + 1 - y) * CELL_PX,
  ];
  if (shape.type === 'd4' && f.cornerValues) {
    // Un chiffre par coin, tourné vers son coin : on lit celui du sommet
    const center = f.polygon.reduce(
      (s, p) => [s[0] + p[0] / f.polygon.length, s[1] + p[1] / f.polygon.length],
      [0, 0],
    );
    f.polygon.forEach((corner, i) => {
      const dx = corner[0] - center[0];
      const dy = corner[1] - center[1];
      const [x, y] = at(center[0] + dx * 0.56, center[1] + dy * 0.56);
      drawNumber(ctx, f.cornerValues![i]!, x, y, px, Math.atan2(dx, dy));
    });
    return;
  }
  if (!f.value) return;
  const [x, y] = at(0.5, 0.5);
  drawNumber(ctx, f.value, x, y, f.value.length > 1 ? Math.round(px * 0.86) : px);
}

/** Flou séparable (rayon `r`) : le relief de la gravure, aux bords adoucis. */
function blur(src: Float32Array, size: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const k = 2 * r + 1;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += src[y * size + Math.min(size - 1, Math.max(0, x + d))]!;
      tmp[y * size + x] = s / k;
    }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += tmp[Math.min(size - 1, Math.max(0, y + d)) * size + x]!;
      out[y * size + x] = s / k;
    }
  return out;
}

function buildTexture(shape: DieShape): THREE.DataTexture {
  const { mask, size } = inkMask(shape);
  // Creux : hauteur −1 sous l'encre, adoucie sur les bords
  const height = blur(blur(mask, size, BEVEL_PX), size, 1);
  const data = new Uint8Array(size * size * 4);
  const h = (x: number, y: number) =>
    height[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))]!;
  const n = new THREE.Vector3();
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // Pente en u (droite) et en v (haut : canevas vers le haut) ; la gravure creuse (−h)
      const du = -(h(x + 1, y) - h(x - 1, y)) * 0.5;
      const dv = (h(x, y + 1) - h(x, y - 1)) * 0.5;
      n.set(-du * DEPTH, -dv * DEPTH, 1).normalize();
      // Ligne du bas de la texture en premier (v = 0) : canevas retourné
      const o = ((size - 1 - y) * size + x) * 4;
      data[o] = Math.round((n.x * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
      data[o + 3] = Math.round(mask[y * size + x]! * 255);
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.channel = 1;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const textures = new Map<string, THREE.DataTexture>();

/** Texture de gravure d'un type de dé (construite une fois, partagée). */
export function engravingTexture(type: string): THREE.DataTexture {
  const shape = dieShape(type);
  let t = textures.get(shape.type);
  if (!t) {
    t = buildTexture(shape);
    textures.set(shape.type, t);
  }
  return t;
}

/** Doré du chiffre retenu, et sa lueur. */
export const HIGHLIGHT_COLOR = '#ffbf33';
/** Lueur du chiffre retenu sur un dé foncé (sur un dé clair : aucune, l'or profond suffit). */
const HIGHLIGHT_GLOW = 1.1;
/** Halo autour du chiffre retenu, sur un dé foncé seulement. */
const HIGHLIGHT_AURA = 1.4;
/** Zone vide : jamais touchée par les UV (0 à 1). */
const NO_RECT = new THREE.Vector4(2, 2, 2, 2);

/** Réglages de l'encre d'un matériau de dé. */
export interface InkUniforms {
  uInkColor: { value: THREE.Color };
  /** Émission de l'encre (0 : simple pigment ; 1 : lumineuse, skins sans éclairage). */
  uInkGlow: { value: number };
  /** Chiffre retenu, doré : zones de l'atlas (u0, v0, u1, v1), 3 au plus (d4). */
  uHiRects: { value: THREE.Vector4[] };
  /** Apparition du doré, de 0 à 1. */
  uHiAmount: { value: number };
}

export const inkUniforms = (color: string, glow: number): InkUniforms => ({
  uInkColor: { value: new THREE.Color(color) },
  uInkGlow: { value: glow },
  uHiRects: { value: [NO_RECT.clone(), NO_RECT.clone(), NO_RECT.clone()] },
  uHiAmount: { value: 0 },
});

/**
 * Zones de l'atlas où est gravé le chiffre `value` d'un dé posé : la cellule de sa face ; d4 :
 * les trois chiffres du sommet (un par face qui le touche).
 */
export function highlightRects(type: string, value: string | null): THREE.Vector4[] {
  const shape = dieShape(type);
  const { grid, faces } = shape.atlas;
  const out: THREE.Vector4[] = [];
  const rect = (cell: number, x0: number, y0: number, x1: number, y1: number) => {
    const cx = cell % grid;
    const cy = Math.floor(cell / grid);
    out.push(
      new THREE.Vector4(
        (cx + x0) / grid,
        1 - (cy + 1 - y0) / grid,
        (cx + x1) / grid,
        1 - (cy + 1 - y1) / grid,
      ),
    );
  };
  if (value)
    for (const f of faces) {
      if (shape.type === 'd4' && f.cornerValues) {
        const i = f.cornerValues.indexOf(value);
        if (i < 0) continue;
        const center = f.polygon.reduce(
          (s, p) => [s[0] + p[0] / f.polygon.length, s[1] + p[1] / f.polygon.length],
          [0, 0],
        );
        const corner = f.polygon[i]!;
        const x = center[0] + (corner[0] - center[0]) * 0.56;
        const y = center[1] + (corner[1] - center[1]) * 0.56;
        const h = (TEXT_SIZE.d4 ?? 0.27) * 0.75;
        rect(f.cell, x - h, y - h, x + h, y + h);
      } else if (f.value === value) rect(f.cell, 0, 0, 1, 1);
    }
  while (out.length < 3) out.push(NO_RECT.clone());
  return out.slice(0, 3);
}

/**
 * Ajoute l'encre au programme d'un matériau standard ou physique dont `normalMap` est la
 * texture de gravure (canal UV 1) : couleur, rugosité et métal de l'encre dans les creux, et
 * son émission. À appeler à la fin du `onBeforeCompile` du matériau.
 */
export function injectInk(shader: THREE.WebGLProgramParametersWithUniforms, u: InkUniforms) {
  shader.uniforms.uInkColor = u.uInkColor;
  shader.uniforms.uInkGlow = u.uInkGlow;
  shader.uniforms.uHiRects = u.uHiRects;
  shader.uniforms.uHiAmount = u.uHiAmount;
  shader.uniforms.uHiColor = { value: new THREE.Color(HIGHLIGHT_COLOR) };
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform vec3 uInkColor;
uniform float uInkGlow;
uniform vec4 uHiRects[3];
uniform float uHiAmount;
uniform vec3 uHiColor;`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
float inkMask = 0.0;
float inkHi = 0.0;
float inkAura = 0.0;
#ifdef USE_NORMALMAP
  // Biais vers la netteté : réduit à l'écran, le chiffre ne bave pas (il paraîtrait plus gras)
  inkMask = texture2D( normalMap, vNormalMapUv, -0.75 ).a;
  // Chiffre retenu : doré
  for ( int i = 0; i < 3; i ++ ) {
    vec4 r = uHiRects[ i ];
    if ( vNormalMapUv.x >= r.x && vNormalMapUv.x <= r.z && vNormalMapUv.y >= r.y && vNormalMapUv.y <= r.w ) inkHi = uHiAmount;
  }
#endif
// Chiffre retenu selon la clarté du dé : or profond sur un dé clair, or vif lumineux (et
// léger halo, lu dans un niveau flou de la texture) sur un dé foncé
float inkDark = 1.0 - smoothstep( 0.2, 0.55, dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) ) );
#ifdef USE_NORMALMAP
  if ( inkHi > 0.0 ) inkAura = smoothstep( 0.08, 0.45, texture2D( normalMap, vNormalMapUv, 2.0 ).a ) * ( 1.0 - inkMask ) * inkHi * inkDark;
#endif
vec3 hiColor = mix( vec3( 0.42, 0.24, 0.0 ), uHiColor, inkDark );
vec3 inkColor = mix( uInkColor, hiColor, inkHi );
diffuseColor.rgb = mix( diffuseColor.rgb, inkColor, inkMask );
roughnessFactor = mix( roughnessFactor, 0.55, inkMask );`,
    )
    .replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
metalnessFactor = mix( metalnessFactor, 0.0, inkMask );`,
    )
    // Après l'éclairage (et l'émission propre aux skins) : l'encre garde sa lueur partout
    .replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
totalEmissiveRadiance = mix( totalEmissiveRadiance, inkColor * mix( uInkGlow, ${HIGHLIGHT_GLOW.toFixed(2)} * inkDark, inkHi ), inkMask );
totalEmissiveRadiance += uHiColor * inkAura * ${HIGHLIGHT_AURA.toFixed(2)};`,
    );
}
