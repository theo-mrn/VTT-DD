/**
 * Géométrie des obstacles (docs/carte.md § 9, § 10) : lignes brisées des murs, contours des
 * pièces, soudures. Du calcul pur, sans Pixi ni moteur, testé à part.
 *
 * Conventions :
 * - un mur est une ligne brisée (`points`, 2 et plus) ; **fermée** quand son dernier point est
 *   exactement le premier (rectangle de murs, chaîne finie sur son premier point) ;
 * - une pièce est un polygone **sans** répétition du premier point (contrat `MapRoom`) ;
 * - deux sommets sont **soudés** quand leurs coordonnées sont identiques (égalité exacte) : c'est
 *   ce qui garantit qu'aucune vue ne fuit entre deux murs (`@vtt/vision` soude aussi à 0,5 px,
 *   mais la donnée est exacte d'elle-même) ;
 * - les coordonnées posées sont arrondies au centième de pixel, identiquement des deux côtés
 *   d'une soudure.
 */
import { distance, projectOnSegment, type Point } from '../../engine/geometry';

export type Pts = readonly Point[];

/** Segment le plus court accepté, en pixels du monde (docs/carte.md § 10, Validation). */
export const MIN_SEGMENT = 2;
/** Distance sous laquelle un point est « sur » un segment (après arrondi), en pixels du monde. */
export const WELD_EPSILON = 0.05;

export const round = (v: number) => Math.round(v * 100) / 100;
export const roundPoint = (p: Point): Point => ({ x: round(p.x), y: round(p.y) });
export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const pointKey = (p: Point) => `${p.x},${p.y}`;

/** Clé d'un segment, indépendante du sens (doublons). */
export function segmentKey(a: Point, b: Point): string {
  const ka = pointKey(a);
  const kb = pointKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/** Ligne brisée fermée : au moins 3 sommets distincts, le dernier point répète le premier. */
export const isClosed = (pts: Pts) => pts.length >= 4 && samePoint(pts[0]!, pts.at(-1)!);

/** Sommets distincts d'une ligne brisée (sans la répétition de fermeture). */
export const distinctVertices = (pts: Pts): Pts => (isClosed(pts) ? pts.slice(0, -1) : pts);

/** Segments d'une ligne brisée. */
export function polylineSegments(pts: Pts): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i]!, pts[i + 1]!]);
  return out;
}

/** Segments d'un polygone (pièce), segment de fermeture compris. */
export function polygonSegments(pts: Pts): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (let i = 0; i < pts.length && pts.length > 1; i++)
    out.push([pts[i]!, pts[(i + 1) % pts.length]!]);
  return out;
}

/** Boîte d'une liste de points : [minX, minY, maxX, maxY]. */
export function bbox(pts: Pts): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return [minX, minY, maxX, maxY];
}

const bboxNear = (b: [number, number, number, number], p: Point, pad: number) =>
  p.x >= b[0] - pad && p.x <= b[2] + pad && p.y >= b[1] - pad && p.y <= b[3] + pad;

// ─── Nettoyage ───────────────────────────────────────────────────────────────

/**
 * Retire les segments de moins de `MIN_SEGMENT` (le point trop proche du précédent est fondu
 * avec lui ; le dernier point l'emporte, c'est souvent une soudure). Une ligne fermée reste
 * fermée tant qu'elle garde 3 sommets distincts ; sinon elle devient une ligne ouverte.
 * Renvoie une ligne d'au moins 2 points, ou null.
 */
export function cleanPolyline(pts: Pts): Point[] | null {
  if (isClosed(pts)) {
    const ring: Point[] = [];
    for (const p of pts.slice(0, -1)) {
      const last = ring.at(-1);
      if (last && distance(last, p) < MIN_SEGMENT) continue;
      ring.push(p);
    }
    while (ring.length > 1 && distance(ring.at(-1)!, ring[0]!) < MIN_SEGMENT) ring.pop();
    if (ring.length >= 3) return [...ring, ring[0]!];
    return ring.length >= 2 ? ring : null;
  }
  const out: Point[] = [];
  pts.forEach((p, i) => {
    const last = out.at(-1);
    if (last && distance(last, p) < MIN_SEGMENT) {
      // Le dernier point remplace le précédent (sauf le premier : la ligne s'effondre)
      if (i === pts.length - 1 && out.length > 1) out[out.length - 1] = p;
      return;
    }
    out.push(p);
  });
  return out.length >= 2 ? out : null;
}

/** Polygone de pièce nettoyé (sommets à 2 px au moins), ou null sous 3 sommets. */
export function cleanPolygon(pts: Pts): Point[] | null {
  const ring: Point[] = [];
  for (const p of pts) {
    const last = ring.at(-1);
    if (last && distance(last, p) < MIN_SEGMENT) continue;
    ring.push(p);
  }
  while (ring.length > 1 && distance(ring.at(-1)!, ring[0]!) < MIN_SEGMENT) ring.pop();
  return ring.length >= 3 ? ring : null;
}

// ─── Soudures ────────────────────────────────────────────────────────────────

/** Le point est à l'intérieur du segment (pas sur une extrémité), à `WELD_EPSILON` près. */
export function onSegmentInterior(p: Point, a: Point, b: Point): number | null {
  if (samePoint(p, a) || samePoint(p, b)) return null;
  const proj = projectOnSegment(p, a, b);
  if (proj.t <= 0 || proj.t >= 1) return null;
  return distance(p, proj.point) <= WELD_EPSILON ? proj.t : null;
}

/**
 * Insère dans la ligne brisée les points qui tombent à l'intérieur de ses segments (jonction en
 * T soudée), dans l'ordre du tracé. Renvoie la nouvelle ligne, ou null si rien n'a changé.
 */
export function insertVerticesOnSegments(pts: Pts, vertices: Iterable<Point>): Point[] | null {
  const list = [...vertices];
  if (!list.length || pts.length < 2) return null;
  const box = bbox(pts);
  const near = list.filter((v) => bboxNear(box, v, WELD_EPSILON));
  if (!near.length) return null;
  const out: Point[] = [pts[0]!];
  let changed = false;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const hits: { t: number; p: Point }[] = [];
    const seen = new Set<string>();
    for (const v of near) {
      const t = onSegmentInterior(v, a, b);
      const k = pointKey(v);
      if (t === null || seen.has(k)) continue;
      seen.add(k);
      hits.push({ t, p: v });
    }
    hits.sort((x, y) => x.t - y.t);
    for (const h of hits) out.push({ x: h.p.x, y: h.p.y });
    if (hits.length) changed = true;
    out.push(b);
  }
  return changed ? out : null;
}

/** Même chose pour un polygone de pièce (segment de fermeture compris). */
export function insertVerticesOnPolygon(pts: Pts, vertices: Iterable<Point>): Point[] | null {
  if (pts.length < 3) return null;
  const closed = insertVerticesOnSegments([...pts, pts[0]!], vertices);
  return closed ? closed.slice(0, -1) : null;
}

// ─── Découpes ────────────────────────────────────────────────────────────────

/**
 * Découpe une ligne brisée en retirant des segments (`keep(i)` faux) : renvoie les morceaux
 * restants, d'au moins un segment chacun. Une ligne fermée dont on retire un segment s'ouvre en
 * un seul morceau qui en fait le tour.
 */
export function splitPolyline(pts: Pts, keep: (segment: number) => boolean): Point[][] {
  const n = pts.length - 1;
  if (n < 1) return [];
  const kept = Array.from({ length: n }, (_, i) => keep(i));
  if (kept.every(Boolean)) return [[...pts]];
  const closed = isClosed(pts);
  // Fermée : on part juste après le premier segment retiré, et on fait le tour
  const start = closed ? kept.indexOf(false) + 1 : 0;
  const pieces: Point[][] = [];
  let run: Point[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (kept[i]) {
      if (!run.length) run.push(pts[i]!);
      run.push(pts[i + 1]!);
    } else if (run.length) {
      pieces.push(run);
      run = [];
    }
  }
  if (run.length) pieces.push(run);
  return pieces;
}

/** Retire le segment `index` ; renvoie les morceaux restants (0, 1 ou 2). */
export const removeSegment = (pts: Pts, index: number): Point[][] =>
  splitPolyline(pts, (i) => i !== index);

/** Ajoute un sommet sur le segment `index`. */
export function insertVertex(pts: Pts, index: number, p: Point): Point[] {
  return [...pts.slice(0, index + 1), { x: p.x, y: p.y }, ...pts.slice(index + 1)];
}

/**
 * Retire un sommet d'une ligne brisée ; ses deux segments voisins n'en font plus qu'un. Une
 * ligne fermée garde sa fermeture tant qu'elle a 3 sommets distincts. Renvoie null si la ligne
 * disparaît (moins de 2 points).
 */
export function removeVertex(pts: Pts, index: number): Point[] | null {
  if (isClosed(pts)) {
    const ring = pts.slice(0, -1);
    const i = index % ring.length;
    const rest = ring.filter((_, k) => k !== i);
    if (rest.length >= 3) return [...rest, rest[0]!];
    return rest.length >= 2 ? rest : null;
  }
  const rest = pts.filter((_, k) => k !== index);
  return rest.length >= 2 ? rest : null;
}

/** Retire un sommet d'un polygone de pièce ; null sous 3 sommets. */
export function removePolygonVertex(pts: Pts, index: number): Point[] | null {
  const rest = pts.filter((_, k) => k !== index);
  return rest.length >= 3 ? rest : null;
}

// ─── Portes ──────────────────────────────────────────────────────────────────

export interface DoorInsertion {
  /** La porte, orientée dans le sens du mur. */
  door: [Point, Point];
  /** Ce qui reste du mur (0, 1 ou 2 lignes), dans l'ordre du tracé. */
  rest: Point[][];
}

/**
 * Pose une porte de largeur `width` centrée sur `at`, dans le segment `index` d'un mur : le mur
 * est scindé en mur, porte, mur. La porte reste dans le segment (décalée au besoin) ; un bout de
 * mur de moins de `MIN_SEGMENT` n'est pas gardé (la porte va jusqu'au sommet). Une ligne fermée
 * s'ouvre : il en reste une ligne qui fait le tour.
 */
export function insertDoor(pts: Pts, index: number, at: Point, width: number): DoorInsertion {
  const a = pts[index]!;
  const b = pts[index + 1]!;
  const length = distance(a, b);
  const t = length ? projectOnSegment(at, a, b).t : 0;
  const w = Math.min(Math.max(width, MIN_SEGMENT), length);
  let s0 = t * length - w / 2;
  let s1 = s0 + w;
  if (s0 < 0) {
    s0 = 0;
    s1 = w;
  }
  if (s1 > length) {
    s1 = length;
    s0 = Math.max(0, length - w);
  }
  if (s0 < MIN_SEGMENT) s0 = 0;
  if (length - s1 < MIN_SEGMENT) s1 = length;
  const along = (s: number): Point =>
    s <= 0
      ? a
      : s >= length
        ? b
        : roundPoint({ x: a.x + ((b.x - a.x) * s) / length, y: a.y + ((b.y - a.y) * s) / length });
  const A = along(s0);
  const B = along(s1);

  const rest: Point[][] = [];
  if (isClosed(pts)) {
    // On part de B, on fait le tour, on revient à A
    const ring = pts.slice(0, -1);
    const n = ring.length;
    const loop: Point[] = [B];
    for (let k = 1; k <= n; k++) {
      const p = ring[(index + k) % n]!;
      if (!samePoint(p, loop.at(-1)!)) loop.push(p);
    }
    // `loop` finit sur ring[index] = a ; on termine sur A
    if (!samePoint(A, loop.at(-1)!)) loop.push(A);
    if (loop.length >= 2) rest.push(loop);
  } else {
    const before = [...pts.slice(0, index + 1)];
    if (!samePoint(A, before.at(-1)!)) before.push(A);
    const after = [...pts.slice(index + 1)];
    if (!samePoint(B, after[0]!)) after.unshift(B);
    if (before.length >= 2) rest.push(before);
    if (after.length >= 2) rest.push(after);
  }
  return { door: [A, B], rest };
}

// ─── Boucles → pièces ────────────────────────────────────────────────────────

/**
 * Contour fermé formé par ces segments (murs sélectionnés) : les bouts pendants sont retirés, et
 * il doit rester un seul cycle simple. Renvoie ses sommets (sans répétition), ou null.
 */
export function findLoop(segments: readonly (readonly [Point, Point])[]): Point[] | null {
  const adjacency = new Map<string, Set<string>>();
  const points = new Map<string, Point>();
  const link = (a: Point, b: Point) => {
    const ka = pointKey(a);
    const kb = pointKey(b);
    if (ka === kb) return;
    points.set(ka, a);
    points.set(kb, b);
    if (!adjacency.has(ka)) adjacency.set(ka, new Set());
    if (!adjacency.has(kb)) adjacency.set(kb, new Set());
    adjacency.get(ka)!.add(kb);
    adjacency.get(kb)!.add(ka);
  };
  for (const [a, b] of segments) link(a, b);
  // Retire les bouts pendants
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [k, next] of adjacency) {
      if (next.size > 1) continue;
      for (const n of next) adjacency.get(n)?.delete(k);
      adjacency.delete(k);
      pruned = true;
    }
  }
  if (adjacency.size < 3) return null;
  for (const next of adjacency.values()) if (next.size !== 2) return null;
  // Un seul cycle : on en fait le tour depuis un sommet
  const first = adjacency.keys().next().value!;
  const loop: string[] = [first];
  let prev: string | null = null;
  let cur = first;
  for (;;) {
    const next: string | undefined = [...adjacency.get(cur)!].find((n) => n !== prev);
    if (next === undefined || next === first) break;
    loop.push(next);
    prev = cur;
    cur = next;
    if (loop.length > adjacency.size) return null;
  }
  if (loop.length !== adjacency.size) return null;
  return loop.map((k) => points.get(k)!);
}

// ─── Polygones ───────────────────────────────────────────────────────────────

/** Aire signée (positive dans le sens horaire à l'écran, y vers le bas). */
export function signedArea(pts: Pts): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Centre de gravité d'un polygone (moyenne des sommets s'il est dégénéré). */
export function centroid(pts: Pts): Point {
  const area = signedArea(pts);
  if (Math.abs(area) < 1e-9) {
    let x = 0;
    let y = 0;
    for (const p of pts) {
      x += p.x;
      y += p.y;
    }
    return { x: x / Math.max(1, pts.length), y: y / Math.max(1, pts.length) };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/** Le segment [a, b] touche le rectangle (lasso). */
export function segmentTouchesRect(
  a: Point,
  b: Point,
  r: { x: number; y: number; width: number; height: number },
): boolean {
  const inside = (p: Point) =>
    p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
  if (inside(a) || inside(b)) return true;
  const c: Point[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
  for (let i = 0; i < 4; i++) if (segmentsIntersect(a, b, c[i]!, c[(i + 1) % 4]!)) return true;
  return false;
}

const orient = (a: Point, b: Point, c: Point) =>
  Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));

/** Deux segments se coupent (contact compris). */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  const onSeg = (p: Point, q: Point, r: Point) =>
    Math.min(p.x, r.x) <= q.x &&
    q.x <= Math.max(p.x, r.x) &&
    Math.min(p.y, r.y) <= q.y &&
    q.y <= Math.max(p.y, r.y);
  return (
    (o1 === 0 && onSeg(a, c, b)) ||
    (o2 === 0 && onSeg(a, d, b)) ||
    (o3 === 0 && onSeg(c, a, d)) ||
    (o4 === 0 && onSeg(c, b, d))
  );
}

/**
 * Normale du côté d'où l'on voit à travers un mur à sens unique, unitaire : la flèche dessinée
 * pointe dans ce sens (vers le côté bloqué, que l'on voit depuis l'autre). Côté gauche du tracé
 * a→b en coordonnées écran : `(dy, −dx)` (docs/carte.md § 9, `cross(b − a, p − a) < 0`).
 */
export function oneWayArrow(a: Point, b: Point, blocksFrom: 'left' | 'right'): Point {
  const len = distance(a, b) || 1;
  const left = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
  return blocksFrom === 'left' ? left : { x: -left.x, y: -left.y };
}
