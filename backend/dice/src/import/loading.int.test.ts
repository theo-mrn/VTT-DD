/** Chargement des jets et préférences importés, sur un vrai PostgreSQL (rôle dice_svc). */
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../db/client.js';
import { inventory, legacyIds, preferences, rolls } from '../db/schema.js';
import { TEST_DATABASE_URL } from '../test/test-app.js';
import {
  alreadyImported,
  loadPreferences,
  loadRolls,
  prepareRoll,
  type Mappings,
} from './loading.js';
import { transformRoll } from './transform.js';

describe.skipIf(!TEST_DATABASE_URL)('chargement de l’import', () => {
  const connection = TEST_DATABASE_URL ? createDb(TEST_DATABASE_URL) : undefined;
  const db = connection?.db;
  const code = `T${crypto.randomUUID().slice(0, 8)}`;
  const campaignId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const maps: Mappings = {
    accounts: new Map([['uid-1', userId]]),
    campaigns: new Map([[code, campaignId]]),
    characters: new Map(),
    names: new Map(),
  };
  const legacy = (i: number) => `rolls/${code}/rolls/r${i}`;
  const prepared = (i: number, uid?: string) => {
    const p = prepareRoll(
      transformRoll({
        path: legacy(i),
        id: `r${i}`,
        data: {
          results: [i],
          total: i,
          notation: '1d20',
          timestamp: 1_700_000_000_000 + i,
          ...(uid ? { uid } : {}),
        },
      }),
      maps,
    );
    if (p.status !== 'ready') throw new Error('attendu : prêt');
    return { legacyId: legacy(i), row: p.row };
  };

  afterAll(async () => {
    await db!.delete(rolls).where(eq(rolls.campaignId, campaignId));
    await db!.delete(preferences).where(eq(preferences.userId, userId));
    await db!.delete(inventory).where(eq(inventory.userId, userId));
    await connection!.pool.end();
  });

  it('importe un lot une seule fois, dans l’ordre chronologique', async () => {
    expect(await loadRolls(db!, [prepared(1, 'uid-1'), prepared(2)])).toBe(2);
    expect(await alreadyImported(db!, [legacy(1), legacy(2), legacy(3)])).toEqual(
      new Set([legacy(1), legacy(2)]),
    );
    // Rejoué (autre import concurrent) : les doublons sont retirés
    expect(await loadRolls(db!, [prepared(2), prepared(3)])).toBe(1);
    const found = await db!
      .select()
      .from(rolls)
      .where(eq(rolls.campaignId, campaignId))
      .orderBy(rolls.id);
    expect(found.map((r) => r.total)).toEqual([1, 2, 3]);
    expect(found.map((r) => r.authorId)).toEqual([userId, null, null]);
    expect(found.every((r) => r.source === 'import')).toBe(true);
    const ids = await db!
      .select()
      .from(legacyIds)
      .where(
        inArray(
          legacyIds.rollId,
          found.map((r) => r.id),
        ),
      );
    expect(ids).toHaveLength(3);
  });

  it('préférences : jamais écrasées, inventaire enrichi', async () => {
    const p = {
      uid: 'uid-1',
      skinId: 'kyber_or',
      inventory: ['kyber_or', 'magma'],
      allSkins: false,
      warnings: [],
    };
    expect(await loadPreferences(db!, userId, p)).toEqual({
      preferences: true,
      allSkins: false,
      skins: 2,
    });
    await db!.update(preferences).set({ skinId: 'magma' }).where(eq(preferences.userId, userId));
    expect(await loadPreferences(db!, userId, { ...p, inventory: ['kyber_or', 'prism'] })).toEqual({
      preferences: false,
      allSkins: false,
      skins: 1,
    });
    const [pref] = await db!.select().from(preferences).where(eq(preferences.userId, userId));
    expect(pref!.skinId).toBe('magma');
    expect(pref!.allSkins).toBe(false);
  });

  it('premium : tous les skins, skin hors inventaire ; accès ajouté à des préférences existantes', async () => {
    const premium = crypto.randomUUID();
    const late = crypto.randomUUID();
    try {
      const owner = {
        uid: 'uid-p',
        skinId: 'bismuth',
        inventory: [],
        allSkins: true,
        warnings: [],
      };
      expect(await loadPreferences(db!, premium, owner)).toEqual({
        preferences: true,
        allSkins: true,
        skins: 0,
      });
      // Rejoué : rien ne change
      expect(await loadPreferences(db!, premium, owner)).toEqual({
        preferences: false,
        allSkins: false,
        skins: 0,
      });
      const [row] = await db!.select().from(preferences).where(eq(preferences.userId, premium));
      expect(row).toMatchObject({ skinId: 'bismuth', allSkins: true });
      expect(await db!.select().from(inventory).where(eq(inventory.userId, premium))).toEqual([]);

      // Préférences déjà choisies (import précédent) : seul l'accès est ajouté ; sans skin : gold
      await db!.insert(preferences).values({ userId: late, skinId: 'silver' });
      expect(await loadPreferences(db!, late, { ...owner, uid: 'uid-l', skinId: null })).toEqual({
        preferences: false,
        allSkins: true,
        skins: 0,
      });
      const [after] = await db!.select().from(preferences).where(eq(preferences.userId, late));
      expect(after).toMatchObject({ skinId: 'silver', allSkins: true });
    } finally {
      await db!.delete(preferences).where(inArray(preferences.userId, [premium, late]));
    }
  });
});
