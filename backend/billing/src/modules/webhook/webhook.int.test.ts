/**
 * Webhook Stripe sur un vrai PostgreSQL (rôle billing_svc) : signature
 * vérifiée sur le corps brut, livraison des achats et du premium, idempotence
 * (relivraison sans effet), reprise après une panne de dice ou d'identity.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { customers, outbox, processedEvents, purchases } from '../../db/schema.js';
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

  /** Événements de l'outbox d'un utilisateur, par type. */
  const events = async (userId: string) =>
    (
      await t
        .db!.select()
        .from(outbox)
        .where(eq(sql`${outbox.envelope}->'payload'->>'userId'`, userId))
    ).map((e) => (e.envelope as { type: string; payload: Record<string, unknown> }).type);

  /** Achat de `skinId` : session créée par le service puis payée chez (le faux) Stripe. */
  async function paidPurchase(u: TestUser, skinId: string) {
    const { url } = await h.ok<{ url: string }>(u, 'POST', '/v1/billing/checkout', { skinId });
    return t.stripe.pay(h.sessionIdOf(url));
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

  it('achat payé : skin livré une fois, achat terminé, événement ; relivraison sans effet', async () => {
    const session = await paidPurchase(alice, 'bismuth');
    const event = signedEvent('checkout.session.completed', session);

    let res = await t.deliver(event);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
    expect(t.services.callsFor(alice.id)).toEqual([
      { 'inventory/bismuth': { source: 'purchase' } },
    ]);
    const [purchase] = await t.db!.select().from(purchases).where(eq(purchases.userId, alice.id));
    expect(purchase).toMatchObject({
      status: 'completed',
      kind: 'dice',
      itemId: 'bismuth',
      amountCents: 500,
      stripePaymentIntentId: expect.stringMatching(/^pi_/),
    });
    // Client Stripe retenu pour les factures et le portail
    const [customer] = await t.db!.select().from(customers).where(eq(customers.userId, alice.id));
    expect(customer).toMatchObject({ stripeCustomerId: session.customer, premium: false });

    // Même événement relivré : acquitté, aucun appel, aucun événement de plus
    res = await t.deliver(event);
    expect(res.json()).toEqual({ received: true, duplicate: true });
    // Autre événement pour la même session (async_payment_succeeded) : achat déjà livré
    res = await t.deliver(signedEvent('checkout.session.async_payment_succeeded', session));
    expect(res.statusCode).toBe(200);
    expect(t.services.callsFor(alice.id)).toHaveLength(1);
    expect(await events(alice.id)).toEqual(['billing.purchase_completed']);
    const processed = await t
      .db!.select()
      .from(processedEvents)
      .where(inArray(processedEvents.stripeEventId, [event.id]));
    expect(processed).toHaveLength(1);
  });

  it('dice injoignable : 500 sans marquer l’événement, puis relivraison qui livre', async () => {
    const session = await paidPurchase(alice, 'magma');
    const event = signedEvent('checkout.session.completed', session);

    t.services.setDown(true);
    let res = await t.deliver(event);
    expect([res.statusCode, res.json().code]).toEqual([500, 'webhook_retry']);
    const marked = () =>
      t.db!.select().from(processedEvents).where(eq(processedEvents.stripeEventId, event.id));
    expect(await marked()).toHaveLength(0);
    expect(await events(alice.id)).toEqual([]);

    // Stripe relivre plus tard, dice est revenu
    t.services.setDown(false);
    res = await t.deliver(event);
    expect(res.statusCode).toBe(200);
    expect(await marked()).toHaveLength(1);
    expect(t.services.callsFor(alice.id)).toEqual([{ 'inventory/magma': { source: 'purchase' } }]);
    expect(await events(alice.id)).toEqual(['billing.purchase_completed']);
  });

  it('abonnement : premium activé, résiliation programmée, puis fin du premium', async () => {
    const { url } = await h.ok<{ url: string }>(alice, 'POST', '/v1/billing/subscribe', {});
    const session = t.stripe.pay(h.sessionIdOf(url));
    const subId = session.subscription as string;
    const customerId = session.customer as string;

    let res = await t.deliver(signedEvent('checkout.session.completed', session));
    expect(res.statusCode).toBe(200);
    expect(t.services.callsFor(alice.id)).toEqual([
      { 'all-skins': { allSkins: true } },
      { premium: { premium: true } },
    ]);
    let me = await h.ok(alice, 'GET', '/v1/billing/me');
    expect(me).toMatchObject({
      premium: true,
      premiumSince: expect.any(String),
      cancelAtPeriodEnd: false,
      hasCustomer: true,
      hasSubscription: true,
    });

    // Résiliation depuis le portail Stripe : fin programmée
    const cancelAt = Math.floor(Date.now() / 1000) + 10 * 24 * 3600;
    res = await t.deliver(
      signedEvent(
        'customer.subscription.updated',
        subscriptionObject(subId, customerId, { cancel_at_period_end: true, cancel_at: cancelAt }),
      ),
    );
    expect(res.statusCode).toBe(200);
    me = await h.ok(alice, 'GET', '/v1/billing/me');
    expect(me).toMatchObject({
      premium: true,
      cancelAtPeriodEnd: true,
      premiumEndDate: new Date(cancelAt * 1000).toISOString(),
    });

    // Suppression d'un autre abonnement (ancien, remplacé) : ignorée
    await t.deliver(
      signedEvent('customer.subscription.deleted', subscriptionObject('sub_ancien', customerId)),
    );
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).premium).toBe(true);

    // Fin de la période : abonnement supprimé, premium retiré partout
    const deleted = signedEvent(
      'customer.subscription.deleted',
      subscriptionObject(subId, customerId, { status: 'canceled' }),
    );
    res = await t.deliver(deleted);
    expect(res.statusCode).toBe(200);
    expect(t.services.callsFor(alice.id).slice(2)).toEqual([
      { 'all-skins': { allSkins: false } },
      { premium: { premium: false } },
    ]);
    me = await h.ok(alice, 'GET', '/v1/billing/me');
    expect(me).toMatchObject({
      premium: false,
      cancelAtPeriodEnd: false,
      premiumEndDate: null,
      hasSubscription: false,
      hasCustomer: true,
    });
    // Relivrée : rien de plus
    await t.deliver(deleted);
    expect(t.services.callsFor(alice.id)).toHaveLength(4);
    expect(await events(alice.id)).toEqual([
      'billing.premium_activated',
      'billing.premium_cancellation_scheduled',
      'billing.premium_deactivated',
    ]);
  });

  it('facture payée : événement billing.invoice_paid sans lien de facture ; inconnue ignorée', async () => {
    const session = await paidPurchase(alice, 'ruby');
    await t.deliver(signedEvent('checkout.session.completed', session));
    const invoice = {
      id: 'in_test_facture_1',
      object: 'invoice',
      customer: session.customer,
      number: 'VTT-0001',
      amount_paid: 250,
      currency: 'eur',
      hosted_invoice_url: 'https://invoice.stripe.test/secret',
    };
    expect((await t.deliver(signedEvent('invoice.paid', invoice))).statusCode).toBe(200);
    expect(
      (await t.deliver(signedEvent('invoice.paid', { ...invoice, customer: 'cus_inconnu' })))
        .statusCode,
    ).toBe(200);
    const [paid] = await t
      .db!.select()
      .from(outbox)
      .where(
        and(
          eq(sql`${outbox.envelope}->>'type'`, 'billing.invoice_paid'),
          eq(sql`${outbox.envelope}->'payload'->>'userId'`, alice.id),
        ),
      );
    const envelope = paid!.envelope as { visibility: string; payload: Record<string, unknown> };
    expect(envelope.visibility).toBe('owner');
    expect(envelope.payload).toEqual({
      userId: alice.id,
      invoiceId: 'in_test_facture_1',
      number: 'VTT-0001',
      amountPaid: 250,
      currency: 'eur',
    });
    expect(JSON.stringify(envelope)).not.toContain('invoice.stripe.test');
  });

  it('session expirée : achat abandonné ; événement inconnu acquitté', async () => {
    const { url } = await h.ok<{ url: string }>(alice, 'POST', '/v1/billing/checkout', {
      skinId: 'poison',
    });
    const session = t.stripe.sessions.get(h.sessionIdOf(url))!;
    await t.deliver(signedEvent('checkout.session.expired', { ...session, status: 'expired' }));
    const [purchase] = await t.db!.select().from(purchases).where(eq(purchases.userId, alice.id));
    expect(purchase!.status).toBe('expired');
    expect((await t.deliver(signedEvent('charge.refunded', { id: 'ch_1' }))).statusCode).toBe(200);
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
