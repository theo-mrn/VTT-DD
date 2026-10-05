/**
 * Webhook Stripe sur un vrai PostgreSQL (rôle billing_svc) : signature
 * vérifiée sur le corps brut, idempotence, relecture chez Stripe (ordre des
 * événements sans importance), cycle de vie d'un abonnement, factures,
 * remboursements et contestations.
 */
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { customers, entitlements, invoices, processedEvents, purchases } from '../../db/schema.js';
import { signedEvent, subscriptionObject } from '../../test/fake-stripe.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('webhook Stripe', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let alice: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    alice = await t.user();
  });

  afterEach(async () => {
    await t.close();
  });

  const types = async (userId: string) => (await t.events(userId)).map((e) => e.type);

  /** Achat de `itemId` : session créée par le service puis payée chez (le faux) Stripe. */
  async function paidPurchase(u: TestUser, itemId: string) {
    const { url } = await h.ok<{ url: string }>(u, 'POST', '/v1/billing/checkout', { itemId });
    return t.stripe.pay(h.sessionIdOf(url));
  }

  /** Abonnement payé, confirmé par le webhook ; renvoie l'abonnement Stripe. */
  async function subscribed(u: TestUser, plan: 'monthly' | 'annual' = 'monthly') {
    const { url } = await h.ok<{ url: string }>(u, 'POST', '/v1/billing/subscribe', { plan });
    const session = t.stripe.pay(h.sessionIdOf(url));
    expect((await t.deliver(signedEvent('checkout.session.completed', session))).statusCode).toBe(
      200,
    );
    return t.stripe.subscriptions.get(session.subscription as string)!;
  }

  it('refuse un corps non signé, mal signé ou modifié, sans rien lire', async () => {
    const session = await paidPurchase(alice, 'bismuth');
    const event = signedEvent('checkout.session.completed', session);
    const post = (headers: Record<string, string>, payload = event.payload) =>
      t.app.inject({ method: 'POST', url: '/v1/billing/webhook', headers, payload });

    let res = await post({ 'content-type': 'application/json' });
    expect([res.statusCode, res.json().code]).toEqual([400, 'invalid_signature']);
    const forged = signedEvent('checkout.session.completed', session, {
      secret: 'whsec_un_autre_secret',
    });
    res = await post(forged.headers, forged.payload);
    expect([res.statusCode, res.json().code]).toEqual([400, 'invalid_signature']);
    // Corps modifié après signature (montant, utilisateur…) : la signature ne correspond plus
    res = await post(event.headers, event.payload.replace('"bismuth"', '"magma"'));
    expect([res.statusCode, res.json().code]).toEqual([400, 'invalid_signature']);
    // Corps re-sérialisé (espaces) : refusé aussi, seule la forme brute est signée
    res = await post(event.headers, JSON.stringify(JSON.parse(event.payload), null, 2));
    expect(res.statusCode).toBe(400);

    expect(t.services.calls).toHaveLength(0);
    const [purchase] = await t.db!.select().from(purchases).where(eq(purchases.userId, alice.id));
    expect(purchase!.status).toBe('pending');
  });

  it('achat payé : droit accordé une fois, événement ; relivraison sans effet', async () => {
    const session = await paidPurchase(alice, 'bismuth');
    const event = signedEvent('checkout.session.completed', session);

    let res = await t.deliver(event);
    expect([res.statusCode, res.json()]).toEqual([200, { received: true }]);
    expect(t.services.callsFor(alice.id)).toContainEqual({
      'inventory/bismuth': { source: 'purchase' },
    });
    const [purchase] = await t.db!.select().from(purchases).where(eq(purchases.userId, alice.id));
    expect(purchase).toMatchObject({
      status: 'completed',
      amountCents: 500,
      stripePaymentIntentId: expect.stringMatching(/^pi_/),
    });
    // Client Stripe et e-mail de facturation retenus
    const [customer] = await t.db!.select().from(customers).where(eq(customers.userId, alice.id));
    expect(customer).toMatchObject({
      stripeCustomerId: session.customer,
      email: 'joueur@yner.test',
    });

    // Même événement relivré : acquitté, rien de plus
    const calls = t.services.calls.length;
    res = await t.deliver(event);
    expect(res.json()).toEqual({ received: true, duplicate: true });
    expect(t.services.calls).toHaveLength(calls);
    // Autre événement pour la même session : achat déjà livré, droits seulement réappliqués
    res = await t.deliver(signedEvent('checkout.session.async_payment_succeeded', session));
    expect(res.statusCode).toBe(200);
    expect(await types(alice.id)).toEqual(['billing.purchase_completed']);
    const active = await t.db!.select().from(entitlements).where(eq(entitlements.userId, alice.id));
    expect(active).toHaveLength(1);
    const processed = await t
      .db!.select()
      .from(processedEvents)
      .where(inArray(processedEvents.stripeEventId, [event.id]));
    expect(processed).toHaveLength(1);
  });

  it('dice injoignable : 500 sans marquer l’événement, puis relivraison qui applique', async () => {
    const session = await paidPurchase(alice, 'magma');
    const event = signedEvent('checkout.session.completed', session);

    t.services.setDown(true);
    let res = await t.deliver(event);
    expect([res.statusCode, res.json().code]).toEqual([500, 'webhook_retry']);
    const marked = () =>
      t.db!.select().from(processedEvents).where(eq(processedEvents.stripeEventId, event.id));
    expect(await marked()).toHaveLength(0);

    t.services.setDown(false);
    res = await t.deliver(event);
    expect(res.statusCode).toBe(200);
    expect(await marked()).toHaveLength(1);
    expect(t.services.callsFor(alice.id)).toContainEqual({
      'inventory/magma': { source: 'purchase' },
    });
    expect(await types(alice.id)).toEqual(['billing.purchase_completed']);
  });

  it('cycle d’un abonnement : début, résiliation au portail, fin ; relivraison sans effet', async () => {
    const sub = await subscribed(alice);
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).premium).toBe(true);

    // Résiliation depuis le portail Stripe
    const cancelAt = Math.floor(Date.now() / 1000) + 10 * 24 * 3600;
    const canceling = t.stripe.updateSubscription(sub.id, {
      cancel_at_period_end: true,
      cancel_at: cancelAt,
    });
    await t.deliver(signedEvent('customer.subscription.updated', canceling));
    expect(await h.ok(alice, 'GET', '/v1/billing/me')).toMatchObject({
      premium: true,
      subscription: { cancelAt: new Date(cancelAt * 1000).toISOString() },
    });

    // Abonnement inconnu de Stripe (autre application) : acquitté, ignoré
    const res = await t.deliver(
      signedEvent('customer.subscription.deleted', subscriptionObject('sub_ancien', 'cus_x')),
    );
    expect(res.statusCode).toBe(200);

    // Fin de la période
    const ended = t.stripe.updateSubscription(sub.id, { status: 'canceled' });
    const deleted = signedEvent('customer.subscription.deleted', ended);
    await t.deliver(deleted);
    expect(await h.ok(alice, 'GET', '/v1/billing/me')).toMatchObject({
      premium: false,
      subscription: { status: 'canceled', cancelAt: null },
      hasCustomer: true,
    });
    expect(t.services.callsFor(alice.id).slice(-2)).toEqual([
      { 'all-skins': { allSkins: false } },
      { premium: { premium: false } },
    ]);
    await t.deliver(deleted);
    expect(await types(alice.id)).toEqual([
      'billing.subscription_started',
      'billing.premium_activated',
      'billing.subscription_cancellation_scheduled',
      'billing.subscription_ended',
      'billing.premium_deactivated',
    ]);
  });

  it('événement en retard : l’état est relu chez Stripe, un vieil « actif » ne ressuscite rien', async () => {
    const sub = await subscribed(alice);
    const staleActive = signedEvent('customer.subscription.updated', sub);
    const ended = t.stripe.updateSubscription(sub.id, { status: 'canceled' });
    await t.deliver(signedEvent('customer.subscription.deleted', ended));
    // L'ancien « updated » (encore actif) arrive après la suppression
    expect((await t.deliver(staleActive)).statusCode).toBe(200);
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).premium).toBe(false);
  });

  it('changement de formule et paiement en retard : premium gardé, problème signalé', async () => {
    const sub = await subscribed(alice);
    const annual = t.stripe.prices.get('premium_annual')!;
    const changed = t.stripe.updateSubscription(sub.id, {
      items: { data: [{ ...sub.items.data[0]!, price: annual }] },
    });
    await t.deliver(signedEvent('customer.subscription.updated', changed));
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).subscription).toMatchObject({
      plan: 'annual',
    });

    const pastDue = t.stripe.updateSubscription(sub.id, { status: 'past_due' });
    await t.deliver(signedEvent('customer.subscription.updated', pastDue));
    const failed = t.stripe.invoice(sub.customer as string, {
      status: 'open',
      amount_paid: 0,
      attempt_count: 2,
      next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 24 * 3600,
    });
    await t.deliver(signedEvent('invoice.payment_failed', failed));
    expect(await h.ok(alice, 'GET', '/v1/billing/me')).toMatchObject({
      premium: true,
      subscription: { status: 'past_due', paymentIssue: true },
    });
    const events = await t.events(alice.id);
    expect(events.map((e) => e.type).slice(2)).toEqual([
      'billing.subscription_plan_changed',
      'billing.subscription_past_due',
      'billing.invoice_payment_failed',
    ]);
    expect(events.at(-1)!.payload).toMatchObject({
      invoiceId: failed.id,
      amountDue: 499,
      attemptCount: 2,
      nextAttemptAt: expect.any(String),
    });
  });

  it('facture payée : copie locale, événement sans lien ; première facture avant la session', async () => {
    // Facture d'abonnement reçue avant checkout.session.completed : la métadonnée suffit
    const early = t.stripe.invoice('cus_pas_encore_connu', {
      parent: {
        subscription_details: { subscription: 'sub_x', metadata: { userId: alice.id } },
      },
      billing_reason: 'subscription_create',
    });
    expect((await t.deliver(signedEvent('invoice.paid', early))).statusCode).toBe(200);
    const [row] = await t.db!.select().from(invoices).where(eq(invoices.id, early.id!));
    expect(row).toMatchObject({ userId: alice.id, status: 'paid', subscriptionId: 'sub_x' });

    const paid = (await t.events(alice.id)).find((e) => e.type === 'billing.invoice_paid')!;
    expect(paid.payload).toEqual({
      userId: alice.id,
      invoiceId: early.id,
      subscriptionId: 'sub_x',
      number: early.number,
      currency: 'eur',
      amountPaid: 499,
      billingReason: 'subscription_create',
    });
    expect(JSON.stringify(paid)).not.toContain('invoice.stripe.test');

    // Relivrée sous un autre identifiant d'événement : pas de second invoice_paid
    await t.deliver(signedEvent('invoice.paid', early));
    expect((await types(alice.id)).filter((x) => x === 'billing.invoice_paid')).toHaveLength(1);
    // Client inconnu, sans métadonnée : ignorée
    const stranger = t.stripe.invoice('cus_inconnu');
    expect((await t.deliver(signedEvent('invoice.paid', stranger))).statusCode).toBe(200);
    expect(await t.db!.select().from(invoices).where(eq(invoices.id, stranger.id!))).toEqual([]);
  });

  it('remboursement total : droit retiré, achat remboursé ; partiel : rien', async () => {
    const session = await paidPurchase(alice, 'ruby');
    await t.deliver(signedEvent('checkout.session.completed', session));
    const charge = t.stripe.chargeOf(session.payment_intent as string);

    await t.deliver(signedEvent('charge.refunded', charge));
    let [purchase] = await t.db!.select().from(purchases).where(eq(purchases.userId, alice.id));
    expect(purchase!.status).toBe('completed');

    t.stripe.charges.set(charge.id, { ...charge, refunded: true });
    await t.deliver(signedEvent('charge.refunded', charge));
    [purchase] = await t.db!.select().from(purchases).where(eq(purchases.userId, alice.id));
    expect(purchase).toMatchObject({ status: 'refunded', refundedAt: expect.any(Date) });
    const [right] = await t
      .db!.select()
      .from(entitlements)
      .where(eq(entitlements.userId, alice.id));
    expect(right).toMatchObject({ revokedAt: expect.any(Date), revokeReason: 'refund' });
    expect(await h.ok(alice, 'GET', '/v1/billing/purchases')).toMatchObject({
      purchases: [{ itemId: 'ruby', status: 'refunded' }],
    });
    expect(await types(alice.id)).toEqual([
      'billing.purchase_completed',
      'billing.purchase_refunded',
    ]);
    // Racheté ensuite : permis
    const again = await h.request(alice, 'POST', '/v1/billing/checkout', { itemId: 'ruby' });
    expect(again.statusCode).toBe(200);
  });

  it('contestation : droit retiré ; paiement inconnu ignoré', async () => {
    const session = await paidPurchase(alice, 'poison');
    await t.deliver(signedEvent('checkout.session.completed', session));
    const charge = t.stripe.chargeOf(session.payment_intent as string);
    await t.deliver(signedEvent('charge.dispute.created', { id: 'dp_1', charge: charge.id }));
    const [right] = await t
      .db!.select()
      .from(entitlements)
      .where(eq(entitlements.userId, alice.id));
    expect(right).toMatchObject({ revokeReason: 'dispute' });
    expect((await types(alice.id)).at(-1)).toBe('billing.purchase_disputed');

    t.stripe.charges.set('ch_autre', { id: 'ch_autre', payment_intent: 'pi_autre' } as never);
    const res = await t.deliver(signedEvent('charge.dispute.created', { charge: 'ch_autre' }));
    expect(res.statusCode).toBe(200);
  });

  it('session expirée ou paiement différé refusé : achat abandonné ; e-mail du client suivi', async () => {
    const { url } = await h.ok<{ url: string }>(alice, 'POST', '/v1/billing/checkout', {
      itemId: 'poison',
    });
    const session = t.stripe.sessions.get(h.sessionIdOf(url))!;
    await t.deliver(signedEvent('checkout.session.expired', { ...session, status: 'expired' }));
    const [purchase] = await t.db!.select().from(purchases).where(eq(purchases.userId, alice.id));
    expect(purchase!.status).toBe('expired');

    const paid = await paidPurchase(alice, 'ruby');
    await t.deliver(signedEvent('checkout.session.completed', paid));
    await t.deliver(
      signedEvent('customer.updated', { id: paid.customer, email: 'nouvelle@yner.test' }),
    );
    const [customer] = await t.db!.select().from(customers).where(eq(customers.userId, alice.id));
    expect(customer!.email).toBe('nouvelle@yner.test');
  });

  it('sans STRIPE_WEBHOOK_SECRET : 503 billing_unconfigured', async () => {
    const bare = await testApp({ STRIPE_WEBHOOK_SECRET: '' });
    try {
      const event = signedEvent('checkout.session.completed', { id: 'cs_test_x' });
      const res = await bare.deliver(event);
      expect([res.statusCode, res.json().code]).toEqual([503, 'billing_unconfigured']);
    } finally {
      await bare.close();
    }
  });
});
