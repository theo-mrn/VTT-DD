/**
 * Salles détectées des murs (docs/carte.md § 9) : toute boucle fermée de segments (murs, portes,
 * fenêtres, sens unique) délimite une salle, sans objet « Pièce » à créer. Les faces bornées du
 * graphe planaire des segments, après soudure des sommets confondus et découpe aux jonctions en
 * T ; les bouts pendants sont ignorés.
 *
 * Une salle est **ouverte** si une fenêtre, une porte ouverte, un mur à sens unique ou un mur
 * translucide est sur son contour : la ligne de vue décide alors de ce qu'on voit au travers.
 * Fermée, elle cache son intérieur à qui est dehors, et l'extérieur à qui est dedans.
 */
import type { Segment, Vec } from './types.js';

export interface WallRoom {
  readonly id: string;
  readonly points: readonly Vec[];
  /** Aucune ouverture sur le contour. */
  readonly closed: boolean;
}

/** Plus petite aire gardée (px²) : en dessous, un artefact de tracé, pas une salle. */
const MIN_AREA = 16;
/** Au-delà, la détection s'arrête (carte pathologique) : les pièces explicites restent. */
const MAX_EDGES = 20_000;

/** Le segment laisse-t-il voir au travers (ouverture de la salle) ? */
function opens(s: Segment): boolean {
  if (s.kind === 'window') return true;
  if (s.kind === 'door') return s.open === true;
  if (s.kind === 'one_way' || s.kind === 'one_way_wall') return true;
  const opacity = s.opacity ?? 1;
  return !(opacity >= 1);
}

interface Edge {
  a: number;
  b: number;
  open: boolean;
}

/** Sommets soudés et arêtes brutes (avant découpe aux jonctions). */
interface Welded {
  xs: number[];
  ys: number[];
  raw: Edge[];
}

/** Grille des sommets (cases de ~ 1/64 de la scène) pour les jonctions en T. */
interface VertexGrid {
  minX: number;
  minY: number;
  cell: number;
  cols: number;
  rows: number;
  buckets: Map<number, number[]>;
}

/** Arête en cours de découpe : extrémités, longueur² et boîte élargie de `snap`. */
interface EdgeProbe {
  a: number;
  b: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  len2: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Sommet posé sur l'intérieur d'une arête, à son paramètre t. */
interface Junction {
  t: number;
  v: number;
}

/** Clé numérique de case (coordonnées de case < 2²⁶ en valeur absolue : exact en double). */
function cellKey(cx: number, cy: number): number {
  return (cx + 67_108_864) * 134_217_728 + (cy + 67_108_864);
}

/** Indice du sommet soudé à `p` (grille de pas `cell`, voisins compris), créé au besoin. */
function weldVertex(
  p: Vec,
  cell: number,
  snap: number,
  xs: number[],
  ys: number[],
  index: Map<number, number>,
): number {
  const cx = Math.round(p.x / cell);
  const cy = Math.round(p.y / cell);
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const hit = index.get(cellKey(cx + dx, cy + dy));
      if (hit !== undefined && Math.hypot(xs[hit]! - p.x, ys[hit]! - p.y) <= snap) return hit;
    }
  const id = xs.length;
  xs.push(p.x);
  ys.push(p.y);
  index.set(cellKey(cx, cy), id);
  return id;
}

/** Sommets soudés et arêtes non dégénérées des segments finis. */
function weldSegments(segments: readonly Segment[], snap: number): Welded {
  const cell = Math.max(snap, 1e-9);
  const xs: number[] = [];
  const ys: number[] = [];
  const index = new Map<number, number>();
  const raw: Edge[] = [];
  for (const s of segments) {
    if (!Number.isFinite(s.a.x + s.a.y + s.b.x + s.b.y)) continue;
    const a = weldVertex(s.a, cell, snap, xs, ys, index);
    const b = weldVertex(s.b, cell, snap, xs, ys, index);
    if (a !== b) raw.push({ a, b, open: opens(s) });
  }
  return { xs, ys, raw };
}

/** Case de la grille contenant (x, y), bornée à la grille. */
function cellOf(grid: VertexGrid, x: number, y: number): number {
  return (
    Math.min(grid.cols - 1, Math.max(0, Math.floor((x - grid.minX) / grid.cell))) +
    Math.min(grid.rows - 1, Math.max(0, Math.floor((y - grid.minY) / grid.cell))) * grid.cols
  );
}

/** Sommets rangés dans une grille couvrant leur boîte englobante. */
function buildVertexGrid(xs: readonly number[], ys: readonly number[], snap: number): VertexGrid {
  let minVX = Infinity;
  let minVY = Infinity;
  let maxVX = -Infinity;
  let maxVY = -Infinity;
  for (let v = 0; v < xs.length; v++) {
    minVX = Math.min(minVX, xs[v]!);
    maxVX = Math.max(maxVX, xs[v]!);
    minVY = Math.min(minVY, ys[v]!);
    maxVY = Math.max(maxVY, ys[v]!);
  }
  const cell = Math.max((maxVX - minVX) / 64, (maxVY - minVY) / 64, snap * 4, 1);
  const grid: VertexGrid = {
    minX: minVX,
    minY: minVY,
    cell,
    cols: Math.floor((maxVX - minVX) / cell) + 1,
    rows: Math.floor((maxVY - minVY) / cell) + 1,
    buckets: new Map<number, number[]>(),
  };
  for (let v = 0; v < xs.length; v++) {
    const c = cellOf(grid, xs[v]!, ys[v]!);
    const list = grid.buckets.get(c);
    if (list) list.push(v);
    else grid.buckets.set(c, [v]);
  }
  return grid;
}

/** Remplit la sonde avec l'arête `e`. */
function fillProbe(
  probe: EdgeProbe,
  e: Edge,
  xs: readonly number[],
  ys: readonly number[],
  snap: number,
): void {
  const ax = xs[e.a]!;
  const ay = ys[e.a]!;
  const bx = xs[e.b]!;
  const by = ys[e.b]!;
  probe.a = e.a;
  probe.b = e.b;
  probe.ax = ax;
  probe.ay = ay;
  probe.bx = bx;
  probe.by = by;
  probe.len2 = (bx - ax) ** 2 + (by - ay) ** 2;
  probe.minX = Math.min(ax, bx) - snap;
  probe.maxX = Math.max(ax, bx) + snap;
  probe.minY = Math.min(ay, by) - snap;
  probe.maxY = Math.max(ay, by) + snap;
}

/** Paramètre t ∈ ]0, 1[ du sommet `v` posé sur l'intérieur de l'arête sondée, -1 sinon. */
function junctionT(
  probe: EdgeProbe,
  v: number,
  xs: readonly number[],
  ys: readonly number[],
  snap: number,
): number {
  if (v === probe.a || v === probe.b) return -1;
  const px = xs[v]!;
  const py = ys[v]!;
  if (px < probe.minX || px > probe.maxX || py < probe.minY || py > probe.maxY) return -1;
  const ax = probe.ax;
  const ay = probe.ay;
  const dx = probe.bx - ax;
  const dy = probe.by - ay;
  const t = ((px - ax) * dx + (py - ay) * dy) / probe.len2;
  if (t <= 0 || t >= 1) return -1;
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy) <= snap ? t : -1;
}

/** Sommets posés sur l'intérieur de l'arête sondée (cases de sa boîte seulement). */
function collectJunctions(
  probe: EdgeProbe,
  grid: VertexGrid,
  xs: readonly number[],
  ys: readonly number[],
  snap: number,
  onIt: Junction[],
): void {
  const c0 = Math.max(0, Math.floor((probe.minX - grid.minX) / grid.cell));
  const c1 = Math.min(grid.cols - 1, Math.floor((probe.maxX - grid.minX) / grid.cell));
  const r0 = Math.max(0, Math.floor((probe.minY - grid.minY) / grid.cell));
  const r1 = Math.min(grid.rows - 1, Math.floor((probe.maxY - grid.minY) / grid.cell));
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const list = grid.buckets.get(c + r * grid.cols);
      if (!list) continue;
      for (const v of list) {
        const t = junctionT(probe, v, xs, ys, snap);
        if (t > 0) onIt.push({ t, v });
      }
    }
}

/** Morceaux de l'arête `e` entre ses jonctions triées. */
function pushPieces(e: Edge, onIt: readonly Junction[], split: Edge[]): void {
  let from = e.a;
  for (const { v } of onIt) {
    if (v !== from) split.push({ a: from, b: v, open: e.open });
    from = v;
  }
  if (from !== e.b) split.push({ a: from, b: e.b, open: e.open });
}

/** Jonctions en T : un sommet sur l'intérieur d'un segment le découpe. */
function splitAtJunctions(
  raw: readonly Edge[],
  xs: readonly number[],
  ys: readonly number[],
  snap: number,
): Edge[] {
  const grid = buildVertexGrid(xs, ys, snap);
  const probe: EdgeProbe = {
    a: 0,
    b: 0,
    ax: 0,
    ay: 0,
    bx: 0,
    by: 0,
    len2: 0,
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
  };
  const split: Edge[] = [];
  for (const e of raw) {
    fillProbe(probe, e, xs, ys, snap);
    const onIt: Junction[] = [];
    collectJunctions(probe, grid, xs, ys, snap, onIt);
    if (!onIt.length) {
      split.push(e);
      continue;
    }
    onIt.sort((p, q) => p.t - q.t);
    pushPieces(e, onIt, split);
  }
  return split;
}

/** Arêtes uniques (deux segments confondus : ouverte si l'un l'est). */
function uniqueEdges(split: readonly Edge[], nv: number): Edge[] {
  const unique = new Map<number, Edge>();
  for (const e of split) {
    const k = e.a < e.b ? e.a * nv + e.b : e.b * nv + e.a;
    const prev = unique.get(k);
    if (!prev) unique.set(k, e);
    else if (e.open) prev.open = true;
  }
  return [...unique.values()];
}

/** Bouts pendants retirés jusqu'à ce qu'il n'en reste plus. */
function pruneDangling(all: Edge[], nv: number): Edge[] {
  let edges = all;
  const degree = new Int32Array(nv);
  for (const e of edges) {
    degree[e.a]! += 1;
    degree[e.b]! += 1;
  }
  for (let changed = true; changed;) {
    changed = false;
    const kept: Edge[] = [];
    for (const e of edges) {
      if (degree[e.a]! > 1 && degree[e.b]! > 1) kept.push(e);
      else {
        degree[e.a]! -= 1;
        degree[e.b]! -= 1;
        changed = true;
      }
    }
    edges = kept;
  }
  return edges;
}

/** Demi-arêtes 2i (a→b) et 2i+1 (b→a), et leur rang angulaire autour de leur origine. */
interface HalfEdges {
  origin: Int32Array;
  around: Map<number, number[]>;
  pos: Int32Array;
}

/** Demi-arêtes triées par angle autour de leur origine. */
function buildHalfEdges(
  edges: readonly Edge[],
  xs: readonly number[],
  ys: readonly number[],
): HalfEdges {
  const h = edges.length * 2;
  const origin = new Int32Array(h);
  const angle = new Float64Array(h);
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    origin[2 * i] = e.a;
    origin[2 * i + 1] = e.b;
    angle[2 * i] = Math.atan2(ys[e.b]! - ys[e.a]!, xs[e.b]! - xs[e.a]!);
    angle[2 * i + 1] = Math.atan2(ys[e.a]! - ys[e.b]!, xs[e.a]! - xs[e.b]!);
  }
  const around = new Map<number, number[]>();
  for (let i = 0; i < h; i++) {
    const list = around.get(origin[i]!);
    if (list) list.push(i);
    else around.set(origin[i]!, [i]);
  }
  const pos = new Int32Array(h);
  for (const list of around.values()) {
    list.sort((p, q) => angle[p]! - angle[q]!);
    list.forEach((he, k) => (pos[he] = k));
  }
  return { origin, around, pos };
}

/** Aire signée (y vers le bas) du cycle de sommets. */
function cycleArea(cycle: readonly number[], xs: readonly number[], ys: readonly number[]): number {
  let area = 0;
  for (let i = 0; i < cycle.length; i++) {
    const p = cycle[i]!;
    const q = cycle[(i + 1) % cycle.length]!;
    area += xs[p]! * ys[q]! - xs[q]! * ys[p]!;
  }
  return area / 2;
}

/** Parcours des faces : à chaque sommet, on tourne au plus serré (face à gauche du parcours). */
function traceFaces(
  edges: readonly Edge[],
  half: HalfEdges,
  xs: readonly number[],
  ys: readonly number[],
): WallRoom[] {
  const origin = half.origin;
  const around = half.around;
  const pos = half.pos;
  const h = origin.length;
  const visited = new Uint8Array(h);
  const rooms: WallRoom[] = [];
  for (let first = 0; first < h; first++) {
    if (visited[first]) continue;
    const cycle: number[] = [];
    let open = false;
    let he = first;
    while (!visited[he]) {
      visited[he] = 1;
      cycle.push(origin[he]!);
      if (edges[he >> 1]!.open) open = true;
      // Demi-arête inverse, puis la précédente dans l'ordre des angles autour de son origine
      const list = around.get(origin[he ^ 1]!)!;
      const back = pos[he ^ 1]!;
      he = list[(back - 1 + list.length) % list.length]!;
    }
    if (he !== first || cycle.length < 3) continue;
    // Les faces bornées sortent positives avec ce parcours
    if (cycleArea(cycle, xs, ys) < MIN_AREA) continue;
    rooms.push({
      id: `walls:${rooms.length}`,
      points: cycle.map((v) => ({ x: xs[v]!, y: ys[v]! })),
      closed: !open,
    });
  }
  return rooms;
}

/**
 * Boucles fermées des segments. `snap` : sommets plus proches fusionnés, et sommet posé à cette
 * distance de l'intérieur d'un segment inséré dedans (jonction en T).
 */
export function detectWallRooms(segments: readonly Segment[], snap = 0.5): WallRoom[] {
  if (!segments.length || segments.length > MAX_EDGES) return [];
  const { xs, ys, raw } = weldSegments(segments, snap);
  const split = splitAtJunctions(raw, xs, ys, snap);
  const edges = pruneDangling(uniqueEdges(split, xs.length), xs.length);
  if (edges.length < 3) return [];
  return traceFaces(edges, buildHalfEdges(edges, xs, ys), xs, ys);
}
