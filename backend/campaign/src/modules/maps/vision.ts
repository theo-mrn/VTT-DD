/**
 * Visibilité côté serveur sur `@vtt/vision` (docs/carte.md § 9, Serveur) : ce qu'un joueur
 * reçoit d'une carte (tokens, objets), à qui envoyer un événement, ligne de vue.
 *
 * - Géométrie (murs, portes, pièces, zones de brouillard, `fogFull`, taille, réglage
 *   d'affichage) préparée une fois et gardée en mémoire par carte (LRU), sous une empreinte
 *   lue à chaque appel : version de la carte et condensé des `(id, version)` des obstacles,
 *   pièces et zones. Toute écriture (réplique voisine, import, mise à l'échelle) change
 *   l'empreinte, donc la scène est refaite. Une scène lue dans une transaction d'écriture sert
 *   mais n'est jamais gardée (elle pourrait être annulée).
 * - Lumières, tokens (observateurs), calques masqués et réglages : relus à chaque appel ; la
 *   scène éclairée (`withLights`) est gardée tant que les lumières ne bougent pas.
 * - Règles : `vision-rules.ts` (miroir exact du client).
 */
import {
  pointInPolygon,
  prepareScene,
  sideOf,
  visibilityPolygon,
  withLights,
  type PreparedScene,
  type Vec,
  type VisionScene,
} from '@vtt/vision';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import {
  campaignCharacters,
  mapFogZones,
  mapLights,
  mapObstacles,
  mapRooms,
  mapTokens,
} from '../../db/schema.js';
import { hiddenLayerIds, mapEvent, mapSettingsOf, type Viewer } from './common.js';
import {
  foggedScene,
  geometryScene,
  lightsKey,
  lightsOf,
  MapVision,
  obstacleSegments,
  occlusionOn,
  type GeometryInput,
  type MemberVision,
  type ObjectVisibility,
  type TokenVisibility,
  type VisionMember,
  type VisionObject,
  type VisionToken,
} from './vision-rules.js';

type Conn = Db | Tx;

// ─── Géométrie en mémoire ────────────────────────────────────────────────────

interface Prepared {
  readonly key: string;
  readonly prep: PreparedScene;
}

interface GeometryEntry {
  readonly stamp: string;
  readonly scene: VisionScene;
  readonly prep: PreparedScene;
  fogged: PreparedScene | null;
  lit: Prepared | null;
  foggedLit: Prepared | null;
}

/** Cartes gardées en mémoire (les plus récemment lues). */
export const VISION_CACHE_SIZE = 64;
const geometries = new Map<string, GeometryEntry>();

/** Vide la mémoire (tests). */
export function clearVisionCache() {
  geometries.clear();
}

interface MapStampRow extends Record<string, unknown> {
  version: number;
  width: number | null;
  height: number | null;
  fog_full: boolean;
  layers: Record<string, unknown> | null;
  obstacles: string;
  rooms: string;
  fog: string;
}

/** Empreinte de la géométrie : ce qui la change change l'empreinte. */
async function geometryStamp(db: Conn, mapId: string) {
  const digest = (table: string, alias: string) =>
    sql.raw(`(SELECT md5(coalesce(string_agg(${alias}.id::text || ':' || ${alias}.version, ','
      ORDER BY ${alias}.id), '')) FROM campaign.${table} ${alias} WHERE ${alias}.map_id = m.id)`);
  const { rows } = await db.execute<MapStampRow>(sql`
    SELECT m.version, m.width, m.height, m.fog_full, m.layers,
           ${digest('map_obstacles', 'o')} AS obstacles,
           ${digest('map_rooms', 'r')} AS rooms,
           ${digest('map_fog_zones', 'z')} AS fog
      FROM campaign.maps m WHERE m.id = ${mapId}`);
  const row = rows[0];
  if (!row) return null;
  return {
    row,
    stamp: [row.version, row.obstacles, row.rooms, row.fog].join('|'),
  };
}

async function loadGeometry(db: Conn, mapId: string, map: MapStampRow): Promise<GeometryInput> {
  const obstacles = await db
    .select({
      id: mapObstacles.id,
      kind: mapObstacles.kind,
      points: mapObstacles.geom,
      blocksFrom: mapObstacles.blocksFrom,
      isOpen: mapObstacles.isOpen,
      opacity: mapObstacles.opacity,
    })
    .from(mapObstacles)
    .where(eq(mapObstacles.mapId, mapId));
  const rooms = await db
    .select({ id: mapRooms.id, points: mapRooms.geom })
    .from(mapRooms)
    .where(eq(mapRooms.mapId, mapId));
  const zones = await db
    .select({
      id: mapFogZones.id,
      shape: mapFogZones.shape,
      mode: mapFogZones.mode,
      points: mapFogZones.geom,
      center: mapFogZones.center,
      radius: mapFogZones.radius,
      order: mapFogZones.seq,
    })
    .from(mapFogZones)
    .where(eq(mapFogZones.mapId, mapId));
  return {
    width: map.width,
    height: map.height,
    fogFull: map.fog_full,
    display: map.layers,
    obstacles,
    rooms,
    fogZones: zones.map((z) => ({ ...z, order: Number(z.order) })),
  };
}

/** Géométrie préparée de la carte (gardée si `store`), ou null si la carte n'existe pas. */
async function geometryOf(db: Conn, mapId: string, store: boolean) {
  const stamped = await geometryStamp(db, mapId);
  if (!stamped) return null;
  const cached = geometries.get(mapId);
  if (cached && cached.stamp === stamped.stamp) {
    // Plus récemment lue : en fin de liste
    geometries.delete(mapId);
    geometries.set(mapId, cached);
    return { entry: cached, store };
  }
  const scene = geometryScene(await loadGeometry(db, mapId, stamped.row));
  const entry: GeometryEntry = {
    stamp: stamped.stamp,
    scene,
    prep: prepareScene(scene),
    fogged: null,
    lit: null,
    foggedLit: null,
  };
  if (store) {
    geometries.delete(mapId);
    geometries.set(mapId, entry);
    while (geometries.size > VISION_CACHE_SIZE) {
      const oldest = geometries.keys().next().value as string;
      geometries.delete(oldest);
    }
  }
  return { entry, store };
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

type TokenRow = typeof mapTokens.$inferSelect;

export const visionToken = (t: TokenRow, side: string | null): VisionToken => ({
  id: t.id,
  characterId: t.characterId,
  pos: t.pos,
  scale: t.scale,
  visionRadius: t.visionRadius,
  visibility: t.visibility as TokenVisibility,
  visibleTo: t.visibleTo,
  layerId: t.layerId,
  playerSide: side === 'players',
});

/** Objet de la carte (ligne ou élément d'API) vu par les règles. */
export const visionObject = (o: Record<string, unknown>): VisionObject => ({
  id: o.id as string,
  kind: String(o.kind ?? 'decor'),
  pos: o.pos as Vec,
  width: Number(o.width ?? 0),
  height: Number(o.height ?? 0),
  rotation: Number(o.rotation ?? 0),
  visibility: (o.visibility ?? 'visible') as ObjectVisibility,
  visibleTo: (o.visibleTo as string[] | undefined) ?? [],
  layerId: (o.layerId as string | null | undefined) ?? null,
});

/** Tokens présents sur la carte, avec le camp de leur personnage. */
async function presentTokens(db: Conn, mapId: string) {
  const rows = await db
    .select({ token: mapTokens, side: campaignCharacters.side })
    .from(mapTokens)
    .leftJoin(
      campaignCharacters,
      and(
        eq(campaignCharacters.campaignId, mapTokens.campaignId),
        eq(campaignCharacters.characterId, mapTokens.characterId),
      ),
    )
    .where(and(eq(mapTokens.mapId, mapId), eq(mapTokens.present, true)));
  return rows.map((r) => visionToken(r.token, r.side));
}

/** Transaction Drizzle (elle a `rollback`) : ce qu'on y lit peut être annulé. */
const inTransaction = (db: Conn) => 'rollback' in db;

/**
 * Visibilité d'une carte, lue maintenant : géométrie (mémoire), lumières, tokens, calques
 * masqués, échelle. Hors transaction, la scène lue peut être gardée en mémoire.
 */
export async function loadMapVision(
  db: Conn,
  mapId: string,
  campaignId: string,
): Promise<MapVision | null> {
  const store = !inTransaction(db);
  const geometry = await geometryOf(db, mapId, store);
  if (!geometry) return null;
  const { entry } = geometry;
  const tokens = await presentTokens(db, mapId);
  const lightRows = await db.select().from(mapLights).where(eq(mapLights.mapId, mapId));
  const hiddenLayers = await hiddenLayerIds(db, mapId);
  const { pixelsPerUnit, tokenScale } = await mapSettingsOf(db, campaignId);
  const byId = new Map(tokens.map((t) => [t.id, t.pos]));
  const lights = lightsOf(lightRows, (id) => byId.get(id), pixelsPerUnit);
  const key = lightsKey(lights);
  const lit = (base: PreparedScene, slot: 'lit' | 'foggedLit'): PreparedScene => {
    const known = entry[slot];
    if (known && known.key === key) return known.prep;
    const prep = withLights(base, lights);
    if (store) entry[slot] = { key, prep };
    return prep;
  };
  return new MapVision({
    prep: lit(entry.prep, 'lit'),
    fogged: () => {
      const base = (entry.fogged ??= prepareScene(foggedScene(entry.scene)));
      return lit(base, 'foggedLit');
    },
    tokens,
    hiddenLayers,
    pixelsPerUnit,
    tokenScale,
  });
}

/** Ce que voit l'appelant sur une carte ; null pour le MJ (il voit tout). */
export async function viewerVision(
  db: Conn,
  v: Viewer,
  mapId: string,
): Promise<MemberVision | null> {
  if (v.isGm) return null;
  const vision = await loadMapVision(db, mapId, v.access.campaign.id);
  if (!vision) return null;
  return vision.forMember({ userId: v.userId, characterIds: v.characterIds });
}

/**
 * Membres non MJ de la campagne et les personnages qu'ils possèdent ou incarnent (même règle
 * que `viewerOf`) : ceux à qui un événement de carte peut être destiné.
 */
export async function campaignPlayers(db: Conn, campaignId: string): Promise<VisionMember[]> {
  const { rows } = await db.execute<{ user_id: string; characters: string[] | null }>(sql`
    SELECT m.user_id,
           array_remove(array_agg(DISTINCT cc.character_id), NULL)::text[] AS characters
      FROM campaign.campaign_members m
      LEFT JOIN campaign.campaign_characters cc
        ON cc.campaign_id = m.campaign_id
       AND (cc.owner_id = m.user_id OR cc.played_by = m.user_id)
     WHERE m.campaign_id = ${campaignId} AND m.role <> 'gm'
     GROUP BY m.user_id
     ORDER BY m.user_id`);
  return rows.map((r) => ({ userId: r.user_id, characterIds: r.characters ?? [] }));
}

// ─── Audience des événements ─────────────────────────────────────────────────

/** Qui reçoit un élément : tous les membres, ou ces joueurs seulement (en plus des MJ). */
export interface Audience {
  readonly public: boolean;
  /** Joueurs qui le voient (tous si `public`). */
  readonly users: readonly string[];
  /** Tous les membres non MJ de la campagne. */
  readonly everyone: readonly string[];
}

const nobody = (members: readonly VisionMember[]): Audience => ({
  public: false,
  users: [],
  everyone: members.map((m) => m.userId),
});

function audienceFrom(
  members: readonly VisionMember[],
  sees: (m: VisionMember) => boolean,
): Audience {
  const users = members.filter(sees).map((m) => m.userId);
  return {
    public: members.length > 0 && users.length === members.length,
    users,
    everyone: members.map((m) => m.userId),
  };
}

/** Joueurs qui reçoivent ce token, d'après l'état actuel de la transaction. */
export async function tokenAudience(
  tx: Conn,
  map: { id: string; campaignId: string },
  tokenId: string,
): Promise<Audience> {
  const members = await campaignPlayers(tx, map.campaignId);
  if (!members.length) return nobody(members);
  const vision = await loadMapVision(tx, map.id, map.campaignId);
  const token = vision?.tokens.find((t) => t.id === tokenId);
  if (!vision || !token) return nobody(members);
  return audienceFrom(members, (m) => vision.forMember(m).seesToken(token));
}

/** Joueurs qui reçoivent cet objet (ligne ou élément d'API), dans l'état actuel. */
export async function objectAudience(
  tx: Conn,
  map: { id: string; campaignId: string },
  object: Record<string, unknown>,
): Promise<Audience> {
  const members = await campaignPlayers(tx, map.campaignId);
  if (!members.length) return nobody(members);
  const o = visionObject(object);
  // Sans ligne de vue en jeu : pas besoin de charger la scène
  const hidden = o.layerId ? await hiddenLayerIds(tx, map.id) : new Set<string>();
  if ((o.layerId && hidden.has(o.layerId)) || o.visibility === 'hidden') return nobody(members);
  if (o.visibility === 'custom' || o.kind === 'decor')
    return audienceFrom(
      members,
      (m) => o.kind === 'decor' || o.visibleTo.some((id) => m.characterIds.includes(id)),
    );
  const vision = await loadMapVision(tx, map.id, map.campaignId);
  if (!vision) return nobody(members);
  return audienceFrom(members, (m) => vision.forMember(m).seesObject(o));
}

/** Joueurs qui voyaient l'élément avant mais plus après : ils reçoivent `*.hidden`. */
export function lostSight(before: Audience, after: Audience | null): string[] {
  const now = new Set(after?.users ?? []);
  return before.users.filter((u) => !now.has(u));
}

/** Visibilité et destinataires d'un événement pour cette audience. */
export const eventTarget = (a: Audience) =>
  a.public
    ? ({ visibility: 'public' } as const)
    : ({ visibility: 'gm_only', toUsers: a.users } as const);

// ─── Prévenir les joueurs de relire ──────────────────────────────────────────

/** Joueurs déjà prévenus dans une transaction (un seul `map.visibility_changed` chacun). */
const notified = new WeakMap<object, Map<string, Set<string>>>();

/**
 * `map.visibility_changed { mapId }` : un observateur, une porte, un mur, une pièce, une zone
 * ou une lumière a changé ; ces joueurs (tous par défaut) relisent tokens et objets, que le
 * serveur filtre autrement. Au plus un par joueur, par carte et par transaction.
 */
export async function notifyVisibilityChanged(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  map: { id: string; campaignId: string },
  users?: readonly string[],
) {
  const members = await campaignPlayers(tx, map.campaignId);
  const byMap = notified.get(tx) ?? new Map<string, Set<string>>();
  notified.set(tx, byMap);
  const done = byMap.get(map.id) ?? new Set<string>();
  byMap.set(map.id, done);
  const wanted = users ? new Set(users) : null;
  const targets = members
    .map((m) => m.userId)
    .filter((u) => (!wanted || wanted.has(u)) && !done.has(u));
  if (!targets.length) return;
  for (const u of targets) done.add(u);
  const everyone = targets.length === members.length;
  await mapEvent(tx, ctx, v, {
    type: 'map.visibility_changed',
    aggregate: { type: 'map', id: map.id },
    payload: { mapId: map.id },
    ...(everyone ? { visibility: 'public' } : { visibility: 'gm_only', toUsers: targets }),
  });
}

/**
 * Joueurs dont ce token est un observateur (propriétaire et incarnateur, ou tous pour un
 * allié), et tous si une lumière le suit : leur vue change quand il bouge.
 */
export async function observersUsers(
  tx: Conn,
  map: { id: string; campaignId: string },
  t: { id: string; characterId: string; visibility: string },
): Promise<readonly string[] | 'all' | null> {
  const [torch] = await tx
    .select({ id: mapLights.id })
    .from(mapLights)
    .where(and(eq(mapLights.mapId, map.id), eq(mapLights.attachedTokenId, t.id)))
    .limit(1);
  if (torch || t.visibility === 'ally') return 'all';
  if (t.visibility === 'invisible') return null;
  const members = await campaignPlayers(tx, map.campaignId);
  const users = members.filter((m) => m.characterIds.includes(t.characterId)).map((m) => m.userId);
  return users.length ? users : null;
}

// ─── Ligne de vue ────────────────────────────────────────────────────────────

/**
 * Le segment `from → to` est-il coupé ? `blocked` : `to` hors de la ligne de vue depuis
 * `from` (murs soudés, portes fermées, sens unique vu depuis `from`, bords de la carte) ;
 * `obstacleIds` : les obstacles qui bloquent et que le segment traverse.
 */
export async function lineOfSight(db: Conn, mapId: string, from: Vec, to: Vec) {
  const geometry = await geometryOf(db, mapId, !inTransaction(db));
  if (!geometry) return { blocked: false, obstacleIds: [] as string[] };
  const { entry } = geometry;
  const los = visibilityPolygon(entry.prep, from);
  const blocked = !pointInPolygon(to, los);
  if (!occlusionOn(await displayOf(db, mapId))) return { blocked, obstacleIds: [] as string[] };
  const ids = new Set<string>();
  const obstacles = await db
    .select({
      id: mapObstacles.id,
      kind: mapObstacles.kind,
      points: mapObstacles.geom,
      blocksFrom: mapObstacles.blocksFrom,
      isOpen: mapObstacles.isOpen,
      opacity: mapObstacles.opacity,
    })
    .from(mapObstacles)
    .where(eq(mapObstacles.mapId, mapId))
    .orderBy(mapObstacles.id);
  for (const o of obstacles)
    for (const s of obstacleSegments(o)) {
      if (s.kind === 'window' || (s.kind === 'door' && s.open) || (s.opacity ?? 1) < 1) continue;
      if (s.kind === 'one_way_wall' && sideOf(s.a, s.b, from) !== (s.blocksFrom ?? 'left'))
        continue;
      if (segmentsCross(s.a, s.b, from, to)) ids.add(o.id);
    }
  return { blocked, obstacleIds: [...ids] };
}

async function displayOf(db: Conn, mapId: string) {
  const { rows } = await db.execute<{ layers: Record<string, unknown> | null }>(
    sql`SELECT layers FROM campaign.maps WHERE id = ${mapId}`,
  );
  return rows[0]?.layers ?? null;
}

const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Les segments [a, b] et [c, d] se touchent-ils (extrémités comprises) ? */
function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec) {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
    return true;
  const on = (p: Vec, q: Vec, r: Vec) =>
    Math.min(p.x, q.x) <= r.x &&
    r.x <= Math.max(p.x, q.x) &&
    Math.min(p.y, q.y) <= r.y &&
    r.y <= Math.max(p.y, q.y);
  return (
    (d1 === 0 && on(c, d, a)) ||
    (d2 === 0 && on(c, d, b)) ||
    (d3 === 0 && on(a, b, c)) ||
    (d4 === 0 && on(a, b, d))
  );
}
