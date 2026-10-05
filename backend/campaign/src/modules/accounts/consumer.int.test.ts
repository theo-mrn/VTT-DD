/**
 * Compte supprimé (identity.user_deleted) sur un vrai PostgreSQL : ses campagnes de MJ
 * partent, il quitte celles des autres avec ses personnages, ses notes disparaissent ; les
 * campagnes et notes des autres restent.
 */
import { USER_DELETED } from '@vtt/contracts';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { campaignCharacters, campaignMembers, campaigns, notes, outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';
import { handleUserDeleted } from './consumer.js';

describe.skipIf(!TEST_DATABASE_URL)('compte supprimé', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let leaving: TestUser;
  let other: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    leaving = await t.user('Départ');
    other = await t.user('Reste');
  });

  afterEach(async () => {
    await t.close();
  });

  const deleted = (userId: string) => ({
    id: crypto.randomUUID(),
    type: USER_DELETED,
    aggregate: { type: 'user', id: userId },
    correlationId: 'test-compte-supprime',
    traceparent: null,
  });

  it('supprime ses campagnes de MJ, le retire des autres avec ses personnages et ses notes', async () => {
    const db = t.db!;
    const own = await h.campaign(leaving);
    const others = await h.campaign(other, 'dnd-classic', [leaving]);
    const hero = await h.engage(others, leaving);
    const keptHero = await h.engage(others, other);
    await h.ok(leaving, 'POST', `/v1/campaigns/${others}/notes`, { title: 'Mes secrets' });
    await h.ok(other, 'POST', `/v1/campaigns/${others}/notes`, { title: 'Notes du MJ' });

    const event = deleted(leaving.id);
    expect(await handleUserDeleted(db, event)).toBe(true);

    expect(await db.select().from(campaigns).where(eq(campaigns.id, own))).toHaveLength(0);
    expect(await db.select().from(campaigns).where(eq(campaigns.id, others))).toHaveLength(1);
    expect(
      await db
        .select()
        .from(campaignMembers)
        .where(and(eq(campaignMembers.campaignId, others), eq(campaignMembers.userId, leaving.id))),
    ).toHaveLength(0);
    const engaged = await db
      .select({ id: campaignCharacters.characterId })
      .from(campaignCharacters)
      .where(eq(campaignCharacters.campaignId, others));
    expect(engaged.map((c) => c.id)).toEqual([keptHero]);
    expect(engaged.map((c) => c.id)).not.toContain(hero);
    expect(await db.select().from(notes).where(eq(notes.ownerUserId, leaving.id))).toHaveLength(0);
    expect(await db.select().from(notes).where(eq(notes.ownerUserId, other.id))).toHaveLength(1);

    // Événements : la campagne supprimée, le départ et le personnage retiré
    const types = (await db.select({ subject: outbox.subject }).from(outbox)).map((o) => o.subject);
    expect(types).toContain(`vtt.${own}.campaign.deleted`);
    expect(types).toContain(`vtt.${others}.campaign.member_left`);
    expect(types).toContain(`vtt.${others}.campaign.character_removed`);

    // Livré deux fois : ignoré
    expect(await handleUserDeleted(db, event)).toBe(false);
  });

  it('ignore les autres événements', async () => {
    expect(await handleUserDeleted(t.db!, { ...deleted(leaving.id), type: 'identity.x' })).toBe(
      false,
    );
  });
});
