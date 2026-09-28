/** Table d'effets : sons de toute provenance, ordre, version, sons supprimés, droits. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { helpers, TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('soundboard', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let c: Awaited<ReturnType<TestContext['table']>>;
  const url = () => `/v1/audio/campaigns/${c.id}/soundboard`;
  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    c = await t.table();
  });
  afterEach(async () => t.close());

  it('choisie par le MJ, tout type de son, dans son ordre', async () => {
    const add = (id: string, kind: string) =>
      h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/assets`, {
        source: 'youtube',
        url: id,
        name: id,
        kind,
      });
    // Une musique et une ambiance ont leur place sur la table d'effets
    const a = (await add('aaaaaaaaaaa', 'music')).id;
    const b = (await add('bbbbbbbbbbb', 'ambience')).id;

    expect(await h.ok(c.gm, 'GET', url())).toEqual({ assetIds: [], version: 0 });
    expect(await h.ok(c.gm, 'PUT', url(), { assetIds: [b, a] })).toEqual({
      assetIds: [b, a],
      version: 1,
    });
    expect((await h.request(c.gm, 'PUT', url(), { assetIds: [a], version: 0 })).json().code).toBe(
      'version_conflict',
    );
    expect((await h.request(c.gm, 'PUT', url(), { assetIds: [a, a] })).statusCode).toBe(400);
    expect(
      (await h.request(c.gm, 'PUT', url(), { assetIds: [crypto.randomUUID()] })).json().code,
    ).toBe('asset_not_found');
    expect((await h.request(c.player, 'GET', url())).statusCode).toBe(403);
    expect((await h.request(c.player, 'PUT', url(), { assetIds: [] })).statusCode).toBe(403);

    // Un son supprimé de la bibliothèque disparaît de la table d'effets
    expect(
      (await h.request(c.gm, 'DELETE', `/v1/audio/campaigns/${c.id}/assets/${a}`)).statusCode,
    ).toBe(204);
    expect(await h.ok(c.gm, 'GET', url())).toEqual({ assetIds: [b], version: 1 });

    const events = (await h.events(c.id)).filter((e) => e.type === 'audio.soundboard_updated');
    expect(events).toHaveLength(1);
    expect(events[0]!.visibility).toBe('gm_only');
  });
});
