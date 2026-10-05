/**
 * Statut premium appliqué depuis les droits publiés par billing
 * (billing.entitlements_changed), sur un vrai PostgreSQL (rôle identity_svc).
 * Ignorés si TEST_DATABASE_URL est absent.
 */
import { ENTITLEMENTS_CHANGED, EventEnvelope, uuidv7 } from '@vtt/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { handleRightsEvent } from './index.js';

const rights = (userId: string, version: number, premium: boolean): EventEnvelope =>
  EventEnvelope.parse({
    id: uuidv7(),
    type: ENTITLEMENTS_CHANGED,
    version: 1,
    occurredAt: new Date().toISOString(),
    roomId: null,
    actor: { userId: null, role: 'system' },
    aggregate: { type: 'billing_customer', id: userId },
    payload: { userId, version, premium, diceSkins: [], tokenFrames: [] },
    correlationId: 'test-droits',
  });

describe.skipIf(!TEST_DATABASE_URL)('premium (droits publiés par billing)', () => {
  let t: Awaited<ReturnType<typeof appDeTest>>;

  beforeAll(async () => {
    t = await appDeTest();
  });
  afterAll(async () => {
    await t?.fermer();
  });

  it('pose le statut, l’expose sur le profil public, ignore les versions dépassées', async () => {
    const u = await t.inscrire('Mécène');
    const other = await t.inscrire('Lecteur');
    const apply = (version: number, premium: boolean) =>
      handleRightsEvent(t.db, rights(u.id, version, premium));
    const profile = async () =>
      (await t.app.inject({ url: `/v1/users/${u.id}`, headers: other.auth })).json();

    expect(await apply(1, true)).toBe('applied');
    expect(await profile()).toMatchObject({ premium: true });
    // Rejoué ou en retard : sans effet
    expect(await apply(1, false)).toBe('stale');
    expect(await profile()).toMatchObject({ premium: true });

    expect(await apply(3, false)).toBe('applied');
    expect(await apply(2, true)).toBe('stale');
    expect(await profile()).toMatchObject({ premium: false });

    const events = await t.db
      .select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        and(
          sql`${outbox.envelope}->'aggregate'->>'id' = ${u.id}`,
          eq(sql`${outbox.envelope}->>'type'`, 'identity.premium_changed'),
        ),
      )
      .orderBy(outbox.createdAt, outbox.id);
    expect(events.map((e) => (e.envelope as { payload: unknown }).payload)).toEqual([
      { premium: true },
      { premium: false },
    ]);
  });

  it('compte inconnu, autre événement ou charge utile illisible : ignoré', async () => {
    expect(await handleRightsEvent(t.db, rights(crypto.randomUUID(), 1, true))).toBe('ignored');
    const u = await t.inscrire();
    expect(
      await handleRightsEvent(t.db, { ...rights(u.id, 1, true), type: 'billing.invoice_paid' }),
    ).toBe('ignored');
    expect(
      await handleRightsEvent(t.db, { ...rights(u.id, 1, true), payload: { userId: u.id } }),
    ).toBe('ignored');
  });
});
