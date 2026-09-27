/**
 * Achats à l'unité, sur un vrai PostgreSQL (rôle billing_svc) et un faux
 * Stripe : montant pris du catalogue, acheteur pris du jeton, confirmation
 * de la session au retour de Checkout.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { purchases } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('achat à l’unité', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    alice = await t.user();
    bob = await t.user();
  });

  afterEach(async () => {
    await t.close();
  });

  it('prend le prix du catalogue et l’acheteur du jeton, jamais du corps', async () => {
    const res = await h.request(alice, 'POST', '/v1/billing/checkout', {
      skinId: 'bismuth',
      // Champs d'un client malveillant : ignorés
      price: 1,
      unit_amount: 1,
      userId: bob.id,
      returnUrl: '/campaigns/abc?tab=dice',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toMatch(/^https:\/\/checkout\.stripe\.test\//);

    const [params] = t.stripe.created;
    expect(params).toMatchObject({
      mode: 'payment',
      customer_creation: 'always',
      client_reference_id: alice.id,
      metadata: { skinId: 'bismuth', type: 'dice', userId: alice.id },
      invoice_creation: { enabled: true },
    });
    expect(params!.line_items).toEqual([
      {
        price_data: {
          currency: 'eur',
          product_data: expect.objectContaining({ name: 'Dés : Ziggourat de Bismuth' }),
          unit_amount: 500,
        },
        quantity: 1,
      },
    ]);
    expect(params!.success_url).toBe(
      'http://front.test/checkout/success?session_id={CHECKOUT_SESSION_ID}&skin_id=bismuth' +
        '&type=dice&returnUrl=%2Fcampaigns%2Fabc%3Ftab%3Ddice',
    );
    expect(params!.cancel_url).toBe(
      'http://front.test/checkout/cancel?returnUrl=%2Fcampaigns%2Fabc%3Ftab%3Ddice',
    );

    const rows = await t.db!.select().from(purchases).where(eq(purchases.userId, alice.id));
    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'dice',
        itemId: 'bismuth',
        amountCents: 500,
        status: 'pending',
      }),
    ]);
    expect(await t.db!.select().from(purchases).where(eq(purchases.userId, bob.id))).toEqual([]);
  });

  it('vend les cadres de jetons à leur prix (token_<id>)', async () => {
    await h.ok(alice, 'POST', '/v1/billing/checkout', { skinId: 'token_Token5' });
    expect(t.stripe.created[0]).toMatchObject({
      metadata: { skinId: 'Token5', type: 'token' },
      line_items: [
        { price_data: { unit_amount: 399, product_data: { name: 'Cadre : Cadre Sylvestre' } } },
      ],
    });
  });

  it('refuse article inconnu, gratuit, déjà acheté, retour hors du site et clé d’API', async () => {
    const code = async (u: TestUser, body: unknown) => {
      const res = await h.request(u, 'POST', '/v1/billing/checkout', body);
      return [res.statusCode, res.json().code];
    };
    expect(await code(alice, { skinId: 'inexistant' })).toEqual([404, 'item_not_found']);
    expect(await code(alice, { skinId: 'token_Token99' })).toEqual([404, 'item_not_found']);
    expect(await code(alice, { skinId: 'gold' })).toEqual([400, 'item_free']);
    expect(await code(alice, { skinId: 'steampunk_copper' })).toEqual([400, 'item_free']);
    for (const returnUrl of ['https://evil.test/', '//evil.test/x', '/\\evil.test', 'profil'])
      expect(await code(alice, { skinId: 'ruby', returnUrl })).toEqual([400, 'validation_failed']);
    const bot = await t.user(['api']);
    expect(await code(bot, { skinId: 'ruby' })).toEqual([403, 'api_key_forbidden']);
    expect((await t.app.inject({ method: 'POST', url: '/v1/billing/checkout' })).statusCode).toBe(
      401,
    );

    // Acheté puis livré : un second achat est refusé
    const { url } = await h.ok<{ url: string }>(alice, 'POST', '/v1/billing/checkout', {
      skinId: 'ruby',
    });
    const id = h.sessionIdOf(url);
    t.stripe.pay(id);
    await h.ok(alice, 'GET', `/v1/billing/checkout/sessions/${id}`);
    expect(await code(alice, { skinId: 'ruby' })).toEqual([409, 'already_owned']);
    expect(t.stripe.created).toHaveLength(1);
  });

  it('retour de Checkout : en attente, puis livré par la confirmation ; autre utilisateur : 404', async () => {
    const { url } = await h.ok<{ url: string }>(alice, 'POST', '/v1/billing/checkout', {
      skinId: 'onyx_dore',
    });
    const id = h.sessionIdOf(url);
    const status = () => h.ok(alice, 'GET', `/v1/billing/checkout/sessions/${id}`);

    expect(await status()).toEqual({ status: 'pending', kind: 'dice', itemId: 'onyx_dore' });
    expect(t.services.calls).toHaveLength(0);

    // Payé, webhook pas encore reçu : la confirmation livre elle-même (idempotent)
    t.stripe.pay(id);
    expect(await status()).toEqual({ status: 'completed', kind: 'dice', itemId: 'onyx_dore' });
    expect(await status()).toEqual({ status: 'completed', kind: 'dice', itemId: 'onyx_dore' });
    expect(t.services.callsFor(alice.id)).toEqual([
      { 'inventory/onyx_dore': { source: 'purchase' } },
    ]);

    const other = await h.request(bob, 'GET', `/v1/billing/checkout/sessions/${id}`);
    expect([other.statusCode, other.json().code]).toEqual([404, 'session_not_found']);
    const unknown = await h.request(alice, 'GET', '/v1/billing/checkout/sessions/cs_test_inconnue');
    expect(unknown.statusCode).toBe(404);
  });

  it('livraison impossible au retour (dice en panne) : « en attente », le webhook finira', async () => {
    const { url } = await h.ok<{ url: string }>(alice, 'POST', '/v1/billing/checkout', {
      skinId: 'eclipse',
    });
    const id = h.sessionIdOf(url);
    t.stripe.pay(id);
    t.services.setDown(true);
    expect(await h.ok(alice, 'GET', `/v1/billing/checkout/sessions/${id}`)).toMatchObject({
      status: 'pending',
    });
  });

  it('Stripe injoignable : 502 stripe_error', async () => {
    t.stripe.setDown(true);
    const res = await h.request(alice, 'POST', '/v1/billing/checkout', { skinId: 'ruby' });
    expect([res.statusCode, res.json().code]).toEqual([502, 'stripe_error']);
  });

  it('sans clé Stripe : le service répond, les paiements 503 billing_unconfigured', async () => {
    const bare = await testApp({}, { withoutStripe: true });
    try {
      const u = await bare.user();
      const hb = helpers(bare);
      for (const [method, url, body] of [
        ['POST', '/v1/billing/checkout', { skinId: 'ruby' }],
        ['POST', '/v1/billing/subscribe', {}],
      ] as const) {
        const res = await hb.request(u, method, url, body);
        expect([res.statusCode, res.json().code]).toEqual([503, 'billing_unconfigured']);
      }
      expect(await hb.ok(u, 'GET', '/v1/billing/me')).toMatchObject({
        configured: false,
        premium: false,
      });
      expect(await hb.ok(u, 'GET', '/v1/billing/invoices')).toEqual({ invoices: [] });
      expect((await bare.app.inject({ url: '/healthz' })).statusCode).toBe(200);
    } finally {
      await bare.close();
    }
  });
});
