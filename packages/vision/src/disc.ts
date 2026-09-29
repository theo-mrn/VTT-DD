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
  return step < min ? min : step > max ? max : step;
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

/** Le polygone étoilé coupé au disque (origine du polygone, rayon r). */
export function clipStarToDisc(star: StarPolygon, r: number): Float64Array {
  const n = star.count;
  const cx = star.ox;
  const cy = star.oy;
  if (!(r > 0) || n < 3) return new Float64Array(0);
  const p = star.points;
  const r2 = r * r;
  const out = new Out();
  let anyInside = false;
  let anyCross = false;
  // Angle (atan2) de la dernière sortie du disque, NaN tant qu'on est dedans. Quand on commence
  // dehors, la première entrée est gardée pour l'arc de fermeture, ajouté à la fin.
  let exitAngle = NaN;
  let firstEntry = NaN;
  let pending = (p[0]! - cx) ** 2 + (p[1]! - cy) ** 2 > r2;

  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    const px = p[2 * i]! - cx;
    const py = p[2 * i + 1]! - cy;
    const qx = p[2 * j]! - cx;
    const qy = p[2 * j + 1]! - cy;
    const inP = px * px + py * py <= r2;
    const inQ = qx * qx + qy * qy <= r2;
    if (inP) {
      anyInside = true;
      out.push(p[2 * i]!, p[2 * i + 1]!);
    }
    // Intersections du segment P→Q avec le cercle : |P + t (Q − P)|² = r².
    const dx = qx - px;
    const dy = qy - py;
    const a = dx * dx + dy * dy;
    const b = 2 * (px * dx + py * dy);
    const c = px * px + py * py - r2;
    const disc = b * b - 4 * a * c;
    let t1 = NaN;
    let t2 = NaN;
    if (a > 0 && disc > 0) {
      const sq = Math.sqrt(disc);
      t1 = (-b - sq) / (2 * a);
      t2 = (-b + sq) / (2 * a);
    }
    let tEnter = NaN;
    let tExit = NaN;
    if (inP && !inQ) {
      tExit = Number.isNaN(t2) ? 0 : t2;
    } else if (!inP && inQ) {
      tEnter = Number.isNaN(t1) ? 1 : t1;
    } else if (!inP && !inQ && t1 > 0 && t2 < 1 && t1 < t2) {
      // Corde qui traverse le disque.
      tEnter = t1;
      tExit = t2;
    }
    if (!Number.isNaN(tEnter)) {
      const tt = tEnter < 0 ? 0 : tEnter > 1 ? 1 : tEnter;
      const x = px + tt * dx;
      const y = py + tt * dy;
      const ang = Math.atan2(y, x);
      if (!Number.isNaN(exitAngle)) pushArc(out, cx, cy, r, exitAngle, ang);
      else if (pending) {
        firstEntry = ang;
        pending = false;
      }
      exitAngle = NaN;
      out.push(cx + x, cy + y);
      anyCross = true;
    }
    if (!Number.isNaN(tExit)) {
      const tt = tExit < 0 ? 0 : tExit > 1 ? 1 : tExit;
      const x = px + tt * dx;
      const y = py + tt * dy;
      out.push(cx + x, cy + y);
      exitAngle = Math.atan2(y, x);
      anyCross = true;
    }
  }

  if (!anyInside && !anyCross) {
    // Tout le bord est hors du disque : le disque entier est visible.
    return circlePolygon(cx, cy, r);
  }
  if (!Number.isNaN(exitAngle) && !Number.isNaN(firstEntry)) {
    pushArc(out, cx, cy, r, exitAngle, firstEntry);
  }
  let m = out.n;
  const d = out.data;
  if (m >= 4 && d[0] === d[m - 2] && d[1] === d[m - 1]) m -= 2;
  return d.slice(0, m);
}
