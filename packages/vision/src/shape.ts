/**
 * Polygone préparé pour des tests rapides : boîte englobante, puis règle pair-impair limitée
 * aux arêtes de la bande horizontale du point quand le polygone est grand (zone de brouillard à
 * main levée de plusieurs milliers de points, pièce détaillée).
 */
import type { Vec } from './types.js';

/** Au-delà de ce nombre d'arêtes, les arêtes sont rangées par bandes horizontales. */
const BAND_THRESHOLD = 24;

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
    const xs: number[] = [];
    for (const p of points) {
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) xs.push(p.x, p.y);
    }
    let n = xs.length >> 1;
    if (n > 1 && xs[0] === xs[2 * n - 2] && xs[1] === xs[2 * n - 1]) n--;
    const coords = new Float64Array(xs.slice(0, 2 * n));
    this.coords = coords;
    this.count = n;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let area2 = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const x = coords[2 * i]!;
      const y = coords[2 * i + 1]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      area2 += coords[2 * j]! * y - x * coords[2 * j + 1]!;
    }
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
    this.area = Math.abs(area2) / 2;

    if (n > BAND_THRESHOLD && maxY > minY) {
      // Bandes horizontales : chaque arête est rangée dans toutes les bandes que son
      // intervalle en y touche (bornes comprises, même formule qu'à la requête).
      const bandCount = Math.min(256, Math.max(4, Math.ceil(Math.sqrt(n) * 2)));
      const bandHeight = (maxY - minY) / bandCount;
      const band = (y: number) => {
        const k = Math.floor((y - minY) / bandHeight);
        return Math.min(Math.max(k, 0), bandCount - 1);
      };
      const start = new Int32Array(bandCount + 1);
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const y1 = coords[2 * j + 1]!;
        const y2 = coords[2 * i + 1]!;
        const k1 = band(Math.min(y1, y2));
        const k2 = band(Math.max(y1, y2));
        for (let k = k1; k <= k2; k++) start[k + 1]!++;
      }
      for (let k = 0; k < bandCount; k++) start[k + 1]! += start[k]!;
      const edges = new Int32Array(start[bandCount]!);
      const fill = start.slice(0, bandCount);
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const y1 = coords[2 * j + 1]!;
        const y2 = coords[2 * i + 1]!;
        const k1 = band(Math.min(y1, y2));
        const k2 = band(Math.max(y1, y2));
        for (let k = k1; k <= k2; k++) edges[fill[k]!++] = i;
      }
      this.bandCount = bandCount;
      this.bandHeight = bandHeight;
      this.bandStart = start;
      this.bandEdges = edges;
    } else {
      this.bandCount = 0;
      this.bandHeight = 0;
      this.bandStart = null;
      this.bandEdges = null;
    }
  }

  /** Point dans le polygone (pair-impair, bord demi-ouvert comme `pointInPolygon`). */
  contains(x: number, y: number): boolean {
    if (this.count < 3 || x < this.minX || x > this.maxX || y < this.minY || y > this.maxY) {
      return false;
    }
    const c = this.coords;
    const n = this.count;
    let inside = false;
    if (this.bandStart !== null && this.bandEdges !== null) {
      let k = Math.floor((y - this.minY) / this.bandHeight);
      if (k < 0) k = 0;
      else if (k >= this.bandCount) k = this.bandCount - 1;
      const edges = this.bandEdges;
      for (let e = this.bandStart[k]!, end = this.bandStart[k + 1]!; e < end; e++) {
        const i = edges[e]!;
        const j = i === 0 ? n - 1 : i - 1;
        const xi = c[2 * i]!;
        const yi = c[2 * i + 1]!;
        const xj = c[2 * j]!;
        const yj = c[2 * j + 1]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = c[2 * i]!;
      const yi = c[2 * i + 1]!;
      const xj = c[2 * j]!;
      const yj = c[2 * j + 1]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
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
