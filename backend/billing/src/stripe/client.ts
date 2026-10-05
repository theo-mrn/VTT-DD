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
export type Charge = Stripe.Charge;
export type Customer = Stripe.Customer;
export type Price = Stripe.Price;
export type Product = Stripe.Product;
export type StripeEvent = Stripe.Event;

export interface StripeApi {
  createCheckoutSession(
    params: CheckoutSessionParams,
    idempotencyKey?: string,
  ): Promise<Pick<CheckoutSession, 'id' | 'url'>>;
  /** Session avec son abonnement développé. */
  retrieveCheckoutSession(id: string): Promise<CheckoutSession>;
  createPortalSession(customer: string, returnUrl: string): Promise<{ url: string }>;
  /** État le plus récent d'un abonnement (prix développé : lookup_key de la formule). */
  retrieveSubscription(id: string): Promise<Subscription>;
  /** Résiliation en fin de période (true) ou reprise (false). */
  setCancelAtPeriodEnd(id: string, cancel: boolean): Promise<Subscription>;
  /** Abonnements d'un client, tous statuts (rattrapage). */
  listSubscriptions(customer: string): Promise<Subscription[]>;
  retrieveInvoice(id: string): Promise<Invoice>;
  listInvoices(customer: string, limit: number): Promise<Invoice[]>;
  retrieveCharge(id: string): Promise<Charge>;
  retrieveCustomer(id: string): Promise<Customer | { id: string; deleted: true }>;
  /** Prix actifs par lookup_key (absents : pas encore créés par catalog:sync). */
  pricesByLookupKeys(keys: string[]): Promise<Price[]>;
}

export function stripeApi(secretKey: string): StripeApi {
  const stripe = stripeClient(secretKey);
  return {
    createCheckoutSession: (params, idempotencyKey) =>
      stripe.checkout.sessions.create(params, idempotencyKey ? { idempotencyKey } : undefined),
    retrieveCheckoutSession: (id) =>
      stripe.checkout.sessions.retrieve(id, { expand: ['subscription'] }),
    createPortalSession: async (customer, returnUrl) => {
      const s = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
      return { url: s.url };
    },
    retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
    setCancelAtPeriodEnd: (id, cancel) =>
      stripe.subscriptions.update(id, { cancel_at_period_end: cancel }),
    listSubscriptions: async (customer) =>
      (await stripe.subscriptions.list({ customer, status: 'all', limit: 100 })).data,
    retrieveInvoice: (id) => stripe.invoices.retrieve(id),
    listInvoices: async (customer, limit) => (await stripe.invoices.list({ customer, limit })).data,
    retrieveCharge: (id) => stripe.charges.retrieve(id),
    retrieveCustomer: (id) => stripe.customers.retrieve(id),
    pricesByLookupKeys: async (keys) =>
      (await stripe.prices.list({ lookup_keys: keys, active: true, limit: 100 })).data,
  };
}

/** Client Stripe du service (aussi utilisé par les scripts catalog:sync et stripe:backfill). */
export function stripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    maxNetworkRetries: 2,
    timeout: 10_000,
    appInfo: { name: 'vtt-billing' },
  });
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

/** Début de la période en cours (même déplacement que periodEnd). */
export function periodStart(sub: Subscription): number | null {
  const fromItems = sub.items?.data?.[0]?.current_period_start;
  if (typeof fromItems === 'number') return fromItems;
  const legacy = (sub as unknown as { current_period_start?: unknown }).current_period_start;
  return typeof legacy === 'number' ? legacy : null;
}

/** Date de fin d'un abonnement résilié : `cancel_at` de Stripe, sinon la fin de la période. */
export function cancellationDate(sub: Subscription): Date | null {
  const seconds = sub.cancel_at ?? (sub.cancel_at_period_end ? periodEnd(sub) : null);
  return seconds ? new Date(seconds * 1000) : null;
}
