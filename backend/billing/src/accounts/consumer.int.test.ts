/**
 * Compte supprimé (identity.user_deleted) sur un vrai PostgreSQL : client Stripe supprimé,
 * données de paiement effacées ; Stripe injoignable : rien d'effacé, l'événement sera relivré.
 */
import { USER_DELETED } from '@vtt/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { customers, entitlements } from '../db/schema.js';
import { fakeStripe } from '../test/fake-stripe.js';
import { TEST_DATABASE_URL } from '../test/test-app.js';
import { handleUserDeleted } from './consumer.js';

describe.skipIf(!TEST_DATABASE_URL)('compte supprimé', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(() => {
    const c = createDb(TEST_DATABASE_URL!);
    db = c.db;
    close = () => c.pool.end();
  });
  afterAll(async () => close());

  const event = (userId: string) => ({
    id: crypto.randomUUID(),
    type: USER_DELETED,
    aggregate: { type: 'user', id: userId },
  });

  async function payingUser(stripe: ReturnType<typeof fakeStripe>) {
    const userId = crypto.randomUUID();
    const stripeCustomerId = `cus_${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}`;
    stripe.customers.set(stripeCustomerId, { id: stripeCustomerId } as never);
    await db.insert(customers).values({ userId, stripeCustomerId, email: 'a@exemple.fr' });
    await db.insert(entitlements).values({
      id: crypto.randomUUID(),
      userId,
      kind: 'premium',
      source: 'gift',
      sourceId: '',
    } as never);
    return { userId, stripeCustomerId };
  }

  it('supprime le client Stripe puis les données de paiement ; doublon ignoré', async () => {
    const stripe = fakeStripe();
    const u = await payingUser(stripe);
    const e = event(u.userId);

    expect(await handleUserDeleted({ db, stripe: stripe.api }, e)).toBe(true);
    expect(stripe.customers.has(u.stripeCustomerId)).toBe(false);
    expect(await db.select().from(customers).where(eq(customers.userId, u.userId))).toHaveLength(0);
    expect(
      await db.select().from(entitlements).where(eq(entitlements.userId, u.userId)),
    ).toHaveLength(0);
    expect(await handleUserDeleted({ db, stripe: stripe.api }, e)).toBe(false);
  });

  it('Stripe injoignable : rien effacé, l’événement sera relivré', async () => {
    const stripe = fakeStripe();
    const u = await payingUser(stripe);
    stripe.setDown(true);
    await expect(handleUserDeleted({ db, stripe: stripe.api }, event(u.userId))).rejects.toThrow();
    expect(await db.select().from(customers).where(eq(customers.userId, u.userId))).toHaveLength(1);

    stripe.setDown(false);
    expect(await handleUserDeleted({ db, stripe: stripe.api }, event(u.userId))).toBe(true);
  });

  it('client déjà absent chez Stripe, ou Stripe non configuré : données effacées', async () => {
    const stripe = fakeStripe();
    const u = await payingUser(stripe);
    stripe.customers.delete(u.stripeCustomerId);
    expect(await handleUserDeleted({ db, stripe: stripe.api }, event(u.userId))).toBe(true);
    const v = await payingUser(stripe);
    expect(await handleUserDeleted({ db, stripe: null }, event(v.userId))).toBe(true);
    expect(await db.select().from(customers).where(eq(customers.userId, v.userId))).toHaveLength(0);
  });
});
