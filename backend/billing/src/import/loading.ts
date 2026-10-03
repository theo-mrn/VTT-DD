/**
 * Écriture des clients importés, avec le rôle billing_svc. Rejouable : un
 * utilisateur qui a déjà une ligne (import précédent, ou paiement fait depuis
 * sur la nouvelle app) n'est jamais modifié.
 */
import { customers } from '../db/schema.js';
import type { Db } from '../db/client.js';
import type { ImportedCustomer } from './transform.js';

export async function loadCustomer(
  db: Db,
  userId: string,
  c: ImportedCustomer,
): Promise<'imported' | 'already-imported'> {
  const inserted = await db
    .insert(customers)
    .values({
      userId,
      stripeCustomerId: c.stripeCustomerId,
      subscriptionId: c.subscriptionId,
      premium: c.premium,
      premiumSince: c.premiumSince,
      cancelAtPeriodEnd: c.cancelAtPeriodEnd,
      premiumEndDate: c.premiumEndDate,
    })
    .onConflictDoNothing({ target: customers.userId })
    .returning({ userId: customers.userId });
  return inserted.length ? 'imported' : 'already-imported';
}
