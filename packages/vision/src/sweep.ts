/**
 * Polygone de vue par balayage angulaire (algorithme d'Asano), en O(n log n).
 *
 * Principe. Depuis l'origine O, chaque segment actif couvre un intervalle de pseudo-angles
 * [début, fin] (moins d'un demi-tour, O n'étant sur aucun segment). On trie les sommets par
 * angle, puis on tourne : à chaque angle, on retire les segments qui finissent, on ajoute ceux
 * qui commencent, et le segment le plus proche de O (sommet d'un tas) borde la vue jusqu'à
 * l'angle suivant. Quand le plus proche change, on émet deux points sur le rayon de cet angle :
 * le point du précédent, puis celui du nouveau (un seul s'ils sont égaux : coin soudé).
 *
 * Pourquoi c'est sûr :
 * - les segments ne se croisent pas (`walls.ts`), donc l'ordre de deux segments le long d'un
 *   rayon ne change pas tant qu'ils sont actifs : le tas reste ordonné ;
 * - l'intervalle d'un segment est tiré des pseudo-angles de ses deux sommets, et deux segments
 *   soudés partagent un sommet, donc exactement le même angle : une chaîne de murs soudés couvre
 *   ses angles sans le moindre trou, quels que soient les arrondis. Aucune fuite possible ;
 * - tous les événements d'un même angle (valeur identique bit pour bit) sont traités en un lot :
 *   retraits, puis ajouts ; les points colinéaires avec O et les sommets pile sur un rayon ne
 *   produisent ni pointe ni doublon ;
 * - « qui est devant » ne dépend pas de l'angle courant : on regarde de quel côté de la droite de
 *   l'un se trouve l'autre, et de quel côté se trouve O. Repli (cas presque dégénérés) : la
 *   distance le long d'un rayon de référence au milieu de l'intervalle en cours ; égalité :
 *   l'indice. Le calcul est canonique (plus petit indice d'abord), donc antisymétrique ;
 * - les bords de la carte sont des murs : le polygone est fermé et borné, et deux angles
 *   consécutifs sont toujours à moins d'un demi-tour.
 *
 * Observateur sur un mur ou une extrémité : l'origine est décalée d'un epsilon, dans la première
 * de 16 directions fixes qui l'éloigne de tout mur (déterministe). Hors de la carte : ramenée
 * dedans.
 */
import { orient, pseudoAngle } from './geometry.js';
import { FLAG_LEFT, FLAG_RIGHT, type WallSet } from './walls.js';

/** Polygone étoilé autour de son origine, avec l'angle de chaque sommet (tests en O(log n)). */
export interface StarPolygon {
  /** Origine effective du balayage (après décalage éventuel). */
  readonly ox: number;
  readonly oy: number;
  /** Sommets à plat, en ordre angulaire croissant. */
  readonly points: Float64Array;
  /** Pseudo-angle (autour de l'origine) de chaque sommet, croissant au sens large. */
  readonly angles: Float64Array;
  readonly count: number;
}

// Directions de décalage de l'origine : angle d'or à partir de 0,3 rad (jamais parallèle aux
// axes, où sont la plupart des murs).
const SHIFT_COS = new Float64Array(16);
const SHIFT_SIN = new Float64Array(16);
for (let k = 0; k < 16; k++) {
  const a = 0.3 + k * 2.399963229728653;
  SHIFT_COS[k] = Math.cos(a);
  SHIFT_SIN[k] = Math.sin(a);
}

let originX = 0;
let originY = 0;

/**
 * Origine effective d'un balayage depuis (px, py) : ramenée dans la carte, puis décalée si elle
 * est à moins de `eps` d'un mur. Résultat dans `originX`, `originY`.
 */
function effectiveOrigin(walls: WallSet, px: number, py: number) {
  const e = walls.eps;
  const W = walls.width;
  const H = walls.height;
  // Ramené à 2e des bords ; au centre si la scène est trop étroite pour cette marge
  const clampAxis = (v: number, size: number) =>
    size <= 4 * e ? size / 2 : Math.min(Math.max(v, 2 * e), size - 2 * e);
  let x = Number.isFinite(px) ? clampAxis(px, W) : W / 2;
  let y = Number.isFinite(py) ? clampAxis(py, H) : H / 2;
  if (walls.isNear(x, y, e)) {
    for (let k = 0; k < 16; k++) {
      const m = 4 * e * (1 + (k >> 3));
      const cx = clampAxis(x + m * SHIFT_COS[k]!, W);
      const cy = clampAxis(y + m * SHIFT_SIN[k]!, H);
      if (!walls.isNear(cx, cy, e)) {
        x = cx;
        y = cy;
        break;
      }
    }
  }
  originX = x;
  originY = y;
}

/** Origine effective d'un balayage depuis (px, py) (voir `effectiveOrigin`). */
export function resolveOrigin(walls: WallSet, px: number, py: number): { x: number; y: number } {
  effectiveOrigin(walls, px, py);
  return { x: originX, y: originY };
}

// ─── Contexte du balayage en cours (variables de module : aucune fermeture dans les boucles) ──

let cvx: Float64Array = new Float64Array(0);
let cvy: Float64Array = new Float64Array(0);
let csa: Int32Array = new Int32Array(0);
let csb: Int32Array = new Int32Array(0);
let cso: Float64Array = new Float64Array(0);
let cox = 0;
let coy = 0;
/** Tampon de la requête en cours. */
let cq = 0;
/** Nombre de sommets retenus (`usedList`) et de segments à cheval sur l'angle 0 (`wrapList`). */
let nUsed = 0;
let nWrap = 0;
/**
 * Rayon de référence pour le repli du comparateur : bissectrice des directions vers les
 * sommets `refV1` et `refV2`, calculée seulement quand le repli sert (rare).
 */
let refV1 = 0;
let refV2 = 0;
let refReady = false;
let crx = 1;
let cry = 0;
let heap: Int32Array = new Int32Array(0);
let hpos: Int32Array = new Int32Array(0);
let hsize = 0;
/** Point calculé par `rayHit`. */
let hitX = 0;
let hitY = 0;
/** Bornes rendues par `partitionPairs`. */
let partI = 0;
let partJ = 0;

/** Verdict de `sideVerdict` quand les côtés ne tranchent pas. */
const UNDECIDED = 2;

/** Distance (paramètre) de O à la droite du segment s le long du rayon de référence. */
function rayParam(s: number): number {
  if (!refReady) computeReference();
  const a = csa[s]!;
  const b = csb[s]!;
  const ax = cvx[a]!;
  const ay = cvy[a]!;
  const ex = cvx[b]! - ax;
  const ey = cvy[b]! - ay;
  const den = crx * ey - cry * ex;
  if (den === 0) return Infinity;
  const t = ((ax - cox) * ey - (ay - coy) * ex) / den;
  return t < 0 ? Infinity : t;
}

/**
 * Côtés (`o1`, `o2`) des extrémités de t par rapport à la droite de s, O étant du côté `oS` :
 * 1 si t est devant, −1 s'il est derrière, 0 si colinéaires, `UNDECIDED` sinon.
 */
function sideVerdict(o1: number, o2: number, oS: number): number {
  if (o1 === 0 && o2 === 0) return 0;
  if (oS === 0) return UNDECIDED;
  if (o1 >= 0 && o2 >= 0) return oS > 0 ? 1 : -1;
  if (o1 <= 0 && o2 <= 0) return oS < 0 ? 1 : -1;
  return UNDECIDED;
}

/**
 * Qui est devant, de s ou de t (tous deux actifs, sans croisement) : < 0 si s est devant, > 0
 * si t est devant, 0 si indécidable (colinéaires). Si t est entièrement du côté de O par
 * rapport à la droite de s, t est devant ; entièrement de l'autre côté, derrière. Sinon, on
 * inverse les rôles. Une extrémité commune donne un produit exactement nul et ne compte pas.
 */
function front(s: number, t: number): number {
  const sa = csa[s]!;
  const sb = csb[s]!;
  const ta = csa[t]!;
  const tb = csb[t]!;
  const sax = cvx[sa]!;
  const say = cvy[sa]!;
  const sbx = cvx[sb]!;
  const sby = cvy[sb]!;
  const tax = cvx[ta]!;
  const tay = cvy[ta]!;
  const tbx = cvx[tb]!;
  const tby = cvy[tb]!;
  const o1 = orient(sax, say, sbx, sby, tax, tay);
  const o2 = orient(sax, say, sbx, sby, tbx, tby);
  const byS = sideVerdict(o1, o2, cso[s]!);
  if (byS !== UNDECIDED) return byS;
  const p1 = orient(tax, tay, tbx, tby, sax, say);
  const p2 = orient(tax, tay, tbx, tby, sbx, sby);
  const byT = sideVerdict(p1, p2, cso[t]!);
  if (byT === 0) return 0;
  if (byT !== UNDECIDED) return -byT;
  const ds = rayParam(s);
  const dt = rayParam(t);
  if (ds < dt) return -1;
  return ds > dt ? 1 : 0;
}

/** Ordre total du tas : devant d'abord, puis plus petit indice. */
function less(s: number, t: number): boolean {
  const f = s < t ? front(s, t) : -front(t, s);
  return f < 0 || (f === 0 && s < t);
}

function siftUp(i: number) {
  const s = heap[i]!;
  while (i > 0) {
    const p = (i - 1) >> 1;
    const ps = heap[p]!;
    if (!less(s, ps)) break;
    heap[i] = ps;
    hpos[ps] = i;
    i = p;
  }
  heap[i] = s;
  hpos[s] = i;
}

function siftDown(i: number) {
  const s = heap[i]!;
  for (;;) {
    let c = 2 * i + 1;
    if (c >= hsize) break;
    const r = c + 1;
    if (r < hsize && less(heap[r]!, heap[c]!)) c = r;
    const cs = heap[c]!;
    if (!less(cs, s)) break;
    heap[i] = cs;
    hpos[cs] = i;
    i = c;
  }
  heap[i] = s;
  hpos[s] = i;
}

function heapInsert(s: number) {
  heap[hsize] = s;
  hpos[s] = hsize;
  hsize++;
  siftUp(hsize - 1);
}

function heapRemove(s: number) {
  const i = hpos[s]!;
  if (i < 0) return;
  hpos[s] = -1;
  hsize--;
  if (i === hsize) return;
  const last = heap[hsize]!;
  heap[i] = last;
  hpos[last] = i;
  siftUp(i);
  siftDown(hpos[last]!);
}

/** Tri en place de (clé, indice) par clé croissante puis indice : résultat unique. */
function sortPairs(keys: Float64Array, idx: Int32Array, lo: number, hi: number): void {
  while (hi - lo > 16) {
    partitionPairs(keys, idx, lo, hi);
    const i = partI;
    const j = partJ;
    if (j - lo < hi - i) {
      sortPairs(keys, idx, lo, j);
      lo = i;
    } else {
      sortPairs(keys, idx, i, hi);
      hi = j;
    }
  }
  insertionSortPairs(keys, idx, lo, hi);
}

/** Médiane de trois (lo, milieu, hi) ramenée au milieu, puis partition autour d'elle. */
function partitionPairs(keys: Float64Array, idx: Int32Array, lo: number, hi: number): void {
  const mid = (lo + hi) >>> 1;
  if (before(keys, idx, mid, lo)) swap(keys, idx, mid, lo);
  if (before(keys, idx, hi, lo)) swap(keys, idx, hi, lo);
  if (before(keys, idx, hi, mid)) swap(keys, idx, hi, mid);
  const pk = keys[mid]!;
  const pi = idx[mid]!;
  let i = lo;
  let j = hi;
  while (i <= j) {
    while (keys[i]! < pk || (keys[i] === pk && idx[i]! < pi)) i++;
    while (keys[j]! > pk || (keys[j] === pk && idx[j]! > pi)) j--;
    if (i <= j) {
      swap(keys, idx, i, j);
      i++;
      j--;
    }
  }
  partI = i;
  partJ = j;
}

/** Tri par insertion de (clé, indice) sur [lo, hi]. */
function insertionSortPairs(keys: Float64Array, idx: Int32Array, lo: number, hi: number): void {
  for (let i = lo + 1; i <= hi; i++) {
    const k = keys[i]!;
    const x = idx[i]!;
    let j = i - 1;
    while (j >= lo && (keys[j]! > k || (keys[j] === k && idx[j]! > x))) {
      keys[j + 1] = keys[j]!;
      idx[j + 1] = idx[j]!;
      j--;
    }
    keys[j + 1] = k;
    idx[j + 1] = x;
  }
}

function before(keys: Float64Array, idx: Int32Array, i: number, j: number) {
  const a = keys[i]!;
  const b = keys[j]!;
  return a < b || (a === b && idx[i]! < idx[j]!);
}

function swap(keys: Float64Array, idx: Int32Array, i: number, j: number) {
  const k = keys[i]!;
  keys[i] = keys[j]!;
  keys[j] = k;
  const x = idx[i]!;
  idx[i] = idx[j]!;
  idx[j] = x;
}

/** Le segment de drapeaux `f` bloque-t-il l'observateur du côté `o` (sens unique : gauche si o < 0) ? */
function blocksFrom(f: number, o: number): boolean {
  if ((f & FLAG_LEFT) !== 0) return o < 0;
  if ((f & FLAG_RIGHT) !== 0) return o > 0;
  return true;
}

/** Pseudo-angle du sommet v (en x, y) autour de O, calculé une fois par requête. */
function stampVertex(walls: WallSet, v: number, x: number, y: number): void {
  if (walls.vStamp[v] === cq) return;
  walls.vStamp[v] = cq;
  walls.vAngle[v] = pseudoAngle(x - cox, y - coy);
  walls.usedList[nUsed++] = v;
}

/** Retient le segment s s'il bloque la vue depuis O et couvre un intervalle d'angles non nul. */
function consider(walls: WallSet, s: number): void {
  const segStamp = walls.segStamp;
  if (segStamp[s] === cq) return;
  segStamp[s] = cq;
  const vx = walls.vx;
  const vy = walls.vy;
  const a = walls.segA[s]!;
  const b = walls.segB[s]!;
  const ax = vx[a]!;
  const ay = vy[a]!;
  const bx = vx[b]!;
  const by = vy[b]!;
  const o = orient(ax, ay, bx, by, cox, coy);
  if (!blocksFrom(walls.segFlags[s]!, o)) return;
  stampVertex(walls, a, ax, ay);
  stampVertex(walls, b, bx, by);
  const vAngle = walls.vAngle;
  const pa = vAngle[a]!;
  const pb = vAngle[b]!;
  let d = pb - pa;
  if (d > 2) d -= 4;
  else if (d < -2) d += 4;
  // De profil (d nul) ou passant par O (d = ±2) : aucune surface à couvrir.
  if (d === 0 || d >= 2 || d <= -2) return;
  const st = d > 0 ? a : b;
  const en = d > 0 ? b : a;
  walls.segStart[s] = st;
  walls.segEnd[s] = en;
  walls.segO[s] = o;
  walls.segInc[s] = cq;
  if (vAngle[en]! < vAngle[st]!) walls.wrapList[nWrap++] = s;
}

/** Segments qui touchent le carré de rayon `maxRadius` autour de O, plus les bords de la carte. */
function considerNear(walls: WallSet, maxRadius: number): void {
  const g = walls.grid;
  const c1 = g.col(cox - maxRadius);
  const c2 = g.col(cox + maxRadius);
  const r1 = g.row(coy - maxRadius);
  const r2 = g.row(coy + maxRadius);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = r * g.cols + c;
      for (let k = g.start[cell]!, end = g.start[cell + 1]!; k < end; k++) {
        consider(walls, g.items[k]!);
      }
    }
  }
  const borders = walls.borderSegs;
  for (let k = 0; k < borders.length; k++) consider(walls, borders[k]!);
}

/** Sommets retenus triés par angle (à égalité, par indice : ordre unique, donc déterministe). */
function sortUsedVertices(walls: WallSet): void {
  const keys = walls.sortKey;
  const idx = walls.sortIdx;
  const used = walls.usedList;
  const vAngle = walls.vAngle;
  for (let k = 0; k < nUsed; k++) {
    const v = used[k]!;
    keys[k] = vAngle[v]!;
    idx[k] = v;
  }
  sortPairs(keys, idx, 0, nUsed - 1);
}

/**
 * Tas initial : segments qui chevauchent l'angle 0 (actifs avant le premier lot). Rayon de
 * référence : milieu de l'intervalle qui va du dernier lot au premier.
 */
function initHeap(walls: WallSet): void {
  const keys = walls.sortKey;
  const idx = walls.sortIdx;
  let lastStart = nUsed - 1;
  while (lastStart > 0 && keys[lastStart - 1] === keys[nUsed - 1]) lastStart--;
  setReference(idx[lastStart]!, idx[0]!);
  for (let k = 0; k < nWrap; k++) heapInsert(walls.wrapList[k]!);
}

/** Retraits du lot [i, j) : segments retenus qui finissent en l'un de ses sommets. */
function removeEnding(walls: WallSet, i: number, j: number): void {
  const idx = walls.sortIdx;
  const vertStart = walls.vertStart;
  const vertSegs = walls.vertSegs;
  for (let k = i; k < j; k++) {
    const v = idx[k]!;
    for (let e = vertStart[v]!, end = vertStart[v + 1]!; e < end; e++) {
      const s = vertSegs[e]!;
      if (walls.segInc[s] === cq && walls.segEnd[s] === v) heapRemove(s);
    }
  }
}

/** Ajouts du lot [i, j) : segments retenus qui commencent en l'un de ses sommets. */
function insertStarting(walls: WallSet, i: number, j: number): void {
  const idx = walls.sortIdx;
  const vertStart = walls.vertStart;
  const vertSegs = walls.vertSegs;
  for (let k = i; k < j; k++) {
    const v = idx[k]!;
    for (let e = vertStart[v]!, end = vertStart[v + 1]!; e < end; e++) {
      const s = vertSegs[e]!;
      if (walls.segInc[s] === cq && walls.segStart[s] === v) heapInsert(s);
    }
  }
}

/**
 * Changement du segment le plus proche à l'angle `theta` (lot commençant au sommet `rep`) :
 * point de l'ancien puis du nouveau. Rend le nombre de points émis.
 */
function emitChange(
  walls: WallSet,
  prev: number,
  cur: number,
  rep: number,
  theta: number,
  n: number,
): number {
  const rdx = walls.vx[rep]! - cox;
  const rdy = walls.vy[rep]! - coy;
  const out = walls.outPts;
  const outAng = walls.outAng;
  let nOut = n;
  if (prev >= 0) nOut = emitHit(walls, prev, theta, rdx, rdy, cox, coy, out, outAng, nOut);
  if (cur >= 0) nOut = emitHit(walls, cur, theta, rdx, rdy, cox, coy, out, outAng, nOut);
  return nOut;
}

/** Balayage des lots d'angle : rend le nombre de points du polygone. */
function sweepBatches(walls: WallSet): number {
  const keys = walls.sortKey;
  const idx = walls.sortIdx;
  initHeap(walls);
  let nOut = 0;
  let prev = hsize > 0 ? heap[0]! : -1;
  let i = 0;
  while (i < nUsed) {
    const theta = keys[i]!;
    let j = i + 1;
    while (j < nUsed && keys[j] === theta) j++;
    removeEnding(walls, i, j);
    // Ajouts comparés au milieu de l'intervalle qui commence ici.
    setReference(idx[i]!, j < nUsed ? idx[j]! : idx[0]!);
    insertStarting(walls, i, j);
    const cur = hsize > 0 ? heap[0]! : -1;
    if (cur !== prev) {
      nOut = emitChange(walls, prev, cur, idx[i]!, theta, nOut);
      prev = cur;
    }
    i = j;
  }
  // Remise à zéro des positions du tas pour la requête suivante.
  for (let k = 0; k < hsize; k++) hpos[heap[k]!] = -1;
  hsize = 0;
  return nOut;
}

/**
 * Polygone de vue depuis (px, py). `maxRadius` fini : seuls les segments qui touchent le carré
 * de ce rayon (plus les bords de la carte) sont pris ; le polygone n'est alors exact que dans le
 * disque de ce rayon, où l'appelant le coupe.
 */
export function computeStar(
  walls: WallSet,
  px: number,
  py: number,
  maxRadius: number,
): StarPolygon {
  effectiveOrigin(walls, px, py);
  const ox = originX;
  const oy = originY;
  cq = walls.nextStamp();
  cox = ox;
  coy = oy;
  nUsed = 0;
  nWrap = 0;
  if (Number.isFinite(maxRadius) && maxRadius > 0) considerNear(walls, maxRadius);
  else for (let s = 0, n = walls.segCount; s < n; s++) consider(walls, s);
  sortUsedVertices(walls);

  // Contexte du comparateur.
  cvx = walls.vx;
  cvy = walls.vy;
  csa = walls.segA;
  csb = walls.segB;
  cso = walls.segO;
  heap = walls.heap;
  hpos = walls.heapPos;
  hsize = 0;

  const out = walls.outPts;
  let nOut = nUsed > 0 ? sweepBatches(walls) : 0;
  // Dernier point égal au premier : retiré.
  if (nOut > 1 && out[0] === out[2 * nOut - 2] && out[1] === out[2 * nOut - 1]) nOut--;
  return {
    ox,
    oy,
    points: out.slice(0, 2 * nOut),
    angles: walls.outAng.slice(0, nOut),
    count: nOut,
  };
}

/** Rayon de référence : bissectrice des directions de O vers les sommets v1 et v2. */
function setReference(v1: number, v2: number) {
  refV1 = v1;
  refV2 = v2;
  refReady = false;
}

function computeReference() {
  const x1 = cvx[refV1]! - cox;
  const y1 = cvy[refV1]! - coy;
  const x2 = cvx[refV2]! - cox;
  const y2 = cvy[refV2]! - coy;
  const l1 = Math.sqrt(x1 * x1 + y1 * y1) || 1;
  const l2 = Math.sqrt(x2 * x2 + y2 * y2) || 1;
  crx = x1 / l1 + x2 / l2;
  cry = y1 / l1 + y2 / l2;
  if (crx === 0 && cry === 0) {
    // Directions opposées (impossible avec les bords de la carte) : perpendiculaire.
    crx = -y1;
    cry = x1;
  }
  refReady = true;
}

/** `v` ramené entre `a` et `b` (dans un ordre quelconque). */
function clampBetween(v: number, a: number, b: number): number {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/**
 * Intersection du rayon (rdx, rdy) depuis O avec la droite du segment [a, b], bornée à sa boîte ;
 * rayon parallèle (quasi de profil) : l'extrémité la plus proche. Résultat dans `hitX`, `hitY`.
 */
function rayHit(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rdx: number,
  rdy: number,
  ox: number,
  oy: number,
): void {
  const ex = bx - ax;
  const ey = by - ay;
  const den = rdx * ey - rdy * ex;
  if (den !== 0) {
    const t = ((ax - ox) * ey - (ay - oy) * ex) / den;
    // Arrondis : le point reste sur le segment.
    hitX = clampBetween(ox + t * rdx, ax, bx);
    hitY = clampBetween(oy + t * rdy, ay, by);
  } else {
    const da = (ax - ox) * (ax - ox) + (ay - oy) * (ay - oy);
    const db = (bx - ox) * (bx - ox) + (by - oy) * (by - oy);
    hitX = da <= db ? ax : bx;
    hitY = da <= db ? ay : by;
  }
}

/**
 * Point du segment s sur le rayon d'angle `theta` : son extrémité si elle est à cet angle
 * (exacte, partagée par les murs soudés), sinon l'intersection du rayon (direction du premier
 * sommet du lot) avec la droite du segment, bornée à sa boîte. Ajouté s'il diffère du dernier.
 */
function emitHit(
  walls: WallSet,
  s: number,
  theta: number,
  rdx: number,
  rdy: number,
  ox: number,
  oy: number,
  out: Float64Array,
  outAng: Float64Array,
  n: number,
): number {
  const st = walls.segStart[s]!;
  const en = walls.segEnd[s]!;
  const vx = walls.vx;
  const vy = walls.vy;
  let x: number;
  let y: number;
  if (walls.vAngle[st] === theta) {
    x = vx[st]!;
    y = vy[st]!;
  } else if (walls.vAngle[en] === theta) {
    x = vx[en]!;
    y = vy[en]!;
  } else {
    rayHit(vx[st]!, vy[st]!, vx[en]!, vy[en]!, rdx, rdy, ox, oy);
    x = hitX;
    y = hitY;
  }
  if (n > 0 && out[2 * n - 2] === x && out[2 * n - 1] === y) return n;
  out[2 * n] = x;
  out[2 * n + 1] = y;
  outAng[n] = theta;
  return n + 1;
}

/**
 * Point dans un polygone étoilé, en O(log n) : recherche dichotomique du secteur angulaire du
 * point, puis côté de l'arête de ce secteur. Un point sur le bord est dedans.
 */
export function starContains(star: StarPolygon, x: number, y: number): boolean {
  const n = star.count;
  if (n < 3) return false;
  const ox = star.ox;
  const oy = star.oy;
  const dx = x - ox;
  const dy = y - oy;
  if (dx === 0 && dy === 0) return true;
  const th = pseudoAngle(dx, dy);
  const ang = star.angles;
  // Premier sommet d'angle strictement supérieur.
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ang[mid]! <= th) lo = mid + 1;
    else hi = mid;
  }
  const i = lo === 0 ? n - 1 : lo - 1;
  const j = i + 1 === n ? 0 : i + 1;
  const p = star.points;
  const ax = p[2 * i]!;
  const ay = p[2 * i + 1]!;
  const bx = p[2 * j]!;
  const by = p[2 * j + 1]!;
  const side = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  if (side === 0) return true;
  const sideO = (bx - ax) * (oy - ay) - (by - ay) * (ox - ax);
  return side > 0 === sideO > 0;
}
