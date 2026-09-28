/** Mixeur personnel : défauts, fusion, version, événement pour les autres appareils. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { helpers, TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('mixeur', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
  });
  afterEach(async () => t.close());

  it('défauts, fusion partielle, idempotence, conflit', async () => {
    const u = await t.user();
    const d = await h.ok(u, 'GET', '/v1/audio/me/mixer');
    expect(d).toEqual({
      volumes: { master: 1, music: 1, ambience: 1, sfx: 1, zones: 1, dice: 1 },
      muted: {
        master: false,
        music: false,
        ambience: false,
        sfx: false,
        zones: false,
        dice: false,
      },
      version: 0,
    });
    const m1 = await h.ok(u, 'PUT', '/v1/audio/me/mixer', {
      volumes: { music: 0.4 },
      muted: { sfx: true },
      version: 0,
    });
    expect(m1).toMatchObject({
      version: 1,
      volumes: { music: 0.4, master: 1 },
      muted: { sfx: true },
    });
    const same = await h.ok(u, 'PUT', '/v1/audio/me/mixer', { volumes: { music: 0.4 } });
    expect(same.version).toBe(1);
    const conflict = await h.request(u, 'PUT', '/v1/audio/me/mixer', {
      volumes: { dice: 0 },
      version: 0,
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().current.version).toBe(1);
    expect(
      (await h.request(u, 'PUT', '/v1/audio/me/mixer', { volumes: { music: 2 } })).statusCode,
    ).toBe(400);
    const ev = (await h.events(u.id)).filter((e) => e.type === 'audio.mixer_updated');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ visibility: 'owner', roomId: null, actor: { userId: u.id } });
    // Chacun son mixeur
    const other = await t.user();
    expect((await h.ok(other, 'GET', '/v1/audio/me/mixer')).version).toBe(0);
  });
});
