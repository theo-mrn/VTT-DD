/**
 * Ombres partielles des murs translucides (0 < opacité < 1) : pour chaque mur qui bloque depuis
 * l'origine, le polygone compris entre le mur et le bord de la carte, dans le cône d'angles du
 * mur (quadrilatère, plus les coins de la carte que le cône englobe). Le rendu le peint à
 * l'opacité du mur, dans la ligne de vue. Ces murs ne masquent jamais d'entité.
 */
import { orient, pseudoAngle } from './geometry.js';
import { translucentBlocks, type PreparedScene, type TranslucentWall } from './prepare.js';
import { resolveOrigin } from './sweep.js';
import type { Polygon, Vec } from './types.js';

export interface TranslucentShadow {
  /** Id du segment d'origine. */
  readonly id: string;
  readonly polygon: Polygon;
  readonly opacity: number;
}

/** Origine effective et carte d'une requête d'ombres. */
interface ShadowFrame {
  readonly ox: number;
  readonly oy: number;
  readonly W: number;
  readonly H: number;
  readonly eps: number;
  /** Coins de la carte, à plat. */
  readonly corners: readonly number[];
}

/** Ombres projetées depuis `origin` par les murs translucides. */
export function translucentShadows(prep: PreparedScene, origin: Vec): TranslucentShadow[] {
  const walls = prep.core.walls;
  const { x: ox, y: oy } = resolveOrigin(walls, origin.x, origin.y);
  const W = prep.width;
  const H = prep.height;
  const frame: ShadowFrame = { ox, oy, W, H, eps: walls.eps, corners: [0, 0, W, 0, W, H, 0, H] };
  const out: TranslucentShadow[] = [];
  for (const t of prep.core.translucent) {
    if (!translucentBlocks(t, ox, oy)) continue;
    const polygon = wallShadow(frame, t);
    if (polygon) out.push({ id: t.id, polygon, opacity: t.opacity });
  }
  return out;
}

/** Écart de pseudo-angles ramené dans [−2, 2]. */
function wrapDelta(d: number): number {
  if (d > 2) return d - 4;
  if (d < -2) return d + 4;
  return d;
}

/** Ombre d'un mur translucide qui bloque depuis l'origine, null s'il n'en projette aucune. */
function wallShadow(f: ShadowFrame, t: TranslucentWall): Polygon | null {
  const len = Math.hypot(t.bx - t.ax, t.by - t.ay);
  // De profil (ou origine sur la droite du mur) : aucune ombre.
  if (Math.abs(orient(t.ax, t.ay, t.bx, t.by, f.ox, f.oy)) <= f.eps * len) return null;
  const pa = pseudoAngle(t.ax - f.ox, t.ay - f.oy);
  const pb = pseudoAngle(t.bx - f.ox, t.by - f.oy);
  const d = wrapDelta(pb - pa);
  if (d === 0 || d >= 2 || d <= -2) return null;
  // Début et fin du cône, dans le sens des angles croissants.
  return d > 0
    ? coneShadow(f, t.ax, t.ay, t.bx, t.by, pa, d)
    : coneShadow(f, t.bx, t.by, t.ax, t.ay, pb, -d);
}

/** Ombre du cône d'angles [start, start + span] qui va du point S au point E. */
function coneShadow(
  f: ShadowFrame,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  start: number,
  span: number,
): Polygon {
  const pts: number[] = [sx, sy, ex, ey];
  const pe = project(f.ox, f.oy, ex, ey, f.W, f.H);
  pts.push(pe[0], pe[1]);
  // Coins de la carte strictement dans le cône, de la fin vers le début.
  const inside = cornersInCone(f, start, span);
  inside.sort((a, b) => b.rel - a.rel);
  for (const c of inside) pts.push(c.x, c.y);
  const ps = project(f.ox, f.oy, sx, sy, f.W, f.H);
  pts.push(ps[0], ps[1]);
  return dedupeRing(pts);
}

/** Coins de la carte strictement dans le cône, avec leur angle relatif au début du cône. */
function cornersInCone(
  f: ShadowFrame,
  start: number,
  span: number,
): { x: number; y: number; rel: number }[] {
  const inside: { x: number; y: number; rel: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const cx = f.corners[2 * k]!;
    const cy = f.corners[2 * k + 1]!;
    let rel = pseudoAngle(cx - f.ox, cy - f.oy) - start;
    if (rel < 0) rel += 4;
    if (rel > 0 && rel < span) inside.push({ x: cx, y: cy, rel });
  }
  return inside;
}

/** Point où le rayon de O à travers P sort du rectangle [0, W] × [0, H]. */
function project(ox: number, oy: number, px: number, py: number, W: number, H: number) {
  const dx = px - ox;
  const dy = py - oy;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (W - ox) / dx);
  else if (dx < 0) t = Math.min(t, -ox / dx);
  if (dy > 0) t = Math.min(t, (H - oy) / dy);
  else if (dy < 0) t = Math.min(t, -oy / dy);
  if (!Number.isFinite(t) || t < 1) t = 1;
  let x = ox + t * dx;
  let y = oy + t * dy;
  x = Math.min(Math.max(x, 0), W);
  y = Math.min(Math.max(y, 0), H);
  return [x, y] as const;
}

/** Retire les points consécutifs égaux (et le dernier s'il égale le premier). */
function dedupeRing(pts: number[]): Float64Array {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const n = out.length;
    if (n >= 2 && out[n - 2] === pts[i] && out[n - 1] === pts[i + 1]) continue;
    out.push(pts[i]!, pts[i + 1]!);
  }
  const n = out.length;
  if (n >= 4 && out[0] === out[n - 2] && out[1] === out[n - 1]) out.length = n - 2;
  return Float64Array.from(out);
}
