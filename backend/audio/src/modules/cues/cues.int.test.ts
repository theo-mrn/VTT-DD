/** Effets ponctuels : MJ seul, départ différé, idempotence, débit, arrêt. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { helpers, TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('effets', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let c: Awaited<ReturnType<TestContext['table']>>;
  let sfx: string;
  const url = () => `/v1/audio/campaigns/${c.id}/cues`;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    c = await t.table();
    sfx = (
      await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/assets`, {
        source: 'youtube',
        url: 'aaaaaaaaaaa',
        name: 'Cri',
        kind: 'sfx',
      })
    ).id;
  });
  afterEach(async () => t.close());

  it('lancé par le MJ : startAt serveur dans le futur, événement public, rejoué sans doublon', async () => {
    const cueId = crypto.randomUUID();
    const r = await h.request(c.gm, 'POST', url(), { cueId, assetId: sfx, volume: 0.7 });
    expect(r.statusCode).toBe(201);
    expect(Date.parse(r.json().startAt)).toBe(t.clock.now + 250);
    const again = await h.ok(c.gm, 'POST', url(), { cueId, assetId: sfx });
    expect(again).toEqual(r.json());
    const ev = (await h.events(c.id)).filter((e) => e.type === 'audio.cue_played');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      visibility: 'public',
      payload: { cueId, volume: 0.7, startedBy: c.gm.id, asset: { id: sfx } },
    });
  });

  it('MJ seul (décision Q4) ; son inconnu ; id déjà pris par un autre', async () => {
    expect(
      (await h.request(c.player, 'POST', url(), { cueId: crypto.randomUUID(), assetId: sfx }))
        .statusCode,
    ).toBe(403);
    expect(
      (await h.request(c.spectator, 'POST', url(), { cueId: crypto.randomUUID(), assetId: sfx }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await h.request(c.gm, 'POST', url(), {
          cueId: crypto.randomUUID(),
          assetId: crypto.randomUUID(),
        })
      ).statusCode,
    ).toBe(404);
  });

  it('débit : 10 effets par 10 s', async () => {
    const codes = [];
    for (let i = 0; i < 11; i++)
      codes.push(
        (await h.request(c.gm, 'POST', url(), { cueId: crypto.randomUUID(), assetId: sfx }))
          .statusCode,
      );
    expect(codes.filter((s) => s === 429)).toHaveLength(1);
    t.clock.now += 11_000;
    expect(
      (await h.request(c.gm, 'POST', url(), { cueId: crypto.randomUUID(), assetId: sfx }))
        .statusCode,
    ).toBe(201);
  });

  it('arrêt d’un effet, puis de tous', async () => {
    const cueId = crypto.randomUUID();
    await h.ok(c.gm, 'POST', url(), { cueId, assetId: sfx });
    expect((await h.request(c.player, 'POST', `${url()}/${cueId}/stop`)).statusCode).toBe(403);
    expect((await h.request(c.gm, 'POST', `${url()}/${cueId}/stop`)).statusCode).toBe(204);
    expect((await h.request(c.gm, 'POST', `${url()}/${cueId}/stop`)).statusCode).toBe(204);
    expect((await h.request(c.player, 'POST', `${url()}/stop`)).statusCode).toBe(403);
    expect((await h.request(c.gm, 'POST', `${url()}/stop`)).statusCode).toBe(204);
    const stops = (await h.events(c.id))
      .filter((e) => e.type === 'audio.cues_stopped')
      .map((e) => e.payload);
    expect(stops).toEqual([{ cueIds: [cueId] }, { all: true }]);
  });
});
