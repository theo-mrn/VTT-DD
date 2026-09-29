/**
 * Référence naïve : un point P est vu depuis O si le segment [O, P] ne touche aucun segment
 * bloquant (mêmes règles que le paquet : murs et portes fermées opaques, sens unique selon le
 * côté de O, fenêtres et portes ouvertes transparentes). Quadratique, sans aucune astuce.
 */
import type { Segment, Vec } from '../types.js';

export function blocks(s: Segment, o: Vec): boolean {
  if (s.kind === 'window') return false;
  if (s.kind === 'door' && s.open === true) return false;
  if ((s.opacity ?? 1) < 1) return false;
  if (s.kind === 'one_way' || s.kind === 'one_way_wall') {
    const cross = (s.b.x - s.a.x) * (o.y - s.a.y) - (s.b.y - s.a.y) * (o.x - s.a.x);
    return s.blocksFrom === 'right' ? cross > 0 : cross < 0;
  }
  return true;
}

function orient(a: Vec, b: Vec, c: Vec) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Vec, b: Vec, p: Vec) {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  );
}

/** Les segments [p1, p2] et [p3, p4] se touchent-ils (croisement ou contact) ? */
export function segmentsTouch(p1: Vec, p2: Vec, p3: Vec, p4: Vec): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

export function naiveVisible(segments: readonly Segment[], o: Vec, p: Vec): boolean {
  for (const s of segments) {
    if (blocks(s, o) && segmentsTouch(o, p, s.a, s.b)) return false;
  }
  return true;
}

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len2 = ex * ex + ey * ey;
  let t = len2 > 0 ? ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + t * ex - p.x, a.y + t * ey - p.y);
}

/**
 * Cas ambigus, exclus de la comparaison : P ou O trop près d'un mur bloquant, ou rayon [O, P]
 * qui frôle une extrémité (rayon rasant : vu ou non selon l'arrondi, ou la soudure).
 */
export function ambiguous(segments: readonly Segment[], o: Vec, p: Vec, tol: number): boolean {
  for (const s of segments) {
    if (!blocks(s, o)) continue;
    if (distToSegment(p, s.a, s.b) < tol) return true;
    if (distToSegment(o, s.a, s.b) < tol) return true;
    if (distToSegment(s.a, o, p) < tol) return true;
    if (distToSegment(s.b, o, p) < tol) return true;
  }
  return false;
}
