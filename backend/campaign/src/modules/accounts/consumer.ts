/**
 * Consommateur durable `campaign-accounts` : un compte supprimé définitivement
 * (`identity.user_deleted`, docs/legal.md) emporte ce qui lui appartient ici.
 *
 * - ses campagnes de MJ : supprimées comme par `DELETE /v1/campaigns/:id` (la cascade SQL
 *   emporte cartes, notes, combat, documents ; `campaign.deleted` prévient les autres services) ;
 * - dans les campagnes des autres : il les quitte comme par la route de départ (ses personnages
 *   sortent du combat et de la campagne, avec leurs événements) ; ses messages, notes,
 *   épingles, tracés, mesures et notes de carte sont effacés ; ses invitations reçues et
 *   bannissements aussi.
 *
 * Reste, dans les campagnes des autres, l'état de jeu (brouillard, combat, documents) qui ne
 * porte que son identifiant, sans compte derrière. Au moins une fois : l'inbox écarte un
 * événement déjà traité ; tout se fait dans une transaction (une erreur fait relivrer).
 */
import { USER_DELETED, USER_DELETED_SUBJECT, type EventEnvelope } from '@vtt/contracts';
import { consumeEvents, type Bus, type Logger } from '@vtt/platform';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import {
  campaignBans,
  campaignCharacters,
  campaignInvitees,
  campaignMembers,
  campaignMessages,
  campaigns,
  inbox,
  mapDrawings,
  mapMeasurements,
  mapNotes,
  notePins,
  notes,
} from '../../db/schema.js';
import { campaignEvent, lockCampaign } from '../campaigns/repository.js';
import { removeFromCombat } from '../combat/repository.js';

export const ACCOUNTS_CONSUMER = 'campaign-accounts';

/** Traite une suppression de compte ; false si ignorée ou déjà traitée. */
export async function handleUserDeleted(
  db: Db,
  event: Pick<EventEnvelope, 'id' | 'type' | 'aggregate' | 'correlationId' | 'traceparent'>,
): Promise<boolean> {
  if (event.type !== USER_DELETED) return false;
  const userId = event.aggregate.id;
  const ctx: EventContext = { correlationId: event.correlationId, traceparent: event.traceparent };
  return db.transaction(async (tx) => {
    const [fresh] = await tx
      .insert(inbox)
      .values({ eventId: event.id, consumer: ACCOUNTS_CONSUMER })
      .onConflictDoNothing()
      .returning();
    if (!fresh) return false;

    const owned = await tx
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.ownerId, userId));
    for (const c of owned) {
      await lockCampaign(tx, c.id);
      await tx.delete(campaigns).where(eq(campaigns.id, c.id));
      await campaignEvent(tx, ctx, {
        type: 'campaign.deleted',
        campaignId: c.id,
        userId,
        role: 'gm',
        payload: { name: c.name, reason: 'account_deleted' },
      });
    }

    const memberships = await tx
      .select({ campaignId: campaignMembers.campaignId, role: campaignMembers.role })
      .from(campaignMembers)
      .where(eq(campaignMembers.userId, userId));
    for (const m of memberships) await leave(tx, ctx, userId, m.campaignId, m.role);

    await tx.delete(campaignInvitees).where(eq(campaignInvitees.userId, userId));
    await tx.delete(campaignBans).where(eq(campaignBans.userId, userId));
    await tx.delete(campaignMessages).where(eq(campaignMessages.authorId, userId));
    await tx.delete(notePins).where(eq(notePins.userId, userId));
    await tx.delete(notes).where(eq(notes.ownerUserId, userId));
    await tx.delete(mapDrawings).where(eq(mapDrawings.createdBy, userId));
    await tx.delete(mapMeasurements).where(eq(mapMeasurements.createdBy, userId));
    await tx.delete(mapNotes).where(eq(mapNotes.createdBy, userId));
    return true;
  });
}

/** Départ d'une campagne d'un autre MJ : même effet que la route de départ. */
async function leave(
  tx: Tx,
  ctx: EventContext,
  userId: string,
  campaignId: string,
  role: (typeof campaignMembers.$inferSelect)['role'],
) {
  await lockCampaign(tx, campaignId);
  const theirs = await tx
    .select({ characterId: campaignCharacters.characterId })
    .from(campaignCharacters)
    .where(
      and(eq(campaignCharacters.campaignId, campaignId), eq(campaignCharacters.ownerId, userId)),
    );
  const ids = theirs.map((c) => c.characterId);
  const actor = { userId, role };
  if (ids.length) {
    await removeFromCombat(tx, ctx, campaignId, ids, actor);
    await tx
      .delete(campaignCharacters)
      .where(
        and(
          eq(campaignCharacters.campaignId, campaignId),
          inArray(campaignCharacters.characterId, ids),
        ),
      );
    for (const characterId of ids)
      await campaignEvent(tx, ctx, {
        type: 'campaign.character_removed',
        campaignId,
        ...actor,
        payload: { characterId, reason: 'account_deleted' },
      });
  }
  await tx
    .delete(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
  await campaignEvent(tx, ctx, {
    type: 'campaign.member_left',
    campaignId,
    ...actor,
    payload: { userId, role, kicked: false, banned: false, reason: 'account_deleted' },
  });
}

export function startAccountsConsumer(o: {
  bus: Bus;
  db: Db;
  logger: Logger;
}): Promise<() => Promise<void>> {
  return consumeEvents(o.bus, {
    durable: ACCOUNTS_CONSUMER,
    subjects: [USER_DELETED_SUBJECT],
    deliver: 'all',
    logger: o.logger,
    handler: async (event) => {
      if (await handleUserDeleted(o.db, event))
        o.logger.info({ userId: event.aggregate.id }, 'compte supprimé : campagnes nettoyées');
    },
  });
}
