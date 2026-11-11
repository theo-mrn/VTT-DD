/**
 * Archive d'une campagne, part d'audio (docs/export-campagne.md § 5) : sons prêts, playlists
 * et table de sons ; import sous de nouveaux identifiants, clés de fichiers hors du dossier de
 * la campagne coupées.
 */
import { ArchiveServiceSnapshot, remapIds, rowIds, uuidv7 } from '@vtt/contracts';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assets, playlistItems, playlists, soundboards } from '../../db/schema.js';
import { SECRET, TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

const internal = { 'x-internal-secret': SECRET };

describe.skipIf(!TEST_DATABASE_URL)('archive (audio)', () => {
  let t: TestContext;
  const extra: string[] = [];

  beforeEach(async () => {
    t = await testApp();
  });

  afterEach(async () => {
    if (extra.length) {
      const db = t.db!;
      await db.delete(soundboards).where(inArray(soundboards.campaignId, extra));
      await db.delete(playlists).where(inArray(playlists.campaignId, extra));
      await db.delete(assets).where(inArray(assets.campaignId, extra));
      extra.length = 0;
    }
    await t.close();
  });

  async function sample() {
    const { id, gm } = await t.table();
    extra.push(id);
    const db = t.db!;
    const sound = (name: string, status: 'ready' | 'processing') => ({
      id: uuidv7(),
      campaignId: id,
      kind: 'music' as const,
      name,
      source: 'upload' as const,
      status,
      createdBy: gm.id,
    });
    const ready = sound('Taverne', 'ready');
    const keyBase = `audio/assets/${id}/${ready.id}`;
    await db.insert(assets).values([
      {
        ...ready,
        originalKey: `${keyBase}/original.mp3`,
        playbackKey: `${keyBase}/play.opus`,
        playbackUrl: `https://files.test/vtt/${keyBase}/play.opus`,
      },
      {
        ...sound('En cours', 'processing'),
        originalKey: `audio/incoming/${id}/x.mp3`,
      },
    ]);
    const [list] = await db
      .insert(playlists)
      .values({ id: uuidv7(), campaignId: id, name: 'Soirée', createdBy: gm.id })
      .returning();
    await db.insert(playlistItems).values({ playlistId: list!.id, assetId: ready.id, position: 0 });
    await db.insert(soundboards).values({ campaignId: id, assetIds: [ready.id], updatedBy: gm.id });
    return { id, gm, ready: ready.id, keyBase };
  }

  async function snapshot(campaignId: string, gmId: string) {
    const res = await t.app.inject({
      method: 'POST',
      url: `/internal/campaigns/${campaignId}/archive/snapshot`,
      headers: internal,
      payload: { options: { keepProgress: true }, gmIds: [gmId] },
    });
    expect(res.statusCode, res.body).toBe(200);
    return ArchiveServiceSnapshot.parse(res.json());
  }

  it('exporte les sons prêts, playlists et table de sons, avec leurs fichiers', async () => {
    const { id, gm, keyBase } = await sample();
    const snap = await snapshot(id, gm.id);
    expect(snap.tables.assets!.map((a) => a.name)).toEqual(['Taverne']);
    expect(snap.tables.playlists).toHaveLength(1);
    expect(snap.tables.playlist_items).toHaveLength(1);
    expect(snap.tables.soundboards).toHaveLength(1);
    expect(snap.files.sort()).toEqual([`${keyBase}/original.mp3`, `${keyBase}/play.opus`]);
  });

  it('réimporte sous de nouveaux identifiants, une seule fois', async () => {
    const { id, gm, ready } = await sample();
    const snap = await snapshot(id, gm.id);
    const heir = await t.user();
    const ids = new Map([...rowIds(Object.values(snap.tables)), id].map((x) => [x, uuidv7()]));
    const newId = ids.get(id)!;
    extra.push(newId);
    const tables = remapIds(snap.tables, ids);
    const send = () =>
      t.app.inject({
        method: 'POST',
        url: `/internal/campaigns/${newId}/archive`,
        headers: internal,
        payload: {
          schemaVersion: snap.schemaVersion,
          tables,
          ownerId: heir.id,
          options: { keepProgress: true },
          foreignIds: [],
        },
      });
    const res = await send();
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().written).toEqual({
      assets: 1,
      playlists: 1,
      playlist_items: 1,
      soundboards: 1,
    });

    const [copy] = await t.db!.select().from(assets).where(eq(assets.campaignId, newId));
    const newAsset = ids.get(ready)!;
    expect(copy).toMatchObject({
      id: newAsset,
      createdBy: heir.id,
      originalKey: `audio/assets/${newId}/${newAsset}/original.mp3`,
      playbackKey: `audio/assets/${newId}/${newAsset}/play.opus`,
    });
    const [board] = await t.db!.select().from(soundboards).where(eq(soundboards.campaignId, newId));
    expect(board!.assetIds).toEqual([newAsset]);
    expect((await send()).statusCode).toBe(409);
  });

  it('écarte un son dont le fichier est hors de la campagne, et ce qui le cite', async () => {
    const { id, gm } = await sample();
    const snap = await snapshot(id, gm.id);
    const ids = new Map([...rowIds(Object.values(snap.tables)), id].map((x) => [x, uuidv7()]));
    const newId = ids.get(id)!;
    extra.push(newId);
    const tables = remapIds(snap.tables, ids);
    tables.assets![0]!.originalKey = `audio/assets/${uuidv7()}/x/original.mp3`;
    const res = await t.app.inject({
      method: 'POST',
      url: `/internal/campaigns/${newId}/archive`,
      headers: internal,
      payload: {
        schemaVersion: snap.schemaVersion,
        tables,
        ownerId: gm.id,
        options: { keepProgress: true },
        foreignIds: [],
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().written).toEqual({
      assets: 0,
      playlists: 1,
      playlist_items: 0,
      soundboards: 1,
    });
    const [board] = await t.db!.select().from(soundboards).where(eq(soundboards.campaignId, newId));
    expect(board!.assetIds).toEqual([]);
  });
});
