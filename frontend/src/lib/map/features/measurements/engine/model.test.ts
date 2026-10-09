import { describe, expect, it } from 'vitest';
import {
  constrainConeEnd,
  coneHalfAngle,
  distanceText,
  formatUnits,
  gridSteps,
  measureLabel,
  outlineBounds,
  roundHalf,
  snapAngle,
  touchesOutline,
  zoneContains,
  type MeasureSpec,
  type UnitContext,
} from './model';

const P = (x: number, y: number) => ({ x, y });
const U: UnitContext = {
  pixelsPerUnit: 50,
  unitName: 'm',
  unitsPerCell: 1,
  grid: null,
  counting: 'chebyshev',
};
const spec = (
  shape: MeasureSpec['shape'],
  end = P(200, 0),
  options: Record<string, unknown> = {},
): MeasureSpec => ({ shape, start: P(0, 0), end, options });

describe('unités', () => {
  it('arrondi à la demi-unité, écrit en français', () => {
    expect(roundHalf(4.24)).toBe(4);
    expect(roundHalf(4.3)).toBe(4.5);
    expect(formatUnits(4.3, 'm')).toBe('4,5 m');
    expect(formatUnits(12, 'pas')).toBe('12 pas');
  });

  it('cases à parcourir selon le comptage, avec l’origine de la grille', () => {
    const grid = { size: 50, offsetX: 25, offsetY: 25 };
    // De la case (0, 0) à la case (3, 1)
    const a = P(30, 30);
    const b = P(190, 80);
    expect(gridSteps(a, b, grid, 'chebyshev')).toBe(3);
    expect(gridSteps(a, b, grid, 'manhattan')).toBe(4);
    expect(gridSteps(a, P(190, 190), grid, 'alternating')).toBe(4);
    expect(gridSteps(a, b, grid, 'off')).toBeNull();
  });

  it('distance : cases seulement avec une grille de jeu', () => {
    expect(distanceText(P(0, 0), P(600, 0), U)).toBe('12 m');
    expect(distanceText(P(25, 25), P(625, 25), { ...U, grid: { size: 50 } })).toBe(
      '12 m · 12 cases',
    );
    expect(distanceText(P(25, 25), P(75, 25), { ...U, grid: { size: 50 } })).toBe('1 m · 1 case');
  });
});

describe('formes', () => {
  it('étiquettes : règle, cercle, carré, cône', () => {
    expect(measureLabel(spec('line', P(300, 400)), U)).toBe('10 m');
    expect(measureLabel(spec('circle', P(100, 0)), U)).toBe('Rayon 2 m · 13 m²');
    expect(measureLabel(spec('cube', P(150, 0)), U)).toBe('Côté 6 m · 36 m²');
    expect(measureLabel(spec('cone', P(450, 0)), U)).toBe('9 m · 53°');
    expect(measureLabel(spec('cone', P(450, 0), { coneMode: 'dimensions', coneWidth: 6 }), U)).toBe(
      '9 × 6 m',
    );
  });

  it('cône : angle, largeur (ancienne donnée sans mode comprise), longueur fixe', () => {
    expect(coneHalfAngle(spec('cone', P(100, 0), { coneAngle: 90 }), 50)).toBeCloseTo(Math.PI / 4);
    // Largeur 4 au bout de 2 unités : demi-angle de 45°
    expect(coneHalfAngle(spec('cone', P(100, 0), { coneWidth: 4 }), 50)).toBeCloseTo(Math.PI / 4);
    expect(
      coneHalfAngle(spec('cone', P(100, 0), { coneWidth: 4, coneMode: 'angle' }), 50),
    ).toBeCloseTo((53.13 * Math.PI) / 360);
    const end = constrainConeEnd(
      P(0, 0),
      P(10, 10),
      { coneMode: 'dimensions', fixedLength: 3 },
      50,
    );
    expect(Math.hypot(end.x, end.y)).toBeCloseTo(150);
    expect(end.x).toBeCloseTo(end.y);
  });

  it('dans la zone : cercle, carré orienté, cône arrondi ou plat ; jamais une règle', () => {
    expect(zoneContains(spec('circle', P(100, 0)), P(0, 90), 50)).toBe(true);
    expect(zoneContains(spec('circle', P(100, 0)), P(80, 80), 50)).toBe(false);
    // Carré orienté à 45° (demi-côté 100) : son coin est à 141 px sur l'axe x
    expect(zoneContains(spec('cube', P(70.71, 70.71)), P(130, 0), 50)).toBe(true);
    expect(zoneContains(spec('cube', P(100, 0)), P(130, 0), 50)).toBe(false);
    const cone = spec('cone', P(200, 0), { coneAngle: 90 });
    expect(zoneContains(cone, P(100, 90), 50)).toBe(true);
    expect(zoneContains(cone, P(100, 110), 50)).toBe(false);
    expect(
      zoneContains({ ...cone, options: { coneAngle: 90, coneShape: 'flat' } }, P(195, 190), 50),
    ).toBe(true);
    expect(zoneContains(spec('line'), P(100, 0), 50)).toBe(false);
  });

  it('toucher : le contour et l’origine, pas l’intérieur', () => {
    const circle = spec('circle', P(100, 0));
    expect(touchesOutline(circle, P(0, 102), 4, 50)).toBe(true);
    expect(touchesOutline(circle, P(40, 30), 4, 50)).toBe(false);
    expect(touchesOutline(circle, P(3, 0), 4, 50)).toBe(true);
    expect(touchesOutline(spec('line'), P(100, 3), 4, 50)).toBe(true);
    expect(touchesOutline(spec('cube', P(100, 0)), P(100, 50), 4, 50)).toBe(true);
    expect(touchesOutline(spec('cube', P(100, 0)), P(50, 50), 4, 50)).toBe(false);
  });

  it('⇧ : direction par pas de 15°, même longueur ; bornes du contour', () => {
    const p = snapAngle(P(0, 0), P(100, 8));
    expect(p.x).toBeCloseTo(Math.hypot(100, 8));
    expect(p.y).toBeCloseTo(0);
    expect(outlineBounds(spec('circle', P(100, 0)), 50)).toMatchObject({ width: 200, height: 200 });
  });
});

describe('distance par case (« 1 case = 1,5 m »)', () => {
  it('la distance affichée vaut les cases × la distance par case', () => {
    const u = { ...U, unitsPerCell: 1.5 };
    // 200 px = 4 cases = 6 m
    expect(distanceText(P(0, 0), P(200, 0), u)).toBe('6 m');
    expect(measureLabel(spec('circle', P(100, 0)), u)).toContain('3 m');
  });
});
