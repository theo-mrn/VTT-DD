/**
 * Droits publiés par billing (billing.entitlements_changed), appliqués sur un
 * vrai PostgreSQL (rôle dice_svc) : premium, skins achetés, versions.
 */
import { ENTITLEMENTS_CHANGED, EventEnvelope, uuidv7 } from '@vtt/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inventory, outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';
import { handleRightsEvent } from './consumer.js';

describe.skipIf(!TEST_DATABASE_URL)('droits publiés par billing', () => {
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

  const rights = (
    version: number,
    premium: boolean,
    diceSkins: string[] = [],
    userId = alice.id,
  ): EventEnvelope =>
    EventEnvelope.parse({
      id: uuidv7(),
      type: ENTITLEMENTS_CHANGED,
      version: 1,
      occurredAt: new Date().toISOString(),
      roomId: null,
      actor: { userId: null, role: 'system' },
      aggregate: { type: 'billing_customer', id: userId },
      payload: { userId, version, premium, diceSkins, tokenFrames: [] },
      correlationId: 'test-droits',
    });

  const apply = (e: EventEnvelope) => handleRightsEvent(t.db!, e);
  const prefs = () => h.ok(alice, 'GET', '/v1/dice/me/preferences');
  const events = async (type: string) =>
    (
      await t
        .db!.select()
        .from(outbox)
        .where(
          and(
            eq(sql`${outbox.envelope}->>'type'`, type),
            eq(sql`${outbox.envelope}->'payload'->>'userId'`, alice.id),
          ),
        )
        .orderBy(outbox.id)
    ).map((e) => (e.envelope as { payload: Record<string, unknown> }).payload);

  it('premium : tous les skins ; fin : retour au skin par défaut', async () => {
    expect(await apply(rights(1, true))).toBe('applied');
    await h.ok(alice, 'PATCH', '/v1/dice/me/preferences', { skinId: 'bismuth' });
    expect(await prefs()).toMatchObject({ allSkins: true, skinId: 'bismuth' });

    expect(await apply(rights(2, false))).toBe('applied');
    expect(await prefs()).toMatchObject({ allSkins: false, skinId: 'gold' });
    // Premium, choix du skin par Alice, fin du premium
    expect((await events('dice.preferences_updated')).map((e) => e.allSkins)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('versions : un état plus ancien ou rejoué est ignoré', async () => {
    expect(await apply(rights(2, true))).toBe('applied');
    expect(await apply(rights(1, false))).toBe('stale');
    expect(await apply(rights(2, false))).toBe('stale');
    expect((await prefs()).allSkins).toBe(true);
    expect(await events('dice.preferences_updated')).toHaveLength(1);
  });

  it('skins achetés : ajoutés, retirés au remboursement, autres sources intactes', async () => {
    // Skin importé de l'ancienne app : jamais touché par billing
    await t.db!.insert(inventory).values({ userId: alice.id, skinId: 'ruby', source: 'import' });

    await apply(rights(1, false, ['bismuth', 'magma', 'gold', 'skin_inconnu']));
    let p = await prefs();
    expect(p.inventory).toEqual(expect.arrayContaining(['bismuth', 'magma', 'ruby', 'gold']));
    expect(p.inventory).not.toContain('skin_inconnu');
    await h.ok(alice, 'PATCH', '/v1/dice/me/preferences', { skinId: 'magma' });

    // Remboursement de magma ; ruby (importé) annoncé par billing ou non : gardé
    await apply(rights(2, false, ['bismuth']));
    p = await prefs();
    expect(p.inventory).toEqual(expect.arrayContaining(['bismuth', 'ruby']));
    expect(p.inventory).not.toContain('magma');
    expect(p.skinId).toBe('gold');

    expect(await events('dice.skin_granted')).toEqual([
      { userId: alice.id, skinId: 'bismuth', source: 'purchase' },
      { userId: alice.id, skinId: 'magma', source: 'purchase' },
    ]);
    expect(await events('dice.skin_revoked')).toEqual([
      { userId: alice.id, skinId: 'magma', source: 'purchase' },
    ]);
  });

  it('autre événement ou charge utile illisible : ignoré', async () => {
    const other = { ...rights(1, true), type: 'billing.invoice_paid' };
    expect(await apply(other)).toBe('ignored');
    const broken = { ...rights(1, true), payload: { userId: alice.id } };
    expect(await apply(broken)).toBe('ignored');
    expect((await prefs()).allSkins).toBe(false);
  });
});
