/** Playlists : création, ordre, version, pistes invalides, suppression. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { helpers, TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('playlists', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let c: Awaited<ReturnType<TestContext['table']>>;
  const url = () => `/v1/audio/campaigns/${c.id}/playlists`;
  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    c = await t.table();
  });
  afterEach(async () => t.close());

  it('cycle complet, événements réservés au MJ', async () => {
    const add = (id: string) =>
      h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/assets`, {
        source: 'youtube',
        url: id,
        name: id,
      });
    const a = (await add('aaaaaaaaaaa')).id;
    const b = (await add('bbbbbbbbbbb')).id;
    const p = await h.ok(c.gm, 'POST', url(), { name: 'Combat', assetIds: [a, b] });
    expect(p).toMatchObject({ name: 'Combat', assetIds: [a, b], version: 1 });
    const q = await h.ok(c.gm, 'PATCH', `${url()}/${p.id}`, { assetIds: [b, a], version: 1 });
    expect(q).toMatchObject({ assetIds: [b, a], version: 2 });
    expect(
      (await h.request(c.gm, 'PATCH', `${url()}/${p.id}`, { name: 'X', version: 1 })).json().code,
    ).toBe('version_conflict');
    expect((await h.request(c.gm, 'POST', url(), { name: 'D', assetIds: [a, a] })).statusCode).toBe(
      400,
    );
    expect(
      (await h.request(c.gm, 'POST', url(), { name: 'D', assetIds: [crypto.randomUUID()] })).json()
        .code,
    ).toBe('asset_not_found');
    expect((await h.request(c.player, 'GET', url())).statusCode).toBe(403);
    expect((await h.request(c.gm, 'DELETE', `${url()}/${p.id}`)).statusCode).toBe(204);
    expect((await h.ok(c.gm, 'GET', url())).items).toEqual([]);
    const types = (await h.events(c.id)).filter((e) => e.type.startsWith('audio.playlist_'));
    expect(types.map((e) => e.type)).toEqual([
      'audio.playlist_created',
      'audio.playlist_updated',
      'audio.playlist_deleted',
    ]);
    expect(types.every((e) => e.visibility === 'gm_only')).toBe(true);
  });
});
