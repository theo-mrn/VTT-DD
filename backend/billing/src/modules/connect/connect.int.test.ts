/**
 * Marketplace dans billing (docs/marketplace.md § 5) sur un vrai PostgreSQL, Stripe et Connect
 * simulés : compte du créateur, session de vente demandée par marketplace (charge de
 * destination, commission), vente livrée par le webhook, remboursement, interrupteur
 * STRIPE_CONNECT.
 */
import { marketplaceFee } from '@vtt/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { CONNECT_WEBHOOK_SECRET, signedAccountEvent } from '../../test/fake-connect.js';
import { signedEvent } from '../../test/fake-stripe.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

const SECRET = 'secret-interne-de-test-0123456789abcdef';
const ON = {
  STRIPE_CONNECT: 'on',
  STRIPE_CONNECT_WEBHOOK_SECRET: CONNECT_WEBHOOK_SECRET,
  INTERNAL_API_SECRET: SECRET,
};

describe.skipIf(!TEST_DATABASE_URL)('marketplace : Stripe Connect', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;

  afterEach(async () => {
    await t.close();
  });

  async function start(overrides: Record<string, string> = ON) {
    t = await testApp(overrides);
    h = helpers(t);
  }

  const checkout = (body: Record<string, unknown>, secret = SECRET) =>
    t.app.inject({
      method: 'POST',
      url: '/internal/marketplace/checkout',
      headers: { 'x-internal-secret': secret },
      payload: body,
    });

  const sale = (buyer: TestUser, seller: TestUser, listingId = crypto.randomUUID()) => ({
    buyerId: buyer.id,
    sellerId: seller.id,
    listingId,
    title: 'Tavernes',
    priceCents: 499,
    currency: 'eur',
    returnUrl: '/marketplace/tavernes',
  });

  /** Créateur dont le compte est actif (onboarding terminé chez Stripe). */
  async function readySeller() {
    const seller = await t.user();
    const { url } = await h.ok<{ url: string }>(seller, 'POST', '/v1/billing/connect/onboarding', {
      displayName: 'Vendeuse',
    });
    const accountId = url.split('/').pop()!;
    t.connect.setState(accountId, {
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsDue: 0,
    });
    expect((await t.deliverConnect(signedAccountEvent(accountId))).statusCode).toBe(200);
    return { seller, accountId };
  }

  it('coupé par défaut : 503 connect_disabled, me le dit', async () => {
    await start({});
    const u = await t.user();
    const me = await h.ok<{ enabled: boolean }>(u, 'GET', '/v1/billing/connect/me');
    expect(me).toEqual({ enabled: false, account: null });
    const res = await h.request(u, 'POST', '/v1/billing/connect/onboarding', {
      displayName: 'Moi',
    });
    expect([res.statusCode, res.json().code]).toEqual([503, 'connect_disabled']);
  });

  it('onboarding : un seul compte, état publié et versionné, suivi par le webhook', async () => {
    await start();
    const seller = await t.user();
    const first = await h.ok<{ url: string }>(seller, 'POST', '/v1/billing/connect/onboarding', {
      displayName: 'Vendeuse',
    });
    const again = await h.ok<{ url: string }>(seller, 'POST', '/v1/billing/connect/onboarding', {
      displayName: 'Vendeuse',
    });
    expect(again.url).toBe(first.url);
    expect(t.connect.created).toHaveLength(1);
    expect(t.connect.links[0]!.returnUrl).toBe(
      'http://front.test/marketplace/studio?connect=return',
    );
    let me = await h.ok<{ account: { status: string } }>(seller, 'GET', '/v1/billing/connect/me');
    expect(me.account.status).toBe('pending');

    const accountId = first.url.split('/').pop()!;
    t.connect.setState(accountId, {
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsDue: 0,
    });
    // Signature fausse : refusée sans rien lire
    const forged = signedAccountEvent(accountId, { secret: 'whsec_autre' });
    expect((await t.deliverConnect(forged)).statusCode).toBe(400);
    const event = signedAccountEvent(accountId);
    expect((await t.deliverConnect(event)).statusCode).toBe(200);
    expect((await t.deliverConnect(event)).json()).toEqual({ received: true, duplicate: true });
    me = await h.ok(seller, 'GET', '/v1/billing/connect/me');
    expect(me.account.status).toBe('active');

    const states = (await t.events(seller.id))
      .filter((e) => e.type === 'billing.connect_account_updated')
      .map((e) => e.payload);
    expect(states.map((s) => [s.version, s.chargesEnabled])).toEqual([
      [1, false],
      [2, true],
    ]);
    const dashboard = await h.ok<{ url: string }>(seller, 'POST', '/v1/billing/connect/dashboard');
    expect(dashboard.url).toBe(`https://connect.stripe.test/express/${accountId}`);
  });

  it('vente : charge de destination et commission, livrée par le webhook, puis remboursée', async () => {
    await start();
    const { seller, accountId } = await readySeller();
    const buyer = await t.user();

    // Vendeur sans compte actif : refusé
    const stranger = await t.user();
    let res = await checkout(sale(buyer, stranger));
    expect([res.statusCode, res.json().code]).toEqual([409, 'seller_not_ready']);
    // Secret interne exigé
    res = await checkout(sale(buyer, seller), 'mauvais-secret-mauvais-secret-0000');
    expect(res.statusCode).toBe(401);

    const body = sale(buyer, seller);
    res = await checkout(body);
    expect(res.statusCode).toBe(200);
    const params = t.stripe.created.at(-1)!;
    expect(params.payment_intent_data).toMatchObject({
      application_fee_amount: marketplaceFee(499),
      on_behalf_of: accountId,
      transfer_data: { destination: accountId },
    });
    expect(params.line_items![0]!.price_data).toMatchObject({
      currency: 'eur',
      unit_amount: 499,
      tax_behavior: 'inclusive',
    });
    expect(params.invoice_creation?.invoice_data?.issuer).toEqual({
      type: 'account',
      account: accountId,
    });
    expect(params.success_url).toContain('retour=%2Fmarketplace%2Ftavernes');

    // Payée : vente terminée, événement pour marketplace
    const sessionId = (res.json() as { url: string }).url.split('/').pop()!;
    const paid = t.stripe.pay(sessionId);
    expect((await t.deliver(signedEvent('checkout.session.completed', paid))).statusCode).toBe(200);
    const completed = (await t.events(buyer.id)).filter(
      (e) => e.type === 'billing.marketplace_sale_completed',
    );
    expect(completed).toHaveLength(1);
    expect(completed[0]!.payload).toMatchObject({
      buyerId: buyer.id,
      sellerId: seller.id,
      listingId: body.listingId,
      amountCents: 499,
      feeCents: marketplaceFee(499),
    });
    // Retour de Checkout : la session est reconnue comme une vente
    const status = await h.ok(buyer, 'GET', `/v1/billing/checkout/sessions/${sessionId}`);
    expect(status).toEqual({ status: 'completed', kind: 'marketplace', itemId: body.listingId });
    // Achats de l'acheteur, ventes du créateur
    const purchases = await h.ok<{ purchases: { kind: string; name: string }[] }>(
      buyer,
      'GET',
      '/v1/billing/purchases',
    );
    expect(purchases.purchases.map((p) => [p.kind, p.name])).toEqual([['marketplace', 'Tavernes']]);
    const sales = await h.ok<{ sales: { net: number }[] }>(
      seller,
      'GET',
      '/v1/billing/connect/sales',
    );
    expect(sales.sales.map((s) => s.net)).toEqual([499 - marketplaceFee(499)]);

    // Remboursée : événement de retrait (marketplace révoque l'acquisition)
    const charge = t.stripe.chargeOf(paid.payment_intent as string);
    t.stripe.charges.set(charge.id, { ...charge, refunded: true });
    expect((await t.deliver(signedEvent('charge.refunded', { id: charge.id }))).statusCode).toBe(
      200,
    );
    const refunded = (await t.events(buyer.id)).filter(
      (e) => e.type === 'billing.marketplace_sale_refunded',
    );
    expect(refunded).toHaveLength(1);
  });

  it('refuse une vente à soi-même', async () => {
    await start();
    const { seller } = await readySeller();
    const res = await checkout(sale(seller, seller));
    expect([res.statusCode, res.json().code]).toEqual([409, 'own_listing']);
  });
});
