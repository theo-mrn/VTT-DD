/**
 * Géométrie des dessins (docs/carte.md § 10) : du calcul pur, sans Pixi ni DOM.
 *
 * - Simplification de Ramer-Douglas-Peucker au lâcher d'un tracé à main levée.
 * - Lissage Catmull-Rom au rendu (courbes de Bézier cubiques passant par chaque point).
 * - Forme d'un dessin enregistré, boîte englobante, toucher précis (distance au tracé,
 *   intérieur des formes remplies), transformation des points (glisser, taille).
 *
 * Encodage des formes dans `points` (compatible avec l'ancienne carte) :
 * - `line` : `[a, b]` ;
 * - `rectangle` : `[coin, coin opposé]` ;
 * - `circle` : `[coin, coin opposé]` de la boîte de l'ellipse quand `closed` est vrai (outil
 *   d'aujourd'hui) ; `[centre, point du cercle]` sinon (ancienne carte). Une transformation
 *   convertit l'ancien encodage vers le nouveau ;
 * - `pen`, `brush`, `eraser` : la polyligne (`smooth` : lissée au rendu, `closed` : fermée).
 */
import type { Point, Rect } from '../../engine/geometry';
import {
  boundsOfPoints,
  distance,
  distanceToPolyline,
  polygonContains,
} from '../../engine/geometry';

export type DrawingToolId = 'pen' | 'brush' | 'eraser' | 'line' | 'rectangle' | 'circle';

/** Ce que la géométrie lit d'un dessin (`MapDrawing`). */
export interface DrawingLike {
  tool: DrawingToolId | string;
  points: readonly Point[];
  width: number;
  fill?: string | null;
  closed?: boolean;
  smooth?: boolean;
}

export type DrawingShape =
  | { type: 'path'; points: readonly Point[]; closed: boolean; smooth: boolean }
  | { type: 'line'; a: Point; b: Point }
  | { type: 'rect'; x: number; y: number; width: number; height: number }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

/** Forme à dessiner et à toucher. */
export function shapeOf(d: DrawingLike): DrawingShape {
  const pts = d.points;
  const [a, b] = pts;
  if (a && b && pts.length === 2) {
    if (d.tool === 'line') return { type: 'line', a, b };
    if (d.tool === 'rectangle') return { type: 'rect', ...rectOf(a, b) };
    if (d.tool === 'circle') {
      if (d.closed) {
        const r = rectOf(a, b);
        return {
          type: 'ellipse',
          cx: r.x + r.width / 2,
          cy: r.y + r.height / 2,
          rx: r.width / 2,
          ry: r.height / 2,
        };
      }
      // Ancienne carte : centre et point du cercle
      const radius = distance(a, b);
      return { type: 'ellipse', cx: a.x, cy: a.y, rx: radius, ry: radius };
    }
  }
  const closed = d.closed === true || d.tool === 'rectangle' || d.tool === 'circle';
  return { type: 'path', points: pts, closed, smooth: d.smooth === true };
}

const rectOf = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

/** La forme a un intérieur (rectangle, ellipse, tracé fermé). */
export const isClosedShape = (s: DrawingShape) =>
  s.type === 'rect' || s.type === 'ellipse' || (s.type === 'path' && s.closed);

/** Boîte englobante de la forme, sans l'épaisseur du trait. */
export function shapeBounds(s: DrawingShape): Rect {
  switch (s.type) {
    case 'line':
      return rectOf(s.a, s.b);
    case 'rect':
      return { x: s.x, y: s.y, width: s.width, height: s.height };
    case 'ellipse':
      return { x: s.cx - s.rx, y: s.cy - s.ry, width: s.rx * 2, height: s.ry * 2 };
    case 'path':
      return boundsOfPoints(s.points);
  }
}

/** Boîte englobante du dessin, épaisseur du trait comprise. */
export function drawingBounds(d: DrawingLike): Rect {
  const r = shapeBounds(shapeOf(d));
  const half = Math.max(0, d.width) / 2;
  return { x: r.x - half, y: r.y - half, width: r.width + 2 * half, height: r.height + 2 * half };
}

// ─── Toucher ─────────────────────────────────────────────────────────────────

/** Distance au bord d'une ellipse (approchée le long du rayon, exacte pour un cercle). */
function distanceToEllipse(p: Point, cx: number, cy: number, rx: number, ry: number): number {
  if (rx < 1e-6 || ry < 1e-6)
    return distanceToPolyline(p, [
      { x: cx - rx, y: cy - ry },
      { x: cx + rx, y: cy + ry },
    ]);
  const dx = p.x - cx;
  const dy = p.y - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.min(rx, ry);
  const cos = dx / len;
  const sin = dy / len;
  const r = (rx * ry) / Math.hypot(ry * cos, rx * sin);
  return Math.abs(len - r);
}

const insideEllipse = (p: Point, cx: number, cy: number, rx: number, ry: number) =>
  rx > 0 && ry > 0 && ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 <= 1;

/**
 * Le point touche le dessin : à `reach` du tracé (demi-épaisseur comprise par l'appelant), ou
 * à l'intérieur d'une forme remplie.
 */
export function hitShape(s: DrawingShape, p: Point, reach: number, filled: boolean): boolean {
  switch (s.type) {
    case 'line':
      return distanceToPolyline(p, [s.a, s.b]) <= reach;
    case 'rect': {
      const inside = p.x >= s.x && p.x <= s.x + s.width && p.y >= s.y && p.y <= s.y + s.height;
      if (filled && inside) return true;
      const corners = [
        { x: s.x, y: s.y },
        { x: s.x + s.width, y: s.y },
        { x: s.x + s.width, y: s.y + s.height },
        { x: s.x, y: s.y + s.height },
      ];
      return distanceToPolyline(p, corners, true) <= reach;
    }
    case 'ellipse':
      if (filled && insideEllipse(p, s.cx, s.cy, s.rx, s.ry)) return true;
      return distanceToEllipse(p, s.cx, s.cy, s.rx, s.ry) <= reach;
    case 'path':
      if (filled && s.closed && s.points.length >= 3 && polygonContains(s.points, p)) return true;
      return distanceToPolyline(p, s.points, s.closed) <= reach;
  }
}

/** Le dessin a un remplissage visible. */
export const isFilled = (d: DrawingLike) =>
  typeof d.fill === 'string' && d.fill.length > 0 && isClosedShape(shapeOf(d));

// ─── Transformations ─────────────────────────────────────────────────────────

/** Arrondi au centième de pixel : des charges plus courtes, une précision bien suffisante. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Points du dessin après un changement de boîte (sans l'épaisseur) : translation et mise à
 * l'échelle autour du coin haut gauche. Une dimension nulle (ligne horizontale) ne se met
 * pas à l'échelle. L'ancien encodage d'un cercle passe au nouveau.
 */
export function transformDrawing<D extends DrawingLike>(d: D, to: Rect): D {
  let data: D = d;
  const shape = shapeOf(d);
  if (d.tool === 'circle' && !d.closed && shape.type === 'ellipse') {
    // Ancien cercle (centre, point du cercle) → boîte de l'ellipse
    data = {
      ...d,
      closed: true,
      points: [
        { x: shape.cx - shape.rx, y: shape.cy - shape.ry },
        { x: shape.cx + shape.rx, y: shape.cy + shape.ry },
      ],
    };
  }
  const from = shapeBounds(shape);
  const sx = from.width > 1e-6 ? to.width / from.width : 1;
  const sy = from.height > 1e-6 ? to.height / from.height : 1;
  const points = data.points.map((p) => ({
    x: round2(to.x + (p.x - from.x) * sx),
    y: round2(to.y + (p.y - from.y) * sy),
  }));
  return { ...data, points };
}

/** Points translatés. */
export const translatePoints = (points: readonly Point[], dx: number, dy: number): Point[] =>
  points.map((p) => ({ x: round2(p.x + dx), y: round2(p.y + dy) }));

// ─── Tracé à main levée ──────────────────────────────────────────────────────

/**
 * Simplification de Ramer-Douglas-Peucker : garde les extrémités et les points qui s'écartent
 * de plus de `epsilon` de la corde. Itérative (pile), sans récursion profonde sur un long tracé.
 */
export function simplify(points: readonly Point[], epsilon: number): Point[] {
  const n = points.length;
  if (n <= 2 || epsilon <= 0) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  while (stack.length) {
    const last = stack.pop()!;
    const first = stack.pop()!;
    const a = points[first]!;
    const b = points[last]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    let maxD = -1;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const p = points[i]!;
      // Distance à la droite (a, b), ou au point a si la corde est nulle
      const d =
        len < 1e-9
          ? Math.hypot(p.x - a.x, p.y - a.y)
          : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index >= 0 && maxD > epsilon) {
      keep[index] = 1;
      stack.push(first, index, index, last);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]!);
  return out;
}

/** Reçoit chaque morceau de courbe : deux points de contrôle, puis l'arrivée. */
export type CurveVisitor = (
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x: number,
  y: number,
) => void;

/**
 * Lissage Catmull-Rom (uniforme) converti en Bézier cubiques : la courbe passe par chaque point.
 * Appelle `visit` pour chaque segment, sans allouer. Tracé fermé : la courbe revient au départ.
 */
export function catmullRom(points: readonly Point[], closed: boolean, visit: CurveVisitor) {
  const n = points.length;
  if (n < 2) return;
  const at = (i: number): Point =>
    closed ? points[((i % n) + n) % n]! : points[Math.max(0, Math.min(n - 1, i))]!;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    visit(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
}

// ─── Formes ──────────────────────────────────────────────────────────────────

/** Pas de rotation d'une ligne avec ⇧. */
export const LINE_ANGLE_STEP = 15;

/**
 * Point d'arrivée d'une forme en cours : ⇧ donne un carré, un cercle parfait, ou une ligne
 * alignée par pas de 15°.
 */
export function constrainEnd(tool: DrawingToolId, start: Point, end: Point, shift: boolean): Point {
  if (!shift) return end;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (tool === 'line') {
    const len = Math.hypot(dx, dy);
    const step = (LINE_ANGLE_STEP * Math.PI) / 180;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    return { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + (dx < 0 ? -size : size), y: start.y + (dy < 0 ? -size : size) };
}

/** Points enregistrés d'une forme tracée de `start` à `end`. */
export const shapePoints = (start: Point, end: Point): Point[] => [
  { x: round2(start.x), y: round2(start.y) },
  { x: round2(end.x), y: round2(end.y) },
];
