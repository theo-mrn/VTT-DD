/**
 * Trajet des déplacements, données pures : cases traversées (pas de roi, par côtés), comptage
 * des diagonales sur tout le trajet, distance avec et sans grille, étiquette face au
 * déplacement, point au-delà, audience commune.
 */
import { describe, expect, it } from 'vitest';
import type { UnitContext } from '@/lib/map/features/measurements/engine/model';
import {
  cellOf,
  exceeds,
  gridPath,
  intersectAudience,
  measurePath,
  pathLabel,
  pathLength,
  pointAlong,
  segmentCells,
  unflatten,
  flatten,
  type Cell,
} from './model';

const grid = { size: 50, offsetX: 0, offsetY: 0 };
/** Centre de la case (col, row). */
const at = (col: number, row: number) => ({ x: col * 50 + 25, y: row * 50 + 25 });
const units = (extra: Partial<UnitContext> = {}): UnitContext => ({
  pixelsPerUnit: 50,
  unitName: 'm',
  unitsPerCell: 1,
  grid,
  counting: 'chebyshev',
  ...extra,
});

describe('cases', () => {
  it('case d’un point, origine du quadrillage comprise', () => {
    expect(cellOf({ x: 74, y: 10 }, grid)).toEqual({ col: 1, row: 0 });
    expect(cellOf({ x: -1, y: 49.9 }, grid)).toEqual({ col: -1, row: 0 });
    expect(cellOf({ x: 30, y: 30 }, { size: 50, offsetX: 20, offsetY: 20 })).toEqual({
      col: 0,
      row: 0,
    });
  });

  it('segment en pas de roi : une case voisine à chaque pas, diagonales comprises', () => {
    const out: Cell[] = [];
    segmentCells({ col: 0, row: 0 }, { col: 3, row: 1 }, true, out);
    expect(out).toHaveLength(3);
    expect(out.at(-1)).toEqual({ col: 3, row: 1 });
    for (let i = 1; i < out.length; i++) {
      expect(Math.abs(out[i]!.col - out[i - 1]!.col)).toBeLessThanOrEqual(1);
      expect(Math.abs(out[i]!.row - out[i - 1]!.row)).toBeLessThanOrEqual(1);
    }
  });

  it('segment sans diagonale : par côtés seulement', () => {
    const out: Cell[] = [];
    segmentCells({ col: 0, row: 0 }, { col: 2, row: -2 }, false, out);
    expect(out).toHaveLength(4);
    let prev = { col: 0, row: 0 };
    for (const c of out) {
      expect(Math.abs(c.col - prev.col) + Math.abs(c.row - prev.row)).toBe(1);
      prev = c;
    }
    expect(prev).toEqual({ col: 2, row: -2 });
  });

  it('trajet : départ compris, coût cumulé, diagonales alternées sur tout le trajet', () => {
    // Deux segments d'une diagonale chacun : 1 puis 2 en alterné (pas 1 et 1)
    const vertices = [at(0, 0), at(1, 1), at(2, 2)];
    const alternate = gridPath(vertices, grid, 'alternating');
    expect(alternate.cells.map((c) => c.cost)).toEqual([0, 1, 3]);
    expect(alternate.steps).toBe(3);
    expect(gridPath(vertices, grid, 'chebyshev').steps).toBe(2);
    expect(gridPath(vertices, grid, 'manhattan').steps).toBe(4);
    // Aller-retour : une case revisitée l'est deux fois
    const back = gridPath([at(0, 0), at(2, 0), at(0, 0)], grid, 'chebyshev');
    expect(back.steps).toBe(4);
    expect(back.cells).toHaveLength(5);
  });
});

describe('distance', () => {
  it('avec une grille de jeu : les cases selon le comptage ; « Ne pas compter » : la longueur', () => {
    const vertices = [at(0, 0), at(3, 0), at(3, 4)];
    expect(measurePath(vertices, units()).units).toBe(7);
    const off = measurePath(vertices, units({ counting: 'off' }));
    expect(off).toMatchObject({ units: 7, counted: false });
    expect(off.cells).toHaveLength(8);
    // Diagonale : 3 cases en pas de roi, 4,24 m à vol d'oiseau
    const diag = [at(0, 0), at(3, 3)];
    expect(measurePath(diag, units()).units).toBe(3);
    expect(measurePath(diag, units({ counting: 'off' })).units).toBeCloseTo(Math.hypot(3, 3));
  });

  it('sans grille : la somme des segments en unités', () => {
    const m = measurePath(
      [
        { x: 0, y: 0 },
        { x: 30, y: 40 },
        { x: 30, y: 140 },
      ],
      units({ grid: null }),
    );
    expect(m).toEqual({ units: 3, cells: null, counted: false });
    expect(
      pathLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ]),
    ).toBe(5);
  });

  it('étiquette : distance seule, ou face au déplacement ; au-delà à l’arrondi près', () => {
    expect(pathLabel(7.24, 'm', null)).toBe('7 m');
    expect(pathLabel(4.5, 'm', 6)).toBe('4,5 / 6 m');
    expect(exceeds(6.2, 6)).toBe(false);
    expect(exceeds(6.3, 6)).toBe(true);
    expect(exceeds(9, null)).toBe(false);
  });

  it('point au-delà du déplacement : sur le bon segment', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(pointAlong(vertices, 150)).toEqual({ segment: 2, point: { x: 100, y: 50 } });
    expect(pointAlong(vertices, 250)).toBeNull();
  });
});

describe('direct', () => {
  it('audience commune : jamais plus large que chacune', () => {
    expect(intersectAudience('public', 'public')).toBe('public');
    expect(intersectAudience('public', { users: ['a'] })).toEqual({ users: ['a'] });
    expect(intersectAudience({ users: ['a', 'b'] }, { users: ['b', 'c'] })).toEqual({
      users: ['b'],
    });
    expect(intersectAudience({ users: ['a'] }, { users: ['b'] })).toBe('gm');
    expect(intersectAudience('gm', 'public')).toBe('gm');
  });

  it('sommets à plat et retour', () => {
    const pts = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    expect(flatten(pts)).toEqual([1, 2, 3, 4]);
    expect(unflatten([1, 2, 3, 4, 5])).toEqual(pts);
  });
});

describe('trajet et distance par case', () => {
  it('la distance du trajet est dans l’unité de la scène, comparée au déplacement', () => {
    // 3 cases à 1,5 m : 4,5 m, au-delà d'un déplacement de 3 m
    const m = measurePath([at(0, 0), at(3, 0)], units({ unitsPerCell: 1.5 }));
    expect(m.units).toBeCloseTo(4.5);
    expect(exceeds(m.units, 3)).toBe(true);
    expect(exceeds(m.units, 9)).toBe(false);
  });
});
