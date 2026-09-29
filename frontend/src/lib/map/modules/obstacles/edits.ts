/**
 * Éditions des obstacles et des pièces (docs/carte.md § 10) : chaque geste de l'outil W
 * construit un `EditPlan` (copie de travail des murs et pièces touchés), puis le plan devient
 * **une** commande annulable, envoyée en un `/batch` par couche. Du calcul pur : aucun Pixi,
 * aucun moteur, testé à part.
 *
 * Règles tenues ici :
 * - soudure exacte : un sommet posé sur un segment existant y est inséré (mêmes coordonnées des
 *   deux côtés), et un sommet existant sur un segment neuf aussi ;
 * - doublons fusionnés : un segment neuf qui existe déjà (dans un sens ou l'autre) n'est pas
 *   recréé ;
 * - segments de moins de 2 px refusés, murs dégénérés supprimés.
 */
import { distance, type Point } from '../../engine/geometry';
import { deepEqual } from '../../store/commands';
import {
  cleanPolygon,
  cleanPolyline,
  findLoop,
  insertDoor,
  insertVertex,
  insertVerticesOnPolygon,
  insertVerticesOnSegments,
  isClosed,
  MIN_SEGMENT,
  pointKey,
  polylineSegments,
  removePolygonVertex,
  removeSegment,
  removeVertex,
  samePoint,
  segmentKey,
  splitPolyline,
  type Pts,
} from './geometry';
import {
  defaultProps,
  obstacleDraft,
  propsOf,
  roomDraft,
  type ObstacleData,
  type ObstacleKindId,
  type ObstacleProps,
  type RoomData,
} from './model';

export type Collection = 'obstacles' | 'rooms';

/** Un sommet d'un mur ou d'une pièce. */
export interface VertexRef {
  collection: Collection;
  id: string;
  index: number;
}

export interface PlanWrites<D> {
  create: D[];
  update: { before: D; after: D }[];
  remove: D[];
}

export interface PlanResult {
  obstacles: PlanWrites<ObstacleData>;
  rooms: PlanWrites<RoomData>;
}

/** Copie de travail des murs et des pièces, le temps d'un geste. */
export class EditPlan {
  private readonly obstacleWork = new Map<string, ObstacleData>();
  private readonly obstacleCreated = new Set<string>();
  private readonly obstacleRemoved = new Set<string>();
  private readonly roomWork = new Map<string, RoomData>();
  private readonly roomCreated = new Set<string>();
  private readonly roomRemoved = new Set<string>();

  constructor(
    readonly baseObstacles: ReadonlyMap<string, ObstacleData>,
    readonly baseRooms: ReadonlyMap<string, RoomData>,
    readonly mapId: string,
  ) {}

  // ── Lecture ──

  obstacle(id: string): ObstacleData | undefined {
    if (this.obstacleRemoved.has(id)) return undefined;
    return this.obstacleWork.get(id) ?? this.baseObstacles.get(id);
  }

  room(id: string): RoomData | undefined {
    if (this.roomRemoved.has(id)) return undefined;
    return this.roomWork.get(id) ?? this.baseRooms.get(id);
  }

  *obstacles(): Generator<ObstacleData> {
    for (const [id, o] of this.baseObstacles)
      if (!this.obstacleRemoved.has(id)) yield this.obstacleWork.get(id) ?? o;
    for (const id of this.obstacleCreated) yield this.obstacleWork.get(id)!;
  }

  *rooms(): Generator<RoomData> {
    for (const [id, r] of this.baseRooms)
      if (!this.roomRemoved.has(id)) yield this.roomWork.get(id) ?? r;
    for (const id of this.roomCreated) yield this.roomWork.get(id)!;
  }

  /** Points d'un mur ou d'une pièce. */
  points(collection: Collection, id: string): Pts | undefined {
    return collection === 'obstacles' ? this.obstacle(id)?.points : this.room(id)?.points;
  }

  // ── Écriture ──

  patchObstacle(id: string, patch: Partial<ObstacleData>) {
    const cur = this.obstacle(id);
    if (cur) this.obstacleWork.set(id, { ...cur, ...patch });
  }

  patchRoom(id: string, patch: Partial<RoomData>) {
    const cur = this.room(id);
    if (cur) this.roomWork.set(id, { ...cur, ...patch });
  }

  createObstacle(props: ObstacleProps, points: Point[]): ObstacleData {
    const draft = obstacleDraft(this.mapId, props, points);
    this.obstacleWork.set(draft.id, draft);
    this.obstacleCreated.add(draft.id);
    return draft;
  }

  createRoom(name: string, points: Point[]): RoomData {
    const draft = roomDraft(this.mapId, name, points);
    this.roomWork.set(draft.id, draft);
    this.roomCreated.add(draft.id);
    return draft;
  }

  removeObstacle(id: string) {
    this.obstacleWork.delete(id);
    if (this.obstacleCreated.delete(id)) return;
    if (this.baseObstacles.has(id)) this.obstacleRemoved.add(id);
  }

  removeRoom(id: string) {
    this.roomWork.delete(id);
    if (this.roomCreated.delete(id)) return;
    if (this.baseRooms.has(id)) this.roomRemoved.add(id);
  }

  setPoints(collection: Collection, id: string, points: Point[]) {
    if (collection === 'obstacles') this.patchObstacle(id, { points });
    else this.patchRoom(id, { points });
  }

  // ── Résultat ──

  result(): PlanResult {
    const writes = <D extends { id: string }>(
      base: ReadonlyMap<string, D>,
      work: ReadonlyMap<string, D>,
      created: ReadonlySet<string>,
      removed: ReadonlySet<string>,
    ): PlanWrites<D> => {
      const update: { before: D; after: D }[] = [];
      for (const [id, after] of work) {
        if (created.has(id)) continue;
        const before = base.get(id);
        if (before && !deepEqual(before, after)) update.push({ before, after });
      }
      return {
        create: [...created].map((id) => work.get(id)!),
        update,
        remove: [...removed].map((id) => base.get(id)!),
      };
    };
    return {
      obstacles: writes(
        this.baseObstacles,
        this.obstacleWork,
        this.obstacleCreated,
        this.obstacleRemoved,
      ),
      rooms: writes(this.baseRooms, this.roomWork, this.roomCreated, this.roomRemoved),
    };
  }

  /** Rien à écrire. */
  get empty(): boolean {
    const r = this.result();
    return [r.obstacles, r.rooms].every(
      (w) => !w.create.length && !w.update.length && !w.remove.length,
    );
  }

  /** Identifiants touchés (créés ou modifiés), par couche. */
  touched(): { obstacles: string[]; rooms: string[] } {
    return {
      obstacles: [...this.obstacleWork.keys()],
      rooms: [...this.roomWork.keys()],
    };
  }
}

// ─── Soudures ────────────────────────────────────────────────────────────────

/** Insère ces points dans tout mur dont un segment passe par eux (jonction en T soudée). */
export function weldPoints(plan: EditPlan, points: Pts, exclude?: ReadonlySet<string>) {
  if (!points.length) return;
  for (const o of [...plan.obstacles()]) {
    if (exclude?.has(o.id)) continue;
    const next = insertVerticesOnSegments(o.points, points);
    if (next) plan.patchObstacle(o.id, { points: next });
  }
}

/** Sommets distincts de tous les murs (et des points donnés). */
function allVertices(plan: EditPlan, extra: Pts = []): Point[] {
  const out = new Map<string, Point>();
  for (const o of plan.obstacles()) for (const p of o.points) out.set(pointKey(p), p);
  for (const p of extra) out.set(pointKey(p), p);
  return [...out.values()];
}

// ─── Poser ───────────────────────────────────────────────────────────────────

/**
 * Pose une chaîne de murs (ou de fenêtres, de murs à sens unique, une porte libre) : nettoyée,
 * soudée aux murs existants dans les deux sens, sans segment en double. Renvoie les murs créés
 * (plusieurs si un doublon a coupé la chaîne ; aucun si tout existait déjà).
 */
export function addChain(plan: EditPlan, raw: Pts, props: ObstacleProps): ObstacleData[] {
  const cleaned = cleanPolyline(raw);
  if (!cleaned) return [];
  // Les sommets de la chaîne qui tombent sur un mur existant le scindent (soudure)
  weldPoints(plan, cleaned);
  // Les sommets existants (et ceux de la chaîne) qui tombent sur un segment neuf y entrent
  const chain = insertVerticesOnSegments(cleaned, allVertices(plan, cleaned)) ?? cleaned;
  // Doublons : un segment qui existe déjà, ou déjà tracé dans cette chaîne, n'est pas recréé
  const existing = new Set<string>();
  for (const o of plan.obstacles())
    for (const [a, b] of polylineSegments(o.points)) existing.add(segmentKey(a, b));
  const seen = new Set<string>();
  const keep = polylineSegments(chain).map(([a, b]) => {
    const k = segmentKey(a, b);
    if (existing.has(k) || seen.has(k) || distance(a, b) === 0) return false;
    seen.add(k);
    return true;
  });
  return splitPolyline(chain, (i) => keep[i]!).map((piece) => plan.createObstacle(props, piece));
}

/** Rectangle de murs : une ligne fermée de 4 murs soudés. */
export function rectanglePoints(a: Point, b: Point): Point[] {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a];
}

/**
 * Pièce, et « Poser aussi les murs » : un mur fermé sur son contour, soudé comme les autres.
 */
export function addRoom(
  plan: EditPlan,
  points: Pts,
  name: string,
  withWalls: boolean,
): RoomData | null {
  const polygon = cleanPolygon(points);
  if (!polygon) return null;
  const room = plan.createRoom(name, polygon);
  if (withWalls) addChain(plan, [...polygon, polygon[0]!], defaultProps('wall'));
  return room;
}

/**
 * Porte dans un mur : le mur est scindé en mur, porte, mur (docs/carte.md § 10). Un mur d'un
 * seul segment entièrement couvert devient la porte. Renvoie la porte, ou null (déjà une porte,
 * segment trop court).
 */
export function addDoorInWall(
  plan: EditPlan,
  id: string,
  segment: number,
  at: Point,
  width: number,
): ObstacleData | null {
  const o = plan.obstacle(id);
  if (!o || o.kind === 'door' || segment < 0 || segment >= o.points.length - 1) return null;
  const { door, rest } = insertDoor(o.points, segment, at, width);
  if (distance(door[0], door[1]) < MIN_SEGMENT) return null;
  const doorProps: ObstacleProps = {
    ...propsOf(o),
    kind: 'door',
    blocksFrom: null,
    isOpen: false,
    isLocked: false,
    opacity: 1,
  };
  if (!rest.length) {
    plan.patchObstacle(id, { ...doorProps, points: [door[0], door[1]] });
    return plan.obstacle(id)!;
  }
  plan.patchObstacle(id, { points: rest[0]! });
  for (const piece of rest.slice(1)) plan.createObstacle(propsOf(o), piece);
  return plan.createObstacle(doorProps, [door[0], door[1]]);
}

// ─── Déplacer ────────────────────────────────────────────────────────────────

/**
 * Déplace des sommets. `moves` : clé du sommet (coordonnées) → nouvelle place. Sans `only`, tout
 * sommet de tout mur et de toute pièce à ces coordonnées bouge (les sommets soudés restent
 * soudés) ; avec `only`, seuls les sommets de ces entités bougent (Alt : détacher). Les murs et
 * pièces touchés sont ensuite validés.
 */
export function moveVertices(
  plan: EditPlan,
  moves: ReadonlyMap<string, Point>,
  only?: { obstacles?: ReadonlySet<string>; rooms?: ReadonlySet<string> },
) {
  const touched: { collection: Collection; id: string }[] = [];
  const shift = (pts: Pts): Point[] | null => {
    let changed = false;
    const out = pts.map((p) => {
      const to = moves.get(pointKey(p));
      if (!to) return p;
      changed = true;
      return { x: to.x, y: to.y };
    });
    return changed ? out : null;
  };
  for (const o of [...plan.obstacles()]) {
    if (only && !only.obstacles?.has(o.id)) continue;
    const next = shift(o.points);
    if (next) {
      plan.patchObstacle(o.id, { points: next });
      touched.push({ collection: 'obstacles', id: o.id });
    }
  }
  for (const r of [...plan.rooms()]) {
    if (only && !only.rooms?.has(r.id)) continue;
    const next = shift(r.points);
    if (next) {
      plan.patchRoom(r.id, { points: next });
      touched.push({ collection: 'rooms', id: r.id });
    }
  }
  for (const t of touched) validate(plan, t.collection, t.id);
}

/** Déplace un seul sommet d'une entité (et sa répétition de fermeture) : Alt, détacher. */
export function moveOneVertex(plan: EditPlan, ref: VertexRef, to: Point) {
  const pts = plan.points(ref.collection, ref.id);
  const p = pts?.[ref.index];
  if (!pts || !p) return;
  const closed = ref.collection === 'obstacles' && isClosed(pts);
  const last = pts.length - 1;
  const next = pts.map((q, i) =>
    i === ref.index ||
    (closed && (i === 0 || i === last) && (ref.index === 0 || ref.index === last))
      ? { x: to.x, y: to.y }
      : q,
  );
  plan.setPoints(ref.collection, ref.id, next);
  validate(plan, ref.collection, ref.id);
}

/**
 * Translate des murs et des pièces. `stretch` : les sommets soudés des autres entités suivent
 * (le mur voisin s'étire, la pièce reste fermée) ; sinon (Alt) ils se détachent.
 */
export function translate(
  plan: EditPlan,
  ids: { obstacles: ReadonlySet<string>; rooms: ReadonlySet<string> },
  delta: Point,
  stretch: boolean,
) {
  if (!delta.x && !delta.y) return;
  const moves = new Map<string, Point>();
  const add = (p: Point) => moves.set(pointKey(p), { x: p.x + delta.x, y: p.y + delta.y });
  for (const id of ids.obstacles) for (const p of plan.obstacle(id)?.points ?? []) add(p);
  for (const id of ids.rooms) for (const p of plan.room(id)?.points ?? []) add(p);
  moveVertices(plan, moves, stretch ? undefined : ids);
}

/**
 * Doublons après un déplacement : un segment de ces murs posé exactement sur le segment d'un
 * autre mur disparaît (le mur se scinde ou disparaît), comme pour un mur neuf.
 */
export function dropDuplicateSegments(plan: EditPlan, ids: Iterable<string>) {
  for (const id of ids) {
    const o = plan.obstacle(id);
    if (!o) continue;
    const others = new Set<string>();
    for (const x of plan.obstacles())
      if (x.id !== id)
        for (const [a, b] of polylineSegments(x.points)) others.add(segmentKey(a, b));
    const keep = polylineSegments(o.points).map(([a, b]) => !others.has(segmentKey(a, b)));
    if (keep.every(Boolean)) continue;
    const pieces = splitPolyline(o.points, (i) => keep[i]!);
    if (!pieces.length) {
      plan.removeObstacle(id);
      continue;
    }
    plan.patchObstacle(id, { points: pieces[0]! });
    for (const piece of pieces.slice(1)) plan.createObstacle(propsOf(o), piece);
  }
}

// ─── Sommets et segments ─────────────────────────────────────────────────────

/** Valide un mur ou une pièce après modification : segments trop courts fondus, dégénéré supprimé. */
export function validate(plan: EditPlan, collection: Collection, id: string) {
  if (collection === 'obstacles') {
    const o = plan.obstacle(id);
    if (!o) return;
    const cleaned = cleanPolyline(o.points);
    if (!cleaned) plan.removeObstacle(id);
    else if (!deepEqual(cleaned, o.points)) plan.patchObstacle(id, { points: cleaned });
  } else {
    const r = plan.room(id);
    if (!r) return;
    const cleaned = cleanPolygon(r.points);
    if (!cleaned) plan.removeRoom(id);
    else if (!deepEqual(cleaned, r.points)) plan.patchRoom(id, { points: cleaned });
  }
}

/** Ajoute un sommet sur un segment (double clic). */
export function addVertex(
  plan: EditPlan,
  collection: Collection,
  id: string,
  segment: number,
  p: Point,
) {
  const pts = plan.points(collection, id);
  if (!pts) return;
  if (collection === 'obstacles') {
    if (segment < 0 || segment >= pts.length - 1) return;
    plan.setPoints(collection, id, insertVertex(pts, segment, p));
  } else {
    if (segment < 0 || segment >= pts.length) return;
    plan.setPoints(collection, id, insertVertex(pts, segment, p));
  }
}

/** Supprime un sommet (Suppr) ; le mur ou la pièce disparaît s'il ne reste pas assez de points. */
export function deleteVertex(plan: EditPlan, ref: VertexRef) {
  const pts = plan.points(ref.collection, ref.id);
  if (!pts) return;
  if (ref.collection === 'obstacles') {
    const next = removeVertex(pts, ref.index);
    if (next) plan.patchObstacle(ref.id, { points: next });
    else plan.removeObstacle(ref.id);
  } else {
    const next = removePolygonVertex(pts, ref.index);
    if (next) plan.patchRoom(ref.id, { points: next });
    else plan.removeRoom(ref.id);
  }
}

/** Supprime un segment d'un mur : il se scinde en deux (ou s'ouvre, s'il était fermé). */
export function deleteSegment(plan: EditPlan, id: string, segment: number) {
  const o = plan.obstacle(id);
  if (!o) return;
  const pieces = removeSegment(o.points, segment);
  if (!pieces.length) {
    plan.removeObstacle(id);
    return;
  }
  plan.patchObstacle(id, { points: pieces[0]! });
  for (const piece of pieces.slice(1)) plan.createObstacle(propsOf(o), piece);
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** Champs d'un obstacle converti dans une autre sorte (porte fermée, sens unique à gauche…). */
export function convertedProps(o: ObstacleData, kind: ObstacleKindId): Partial<ObstacleData> {
  return {
    kind,
    isOpen: kind === 'door' ? o.isOpen && o.kind === 'door' : false,
    isLocked: kind === 'door' ? o.isLocked && o.kind === 'door' : false,
    blocksFrom: kind === 'one_way_wall' ? (o.blocksFrom ?? 'left') : null,
  };
}

/**
 * « Remplacer par un mur » : la porte (fenêtre, sens unique) devient un mur, fondu avec les murs
 * simples qu'elle prolonge bout à bout (même couleur et transparence), comme avant la porte.
 */
export function replaceByWall(plan: EditPlan, id: string): string {
  const o = plan.obstacle(id);
  if (!o) return id;
  plan.patchObstacle(id, convertedProps(o, 'wall'));
  return mergeWithNeighbours(plan, id);
}

/** Fond un mur simple avec les murs simples qu'il prolonge (jonction à deux murs seulement). */
export function mergeWithNeighbours(plan: EditPlan, id: string): string {
  let current = id;
  for (let guard = 0; guard < 8; guard++) {
    const o = plan.obstacle(current);
    if (!o || o.kind !== 'wall' || isClosed(o.points)) return current;
    let merged = false;
    for (const end of [o.points[0]!, o.points[o.points.length - 1]!]) {
      const touching = [...plan.obstacles()].filter(
        (x) => x.id !== o.id && x.points.some((p) => samePoint(p, end)),
      );
      if (touching.length !== 1) continue;
      const other = touching[0]!;
      if (
        other.kind !== 'wall' ||
        isClosed(other.points) ||
        other.color !== o.color ||
        other.opacity !== o.opacity
      )
        continue;
      const joined = joinAt(o.points, other.points, end);
      if (!joined) continue;
      plan.patchObstacle(o.id, { points: joined });
      plan.removeObstacle(other.id);
      merged = true;
      break;
    }
    if (!merged) return current;
    current = o.id;
  }
  return current;
}

/** Joint deux lignes qui se touchent bout à bout en `at`. */
function joinAt(a: Pts, b: Pts, at: Point): Point[] | null {
  const aEnd = samePoint(a[a.length - 1]!, at);
  const aStart = samePoint(a[0]!, at);
  const bStart = samePoint(b[0]!, at);
  const bEnd = samePoint(b[b.length - 1]!, at);
  if (!(aEnd || aStart) || !(bStart || bEnd)) return null;
  const A = aEnd ? [...a] : [...a].reverse();
  const B = bStart ? [...b] : [...b].reverse();
  return [...A, ...B.slice(1)];
}

// ─── Pièces depuis des murs ──────────────────────────────────────────────────

/** Contour d'une boucle fermée formée par ces murs, ou null. */
export function loopOf(obstacles: Iterable<ObstacleData>): Point[] | null {
  const segments: [Point, Point][] = [];
  for (const o of obstacles) segments.push(...polylineSegments(o.points));
  return findLoop(segments);
}

/** Sommets d'une pièce soudés aux murs : les points de murs sur son contour y entrent. */
export function weldRoomToWalls(plan: EditPlan, roomId: string) {
  const r = plan.room(roomId);
  if (!r) return;
  const next = insertVerticesOnPolygon(r.points, allVertices(plan));
  if (next) plan.patchRoom(roomId, { points: next });
}
