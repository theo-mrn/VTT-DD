/**
 * Géométrie du moteur de carte : points, rectangles, rectangles tournés, segments. Du calcul
 * pur, sans Pixi ni DOM, partagé par la caméra, l'index spatial, le test de toucher, les
 * poignées et l'aimantation.
 *
 * Conventions (docs/carte.md § 4) : coordonnées du monde = pixels du fond, y vers le bas,
 * rotations en degrés dans le sens horaire (celui de l'écran).
 */

export interface Point {
  x: number;
  y: number;
}

/** Rectangle aligné sur les axes. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Géométrie d'une entité : centre, taille avant rotation, rotation en degrés. C'est la seule
 * forme que le moteur manipule pour déplacer, pivoter et redimensionner n'importe quelle sorte
 * d'entité.
 */
export interface EntityGeometry {
  /** Centre, en pixels du monde. */
  x: number;
  y: number;
  /** Taille de la boîte, avant rotation (0 pour un point). */
  width: number;
  height: number;
  /** Degrés, sens horaire. */
  rotation: number;
}

export const DEG = Math.PI / 180;

export const point = (x: number, y: number): Point => ({ x, y });

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Normalise un angle en degrés dans [0, 360). */
export function normalizeDegrees(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r === 0 ? 0 : r;
}

/** Arrondit au pas donné (15° pour la rotation avec ⇧). */
export const snapStep = (value: number, step: number) => Math.round(value / step) * step;

// ─── Rectangles ──────────────────────────────────────────────────────────────

export const rectFromPoints = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

export const rectContainsPoint = (r: Rect, p: Point, tolerance = 0) =>
  p.x >= r.x - tolerance &&
  p.x <= r.x + r.width + tolerance &&
  p.y >= r.y - tolerance &&
  p.y <= r.y + r.height + tolerance;

export const rectsIntersect = (a: Rect, b: Rect) =>
  a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;

/** `inner` entièrement dans `outer`. */
export const rectContainsRect = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

export const inflateRect = (r: Rect, by: number): Rect => ({
  x: r.x - by,
  y: r.y - by,
  width: r.width + 2 * by,
  height: r.height + 2 * by,
});

/** Boîte englobante d'une liste de points (rectangle vide à l'origine si la liste est vide). */
export function boundsOfPoints(points: readonly Point[]): Rect {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Union de rectangles (null si la liste est vide). */
export function unionRects(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ─── Rectangles tournés (géométrie d'une entité) ─────────────────────────────

/** Point `p` tourné de `deg` degrés autour de `c`. */
export function rotateAround(p: Point, c: Point, deg: number): Point {
  if (!deg) return { x: p.x, y: p.y };
  const a = deg * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** Passe un point du monde dans le repère local de la géométrie (centre à l'origine, sans rotation). */
export function toLocal(g: EntityGeometry, p: Point): Point {
  const r = rotateAround(p, g, -g.rotation);
  return { x: r.x - g.x, y: r.y - g.y };
}

/** Passe un point local (centre à l'origine) dans le monde. */
export function toWorld(g: EntityGeometry, p: Point): Point {
  return rotateAround({ x: g.x + p.x, y: g.y + p.y }, g, g.rotation);
}

/** Les 4 coins du rectangle tourné : haut gauche, haut droit, bas droit, bas gauche. */
export function geometryCorners(g: EntityGeometry): [Point, Point, Point, Point] {
  const hw = g.width / 2;
  const hh = g.height / 2;
  return [
    toWorld(g, { x: -hw, y: -hh }),
    toWorld(g, { x: hw, y: -hh }),
    toWorld(g, { x: hw, y: hh }),
    toWorld(g, { x: -hw, y: hh }),
  ];
}

/** Boîte englobante alignée du rectangle tourné. */
export function geometryBounds(g: EntityGeometry): Rect {
  if (!g.rotation) return { x: g.x - g.width / 2, y: g.y - g.height / 2, ...size(g) };
  return boundsOfPoints(geometryCorners(g));
}

const size = (g: EntityGeometry) => ({ width: g.width, height: g.height });

/** Le point touche le rectangle tourné, à `tolerance` pixels du monde près. */
export function geometryContains(g: EntityGeometry, p: Point, tolerance = 0): boolean {
  const l = toLocal(g, p);
  return Math.abs(l.x) <= g.width / 2 + tolerance && Math.abs(l.y) <= g.height / 2 + tolerance;
}

// ─── Segments ────────────────────────────────────────────────────────────────

/** Projection de `p` sur le segment [a, b] : point le plus proche et paramètre t ∈ [0, 1]. */
export function projectOnSegment(p: Point, a: Point, b: Point): { point: Point; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { point: { x: a.x, y: a.y }, t: 0 };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { point: { x: a.x + t * dx, y: a.y + t * dy }, t };
}

export const distanceToSegment = (p: Point, a: Point, b: Point) =>
  distance(p, projectOnSegment(p, a, b).point);

/** Distance d'un point à une polyligne (liste de points), Infinity si vide. */
export function distanceToPolyline(p: Point, pts: readonly Point[], closed = false): number {
  if (!pts.length) return Infinity;
  if (pts.length === 1) return distance(p, pts[0]!);
  let best = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const d = distanceToSegment(p, pts[i]!, pts[(i + 1) % pts.length]!);
    if (d < best) best = d;
  }
  return best;
}

/** Point dans un polygone (règle pair-impair). */
export function polygonContains(pts: readonly Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
