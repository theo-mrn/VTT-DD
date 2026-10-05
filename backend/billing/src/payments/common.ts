/**
 * Briques communes des paiements : acteurs des événements, clients Stripe
 * connus du service.
 */
import type { Actor } from '@vtt/contracts';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/outbox.js';
import { customers } from '../db/schema.js';
import type { StripeApi } from '../stripe/client.js';

/** Ce dont les traitements de paiement ont besoin (routes, webhook, scripts). */
export interface PaymentDeps {
  db: Db;
  stripe: StripeApi;
}

export const SYSTEM: Actor = { userId: null, role: 'system', characterId: null };
export const userActor = (userId: string): Actor => ({ userId, role: 'user', characterId: null });

/** Type de session Checkout (métadonnée `type` posée par le service, comme l'ancienne app). */
export const PREMIUM_TYPE = 'premium_subscription';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Agrégat des événements d'un utilisateur. */
export const customerAggregate = (userId: string) => ({ type: 'billing_customer', id: userId });

export async function customerOf(db: Db | Tx, userId: string) {
  const [row] = await db.select().from(customers).where(eq(customers.userId, userId));
  return row;
}

export async function customerByStripeId(db: Db | Tx, customerId: string) {
  const [row] = await db.select().from(customers).where(eq(customers.stripeCustomerId, customerId));
  return row;
}

/**
 * Client Stripe d'un utilisateur : enregistré s'il manque, jamais remplacé (un
 * utilisateur garde un seul client : factures et portail regroupés). L'e-mail
 * de facturation est complété s'il est connu.
 */
export async function rememberCustomer(
  tx: Db | Tx,
  userId: string,
  customerId: string | null,
  email?: string | null,
) {
  if (!customerId) return;
  await tx
    .insert(customers)
    .values({ userId, stripeCustomerId: customerId, email: email ?? null })
    .onConflictDoUpdate({
      target: customers.userId,
      set: {
        stripeCustomerId: sql`coalesce(${customers.stripeCustomerId}, excluded.stripe_customer_id)`,
        email: sql`coalesce(excluded.email, ${customers.email})`,
        updatedAt: sql`now()`,
      },
    });
}

/** Secondes Unix Stripe → Date (null si absent). */
export const fromUnix = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);
