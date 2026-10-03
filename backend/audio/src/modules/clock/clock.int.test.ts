/** Horloge et catalogue. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { helpers, TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('horloge et catalogue', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
  });
  afterEach(async () => t.close());

  it('horloge : heure du serveur, jamais en cache, jeton exigé', async () => {
    const u = await t.user();
    t.clock.now = 1_790_000_000_123;
    const res = await h.request(u, 'GET', '/v1/audio/clock');
    expect(res.json()).toEqual({ serverTime: 1_790_000_000_123 });
    expect(res.headers['cache-control']).toBe('no-store');
    expect((await t.app.inject({ url: '/v1/audio/clock' })).statusCode).toBe(401);
  });

  it('catalogue : bibliothèque par défaut ou Star Wars, filtre par sorte', async () => {
    const u = await t.user();
    const all = await h.ok(u, 'GET', '/v1/audio/catalog');
    expect(all.items).toHaveLength(89);
    const music = await h.ok(u, 'GET', '/v1/audio/catalog?kind=music');
    expect(music.items.every((e: { kind: string }) => e.kind === 'music')).toBe(true);
    expect(music.categories.map((c: { id: string }) => c.id)).toEqual(['chill', 'epic', 'taverne']);
    const sw = await h.ok(u, 'GET', '/v1/audio/catalog?library=star-wars-eote');
    expect(sw.items).toHaveLength(20);
    expect(sw.items[0].url).toMatch(/^https:\/\/files\.test\/vtt\/audio\/catalog\/starwars\//);
  });
});
