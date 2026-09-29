/** Primitives : pseudo-angle, côté, point dans un polygone, échantillons d'entités. */
import { describe, expect, it } from 'vitest';
import { pointInPolygon, pseudoAngle, sampleCircle, sampleRect, sideOf } from './index.js';
import { Prng } from './testing/prng.js';

describe('pseudoAngle', () => {
  it('croît avec atan2 ramené dans [0, 2π)', () => {
    const rng = new Prng(11);
    const dirs = Array.from({ length: 2000 }, () => ({ x: rng.range(-1, 1), y: rng.range(-1, 1) }));
    const angle = (d: { x: number; y: number }) => {
      const a = Math.atan2(d.y, d.x);
      return a < 0 ? a + 2 * Math.PI : a;
    };
    dirs.sort((p, q) => angle(p) - angle(q));
    for (let i = 1; i < dirs.length; i++) {
      expect(pseudoAngle(dirs[i]!.x, dirs[i]!.y)).toBeGreaterThanOrEqual(
        pseudoAngle(dirs[i - 1]!.x, dirs[i - 1]!.y),
      );
    }
  });

  it('axes : 0, 1, 2, 3 ; même valeur pour des directions proportionnelles', () => {
    expect(pseudoAngle(1, 0)).toBe(0);
    expect(pseudoAngle(0, 1)).toBe(1);
    expect(pseudoAngle(-1, 0)).toBe(2);
    expect(pseudoAngle(0, -1)).toBe(3);
    expect(pseudoAngle(3, 4)).toBe(pseudoAngle(6, 8));
  });
});

describe('sideOf', () => {
  it('gauche = cross(b − a, p − a) < 0 en coordonnées écran', () => {
    // Vers la droite de l'écran : la gauche est en haut.
    expect(sideOf({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 })).toBe('left');
    expect(sideOf({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 })).toBe('right');
    // Vers le haut de l'écran : la gauche est à gauche.
    expect(sideOf({ x: 0, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 })).toBe('left');
  });
});

describe('pointInPolygon', () => {
  it('Vec[] et polygone à plat', () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    const flat = Float64Array.from([0, 0, 10, 0, 0, 10]);
    for (const [x, y, inside] of [
      [2, 2, true],
      [6, 6, false],
      [-1, 1, false],
    ] as const) {
      expect(pointInPolygon({ x, y }, tri)).toBe(inside);
      expect(pointInPolygon({ x, y }, flat)).toBe(inside);
    }
  });
});

describe('échantillons', () => {
  it('token : centre et 8 points à 0,7 × rayon', () => {
    const s = sampleCircle({ x: 100, y: 50 }, 20);
    expect(s.length).toBe(18);
    expect([s[0], s[1]]).toEqual([100, 50]);
    for (let k = 1; k < 9; k++) {
      expect(Math.hypot(s[2 * k]! - 100, s[2 * k + 1]! - 50)).toBeCloseTo(14, 9);
    }
    expect(s[2]).toBeCloseTo(114, 9);
    expect(s[3]).toBeCloseTo(50, 9);
  });

  it('objet : centre, coins et milieux, sans rotation', () => {
    const s = Array.from(sampleRect(10, 20, 40, 20));
    const pts = [];
    for (let i = 0; i < s.length; i += 2) pts.push([s[i], s[i + 1]]);
    expect(pts).toEqual([
      [30, 30],
      [10, 20],
      [50, 20],
      [50, 40],
      [10, 40],
      [30, 20],
      [50, 30],
      [30, 40],
      [10, 30],
    ]);
  });

  it('objet tourné de 90° autour de son centre (sens horaire à l’écran)', () => {
    const s = sampleRect(10, 20, 40, 20, 90);
    expect(s[0]).toBeCloseTo(30, 9);
    expect(s[1]).toBeCloseTo(30, 9);
    // Coin haut gauche (−20, −10) → (10, −20) autour du centre.
    expect(s[2]).toBeCloseTo(40, 9);
    expect(s[3]).toBeCloseTo(10, 9);
  });
});
