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
  const oS = cso[s]!;
  const o1 = orient(sax, say, sbx, sby, tax, tay);
  const o2 = orient(sax, say, sbx, sby, tbx, tby);
  if (o1 === 0 && o2 === 0) return 0;
  if (oS !== 0) {
    if (o1 >= 0 && o2 >= 0) return oS > 0 ? 1 : -1;
    if (o1 <= 0 && o2 <= 0) return oS < 0 ? 1 : -1;
  }
  const oT = cso[t]!;
  const p1 = orient(tax, tay, tbx, tby, sax, say);
  const p2 = orient(tax, tay, tbx, tby, sbx, sby);
  if (p1 === 0 && p2 === 0) return 0;
  if (oT !== 0) {
    if (p1 >= 0 && p2 >= 0) return oT > 0 ? -1 : 1;
    if (p1 <= 0 && p2 <= 0) return oT < 0 ? -1 : 1;
  }
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
    if (j - lo < hi - i) {
      sortPairs(keys, idx, lo, j);
      lo = i;
    } else {
      sortPairs(keys, idx, i, hi);
      hi = j;
    }
  }
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
  const q = walls.nextStamp();
  const vx = walls.vx;
  const vy = walls.vy;
  const segA = walls.segA;
  const segB = walls.segB;
  const segFlags = walls.segFlags;
  const vAngle = walls.vAngle;
  const vStamp = walls.vStamp;
  const segStamp = walls.segStamp;
  const segInc = walls.segInc;
  const segStart = walls.segStart;
  const segEnd = walls.segEnd;
  const segO = walls.segO;
  const wrapList = walls.wrapList;
  const used = walls.usedList;
  let nWrap = 0;
  let nUsed = 0;

  // Retient le segment s s'il bloque la vue depuis O et couvre un intervalle d'angles non nul.
  const consider = (s: number) => {
    if (segStamp[s] === q) return;
    segStamp[s] = q;
    const a = segA[s]!;
    const b = segB[s]!;
    const ax = vx[a]!;
    const ay = vy[a]!;
    const bx = vx[b]!;
    const by = vy[b]!;
    const o = orient(ax, ay, bx, by, ox, oy);
    const f = segFlags[s]!;
    // Sens unique : bloque seulement l'observateur du côté indiqué (gauche : o < 0).
    if ((f & FLAG_LEFT) !== 0) {
      if (!(o < 0)) return;
    } else if ((f & FLAG_RIGHT) !== 0) {
      if (!(o > 0)) return;
    }
    if (vStamp[a] !== q) {
      vStamp[a] = q;
      vAngle[a] = pseudoAngle(ax - ox, ay - oy);
      used[nUsed++] = a;
    }
    if (vStamp[b] !== q) {
      vStamp[b] = q;
      vAngle[b] = pseudoAngle(bx - ox, by - oy);
      used[nUsed++] = b;
    }
    const pa = vAngle[a]!;
    const pb = vAngle[b]!;
    let d = pb - pa;
    if (d > 2) d -= 4;
    else if (d < -2) d += 4;
    // De profil (d nul) ou passant par O (d = ±2) : aucune surface à couvrir.
    if (d === 0 || d >= 2 || d <= -2) return;
    const st = d > 0 ? a : b;
    const en = d > 0 ? b : a;
    segStart[s] = st;
    segEnd[s] = en;
    segO[s] = o;
    segInc[s] = q;
    if (vAngle[en]! < vAngle[st]!) wrapList[nWrap++] = s;
  };

  if (Number.isFinite(maxRadius) && maxRadius > 0) {
    const g = walls.grid;
    const c1 = g.col(ox - maxRadius);
    const c2 = g.col(ox + maxRadius);
    const r1 = g.row(oy - maxRadius);
    const r2 = g.row(oy + maxRadius);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = r * g.cols + c;
        for (let k = g.start[cell]!, end = g.start[cell + 1]!; k < end; k++) consider(g.items[k]!);
      }
    }
    const borders = walls.borderSegs;
    for (let k = 0; k < borders.length; k++) consider(borders[k]!);
  } else {
    for (let s = 0, n = walls.segCount; s < n; s++) consider(s);
  }

  // Sommets triés par angle (à égalité, par indice : ordre unique, donc déterministe).
  const keys = walls.sortKey;
  const idx = walls.sortIdx;
  for (let k = 0; k < nUsed; k++) {
    const v = used[k]!;
    keys[k] = vAngle[v]!;
    idx[k] = v;
  }
  sortPairs(keys, idx, 0, nUsed - 1);

  // Contexte du comparateur.
  cvx = vx;
  cvy = vy;
  csa = segA;
  csb = segB;
  cso = segO;
  cox = ox;
  coy = oy;
  heap = walls.heap;
  hpos = walls.heapPos;
  hsize = 0;

  const out = walls.outPts;
  const outAng = walls.outAng;
  let nOut = 0;

  if (nUsed > 0) {
    // Tas initial : segments qui chevauchent l'angle 0 (actifs avant le premier lot). Rayon de
    // référence : milieu de l'intervalle qui va du dernier lot au premier.
    let lastStart = nUsed - 1;
    while (lastStart > 0 && keys[lastStart - 1] === keys[nUsed - 1]) lastStart--;
    setReference(idx[lastStart]!, idx[0]!);
    for (let k = 0; k < nWrap; k++) heapInsert(wrapList[k]!);

    const vertStart = walls.vertStart;
    const vertSegs = walls.vertSegs;
    let prev = hsize > 0 ? heap[0]! : -1;
    let i = 0;
    while (i < nUsed) {
      const theta = keys[i]!;
      let j = i + 1;
      while (j < nUsed && keys[j] === theta) j++;
      // Retraits du lot.
      for (let k = i; k < j; k++) {
        const v = idx[k]!;
        for (let e = vertStart[v]!, end = vertStart[v + 1]!; e < end; e++) {
          const s = vertSegs[e]!;
          if (segInc[s] === q && segEnd[s] === v) heapRemove(s);
        }
      }
      // Ajouts du lot, comparés au milieu de l'intervalle qui commence ici.
      setReference(idx[i]!, j < nUsed ? idx[j]! : idx[0]!);
      for (let k = i; k < j; k++) {
        const v = idx[k]!;
        for (let e = vertStart[v]!, end = vertStart[v + 1]!; e < end; e++) {
          const s = vertSegs[e]!;
          if (segInc[s] === q && segStart[s] === v) heapInsert(s);
        }
      }
      const cur = hsize > 0 ? heap[0]! : -1;
      if (cur !== prev) {
        const rep = idx[i]!;
        const rdx = vx[rep]! - ox;
        const rdy = vy[rep]! - oy;
        if (prev >= 0) nOut = emitHit(walls, prev, theta, rdx, rdy, ox, oy, out, outAng, nOut);
        if (cur >= 0) nOut = emitHit(walls, cur, theta, rdx, rdy, ox, oy, out, outAng, nOut);
        prev = cur;
      }
      i = j;
    }
    // Remise à zéro des positions du tas pour la requête suivante.
    for (let k = 0; k < hsize; k++) hpos[heap[k]!] = -1;
    hsize = 0;
  }

  // Dernier point égal au premier : retiré.
  if (nOut > 1 && out[0] === out[2 * nOut - 2] && out[1] === out[2 * nOut - 1]) nOut--;
  return {
    ox,
    oy,
    points: out.slice(0, 2 * nOut),
    angles: outAng.slice(0, nOut),
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
    const ax = vx[st]!;
    const ay = vy[st]!;
    const bx = vx[en]!;
    const by = vy[en]!;
    const ex = bx - ax;
    const ey = by - ay;
    const den = rdx * ey - rdy * ex;
    if (den !== 0) {
      const t = ((ax - ox) * ey - (ay - oy) * ex) / den;
      x = ox + t * rdx;
      y = oy + t * rdy;
      // Arrondis : le point reste sur le segment.
      const minX = ax < bx ? ax : bx;
      const maxX = ax < bx ? bx : ax;
      const minY = ay < by ? ay : by;
      const maxY = ay < by ? by : ay;
      if (x < minX) x = minX;
      else if (x > maxX) x = maxX;
      if (y < minY) y = minY;
      else if (y > maxY) y = maxY;
    } else {
      // Rayon parallèle au segment (quasi de profil) : son extrémité la plus proche.
      const da = (ax - ox) * (ax - ox) + (ay - oy) * (ay - oy);
      const db = (bx - ox) * (bx - ox) + (by - oy) * (by - oy);
      x = da <= db ? ax : bx;
      y = da <= db ? ay : by;
    }
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
