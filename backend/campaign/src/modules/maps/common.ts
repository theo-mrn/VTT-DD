/**
 * Socle du module « maps » : qui regarde la carte (rôle, personnages), accès
 * à une carte, événements et schémas Zod partagés.
 *
 * Un joueur (ou un spectateur) ne voit que les cartes visibles des joueurs et
 * celle où se trouve un de ses personnages : les autres sont introuvables (404).
 */
import type { Visibility } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, or, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { campaignCharacters, mapTokens, maps, type MapPoint } from '../../db/schema.js';
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

/** Événement de carte, écrit dans l'outbox avec la donnée. */
export function mapEvent(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  e: {
    type: string;
    aggregate: { type: string; id: string };
    payload: Record<string, unknown>;
    visibility?: Visibility;
  },
) {
  return appendEvent(tx, ctx, {
    type: e.type,
    campaignId: v.access.campaign.id,
    actor: { userId: v.userId, role: actorRole(v.access.role), characterId: null },
    aggregate: e.aggregate,
    payload: e.payload,
    visibility: e.visibility ?? 'public',
  });
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

const Coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
export const Point = z.object({ x: Coordinate, y: Coordinate });
export const Points = (min: number, max: number) => z.array(Point).min(min).max(max);

/** Verrou optimiste facultatif : version lue par le client. */
export const Version = z.number().int().positive().optional();

/**
 * Média (image, audio) : URL https ou chemin absolu du site (bibliothèque
 * d'assets). Comme l'ancienne carte, le MJ peut pointer vers un hébergeur tiers.
 */
export const MediaUrl = z
  .string()
  .trim()
  .max(2048, '2048 caractères au plus')
  .refine((u) => /^https:\/\/\S+$/.test(u) || /^\/[^/]\S*$/.test(u), {
    message: 'URL https ou chemin absolu attendu',
  });

export const Color = z.string().trim().max(50);
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

export const iso = (d: Date) => d.toISOString();
