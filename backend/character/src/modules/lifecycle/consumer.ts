/**
 * Consommateur durable `character-lifecycle` (docs/legal.md, docs/nettoyage.md) :
 *
 * - `identity.user_deleted` : ses personnages (joueurs et PNJ dont il est propriétaire) sont
 *   purgés aussitôt, sans corbeille, avec leurs `character.purged` ; ses applications de
 *   combat aussi ;
 * - `campaign.deleted` : les PNJ posés dans la campagne, ses modèles de PNJ et d'objets et
 *   leurs catégories. Supprimer sa campagne est un geste du MJ : c'est le seul cas, avec la
 *   suppression de son compte, où un modèle part sans qu'il le supprime lui-même.
 *
 * Les personnages des joueurs ne dépendent pas d'une campagne ici : ils leur restent. Aucun
 * fichier n'est supprimé : la passe des fichiers orphelins s'en charge. Au moins une fois :
 * l'inbox écarte un événement déjà traité.
 */
import {
  CAMPAIGN_DELETED,
  CAMPAIGN_DELETED_SUBJECT,
  USER_DELETED,
  USER_DELETED_SUBJECT,
  type EventEnvelope,
} from '@vtt/contracts';
import { consumeEvents, type Bus, type Logger } from '@vtt/platform';
import { eq, inArray, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import {
  applications,
  characters,
  inbox,
  npcTemplateCategories,
  npcTemplates,
  objectTemplates,
} from '../../db/schema.js';

export const LIFECYCLE_CONSUMER = 'character-lifecycle';

const SYSTEM = { userId: null, role: 'system', characterId: null } as const;

type Handled = Pick<
  EventEnvelope,
  'id' | 'type' | 'roomId' | 'aggregate' | 'correlationId' | 'traceparent'
>;

/** Traite un événement ; false si ignoré ou déjà traité. */
export async function handleLifecycleEvent(db: Db, event: Handled): Promise<boolean> {
  if (event.type !== USER_DELETED && event.type !== CAMPAIGN_DELETED) return false;
  const ctx: EventContext = { correlationId: event.correlationId, traceparent: event.traceparent };
  return db.transaction(async (tx) => {
    const [fresh] = await tx
      .insert(inbox)
      .values({ eventId: event.id, consumer: LIFECYCLE_CONSUMER })
      .onConflictDoNothing()
      .returning();
    if (!fresh) return false;

    if (event.type === USER_DELETED) {
      const userId = event.aggregate.id;
      await purgeCharacters(tx, ctx, eq(characters.ownerId, userId), 'account_deleted');
      await tx.delete(applications).where(eq(applications.userId, userId));
      return true;
    }

    const campaignId = event.roomId ?? event.aggregate.id;
    await purgeCharacters(tx, ctx, eq(characters.campaignId, campaignId), 'campaign_deleted');
    await tx.delete(npcTemplates).where(eq(npcTemplates.campaignId, campaignId));
    await tx.delete(npcTemplateCategories).where(eq(npcTemplateCategories.campaignId, campaignId));
    await tx.delete(objectTemplates).where(eq(objectTemplates.campaignId, campaignId));
    await tx.delete(applications).where(eq(applications.campaignId, campaignId));
    return true;
  });
}

/** Purge définitive (les tables liées suivent par cascade), un `character.purged` chacun. */
async function purgeCharacters(tx: Tx, ctx: EventContext, where: SQL, reason: string) {
  const rows = await tx
    .select({ id: characters.id, campaignId: characters.campaignId, kind: characters.kind })
    .from(characters)
    .where(where)
    .for('update');
  if (!rows.length) return;
  await tx.delete(characters).where(
    inArray(
      characters.id,
      rows.map((r) => r.id),
    ),
  );
  for (const r of rows)
    await appendEvent(tx, ctx, {
      type: 'character.purged',
      roomId: r.campaignId,
      actor: SYSTEM,
      aggregate: { type: 'character', id: r.id },
      payload: { kind: r.kind, reason },
    });
}

export function startLifecycleConsumer(o: {
  bus: Bus;
  db: Db;
  logger: Logger;
}): Promise<() => Promise<void>> {
  return consumeEvents(o.bus, {
    durable: LIFECYCLE_CONSUMER,
    subjects: [USER_DELETED_SUBJECT, CAMPAIGN_DELETED_SUBJECT],
    deliver: 'all',
    logger: o.logger,
    handler: async (event) => {
      if (await handleLifecycleEvent(o.db, event))
        o.logger.info({ type: event.type, id: event.aggregate.id }, 'personnages nettoyés');
    },
  });
}
