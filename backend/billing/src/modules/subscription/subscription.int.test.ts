/**
 * Abonnement premium, portail et factures, sur un vrai PostgreSQL (rôle
 * billing_svc) et un faux Stripe.
 */
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { customers, outbox } from '../../db/schema.js';
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
  async function subscribe(u: TestUser) {
    const { url } = await h.ok<{ url: string }>(u, 'POST', '/v1/billing/subscribe', {
      returnUrl: '/profile/subscription',
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

  it('session d’abonnement : prix de l’ancienne app, utilisateur du jeton', async () => {
    await h.ok(alice, 'POST', '/v1/billing/subscribe', {});
    expect(t.stripe.created[0]).toMatchObject({
      mode: 'subscription',
      client_reference_id: alice.id,
      metadata: { userId: alice.id, type: 'premium_subscription' },
      subscription_data: { metadata: { userId: alice.id } },
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: 499,
            recurring: { interval: 'month' },
            product_data: { name: 'Abonnement Premium VTT-DD' },
          },
          quantity: 1,
        },
      ],
      success_url:
        'http://front.test/checkout/subscribe-success?session_id={CHECKOUT_SESSION_ID}&returnUrl=%2F',
    });
  });

  it('prix Stripe configuré (STRIPE_PREMIUM_PRICE_ID) : utilisé tel quel', async () => {
    const other = await testApp({ STRIPE_PREMIUM_PRICE_ID: 'price_test_premium' });
    try {
      const u = await other.user();
      await helpers(other).ok(u, 'POST', '/v1/billing/subscribe', {});
      expect(other.stripe.created[0]!.line_items).toEqual([
        { price: 'price_test_premium', quantity: 1 },
      ]);
    } finally {
      await other.close();
    }
  });

  it('abonné : premium actif, nouvel abonnement refusé, dés déjà tous possédés', async () => {
    await subscribe(alice);
    expect(t.services.callsFor(alice.id)).toEqual([
      { 'all-skins': { allSkins: true } },
      { premium: { premium: true } },
    ]);
    let res = await h.request(alice, 'POST', '/v1/billing/subscribe', {});
    expect([res.statusCode, res.json().code]).toEqual([409, 'already_premium']);
    res = await h.request(alice, 'POST', '/v1/billing/checkout', { skinId: 'ruby' });
    expect([res.statusCode, res.json().code]).toEqual([409, 'already_owned']);
  });

  it('résiliation : fin de période chez Stripe ; revenir sur la page de succès ne l’annule pas', async () => {
    const session = await subscribe(alice);
    const res = await h.ok<{ success: boolean; cancelAt: number }>(
      alice,
      'POST',
      '/v1/billing/unsubscribe',
    );
    expect(res).toMatchObject({ success: true, message: 'Abonnement résilié avec succès' });
    expect(res.cancelAt).toBeGreaterThan(Date.now() / 1000);
    expect(t.stripe.subscriptions.get(session.subscription as string)).toMatchObject({
      cancel_at_period_end: true,
    });
    const me = await h.ok(alice, 'GET', '/v1/billing/me');
    expect(me).toMatchObject({
      premium: true,
      cancelAtPeriodEnd: true,
      premiumEndDate: new Date(res.cancelAt * 1000).toISOString(),
    });

    // Page de succès rouverte : l'abonnement est déjà actif, rien n'est réécrit
    await h.ok(alice, 'GET', `/v1/billing/checkout/sessions/${session.id}`);
    expect(await h.ok(alice, 'GET', '/v1/billing/me')).toMatchObject({ cancelAtPeriodEnd: true });
    // Déjà résilié : réponse identique, sans nouvel appel
    expect(await h.ok(alice, 'POST', '/v1/billing/unsubscribe')).toMatchObject({
      message: 'Abonnement déjà résilié',
      cancelAt: res.cancelAt,
    });
  });

  it('abonnement terminé : une vieille session ne réactive pas le premium', async () => {
    const session = await subscribe(alice);
    t.stripe.subscriptions.set(session.subscription as string, {
      ...t.stripe.subscriptions.get(session.subscription as string)!,
      status: 'canceled',
    });
    await t.deliver(
      signedEvent(
        'customer.subscription.deleted',
        t.stripe.subscriptions.get(session.subscription as string),
      ),
    );
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).premium).toBe(false);
    await h.ok(alice, 'GET', `/v1/billing/checkout/sessions/${session.id}`);
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).premium).toBe(false);
  });

  it('premium sans abonnement Stripe (importé) : résiliation immédiate, comme l’ancienne app', async () => {
    await t
      .db!.insert(customers)
      .values({ userId: alice.id, premium: true, premiumSince: new Date() });
    const res = await h.ok(alice, 'POST', '/v1/billing/unsubscribe');
    expect(res).toMatchObject({ success: true, cancelAt: 0 });
    expect(t.services.callsFor(alice.id)).toEqual([
      { 'all-skins': { allSkins: false } },
      { premium: { premium: false } },
    ]);
    expect((await h.ok(alice, 'GET', '/v1/billing/me')).premium).toBe(false);
    const types = (
      await t
        .db!.select()
        .from(outbox)
        .where(eq(sql`${outbox.envelope}->'payload'->>'userId'`, alice.id))
    ).map((e) => e.envelope as { type: string; actor: { role: string; userId: string } });
    expect(types).toEqual([
      expect.objectContaining({
        type: 'billing.premium_deactivated',
        actor: expect.objectContaining({ role: 'user', userId: alice.id }),
      }),
    ]);
    // Rien à résilier désormais
    const again = await h.request(alice, 'POST', '/v1/billing/unsubscribe');
    expect([again.statusCode, again.json().code]).toEqual([404, 'no_subscription']);
  });

  it('portail et factures : client Stripe de l’appelant seulement', async () => {
    let res = await h.request(alice, 'POST', '/v1/billing/portal', {});
    expect([res.statusCode, res.json().code]).toEqual([404, 'no_customer']);
    expect(await h.ok(alice, 'GET', '/v1/billing/invoices')).toEqual({ invoices: [] });

    const session = await subscribe(alice);
    const customer = session.customer as string;
    res = await h.request(alice, 'POST', '/v1/billing/portal', { returnUrl: '/profile' });
    expect(res.json()).toEqual({ url: `https://billing.stripe.test/p/session/${customer}` });
    expect(t.stripe.portals).toEqual([{ customer, returnUrl: 'http://front.test/profile' }]);

    t.stripe.invoices.set(customer, [
      {
        id: 'in_1',
        number: 'VTT-0001',
        created: 1_760_000_000,
        amount_paid: 499,
        currency: 'eur',
        status: 'paid',
        lines: { data: [{ description: 'Abonnement Premium VTT-DD' }] },
        hosted_invoice_url: 'https://invoice.stripe.test/i/1',
        invoice_pdf: 'https://invoice.stripe.test/i/1.pdf',
      } as never,
    ]);
    expect(await h.ok(alice, 'GET', '/v1/billing/invoices')).toEqual({
      invoices: [
        {
          id: 'in_1',
          number: 'VTT-0001',
          date: 1_760_000_000,
          amount: 499,
          currency: 'eur',
          status: 'paid',
          description: 'Abonnement Premium VTT-DD',
          hostedUrl: 'https://invoice.stripe.test/i/1',
          pdfUrl: 'https://invoice.stripe.test/i/1.pdf',
        },
      ],
    });
    // Bob n'a pas de client : il ne voit jamais les factures d'Alice
    const bob = await t.user();
    expect(await h.ok(bob, 'GET', '/v1/billing/invoices')).toEqual({ invoices: [] });
  });
});
