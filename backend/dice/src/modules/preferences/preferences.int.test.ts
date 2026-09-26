/** Préférences de dés : skin, animation 3D, son, inventaire. */
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inventory, outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('préférences', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let alice: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    alice = await t.user('Alice');
  });

  afterEach(async () => {
    await t.close();
  });

  const url = '/v1/dice/me/preferences';

  it('valeurs par défaut : skin gold, 3D et son actifs, skins gratuits', async () => {
    expect(await h.ok(alice, 'GET', url)).toEqual({
      skinId: 'gold',
      animation3d: true,
      sound: true,
      inventory: ['gold', 'silver', 'steampunk_copper', 'pierre_donjon'],
    });
  });

  it('modifie les préférences ; skin inconnu 422, skin non possédé 403', async () => {
    const p = await h.ok(alice, 'PATCH', url, { skinId: 'silver', animation3d: false });
    expect(p).toMatchObject({ skinId: 'silver', animation3d: false, sound: true });
    expect(await h.ok(alice, 'GET', url)).toMatchObject({ skinId: 'silver', animation3d: false });

    let res = await h.request(alice, 'PATCH', url, { skinId: 'licorne' });
    expect([res.statusCode, res.json().code]).toEqual([422, 'unknown_skin']);
    res = await h.request(alice, 'PATCH', url, { skinId: 'kyber_or' });
    expect([res.statusCode, res.json().code]).toEqual([403, 'skin_not_owned']);
    res = await h.request(alice, 'PATCH', url, {});
    expect(res.statusCode).toBe(400);

    // Débloqué (boutique, défi, import) : utilisable
    await t.db!.insert(inventory).values({ userId: alice.id, skinId: 'kyber_or', source: 'gift' });
    const after = await h.ok<{ skinId: string; inventory: string[] }>(alice, 'PATCH', url, {
      skinId: 'kyber_or',
    });
    expect(after.skinId).toBe('kyber_or');
    expect(after.inventory).toContain('kyber_or');

    const events = await t
      .db!.select()
      .from(outbox)
      .where(eq(sql`${outbox.envelope}->'actor'->>'userId'`, alice.id));
    expect(events.map((e) => (e.envelope as { type: string }).type)).toContain(
      'dice.preferences_updated',
    );

    // Skin retiré de l'inventaire : retour au skin par défaut
    await t.db!.delete(inventory).where(eq(inventory.userId, alice.id));
    expect((await h.ok<{ skinId: string }>(alice, 'GET', url)).skinId).toBe('gold');
  });
});
