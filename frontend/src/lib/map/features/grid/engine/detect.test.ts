import { describe, expect, it } from 'vitest';
import { detectGridInPixels } from './detect';

/** Image grise bruitée (texture), avec ou sans quadrillage de pas `cell` (traits sombres). */
function image(w: number, h: number, cell: number | null, offset = 0, seed = 7) {
  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // Texture : bruit et grandes variations douces
      let v = 120 + 40 * Math.sin(x / 37) * Math.cos(y / 53) + 30 * (rand() - 0.5);
      if (cell) {
        const onX = Math.abs((((x - offset) % cell) + cell) % cell) < 1;
        const onY = Math.abs((((y - offset) % cell) + cell) % cell) < 1;
        if (onX || onY) v -= 35;
      }
      g[y * w + x] = v;
    }
  return g;
}

describe('détection du quadrillage', () => {
  it('trouve le pas et l’origine, pas un de leurs multiples', () => {
    const r = detectGridInPixels(image(900, 600, 36.7, 12), 900, 600);
    expect(r).not.toBeNull();
    expect(r!.size).toBeCloseTo(36.7, 0);
  });

  it('rien sur une image sans quadrillage', () => {
    expect(detectGridInPixels(image(900, 600, null), 900, 600)).toBeNull();
  });

  it('ignore les blocs de compression (pas de 16 px)', () => {
    const w = 640;
    const h = 480;
    const g = image(w, h, null);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (x % 16 === 0 || y % 16 === 0) g[y * w + x]! -= 6;
    expect(detectGridInPixels(g, w, h)).toBeNull();
  });
});
