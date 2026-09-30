import { describe, expect, it } from 'vitest';
import { centeredPortrait, centeredSquare, cropPixels } from './compose';

describe('cadrages par défaut', () => {
  it('carré centré dans une image large', () => {
    expect(centeredSquare(2000, 1000)).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
  });

  it('carré centré dans une image haute', () => {
    expect(centeredSquare(1000, 2000)).toEqual({ x: 0, y: 0.25, width: 1, height: 0.5 });
  });

  it('zone 3:4 centrée, largeur ou hauteur pleine', () => {
    expect(centeredPortrait(1200, 800)).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
    const haute = centeredPortrait(600, 1600);
    expect(haute.width).toBe(1);
    expect(haute.height * 1600).toBeCloseTo(800);
    expect(haute.y).toBeCloseTo(0.25);
  });
});

describe('cropPixels', () => {
  it('ramène les fractions en pixels, jamais moins d’un pixel', () => {
    expect(cropPixels({ x: 0.1, y: 0.2, width: 0.5, height: 0.0001 }, 1000, 500)).toEqual({
      x: 100,
      y: 100,
      width: 500,
      height: 1,
    });
  });
});
