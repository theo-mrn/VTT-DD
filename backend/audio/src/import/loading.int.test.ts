/** Chargement rejouable : compteurs, copies des envois, pas de doublon. */
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCatalog } from '../catalog/index.js';
import { channels, jobs, legacyIds, playlists } from '../db/schema.js';
import { TEST_DATABASE_URL, testApp, type TestContext } from '../test/test-app.js';
import { loadPlan } from './loading.js';
import {
  addMusicState,
  addPlaylist,
  addTemplate,
  createPlan,
  type FirestoreDoc,
} from './transform.js';

describe.skipIf(!TEST_DATABASE_URL)('chargement de l’import', () => {
  let t: TestContext;
  beforeEach(async () => {
    t = await testApp();
  });
  afterEach(async () => t.close());

  it('rejoué : mêmes données, rien en double ; envoi copié une seule fois', async () => {
    const c = await t.table();
    const catalog = createCatalog({ publishedBase: null });
    const room = crypto.randomUUID().slice(0, 6);
    const doc = (path: string, data: Record<string, unknown>): FirestoreDoc => ({
      path,
      id: path.split('/').pop()!,
      data,
    });
    const build = () => {
      const plan = createPlan();
      const map = new Map<string, string>();
      for (const d of [
        doc(`sound_templates/${room}/templates/a`, {
          name: 'A',
          type: 'youtube',
          category: 'music',
          soundUrl: 'mtOuasYJnv8',
        }),
        doc(`sound_templates/${room}/templates/b`, {
          name: 'B',
          type: 'file',
          soundUrl: `https://assets.test/sounds/${room}/b.mp3`,
        }),
        doc(`sound_templates/${room}/templates/c`, {
          name: 'C',
          type: 'file',
          soundUrl: 'https://assets.yner.fr/Audio/feu.mp3',
        }),
      ]) {
        const id = addTemplate(plan, d, c.id, catalog);
        if (id) map.set(d.path, id);
      }
      addPlaylist(
        plan,
        doc(`sound_templates/${room}/playlists/p`, { name: 'L', trackIds: ['a', 'b'] }),
        c.id,
        (p) => map.get(p),
      );
      addMusicState(plan, room, { templateId: 'a', timestamp: 12.5 }, c.id, (p) => map.get(p));
      return plan;
    };
    let fetches = 0;
    const o = {
      storage: t.files.storage,
      fetchFile: async () => {
        fetches += 1;
        return Buffer.from('ID3 fichier');
      },
      report: () => undefined,
    };
    const first = await loadPlan(t.db!, build(), o);
    expect(first).toMatchObject({ assets: 3, copied: 1, playlists: 1, channels: 1, errors: 0 });
    const second = await loadPlan(t.db!, build(), o);
    expect(second).toMatchObject({ assets: 0, copied: 0, playlists: 0, channels: 0, errors: 0 });
    expect(fetches).toBe(1);
    const [ch] = await t.db!.select().from(channels).where(eq(channels.campaignId, c.id));
    expect(ch).toMatchObject({ status: 'paused', positionMs: 12_500 });
    const ids = [...build().assets.keys()];
    expect(
      (await t.db!.select().from(jobs).where(inArray(jobs.assetId, ids))).map((j) => j.kind).sort(),
    ).toEqual(['analyze', 'analyze']);
    await t
      .db!.delete(legacyIds)
      .where(
        inArray(legacyIds.targetId, [
          ...ids,
          ...(
            await t
              .db!.select({ id: playlists.id })
              .from(playlists)
              .where(eq(playlists.campaignId, c.id))
          ).map((p) => p.id),
        ]),
      );
  });
});
