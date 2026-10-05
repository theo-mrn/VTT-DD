/**
 * Consommateur durable `billing-accounts` : un compte supprimé définitivement
 * (`identity.user_deleted`, docs/legal.md) emporte ses données de paiement — client,
 * abonnements, factures, droits, achats, relances. Yner ne vend rien aujourd'hui
 * (docs/paiement.md) : il n'y a pas de facture à conserver pour la comptabilité.
 *
 * Le client Stripe est supprimé aussi quand Stripe est configuré (ses abonnements sont alors
 * résiliés par Stripe) ; un client déjà absent chez Stripe n'est pas une erreur. Un échec
 * Stripe fait relivrer l'événement : rien n'est effacé ici tant que Stripe n'a pas suivi.
 * Au moins une fois : l'inbox écarte un événement déjà traité.
 */
import { USER_DELETED, USER_DELETED_SUBJECT, type EventEnvelope } from '@vtt/contracts';
import { consumeEvents, type Bus, type ConsumeOptions } from '@vtt/platform';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  customers,
  entitlements,
  inbox,
  invoices,
  purchases,
  renewalReminders,
  rightsVersions,
  subscriptions,
} from '../db/schema.js';
import type { StripeApi } from '../stripe/client.js';

export const ACCOUNTS_CONSUMER = 'billing-accounts';

/** Traite une suppression de compte ; false si ignorée ou déjà traitée. */
export async function handleUserDeleted(
  deps: { db: Db; stripe: StripeApi | null },
  event: Pick<EventEnvelope, 'id' | 'type' | 'aggregate'>,
): Promise<boolean> {
  if (event.type !== USER_DELETED) return false;
  const userId = event.aggregate.id;
  const { db, stripe } = deps;

  const [done] = await db.select().from(inbox).where(eq(inbox.eventId, event.id)).limit(1);
  if (done) return false;

  const [customer] = await db
    .select({ stripeCustomerId: customers.stripeCustomerId })
    .from(customers)
    .where(eq(customers.userId, userId))
    .limit(1);
  if (customer?.stripeCustomerId && stripe) {
    try {
      await stripe.deleteCustomer(customer.stripeCustomerId);
    } catch (err) {
      if ((err as { code?: string }).code !== 'resource_missing') throw err;
    }
  }

  return db.transaction(async (tx) => {
    const [fresh] = await tx
      .insert(inbox)
      .values({ eventId: event.id, consumer: ACCOUNTS_CONSUMER })
      .onConflictDoNothing()
      .returning();
    if (!fresh) return false;
    const subs = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId));
    if (subs.length)
      await tx.delete(renewalReminders).where(
        inArray(
          renewalReminders.subscriptionId,
          subs.map((s) => s.id),
        ),
      );
    await tx.delete(invoices).where(eq(invoices.userId, userId));
    await tx.delete(entitlements).where(eq(entitlements.userId, userId));
    await tx.delete(purchases).where(eq(purchases.userId, userId));
    await tx.delete(subscriptions).where(eq(subscriptions.userId, userId));
    await tx.delete(rightsVersions).where(eq(rightsVersions.userId, userId));
    await tx.delete(customers).where(eq(customers.userId, userId));
    return true;
  });
}

export function startAccountsConsumer(o: {
  bus: Bus;
  db: Db;
  stripe: StripeApi | null;
  logger: ConsumeOptions['logger'];
}): Promise<() => Promise<void>> {
  return consumeEvents(o.bus, {
    durable: ACCOUNTS_CONSUMER,
    subjects: [USER_DELETED_SUBJECT],
    deliver: 'all',
    ...(o.logger ? { logger: o.logger } : {}),
    handler: async (event) => {
      if (await handleUserDeleted(o, event))
        o.logger?.info({ userId: event.aggregate.id }, 'compte supprimé : paiements effacés');
    },
  });
}
