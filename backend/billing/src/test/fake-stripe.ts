/**
 * Faux Stripe pour les tests : sessions Checkout, abonnements, factures et
 * portail en mémoire, sans aucun appel réseau. Les webhooks, eux, sont signés
 * pour de vrai (Stripe.webhooks.generateTestHeaderString) et vérifiés par le
 * vrai code du service.
 */
import Stripe from 'stripe';
import type {
  CheckoutSession,
  CheckoutSessionParams,
  Invoice,
  StripeApi,
  Subscription,
} from '../stripe/client.js';

export const WEBHOOK_SECRET = 'whsec_test_secret_de_test_0123456789';

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}_test${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function fakeStripe() {
  const sessions = new Map<string, CheckoutSession>();
  const subscriptions = new Map<string, Subscription>();
  const invoices = new Map<string, Invoice[]>();
  /** Paramètres reçus pour chaque session créée, dans l'ordre. */
  const created: CheckoutSessionParams[] = [];
  const portals: { customer: string; returnUrl: string }[] = [];
  let down = false;

  const guard = () => {
    if (down)
      throw Object.assign(new Error('Stripe injoignable'), { type: 'StripeConnectionError' });
  };

  const api: StripeApi = {
    async createCheckoutSession(params) {
      guard();
      created.push(params);
      const id = nextId('cs');
      const session = {
        id,
        object: 'checkout.session',
        url: `https://checkout.stripe.test/c/pay/${id}`,
        mode: params.mode,
        status: 'open',
        payment_status: 'unpaid',
        metadata: params.metadata ?? {},
        customer: params.customer ?? null,
        subscription: null,
        amount_total: params.line_items?.[0]?.price_data?.unit_amount ?? null,
        currency: 'eur',
        payment_intent: null,
      } as unknown as CheckoutSession;
      sessions.set(id, session);
      return { id, url: session.url };
    },
    async retrieveCheckoutSession(id) {
      guard();
      const s = sessions.get(id);
      if (!s)
        throw Object.assign(new Error('No such checkout.session'), { code: 'resource_missing' });
      // Comme l'API réelle avec expand: ['subscription']
      const sub = typeof s.subscription === 'string' ? subscriptions.get(s.subscription) : null;
      return { ...s, subscription: sub ?? s.subscription } as CheckoutSession;
    },
    async createPortalSession(customer, returnUrl) {
      guard();
      portals.push({ customer, returnUrl });
      return { url: `https://billing.stripe.test/p/session/${customer}` };
    },
    async cancelAtPeriodEnd(id) {
      guard();
      const sub = subscriptions.get(id);
      if (!sub)
        throw Object.assign(new Error('No such subscription'), { code: 'resource_missing' });
      const updated = { ...sub, cancel_at_period_end: true } as Subscription;
      subscriptions.set(id, updated);
      return updated;
    },
    async activeSubscriptions(customer) {
      guard();
      return [...subscriptions.values()].filter(
        (s) => s.customer === customer && s.status === 'active',
      );
    },
    async listInvoices(customer, limit) {
      guard();
      return (invoices.get(customer) ?? []).slice(0, limit);
    },
  };

  /** Paiement réussi d'une session : statut complet, client et abonnement créés. */
  function pay(sessionId: string): CheckoutSession {
    const s = sessions.get(sessionId)!;
    const customer = (s.customer as string | null) ?? nextId('cus');
    let subscription: string | null = null;
    if (s.mode === 'subscription') {
      subscription = nextId('sub');
      subscriptions.set(subscription, subscriptionObject(subscription, customer));
    }
    const paid = {
      ...s,
      status: 'complete',
      payment_status: 'paid',
      customer,
      subscription,
      payment_intent: s.mode === 'payment' ? nextId('pi') : null,
    } as CheckoutSession;
    sessions.set(sessionId, paid);
    return paid;
  }

  return {
    api,
    sessions,
    subscriptions,
    invoices,
    created,
    portals,
    pay,
    setDown(value: boolean) {
      down = value;
    },
  };
}

/** Abonnement actif (API 2026 : fin de période portée par la ligne). */
export function subscriptionObject(
  id: string,
  customer: string,
  patch: Partial<Record<string, unknown>> = {},
): Subscription {
  const end = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  return {
    id,
    object: 'subscription',
    customer,
    status: 'active',
    cancel_at: null,
    cancel_at_period_end: false,
    items: { object: 'list', data: [{ id: `si_${id}`, current_period_end: end }] },
    metadata: {},
    ...patch,
  } as unknown as Subscription;
}

/** Événement Stripe signé comme le ferait Stripe, prêt pour POST /v1/billing/webhook. */
export function signedEvent(
  type: string,
  object: unknown,
  opts: { id?: string; secret?: string } = {},
) {
  const payload = JSON.stringify({
    id: opts.id ?? nextId('evt'),
    object: 'event',
    api_version: '2026-02-25.clover',
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: opts.secret ?? WEBHOOK_SECRET,
  });
  return {
    id: (JSON.parse(payload) as { id: string }).id,
    payload,
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
  };
}
