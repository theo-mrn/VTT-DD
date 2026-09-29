/**
 * Socle du module « maps » : qui regarde la carte (rôle, personnages), accès
 * à une carte, événements et schémas Zod partagés.
 *
 * Un joueur (ou un spectateur) ne voit que les cartes visibles des joueurs et
 * celle où se trouve un de ses personnages : les autres sont introuvables (404).
 */
import {
  ExpectedVersion,
  MapColor,
  MapPoint,
  mapPoints,
  MediaUrl as ContractMediaUrl,
  type Visibility,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { campaignCharacters, mapLayers, mapSettings, mapTokens, maps } from '../../db/schema.js';
import { access, actorRole, type Access } from '../campaigns/repository.js';
import { CampaignId, currentUser, eventContext, Uuid } from '../schemas.js';

export type MapRow = typeof maps.$inferSelect;

/** Appelant et ce qui décide de ce qu'il voit. */
export interface Viewer {
  access: Access;
  userId: string;
  isGm: boolean;
  /** Personnages dont il est propriétaire ou qu'il incarne dans la campagne. */
  characterIds: string[];
}

export async function viewerOf(db: Db | Tx, campaignId: string, userId: string): Promise<Viewer> {
  const a = await access(db, campaignId, userId);
  const own = await db
    .select({ id: campaignCharacters.characterId })
    .from(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, a.campaign.id),
        or(eq(campaignCharacters.ownerId, userId), eq(campaignCharacters.playedBy, userId)),
      ),
    );
  return { access: a, userId, isGm: a.role === 'gm', characterIds: own.map((c) => c.id) };
}

export const mapNotFound = () =>
  new HttpError(404, 'Ressource introuvable', 'map_not_found', 'Carte introuvable');

export const notFound = (what: string) =>
  new HttpError(404, 'Ressource introuvable', 'not_found', `${what} introuvable`);

export const versionConflict = () =>
  HttpError.conflict('L’élément a été modifié entre-temps : rechargez-le', 'version_conflict');

export function requireGm(v: Viewer) {
  if (!v.isGm) throw HttpError.forbidden('Réservé au MJ de la campagne');
}

export function requireWriter(v: Viewer) {
  if (v.access.role === 'spectator')
    throw HttpError.forbidden('Un spectateur ne modifie pas la carte');
}

/** Carte de la campagne visible par l'appelant (verrouillée si `lock`), sinon 404. */
export async function loadMap(db: Db | Tx, v: Viewer, mapId: string, lock = false) {
  const query = db
    .select()
    .from(maps)
    .where(and(eq(maps.id, mapId), eq(maps.campaignId, v.access.campaign.id)));
  const [map] = lock ? await query.for('update') : await query;
  if (!map || !(await canSeeMap(db, v, map))) throw mapNotFound();
  return map;
}

/** MJ : toutes ; joueur : cartes visibles des joueurs et celles où se trouve un de ses personnages. */
export async function canSeeMap(db: Db | Tx, v: Viewer, map: MapRow) {
  if (v.isGm || map.visibleToPlayers) return true;
  if (!v.characterIds.length) return false;
  const [here] = await db
    .select({ id: mapTokens.id })
    .from(mapTokens)
    .where(
      and(
        eq(mapTokens.mapId, map.id),
        eq(mapTokens.present, true),
        sql`${mapTokens.characterId} = any(${sqlUuids(v.characterIds)})`,
      ),
    )
    .limit(1);
  return !!here;
}

/** Tableau d'uuid pour `= any(…)` et `&&`. */
export const sqlUuids = (ids: string[]) => sql`${`{${ids.join(',')}}`}::uuid[]`;

/**
 * Utilisateurs (propriétaires ou incarnateurs) des personnages donnés : même
 * règle que `viewerOf`, pour que le temps réel cible les mêmes joueurs que la lecture.
 */
async function usersOfCharacters(tx: Tx, campaignId: string, characterIds: string[]) {
  if (!characterIds.length) return [];
  const rows = await tx
    .select({ ownerId: campaignCharacters.ownerId, playedBy: campaignCharacters.playedBy })
    .from(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignId),
        sql`${campaignCharacters.characterId} = any(${sqlUuids(characterIds)})`,
      ),
    );
  return [...new Set(rows.flatMap((r) => (r.playedBy ? [r.ownerId, r.playedBy] : [r.ownerId])))];
}

/**
 * Événement de carte, écrit dans l'outbox avec la donnée. Un événement `gm_only` d'un
 * élément en visibilité `custom` reçoit aussi `visibleToUsers` (propriétaires et
 * incarnateurs des personnages de `visibleTo`) : realtime l'envoie à ces joueurs en plus
 * des MJ. `restricted` : réservé aux MJ quoi qu'il arrive (élément d'un calque masqué).
 */
export async function mapEvent(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  e: {
    type: string;
    aggregate: { type: string; id: string };
    payload: Record<string, unknown>;
    visibility?: Visibility;
    restricted?: boolean;
  },
) {
  const visibility = e.visibility ?? 'public';
  const characterIds =
    !e.restricted && e.payload.visibility === 'custom' && Array.isArray(e.payload.visibleTo)
      ? e.payload.visibleTo.filter((id): id is string => typeof id === 'string')
      : [];
  const payload =
    visibility === 'gm_only' && characterIds.length
      ? {
          ...e.payload,
          visibleToUsers: await usersOfCharacters(tx, v.access.campaign.id, characterIds),
        }
      : e.payload;
  return appendEvent(tx, ctx, {
    type: e.type,
    campaignId: v.access.campaign.id,
    actor: { userId: v.userId, role: actorRole(v.access.role), characterId: null },
    aggregate: e.aggregate,
    payload,
    visibility,
  });
}

// ─── Calques du MJ ───────────────────────────────────────────────────────────

/** Calques de la carte masqués aux joueurs : leur contenu ne leur est jamais envoyé. */
export async function hiddenLayerIds(db: Db | Tx, mapId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: mapLayers.id })
    .from(mapLayers)
    .where(and(eq(mapLayers.mapId, mapId), eq(mapLayers.visibleToPlayers, false)));
  return new Set(rows.map((r) => r.id));
}

export const unknownLayer = () =>
  new HttpError(422, 'Refusé', 'unknown_layer', 'Calque introuvable sur cette carte');

/**
 * Calque cible d'un élément : de cette carte (422 sinon) ; pour un joueur, ni verrouillé
 * ni masqué (403). `null` : aucun calque (annotation).
 */
export async function checkLayer(db: Db | Tx, v: Viewer, mapId: string, layerId: unknown) {
  if (layerId == null) return;
  const [layer] = await db
    .select()
    .from(mapLayers)
    .where(and(eq(mapLayers.id, layerId as string), eq(mapLayers.mapId, mapId)));
  if (!layer || (!v.isGm && !layer.visibleToPlayers)) throw unknownLayer();
  if (!v.isGm && layer.locked) throw HttpError.forbidden('Ce calque est verrouillé');
}

/** Contexte d'une requête : appelant et contexte d'événement. */
export const requestContext = (req: FastifyRequest) => ({
  userId: currentUser(req),
  ctx: eventContext(req),
});

// ─── Schémas Zod ─────────────────────────────────────────────────────────────

export const MapId = Uuid('Identifiant de carte invalide');
export const ItemId = Uuid('Identifiant invalide');
export const MapParams = z.object({ id: CampaignId, mapId: MapId });
export const ItemParams = z.object({ id: CampaignId, mapId: MapId, itemId: ItemId });

export const Point = MapPoint;
export const Points = mapPoints;

/** Verrou optimiste facultatif : version lue par le client. */
export const Version = ExpectedVersion;

/** Média (image, audio, vidéo) : URL https ou chemin absolu du site (contrat de la carte). */
export const MediaUrl = ContractMediaUrl;

export const Color = MapColor;
export const Name = z.string().trim().max(200);

/** Rectangle d'affichage `x1,y1,x2,y2` (?bbox=) : ne renvoie que ce qui le touche. */
export const Bbox = z
  .string()
  .regex(/^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/, 'bbox attendu : x1,y1,x2,y2')
  .transform((s) => s.split(',').map(Number) as [number, number, number, number]);

export const envelope = (b: [number, number, number, number]) =>
  sql`ST_MakeEnvelope(${Math.min(b[0], b[2])}, ${Math.min(b[1], b[3])}, ${Math.max(b[0], b[2])}, ${Math.max(b[1], b[3])}, 0)`;

/** Point SQL (paramètres numériques). */
export const sqlPoint = (p: MapPoint) =>
  sql`ST_SetSRID(ST_MakePoint(${p.x}::float8, ${p.y}::float8), 0)`;

/** Polygone approché d'un cercle (zone de brouillard) : index spatial et fenêtre d'affichage. */
export const sqlCircle = (center: MapPoint, radius: number) =>
  sql`ST_Buffer(${sqlPoint(center)}, ${radius}::float8, 'quad_segs=16')`;

/**
 * Le point `p` (expression SQL) est-il sous le brouillard de la carte `mapId` ? La dernière
 * zone qui le couvre (`seq`) décide (`fog` ou `clear`), sinon `maps.fog_full`. Un cercle
 * se teste sur son centre et son rayon exacts.
 */
export const sqlInFog = (mapId: SQL | string, p: SQL) => sql`coalesce((
  SELECT z.mode = 'fog' FROM campaign.map_fog_zones z
   WHERE z.map_id = ${mapId}
     AND CASE WHEN z.shape = 'circle' THEN ST_DWithin(z.center, ${p}, z.radius)
              ELSE ST_Covers(z.geom, ${p}) END
   ORDER BY z.seq DESC LIMIT 1),
  (SELECT m.fog_full FROM campaign.maps m WHERE m.id = ${mapId}), false)`;

/**
 * L'obstacle `o` (alias SQL) coupe-t-il la vue de l'œil `eye` vers `target` ? Mur opaque
 * (`opacity` 1), porte fermée, ou mur à sens unique vu depuis son côté bloquant (premier
 * segment : gauche si `cross(b − a, eye − a) < 0`). Une fenêtre, un mur translucide ou une
 * porte ouverte laissent voir. Passage à @vtt/vision au lot 2 (docs/carte.md § 9).
 */
export const sqlBlocksSight = (eye: SQL, target: SQL) => sql`(
  (o.kind = 'wall' AND o.opacity >= 1)
  OR (o.kind = 'door' AND NOT o.is_open)
  OR (o.kind = 'one_way_wall' AND (
    (ST_X(ST_PointN(o.geom, 2)) - ST_X(ST_PointN(o.geom, 1))) * (ST_Y(${eye}) - ST_Y(ST_PointN(o.geom, 1)))
    - (ST_Y(ST_PointN(o.geom, 2)) - ST_Y(ST_PointN(o.geom, 1))) * (ST_X(${eye}) - ST_X(ST_PointN(o.geom, 1)))
  ) * CASE WHEN o.blocks_from = 'right' THEN -1 ELSE 1 END < 0)
) AND ST_Intersects(o.geom, ST_MakeLine(${eye}, ${target}))`;

// ─── Réglages de carte ───────────────────────────────────────────────────────

type SettingsRow = typeof mapSettings.$inferSelect;
export const settingsApi = (campaignId: string, s: SettingsRow | undefined) => ({
  campaignId,
  partyMapId: s?.partyMapId ?? null,
  tokenScale: s?.tokenScale ?? 1,
  pixelsPerUnit: s?.pixelsPerUnit ?? 50,
  unitName: s?.unitName ?? 'm',
  shadowOpacity: s?.shadowOpacity ?? 1,
  dungeonMode: s?.dungeonMode ?? false,
  music: s?.music ?? null,
  version: s?.version ?? 0,
});

/** Réglages de carte de la campagne (valeurs par défaut sans réglage enregistré). */
export async function mapSettingsOf(db: Db | Tx, campaignId: string) {
  const [s] = await db.select().from(mapSettings).where(eq(mapSettings.campaignId, campaignId));
  return settingsApi(campaignId, s);
}

export const iso = (d: Date) => d.toISOString();
