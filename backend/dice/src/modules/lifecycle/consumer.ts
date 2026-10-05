/**
 * Consommateur durable `dice-lifecycle` (docs/legal.md) :
 *
 * - `identity.user_deleted` : préférences, inventaire de skins, droits reçus de billing et
 *   jets personnels (hors campagne) effacés. Ses jets dans les campagnes des autres restent
 *   au journal de la table sous « Joueur supprimé », sans avatar ; l'identifiant ne mène
 *   plus à aucun compte ;
 * - `campaign.deleted` : les jets de la campagne.
 *
 * Au moins une fois : l'inbox écarte un événement déjà traité.
 */
import {
  CAMPAIGN_DELETED,
  CAMPAIGN_DELETED_SUBJECT,
  USER_DELETED,
  USER_DELETED_SUBJECT,
  type EventEnvelope,
} from '@vtt/contracts';
import { consumeEvents, type Bus, type ConsumeOptions } from '@vtt/platform';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { billingRights, inbox, inventory, preferences, rolls } from '../../db/schema.js';

export const LIFECYCLE_CONSUMER = 'dice-lifecycle';
export const DELETED_AUTHOR = 'Joueur supprimé';

/** Traite un événement ; false si ignoré ou déjà traité. */
export async function handleLifecycleEvent(
  db: Db,
  event: Pick<EventEnvelope, 'id' | 'type' | 'roomId' | 'aggregate'>,
): Promise<boolean> {
  if (event.type !== USER_DELETED && event.type !== CAMPAIGN_DELETED) return false;
  return db.transaction(async (tx) => {
    const [fresh] = await tx
      .insert(inbox)
      .values({ eventId: event.id, consumer: LIFECYCLE_CONSUMER })
      .onConflictDoNothing()
      .returning();
    if (!fresh) return false;

    if (event.type === USER_DELETED) {
      const userId = event.aggregate.id;
      await tx.delete(preferences).where(eq(preferences.userId, userId));
      await tx.delete(inventory).where(eq(inventory.userId, userId));
      await tx.delete(billingRights).where(eq(billingRights.userId, userId));
      await tx.delete(rolls).where(and(eq(rolls.authorId, userId), isNull(rolls.campaignId)));
      // Ses jets dans les campagnes des autres restent au journal de la table, sans nom ni avatar
      // (l'identifiant, exigé par rolls_author, ne mène plus à aucun compte)
      await tx
        .update(rolls)
        .set({ authorName: DELETED_AUTHOR, authorAvatarUrl: null })
        .where(eq(rolls.authorId, userId));
      return true;
    }
    await tx.delete(rolls).where(eq(rolls.campaignId, event.roomId ?? event.aggregate.id));
    return true;
  });
}

export function startLifecycleConsumer(o: {
  bus: Bus;
  db: Db;
  logger: ConsumeOptions['logger'];
}): Promise<() => Promise<void>> {
  return consumeEvents(o.bus, {
    durable: LIFECYCLE_CONSUMER,
    subjects: [USER_DELETED_SUBJECT, CAMPAIGN_DELETED_SUBJECT],
    deliver: 'all',
    ...(o.logger ? { logger: o.logger } : {}),
    handler: async (event) => {
      if (await handleLifecycleEvent(o.db, event))
        o.logger?.info({ type: event.type, id: event.aggregate.id }, 'dés nettoyés');
    },
  });
}
