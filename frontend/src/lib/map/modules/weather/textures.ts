/**
 * Textures de la météo, faites une fois au montage (docs/carte.md § 10, Météo) :
 * - l'atlas des particules (traînée, point doux, flocon, trois feuilles, anneau), en blanc
 *   et gris, teinté par particule ;
 * - un bruit fractal périodique (nappes du brouillard, du blizzard, du sable) ;
 * - la vignette (alerte), le grain et les trames (parasites).
 * Les pixels sont calculés sans DOM (`paint*`, testés) ; seul `createWeatherTextures` passe
 * par un canevas 2D.
 */
import type * as Pixi from 'pixi.js';
import { ATLAS, ATLAS_HEIGHT, ATLAS_WIDTH, type AtlasRect } from './atlas';
import type { AtlasFrame } from './effects';
import { NOISE_SIZE } from './simulation';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Un pixel : luminosité (0 à 1, sur le blanc) et opacité (0 à 1). */
type Shade = (x: number, y: number) => readonly [value: number, alpha: number];

/** Pixels RVBA (non prémultipliés, comme `ImageData`) d'une image de `w × h`. */
export function paint(w: number, h: number, shade: Shade): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [value, alpha] = shade(x + 0.5, y + 0.5);
      const i = (y * w + x) * 4;
      const v = Math.round(clamp01(value) * 255);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = Math.round(clamp01(alpha) * 255);
    }
  return data;
}

/** Formes de l'atlas, en coordonnées locales de chaque image. */
export const ATLAS_SHADES: Readonly<Record<AtlasFrame, Shade>> = {
  // Traînée : fine, queue effacée vers le haut, tête arrondie en bas
  streak: (x, y) => {
    const across = clamp01(1 - Math.abs(x - 4) / 2.2);
    const along = Math.pow(y / 64, 1.6) * clamp01((64 - y) / 3);
    return [1, across * across * along];
  },
  dot: (x, y) => {
    const d = Math.hypot(x - 16, y - 16);
    return [1, Math.pow(clamp01(1 - d / 13), 1.4)];
  },
  flake: (x, y) => {
    const d = Math.hypot(x - 16, y - 16);
    const core = d < 7 ? 1 : Math.pow(clamp01(1 - (d - 7) / 5), 2);
    return [1, Math.max(core, 0.25 * clamp01(1 - d / 15))];
  },
  leaf0: (x, y) => leaf(x, y, (u) => 0.55 * Math.pow(1 - u * u, 0.9) * (1 + 0.15 * u)),
  leaf1: (x, y) => leaf(x, y, (u) => 0.85 * Math.pow(1 - u * u, 0.7)),
  leaf2: (x, y) =>
    leaf(
      x,
      y,
      (u) => 0.8 * Math.pow(1 - u * u, 0.6) * (0.72 + 0.28 * Math.abs(Math.cos(3 * Math.PI * u))),
    ),
  // Anneau d'éclaboussure, fin et doux
  ring: (x, y) => {
    const d = Math.hypot(x - 32, y - 32);
    return [1, 0.9 * Math.exp(-(((d - 26) / 2.2) ** 2))];
  },
};

/** Feuille de 32 × 20 : demi-largeur `half(u)` le long de sa longueur, nervure et tige. */
function leaf(x: number, y: number, half: (u: number) => number): readonly [number, number] {
  const u = (x - 16) / 14;
  const v = (y - 10) / 9;
  // Tige, à gauche
  if (u < -0.92 && u > -1.12 && Math.abs(v) < 0.08) return [0.55, 1];
  if (Math.abs(u) >= 1) return [0, 0];
  const hw = half(u);
  if (hw <= 0) return [0, 0];
  const e = Math.abs(v) / hw;
  // Bord adouci sur un pixel environ
  const alpha = clamp01((1 - e) * hw * 9);
  const vein = Math.abs(v) < 0.06 && Math.abs(u) < 0.92 ? 0.62 : 1;
  return [(0.8 + 0.2 * (1 - e)) * vein, alpha];
}

/**
 * Bruit de valeurs fractal et périodique (le motif se raccorde sur ses bords) : une grille de
 * valeurs par octave (périodes en cases), interpolation douce, somme normalisée de 0 à 1.
 */
export function tileableNoise(
  size: number,
  periods: readonly number[],
  rng: () => number,
): Float32Array {
  const out = new Float32Array(size * size);
  let total = 0;
  periods.forEach((period, octave) => {
    const amp = 0.5 ** octave;
    total += amp;
    const lattice = new Float32Array(period * period);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * period;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % period) * period;
      const r1 = ((y0 + 1) % period) * period;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * period;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % period;
        const c1 = (x0 + 1) % period;
        const top = lattice[r0 + c0]! + (lattice[r0 + c1]! - lattice[r0 + c0]!) * sx;
        const bottom = lattice[r1 + c0]! + (lattice[r1 + c1]! - lattice[r1 + c0]!) * sx;
        out[y * size + x]! += (top + (bottom - top) * sy) * amp;
      }
    }
  });
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / total;
  return out;
}

/** Nappes : bruit en nuages (seuil doux), blanc. */
export function paintMist(size: number, rng: () => number): Uint8ClampedArray {
  const n = tileableNoise(size, [4, 8, 16, 32], rng);
  return paint(size, size, (x, y) => [
    1,
    smooth(0.32, 0.82, n[Math.floor(y) * size + Math.floor(x)]!),
  ]);
}

/** Vignette : transparente au centre, pleine aux coins. */
export const paintVignette = (size: number) =>
  paint(size, size, (x, y) => {
    const d = Math.hypot(x / size - 0.5, y / size - 0.5) / Math.SQRT1_2;
    return [1, Math.pow(smooth(0.45, 1, d), 1.3)];
  });

/** Grain de télévision : gris au hasard, un pixel sur deux transparent. */
export const paintGrain = (size: number, rng: () => number) =>
  paint(size, size, () => [rng(), rng() < 0.5 ? 1 : 0]);

export interface WeatherTextures {
  atlas: Record<AtlasFrame, Pixi.Texture>;
  mist: Pixi.Texture;
  vignette: Pixi.Texture;
  grain: Pixi.Texture;
  scanlines: Pixi.Texture;
  destroy(): void;
}

function canvasOf(w: number, h: number, data: Uint8ClampedArray): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return canvas;
}

/** Fabrique toutes les textures (quelques millisecondes, une fois par carte montée). */
export function createWeatherTextures(pixi: typeof Pixi): WeatherTextures {
  const rng = Math.random;
  // Atlas : chaque image peinte à sa place, marges transparentes
  const atlasData = new Uint8ClampedArray(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  for (const [frame, rect] of Object.entries(ATLAS) as [AtlasFrame, AtlasRect][]) {
    const px = paint(rect.w, rect.h, ATLAS_SHADES[frame]);
    for (let y = 0; y < rect.h; y++)
      atlasData.set(
        px.subarray(y * rect.w * 4, (y + 1) * rect.w * 4),
        ((rect.y + y) * ATLAS_WIDTH + rect.x) * 4,
      );
  }
  const atlasSource = new pixi.CanvasSource({
    resource: canvasOf(ATLAS_WIDTH, ATLAS_HEIGHT, atlasData),
    scaleMode: 'linear',
  });
  const atlas = {} as Record<AtlasFrame, Pixi.Texture>;
  for (const [frame, r] of Object.entries(ATLAS) as [AtlasFrame, AtlasRect][])
    atlas[frame] = new pixi.Texture({
      source: atlasSource,
      frame: new pixi.Rectangle(r.x, r.y, r.w, r.h),
    });

  const repeat = (canvas: HTMLCanvasElement, scaleMode: 'linear' | 'nearest') =>
    new pixi.Texture({
      source: new pixi.CanvasSource({ resource: canvas, addressMode: 'repeat', scaleMode }),
    });
  const mist = repeat(canvasOf(NOISE_SIZE, NOISE_SIZE, paintMist(NOISE_SIZE, rng)), 'linear');
  const grain = repeat(canvasOf(128, 128, paintGrain(128, rng)), 'nearest');
  const scanlines = repeat(
    canvasOf(
      1,
      3,
      paint(1, 3, (_x, y) => [1, y < 1 ? 1 : 0]),
    ),
    'nearest',
  );
  const vignette = new pixi.Texture({
    source: new pixi.CanvasSource({ resource: canvasOf(256, 256, paintVignette(256)) }),
  });

  return {
    atlas,
    mist,
    vignette,
    grain,
    scanlines,
    destroy() {
      for (const t of Object.values(atlas)) t.destroy(false);
      atlasSource.destroy();
      for (const t of [mist, grain, scanlines, vignette]) t.destroy(true);
    },
  };
}
