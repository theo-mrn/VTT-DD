/**
 * Géométrie des zones de brouillard (docs/carte.md § 9, § 10) : lasso à main levée simplifié,
 * contenance d'un point, hachures des zones « retirer ». Du calcul pur.
 */
import { distanceToSegment, polygonContains, type Point } from '@/lib/map/engine/geometry';

/**
 * Ramer-Douglas-Peucker : garde les points qui s'écartent de plus de `tolerance` de la corde.
 * Itératif (pile), pour les longs tracés.
 */
export function simplifyPath(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let index = -1;
    let max = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i]!, points[first]!, points[last]!);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out: Point[] = [];
  points.forEach((p, i) => {
    if (keep[i]) out.push({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
  });
  return out;
}

/**
 * Polygone d'un lasso : simplifié, sans fermeture répétée ; null s'il est trop petit (moins de
 * 3 sommets, ou d'aire sous `minArea`).
 */
export function lassoPolygon(
  points: readonly Point[],
  tolerance: number,
  minArea: number,
): Point[] | null {
  let simplified = simplifyPath(points, tolerance);
  const first = simplified[0];
  const last = simplified.at(-1);
  if (
    first &&
    last &&
    simplified.length > 1 &&
    Math.hypot(first.x - last.x, first.y - last.y) < tolerance
  )
    simplified = simplified.slice(0, -1);
  if (simplified.length < 3 || Math.abs(polygonArea(simplified)) < minArea) return null;
  return simplified;
}

/** Aire signée d'un polygone. */
export function polygonArea(pts: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Polygone régulier approchant un cercle (hachures). */
export function circlePolygon(center: Point, radius: number, sides = 48): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    out.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return out;
}

/**
 * Hachures à 45° dans un polygone : segments des droites `y = x + c` (pas `spacing`) à
 * l'intérieur, par la règle pair-impair. Au plus `maxLines` droites (le pas s'élargit).
 */
export function hatchPolygon(
  pts: readonly Point[],
  spacing: number,
  maxLines = 240,
): [Point, Point][] {
  if (pts.length < 3) return [];
  // Repère tourné de −45° : u = (x − y)/√2 (le long des hachures), v = (x + y)/√2
  const k = Math.SQRT1_2;
  const uv = pts.map((p) => ({ u: (p.x - p.y) * k, v: (p.x + p.y) * k }));
  let minV = Infinity;
  let maxV = -Infinity;
  for (const q of uv) {
    minV = Math.min(minV, q.v);
    maxV = Math.max(maxV, q.v);
  }
  const step = Math.max(spacing, (maxV - minV) / maxLines);
  const out: [Point, Point][] = [];
  const xs: number[] = [];
  for (let v = Math.ceil(minV / step) * step; v <= maxV; v += step) {
    xs.length = 0;
    for (let i = 0; i < uv.length; i++) {
      const a = uv[i]!;
      const b = uv[(i + 1) % uv.length]!;
      if (a.v > v === b.v > v) continue;
      xs.push(a.u + ((v - a.v) / (b.v - a.v)) * (b.u - a.u));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const u0 = xs[i]!;
      const u1 = xs[i + 1]!;
      out.push([
        { x: (u0 + v) * k, y: (v - u0) * k },
        { x: (u1 + v) * k, y: (v - u1) * k },
      ]);
    }
  }
  return out;
}

/** Le point est dans la zone (ou à `tolerance` de son bord). */
export function zoneContains(
  zone: { shape: string; points: readonly Point[]; center: Point | null; radius: number | null },
  p: Point,
  tolerance = 0,
): boolean {
  if (zone.shape === 'circle') {
    if (!zone.center || zone.radius == null) return false;
    return Math.hypot(p.x - zone.center.x, p.y - zone.center.y) <= zone.radius + tolerance;
  }
  if (polygonContains(zone.points, p)) return true;
  if (tolerance <= 0) return false;
  for (let i = 0; i < zone.points.length; i++)
    if (
      distanceToSegment(p, zone.points[i]!, zone.points[(i + 1) % zone.points.length]!) <= tolerance
    )
      return true;
  return false;
}
