/** Chargement des clients importés, sur un vrai PostgreSQL (rôle billing_svc). */
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../db/client.js';
import { customers, entitlements, subscriptions } from '../db/schema.js';
import { TEST_DATABASE_URL } from '../test/test-app.js';
import { loadCustomer } from './loading.js';
import { transformCustomer } from './transform.js';

describe.skipIf(!TEST_DATABASE_URL)('chargement de l’import billing', () => {
  const connection = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const db = connection?.db;
  const userId = crypto.randomUUID();
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12);

  afterAll(async () => {
    await db!.delete(entitlements).where(eq(entitlements.userId, userId));
    await db!.delete(subscriptions).where(eq(subscriptions.userId, userId));
    await db!.delete(customers).where(eq(customers.userId, userId));
    await connection!.pool.end();
  });

  it('importe un client une seule fois, sans jamais écraser la ligne existante', async () => {
    const c = transformCustomer({
      path: 'users/u1',
      id: 'u1',
      data: {
        premium: true,
        stripeCustomerId: `cus_${suffix}`,
        stripeSubscriptionId: `sub_${suffix}`,
        premiumSince: '2026-01-15T10:00:00.000Z',
      },
    })!;
    expect(await loadCustomer(db!, userId, c)).toBe('imported');
    expect(await loadCustomer(db!, userId, { ...c, premium: false })).toBe('already-imported');
    const [row] = await db!.select().from(customers).where(eq(customers.userId, userId));
    expect(row).toMatchObject({ stripeCustomerId: `cus_${suffix}` });
    expect(await db!.select().from(subscriptions).where(eq(subscriptions.userId, userId))).toEqual([
      expect.objectContaining({
        id: `sub_${suffix}`,
        plan: 'legacy',
        status: 'active',
        cancelAt: null,
        createdAt: new Date('2026-01-15T10:00:00.000Z'),
      }),
    ]);
    expect(await db!.select().from(entitlements).where(eq(entitlements.userId, userId))).toEqual([
      expect.objectContaining({
        kind: 'premium',
        source: 'subscription',
        sourceId: `sub_${suffix}`,
        revokedAt: null,
      }),
    ]);
  });
});
