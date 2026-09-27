/**
 * Appels à l'API Stripe utilisés par le service, derrière une interface
 * minimale : les tests la remplacent par un faux (aucun appel réseau), et la
 * vérification de signature du webhook n'a besoin d'aucune clé d'API.
 */
import Stripe from 'stripe';

export type CheckoutSession = Stripe.Checkout.Session;
export type CheckoutSessionParams = Stripe.Checkout.SessionCreateParams;
export type Subscription = Stripe.Subscription;
export type Invoice = Stripe.Invoice;
export type StripeEvent = Stripe.Event;

export interface StripeApi {
  createCheckoutSession(
    params: CheckoutSessionParams,
    idempotencyKey?: string,
  ): Promise<Pick<CheckoutSession, 'id' | 'url'>>;
  retrieveCheckoutSession(id: string): Promise<CheckoutSession>;
  createPortalSession(customer: string, returnUrl: string): Promise<{ url: string }>;
  /** Résiliation en fin de période (cancel_at_period_end), comme l'ancienne route /api/unsubscribe. */
  cancelAtPeriodEnd(subscriptionId: string): Promise<Subscription>;
  activeSubscriptions(customer: string): Promise<Subscription[]>;
  listInvoices(customer: string, limit: number): Promise<Invoice[]>;
}

export function stripeApi(secretKey: string): StripeApi {
  const stripe = new Stripe(secretKey, {
    maxNetworkRetries: 2,
    timeout: 10_000,
    appInfo: { name: 'vtt-billing' },
  });
  return {
    createCheckoutSession: (params, idempotencyKey) =>
      stripe.checkout.sessions.create(params, idempotencyKey ? { idempotencyKey } : undefined),
    // Abonnement développé : son statut dit si une vieille session peut encore activer le premium
    retrieveCheckoutSession: (id) =>
      stripe.checkout.sessions.retrieve(id, { expand: ['subscription'] }),
    createPortalSession: async (customer, returnUrl) => {
      const s = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
      return { url: s.url };
    },
    cancelAtPeriodEnd: (id) => stripe.subscriptions.update(id, { cancel_at_period_end: true }),
    activeSubscriptions: async (customer) =>
      (await stripe.subscriptions.list({ customer, status: 'active', limit: 10 })).data,
    listInvoices: async (customer, limit) => (await stripe.invoices.list({ customer, limit })).data,
  };
}

/**
 * Vérifie la signature `stripe-signature` sur le corps BRUT (octets reçus,
 * jamais un JSON re-sérialisé) et renvoie l'événement. Lève une erreur si la
 * signature, le secret ou l'horodatage (tolérance de 5 minutes) ne vont pas.
 */
export function verifyWebhook(rawBody: Buffer, signature: string, secret: string): StripeEvent {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/** Identifiant d'un objet Stripe développé ou non (`customer: 'cus_…' | Customer`). */
export function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

/**
 * Fin de la période en cours d'un abonnement, en secondes Unix. Depuis l'API
 * 2025-03-31, elle est portée par les lignes de l'abonnement ; l'ancienne
 * app lisait `subscription.current_period_end`.
 */
export function periodEnd(sub: Subscription): number | null {
  const fromItems = sub.items?.data?.[0]?.current_period_end;
  if (typeof fromItems === 'number') return fromItems;
  const legacy = (sub as unknown as { current_period_end?: unknown }).current_period_end;
  return typeof legacy === 'number' ? legacy : null;
}

/** Date de fin d'un abonnement résilié : `cancel_at` de Stripe, sinon la fin de la période. */
export function cancellationDate(sub: Subscription): Date | null {
  const seconds = sub.cancel_at ?? (sub.cancel_at_period_end ? periodEnd(sub) : null);
  return seconds ? new Date(seconds * 1000) : null;
}
