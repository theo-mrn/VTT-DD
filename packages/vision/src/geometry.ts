/**
 * Primitives géométriques. Toutes travaillent sur des nombres (pas d'objets) pour ne rien
 * allouer dans les boucles chaudes.
 */
import type { Polygon, Side, Vec } from './types.js';

/**
 * Produit vectoriel `(b − a) × (p − a)`. En coordonnées écran (y vers le bas), il est négatif
 * quand p est à gauche de a→b, positif à droite, nul sur la droite. Écrit en différences, il
 * reste précis avec de grandes coordonnées (les différences sont petites devant les valeurs).
 */
export function orient(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

/**
 * Côté de `p` par rapport au segment orienté a→b : `left` si `cross(b − a, p − a) < 0`
 * (coordonnées écran, y vers le bas), `right` s'il est positif, `null` sur la droite.
 */
export function sideOf(a: Vec, b: Vec, p: Vec): Side | null {
  const o = orient(a.x, a.y, b.x, b.y, p.x, p.y);
  if (o < 0) return 'left';
  return o > 0 ? 'right' : null;
}

/**
 * Pseudo-angle « diamant » de la direction (dx, dy), dans [0, 4]. Fonction croissante de
 * `atan2(dy, dx)` ramené dans [0, 2π) : 0 vers +x, 1 vers +y, 2 vers −x, 3 vers −y. Il ordonne
 * les directions comme l'angle vrai, sans trigonométrie, et donne exactement la même valeur pour
 * un même point : deux murs soudés ont la même extrémité, donc le même angle, bit pour bit.
 * (0, 0) donne NaN : l'appelant l'évite.
 */
export function pseudoAngle(dx: number, dy: number): number {
  if (dy >= 0) {
    return dx >= 0 ? dy / (dx + dy) : 1 - dx / (dy - dx);
  }
  return dx < 0 ? 2 - dy / (-dx - dy) : 3 + dx / (dx - dy);
}

/** Carré de la distance du point p au segment [a, b] (segment nul : distance au point a). */
export function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  let t = len2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = ax + t * ex - px;
  const dy = ay + t * ey - py;
  return dx * dx + dy * dy;
}

/**
 * Point dans un polygone (règle pair-impair, demi-ouverte : un point du bord est rangé d'un
 * côté ou de l'autre, toujours le même). Accepte `Vec[]` ou un polygone à plat.
 */
export function pointInPolygon(p: Vec, polygon: readonly Vec[] | Polygon): boolean {
  const x = p.x;
  const y = p.y;
  let inside = false;
  if (polygon instanceof Float64Array) {
    const n = polygon.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[2 * i]!;
      const yi = polygon[2 * i + 1]!;
      const xj = polygon[2 * j]!;
      const yj = polygon[2 * j + 1]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    if (pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Intervalle [t0, t1] du segment encore dans le rectangle, pendant `clipSegmentToRect`. */
let clipT0 = 0;
let clipT1 = 1;

/** Restreint [t0, t1] à un bord (p t ≤ q) ; rend false si rien ne reste. */
function clipBoundary(p: number, q: number): boolean {
  if (p === 0) return !(q < 0);
  const r = q / p;
  if (p < 0) {
    if (r > clipT1) return false;
    if (r > clipT0) clipT0 = r;
  } else {
    if (r < clipT0) return false;
    if (r < clipT1) clipT1 = r;
  }
  return true;
}

/**
 * Coupe le segment [a, b] au rectangle [minX, maxX] × [minY, maxY] (Liang-Barsky). Écrit le
 * résultat dans `out` (x1, y1, x2, y2) et rend false si rien ne reste.
 */
export function clipSegmentToRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  out: Float64Array,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  clipT0 = 0;
  clipT1 = 1;
  if (!clipBoundary(-dx, ax - minX) || !clipBoundary(dx, maxX - ax)) return false;
  if (!clipBoundary(-dy, ay - minY) || !clipBoundary(dy, maxY - ay)) return false;
  const t0 = clipT0;
  const t1 = clipT1;
  out[0] = t0 === 0 ? ax : ax + t0 * dx;
  out[1] = t0 === 0 ? ay : ay + t0 * dy;
  out[2] = t1 === 1 ? bx : ax + t1 * dx;
  out[3] = t1 === 1 ? by : ay + t1 * dy;
  return true;
}
