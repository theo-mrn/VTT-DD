/**
 * Comptes et campagnes supprimés sur un vrai PostgreSQL : un compte emporte ses préférences et
 * ses jets personnels, ses jets de campagne deviennent anonymes ; une campagne, ses jets.
 */
import { CAMPAIGN_DELETED, USER_DELETED } from '@vtt/contracts';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../db/client.js';
import { preferences, rolls } from '../../db/schema.js';
import { DELETED_AUTHOR, handleLifecycleEvent } from './consumer.js';

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)('comptes et campagnes supprimés', () => {
  let db: Db;
  let close: () => Promise<void>;
  const userId = crypto.randomUUID();
  const campaignId = crypto.randomUUID();
  const ids: string[] = [];

  beforeAll(() => {
    const c = createDb(URL!);
    db = c.db;
    close = () => c.pool.end();
  });
  afterAll(async () => {
    if (ids.length) await db.delete(rolls).where(inArray(rolls.id, ids));
    await close();
  });

  const roll = async (o: { campaignId: string | null; authorId: string }) => {
    const id = crypto.randomUUID();
    ids.push(id);
    await db.insert(rolls).values({
      id,
      ...o,
      authorName: 'Aelwen',
      authorAvatarUrl: 'https://assets.yner.fr/avatars/a.webp',
      source: 'free',
      outcome: {} as never,
      ...(o.campaignId ? {} : { visibility: 'self' as const }),
    });
    return id;
  };
  const event = (type: string, id: string, roomId: string | null = null) => ({
    id: crypto.randomUUID(),
    type,
    roomId,
    aggregate: { type: type === USER_DELETED ? 'user' : 'campaign', id },
  });
  const find = async (rollIds: string[]) =>
    db.select().from(rolls).where(inArray(rolls.id, rollIds));

  it('compte supprimé : préférences et jets personnels effacés, jets de campagne anonymes', async () => {
    await db.insert(preferences).values({ userId, skinId: 'marbre_blanc' }).onConflictDoNothing();
    const personal = await roll({ campaignId: null, authorId: userId });
    const inCampaign = await roll({ campaignId, authorId: userId });
    const e = event(USER_DELETED, userId);

    expect(await handleLifecycleEvent(db, e)).toBe(true);
    expect(await find([personal])).toHaveLength(0);
    expect(
      await db
        .select()
        .from(preferences)
        .where(inArray(preferences.userId, [userId])),
    ).toHaveLength(0);
    const [kept] = await find([inCampaign]);
    expect(kept).toMatchObject({
      authorName: DELETED_AUTHOR,
      authorAvatarUrl: null,
    });
    expect(await handleLifecycleEvent(db, e)).toBe(false);
  });

  it('campagne supprimée : ses jets', async () => {
    const other = crypto.randomUUID();
    const gone = await roll({ campaignId, authorId: crypto.randomUUID() });
    const kept = await roll({ campaignId: other, authorId: crypto.randomUUID() });
    expect(await handleLifecycleEvent(db, event(CAMPAIGN_DELETED, campaignId, campaignId))).toBe(
      true,
    );
    expect((await find([gone, kept])).map((r) => r.id)).toEqual([kept]);
  });
});
