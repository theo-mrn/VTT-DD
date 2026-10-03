import { describe, expect, it } from 'vitest';
import { centeredPortrait, centeredSquare, cropPixels, portraitFromToken } from './compose';

describe('cadrages par défaut', () => {
  it('carré centré dans une image large', () => {
    expect(centeredSquare(2000, 1000)).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
  });

  it('carré en haut d’une image haute (le visage)', () => {
    expect(centeredSquare(1000, 2000)).toEqual({ x: 0, y: 0, width: 1, height: 0.5 });
  });

  it('zone 3:4 centrée en largeur, en haut en hauteur', () => {
    expect(centeredPortrait(1200, 800)).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
    const haute = centeredPortrait(600, 1600);
    expect(haute.width).toBe(1);
    expect(haute.height * 1600).toBeCloseTo(800);
    expect(haute.y).toBe(0);
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

describe('portraitFromToken', () => {
  it('même visage que le token, en 3:4, dans l’image', () => {
    // Image en pied 430 × 1000, token de 350 px en haut à gauche
    const p = portraitFromToken({ x: 0, y: 0, width: 350 / 430, height: 0.35 }, 430, 1000);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
    expect(p.width * 430).toBeCloseTo(350);
    expect(p.height * 1000).toBeCloseTo((350 * 4) / 3);
  });

  it('bornée à l’image : plus haute que l’image, la zone est réduite', () => {
    const p = portraitFromToken({ x: 0, y: 0.5, width: 1, height: 1 }, 1000, 1000);
    expect(p.height).toBe(1);
    expect(p.width).toBeCloseTo(0.75);
    expect(p.x).toBeCloseTo(0.125);
    expect(p.y).toBe(0);
  });
});
