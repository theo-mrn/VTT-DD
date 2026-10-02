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

/**
 * Boucles fermées des segments. `snap` : sommets plus proches fusionnés, et sommet posé à cette
 * distance de l'intérieur d'un segment inséré dedans (jonction en T).
 */
export function detectWallRooms(segments: readonly Segment[], snap = 0.5): WallRoom[] {
  if (!segments.length || segments.length > MAX_EDGES) return [];
  const cell = Math.max(snap, 1e-9);

  // Sommets soudés (grille de pas `snap`, voisins compris)
  const xs: number[] = [];
  const ys: number[] = [];
  // Clé numérique de case (coordonnées de case < 2²⁶ en valeur absolue : exact en double)
  const index = new Map<number, number>();
  const key = (cx: number, cy: number) => (cx + 67_108_864) * 134_217_728 + (cy + 67_108_864);
  const vertex = (p: Vec): number => {
    const cx = Math.round(p.x / cell);
    const cy = Math.round(p.y / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const hit = index.get(key(cx + dx, cy + dy));
        if (hit !== undefined && Math.hypot(xs[hit]! - p.x, ys[hit]! - p.y) <= snap) return hit;
      }
    const id = xs.length;
    xs.push(p.x);
    ys.push(p.y);
    index.set(key(cx, cy), id);
    return id;
  };

  const raw: Edge[] = [];
  for (const s of segments) {
    if (!Number.isFinite(s.a.x + s.a.y + s.b.x + s.b.y)) continue;
    const a = vertex(s.a);
    const b = vertex(s.b);
    if (a !== b) raw.push({ a, b, open: opens(s) });
  }

  // Jonctions en T : un sommet sur l'intérieur d'un segment le découpe. Sommets rangés dans une
  // grille (cases de ~ 1/64 de la scène) : chaque segment ne regarde que ceux de sa boîte
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
  const gcell = Math.max((maxVX - minVX) / 64, (maxVY - minVY) / 64, snap * 4, 1);
  const gcols = Math.floor((maxVX - minVX) / gcell) + 1;
  const grows = Math.floor((maxVY - minVY) / gcell) + 1;
  const buckets = new Map<number, number[]>();
  const cellOf = (x: number, y: number) =>
    Math.min(gcols - 1, Math.max(0, Math.floor((x - minVX) / gcell))) +
    Math.min(grows - 1, Math.max(0, Math.floor((y - minVY) / gcell))) * gcols;
  for (let v = 0; v < xs.length; v++) {
    const c = cellOf(xs[v]!, ys[v]!);
    const list = buckets.get(c);
    if (list) list.push(v);
    else buckets.set(c, [v]);
  }
  const split: Edge[] = [];
  for (const e of raw) {
    const ax = xs[e.a]!;
    const ay = ys[e.a]!;
    const bx = xs[e.b]!;
    const by = ys[e.b]!;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const onIt: { t: number; v: number }[] = [];
    const minX = Math.min(ax, bx) - snap;
    const maxX = Math.max(ax, bx) + snap;
    const minY = Math.min(ay, by) - snap;
    const maxY = Math.max(ay, by) + snap;
    const c0 = Math.max(0, Math.floor((minX - minVX) / gcell));
    const c1 = Math.min(gcols - 1, Math.floor((maxX - minVX) / gcell));
    const r0 = Math.max(0, Math.floor((minY - minVY) / gcell));
    const r1 = Math.min(grows - 1, Math.floor((maxY - minVY) / gcell));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const list = buckets.get(c + r * gcols);
        if (!list) continue;
        for (const v of list) {
          if (v === e.a || v === e.b) continue;
          const px = xs[v]!;
          const py = ys[v]!;
          if (px < minX || px > maxX || py < minY || py > maxY) continue;
          const t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2;
          if (t <= 0 || t >= 1) continue;
          const qx = ax + t * (bx - ax);
          const qy = ay + t * (by - ay);
          if (Math.hypot(px - qx, py - qy) <= snap) onIt.push({ t, v });
        }
      }
    if (!onIt.length) {
      split.push(e);
      continue;
    }
    onIt.sort((p, q) => p.t - q.t);
    let from = e.a;
    for (const { v } of onIt) {
      if (v !== from) split.push({ a: from, b: v, open: e.open });
      from = v;
    }
    if (from !== e.b) split.push({ a: from, b: e.b, open: e.open });
  }

  // Arêtes uniques (deux segments confondus : ouverte si l'un l'est)
  const unique = new Map<number, Edge>();
  const nv = xs.length;
  for (const e of split) {
    const k = e.a < e.b ? e.a * nv + e.b : e.b * nv + e.a;
    const prev = unique.get(k);
    if (!prev) unique.set(k, e);
    else if (e.open) prev.open = true;
  }
  let edges = [...unique.values()];

  // Bouts pendants retirés jusqu'à ce qu'il n'en reste plus
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
  if (edges.length < 3) return [];

  // Demi-arêtes : 2i (a→b) et 2i+1 (b→a), triées par angle autour de leur origine
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
  const target = (he: number) => origin[he ^ 1]!;

  // Parcours des faces : à chaque sommet, on tourne au plus serré (face à gauche du parcours)
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
      const list = around.get(target(he))!;
      const back = pos[he ^ 1]!;
      he = list[(back - 1 + list.length) % list.length]!;
    }
    if (he !== first || cycle.length < 3) continue;
    // Aire signée (y vers le bas) : les faces bornées sortent positives avec ce parcours
    let area = 0;
    for (let i = 0; i < cycle.length; i++) {
      const p = cycle[i]!;
      const q = cycle[(i + 1) % cycle.length]!;
      area += xs[p]! * ys[q]! - xs[q]! * ys[p]!;
    }
    area /= 2;
    if (area < MIN_AREA) continue;
    rooms.push({
      id: `walls:${rooms.length}`,
      points: cycle.map((v) => ({ x: xs[v]!, y: ys[v]! })),
      closed: !open,
    });
  }
  return rooms;
}
