/**
 * Polygone préparé pour des tests rapides : boîte englobante, puis règle pair-impair limitée
 * aux arêtes de la bande horizontale du point quand le polygone est grand (zone de brouillard à
 * main levée de plusieurs milliers de points, pièce détaillée).
 */
import type { Vec } from './types.js';

/** Au-delà de ce nombre d'arêtes, les arêtes sont rangées par bandes horizontales. */
const BAND_THRESHOLD = 24;

/** Points finis à plat, premier point répété en fin retiré. */
function finiteCoords(points: readonly Vec[]): Float64Array {
  const xs: number[] = [];
  for (const p of points) {
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) xs.push(p.x, p.y);
  }
  let n = xs.length >> 1;
  if (n > 1 && xs[0] === xs[2 * n - 2] && xs[1] === xs[2 * n - 1]) n--;
  return new Float64Array(xs.slice(0, 2 * n));
}

/** Boîte englobante et aire (valeur absolue) d'un polygone à plat. */
interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

/** Boîte englobante et aire du polygone. */
function extentOf(coords: Float64Array, n: number): Extent {
  const ext: Extent = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, area: 0 };
  let area2 = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const x = coords[2 * i]!;
    const y = coords[2 * i + 1]!;
    if (x < ext.minX) ext.minX = x;
    if (x > ext.maxX) ext.maxX = x;
    if (y < ext.minY) ext.minY = y;
    if (y > ext.maxY) ext.maxY = y;
    area2 += coords[2 * j]! * y - x * coords[2 * j + 1]!;
  }
  ext.area = Math.abs(area2) / 2;
  return ext;
}

/** Arêtes rangées par bandes horizontales (CSR). */
interface Bands {
  count: number;
  height: number;
  start: Int32Array;
  edges: Int32Array;
}

/** Bande de y, bornée aux bandes existantes. */
function bandOf(y: number, minY: number, height: number, count: number): number {
  const k = Math.floor((y - minY) / height);
  return Math.min(Math.max(k, 0), count - 1);
}

/**
 * Bandes horizontales : chaque arête est rangée dans toutes les bandes que son intervalle en y
 * touche (bornes comprises, même formule qu'à la requête).
 */
function buildBands(coords: Float64Array, n: number, minY: number, maxY: number): Bands {
  const count = Math.min(256, Math.max(4, Math.ceil(Math.sqrt(n) * 2)));
  const height = (maxY - minY) / count;
  const start = new Int32Array(count + 1);
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const y1 = coords[2 * j + 1]!;
    const y2 = coords[2 * i + 1]!;
    const k1 = bandOf(Math.min(y1, y2), minY, height, count);
    const k2 = bandOf(Math.max(y1, y2), minY, height, count);
    for (let k = k1; k <= k2; k++) start[k + 1]!++;
  }
  for (let k = 0; k < count; k++) start[k + 1]! += start[k]!;
  const edges = new Int32Array(start[count]!);
  const fill = start.slice(0, count);
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const y1 = coords[2 * j + 1]!;
    const y2 = coords[2 * i + 1]!;
    const k1 = bandOf(Math.min(y1, y2), minY, height, count);
    const k2 = bandOf(Math.max(y1, y2), minY, height, count);
    for (let k = k1; k <= k2; k++) edges[fill[k]!++] = i;
  }
  return { count, height, start, edges };
}

/** L'arête j→i coupe-t-elle la demi-droite horizontale à droite de (x, y) (pair-impair) ? */
function crossesRight(c: Float64Array, i: number, j: number, x: number, y: number): boolean {
  const xi = c[2 * i]!;
  const yi = c[2 * i + 1]!;
  const xj = c[2 * j]!;
  const yj = c[2 * j + 1]!;
  return yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
}

export class PolygonShape {
  /** Sommets à plat `[x0, y0, …]`. */
  readonly coords: Float64Array;
  readonly count: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  /** Aire (valeur absolue), pour trouver la pièce la plus intérieure. */
  readonly area: number;
  private readonly bandCount: number;
  private readonly bandHeight: number;
  private readonly bandStart: Int32Array | null;
  private readonly bandEdges: Int32Array | null;

  constructor(points: readonly Vec[]) {
    // Points non finis ignorés, premier point répété en fin retiré.
    const coords = finiteCoords(points);
    const n = coords.length >> 1;
    this.coords = coords;
    this.count = n;
    const ext = extentOf(coords, n);
    this.minX = ext.minX;
    this.minY = ext.minY;
    this.maxX = ext.maxX;
    this.maxY = ext.maxY;
    this.area = ext.area;

    const bands = n > BAND_THRESHOLD && ext.maxY > ext.minY;
    const built = bands ? buildBands(coords, n, ext.minY, ext.maxY) : null;
    this.bandCount = built ? built.count : 0;
    this.bandHeight = built ? built.height : 0;
    this.bandStart = built ? built.start : null;
    this.bandEdges = built ? built.edges : null;
  }

  /** Point dans le polygone (pair-impair, bord demi-ouvert comme `pointInPolygon`). */
  contains(x: number, y: number): boolean {
    if (this.count < 3 || x < this.minX || x > this.maxX || y < this.minY || y > this.maxY) {
      return false;
    }
    if (this.bandStart !== null && this.bandEdges !== null) {
      return this.containsBanded(x, y, this.bandStart, this.bandEdges);
    }
    const c = this.coords;
    const n = this.count;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      if (crossesRight(c, i, j, x, y)) inside = !inside;
    }
    return inside;
  }

  /** Pair-impair limité aux arêtes de la bande de y. */
  private containsBanded(x: number, y: number, start: Int32Array, edges: Int32Array): boolean {
    const c = this.coords;
    const n = this.count;
    let k = Math.floor((y - this.minY) / this.bandHeight);
    if (k < 0) k = 0;
    else if (k >= this.bandCount) k = this.bandCount - 1;
    let inside = false;
    for (let e = start[k]!, end = start[k + 1]!; e < end; e++) {
      const i = edges[e]!;
      if (crossesRight(c, i, i === 0 ? n - 1 : i - 1, x, y)) inside = !inside;
    }
    return inside;
  }

  /** Carré de la distance du point au contour. */
  boundaryDistSq(x: number, y: number): number {
    const c = this.coords;
    const n = this.count;
    let best = Infinity;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = c[2 * j]!;
      const ay = c[2 * j + 1]!;
      const ex = c[2 * i]! - ax;
      const ey = c[2 * i + 1]! - ay;
      const len2 = ex * ex + ey * ey;
      let t = len2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / len2 : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const dx = ax + t * ex - x;
      const dy = ay + t * ey - y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return best;
  }
}
