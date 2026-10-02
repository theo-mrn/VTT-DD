/**
 * Préparation d'une scène : tout ce qui ne dépend pas des observateurs est calculé une fois
 * (< 5 ms pour 2 000 segments) puis partagé par toutes les requêtes. À refaire quand un mur, une
 * porte, une pièce ou une zone change ; une lumière qui bouge (torche) se met à jour à part avec
 * `withLights`, sans refaire les murs.
 */
import { clipSegmentToRect, orient } from './geometry.js';
import { buildGrid, gridDims, type Grid, visitBox } from './grid.js';
import { PolygonShape } from './shape.js';
import { computeStar, type StarPolygon, starContains } from './sweep.js';
import type { FogZone, Light, PrepareOptions, Room, Segment, Vec, VisionScene } from './types.js';
import { detectWallRooms } from './wall-rooms.js';
import { FLAG_LEFT, FLAG_RIGHT, type RawWall, WallSet } from './walls.js';

/** Pièce préparée. */
export interface PreparedRoom {
  readonly id: string;
  readonly index: number;
  readonly room: Room;
  /** @internal */
  readonly shape: PolygonShape;
  /** Portes (ids de segments) situées sur le contour, ouvertes ou fermées. */
  readonly doorIds: readonly string[];
  /** Aucune porte ouverte sur le contour : de l'intérieur on ne voit pas dehors, et l'inverse. */
  readonly closed: boolean;
}

/** Segment translucide (0 < opacité < 1), coupé aux bornes de la carte. */
export interface TranslucentWall {
  readonly id: string;
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  /** 0 : double face ; FLAG_LEFT / FLAG_RIGHT : sens unique. */
  readonly flags: number;
  readonly opacity: number;
}

interface PreparedFog {
  readonly fog: boolean;
  /** Cercle : centre et rayon au carré ; sinon polygone. */
  readonly cx: number;
  readonly cy: number;
  readonly r2: number;
  readonly shape: PolygonShape | null;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Lumière allumée préparée ; son aire est calculée à la première demande. */
export interface PreparedLight {
  readonly light: Light;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** @internal Polygone de vue depuis la lumière (exact dans son disque). */
  star: StarPolygon | null;
  /** Polygone coupé au disque (rendu), calculé avec `star`. */
  polygon: Float64Array | null;
}

/** Géométrie partagée entre une scène et ses variantes `withLights`. */
interface SceneCore {
  readonly walls: WallSet;
  readonly translucent: readonly TranslucentWall[];
  readonly rooms: readonly PreparedRoom[];
  /** Indices (dans `rooms`) des pièces fermées. */
  readonly closed: Int32Array;
  /** Pour chaque pièce, son rang parmi les fermées (−1 si ouverte). */
  readonly closedRank: Int32Array;
  readonly closedGrid: Grid;
  readonly roomGrid: Grid;
  readonly fogFull: boolean;
  readonly fog: readonly PreparedFog[];
  readonly fogGrid: Grid;
  /** Tampon de travail : pièces fermées contenant le point testé. */
  readonly roomScratch: Int32Array;
}

/**
 * Scène préparée : à passer à toutes les fonctions du paquet. Ses champs sont en lecture seule ;
 * ceux marqués `@internal` peuvent changer sans préavis.
 */
export class PreparedScene {
  readonly scene: VisionScene;
  readonly width: number;
  readonly height: number;
  /** @internal */
  readonly core: SceneCore;
  /** Lumières allumées de rayon positif. */
  readonly lights: readonly PreparedLight[];
  /** @internal */
  readonly lightGrid: Grid;

  /** @internal Utiliser `prepareScene` ou `withLights`. */
  constructor(scene: VisionScene, core: SceneCore, lights: readonly Light[]) {
    this.scene = scene;
    this.width = core.walls.width;
    this.height = core.walls.height;
    this.core = core;
    const prepared: PreparedLight[] = [];
    for (const light of lights) {
      if (!light.on || !(light.radius > 0)) continue;
      if (!Number.isFinite(light.pos.x) || !Number.isFinite(light.pos.y)) continue;
      prepared.push({
        light,
        x: light.pos.x,
        y: light.pos.y,
        radius: light.radius,
        star: null,
        polygon: null,
      });
    }
    this.lights = prepared;
    this.lightGrid = boxGrid(this.width, this.height, prepared.length, (i) => {
      const l = prepared[i]!;
      return {
        minX: l.x - l.radius,
        minY: l.y - l.radius,
        maxX: l.x + l.radius,
        maxY: l.y + l.radius,
      };
    });
  }

  /** Pièces préparées, dans l'ordre de la scène. */
  get rooms(): readonly PreparedRoom[] {
    return this.core.rooms;
  }

  /** Nombre de segments bloquants après soudure et découpe (bords de la carte compris). */
  get segmentCount(): number {
    return this.core.walls.segCount;
  }
}

function clampCell(v: number, cell: number, count: number) {
  const c = Math.floor(v / cell);
  return c < 0 ? 0 : c >= count ? count - 1 : c;
}

/** Sens unique : `one_way` ou l'alias du contrat `one_way_wall`. */
function isOneWay(s: Segment) {
  return s.kind === 'one_way' || s.kind === 'one_way_wall';
}

/**
 * Prépare une scène : murs soudés et découpés, index spatial, segments opaques et translucides,
 * portes du contour de chaque pièce (3 px), pièces fermées, zones de brouillard, bords de la
 * carte comme murs.
 */
export function prepareScene(scene: VisionScene, options: PrepareOptions = {}): PreparedScene {
  const width = positive(scene.bounds.width);
  const height = positive(scene.bounds.height);
  const snap = options.snap ?? 0.5;
  const doorTolerance = options.doorTolerance ?? 3;

  // Segments : bloquants (opacité 1), translucides (entre 0 et 1), ou sans effet sur la vue
  // (fenêtres, portes ouvertes, opacité nulle).
  const raw: RawWall[] = [];
  const translucent: TranslucentWall[] = [];
  const clip = new Float64Array(4);
  scene.segments.forEach((s, i) => {
    if (!finiteVec(s.a) || !finiteVec(s.b)) return;
    if (s.kind === 'window') return;
    if (s.kind === 'door' && s.open === true) return;
    const opacity = s.opacity ?? 1;
    if (!(opacity > 0)) return;
    const flags = isOneWay(s) ? (s.blocksFrom === 'right' ? FLAG_RIGHT : FLAG_LEFT) : 0;
    if (opacity < 1) {
      if (!clipSegmentToRect(s.a.x, s.a.y, s.b.x, s.b.y, 0, 0, width, height, clip)) return;
      if (clip[0] === clip[2] && clip[1] === clip[3]) return;
      translucent.push({
        id: s.id,
        ax: clip[0]!,
        ay: clip[1]!,
        bx: clip[2]!,
        by: clip[3]!,
        flags,
        opacity,
      });
      return;
    }
    raw.push({ ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, flags, source: i });
  });
  const walls = new WallSet(width, height, raw, snap);

  // Pièces et portes de leur contour : les pièces posées par le MJ, puis les salles détectées
  // des murs (toute boucle fermée de murs, portes, fenêtres). Une fenêtre ouvre la pièce comme
  // une porte ouverte : on voit au travers, la ligne de vue décide du reste.
  const doors = scene.segments.filter(
    (s) => (s.kind === 'door' || s.kind === 'window') && finiteVec(s.a) && finiteVec(s.b),
  );
  const rooms: PreparedRoom[] = [];
  const addRoom = (room: Room, closedHint?: boolean) => {
    const shape = new PolygonShape(room.points);
    if (shape.count < 3) return;
    const doorIds: string[] = [];
    let open = false;
    const tol2 = doorTolerance * doorTolerance;
    // Salle détectée des murs : son ouverture est déjà connue, pas de recherche des portes
    for (const d of closedHint === undefined ? doors : []) {
      if (
        Math.max(d.a.x, d.b.x) < shape.minX - doorTolerance ||
        Math.min(d.a.x, d.b.x) > shape.maxX + doorTolerance ||
        Math.max(d.a.y, d.b.y) < shape.minY - doorTolerance ||
        Math.min(d.a.y, d.b.y) > shape.maxY + doorTolerance
      ) {
        continue;
      }
      // Sur le contour : extrémités et milieu à la tolérance près (une porte en travers de la
      // pièce, extrémités sur le contour, n'en fait pas partie).
      const mx = (d.a.x + d.b.x) / 2;
      const my = (d.a.y + d.b.y) / 2;
      if (
        shape.boundaryDistSq(d.a.x, d.a.y) <= tol2 &&
        shape.boundaryDistSq(d.b.x, d.b.y) <= tol2 &&
        shape.boundaryDistSq(mx, my) <= tol2
      ) {
        if (d.kind === 'door' && !doorIds.includes(d.id)) doorIds.push(d.id);
        if (d.kind === 'window' || d.open === true) open = true;
      }
    }
    const closed = closedHint ?? !open;
    rooms.push({ id: room.id, index: rooms.length, room, shape, doorIds, closed });
  };
  for (const room of scene.rooms ?? []) addRoom(room);
  if (options.wallRooms !== false)
    for (const r of detectWallRooms(scene.segments, snap))
      addRoom({ id: r.id, points: r.points }, r.closed);
  const closedList: number[] = [];
  const closedRank = new Int32Array(rooms.length).fill(-1);
  for (const r of rooms) {
    if (r.closed) {
      closedRank[r.index] = closedList.length;
      closedList.push(r.index);
    }
  }
  const closed = Int32Array.from(closedList);
  const roomGrid = boxGrid(width, height, rooms.length, (i) => rooms[i]!.shape);
  const closedGrid = boxGrid(width, height, closed.length, (i) => rooms[closed[i]!]!.shape);

  // Brouillard.
  const fog: PreparedFog[] = [];
  for (const z of scene.fogZones ?? []) {
    const p = prepareFog(z);
    if (p) fog.push(p);
  }
  const fogGrid = boxGrid(width, height, fog.length, (i) => fog[i]!);

  const core: SceneCore = {
    walls,
    translucent,
    rooms,
    closed,
    closedRank,
    closedGrid,
    roomGrid,
    fogFull: scene.fogFull === true,
    fog,
    fogGrid,
    roomScratch: new Int32Array(Math.max(1, closed.length)),
  };
  return new PreparedScene(scene, core, scene.lights ?? []);
}

/**
 * Même scène, autres lumières : les murs, pièces et zones sont partagés (rien n'est refait).
 * Pour une torche qui suit un token pendant un glisser.
 */
export function withLights(prep: PreparedScene, lights: readonly Light[]): PreparedScene {
  return new PreparedScene({ ...prep.scene, lights }, prep.core, lights);
}

function positive(v: number) {
  return Number.isFinite(v) && v > 0 ? v : 1;
}

function finiteVec(v: Vec) {
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}

function prepareFog(z: FogZone): PreparedFog | null {
  const fog = z.mode === 'fog';
  if (z.shape === 'circle') {
    const r = z.radius;
    if (!finiteVec(z.center) || !(r > 0)) return null;
    return {
      fog,
      cx: z.center.x,
      cy: z.center.y,
      r2: r * r,
      shape: null,
      minX: z.center.x - r,
      minY: z.center.y - r,
      maxX: z.center.x + r,
      maxY: z.center.y + r,
    };
  }
  const shape = new PolygonShape(z.points);
  if (shape.count < 3) return null;
  return {
    fog,
    cx: 0,
    cy: 0,
    r2: 0,
    shape,
    minX: shape.minX,
    minY: shape.minY,
    maxX: shape.maxX,
    maxY: shape.maxY,
  };
}

/** Grille des boîtes englobantes (éléments rangés par indice croissant dans chaque case). */
function boxGrid(
  width: number,
  height: number,
  count: number,
  box: (i: number) => { minX: number; minY: number; maxX: number; maxY: number },
): Grid {
  const dims = gridDims(width, height, count, 1, 32, 1);
  const g = {
    cols: dims.cols,
    col: (x: number) => clampCell(x, dims.cell, dims.cols),
    row: (y: number) => clampCell(y, dims.cell, dims.rows),
  };
  return buildGrid(0, 0, dims.cell, dims.cols, dims.rows, count, (i, emit) => {
    const b = box(i);
    visitBox(g, b.minX, b.minY, b.maxX, b.maxY, emit);
  });
}

// ─── Requêtes indépendantes des observateurs ─────────────────────────────────

/** Dans le brouillard ? Zones parcourues de la dernière à la première : la dernière qui
 * contient le point décide ; aucune : `fogFull`. */
export function inFogXY(prep: PreparedScene, x: number, y: number): boolean {
  const core = prep.core;
  const zones = core.fog;
  if (zones.length === 0) return core.fogFull;
  const g = core.fogGrid;
  const cell = g.row(y) * g.cols + g.col(x);
  const items = g.items;
  for (let k = g.start[cell + 1]! - 1, first = g.start[cell]!; k >= first; k--) {
    const z = zones[items[k]!]!;
    if (x < z.minX || x > z.maxX || y < z.minY || y > z.maxY) continue;
    if (z.shape === null) {
      const dx = x - z.cx;
      const dy = y - z.cy;
      if (dx * dx + dy * dy <= z.r2) return z.fog;
    } else if (z.shape.contains(x, y)) {
      return z.fog;
    }
  }
  return core.fogFull;
}

/** Le point est-il dans le brouillard (zones appliquées dans l'ordre, à partir de `fogFull`) ? */
export function inFog(prep: PreparedScene, p: Vec): boolean {
  return inFogXY(prep, p.x, p.y);
}

/** Aire de vue d'une lumière préparée, calculée à la première demande. */
export function lightStar(prep: PreparedScene, l: PreparedLight): StarPolygon {
  if (l.star === null) l.star = computeStar(prep.core.walls, l.x, l.y, l.radius);
  return l.star;
}

/** Éclairé par au moins une lumière allumée (disque ∩ vue depuis la lumière) ? */
export function isLitXY(prep: PreparedScene, x: number, y: number): boolean {
  const lights = prep.lights;
  if (lights.length === 0) return false;
  const g = prep.lightGrid;
  const cell = g.row(y) * g.cols + g.col(x);
  for (let k = g.start[cell]!, end = g.start[cell + 1]!; k < end; k++) {
    const l = lights[g.items[k]!]!;
    const dx = x - l.x;
    const dy = y - l.y;
    if (dx * dx + dy * dy > l.radius * l.radius) continue;
    if (starContainsLazy(prep, l, x, y)) return true;
  }
  return false;
}

function starContainsLazy(prep: PreparedScene, l: PreparedLight, x: number, y: number) {
  return starContains(lightStar(prep, l), x, y);
}

/**
 * Pièces fermées contenant (x, y), écrites dans `core.roomScratch` (rangs parmi les fermées) ;
 * rend leur nombre.
 */
export function closedRoomsAt(prep: PreparedScene, x: number, y: number): number {
  const core = prep.core;
  if (core.closed.length === 0) return 0;
  const g = core.closedGrid;
  const cell = g.row(y) * g.cols + g.col(x);
  let n = 0;
  for (let k = g.start[cell]!, end = g.start[cell + 1]!; k < end; k++) {
    const rank = g.items[k]!;
    if (core.rooms[core.closed[rank]!]!.shape.contains(x, y)) core.roomScratch[n++] = rank;
  }
  return n;
}

/** Ids des pièces fermées (aucune porte ouverte sur leur contour). */
export function closedRooms(prep: PreparedScene): Set<string> {
  const out = new Set<string>();
  for (const r of prep.core.rooms) if (r.closed) out.add(r.id);
  return out;
}

/**
 * Pièce la plus intérieure contenant p (la plus petite en aire ; à égalité, la première) :
 * toutes les pièces, ou seulement les fermées avec `closedOnly`.
 */
export function innermostRoom(
  prep: PreparedScene,
  p: Vec,
  options: { closedOnly?: boolean } = {},
): Room | null {
  const r = innermostRoomIndex(prep, p.x, p.y, options.closedOnly === true);
  return r < 0 ? null : prep.core.rooms[r]!.room;
}

/** @internal Indice de la pièce la plus intérieure contenant (x, y), −1 sinon. */
export function innermostRoomIndex(
  prep: PreparedScene,
  x: number,
  y: number,
  closedOnly: boolean,
): number {
  const core = prep.core;
  const g = core.roomGrid;
  if (core.rooms.length === 0) return -1;
  const cell = g.row(y) * g.cols + g.col(x);
  let best = -1;
  let bestArea = Infinity;
  for (let k = g.start[cell]!, end = g.start[cell + 1]!; k < end; k++) {
    const i = g.items[k]!;
    const room = core.rooms[i]!;
    if (closedOnly && !room.closed) continue;
    if (!room.shape.contains(x, y)) continue;
    if (room.shape.area < bestArea) {
      bestArea = room.shape.area;
      best = i;
    }
  }
  return best;
}

/** @internal Côté d'un segment translucide depuis l'origine : bloque-t-il ? */
export function translucentBlocks(t: TranslucentWall, ox: number, oy: number): boolean {
  const o = orient(t.ax, t.ay, t.bx, t.by, ox, oy);
  if ((t.flags & FLAG_LEFT) !== 0) return o < 0;
  if ((t.flags & FLAG_RIGHT) !== 0) return o > 0;
  return o !== 0;
}
