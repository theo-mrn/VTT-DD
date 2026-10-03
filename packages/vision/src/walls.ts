/**
 * Murs préparés pour le balayage angulaire (`sweep.ts`).
 *
 * Le balayage exige un ensemble de segments qui ne se croisent pas : deux segments ne peuvent
 * se toucher qu'en une extrémité commune (même sommet, même indice). Alors l'ordre de deux
 * segments le long d'un rayon ne change jamais pendant qu'ils sont tous deux actifs, et un tas
 * ordonné par « qui est devant » reste valide. La préparation y ramène n'importe quelle donnée :
 *
 * 1. segments bloquants (murs, portes fermées, sens unique, opacité 1) coupés aux bornes de la
 *    carte, plus les quatre bords de la carte ;
 * 2. soudure des extrémités à `snap` près : un sommet partagé a exactement les mêmes
 *    coordonnées, donc le même pseudo-angle bit pour bit, et deux murs soudés ne laissent aucune
 *    fente ;
 * 3. jonctions en T : une extrémité à `snap` près de l'intérieur d'un autre segment le coupe en
 *    ce sommet ; les segments colinéaires qui se recouvrent se découpent ainsi en morceaux
 *    identiques, dédoublonnés ;
 * 4. croisements francs : les deux segments sont coupés au point d'intersection, soudé lui aussi ;
 * 5. répété tant qu'une passe trouve quelque chose (4 passes au plus, la seconde ne trouve
 *    d'ordinaire rien) ;
 * 6. index spatial (grille CSR) et incidence sommet → segments.
 *
 * Les tableaux de travail du balayage sont alloués ici une fois pour toutes : une requête
 * n'alloue que son résultat.
 */
import { clipSegmentToRect, distToSegmentSq, orient } from './geometry.js';
import { buildGrid, Grid, gridDims, visitSegment } from './grid.js';

/** Bloque seulement un observateur à gauche du segment orienté (sens unique). */
export const FLAG_LEFT = 1;
/** Bloque seulement un observateur à droite du segment orienté (sens unique). */
export const FLAG_RIGHT = 2;
/** Bord de la carte. */
export const FLAG_BORDER = 4;

/** Segment bloquant brut, avant soudure. */
export interface RawWall {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  flags: number;
  /** Indice dans `VisionScene.segments`, −1 pour un bord. */
  source: number;
}

export class WallSet {
  readonly width: number;
  readonly height: number;
  /** Tolérance de soudure effective. */
  readonly snap: number;
  /** Distance minimale entre l'origine d'un balayage et un mur (décalage sinon). */
  readonly eps: number;

  readonly vertexCount: number;
  readonly vx: Float64Array;
  readonly vy: Float64Array;

  readonly segCount: number;
  /** Sommets des segments, dans le sens de tracé d'origine (a→b). */
  readonly segA: Int32Array;
  readonly segB: Int32Array;
  readonly segFlags: Uint8Array;
  readonly segSource: Int32Array;
  /** Morceaux des bords de la carte : toujours inclus, ils ferment le polygone. */
  readonly borderSegs: Int32Array;

  /** Incidence : `vertSegs[vertStart[v]..vertStart[v + 1]]` = segments du sommet v. */
  readonly vertStart: Int32Array;
  readonly vertSegs: Int32Array;

  readonly grid: Grid;

  // Tableaux de travail du balayage (réutilisés d'une requête à l'autre).
  stamp = 0;
  readonly vAngle: Float64Array;
  readonly vStamp: Int32Array;
  readonly segStamp: Int32Array;
  readonly segInc: Int32Array;
  readonly segStart: Int32Array;
  readonly segEnd: Int32Array;
  readonly segO: Float64Array;
  readonly wrapList: Int32Array;
  readonly usedList: Int32Array;
  readonly sortKey: Float64Array;
  readonly sortIdx: Int32Array;
  readonly heap: Int32Array;
  readonly heapPos: Int32Array;
  readonly outPts: Float64Array;
  readonly outAng: Float64Array;

  constructor(width: number, height: number, walls: readonly RawWall[], snap: number) {
    this.width = width;
    this.height = height;
    const scale = Math.max(1, width, height);
    this.snap = Math.max(snap, 1e-9 * scale);
    this.eps = 1e-7 * scale;
    const built = buildWalls(width, height, walls, this.snap);
    this.vertexCount = built.vx.length;
    this.vx = built.vx;
    this.vy = built.vy;
    this.segCount = built.segA.length;
    this.segA = built.segA;
    this.segB = built.segB;
    this.segFlags = built.segFlags;
    this.segSource = built.segSource;
    this.grid = built.grid;

    const borders: number[] = [];
    for (let s = 0; s < this.segCount; s++) {
      if ((this.segFlags[s]! & FLAG_BORDER) !== 0) borders.push(s);
    }
    this.borderSegs = Int32Array.from(borders);

    // Incidence sommet → segments.
    const V = this.vertexCount;
    const S = this.segCount;
    const vertStart = new Int32Array(V + 1);
    for (let s = 0; s < S; s++) {
      vertStart[this.segA[s]! + 1]!++;
      vertStart[this.segB[s]! + 1]!++;
    }
    for (let v = 0; v < V; v++) vertStart[v + 1]! += vertStart[v]!;
    const vertSegs = new Int32Array(vertStart[V]!);
    const fill = vertStart.slice(0, V);
    for (let s = 0; s < S; s++) {
      vertSegs[fill[this.segA[s]!]!++] = s;
      vertSegs[fill[this.segB[s]!]!++] = s;
    }
    this.vertStart = vertStart;
    this.vertSegs = vertSegs;

    this.vAngle = new Float64Array(V);
    this.vStamp = new Int32Array(V);
    this.segStamp = new Int32Array(S);
    this.segInc = new Int32Array(S);
    this.segStart = new Int32Array(S);
    this.segEnd = new Int32Array(S);
    this.segO = new Float64Array(S);
    this.wrapList = new Int32Array(S);
    this.usedList = new Int32Array(V);
    this.sortKey = new Float64Array(V);
    this.sortIdx = new Int32Array(V);
    this.heap = new Int32Array(S);
    this.heapPos = new Int32Array(S).fill(-1);
    // Au plus deux points par lot d'angle, un lot par sommet.
    this.outPts = new Float64Array(4 * V + 8);
    this.outAng = new Float64Array(2 * V + 4);
  }

  /** Nouveau tampon de requête (les tableaux marqués d'un ancien tampon sont périmés). */
  nextStamp(): number {
    if (this.stamp >= 0x3fffffff) {
      this.stamp = 0;
      this.vStamp.fill(0);
      this.segStamp.fill(0);
      this.segInc.fill(0);
    }
    return ++this.stamp;
  }

  /** Vrai si un segment bloquant passe à moins de `r` du point. */
  isNear(x: number, y: number, r: number): boolean {
    const g = this.grid;
    const c1 = g.col(x - r);
    const c2 = g.col(x + r);
    const r1 = g.row(y - r);
    const r2 = g.row(y + r);
    const r2max = r * r;
    for (let row = r1; row <= r2; row++) {
      for (let col = c1; col <= c2; col++) {
        const cell = row * g.cols + col;
        for (let k = g.start[cell]!, end = g.start[cell + 1]!; k < end; k++) {
          const s = g.items[k]!;
          const a = this.segA[s]!;
          const b = this.segB[s]!;
          const d = distToSegmentSq(x, y, this.vx[a]!, this.vy[a]!, this.vx[b]!, this.vy[b]!);
          if (d < r2max) return true;
        }
      }
    }
    return false;
  }
}

interface BuiltWalls {
  vx: Float64Array;
  vy: Float64Array;
  segA: Int32Array;
  segB: Int32Array;
  segFlags: Uint8Array;
  segSource: Int32Array;
  grid: Grid;
}

/** Tableau de nombres qui grandit (évite les `number[]` mixtes dans les boucles). */
class F64List {
  data: Float64Array;
  length = 0;
  constructor(capacity: number) {
    this.data = new Float64Array(Math.max(16, capacity));
  }
  push(v: number) {
    if (this.length === this.data.length) {
      const next = new Float64Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = v;
  }
}

class I32List {
  data: Int32Array;
  length = 0;
  constructor(capacity: number) {
    this.data = new Int32Array(Math.max(16, capacity));
  }
  push(v: number) {
    if (this.length === this.data.length) {
      const next = new Int32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = v;
  }
}

/** Segments en cours de construction (tableaux parallèles qui grandissent). */
class SegList {
  a: Int32Array;
  b: Int32Array;
  flags: Int32Array;
  source: Int32Array;
  /** 1 : morceau créé par la dernière découpe, à revérifier ; 0 : déjà vérifié. */
  dirty: Uint8Array;
  length = 0;

  constructor(capacity: number) {
    const c = Math.max(16, capacity);
    this.a = new Int32Array(c);
    this.b = new Int32Array(c);
    this.flags = new Int32Array(c);
    this.source = new Int32Array(c);
    this.dirty = new Uint8Array(c);
  }

  push(a: number, b: number, flags: number, source: number, dirty: number) {
    if (this.length === this.a.length) {
      const grow = <T extends Int32Array | Uint8Array>(arr: T): T => {
        const next = new (arr.constructor as new (n: number) => T)(arr.length * 2);
        next.set(arr);
        return next;
      };
      this.a = grow(this.a);
      this.b = grow(this.b);
      this.flags = grow(this.flags);
      this.source = grow(this.source);
      this.dirty = grow(this.dirty);
    }
    const n = this.length++;
    this.a[n] = a;
    this.b[n] = b;
    this.flags[n] = flags;
    this.source[n] = source;
    this.dirty[n] = dirty;
  }
}

/** Soudure, découpe et index : voir l'en-tête du fichier. */
function buildWalls(
  width: number,
  height: number,
  walls: readonly RawWall[],
  snap: number,
): BuiltWalls {
  // 1. Segments coupés aux bornes, puis les quatre bords.
  const clip = new Float64Array(4);
  const ex = new F64List(walls.length * 4 + 16);
  const flags0: number[] = [];
  const source0: number[] = [];
  for (const w of walls) {
    if (!clipSegmentToRect(w.ax, w.ay, w.bx, w.by, 0, 0, width, height, clip)) continue;
    ex.push(clip[0]!);
    ex.push(clip[1]!);
    ex.push(clip[2]!);
    ex.push(clip[3]!);
    flags0.push(w.flags);
    source0.push(w.source);
  }
  const corners = [0, 0, width, 0, width, height, 0, height];
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4;
    ex.push(corners[2 * k]!);
    ex.push(corners[2 * k + 1]!);
    ex.push(corners[2 * j]!);
    ex.push(corners[2 * j + 1]!);
    flags0.push(FLAG_BORDER);
    source0.push(-1);
  }
  const rawCount = flags0.length;

  // 2. Soudure des extrémités : un sommet par groupe d'extrémités à `snap` près (le plus proche
  // des sommets déjà créés, dans l'ordre des données : résultat déterministe).
  const pts = ex.data;
  const epCount = rawCount * 2;
  const vx = new F64List(epCount + 16);
  const vy = new F64List(epCount + 16);
  const vertexOf = weldPoints(width, height, pts, epCount, snap, vx, vy, 0);

  let segs = new SegList(rawCount);
  for (let i = 0; i < rawCount; i++) {
    const a = vertexOf[2 * i]!;
    const b = vertexOf[2 * i + 1]!;
    if (a === b) continue; // segment nul (plus court que la tolérance)
    segs.push(a, b, flags0[i]!, source0[i]!, 1);
  }
  segs = dedupe(segs, vx.length);

  // 3 à 5. Jonctions en T et croisements, jusqu'à stabilité. Après une découpe, seules les
  // paires qui touchent un morceau neuf sont revérifiées (les autres n'ont pas changé).
  let grid = segmentGrid(width, height, vx.data, vy.data, segs, snap);
  for (let pass = 0; pass < 4; pass++) {
    const found = findSplits(grid, vx, vy, segs, snap, width, height);
    if (!found) break;
    segs = dedupe(applySplits(found, vx.data, vy.data, segs), vx.length);
    grid = segmentGrid(width, height, vx.data, vy.data, segs, snap);
  }

  const S = segs.length;
  const flagsOut = new Uint8Array(S);
  for (let s = 0; s < S; s++) flagsOut[s] = segs.flags[s]!;
  return {
    vx: vx.data.slice(0, vx.length),
    vy: vy.data.slice(0, vy.length),
    segA: segs.a.slice(0, S),
    segB: segs.b.slice(0, S),
    segFlags: flagsOut,
    segSource: segs.source.slice(0, S),
    grid,
  };
}

/**
 * Soude `count` points (`pts` à plat) : chaque point reçoit l'indice du sommet le plus proche à
 * moins de `snap` (sommets existants `0..fixedCount − 1`, puis ceux créés pour les points
 * précédents), sinon un nouveau sommet.
 */
function weldPoints(
  width: number,
  height: number,
  pts: Float64Array,
  count: number,
  snap: number,
  vx: F64List,
  vy: F64List,
  fixedCount: number,
): Int32Array {
  const total = fixedCount + count;
  const X = vx.data;
  const Y = vy.data;
  const px = (k: number) => (k < fixedCount ? X[k]! : pts[2 * (k - fixedCount)]!);
  const py = (k: number) => (k < fixedCount ? Y[k]! : pts[2 * (k - fixedCount) + 1]!);
  const dims = gridDims(width + 2 * snap, height + 2 * snap, total, 2, 1024, 4 * snap);
  const grid = buildGrid(-snap, -snap, dims.cell, dims.cols, dims.rows, total, (k, emit) => {
    emit(dimsRow(dims, -snap, py(k)) * dims.cols + dimsCol(dims, -snap, px(k)));
  });
  // Sommet de chaque point : les fixes sont eux-mêmes, les autres à déterminer.
  const vertexOfAll = new Int32Array(total).fill(-1);
  for (let k = 0; k < fixedCount; k++) vertexOfAll[k] = k;
  for (let k = fixedCount; k < total; k++) {
    const x = px(k);
    const y = py(k);
    let found = nearestWelded(grid, vertexOfAll, vx, vy, x, y, snap);
    if (found < 0) {
      found = vx.length;
      vx.push(x);
      vy.push(y);
    }
    vertexOfAll[k] = found;
  }
  return vertexOfAll.slice(fixedCount);
}

/** Le sommet `vj` à distance² `d` bat-il le meilleur actuel (à égalité, le plus ancien) ? */
function closerVertex(d: number, vj: number, bestD: number, found: number): boolean {
  return d < bestD || (d === bestD && vj < found);
}

/**
 * Sommet déjà attribué le plus proche de (x, y) à moins de `snap` (à égalité, le plus ancien),
 * −1 s'il n'y en a pas.
 */
function nearestWelded(
  grid: Grid,
  vertexOfAll: Int32Array,
  vx: F64List,
  vy: F64List,
  x: number,
  y: number,
  snap: number,
): number {
  const snap2 = snap * snap;
  let found = -1;
  let bestD = Infinity;
  const c1 = grid.col(x - snap);
  const c2 = grid.col(x + snap);
  const r1 = grid.row(y - snap);
  const r2 = grid.row(y + snap);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = r * grid.cols + c;
      for (let e = grid.start[cell]!, end = grid.start[cell + 1]!; e < end; e++) {
        const vj = vertexOfAll[grid.items[e]!]!;
        if (vj < 0) continue; // pas encore traité
        const dx = vx.data[vj]! - x;
        const dy = vy.data[vj]! - y;
        const d = dx * dx + dy * dy;
        if (d <= snap2 && closerVertex(d, vj, bestD, found)) {
          bestD = d;
          found = vj;
        }
      }
    }
  }
  return found;
}

function dimsCol(dims: { cell: number; cols: number }, min: number, x: number) {
  const c = Math.floor((x - min) / dims.cell);
  return Math.min(Math.max(c, 0), dims.cols - 1);
}

function dimsRow(dims: { cell: number; rows: number }, min: number, y: number) {
  const r = Math.floor((y - min) / dims.cell);
  return Math.min(Math.max(r, 0), dims.rows - 1);
}

function segmentGrid(
  width: number,
  height: number,
  vx: Float64Array,
  vy: Float64Array,
  segs: SegList,
  snap: number,
): Grid {
  const S = segs.length;
  const dims = gridDims(width, height, S, 2, 512, 4 * snap);
  const margin = snap * 1.5;
  // Grille vide qui ne sert qu'à calculer les cases pendant la construction.
  const shell = new Grid(
    0,
    0,
    dims.cell,
    dims.cols,
    dims.rows,
    new Int32Array(1),
    new Int32Array(0),
  );
  const A = segs.a;
  const B = segs.b;
  return buildGrid(0, 0, dims.cell, dims.cols, dims.rows, S, (s, emit) => {
    const a = A[s]!;
    const b = B[s]!;
    visitSegment(shell, vx[a]!, vy[a]!, vx[b]!, vy[b]!, margin, emit);
  });
}

interface Splits {
  /** Pour chaque segment coupé : les sommets où le couper. */
  bySeg: Map<number, number[]>;
}

function addSplit(splits: Map<number, number[]>, s: number, v: number) {
  const list = splits.get(s);
  if (list) {
    if (!list.includes(v)) list.push(v);
  } else splits.set(s, [v]);
}

/**
 * Le sommet v est-il sur l'intérieur du segment [a, b], à `snap` près (et à plus de `snap` de
 * ses extrémités) ?
 */
function onInterior(
  X: Float64Array,
  Y: Float64Array,
  v: number,
  a: number,
  b: number,
  snap2: number,
): boolean {
  const px = X[v]!;
  const py = Y[v]!;
  const ax = X[a]!;
  const ay = Y[a]!;
  const bx = X[b]!;
  const by = Y[b]!;
  if (distToSegmentSq(px, py, ax, ay, bx, by) > snap2) return false;
  const dxa = px - ax;
  const dya = py - ay;
  const dxb = px - bx;
  const dyb = py - by;
  return dxa * dxa + dya * dya > snap2 && dxb * dxb + dyb * dyb > snap2;
}

/** Cases d'un segment, collectées dans un tampon réutilisé. */
let cellBuf = new Int32Array(256);
let cellCount = 0;
function collectCell(c: number) {
  if (cellCount === cellBuf.length) {
    const next = new Int32Array(cellBuf.length * 2);
    next.set(cellBuf);
    cellBuf = next;
  }
  cellBuf[cellCount++] = c;
}

/** Recherche de coupes en cours : sommets, segments, boîtes élargies et coupes trouvées. */
interface SplitSearch {
  X: Float64Array;
  Y: Float64Array;
  A: Int32Array;
  B: Int32Array;
  dirty: Uint8Array;
  minX: Float64Array;
  minY: Float64Array;
  maxX: Float64Array;
  maxY: Float64Array;
  /** Dernier segment i pour lequel la paire (i, j) a été vue. */
  pairStamp: Int32Array;
  snap2: number;
  bySeg: Map<number, number[]>;
  /** Croisements : points à souder ensuite, avec leurs deux segments. */
  crossPts: F64List;
  crossSegs: number[];
}

/** État initial de la recherche, boîtes englobantes élargies de snap comprises. */
function newSplitSearch(vx: F64List, vy: F64List, segs: SegList, snap: number): SplitSearch {
  const S = segs.length;
  const X = vx.data;
  const Y = vy.data;
  const A = segs.a;
  const B = segs.b;
  const minX = new Float64Array(S);
  const minY = new Float64Array(S);
  const maxX = new Float64Array(S);
  const maxY = new Float64Array(S);
  for (let s = 0; s < S; s++) {
    const ax = X[A[s]!]!;
    const ay = Y[A[s]!]!;
    const bx = X[B[s]!]!;
    const by = Y[B[s]!]!;
    minX[s] = (ax < bx ? ax : bx) - snap;
    maxX[s] = (ax < bx ? bx : ax) + snap;
    minY[s] = (ay < by ? ay : by) - snap;
    maxY[s] = (ay < by ? by : ay) + snap;
  }
  return {
    X,
    Y,
    A,
    B,
    dirty: segs.dirty,
    minX,
    minY,
    maxX,
    maxY,
    pairStamp: new Int32Array(S).fill(-1),
    snap2: snap * snap,
    bySeg: new Map<number, number[]>(),
    crossPts: new F64List(64),
    crossSegs: [],
  };
}

/** Les boîtes élargies des segments i et j se touchent-elles ? */
function boxesTouch(q: SplitSearch, i: number, j: number): boolean {
  if (q.maxX[i]! < q.minX[j]! || q.maxX[j]! < q.minX[i]! || q.maxY[i]! < q.minY[j]!) return false;
  return !(q.maxY[j]! < q.minY[i]!);
}

/** Jonctions en T entre les segments i et j, notées dans les coupes ; vrai si l'une est trouvée. */
function addTJunctions(q: SplitSearch, i: number, j: number): boolean {
  const X = q.X;
  const Y = q.Y;
  const a = q.A[i]!;
  const b = q.B[i]!;
  const c = q.A[j]!;
  const d = q.B[j]!;
  let touched = false;
  if (c !== a && c !== b && onInterior(X, Y, c, a, b, q.snap2)) {
    addSplit(q.bySeg, i, c);
    touched = true;
  }
  if (d !== a && d !== b && onInterior(X, Y, d, a, b, q.snap2)) {
    addSplit(q.bySeg, i, d);
    touched = true;
  }
  if (a !== c && a !== d && onInterior(X, Y, a, c, d, q.snap2)) {
    addSplit(q.bySeg, j, a);
    touched = true;
  }
  if (b !== c && b !== d && onInterior(X, Y, b, c, d, q.snap2)) {
    addSplit(q.bySeg, j, b);
    touched = true;
  }
  return touched;
}

/** Orientations strictement opposées (de part et d'autre de la droite) ? */
function opposite(o1: number, o2: number): boolean {
  return (o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0);
}

/** Croisement franc des segments i et j : point noté pour la soudure, avec ses deux segments. */
function addCrossing(q: SplitSearch, i: number, j: number): void {
  const X = q.X;
  const Y = q.Y;
  const ax = X[q.A[i]!]!;
  const ay = Y[q.A[i]!]!;
  const bx = X[q.B[i]!]!;
  const by = Y[q.B[i]!]!;
  const cx = X[q.A[j]!]!;
  const cy = Y[q.A[j]!]!;
  const dx = X[q.B[j]!]!;
  const dy = Y[q.B[j]!]!;
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  if (!opposite(o1, o2)) return;
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  if (!opposite(o3, o4)) return;
  // t le long de [a, b], rapport des distances signées à la droite cd.
  const t = o3 / (o3 - o4);
  q.crossPts.push(ax + t * (bx - ax));
  q.crossPts.push(ay + t * (by - ay));
  q.crossSegs.push(i, j);
}

/** Teste la paire (i, j) : jonctions en T, sinon croisement franc s'ils ne partagent aucun sommet. */
function checkPair(q: SplitSearch, i: number, j: number): void {
  if (!boxesTouch(q, i, j)) return;
  if (addTJunctions(q, i, j)) return;
  const a = q.A[i]!;
  const b = q.B[i]!;
  const c = q.A[j]!;
  const d = q.B[j]!;
  if (a === c || a === d || b === c || b === d) return;
  addCrossing(q, i, j);
}

/** Paires du segment i avec ses voisins de grille, chacune testée une fois. */
function scanSegment(q: SplitSearch, grid: Grid, i: number, margin: number): void {
  const a = q.A[i]!;
  const b = q.B[i]!;
  cellCount = 0;
  visitSegment(grid, q.X[a]!, q.Y[a]!, q.X[b]!, q.Y[b]!, margin, collectCell);
  for (let ci = 0; ci < cellCount; ci++) {
    const cell = cellBuf[ci]!;
    for (let k = grid.start[cell]!, end = grid.start[cell + 1]!; k < end; k++) {
      const j = grid.items[k]!;
      // Paire déjà vue, ou vue depuis j (j à revérifier et plus petit).
      if (j === i || q.pairStamp[j] === i || (q.dirty[j] === 1 && j < i)) continue;
      q.pairStamp[j] = i;
      checkPair(q, i, j);
    }
  }
}

/** Soudure des points de croisement aux sommets existants (et entre eux), puis coupes. */
function weldCrossings(
  q: SplitSearch,
  vx: F64List,
  vy: F64List,
  snap: number,
  width: number,
  height: number,
): void {
  const crossCount = q.crossSegs.length >> 1;
  if (crossCount === 0) return;
  const vOf = weldPoints(width, height, q.crossPts.data, crossCount, snap, vx, vy, vx.length);
  for (let k = 0; k < crossCount; k++) {
    const v = vOf[k]!;
    const i = q.crossSegs[2 * k]!;
    const j = q.crossSegs[2 * k + 1]!;
    if (v !== q.A[i] && v !== q.B[i]) addSplit(q.bySeg, i, v);
    if (v !== q.A[j] && v !== q.B[j]) addSplit(q.bySeg, j, v);
  }
}

/**
 * Cherche les jonctions en T et les croisements francs entre segments voisins (mêmes cases de
 * la grille, boîtes englobantes qui se touchent, chaque paire testée une fois, au moins un des
 * deux segments à revérifier). Rend null si rien n'est à couper.
 */
function findSplits(
  grid: Grid,
  vx: F64List,
  vy: F64List,
  segs: SegList,
  snap: number,
  width: number,
  height: number,
): Splits | null {
  const q = newSplitSearch(vx, vy, segs, snap);
  const margin = snap * 1.5;
  for (let i = 0; i < segs.length; i++) {
    if (q.dirty[i] === 0) continue;
    scanSegment(q, grid, i, margin);
  }
  weldCrossings(q, vx, vy, snap, width, height);
  return q.bySeg.size > 0 ? { bySeg: q.bySeg } : null;
}

/**
 * Coupe chaque segment en ses sommets de coupe, rangés le long du segment. Les morceaux sont à
 * revérifier ; les segments intacts ne le sont plus.
 */
function applySplits(splits: Splits, X: Float64Array, Y: Float64Array, segs: SegList): SegList {
  const S = segs.length;
  const out = new SegList(S + splits.bySeg.size * 2);
  for (let s = 0; s < S; s++) {
    const a = segs.a[s]!;
    const b = segs.b[s]!;
    const f = segs.flags[s]!;
    const src = segs.source[s]!;
    const list = splits.bySeg.get(s);
    if (!list) {
      out.push(a, b, f, src, 0);
      continue;
    }
    // Paramètre de chaque sommet de coupe le long de a→b (projection), puis tri.
    const ax = X[a]!;
    const ay = Y[a]!;
    const ex = X[b]! - ax;
    const ey = Y[b]! - ay;
    const len2 = ex * ex + ey * ey;
    const withT = list.map((v) => ({ v, t: ((X[v]! - ax) * ex + (Y[v]! - ay) * ey) / len2 }));
    withT.sort((p, q) => p.t - q.t || p.v - q.v);
    let prev = a;
    for (const { v } of withT) {
      if (v === prev || v === b) continue;
      out.push(prev, v, f, src, 1);
      prev = v;
    }
    if (prev !== b) out.push(prev, b, f, src, 1);
  }
  return out;
}

/**
 * Retire les doublons exacts (mêmes sommets, même comportement). Un sens unique b→a qui bloque
 * à gauche vaut un sens unique a→b qui bloque à droite. Un mur à double face rend inutiles les
 * sens uniques et bords identiques qui le suivent ; un sens unique suivi d'un mur identique est
 * gardé (sans effet : le mur le couvre).
 */
function dedupe(segs: SegList, V: number): SegList {
  const S = segs.length;
  const seen = new Map<number, number>();
  const out = new SegList(S);
  for (let s = 0; s < S; s++) {
    const a = segs.a[s]!;
    const b = segs.b[s]!;
    const f = segs.flags[s]!;
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    const key = lo * V + hi;
    // Classe de comportement : 1 double face, 2 bloque à gauche de lo→hi, 4 à droite.
    let cls = 1;
    if ((f & (FLAG_LEFT | FLAG_RIGHT)) !== 0) {
      const left = (f & FLAG_LEFT) !== 0;
      cls = left === (a === lo) ? 2 : 4;
    }
    const mask = seen.get(key) ?? 0;
    if ((mask & 1) !== 0 || (mask & cls) !== 0) continue;
    seen.set(key, mask | cls);
    out.push(a, b, f, segs.source[s]!, segs.dirty[s]!);
  }
  return out;
}
