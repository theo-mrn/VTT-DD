/** Conversion d'un obstacle en ligne brisée (contrat : `points`, 2 et plus) en segments. */
import type { Segment, Vec } from './types.js';

/** Propriétés communes aux segments d'un obstacle. */
export type SegmentProps = Omit<Segment, 'a' | 'b'>;

/**
 * Un segment par paire de points consécutifs, tous avec l'`id` et les propriétés de l'obstacle.
 * Le sens de tracé est conservé (il porte `blocksFrom`). `closed` : ajoute le segment du dernier
 * point au premier. Les points consécutifs égaux sont ignorés.
 */
export function segmentsFromPolyline(
  props: SegmentProps,
  points: readonly Vec[],
  closed = false,
): Segment[] {
  const out: Segment[] = [];
  const n = points.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    if (a.x === b.x && a.y === b.y) continue;
    out.push({ ...props, a, b });
  }
  return out;
}
