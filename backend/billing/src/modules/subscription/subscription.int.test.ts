/**
 * Abonnement premium (formules, résiliation, reprise, portail, factures), sur
 * un vrai PostgreSQL (rôle billing_svc) et un faux Stripe.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { grant } from '../../payments/entitlements.js';
import { signedEvent } from '../../test/fake-stripe.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('abonnement premium', () => {
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

  /** Abonnement payé et confirmé au retour de Checkout ; renvoie la session. */
  async function subscribe(u: TestUser, plan: 'monthly' | 'annual' = 'monthly') {
    const { url } = await h.ok<{ url: string }>(u, 'POST', '/v1/billing/subscribe', {
      plan,
      returnUrl: '/profil/abonnement',
    });
    const id = h.sessionIdOf(url);
    const session = t.stripe.pay(id);
    expect(await h.ok(u, 'GET', `/v1/billing/checkout/sessions/${id}`)).toEqual({
      status: 'completed',
      kind: 'premium',
      itemId: null,
    });
    return session;
  }

  it('formules : prix Stripe de la formule choisie, utilisateur du jeton', async () => {
    expect(await h.ok(alice, 'GET', '/v1/billing/plans')).toEqual({
      currency: 'eur',
      plans: [
        { id: 'monthly', name: 'Mensuel', amount: 499, interval: 'month' },
        { id: 'annual', name: 'Annuel', amount: 4990, interval: 'year' },
      ],
    });
    await h.ok(alice, 'POST', '/v1/billing/subscribe', {});
    await h.ok(alice, 'POST', '/v1/billing/subscribe', { plan: 'annual' });
    expect(t.stripe.created[0]).toMatchObject({
      mode: 'subscription',
      line_items: [{ price: 'price_premium_monthly', quantity: 1 }],
      client_reference_id: alice.id,
      metadata: { userId: alice.id, type: 'premium_subscription', plan: 'monthly' },
      subscription_data: { metadata: { userId: alice.id } },
      success_url: 'http://front.test/paiement/succes?session_id={CHECKOUT_SESSION_ID}&retour=%2F',
    });
    expect(t.stripe.created[1]!.line_items).toEqual([
      { price: 'price_premium_annual', quantity: 1 },
    ]);
    const res = await h.request(alice, 'POST', '/v1/billing/subscribe', { plan: 'lifetime' });
    expect(res.statusCode).toBe(400);
  });

  it('abonné : premium, formule et échéance ; nouvel abonnement et achat de dés refusés', async () => {
    await subscribe(alice, 'annual');
    expect(await t.rights(alice.id)).toEqual([
      { userId: alice.id, version: 1, premium: true, diceSkins: [], tokenFrames: [] },
    ]);
    expect(await h.ok(alice, 'GET', '/v1/billing/me')).toEqual({
      configured: true,
      premium: true,
      premiumSource: 'subscription',
      premiumSince: expect.any(String),
      subscription: {
        plan: 'annual',
        status: 'active',
        currentPeriodEnd: expect.any(String),
        cancelAt: null,
        paymentIssue: false,
      },
      hasCustomer: true,
    });
    let res = await h.request(alice, 'POST', '/v1/billing/subscribe', {});
    expect([res.statusCode, res.json().code]).toEqual([409, 'already_premium']);
    res = await h.request(alice, 'POST', '/v1/billing/checkout', { itemId: 'ruby' });
    expect([res.statusCode, res.json().code]).toEqual([409, 'already_owned']);
    expect((await t.events(alice.id)).map((e) => e.type)).toEqual([
      'billing.entitlements_changed',
      'billing.subscription_started',
      'billing.premium_activated',
    ]);
  });

  it('résiliation en fin de période puis reprise ; page de succès rouverte sans effet', async () => {
    const session = await subscribe(alice);
    const subId = session.subscription as string;

    const { cancelAt } = await h.ok<{ cancelAt: string }>(
      alice,
      'POST',
      '/v1/billing/subscription/cancel',
    );
    expect(new Date(cancelAt).getTime()).toBeGreaterThan(Date.now());
    expect(t.stripe.subscriptions.get(subId)).toMatchObject({ cancel_at_period_end: true });
    expect(await h.ok(alice, 'GET', '/v1/billing/me')).toMatchObject({
      premium: true,
      subscription: { status: 'active', cancelAt },
    });
    // Déjà résilié : même réponse, sans nouvel appel ; page de succès rouverte : rien ne change
    expect(await h.ok(alice, 'POST', '/v1/billing/subscription/cancel')).toEqual({ cancelAt });
    await h.ok(alice, 'GET', `/v1/billing/checkout/sessions/${session.id}`);
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).subscription).toMatchObject({ cancelAt });

    expect(await h.ok(alice, 'POST', '/v1/billing/subscription/resume')).toEqual({ resumed: true });
    expect(t.stripe.subscriptions.get(subId)).toMatchObject({ cancel_at_period_end: false });
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).subscription).toMatchObject({
      cancelAt: null,
    });
    const again = await h.request(alice, 'POST', '/v1/billing/subscription/resume');
    expect([again.statusCode, again.json().code]).toEqual([409, 'not_cancelled']);

    const business = (await t.events(alice.id)).filter(
      (e) => e.type !== 'billing.entitlements_changed',
    );
    expect(business.map((e) => e.type)).toEqual([
      'billing.subscription_started',
      'billing.premium_activated',
      'billing.subscription_cancellation_scheduled',
      'billing.subscription_resumed',
    ]);
  });

  it('abonnement terminé : une vieille session ne réactive pas le premium', async () => {
    const session = await subscribe(alice);
    const sub = t.stripe.updateSubscription(session.subscription as string, {
      status: 'canceled',
      ended_at: Math.floor(Date.now() / 1000),
    });
    await t.deliver(signedEvent('customer.subscription.deleted', sub));
    expect(await h.ok(alice, 'GET', '/v1/billing/me')).toMatchObject({
      premium: false,
      subscription: { status: 'canceled' },
    });
    await h.ok(alice, 'GET', `/v1/billing/checkout/sessions/${session.id}`);
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).premium).toBe(false);
    expect((await t.rights(alice.id)).at(-1)).toMatchObject({ version: 2, premium: false });
  });

  it('premium de l’ancienne app (sans abonnement Stripe) : résiliation immédiate', async () => {
    await grant(t.db!, { userId: alice.id, kind: 'premium', source: 'legacy' });
    expect(await h.ok(alice, 'GET', '/v1/billing/me')).toMatchObject({
      premium: true,
      premiumSource: 'legacy',
      subscription: null,
    });
    expect(await h.ok(alice, 'POST', '/v1/billing/subscription/cancel')).toEqual({
      cancelAt: null,
    });
    expect(await t.rights(alice.id)).toEqual([
      { userId: alice.id, version: 1, premium: false, diceSkins: [], tokenFrames: [] },
    ]);
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).premium).toBe(false);
    expect(
      (await t.events(alice.id)).filter((e) => e.type !== 'billing.entitlements_changed'),
    ).toEqual([
      expect.objectContaining({
        type: 'billing.premium_deactivated',
        actor: expect.objectContaining({ role: 'user', userId: alice.id }),
      }),
    ]);
    const again = await h.request(alice, 'POST', '/v1/billing/subscription/cancel');
    expect([again.statusCode, again.json().code]).toEqual([404, 'no_subscription']);
  });

  it('portail et factures : client Stripe de l’appelant seulement', async () => {
    let res = await h.request(alice, 'POST', '/v1/billing/portal', {});
    expect([res.statusCode, res.json().code]).toEqual([404, 'no_customer']);
    expect(await h.ok(alice, 'GET', '/v1/billing/invoices')).toEqual({ invoices: [] });

    const session = await subscribe(alice);
    const customer = session.customer as string;
    res = await h.request(alice, 'POST', '/v1/billing/portal', { returnUrl: '/profil/abonnement' });
    expect(res.json()).toEqual({ url: `https://billing.stripe.test/p/session/${customer}` });
    expect(t.stripe.portals).toEqual([
      { customer, returnUrl: 'http://front.test/profil/abonnement' },
    ]);

    const invoice = t.stripe.invoice(customer);
    await t.deliver(signedEvent('invoice.paid', invoice));
    expect(await h.ok(alice, 'GET', '/v1/billing/invoices')).toEqual({
      invoices: [
        {
          id: invoice.id,
          number: invoice.number,
          date: invoice.created,
          amount: 499,
          currency: 'eur',
          status: 'paid',
          description: '1 × Yner Premium (4,99 €/mois)',
          hostedUrl: invoice.hosted_invoice_url,
          pdfUrl: invoice.invoice_pdf,
        },
      ],
    });
    // Bob n'a pas de client : il ne voit jamais les factures d'Alice
    const bob = await t.user();
    expect(await h.ok(bob, 'GET', '/v1/billing/invoices')).toEqual({ invoices: [] });
  });
});
