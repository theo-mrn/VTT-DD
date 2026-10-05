/** Rattrapage depuis Stripe, sur un vrai PostgreSQL (rôle billing_svc) et un faux Stripe. */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { customers, entitlements, invoices, subscriptions } from '../db/schema.js';
import { grant } from '../payments/entitlements.js';
import { subscriptionObject } from '../test/fake-stripe.js';
import { TEST_DATABASE_URL, testApp, type TestContext } from '../test/test-app.js';
import { backfillCustomer } from './backfill.js';

describe.skipIf(!TEST_DATABASE_URL)('rattrapage depuis Stripe', () => {
  let t: TestContext;

  beforeEach(async () => {
    t = await testApp();
  });

  afterEach(async () => {
    await t.close();
  });

  it('client de l’ancienne app : état réel recopié, factures, aucun événement', async () => {
    const { id: userId } = await t.user();
    const customerId = `cus_test${userId.slice(0, 8)}`;
    const db = t.db!;
    await db.insert(customers).values({ userId, stripeCustomerId: customerId });
    // Comme après la migration : abonnement « legacy » actif et droit premium
    const oldSub = `sub_ancien${userId.slice(0, 8)}`;
    await db.insert(subscriptions).values({ id: oldSub, userId, plan: 'legacy', status: 'active' });
    await grant(db, { userId, kind: 'premium', source: 'subscription', sourceId: oldSub });

    // Chez Stripe : l'ancien abonnement est terminé, un nouveau mensuel est actif
    t.stripe.subscriptions.set(
      oldSub,
      subscriptionObject(oldSub, customerId, { status: 'canceled' }),
    );
    const newSub = `sub_neuf${userId.slice(0, 8)}`;
    t.stripe.subscriptions.set(
      newSub,
      subscriptionObject(newSub, customerId, { price: t.stripe.prices.get('premium_monthly')! }),
    );
    t.stripe.invoice(customerId);
    t.stripe.invoice(customerId, { status: 'void' });

    const deps = {
      db,
      stripe: t.stripe.api,
      effects: {
        grantSkin: async () => {},
        setAllSkins: async () => {},
        setPremium: async () => {},
      },
    };
    expect(await backfillCustomer(deps, userId, customerId)).toEqual({
      subscriptions: 2,
      invoices: 2,
    });
    // Rejoué : même résultat, rien en double
    await backfillCustomer(deps, userId, customerId);

    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    expect(subs.map((s) => [s.id, s.plan, s.status]).sort()).toEqual(
      [
        [newSub, 'monthly', 'active'],
        [oldSub, 'legacy', 'canceled'],
      ].sort(),
    );
    const rights = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
    expect(rights.map((r) => [r.sourceId, r.revokedAt === null])).toEqual(
      expect.arrayContaining([
        [oldSub, false],
        [newSub, true],
      ]),
    );
    expect(await db.select().from(invoices).where(eq(invoices.userId, userId))).toHaveLength(2);
    expect(await t.events(userId)).toEqual([]);
  });
});
