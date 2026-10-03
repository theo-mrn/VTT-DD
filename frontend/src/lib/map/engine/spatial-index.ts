/**
 * Index spatial du moteur (docs/carte.md § 2, § 5) : une grille uniforme maison, sans
 * dépendance. Il sert au test de toucher (quelles entités sous le pointeur), au lasso et au
 * culling (quelles entités touchent la vue). Il ne range que des boîtes englobantes : le test
 * précis appartient à l'entité (`hitTest`).
 *
 * Coût : insertion et retrait en O(cases couvertes), requête en O(cases de la zone + résultats).
 * Un élément immense (plus de `MAX_CELLS` cases) est gardé à part et toujours candidat, pour ne
 * pas remplir la grille.
 */
import { rectsIntersect, type Point, type Rect } from './geometry';

/** Au-delà, l'élément est « hors grille » (toujours candidat). */
const MAX_CELLS = 4096;
/** Décalage des indices de case (coordonnées bornées à ±1 000 000 par le backend). */
const OFFSET = 32_768;

interface Entry {
  rect: Rect;
  /** Cases occupées (vide si hors grille). */
  keys: number[];
}

export class SpatialIndex {
  private readonly cells = new Map<number, Set<string>>();
  private readonly entries = new Map<string, Entry>();
  private readonly oversized = new Set<string>();

  /** `cellSize` en pixels du monde (256 : une case ≈ quelques tokens). */
  constructor(readonly cellSize = 256) {}

  get size(): number {
    return this.entries.size;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  rectOf(id: string): Rect | undefined {
    return this.entries.get(id)?.rect;
  }

  private range(rect: Rect) {
    const s = this.cellSize;
    return {
      x0: Math.floor(rect.x / s),
      y0: Math.floor(rect.y / s),
      x1: Math.floor((rect.x + Math.max(0, rect.width)) / s),
      y1: Math.floor((rect.y + Math.max(0, rect.height)) / s),
    };
  }

  private static key(cx: number, cy: number) {
    return (cx + OFFSET) * 65_536 + (cy + OFFSET);
  }

  /** Ajoute ou déplace un élément. */
  set(id: string, rect: Rect) {
    const prev = this.entries.get(id);
    if (prev && sameRect(prev.rect, rect)) return;
    if (prev) this.detach(id, prev);
    const { x0, y0, x1, y1 } = this.range(rect);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    const entry: Entry = { rect: { ...rect }, keys: [] };
    if (!Number.isFinite(count) || count > MAX_CELLS) {
      this.oversized.add(id);
    } else {
      for (let cx = x0; cx <= x1; cx++)
        for (let cy = y0; cy <= y1; cy++) {
          const k = SpatialIndex.key(cx, cy);
          let cell = this.cells.get(k);
          if (!cell) {
            cell = new Set();
            this.cells.set(k, cell);
          }
          cell.add(id);
          entry.keys.push(k);
        }
    }
    this.entries.set(id, entry);
  }

  remove(id: string) {
    const prev = this.entries.get(id);
    if (!prev) return;
    this.detach(id, prev);
    this.entries.delete(id);
  }

  private detach(id: string, entry: Entry) {
    this.oversized.delete(id);
    for (const k of entry.keys) {
      const cell = this.cells.get(k);
      if (!cell) continue;
      cell.delete(id);
      if (!cell.size) this.cells.delete(k);
    }
  }

  clear() {
    this.cells.clear();
    this.entries.clear();
    this.oversized.clear();
  }

  /** Éléments dont la boîte touche le rectangle (ordre quelconque). */
  queryRect(rect: Rect): string[] {
    const found = new Set<string>();
    const { x0, y0, x1, y1 } = this.range(rect);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    // Zone plus grande que la grille occupée : on parcourt les cases existantes
    if (count > this.cells.size) this.collectAll(found);
    else this.collectRange(found, x0, y0, x1, y1);
    for (const id of this.oversized) found.add(id);
    const out: string[] = [];
    for (const id of found) {
      const e = this.entries.get(id);
      if (e && rectsIntersect(e.rect, rect)) out.push(id);
    }
    return out;
  }

  /** Éléments de toutes les cases occupées. */
  private collectAll(found: Set<string>) {
    for (const cell of this.cells.values()) for (const id of cell) found.add(id);
  }

  /** Éléments des cases de la plage (bornes comprises). */
  private collectRange(found: Set<string>, x0: number, y0: number, x1: number, y1: number) {
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.cells.get(SpatialIndex.key(cx, cy));
        if (cell) for (const id of cell) found.add(id);
      }
  }

  /** Éléments dont la boîte touche le point, à `tolerance` près (pixels du monde). */
  queryPoint(p: Point, tolerance = 0): string[] {
    return this.queryRect({
      x: p.x - tolerance,
      y: p.y - tolerance,
      width: 2 * tolerance,
      height: 2 * tolerance,
    });
  }
}

const sameRect = (a: Rect, b: Rect) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
