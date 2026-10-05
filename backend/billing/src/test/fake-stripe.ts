/**
 * Faux Stripe pour les tests : prix, sessions Checkout, abonnements, factures,
 * paiements et portail en mémoire, sans aucun appel réseau. Les webhooks, eux,
 * sont signés pour de vrai (Stripe.webhooks.generateTestHeaderString) et
 * vérifiés par le vrai code du service. Comme le vrai, le service relit chez
 * (le faux) Stripe l'objet désigné par un événement : un test modifie l'objet
 * ici, puis livre l'événement.
 */
import Stripe from 'stripe';
import { PLANS, SOLD_ITEMS, lookupKeyOf } from '../catalog/catalog.js';
import type {
  Charge,
  CheckoutSession,
  CheckoutSessionParams,
  Customer,
  Invoice,
  Price,
  StripeApi,
  Subscription,
} from '../stripe/client.js';

export const WEBHOOK_SECRET = 'whsec_test_secret_de_test_0123456789';

let counter = 0;
export const nextId = (prefix: string) =>
  `${prefix}_test${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const missing = (what: string) =>
  Object.assign(new Error(`No such ${what}`), { code: 'resource_missing' });

/** Prix du catalogue, comme après catalog:sync. */
function catalogPrices(): Map<string, Price> {
  const prices = new Map<string, Price>();
  const add = (lookupKey: string, amount: number, interval?: 'month' | 'year') =>
    prices.set(lookupKey, {
      id: `price_${lookupKey}`,
      object: 'price',
      lookup_key: lookupKey,
      unit_amount: amount,
      currency: 'eur',
      active: true,
      recurring: interval ? { interval } : null,
    } as unknown as Price);
  for (const plan of Object.values(PLANS)) add(plan.lookupKey, plan.amount, plan.interval);
  for (const item of SOLD_ITEMS) add(lookupKeyOf(item), item.price);
  return prices;
}

export function fakeStripe() {
  const prices = catalogPrices();
  const sessions = new Map<string, CheckoutSession>();
  const subscriptions = new Map<string, Subscription>();
  const invoices = new Map<string, Invoice>();
  const charges = new Map<string, Charge>();
  const customers = new Map<string, Customer>();
  /** Paramètres reçus pour chaque session créée, dans l'ordre. */
  const created: CheckoutSessionParams[] = [];
  const portals: { customer: string; returnUrl: string }[] = [];
  const paramsOf = new Map<string, CheckoutSessionParams>();
  let down = false;

  const guard = () => {
    if (down)
      throw Object.assign(new Error('Stripe injoignable'), { type: 'StripeConnectionError' });
  };
  const priceById = (id: string) => [...prices.values()].find((p) => p.id === id);

  const api: StripeApi = {
    async createCheckoutSession(params) {
      guard();
      created.push(params);
      const id = nextId('cs');
      const price = priceById(params.line_items?.[0]?.price ?? '');
      const session = {
        id,
        object: 'checkout.session',
        url: `https://checkout.stripe.test/c/pay/${id}`,
        mode: params.mode,
        status: 'open',
        payment_status: 'unpaid',
        metadata: params.metadata ?? {},
        customer: params.customer ?? null,
        customer_details: null,
        subscription: null,
        amount_total: price?.unit_amount ?? null,
        currency: 'eur',
        payment_intent: null,
        consent: null,
      } as unknown as CheckoutSession;
      sessions.set(id, session);
      paramsOf.set(id, params);
      return { id, url: session.url };
    },
    async retrieveCheckoutSession(id) {
      guard();
      const s = sessions.get(id);
      if (!s) throw missing('checkout.session');
      // Comme l'API réelle avec expand: ['subscription']
      const sub = typeof s.subscription === 'string' ? subscriptions.get(s.subscription) : null;
      return { ...s, subscription: sub ?? s.subscription } as CheckoutSession;
    },
    async createPortalSession(customer, returnUrl) {
      guard();
      portals.push({ customer, returnUrl });
      return { url: `https://billing.stripe.test/p/session/${customer}` };
    },
    async retrieveSubscription(id) {
      guard();
      const sub = subscriptions.get(id);
      if (!sub) throw missing('subscription');
      return sub;
    },
    async setCancelAtPeriodEnd(id, cancel) {
      guard();
      const sub = subscriptions.get(id);
      if (!sub) throw missing('subscription');
      const end = sub.items.data[0]!.current_period_end;
      const updated = {
        ...sub,
        cancel_at_period_end: cancel,
        cancel_at: cancel ? end : null,
      } as Subscription;
      subscriptions.set(id, updated);
      return updated;
    },
    async listSubscriptions(customer) {
      guard();
      return [...subscriptions.values()].filter((s) => s.customer === customer);
    },
    async retrieveInvoice(id) {
      guard();
      const inv = invoices.get(id);
      if (!inv) throw missing('invoice');
      return inv;
    },
    async listInvoices(customer, limit) {
      guard();
      return [...invoices.values()].filter((i) => i.customer === customer).slice(0, limit);
    },
    async retrieveCharge(id) {
      guard();
      const charge = charges.get(id);
      if (!charge) throw missing('charge');
      return charge;
    },
    async retrieveCustomer(id) {
      guard();
      const c = customers.get(id);
      if (!c) throw missing('customer');
      return c;
    },
    async pricesByLookupKeys(keys) {
      guard();
      return keys.flatMap((k) => (prices.has(k) ? [prices.get(k)!] : []));
    },
  };

  function customer(id: string, email = 'joueur@yner.test') {
    if (!customers.has(id))
      customers.set(id, { id, object: 'customer', email } as unknown as Customer);
    return customers.get(id)!;
  }

  /** Paiement réussi d'une session : statut complet, client, abonnement ou paiement créés. */
  function pay(sessionId: string, opts: { consent?: boolean } = {}): CheckoutSession {
    const s = sessions.get(sessionId)!;
    const params = paramsOf.get(sessionId);
    const customerId = (s.customer as string | null) ?? nextId('cus');
    customer(customerId);
    let subscription: string | null = null;
    let paymentIntent: string | null = null;
    if (s.mode === 'subscription') {
      subscription = nextId('sub');
      const price = priceById(params?.line_items?.[0]?.price ?? '');
      subscriptions.set(
        subscription,
        subscriptionObject(subscription, customerId, {
          metadata: params?.subscription_data?.metadata ?? {},
          price,
        }),
      );
    } else {
      paymentIntent = nextId('pi');
      const charge = nextId('ch');
      charges.set(charge, {
        id: charge,
        object: 'charge',
        payment_intent: paymentIntent,
        refunded: false,
        amount: s.amount_total,
      } as unknown as Charge);
    }
    const paid = {
      ...s,
      status: 'complete',
      payment_status: 'paid',
      customer: customerId,
      customer_details: { email: 'joueur@yner.test' },
      subscription,
      payment_intent: paymentIntent,
      consent: opts.consent === false ? null : { terms_of_service: 'accepted' },
    } as unknown as CheckoutSession;
    sessions.set(sessionId, paid);
    return paid;
  }

  /** Paiement (charge) d'un achat, par son payment_intent. */
  function chargeOf(paymentIntent: string): Charge {
    return [...charges.values()].find((c) => c.payment_intent === paymentIntent)!;
  }

  /** Modifie un abonnement chez Stripe (le service le relira au prochain événement). */
  function updateSubscription(id: string, patch: Record<string, unknown>) {
    const sub = { ...subscriptions.get(id)!, ...patch } as Subscription;
    subscriptions.set(id, sub);
    return sub;
  }

  /** Facture d'un abonnement (ou d'un client), enregistrée chez le faux Stripe. */
  function invoice(customerId: string, patch: Record<string, unknown> = {}): Invoice {
    const id = nextId('in');
    const now = Math.floor(Date.now() / 1000);
    const inv = {
      id,
      object: 'invoice',
      customer: customerId,
      number: `YNER-${counter.toString().padStart(4, '0')}`,
      status: 'paid',
      amount_due: 499,
      amount_paid: 499,
      currency: 'eur',
      created: now,
      billing_reason: 'subscription_cycle',
      attempt_count: 1,
      next_payment_attempt: null,
      hosted_invoice_url: `https://invoice.stripe.test/i/${id}`,
      invoice_pdf: `https://invoice.stripe.test/i/${id}.pdf`,
      metadata: {},
      parent: null,
      lines: {
        data: [
          {
            description: '1 × Yner Premium (4,99 €/mois)',
            period: { start: now, end: now + 30 * 24 * 3600 },
          },
        ],
      },
      ...patch,
    } as unknown as Invoice;
    invoices.set(id, inv);
    return inv;
  }

  return {
    api,
    prices,
    sessions,
    subscriptions,
    invoices,
    charges,
    customers,
    created,
    portals,
    pay,
    chargeOf,
    updateSubscription,
    invoice,
    setDown(value: boolean) {
      down = value;
    },
  };
}

/** Abonnement actif (API 2026 : période portée par la ligne, prix développé). */
export function subscriptionObject(
  id: string,
  customer: string,
  patch: Partial<Record<string, unknown>> & { price?: Price } = {},
): Subscription {
  const now = Math.floor(Date.now() / 1000);
  const { price, ...rest } = patch;
  return {
    id,
    object: 'subscription',
    customer,
    status: 'active',
    created: now,
    cancel_at: null,
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    items: {
      object: 'list',
      data: [
        {
          id: `si_${id}`,
          current_period_start: now,
          current_period_end: now + 30 * 24 * 3600,
          price: price ?? { id: 'price_ancien', lookup_key: null },
        },
      ],
    },
    metadata: {},
    ...rest,
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
