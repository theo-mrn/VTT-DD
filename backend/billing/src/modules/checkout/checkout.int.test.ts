/**
 * Achats à l'unité, sur un vrai PostgreSQL (rôle billing_svc) et un faux
 * Stripe : prix Stripe du catalogue, acheteur pris du jeton, confirmation de
 * la session au retour de Checkout, liste des achats.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entitlements, purchases } from '../../db/schema.js';
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

  /** Achat payé et confirmé au retour de Checkout. */
  async function buy(u: TestUser, itemId: string) {
    const { url } = await h.ok<{ url: string }>(u, 'POST', '/v1/billing/checkout', { itemId });
    const id = h.sessionIdOf(url);
    t.stripe.pay(id);
    await h.ok(u, 'GET', `/v1/billing/checkout/sessions/${id}`);
    return t.stripe.sessions.get(id)!;
  }

  it('prix Stripe du catalogue, acheteur du jeton, jamais du corps', async () => {
    const res = await h.request(alice, 'POST', '/v1/billing/checkout', {
      itemId: 'bismuth',
      // Champs d'un client malveillant : ignorés
      price: 'price_1',
      unit_amount: 1,
      userId: bob.id,
      returnUrl: '/campagnes/abc?onglet=des',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toMatch(/^https:\/\/checkout\.stripe\.test\//);

    const [params] = t.stripe.created;
    expect(params).toMatchObject({
      mode: 'payment',
      line_items: [{ price: 'price_dice_bismuth', quantity: 1 }],
      customer_creation: 'always',
      client_reference_id: alice.id,
      metadata: { skinId: 'bismuth', type: 'dice', userId: alice.id },
      invoice_creation: { enabled: true, invoice_data: { metadata: { userId: alice.id } } },
      billing_address_collection: 'auto',
      success_url:
        'http://front.test/paiement/succes?session_id={CHECKOUT_SESSION_ID}' +
        '&retour=%2Fcampagnes%2Fabc%3Fonglet%3Ddes',
      cancel_url: 'http://front.test/paiement/annule?retour=%2Fcampagnes%2Fabc%3Fonglet%3Ddes',
    });
    expect(params).not.toHaveProperty('automatic_tax');

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

  it('cadres de jetons (token_<id>) ; TVA par Stripe Tax si STRIPE_TAX=on', async () => {
    await h.ok(alice, 'POST', '/v1/billing/checkout', { itemId: 'token_Token5' });
    expect(t.stripe.created[0]).toMatchObject({
      metadata: { skinId: 'Token5', type: 'token' },
      line_items: [{ price: 'price_token_Token5', quantity: 1 }],
    });

    const taxed = await testApp({ STRIPE_TAX: 'on' });
    try {
      const u = await taxed.user();
      await helpers(taxed).ok(u, 'POST', '/v1/billing/checkout', { itemId: 'ruby' });
      expect(taxed.stripe.created[0]).toMatchObject({ automatic_tax: { enabled: true } });
    } finally {
      await taxed.close();
    }
  });

  it('refuse article inconnu, gratuit, déjà acheté, retour hors du site et clé d’API', async () => {
    const code = async (u: TestUser, body: unknown) => {
      const res = await h.request(u, 'POST', '/v1/billing/checkout', body);
      return [res.statusCode, res.json().code];
    };
    expect(await code(alice, { itemId: 'inexistant' })).toEqual([404, 'item_not_found']);
    expect(await code(alice, { itemId: 'token_Token99' })).toEqual([404, 'item_not_found']);
    expect(await code(alice, { itemId: 'gold' })).toEqual([400, 'item_free']);
    expect(await code(alice, { itemId: 'steampunk_copper' })).toEqual([400, 'item_free']);
    for (const returnUrl of ['https://evil.test/', '//evil.test/x', '/\\evil.test', 'profil'])
      expect(await code(alice, { itemId: 'ruby', returnUrl })).toEqual([400, 'validation_failed']);
    const bot = await t.user(['api']);
    expect(await code(bot, { itemId: 'ruby' })).toEqual([403, 'api_key_forbidden']);
    expect((await t.app.inject({ method: 'POST', url: '/v1/billing/checkout' })).statusCode).toBe(
      401,
    );

    await buy(alice, 'ruby');
    expect(await code(alice, { itemId: 'ruby' })).toEqual([409, 'already_owned']);
    expect(t.stripe.created).toHaveLength(1);
  });

  it('prix absent chez Stripe (catalog:sync pas lancé) : 503 catalog_not_synced', async () => {
    t.stripe.prices.delete('dice_ruby');
    const res = await h.request(alice, 'POST', '/v1/billing/checkout', { itemId: 'ruby' });
    expect([res.statusCode, res.json().code]).toEqual([503, 'catalog_not_synced']);
  });

  it('retour de Checkout : en attente, puis livré ; droit, accord et liste des achats', async () => {
    const { url } = await h.ok<{ url: string }>(alice, 'POST', '/v1/billing/checkout', {
      itemId: 'onyx_dore',
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
      { 'all-skins': { allSkins: false } },
      { premium: { premium: false } },
      { 'inventory/onyx_dore': { source: 'purchase' } },
    ]);
    const [purchase] = await t.db!.select().from(purchases).where(eq(purchases.userId, alice.id));
    expect(purchase).toMatchObject({ status: 'completed', consentAt: expect.any(Date) });
    expect(
      await t.db!.select().from(entitlements).where(eq(entitlements.userId, alice.id)),
    ).toEqual([
      expect.objectContaining({
        kind: 'dice_skin',
        itemId: 'onyx_dore',
        source: 'purchase',
        sourceId: purchase!.id,
      }),
    ]);
    expect(await h.ok(alice, 'GET', '/v1/billing/purchases')).toEqual({
      purchases: [
        expect.objectContaining({
          kind: 'dice',
          itemId: 'onyx_dore',
          name: expect.stringMatching(/^Dés : /),
          amount: purchase!.amountCents,
          status: 'completed',
          refundedAt: null,
        }),
      ],
    });
    expect(await h.ok(bob, 'GET', '/v1/billing/purchases')).toEqual({ purchases: [] });

    const other = await h.request(bob, 'GET', `/v1/billing/checkout/sessions/${id}`);
    expect([other.statusCode, other.json().code]).toEqual([404, 'session_not_found']);
    const unknown = await h.request(alice, 'GET', '/v1/billing/checkout/sessions/cs_test_inconnue');
    expect(unknown.statusCode).toBe(404);
  });

  it('droits non appliqués au retour (dice en panne) : « en attente », le webhook finira', async () => {
    const { url } = await h.ok<{ url: string }>(alice, 'POST', '/v1/billing/checkout', {
      itemId: 'eclipse',
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
    const res = await h.request(alice, 'POST', '/v1/billing/checkout', { itemId: 'ruby' });
    expect([res.statusCode, res.json().code]).toEqual([502, 'stripe_error']);
  });

  it('sans clé Stripe : le service répond, les paiements 503 billing_unconfigured', async () => {
    const bare = await testApp({}, { withoutStripe: true });
    try {
      const u = await bare.user();
      const hb = helpers(bare);
      for (const [method, url, body] of [
        ['POST', '/v1/billing/checkout', { itemId: 'ruby' }],
        ['POST', '/v1/billing/subscribe', {}],
      ] as const) {
        const res = await hb.request(u, method, url, body);
        expect([res.statusCode, res.json().code]).toEqual([503, 'billing_unconfigured']);
      }
      expect(await hb.ok(u, 'GET', '/v1/billing/me')).toMatchObject({
        configured: false,
        premium: false,
        subscription: null,
      });
      expect(await hb.ok(u, 'GET', '/v1/billing/invoices')).toEqual({ invoices: [] });
      expect((await bare.app.inject({ url: '/healthz' })).statusCode).toBe(200);
    } finally {
      await bare.close();
    }
  });
});
