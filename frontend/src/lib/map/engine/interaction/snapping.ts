/**
 * Aimantation générique (docs/carte.md § 6, § 10) : grille, points (extrémités), segments,
 * angles. Du calcul pur, partagé par le glisser du moteur et par les outils de pose (murs,
 * pièces, brouillard). Les tolérances sont en pixels du monde : l'appelant convertit ses
 * pixels d'écran avec la caméra (`camera.screenToWorldLength(10)`).
 */
import { distance, projectOnSegment, snapStep, type EntityGeometry, type Point } from '../geometry';

/** Grille de la carte : une case de `size` pixels du monde (`pixelsPerUnit`). */
export interface GridSpec {
  size: number;
  offsetX?: number;
  offsetY?: number;
}

export type SnapKind = 'none' | 'point' | 'segment' | 'grid' | 'angle';

export interface SnapResult {
  point: Point;
  kind: SnapKind;
  /** Segment touché (index dans la liste fournie) et position t ∈ [0, 1] sur lui. */
  segment?: { index: number; t: number };
  /** Point touché (index dans la liste fournie). */
  pointIndex?: number;
}

export interface SnapOptions {
  /** Extrémités existantes (priorité 1). */
  points?: readonly Point[];
  /** Segments existants (priorité 2) : le point s'y pose (le mur sera scindé). */
  segments?: readonly (readonly [Point, Point])[];
  /** Grille (priorité 3). */
  grid?: GridSpec | null;
  /** Tolérance des points et segments, en pixels du monde. */
  tolerance: number;
}

/** Point de grille le plus proche (intersection des lignes). */
export function snapToGridLines(p: Point, grid: GridSpec): Point {
  const ox = grid.offsetX ?? 0;
  const oy = grid.offsetY ?? 0;
  return { x: snapStep(p.x - ox, grid.size) + ox, y: snapStep(p.y - oy, grid.size) + oy };
}

/** Centre de la case qui contient le point. */
export function snapToCellCenter(p: Point, grid: GridSpec): Point {
  const ox = grid.offsetX ?? 0;
  const oy = grid.offsetY ?? 0;
  const s = grid.size;
  return {
    x: Math.floor((p.x - ox) / s) * s + s / 2 + ox,
    y: Math.floor((p.y - oy) / s) * s + s / 2 + oy,
  };
}

/**
 * Aimante une boîte (géométrie d'une entité) sur la grille : une boîte plus petite qu'une case
 * se centre dans sa case ; une plus grande pose son coin haut gauche sur les lignes (un token
 * de 2 × 2 cases couvre exactement 4 cases).
 */
export function snapGeometryToGrid(g: EntityGeometry, grid: GridSpec): Point {
  if (grid.size <= 0) return { x: g.x, y: g.y };
  const small = g.width < grid.size * 0.99 && g.height < grid.size * 0.99;
  if (small) return snapToCellCenter(g, grid);
  const corner = snapToGridLines({ x: g.x - g.width / 2, y: g.y - g.height / 2 }, grid);
  return { x: corner.x + g.width / 2, y: corner.y + g.height / 2 };
}

/** Contraint `p` à un angle multiple de `stepDeg` depuis `origin` (⇧ : 15°). */
export function constrainAngle(origin: Point, p: Point, stepDeg = 15): Point {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: p.x, y: p.y };
  const step = (stepDeg * Math.PI) / 180;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: origin.x + Math.cos(a) * len, y: origin.y + Math.sin(a) * len };
}

/**
 * Aimante un point : extrémité la plus proche, sinon point sur un segment, sinon grille,
 * sinon le point tel quel.
 */
export function snapPoint(p: Point, opts: SnapOptions): SnapResult {
  if (opts.points?.length) {
    let best = -1;
    let bestD = opts.tolerance;
    for (let i = 0; i < opts.points.length; i++) {
      const d = distance(p, opts.points[i]!);
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      const q = opts.points[best]!;
      return { point: { x: q.x, y: q.y }, kind: 'point', pointIndex: best };
    }
  }
  if (opts.segments?.length) {
    let best: SnapResult | null = null;
    let bestD = opts.tolerance;
    for (let index = 0; index < opts.segments.length; index++) {
      const [a, b] = opts.segments[index]!;
      const proj = projectOnSegment(p, a, b);
      const d = distance(p, proj.point);
      if (d <= bestD) {
        bestD = d;
        best = { point: proj.point, kind: 'segment', segment: { index, t: proj.t } };
      }
    }
    if (best) return best;
  }
  if (opts.grid && opts.grid.size > 0)
    return { point: snapToGridLines(p, opts.grid), kind: 'grid' };
  return { point: { x: p.x, y: p.y }, kind: 'none' };
}
