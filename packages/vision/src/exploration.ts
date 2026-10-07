/**
 * Mémoire de l'exploration (docs/exploration.md § 3) : un masque raster par scène, une case
 * d'exploration valant un quart de case de jeu (512 par côté au plus), normalisé sur la carte.
 * Une case est explorée quand son centre est vu (`View.containsXY`) : même algorithme que la vue,
 * pour le serveur (ce qui est enregistré) et le navigateur (ce qui est montré pendant un glisser).
 *
 * - `markView` ajoute ce qu'une vue montre ; seules les cases du rectangle où chaque observateur
 *   peut voir sont examinées, et une case déjà explorée est sautée sans test.
 * - `rasterizeShape` : cases dont le centre est dans un cercle ou un polygone (outil du MJ).
 * - Fenêtres codées en plages (RLE, entiers LEB128, base64) pour le réseau, bits tassés pour la
 *   base. Rien n'alloue dans les boucles par case.
 */
import { pointInPolygon } from './geometry.js';
import type { PreparedScene } from './prepare.js';
import type { Vec } from './types.js';
import type { View, ViewerTerms } from './view.js';

/** Cases d'exploration par case de jeu, sur chaque axe. */
export const EXPLORATION_CELLS_PER_UNIT = 4;
/** Cases d'exploration au plus par côté de la carte. */
export const EXPLORATION_MAX_SIDE = 512;

/** Découpage de la carte en cases d'exploration. */
export interface ExplorationGrid {
  readonly cols: number;
  readonly rows: number;
}

/** Taille de la carte, en pixels du monde. */
export interface ExplorationBounds {
  readonly width: number;
  readonly height: number;
}

/** Rectangle de cases (colonne, ligne, largeur, hauteur). */
export interface CellRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Contenu d'un rectangle de cases (0 ou 1, rangé par lignes). */
export interface CellWindow extends CellRect {
  readonly cells: Uint8Array;
}

/** Fenêtre codée pour le réseau : plages alternées (0 d'abord) en LEB128, base64. */
export interface EncodedWindow extends CellRect {
  readonly data: string;
}

/**
 * Grille d'une carte : un quart de case de jeu, cases à peu près carrées, 512 par côté au plus
 * (au-delà, les cases grandissent). Taille ou case inconnues : la plus petite grille utile.
 */
export function explorationGrid(
  width: number,
  height: number,
  pixelsPerUnit: number,
): ExplorationGrid {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const ppu = Number.isFinite(pixelsPerUnit) && pixelsPerUnit > 0 ? pixelsPerUnit : w / 25;
  let cell = ppu / EXPLORATION_CELLS_PER_UNIT;
  const longest = Math.max(w, h);
  if (longest / cell > EXPLORATION_MAX_SIDE) cell = longest / EXPLORATION_MAX_SIDE;
  const side = (v: number) => Math.min(EXPLORATION_MAX_SIDE, Math.max(1, Math.round(v / cell)));
  return { cols: side(w), rows: side(h) };
}

/** Masque d'exploration : une valeur par case (0, 1), rangée par lignes. */
export class ExplorationMask implements ExplorationGrid {
  readonly cells: Uint8Array;

  constructor(
    readonly cols: number,
    readonly rows: number,
    cells?: Uint8Array,
  ) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1)
      throw new RangeError(`grille d'exploration invalide : ${cols} × ${rows}`);
    if (cells && cells.length !== cols * rows)
      throw new RangeError(`masque de ${cells.length} cases pour une grille ${cols} × ${rows}`);
    this.cells = cells ?? new Uint8Array(cols * rows);
  }

  static empty(grid: ExplorationGrid): ExplorationMask {
    return new ExplorationMask(grid.cols, grid.rows);
  }

  get(col: number, row: number): boolean {
    return this.cells[row * this.cols + col] === 1;
  }

  /** Cases explorées. */
  count(): number {
    let n = 0;
    for (const v of this.cells) n += v;
    return n;
  }

  clone(): ExplorationMask {
    return new ExplorationMask(this.cols, this.rows, this.cells.slice());
  }

  /** Même grille ? */
  sameGrid(grid: ExplorationGrid): boolean {
    return grid.cols === this.cols && grid.rows === this.rows;
  }
}

// ─── Régions du monde → cases ────────────────────────────────────────────────

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EMPTY_BOX = (): Box => ({
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
});

function growBox(b: Box, minX: number, minY: number, maxX: number, maxY: number) {
  if (minX < b.minX) b.minX = minX;
  if (minY < b.minY) b.minY = minY;
  if (maxX > b.maxX) b.maxX = maxX;
  if (maxY > b.maxY) b.maxY = maxY;
}

function intersectBox(b: Box, minX: number, minY: number, maxX: number, maxY: number) {
  if (minX > b.minX) b.minX = minX;
  if (minY > b.minY) b.minY = minY;
  if (maxX < b.maxX) b.maxX = maxX;
  if (maxY < b.maxY) b.maxY = maxY;
}

/** Boîte d'un polygone à plat. */
function polygonBox(poly: Float64Array, into: Box) {
  for (let i = 0; i + 1 < poly.length; i += 2) {
    const x = poly[i]!;
    const y = poly[i + 1]!;
    growBox(into, x, y, x, y);
  }
}

/**
 * Rectangle du monde où la vue d'un observateur peut tomber : sa ligne de vue, coupée à sa pièce
 * de confinement, et à la portée (son disque, ce qui est hors brouillard, les aires éclairées).
 * Vide (`minX > maxX`) s'il ne voit rien.
 */
export function viewerReach(prep: PreparedScene, terms: ViewerTerms): Box {
  const box = EMPTY_BOX();
  polygonBox(terms.los, box);
  if (terms.clipRoom) {
    const clip = EMPTY_BOX();
    polygonBox(terms.clipRoom.polygon, clip);
    intersectBox(box, clip.minX, clip.minY, clip.maxX, clip.maxY);
  }
  // Portée : union de boîtes (une borne, pas l'aire exacte)
  const reach = EMPTY_BOX();
  const r = terms.visionRadius;
  if (r > 0) {
    const p = terms.viewer.pos;
    growBox(reach, p.x - r, p.y - r, p.x + r, p.y + r);
  }
  const core = prep.core;
  if (!core.fogFull) growBox(reach, 0, 0, prep.width, prep.height);
  else for (const z of core.fog) if (!z.fog) growBox(reach, z.minX, z.minY, z.maxX, z.maxY);
  for (const l of prep.lights)
    growBox(reach, l.x - l.radius, l.y - l.radius, l.x + l.radius, l.y + l.radius);
  intersectBox(box, reach.minX, reach.minY, reach.maxX, reach.maxY);
  intersectBox(box, 0, 0, prep.width, prep.height);
  return box;
}

/**
 * Cases dont le centre peut tomber dans la boîte du monde (bornes comprises). Null si aucune.
 */
function cellsOfBox(grid: ExplorationGrid, bounds: ExplorationBounds, box: Box): CellRect | null {
  if (!(box.minX <= box.maxX && box.minY <= box.maxY)) return null;
  const cw = bounds.width / grid.cols;
  const ch = bounds.height / grid.rows;
  // Centre de la case c : (c + 0,5) × cw, dans [minX, maxX]
  const c0 = Math.max(0, Math.ceil(box.minX / cw - 0.5));
  const c1 = Math.min(grid.cols - 1, Math.floor(box.maxX / cw - 0.5));
  const r0 = Math.max(0, Math.ceil(box.minY / ch - 0.5));
  const r1 = Math.min(grid.rows - 1, Math.floor(box.maxY / ch - 0.5));
  if (c1 < c0 || r1 < r0) return null;
  return { x: c0, y: r0, w: c1 - c0 + 1, h: r1 - r0 + 1 };
}

/** Rectangle englobant deux rectangles de cases (l'un peut manquer). */
export function unionRect(a: CellRect | null, b: CellRect | null): CellRect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/** Compteur de travail de `markView` (bancs, statistiques). */
export interface MarkStats {
  /** Cases examinées (dans une région), explorées ou non. */
  scanned: number;
  /** Cases testées contre la vue (non explorées). */
  tested: number;
  /** Cases ajoutées. */
  added: number;
}

/**
 * Ajoute au masque les cases dont le centre est vu. `prep` est la scène de la vue. Renvoie le
 * rectangle des cases ajoutées (null : rien de neuf).
 */
export function markView(
  mask: ExplorationMask,
  prep: PreparedScene,
  view: View,
  stats?: MarkStats,
): CellRect | null {
  const bounds = { width: prep.width, height: prep.height };
  const cw = bounds.width / mask.cols;
  const ch = bounds.height / mask.rows;
  const cells = mask.cells;
  let minC = Infinity;
  let minR = Infinity;
  let maxC = -1;
  let maxR = -1;
  let scanned = 0;
  let tested = 0;
  let added = 0;
  for (const terms of view.viewers) {
    const rect = cellsOfBox(mask, bounds, viewerReach(prep, terms));
    if (!rect) continue;
    for (let r = rect.y; r < rect.y + rect.h; r++) {
      const y = (r + 0.5) * ch;
      const row = r * mask.cols;
      for (let c = rect.x; c < rect.x + rect.w; c++) {
        scanned++;
        if (cells[row + c] === 1) continue;
        tested++;
        if (!view.containsXY((c + 0.5) * cw, y)) continue;
        cells[row + c] = 1;
        added++;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }
    }
  }
  if (stats) {
    stats.scanned += scanned;
    stats.tested += tested;
    stats.added += added;
  }
  return added ? { x: minC, y: minR, w: maxC - minC + 1, h: maxR - minR + 1 } : null;
}

// ─── Formes (outil du MJ) ────────────────────────────────────────────────────

/** Forme posée par le MJ : cercle, ou polygone (rectangle, main levée). */
export type ExplorationShape =
  | { readonly shape: 'circle'; readonly center: Vec; readonly radius: number }
  | { readonly shape: 'polygon'; readonly points: readonly Vec[] };

/** Cases dont le centre est dans la forme ; null si aucune. */
export function rasterizeShape(
  grid: ExplorationGrid,
  bounds: ExplorationBounds,
  shape: ExplorationShape,
): CellWindow | null {
  const box = EMPTY_BOX();
  if (shape.shape === 'circle') {
    const { center: c, radius: rad } = shape;
    if (!(rad > 0)) return null;
    growBox(box, c.x - rad, c.y - rad, c.x + rad, c.y + rad);
  } else {
    if (shape.points.length < 3) return null;
    for (const p of shape.points) growBox(box, p.x, p.y, p.x, p.y);
  }
  const rect = cellsOfBox(grid, bounds, box);
  if (!rect) return null;
  const cw = bounds.width / grid.cols;
  const ch = bounds.height / grid.rows;
  const cells = new Uint8Array(rect.w * rect.h);
  let any = false;
  const r2 = shape.shape === 'circle' ? shape.radius * shape.radius : 0;
  const pt = { x: 0, y: 0 };
  for (let j = 0; j < rect.h; j++) {
    pt.y = (rect.y + j + 0.5) * ch;
    for (let i = 0; i < rect.w; i++) {
      pt.x = (rect.x + i + 0.5) * cw;
      let inside: boolean;
      if (shape.shape === 'circle') {
        const dx = pt.x - shape.center.x;
        const dy = pt.y - shape.center.y;
        inside = dx * dx + dy * dy <= r2;
      } else inside = pointInPolygon(pt, shape.points);
      if (inside) {
        cells[j * rect.w + i] = 1;
        any = true;
      }
    }
  }
  return any ? { ...rect, cells } : null;
}

// ─── Fenêtres ────────────────────────────────────────────────────────────────

const inGrid = (grid: ExplorationGrid, r: CellRect) =>
  Number.isInteger(r.x) &&
  Number.isInteger(r.y) &&
  Number.isInteger(r.w) &&
  Number.isInteger(r.h) &&
  r.x >= 0 &&
  r.y >= 0 &&
  r.w >= 1 &&
  r.h >= 1 &&
  r.x + r.w <= grid.cols &&
  r.y + r.h <= grid.rows;

/** La fenêtre tient-elle dans la grille ? */
export const windowFits = (grid: ExplorationGrid, rect: CellRect) => inGrid(grid, rect);

/** Copie d'un rectangle du masque. */
export function windowOf(mask: ExplorationMask, rect: CellRect): CellWindow {
  if (!inGrid(mask, rect)) throw new RangeError('fenêtre hors de la grille');
  const cells = new Uint8Array(rect.w * rect.h);
  for (let j = 0; j < rect.h; j++) {
    const from = (rect.y + j) * mask.cols + rect.x;
    cells.set(mask.cells.subarray(from, from + rect.w), j * rect.w);
  }
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h, cells };
}

/** Tout le masque, en une fenêtre. */
export const fullWindow = (mask: ExplorationMask): CellWindow => ({
  x: 0,
  y: 0,
  w: mask.cols,
  h: mask.rows,
  cells: mask.cells.slice(),
});

/**
 * Applique une fenêtre : `reveal` ajoute ses cases à 1, `forget` les retire, `set` remplace le
 * rectangle. Renvoie le rectangle des cases changées (null : rien).
 */
export function applyWindow(
  mask: ExplorationMask,
  win: CellWindow,
  op: 'reveal' | 'forget' | 'set',
): CellRect | null {
  if (!inGrid(mask, win) || win.cells.length !== win.w * win.h)
    throw new RangeError('fenêtre hors de la grille');
  let minC = Infinity;
  let minR = Infinity;
  let maxC = -1;
  let maxR = -1;
  const cells = mask.cells;
  for (let j = 0; j < win.h; j++) {
    const row = (win.y + j) * mask.cols + win.x;
    for (let i = 0; i < win.w; i++) {
      const v = win.cells[j * win.w + i]!;
      const before = cells[row + i]!;
      let after = before;
      if (op === 'set') after = v ? 1 : 0;
      else if (v) after = op === 'reveal' ? 1 : 0;
      if (after === before) continue;
      cells[row + i] = after;
      const c = win.x + i;
      const r = win.y + j;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
  }
  return maxC < 0 ? null : { x: minC, y: minR, w: maxC - minC + 1, h: maxR - minR + 1 };
}

/**
 * Cases de la fenêtre qu'une opération changerait vraiment : pour `reveal`, celles qui n'étaient
 * pas explorées ; pour `forget`, celles qui l'étaient. Sert à l'annulation exacte d'un geste.
 */
export function effectiveWindow(
  mask: ExplorationMask,
  win: CellWindow,
  op: 'reveal' | 'forget',
): CellWindow | null {
  if (!inGrid(mask, win)) return null;
  const cells = new Uint8Array(win.cells.length);
  let any = false;
  for (let j = 0; j < win.h; j++) {
    const row = (win.y + j) * mask.cols + win.x;
    for (let i = 0; i < win.w; i++) {
      if (!win.cells[j * win.w + i]) continue;
      const explored = mask.cells[row + i] === 1;
      if (op === 'reveal' ? explored : !explored) continue;
      cells[j * win.w + i] = 1;
      any = true;
    }
  }
  return any ? { x: win.x, y: win.y, w: win.w, h: win.h, cells } : null;
}

// ─── Codage ──────────────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK)
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

function fromBase64(data: string): Uint8Array {
  const s = atob(data);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Plages alternées (0 d'abord) d'une suite de 0 et de 1, en LEB128. */
function encodeRuns(cells: Uint8Array): Uint8Array {
  const out: number[] = [];
  const push = (n: number) => {
    let v = n;
    while (v >= 0x80) {
      out.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    out.push(v);
  };
  let current = 0;
  let run = 0;
  for (const raw of cells) {
    const v = raw ? 1 : 0;
    if (v === current) {
      run++;
      continue;
    }
    push(run);
    current = v;
    run = 1;
  }
  push(run);
  return Uint8Array.from(out);
}

function decodeRuns(bytes: Uint8Array, total: number): Uint8Array {
  const cells = new Uint8Array(total);
  let pos = 0;
  let value = 0;
  let i = 0;
  while (i < bytes.length) {
    let n = 0;
    let shift = 0;
    for (;;) {
      if (i >= bytes.length) throw new RangeError('plage tronquée');
      const b = bytes[i++]!;
      n += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) break;
      shift += 7;
      if (shift > 28) throw new RangeError('plage trop longue');
    }
    if (pos + n > total) throw new RangeError('plages plus longues que la fenêtre');
    if (value) cells.fill(1, pos, pos + n);
    pos += n;
    value ^= 1;
  }
  if (pos !== total) throw new RangeError('plages plus courtes que la fenêtre');
  return cells;
}

/** Fenêtre → réseau. */
export function encodeWindow(win: CellWindow): EncodedWindow {
  return { x: win.x, y: win.y, w: win.w, h: win.h, data: toBase64(encodeRuns(win.cells)) };
}

/** Réseau → fenêtre ; lève `RangeError` si les plages ne couvrent pas exactement la fenêtre. */
export function decodeWindow(enc: EncodedWindow): CellWindow {
  if (
    !Number.isInteger(enc.w) ||
    !Number.isInteger(enc.h) ||
    enc.w < 1 ||
    enc.h < 1 ||
    enc.w * enc.h > EXPLORATION_MAX_SIDE * EXPLORATION_MAX_SIDE
  )
    throw new RangeError('fenêtre invalide');
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(enc.data);
  } catch {
    throw new RangeError('base64 invalide');
  }
  return { x: enc.x, y: enc.y, w: enc.w, h: enc.h, cells: decodeRuns(bytes, enc.w * enc.h) };
}

/** Masque → réseau (toute la grille). */
export const encodeMask = (mask: ExplorationMask): EncodedWindow => encodeWindow(fullWindow(mask));

/** Réseau → masque : la fenêtre doit couvrir toute la grille. */
export function decodeMask(grid: ExplorationGrid, enc: EncodedWindow): ExplorationMask {
  const win = decodeWindow(enc);
  if (win.x !== 0 || win.y !== 0 || win.w !== grid.cols || win.h !== grid.rows)
    throw new RangeError('le masque ne couvre pas la grille');
  return new ExplorationMask(grid.cols, grid.rows, win.cells);
}

/** Bits tassés (8 cases par octet, bit de poids faible d'abord), pour la base. */
export function packBits(cells: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(cells.length / 8));
  for (let i = 0; i < cells.length; i++) if (cells[i]) out[i >> 3] = out[i >> 3]! | (1 << (i & 7));
  return out;
}

export function unpackBits(bytes: Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(count);
  const n = Math.min(count, bytes.length * 8);
  for (let i = 0; i < n; i++) if (bytes[i >> 3]! & (1 << (i & 7))) out[i] = 1;
  return out;
}
