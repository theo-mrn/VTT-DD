/**
 * Statut premium posé par billing (route interne), sur un vrai PostgreSQL
 * (rôle identity_svc). Ignorés si TEST_DATABASE_URL est absent.
 */
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';

const SECRET = 'secret-interne-de-test-0123456789abcdef';

describe.skipIf(!TEST_DATABASE_URL)('premium (route interne de billing)', () => {
  let t: Awaited<ReturnType<typeof appDeTest>>;

  beforeAll(async () => {
    t = await appDeTest({ INTERNAL_API_SECRET: SECRET });
  });
  afterAll(async () => {
    await t?.fermer();
  });

  const put = (userId: string, premium: unknown, secret: string | null = SECRET) =>
    t.app.inject({
      method: 'PUT',
      url: `/internal/users/${userId}/premium`,
      headers: secret === null ? {} : { 'x-internal-secret': secret },
      payload: { premium },
    });

  it('exige le secret, pose le statut une seule fois et l’expose sur le profil public', async () => {
    const u = await t.inscrire('Mécène');
    const other = await t.inscrire('Lecteur');
    expect((await put(u.id, true, null)).statusCode).toBe(401);
    expect((await put(u.id, true, 'x'.repeat(40))).statusCode).toBe(401);
    expect((await put(u.id, 'oui')).statusCode).toBe(400);
    expect((await put('pas-un-uuid', true)).statusCode).toBe(400);
    const unknown = await put(crypto.randomUUID(), true);
    expect([unknown.statusCode, unknown.json().code]).toEqual([404, 'user_not_found']);

    const res = await put(u.id, true);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: u.id, premium: true });
    // Rejoué (webhook relivré) : aucun nouvel événement
    expect((await put(u.id, true)).statusCode).toBe(200);

    const profile = await t.app.inject({ url: `/v1/users/${u.id}`, headers: other.auth });
    expect(profile.json()).toMatchObject({ premium: true });

    await put(u.id, false);
    const after = await t.app.inject({ url: `/v1/users/${u.id}`, headers: other.auth });
    expect(after.json()).toMatchObject({ premium: false });

    const events = await t.db
      .select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        and(
          sql`${outbox.envelope}->'aggregate'->>'id' = ${u.id}`,
          eq(sql`${outbox.envelope}->>'type'`, 'identity.premium_changed'),
        ),
      );
    expect(events.map((e) => (e.envelope as { payload: unknown }).payload)).toEqual([
      { premium: true },
      { premium: false },
    ]);
  });

  it('sans INTERNAL_API_SECRET configuré, la route n’existe pas', async () => {
    const bare = await appDeTest();
    try {
      const u = await bare.inscrire();
      expect(
        (
          await bare.app.inject({
            method: 'PUT',
            url: `/internal/users/${u.id}/premium`,
            headers: { 'x-internal-secret': SECRET },
            payload: { premium: true },
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await bare.fermer();
    }
  });
});
