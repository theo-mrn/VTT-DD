/**
 * Écriture des clients importés, avec le rôle billing_svc. Rejouable : un
 * utilisateur qui a déjà une ligne (import précédent, ou paiement fait depuis
 * sur la nouvelle app) n'est jamais modifié.
 *
 * Premium de l'ancienne app : droit premium de source `subscription` s'il est
 * porté par un abonnement Stripe (stripe:backfill en recopie ensuite l'état
 * réel), sinon `legacy` (premium offert ou sans abonnement connu).
 */
import { customers, subscriptions } from '../db/schema.js';
import type { Db } from '../db/client.js';
import { grant } from '../payments/entitlements.js';
import type { ImportedCustomer } from './transform.js';

export async function loadCustomer(
  db: Db,
  userId: string,
  c: ImportedCustomer,
): Promise<'imported' | 'already-imported'> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(customers)
      .values({ userId, stripeCustomerId: c.stripeCustomerId })
      .onConflictDoNothing({ target: customers.userId })
      .returning({ userId: customers.userId });
    if (!inserted.length) return 'already-imported';

    if (c.subscriptionId)
      await tx
        .insert(subscriptions)
        .values({
          id: c.subscriptionId,
          userId,
          plan: 'legacy',
          status: c.premium ? 'active' : 'canceled',
          cancelAt: c.premium && c.cancelAtPeriodEnd ? c.premiumEndDate : null,
          createdAt: c.premiumSince ?? new Date(),
        })
        .onConflictDoNothing();
    if (c.premium)
      await grant(tx, {
        userId,
        kind: 'premium',
        source: c.subscriptionId ? 'subscription' : 'legacy',
        sourceId: c.subscriptionId ?? '',
      });
    return 'imported';
  });
}
