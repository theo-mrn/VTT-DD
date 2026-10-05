/** campaign.deleted : bibliothèque retirée, livrée deux fois sans effet. */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assets, channels, inbox, jobs, mixerPreferences, playlists } from '../db/schema.js';
import { helpers, TEST_DATABASE_URL, testApp, type TestContext } from '../test/test-app.js';
import { handleCampaignDeleted, handleUserDeleted } from './campaigns.js';

describe.skipIf(!TEST_DATABASE_URL)('suppression de campagne', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
  });
  afterEach(async () => t.close());

  it('assets supprimés logiquement, purge planifiée, playlists et canaux retirés ; doublon ignoré', async () => {
    const c = await t.table();
    const a = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/assets`, {
      source: 'youtube',
      url: 'dQw4w9WgXcQ',
      name: 'A',
    });
    await t
      .db!.update(assets)
      .set({ source: 'upload', youtubeId: null, originalKey: 'audio/x' })
      .where(eq(assets.id, a.id));
    await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/playlists`, {
      name: 'L',
      assetIds: [a.id],
    });
    await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/channels/music/commands`, {
      type: 'play',
      assetId: a.id,
    });
    const event = {
      id: crypto.randomUUID(),
      type: 'campaign.deleted',
      roomId: c.id,
      aggregate: { type: 'campaign', id: c.id },
    };
    const o = { nowMs: Date.now(), purgeAfterDays: 30 };
    expect(await handleCampaignDeleted(t.db!, event, o)).toBe(true);
    expect(await handleCampaignDeleted(t.db!, event, o)).toBe(false);
    const [row] = await t.db!.select().from(assets).where(eq(assets.id, a.id));
    expect(row!.deletedAt).not.toBeNull();
    expect(await t.db!.select().from(playlists).where(eq(playlists.campaignId, c.id))).toEqual([]);
    const [ch] = await t.db!.select().from(channels).where(eq(channels.campaignId, c.id));
    expect(ch).toMatchObject({ status: 'stopped' });
    expect(ch!.deletedAt).not.toBeNull();
    const purge = await t.db!.select().from(jobs).where(eq(jobs.assetId, a.id));
    expect(purge.map((j) => j.kind)).toEqual(['purge']);
    await t.db!.delete(inbox).where(eq(inbox.eventId, event.id));
  });

  it('compte supprimé : ses réglages du mixeur retirés, doublon ignoré', async () => {
    const userId = crypto.randomUUID();
    await t.db!.insert(mixerPreferences).values({ userId, volumes: { music: 0.5 } });
    const event = {
      id: crypto.randomUUID(),
      type: 'identity.user_deleted',
      aggregate: { type: 'user', id: userId },
    };
    expect(await handleUserDeleted(t.db!, event)).toBe(true);
    expect(
      await t.db!.select().from(mixerPreferences).where(eq(mixerPreferences.userId, userId)),
    ).toHaveLength(0);
    expect(await handleUserDeleted(t.db!, event)).toBe(false);
  });
});
