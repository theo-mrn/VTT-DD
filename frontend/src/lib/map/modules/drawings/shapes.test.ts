import { describe, expect, it } from 'vitest';
import {
  catmullRom,
  constrainEnd,
  drawingBounds,
  hitShape,
  isFilled,
  shapeOf,
  simplify,
  transformDrawing,
} from './shapes';
import { fillFor, parseColor, withAlpha } from './palette';

const pts = (...xy: number[]) => {
  const out = [];
  for (let i = 0; i < xy.length; i += 2) out.push({ x: xy[i]!, y: xy[i + 1]! });
  return out;
};

describe('simplification Ramer-Douglas-Peucker', () => {
  it('garde les extrémités et retire les points alignés', () => {
    const line = pts(0, 0, 10, 0.1, 20, -0.1, 30, 0, 40, 0.05, 50, 0);
    expect(simplify(line, 0.5)).toEqual(pts(0, 0, 50, 0));
  });

  it('garde les coins qui s’écartent de plus que la tolérance', () => {
    const corner = pts(0, 0, 10, 0, 20, 0, 20, 10, 20, 20);
    expect(simplify(corner, 0.5)).toEqual(pts(0, 0, 20, 0, 20, 20));
  });

  it('un tracé qui revient à son départ garde sa pointe', () => {
    const back = pts(0, 0, 10, 0, 20, 0, 10, 0, 0, 0);
    expect(simplify(back, 0.5)).toEqual(pts(0, 0, 20, 0, 0, 0));
  });

  it('tient un très long tracé (itératif, sans récursion)', () => {
    const long = Array.from({ length: 50_000 }, (_, i) => ({ x: i, y: Math.sin(i / 50) * 40 }));
    const out = simplify(long, 0.5);
    expect(out[0]).toEqual(long[0]);
    expect(out[out.length - 1]).toEqual(long[long.length - 1]);
    expect(out.length).toBeLessThan(long.length / 10);
  });

  it('deux points ou moins : inchangé', () => {
    expect(simplify(pts(0, 0, 5, 5), 10)).toEqual(pts(0, 0, 5, 5));
  });
});

describe('lissage Catmull-Rom', () => {
  it('une courbe par segment, qui passe par chaque point', () => {
    const p = pts(0, 0, 10, 10, 20, 0, 30, 10);
    const ends: number[][] = [];
    catmullRom(p, false, (_c1x, _c1y, _c2x, _c2y, x, y) => ends.push([x, y]));
    expect(ends).toEqual([
      [10, 10],
      [20, 0],
      [30, 10],
    ]);
  });

  it('tangente au point intérieur parallèle à la corde de ses voisins', () => {
    const p = pts(0, 0, 10, 10, 20, 0);
    const curves: number[][] = [];
    catmullRom(p, false, (...c) => curves.push(c));
    // Point de contrôle sortant de (10, 10) : (10, 10) + ((20, 0) − (0, 0)) / 6
    expect(curves[1]![0]).toBeCloseTo(10 + 20 / 6);
    expect(curves[1]![1]).toBeCloseTo(10);
  });

  it('tracé fermé : revient au premier point', () => {
    const ends: number[][] = [];
    catmullRom(pts(0, 0, 10, 0, 10, 10), true, (_a, _b, _c, _d, x, y) => ends.push([x, y]));
    expect(ends).toHaveLength(3);
    expect(ends[2]).toEqual([0, 0]);
  });
});

describe('formes', () => {
  it('rectangle, ligne, ellipse (boîte) et ancien cercle (centre, rayon)', () => {
    expect(shapeOf({ tool: 'rectangle', points: pts(30, 40, 10, 0), width: 2 })).toEqual({
      type: 'rect',
      x: 10,
      y: 0,
      width: 20,
      height: 40,
    });
    expect(shapeOf({ tool: 'line', points: pts(0, 0, 5, 5), width: 2 }).type).toBe('line');
    expect(shapeOf({ tool: 'circle', closed: true, points: pts(0, 0, 40, 20), width: 2 })).toEqual({
      type: 'ellipse',
      cx: 20,
      cy: 10,
      rx: 20,
      ry: 10,
    });
    expect(shapeOf({ tool: 'circle', closed: false, points: pts(0, 0, 3, 4), width: 2 })).toEqual({
      type: 'ellipse',
      cx: 0,
      cy: 0,
      rx: 5,
      ry: 5,
    });
  });

  it('la boîte englobante compte l’épaisseur du trait', () => {
    expect(drawingBounds({ tool: 'pen', points: pts(0, 0, 100, 50), width: 10 })).toEqual({
      x: -5,
      y: -5,
      width: 110,
      height: 60,
    });
  });

  it('⇧ : carré, cercle parfait, ligne par pas de 15°', () => {
    const o = { x: 0, y: 0 };
    expect(constrainEnd('rectangle', o, { x: 30, y: -10 }, true)).toEqual({ x: 30, y: -30 });
    expect(constrainEnd('circle', o, { x: -5, y: 20 }, true)).toEqual({ x: -20, y: 20 });
    const l = constrainEnd('line', o, { x: 100, y: 10 }, true);
    expect(l.x).toBeCloseTo(Math.hypot(100, 10));
    expect(l.y).toBeCloseTo(0);
    expect(constrainEnd('rectangle', o, { x: 30, y: -10 }, false)).toEqual({ x: 30, y: -10 });
  });
});

describe('toucher d’un tracé', () => {
  const pen = shapeOf({ tool: 'pen', points: pts(0, 0, 100, 0, 100, 100), width: 4 });

  it('près du trait, mais pas au-delà', () => {
    expect(hitShape(pen, { x: 50, y: 5 }, 6, false)).toBe(true);
    expect(hitShape(pen, { x: 50, y: 7 }, 6, false)).toBe(false);
    expect(hitShape(pen, { x: 104, y: 50 }, 6, false)).toBe(true);
  });

  it('forme remplie : l’intérieur touche ; vide : seulement le bord', () => {
    const rect = shapeOf({ tool: 'rectangle', points: pts(0, 0, 100, 100), width: 2 });
    expect(hitShape(rect, { x: 50, y: 50 }, 3, true)).toBe(true);
    expect(hitShape(rect, { x: 50, y: 50 }, 3, false)).toBe(false);
    expect(hitShape(rect, { x: 50, y: 2 }, 3, false)).toBe(true);
  });

  it('ellipse : distance au bord le long du rayon', () => {
    const e = shapeOf({ tool: 'circle', closed: true, points: pts(0, 0, 200, 100), width: 2 });
    expect(hitShape(e, { x: 200, y: 50 }, 3, false)).toBe(true);
    expect(hitShape(e, { x: 100, y: 2 }, 3, false)).toBe(true);
    expect(hitShape(e, { x: 100, y: 50 }, 3, false)).toBe(false);
    expect(hitShape(e, { x: 100, y: 50 }, 3, true)).toBe(true);
  });

  it('un remplissage ne compte que pour une forme fermée', () => {
    expect(isFilled({ tool: 'rectangle', points: pts(0, 0, 1, 1), width: 1, fill: '#fff' })).toBe(
      true,
    );
    expect(isFilled({ tool: 'line', points: pts(0, 0, 1, 1), width: 1, fill: '#fff' })).toBe(false);
    expect(isFilled({ tool: 'rectangle', points: pts(0, 0, 1, 1), width: 1, fill: null })).toBe(
      false,
    );
  });
});

describe('transformation des points', () => {
  it('mise à l’échelle dans la nouvelle boîte', () => {
    const d = { tool: 'pen', points: pts(0, 0, 100, 50), width: 2 };
    expect(transformDrawing(d, { x: 10, y: 10, width: 200, height: 100 }).points).toEqual(
      pts(10, 10, 210, 110),
    );
  });

  it('une ligne horizontale ne s’étire pas en hauteur', () => {
    const d = { tool: 'line', points: pts(0, 0, 100, 0), width: 2 };
    expect(transformDrawing(d, { x: 0, y: 0, width: 50, height: 80 }).points).toEqual(
      pts(0, 0, 50, 0),
    );
  });

  it('un ancien cercle passe à l’encodage en boîte', () => {
    const d = { tool: 'circle', closed: false, points: pts(50, 50, 50, 60), width: 2 };
    const out = transformDrawing(d, { x: 0, y: 0, width: 40, height: 20 });
    expect(out.closed).toBe(true);
    expect(out.points).toEqual(pts(0, 0, 40, 20));
  });
});

describe('couleurs', () => {
  it('l’opacité voyage dans la couleur', () => {
    expect(withAlpha('#E5484D', 1)).toBe('#e5484d');
    expect(withAlpha('#e5484d', 0.5)).toBe('#e5484d80');
    expect(parseColor('#e5484d80')).toEqual({ hex: '#e5484d', alpha: 0.5 });
    expect(parseColor('rgba(255, 0, 0, 0.25)')).toEqual({ hex: '#ff0000', alpha: 0.25 });
    expect(parseColor('yellow')).toEqual({ hex: '#ffff00', alpha: 1 });
    expect(parseColor('pas une couleur')).toBeNull();
  });

  it('le remplissage reprend la couleur, plus transparente', () => {
    expect(parseColor(fillFor('#3e9bf5'))?.hex).toBe('#3e9bf5');
    expect(parseColor(fillFor('#3e9bf5'))!.alpha).toBeLessThan(0.5);
  });
});
