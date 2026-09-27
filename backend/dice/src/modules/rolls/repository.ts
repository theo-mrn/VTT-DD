/**
 * Jets en base : visibilité, forme de l'API, écriture avec son événement.
 *
 * Visibilité d'un jet de campagne, pour un appelant de rôle `role` :
 *  - public  : tous les membres ;
 *  - private : l'auteur et le MJ ;
 *  - gm      : le MJ ; l'auteur voit seulement qu'il a lancé (`hidden`, sans résultat) ;
 *  - self    : l'auteur seul, MJ compris.
 * Un jet sans campagne est personnel : son auteur seul le voit.
 */
import { uuidv7, type ActorRole, type Visibility as EventVisibility } from '@vtt/contracts';
import { and, eq, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import type { CampaignRole } from '../../clients/campaign.js';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { rolls, type RollRow, type RollVisibility } from '../../db/schema.js';
import { flatResults } from '../../engine/roll.js';
import type { RollApi } from '../schemas.js';

/** Qui consulte : utilisateur et rôle dans la campagne du jet (null hors campagne). */
export interface Viewer {
  userId: string;
  role: CampaignRole | null;
}

/**
 * Jets visibles par `viewer` dans `campaignId` (null : ses jets personnels).
 * `withResults` : seulement ceux dont il voit aussi le résultat (statistiques).
 */
export function visibleTo(viewer: Viewer, campaignId: string | null, withResults = false): SQL {
  if (!campaignId) return and(isNull(rolls.campaignId), eq(rolls.authorId, viewer.userId))!;
  const inCampaign = eq(rolls.campaignId, campaignId);
  const mine = eq(rolls.authorId, viewer.userId);
  if (viewer.role === 'gm') return and(inCampaign, or(ne(rolls.visibility, 'self'), mine))!;
  return and(
    inCampaign,
    or(eq(rolls.visibility, 'public'), withResults ? and(mine, ne(rolls.visibility, 'gm')) : mine),
  )!;
}

/** Même règle que `visibleTo`, pour un jet déjà lu. */
export function canSee(row: RollRow, viewer: Viewer): boolean {
  const mine = row.authorId === viewer.userId;
  if (!row.campaignId) return mine;
  if (row.visibility === 'public' || mine) return true;
  return viewer.role === 'gm' && row.visibility !== 'self';
}

/** L'auteur d'un jet caché au MJ (hors MJ) ne voit pas son résultat. */
export const isHidden = (row: RollRow, viewer: Viewer) =>
  row.visibility === 'gm' && viewer.role !== 'gm';

/**
 * Ancien champ `type` : conservé pour les jets importés, sinon déduit de la
 * source. Comme l'ancienne app (`show3DAnimations ? 'Dice Roller' : 'Dice
 * Roller/API'`) : « Dice Roller » quand l'animation 3D a fait foi, « Dice
 * Roller/API » pour un jet tiré sans elle (par le serveur).
 */
const LEGACY_TYPES: Record<RollRow['source'], string> = {
  '3d': 'Dice Roller',
  mixed: 'Dice Roller',
  free: 'Dice Roller/API',
  api: 'Dice Roller/API',
  action: 'Action',
  import: 'Dice Roller',
};

export function toApi(r: RollRow, viewer: Viewer): RollApi {
  const hidden = isHidden(r, viewer);
  return {
    id: r.id,
    campaignId: r.campaignId,
    uid: r.authorId,
    userName: r.authorName,
    userAvatar: r.authorAvatarUrl,
    persoId: r.characterId,
    isPrivate: r.visibility === 'private' || r.visibility === 'self',
    isBlind: r.visibility === 'gm',
    diceCount: r.diceCount,
    diceFaces: r.diceFaces,
    modifier: 0,
    results: hidden ? [] : flatResults(r.dice, r.symbols),
    total: hidden ? null : r.total,
    notation: r.notation,
    output: hidden ? '' : r.output,
    symbolResult: hidden ? null : r.symbolResult,
    type: r.legacyType ?? LEGACY_TYPES[r.source],
    timestamp: r.createdAt.getTime(),
    source: r.source,
    visibility: r.visibility,
    hidden,
    label: r.label,
    actionId: r.actionId,
    systemId: r.systemId,
    dice: hidden ? [] : r.dice,
    symbols: hidden ? null : (r.symbols ?? null),
    outcome: hidden ? null : r.outcome,
    explanations: hidden ? [] : r.explanations,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Visibilité de l'événement (enveloppe commune) : public ; private et gm →
 * gm_only (l'auteur est `actor.userId`) ; self et jet personnel → owner.
 */
export function eventVisibility(row: Pick<RollRow, 'campaignId' | 'visibility'>): EventVisibility {
  if (!row.campaignId || row.visibility === 'self') return 'owner';
  return row.visibility === 'public' ? 'public' : 'gm_only';
}

/** Forme d'un jet dans les événements : complète, sans masquage (la visibilité de l'enveloppe filtre). */
function eventPayload(row: RollRow) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    authorId: row.authorId,
    userName: row.authorName,
    characterId: row.characterId,
    source: row.source,
    actionId: row.actionId,
    label: row.label,
    notation: row.notation,
    systemId: row.systemId,
    visibility: row.visibility,
    dice: row.dice,
    symbols: row.symbols,
    results: flatResults(row.dice, row.symbols),
    total: row.total,
    output: row.output,
    symbolResult: row.symbolResult,
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Rôle de l'auteur d'un événement : gm ou player dans une campagne, user hors campagne. */
export const actorRole = (v: Viewer): ActorRole =>
  v.role === 'gm' ? 'gm' : v.role ? 'player' : 'user';

export type NewRoll = Omit<typeof rolls.$inferInsert, 'id' | 'createdAt'>;

/** Enregistre un jet et son événement `dice.rolled` dans la même transaction. */
export async function insertRoll(
  tx: Tx,
  ctx: EventContext,
  values: NewRoll,
  role: ActorRole,
): Promise<RollRow> {
  const [row] = await tx
    .insert(rolls)
    .values({ ...values, id: uuidv7() })
    .returning();
  await appendEvent(tx, ctx, {
    type: 'dice.rolled',
    actor: {
      userId: row!.authorId,
      role,
      characterId: row!.characterId,
    },
    aggregate: { type: 'roll', id: row!.id },
    payload: eventPayload(row!),
    visibility: eventVisibility(row!),
    campaignId: row!.campaignId,
  });
  return row!;
}

/** Supprime un jet et publie `dice.roll_deleted`. */
export async function deleteRoll(
  tx: Tx,
  ctx: EventContext,
  row: RollRow,
  by: Viewer,
): Promise<void> {
  await tx.delete(rolls).where(eq(rolls.id, row.id));
  await appendEvent(tx, ctx, {
    type: 'dice.roll_deleted',
    actor: { userId: by.userId, role: actorRole(by), characterId: null },
    aggregate: { type: 'roll', id: row.id },
    payload: { id: row.id, campaignId: row.campaignId, authorId: row.authorId },
    visibility: eventVisibility(row),
    campaignId: row.campaignId,
  });
}

/**
 * Vide l'historique d'une campagne (MJ) : tous ses jets, importés et d'action
 * compris, en une requête, et un seul événement `dice.history_cleared`
 * (seulement s'il y avait des jets). Renvoie le nombre de jets supprimés.
 */
export async function clearCampaignHistory(
  tx: Tx,
  ctx: EventContext,
  campaignId: string,
  by: Viewer,
): Promise<number> {
  const deleted = await tx
    .delete(rolls)
    .where(eq(rolls.campaignId, campaignId))
    .returning({ id: rolls.id });
  if (deleted.length) {
    await appendEvent(tx, ctx, {
      type: 'dice.history_cleared',
      actor: { userId: by.userId, role: actorRole(by), characterId: null },
      aggregate: { type: 'campaign', id: campaignId },
      payload: { campaignId, deleted: deleted.length, userId: by.userId },
      visibility: 'public',
      campaignId,
    });
  }
  return deleted.length;
}

/**
 * Vide l'historique personnel d'un utilisateur (ses jets sans campagne), en
 * une requête, et publie un seul événement `dice.history_cleared` pour lui
 * seul (`owner`, sans campagne), seulement s'il y avait des jets. Ses jets de
 * campagne ne sont pas touchés. Renvoie le nombre de jets supprimés.
 */
export async function clearPersonalHistory(
  tx: Tx,
  ctx: EventContext,
  userId: string,
): Promise<number> {
  const deleted = await tx
    .delete(rolls)
    .where(and(isNull(rolls.campaignId), eq(rolls.authorId, userId)))
    .returning({ id: rolls.id });
  if (deleted.length) {
    await appendEvent(tx, ctx, {
      type: 'dice.history_cleared',
      actor: { userId, role: 'user', characterId: null },
      aggregate: { type: 'user', id: userId },
      payload: { campaignId: null, deleted: deleted.length, userId },
      visibility: 'owner',
      campaignId: null,
    });
  }
  return deleted.length;
}

/** Jet déjà enregistré pour cette clé d'idempotence (même auteur). */
export async function findByIdempotencyKey(
  db: Db | Tx,
  authorId: string,
  key: string,
): Promise<RollRow | undefined> {
  const [row] = await db
    .select()
    .from(rolls)
    .where(and(eq(rolls.authorId, authorId), eq(rolls.idempotencyKey, key)));
  return row;
}

/** Jets de l'auteur dans la dernière minute (limite de débit, toutes instances confondues). */
export async function recentRolls(db: Db | Tx, authorId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rolls)
    .where(
      and(eq(rolls.authorId, authorId), sql`${rolls.createdAt} > now() - interval '1 minute'`),
    );
  return r!.n;
}

export type { RollVisibility };
