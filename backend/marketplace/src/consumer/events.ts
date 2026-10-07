/**
 * Consommateur durable `marketplace-events` (docs/marketplace.md § 6.3) :
 *
 *   billing.marketplace_sale_completed   acquisition « purchase »
 *   billing.marketplace_sale_refunded    acquisition révoquée (remboursement)
 *   billing.marketplace_sale_disputed    acquisition révoquée (contestation)
 *   billing.connect_account_updated      créateur prêt (ou non) à encaisser
 *   identity.user_deleted                ce qui appartient au compte (docs/marketplace.md § 9)
 *
 * Au moins une fois : l'identifiant de l'événement entre dans l'inbox dans la transaction de
 * l'effet ; une relivraison est reconnue et ignorée. Un événement illisible est consommé sans
 * effet (journalisé) : il ne doit pas bloquer les suivants.
 */
import {
  CONNECT_ACCOUNT_UPDATED,
  ConnectAccountUpdated,
  MARKETPLACE_EVENTS,
  MARKETPLACE_SALE_COMPLETED,
  MARKETPLACE_SALE_DISPUTED,
  MARKETPLACE_SALE_REFUNDED,
  MarketplaceSale,
  USER_DELETED,
  USER_DELETED_SUBJECT,
  type EventEnvelope,
} from '@vtt/contracts';
import { consumeEvents, type Bus } from '@vtt/platform';
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { appendEvent, type Tx } from '../db/outbox.js';
import {
  acquisitions,
  creators,
  inbox,
  installs,
  listings,
  reports,
  reviews,
} from '../db/schema.js';
import { SYSTEM } from '../modules/common.js';

export const SUBJECTS = [
  `vtt.global.${MARKETPLACE_SALE_COMPLETED}`,
  `vtt.global.${MARKETPLACE_SALE_REFUNDED}`,
  `vtt.global.${MARKETPLACE_SALE_DISPUTED}`,
  `vtt.global.${CONNECT_ACCOUNT_UPDATED}`,
  USER_DELETED_SUBJECT,
];

export type Outcome = 'applied' | 'duplicate' | 'ignored';

const listingAggregate = (id: string) => ({ type: 'marketplace_listing', id });

/** Contexte des événements écrits en réaction : la même corrélation, causés par la source. */
const contextOf = (event: EventEnvelope) => ({
  correlationId: event.correlationId,
  traceparent: event.traceparent,
});

/** Réserve l'événement dans l'inbox ; false s'il est déjà traité. */
async function fresh(tx: Tx, consumer: string, eventId: string): Promise<boolean> {
  const [row] = await tx
    .insert(inbox)
    .values({ eventId, consumer })
    .onConflictDoNothing()
    .returning();
  return Boolean(row);
}

export async function handleEvent(
  db: Db,
  consumer: string,
  event: EventEnvelope,
): Promise<Outcome> {
  switch (event.type) {
    case MARKETPLACE_SALE_COMPLETED:
      return saleCompleted(db, consumer, event);
    case MARKETPLACE_SALE_REFUNDED:
    case MARKETPLACE_SALE_DISPUTED:
      return saleWithdrawn(
        db,
        consumer,
        event,
        event.type === MARKETPLACE_SALE_REFUNDED ? 'refund' : 'dispute',
      );
    case CONNECT_ACCOUNT_UPDATED:
      return accountUpdated(db, consumer, event);
    case USER_DELETED:
      return userDeleted(db, consumer, event);
    default:
      return 'ignored';
  }
}

async function saleCompleted(db: Db, consumer: string, event: EventEnvelope): Promise<Outcome> {
  const sale = MarketplaceSale.safeParse(event.payload);
  if (!sale.success) return 'ignored';
  const { buyerId, listingId, saleId } = sale.data;
  return db.transaction(async (tx) => {
    if (!(await fresh(tx, consumer, event.id))) return 'duplicate';
    const [listing] = await tx
      .select({ id: listings.id })
      .from(listings)
      .where(eq(listings.id, listingId))
      .for('update');
    if (!listing) return 'ignored';
    const [previous] = await tx
      .select()
      .from(acquisitions)
      .where(and(eq(acquisitions.userId, buyerId), eq(acquisitions.listingId, listingId)))
      .for('update');
    await tx
      .insert(acquisitions)
      .values({ userId: buyerId, listingId, source: 'purchase', saleId })
      .onConflictDoUpdate({
        target: [acquisitions.userId, acquisitions.listingId],
        set: {
          source: 'purchase',
          saleId,
          acquiredAt: sql`now()`,
          revokedAt: null,
          revokeReason: null,
        },
      });
    if (!previous || previous.revokedAt)
      await tx
        .update(listings)
        .set({ acquisitionsCount: sql`${listings.acquisitionsCount} + 1` })
        .where(eq(listings.id, listingId));
    await appendEvent(tx, contextOf(event), {
      type: MARKETPLACE_EVENTS.listingAcquired,
      actor: { userId: buyerId, role: 'user', characterId: null },
      aggregate: listingAggregate(listingId),
      payload: { listingId, source: 'purchase', saleId },
    });
    return 'applied';
  });
}

async function saleWithdrawn(
  db: Db,
  consumer: string,
  event: EventEnvelope,
  reason: 'refund' | 'dispute',
): Promise<Outcome> {
  const sale = MarketplaceSale.safeParse(event.payload);
  if (!sale.success) return 'ignored';
  const { buyerId, listingId, saleId } = sale.data;
  return db.transaction(async (tx) => {
    if (!(await fresh(tx, consumer, event.id))) return 'duplicate';
    const revoked = await tx
      .update(acquisitions)
      .set({ revokedAt: sql`now()`, revokeReason: reason })
      .where(
        and(
          eq(acquisitions.userId, buyerId),
          eq(acquisitions.listingId, listingId),
          eq(acquisitions.saleId, saleId),
          isNull(acquisitions.revokedAt),
        ),
      )
      .returning();
    if (!revoked.length) return 'ignored';
    await tx
      .update(listings)
      .set({ acquisitionsCount: sql`greatest(${listings.acquisitionsCount} - 1, 0)` })
      .where(eq(listings.id, listingId));
    await appendEvent(tx, contextOf(event), {
      type: MARKETPLACE_EVENTS.acquisitionRevoked,
      actor: SYSTEM,
      aggregate: listingAggregate(listingId),
      payload: { listingId, saleId, reason },
    });
    return 'applied';
  });
}

async function accountUpdated(db: Db, consumer: string, event: EventEnvelope): Promise<Outcome> {
  const state = ConnectAccountUpdated.safeParse(event.payload);
  if (!state.success) return 'ignored';
  const { userId, version, chargesEnabled, payoutsEnabled } = state.data;
  return db.transaction(async (tx) => {
    if (!(await fresh(tx, consumer, event.id))) return 'duplicate';
    // État complet versionné : une version plus ancienne ou égale ne change rien
    const updated = await tx
      .update(creators)
      .set({ payoutsReady: chargesEnabled && payoutsEnabled, payoutsVersion: version })
      .where(and(eq(creators.userId, userId), lt(creators.payoutsVersion, version)))
      .returning({ userId: creators.userId });
    return updated.length ? 'applied' : 'ignored';
  });
}

/**
 * Compte supprimé : ses acquisitions, avis (compteurs recalculés) et installations partent ;
 * ses signalements restent sans auteur ; ses fiches en vente sont retirées (fichiers gardés pour
 * les acquéreurs) ; son profil de créateur est supprimé.
 */
async function userDeleted(db: Db, consumer: string, event: EventEnvelope): Promise<Outcome> {
  const userId = event.aggregate.id;
  return db.transaction(async (tx) => {
    if (!(await fresh(tx, consumer, event.id))) return 'duplicate';
    const removedReviews = await tx
      .delete(reviews)
      .where(eq(reviews.userId, userId))
      .returning({ listingId: reviews.listingId, rating: reviews.rating });
    for (const r of removedReviews)
      await tx
        .update(listings)
        .set({
          ratingCount: sql`${listings.ratingCount} - 1`,
          ratingSum: sql`${listings.ratingSum} - ${r.rating}`,
        })
        .where(eq(listings.id, r.listingId));
    const removedAcquisitions = await tx
      .delete(acquisitions)
      .where(eq(acquisitions.userId, userId))
      .returning({ listingId: acquisitions.listingId, revokedAt: acquisitions.revokedAt });
    const active = removedAcquisitions.filter((a) => !a.revokedAt).map((a) => a.listingId);
    if (active.length)
      await tx
        .update(listings)
        .set({ acquisitionsCount: sql`greatest(${listings.acquisitionsCount} - 1, 0)` })
        .where(inArray(listings.id, active));
    await tx.delete(installs).where(eq(installs.userId, userId));
    await tx.update(reports).set({ reporterId: null }).where(eq(reports.reporterId, userId));
    await tx
      .update(listings)
      .set({ status: 'unlisted', updatedAt: sql`now()`, version: sql`${listings.version} + 1` })
      .where(and(eq(listings.creatorId, userId), eq(listings.status, 'published')));
    // Brouillons jamais publiés : personne d'autre ne les a (leurs fichiers deviennent orphelins)
    await tx
      .delete(listings)
      .where(
        and(
          eq(listings.creatorId, userId),
          eq(listings.status, 'draft'),
          isNull(listings.publishedAt),
        ),
      );
    await tx.delete(creators).where(eq(creators.userId, userId));
    return 'applied';
  });
}

export function startEventsConsumer(o: {
  bus: Bus;
  db: Db;
  durable: string;
  logger: NonNullable<Parameters<typeof consumeEvents>[1]['logger']>;
}): Promise<() => Promise<void>> {
  return consumeEvents(o.bus, {
    durable: o.durable,
    subjects: SUBJECTS,
    deliver: 'all',
    logger: o.logger,
    async handler(event) {
      const outcome = await handleEvent(o.db, o.durable, event);
      o.logger.info({ eventId: event.id, type: event.type, outcome }, 'événement traité');
    },
  });
}
