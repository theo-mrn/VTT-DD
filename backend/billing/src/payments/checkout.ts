/**
 * Session Checkout terminée (webhook ou retour sur le site) : abonnement ou
 * achat, selon la métadonnée `type` posée par le service.
 */
import type { Actor } from '@vtt/contracts';
import type { EventContext } from '../db/outbox.js';
import { idOf, type CheckoutSession } from '../stripe/client.js';
import { isUuid, PREMIUM_TYPE, rememberCustomer, type PaymentDeps } from './common.js';
import { completeSale, MARKETPLACE_TYPE } from './marketplace.js';
import { completePurchase } from './purchases.js';
import { syncSubscription } from './subscriptions.js';

export type SessionOutcome = 'completed' | 'pending' | 'expired' | 'ignored';

/**
 * Paiement différé non encore reçu (payment_status unpaid) : en attente,
 * checkout.session.async_payment_succeeded suivra.
 */
export async function fulfillCheckoutSession(
  deps: PaymentDeps,
  ctx: EventContext,
  actor: Actor,
  session: CheckoutSession,
): Promise<SessionOutcome> {
  if (session.status === 'expired') return 'expired';
  if (session.status !== 'complete' || session.payment_status === 'unpaid') return 'pending';
  const m = session.metadata ?? {};

  if (m.type === PREMIUM_TYPE) {
    if (!isUuid(m.userId)) return 'ignored';
    const userId = m.userId.toLowerCase();
    await rememberCustomer(
      deps.db,
      userId,
      idOf(session.customer),
      session.customer_details?.email,
    );
    const subscriptionId = idOf(session.subscription);
    if (subscriptionId) await syncSubscription(deps, ctx, actor, subscriptionId, { userId });
    return 'completed';
  }
  if (m.type === 'dice' || m.type === 'token') {
    return (await completePurchase(deps, ctx, actor, session)) ? 'completed' : 'ignored';
  }
  // Vente d'un pack de la marketplace (docs/marketplace.md § 5.3)
  if (m.type === MARKETPLACE_TYPE) {
    return (await completeSale(deps, ctx, actor, session)) ? 'completed' : 'ignored';
  }
  return 'ignored';
}
