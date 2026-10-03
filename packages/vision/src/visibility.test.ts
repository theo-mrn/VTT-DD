/**
 * Polygone de vue : format de sortie et cas dégénérés (observateur sur un mur ou une extrémité,
 * hors de la carte, segments nuls ou confondus, jonctions en T, croisements, sommets pile sur un
 * rayon, grandes coordonnées, murs presque soudés).
 */
import { describe, expect, it } from 'vitest';
import {
  pointInPolygon,
  prepareScene,
  pseudoAngle,
  segmentsFromPolyline,
  viewerView,
  visibilityPolygon,
  type Segment,
  type Vec,
  type VisionScene,
} from './index.js';
import { ambiguous, naiveVisible } from './testing/naive.js';
import { boxWalls } from './testing/scenes.js';

const W = 400;
const bounds = { width: W, height: W };
const wall = (id: string, ax: number, ay: number, bx: number, by: number): Segment => ({
  id,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  kind: 'wall',
});

/** Vérifie le format : pairs, ordre angulaire autour de l'origine, pas de doublon, dans la carte. */
function expectWellFormed(poly: Float64Array, origin: Vec, width = W, height = W) {
  expect(poly).toBeInstanceOf(Float64Array);
  expect(poly.length % 2).toBe(0);
  const n = poly.length / 2;
  expect(n).toBeGreaterThanOrEqual(3);
  let prev = -1;
  let wraps = 0;
  const tol = 1e-9 * Math.max(width, height);
  for (let i = 0; i < n; i++) {
    const x = poly[2 * i]!;
    const y = poly[2 * i + 1]!;
    expect(x).toBeGreaterThanOrEqual(-tol);
    expect(y).toBeGreaterThanOrEqual(-tol);
    expect(x).toBeLessThanOrEqual(width + tol);
    expect(y).toBeLessThanOrEqual(height + tol);
    const j = (i + 1) % n;
    expect(x === poly[2 * j] && y === poly[2 * j + 1]).toBe(false);
    const a = pseudoAngle(x - origin.x, y - origin.y);
    if (a < prev - 1e-9) wraps++;
    prev = a;
  }
  // Ordre angulaire : au plus un passage de 4 à 0 (le tour commence où il veut).
  expect(wraps).toBeLessThanOrEqual(1);
}

/** Compare avec la référence naïve sur une grille de points (cas ambigus exclus). */
function expectMatchesNaive(scene: VisionScene, o: Vec, step = 7, tol = 1e-6) {
  const prep = prepareScene(scene, { snap: 0 });
  const view = viewerView(prep, { id: 'o', pos: o, visionRadius: 0 });
  const poly = visibilityPolygon(prep, o);
  let checked = 0;
  for (let x = step / 2; x < scene.bounds.width; x += step) {
    for (let y = step / 3; y < scene.bounds.height; y += step) {
      const p = { x, y };
      if (ambiguous(scene.segments, o, p, tol)) continue;
      const expected = naiveVisible(scene.segments, o, p);
      checked++;
      if (view.contains(p) !== expected || pointInPolygon(p, poly) !== expected) {
        throw new Error(`écart en (${x}, ${y}) depuis (${o.x}, ${o.y}) : attendu ${expected}`);
      }
    }
  }
  expect(checked).toBeGreaterThan(100);
}

describe('format du polygone', () => {
  it('carte vide : les quatre coins', () => {
    const prep = prepareScene({ bounds, segments: [] });
    const poly = visibilityPolygon(prep, { x: 100, y: 150 });
    expectWellFormed(poly, { x: 100, y: 150 });
    const pts = [];
    for (let i = 0; i < poly.length; i += 2) pts.push([poly[i], poly[i + 1]]);
    // Ordre angulaire croissant depuis +x (sens horaire à l'écran, y vers le bas).
    expect(pts).toEqual([
      [W, W],
      [0, W],
      [0, 0],
      [W, 0],
    ]);
  });

  it('déterministe, et indépendant des requêtes précédentes', () => {
    const scene: VisionScene = {
      bounds,
      segments: [...boxWalls('a', 50, 50, 80, 80), ...boxWalls('b', 200, 220, 60, 90)],
    };
    const prep = prepareScene(scene);
    const first = visibilityPolygon(prep, { x: 170, y: 170 });
    visibilityPolygon(prep, { x: 10, y: 390 });
    visibilityPolygon(prep, { x: 90, y: 90 }, { maxRadius: 30 });
    const again = visibilityPolygon(prep, { x: 170, y: 170 });
    expect(Array.from(again)).toEqual(Array.from(first));
    const other = visibilityPolygon(prepareScene(scene), { x: 170, y: 170 });
    expect(Array.from(other)).toEqual(Array.from(first));
  });

  it('ordre des segments sans effet sur le résultat', () => {
    const segs = [
      ...boxWalls('a', 50, 50, 80, 80),
      wall('x', 150, 300, 350, 250),
      wall('y', 300, 20, 300, 180),
    ];
    const o = { x: 200, y: 200 };
    const p1 = prepareScene({ bounds, segments: segs });
    const p2 = prepareScene({ bounds, segments: [...segs].reverse() });
    const v1 = viewerView(p1, { id: 'o', pos: o, visionRadius: 0 });
    const v2 = viewerView(p2, { id: 'o', pos: o, visionRadius: 0 });
    for (let x = 3; x < W; x += 11) {
      for (let y = 5; y < W; y += 11) expect(v1.contains({ x, y })).toBe(v2.contains({ x, y }));
    }
  });
});

describe('observateur sur un mur ou une extrémité', () => {
  it('au milieu d’un mur : décalé d’un côté, toujours le même', () => {
    const prep = prepareScene({ bounds, segments: [wall('m', 200, 0, 200, 400)] });
    const o = { x: 200, y: 200 };
    const poly = visibilityPolygon(prep, o);
    expectWellFormed(poly, o);
    const view = viewerView(prep, { id: 'o', pos: o, visionRadius: 0 });
    const left = view.contains({ x: 100, y: 200 });
    const right = view.contains({ x: 300, y: 200 });
    expect(left).not.toBe(right);
    expect(Array.from(visibilityPolygon(prep, o))).toEqual(Array.from(poly));
    expect(view.viewers[0]!.origin).not.toEqual(o);
    expect(
      Math.hypot(view.viewers[0]!.origin.x - 200, view.viewers[0]!.origin.y - 200),
    ).toBeLessThan(1e-3);
  });

  it('sur le coin de murs soudés : voit dedans ou dehors, jamais les deux', () => {
    const prep = prepareScene({ bounds, segments: boxWalls('b', 100, 100, 200, 200) });
    for (const corner of [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 300 },
      { x: 100, y: 300 },
    ]) {
      const poly = visibilityPolygon(prep, corner);
      const view = viewerView(prep, { id: 'o', pos: corner, visionRadius: 0 });
      // Ordre angulaire autour de l'origine effective (décalée d'un epsilon).
      expectWellFormed(poly, view.viewers[0]!.origin);
      const inside = view.contains({ x: 200, y: 200 });
      const outside = view.contains({ x: 20, y: 380 }) || view.contains({ x: 380, y: 20 });
      expect(inside && outside).toBe(false);
      expect(inside || outside).toBe(true);
    }
  });

  it('sur l’extrémité libre d’un mur', () => {
    const prep = prepareScene({ bounds, segments: [wall('m', 200, 100, 200, 300)] });
    const o = { x: 200, y: 100 };
    expectWellFormed(visibilityPolygon(prep, o), o);
    const view = viewerView(prep, { id: 'o', pos: o, visionRadius: 0 });
    expect(view.contains({ x: 200, y: 20 })).toBe(true);
  });

  it('hors de la carte : ramené dedans', () => {
    const prep = prepareScene({ bounds, segments: [wall('m', 100, 0, 100, 300)] });
    const poly = visibilityPolygon(prep, { x: -50, y: 350 });
    expectWellFormed(poly, { x: 0, y: 350 });
    const view = viewerView(prep, { id: 'o', pos: { x: -50, y: 350 }, visionRadius: 0 });
    expect(view.contains({ x: 50, y: 50 })).toBe(true);
    expect(view.contains({ x: 300, y: 380 })).toBe(true);
    expect(view.contains({ x: 300, y: 50 })).toBe(false);
  });

  it('sur le bord de la carte', () => {
    const prep = prepareScene({ bounds, segments: [] });
    for (const o of [
      { x: 0, y: 0 },
      { x: W, y: 200 },
      { x: 200, y: W },
    ]) {
      const poly = visibilityPolygon(prep, o);
      expect(poly.length).toBeGreaterThanOrEqual(6);
      expect(
        viewerView(prep, { id: 'o', pos: o, visionRadius: 0 }).contains({ x: 200, y: 200 }),
      ).toBe(true);
    }
  });
});

describe('segments dégénérés', () => {
  it('segments nuls, doublons, doublons inversés, recouvrements colinéaires', () => {
    const segments: Segment[] = [
      wall('nul', 50, 50, 50, 50),
      wall('a', 100, 100, 300, 100),
      wall('a2', 100, 100, 300, 100),
      wall('a3', 300, 100, 100, 100),
      wall('r1', 100, 250, 250, 250),
      wall('r2', 200, 250, 350, 250),
      wall('r3', 150, 250, 180, 250),
    ];
    const scene = { bounds, segments };
    for (const o of [
      { x: 200.5, y: 175.25 },
      { x: 37.3, y: 21.9 },
      { x: 390.1, y: 330.7 },
    ]) {
      expectMatchesNaive(scene, o);
      expectWellFormed(visibilityPolygon(prepareScene(scene), o), o);
    }
  });

  it('jonction en T non découpée : aucune fuite au point de jonction', () => {
    const segments = [wall('barre', 100, 100, 300, 100), wall('pied', 200, 100, 200, 300)];
    const prep = prepareScene({ bounds, segments });
    const o = { x: 150, y: 200 };
    const view = viewerView(prep, { id: 'o', pos: o, visionRadius: 0 });
    // Sur le rayon qui passe exactement par la jonction, et juste à côté.
    for (const t of [1.0001, 1.01, 1.5, 2.5]) {
      const p = { x: o.x + t * (200 - o.x), y: o.y + t * (100 - o.y) };
      expect(view.contains(p)).toBe(false);
    }
    expect(view.contains({ x: 250, y: 200 })).toBe(false);
    expect(view.contains({ x: 150, y: 50 })).toBe(false);
    expectMatchesNaive({ bounds, segments }, o);
  });

  it('murs qui se croisent : découpés au croisement, sans fuite', () => {
    const segments = [wall('x1', 100, 100, 300, 300), wall('x2', 100, 300, 300, 100)];
    const o = { x: 200, y: 50 };
    const view = viewerView(prepareScene({ bounds, segments }), {
      id: 'o',
      pos: o,
      visionRadius: 0,
    });
    expect(view.contains({ x: 200, y: 150 })).toBe(true);
    for (const t of [1.001, 1.2, 1.5, 2]) {
      expect(view.contains({ x: 200, y: 50 + t * 150 })).toBe(false);
    }
    expect(view.contains({ x: 110, y: 200 })).toBe(false);
    expectMatchesNaive({ bounds, segments }, o);
    expectMatchesNaive({ bounds, segments }, { x: 20.5, y: 211.3 });
  });

  it('sommets alignés pile sur un rayon de l’observateur', () => {
    const segments = [
      wall('a', 150, 150, 150, 250),
      wall('b', 200, 200, 300, 200),
      wall('c', 250, 250, 250, 350),
      wall('d', 300, 300, 380, 300),
      wall('e', 120, 120, 180, 120),
    ];
    expectMatchesNaive({ bounds, segments }, { x: 100, y: 100 }, 5);
    expectMatchesNaive({ bounds, segments }, { x: 50, y: 50 }, 5);
  });

  it('observateur colinéaire avec un mur (de profil)', () => {
    const segments = [wall('a', 150, 100, 350, 100), wall('b', 200, 50, 200, 90)];
    expectMatchesNaive({ bounds, segments }, { x: 50, y: 100 }, 5);
  });

  it('segment hors de la carte : ignoré ; à cheval : coupé', () => {
    const segments = [wall('dehors', -100, -100, -10, 500), wall('cheval', -100, 200, 200, 200)];
    const prep = prepareScene({ bounds, segments });
    const view = viewerView(prep, { id: 'o', pos: { x: 100, y: 100 }, visionRadius: 0 });
    expect(view.contains({ x: 100, y: 300 })).toBe(false);
    expect(view.contains({ x: 350, y: 300 })).toBe(true);
    expect(view.contains({ x: 5, y: 150 })).toBe(true);
  });

  it('coordonnées non finies : segment ignoré', () => {
    const prep = prepareScene({
      bounds,
      segments: [wall('nan', NaN, 0, 100, 100), wall('inf', 0, 0, Infinity, 5)],
    });
    expect(prep.segmentCount).toBe(4);
  });
});

describe('murs presque soudés', () => {
  // Deux murs dont les extrémités sont à 0,3 px l'une de l'autre, et un observateur qui vise
  // exactement la fente.
  const segments = [wall('a', 100, 100, 200, 200), wall('b', 200.3, 200, 300, 100)];
  const o = { x: 200.15, y: 20 };
  const behind = { x: 200.15, y: 380 };

  it('soudés par défaut (0,5 px) : aucune fuite', () => {
    const view = viewerView(prepareScene({ bounds, segments }), {
      id: 'o',
      pos: o,
      visionRadius: 0,
    });
    expect(view.contains(behind)).toBe(false);
  });

  it('sans tolérance, la fente laisse passer la vue', () => {
    const view = viewerView(prepareScene({ bounds, segments }, { snap: 0 }), {
      id: 'o',
      pos: o,
      visionRadius: 0,
    });
    expect(view.contains(behind)).toBe(true);
  });

  it('extrémité à 0,3 px de l’intérieur d’un mur : soudée dessus (T)', () => {
    // Le pied du T s'arrête à 0,3 px de la barre. Seul un rayon rasant, parallèle à la barre,
    // passerait par la fente : l'observateur est donc à la hauteur de la fente (y = 199,8).
    // Soudée, la barre passe par l'extrémité du pied (200, 199,7) : le rayon la touche.
    const t = [wall('barre', 100, 200, 300, 200), wall('pied', 200, 199.7, 200, 50)];
    const o = { id: 'o', pos: { x: 150, y: 199.8 }, visionRadius: 0 };
    const behind = { x: 250, y: 199.8 };
    expect(viewerView(prepareScene({ bounds, segments: t }), o).contains(behind)).toBe(false);
    expect(viewerView(prepareScene({ bounds, segments: t }, { snap: 0 }), o).contains(behind)).toBe(
      true,
    );
  });
});

describe('grandes coordonnées', () => {
  it('carte de 1 000 000 px, pièce murée loin de l’origine', () => {
    const big = 1_000_000;
    const segments = [
      ...boxWalls('b', 999_000, 999_000, 500, 400),
      wall('m', 998_000, 998_500, 999_900, 998_600),
    ];
    const scene = { bounds: { width: big, height: big }, segments };
    const prep = prepareScene(scene);
    const o = { x: 998_700.5, y: 999_700.25 };
    const poly = visibilityPolygon(prep, o);
    expectWellFormed(poly, o, big, big);
    const view = viewerView(prep, { id: 'o', pos: o, visionRadius: 0 });
    expect(view.contains({ x: 999_250, y: 999_200 })).toBe(false);
    expect(view.contains({ x: 998_900, y: 999_800 })).toBe(true);
    // Sur les rayons qui passent par les coins de la pièce.
    for (const c of [
      { x: 999_000, y: 999_000 },
      { x: 999_500, y: 999_400 },
      { x: 999_000, y: 999_400 },
    ]) {
      for (const t of [1.0000001, 1.001, 1.3]) {
        const p = { x: o.x + t * (c.x - o.x), y: o.y + t * (c.y - o.y) };
        if (p.x > 999_000 && p.x < 999_500 && p.y > 999_000 && p.y < 999_400) {
          expect(view.contains(p)).toBe(false);
        }
      }
    }
  });
});

describe('chaîne de murs (segmentsFromPolyline)', () => {
  it('ligne brisée fermée : de l’intérieur, rien dehors', () => {
    const pts: Vec[] = [];
    for (let k = 0; k < 60; k++) {
      const a = (2 * Math.PI * k) / 60;
      pts.push({ x: 200 + 150 * Math.cos(a), y: 200 + 120 * Math.sin(a) });
    }
    const segments = segmentsFromPolyline({ id: 'ellipse', kind: 'wall' }, pts, true);
    expect(segments).toHaveLength(60);
    expect(new Set(segments.map((s) => s.id))).toEqual(new Set(['ellipse']));
    const prep = prepareScene({ bounds, segments });
    const inside = viewerView(prep, { id: 'o', pos: { x: 210, y: 190 }, visionRadius: 0 });
    const outside = viewerView(prep, { id: 'o', pos: { x: 5, y: 5 }, visionRadius: 0 });
    for (let x = 2; x < W; x += 6) {
      for (let y = 3; y < W; y += 6) {
        const p = { x, y };
        const dx = (x - 200) / 150;
        const dy = (y - 200) / 120;
        const r = dx * dx + dy * dy;
        if (r > 1.02) expect(inside.contains(p)).toBe(false);
        if (r < 0.98) expect(outside.contains(p)).toBe(false);
      }
    }
  });

  it('points consécutifs égaux ignorés, ligne ouverte', () => {
    const segs = segmentsFromPolyline({ id: 'm', kind: 'one_way', blocksFrom: 'right' }, [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(segs.map((s) => [s.a, s.b, s.blocksFrom])).toEqual([
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, 'right'],
      [{ x: 10, y: 0 }, { x: 10, y: 10 }, 'right'],
    ]);
  });
});

describe('rayon maximal', () => {
  it('polygone coupé au disque, exact dedans', () => {
    const segments = [...boxWalls('b', 150, 150, 40, 40), wall('m', 100, 260, 300, 260)];
    const prep = prepareScene({ bounds, segments });
    const o = { x: 200, y: 220 };
    const r = 80;
    const poly = visibilityPolygon(prep, o, { maxRadius: r });
    for (let i = 0; i < poly.length; i += 2) {
      expect(Math.hypot(poly[i]! - o.x, poly[i + 1]! - o.y)).toBeLessThanOrEqual(r + 1e-6);
    }
    const full = viewerView(prep, { id: 'o', pos: o, visionRadius: 0 });
    for (let x = 1; x < W; x += 4) {
      for (let y = 2; y < W; y += 4) {
        const d = Math.hypot(x - o.x, y - o.y);
        if (d > r - 0.5 || ambiguous(segments, o, { x, y }, 0.5)) continue;
        expect(pointInPolygon({ x, y }, poly)).toBe(full.contains({ x, y }));
      }
    }
    expect(visibilityPolygon(prep, o, { maxRadius: 0 })).toHaveLength(0);
  });

  it('aucun mur proche : cercle complet', () => {
    const prep = prepareScene({ bounds, segments: [wall('loin', 10, 10, 20, 10)] });
    const poly = visibilityPolygon(prep, { x: 200, y: 200 }, { maxRadius: 50 });
    expect(poly.length).toBeGreaterThanOrEqual(48);
    for (let i = 0; i < poly.length; i += 2) {
      expect(Math.hypot(poly[i]! - 200, poly[i + 1]! - 200)).toBeCloseTo(50, 6);
    }
  });
});
