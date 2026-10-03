/**
 * Découpe d'un polygone étoilé par un disque centré sur son origine : le long de chaque rayon,
 * la distance devient min(distance au bord du polygone, rayon). Les parties hors du disque sont
 * remplacées par des arcs, discrétisés à 0,25 px près (flèche de la corde).
 */
import type { StarPolygon } from './sweep.js';

/** Écart maximal entre l'arc et ses cordes, en pixels. */
const ARC_TOLERANCE = 0.25;

/** Pas angulaire des arcs pour un rayon donné (entre 24 et 256 cordes par tour). */
function arcStep(r: number): number {
  const ratio = 1 - ARC_TOLERANCE / r;
  const step = ratio > -1 ? 2 * Math.acos(ratio) : Math.PI;
  const min = (2 * Math.PI) / 256;
  const max = (2 * Math.PI) / 24;
  return clamp(step, min, max);
}

/** Tableau de sortie qui grandit. */
class Out {
  data = new Float64Array(64);
  n = 0;
  push(x: number, y: number) {
    if (this.n + 2 > this.data.length) {
      const next = new Float64Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    const d = this.data;
    const n = this.n;
    // Pas de doublon consécutif.
    if (n >= 2 && d[n - 2] === x && d[n - 1] === y) return;
    d[n] = x;
    d[n + 1] = y;
    this.n = n + 2;
  }
}

/** Ajoute les points intermédiaires de l'arc de `from` à `to` (sens des angles croissants). */
function pushArc(out: Out, cx: number, cy: number, r: number, from: number, to: number) {
  let span = to - from;
  while (span < 0) span += 2 * Math.PI;
  while (span > 2 * Math.PI) span -= 2 * Math.PI;
  const steps = Math.ceil(span / arcStep(r));
  for (let k = 1; k < steps; k++) {
    const a = from + (span * k) / steps;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
}

/** Cercle complet, en ordre angulaire croissant. */
export function circlePolygon(cx: number, cy: number, r: number): Float64Array {
  const steps = Math.max(24, Math.ceil((2 * Math.PI) / arcStep(r)));
  const out = new Float64Array(2 * steps);
  for (let k = 0; k < steps; k++) {
    const a = (2 * Math.PI * k) / steps;
    out[2 * k] = cx + r * Math.cos(a);
    out[2 * k + 1] = cy + r * Math.sin(a);
  }
  return out;
}

/** Paramètres d'entrée et de sortie du disque le long du segment en cours (NaN : aucun). */
let tEnter = Number.NaN;
let tExit = Number.NaN;

/**
 * Entrée et sortie du disque le long du segment P→P + (dx, dy) (coordonnées relatives au
 * centre), dans `tEnter` et `tExit` : intersections avec le cercle, |P + t (Q − P)|² = r².
 */
function discCrossings(
  px: number,
  py: number,
  dx: number,
  dy: number,
  inP: boolean,
  inQ: boolean,
  r2: number,
): void {
  const a = dx * dx + dy * dy;
  const b = 2 * (px * dx + py * dy);
  const c = px * px + py * py - r2;
  const disc = b * b - 4 * a * c;
  let t1 = Number.NaN;
  let t2 = Number.NaN;
  if (a > 0 && disc > 0) {
    const sq = Math.sqrt(disc);
    t1 = (-b - sq) / (2 * a);
    t2 = (-b + sq) / (2 * a);
  }
  tEnter = Number.NaN;
  tExit = Number.NaN;
  if (inP && !inQ) {
    tExit = Number.isNaN(t2) ? 0 : t2;
  } else if (!inP && inQ) {
    tEnter = Number.isNaN(t1) ? 1 : t1;
  } else if (!inP && !inQ && t1 > 0 && t2 < 1 && t1 < t2) {
    // Corde qui traverse le disque.
    tEnter = t1;
    tExit = t2;
  }
}

/** Découpe en cours : points émis et arcs à raccorder. */
class DiscClip {
  readonly out = new Out();
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly r2: number;
  anyInside = false;
  anyCross = false;
  // Angle (atan2) de la dernière sortie du disque, NaN tant qu'on est dedans. Quand on commence
  // dehors, la première entrée est gardée pour l'arc de fermeture, ajouté à la fin.
  exitAngle = Number.NaN;
  firstEntry = Number.NaN;
  pending: boolean;

  constructor(cx: number, cy: number, r: number, pending: boolean) {
    this.cx = cx;
    this.cy = cy;
    this.r = r;
    this.r2 = r * r;
    this.pending = pending;
  }

  /** Entrée dans le disque en (x, y) relatif au centre : arc depuis la dernière sortie. */
  enter(x: number, y: number): void {
    const ang = Math.atan2(y, x);
    if (!Number.isNaN(this.exitAngle)) {
      pushArc(this.out, this.cx, this.cy, this.r, this.exitAngle, ang);
    } else if (this.pending) {
      this.firstEntry = ang;
      this.pending = false;
    }
    this.exitAngle = Number.NaN;
    this.out.push(this.cx + x, this.cy + y);
    this.anyCross = true;
  }

  /** Sortie du disque en (x, y) relatif au centre. */
  exit(x: number, y: number): void {
    this.out.push(this.cx + x, this.cy + y);
    this.exitAngle = Math.atan2(y, x);
    this.anyCross = true;
  }

  /** Arc de fermeture, puis polygone sans répéter le premier point. */
  finish(): Float64Array {
    if (!Number.isNaN(this.exitAngle) && !Number.isNaN(this.firstEntry)) {
      pushArc(this.out, this.cx, this.cy, this.r, this.exitAngle, this.firstEntry);
    }
    let m = this.out.n;
    const d = this.out.data;
    if (m >= 4 && d[0] === d[m - 2] && d[1] === d[m - 1]) m -= 2;
    return d.slice(0, m);
  }
}

/** Segment du sommet i au sommet j du polygone étoilé `p`, coupé au disque. */
function clipEdge(clip: DiscClip, p: Float64Array, i: number, j: number): void {
  const px = p[2 * i]! - clip.cx;
  const py = p[2 * i + 1]! - clip.cy;
  const qx = p[2 * j]! - clip.cx;
  const qy = p[2 * j + 1]! - clip.cy;
  const inP = px * px + py * py <= clip.r2;
  const inQ = qx * qx + qy * qy <= clip.r2;
  if (inP) {
    clip.anyInside = true;
    clip.out.push(p[2 * i]!, p[2 * i + 1]!);
  }
  const dx = qx - px;
  const dy = qy - py;
  discCrossings(px, py, dx, dy, inP, inQ, clip.r2);
  if (!Number.isNaN(tEnter)) {
    const tt = clamp(tEnter, 0, 1);
    clip.enter(px + tt * dx, py + tt * dy);
  }
  if (!Number.isNaN(tExit)) {
    const tt = clamp(tExit, 0, 1);
    clip.exit(px + tt * dx, py + tt * dy);
  }
}

/** Le polygone étoilé coupé au disque (origine du polygone, rayon r). */
export function clipStarToDisc(star: StarPolygon, r: number): Float64Array {
  const n = star.count;
  const cx = star.ox;
  const cy = star.oy;
  if (!(r > 0) || n < 3) return new Float64Array(0);
  const p = star.points;
  const clip = new DiscClip(cx, cy, r, (p[0]! - cx) ** 2 + (p[1]! - cy) ** 2 > r * r);
  for (let i = 0; i < n; i++) clipEdge(clip, p, i, i + 1 === n ? 0 : i + 1);
  if (!clip.anyInside && !clip.anyCross) {
    // Tout le bord est hors du disque : le disque entier est visible.
    return circlePolygon(cx, cy, r);
  }
  return clip.finish();
}

/** Borne `v` entre `lo` et `hi` (NaN reste NaN, contrairement à Math.min/Math.max mêlés). */
function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  return v > hi ? hi : v;
}
