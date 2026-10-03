/** Canaux : commandes, versions, idempotence, planificateur, concurrence. */
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assets } from '../../db/schema.js';
import { helpers, TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';
import { runSchedulerOnce } from './scheduler.js';

describe.skipIf(!TEST_DATABASE_URL)('canaux', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let c: Awaited<ReturnType<TestContext['table']>>;
  const cmd = (body: Record<string, unknown>, channel = 'music', who = c.gm) =>
    h.request(who, 'POST', `/v1/audio/campaigns/${c.id}/channels/${channel}/commands`, body);
  const read = async () =>
    (await h.ok(c.player, 'GET', `/v1/audio/campaigns/${c.id}/channels`)).channels;
  const changed = async () =>
    (await h.events(c.id)).filter((e) => e.type === 'audio.channel_changed');

  /** Sons prêts de durée connue (fichiers déjà traités). */
  async function track(name: string, durationMs: number) {
    const a = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/assets`, {
      source: 'youtube',
      url: name.padEnd(11, 'x'),
      name,
    });
    await t
      .db!.update(assets)
      .set({ durationMs })
      .where(and(eq(assets.id, a.id)));
    return a.id as string;
  }

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    c = await t.table();
  });
  afterEach(async () => t.close());

  it('non-membre : 404 ; campaign en panne : 503, aucun droit ouvert', async () => {
    const url = `/v1/audio/campaigns/${c.id}/channels`;
    expect((await h.request(c.stranger, 'GET', url)).json().code).toBe('campaign_not_found');
    expect((await h.request(c.spectator, 'GET', url)).statusCode).toBe(200);
    t.campaign.setDown(true);
    const down = await h.request(c.gm, 'GET', url);
    expect(down.statusCode).toBe(503);
    expect(down.json().code).toBe('campaign_unavailable');
  });

  it('état initial : arrêté, version 0 ; ambiance en boucle de piste', async () => {
    const ch = await read();
    expect(ch.music).toMatchObject({ status: 'stopped', version: 0, track: null, repeat: 'all' });
    expect(ch.ambience).toMatchObject({ status: 'stopped', repeat: 'track' });
  });

  it('play, pause, resume : la position vient du serveur ; idempotence sans événement', async () => {
    const a = await track('Aaaa', 120_000);
    const T = t.clock.now;
    const s1 = (await cmd({ type: 'play', assetId: a })).json();
    expect(s1).toMatchObject({ status: 'playing', version: 1, positionMs: 0 });
    expect(s1.track).toMatchObject({ id: a, durationMs: 120_000 });
    t.clock.now = T + 4_321;
    const s2 = (await cmd({ type: 'pause' })).json();
    expect(s2).toMatchObject({ status: 'paused', positionMs: 4_321, version: 2, endsAt: null });
    const again = await cmd({ type: 'pause' });
    expect(again.statusCode).toBe(200);
    expect(again.json().version).toBe(2);
    t.clock.now = T + 60_000;
    const s3 = (await cmd({ type: 'resume' })).json();
    expect(s3).toMatchObject({
      status: 'playing',
      positionMs: 4_321,
      anchorAt: new Date(T + 60_000).toISOString(),
    });
    const ev = await changed();
    expect(ev.map((e) => e.payload.cause)).toEqual(['play', 'pause', 'resume']);
    expect(ev.every((e) => e.visibility === 'public')).toBe(true);
    expect(ev.map((e) => e.payload.state.version)).toEqual([1, 2, 3]);
    // Les joueurs lisent le même état
    expect((await read()).music.version).toBe(3);
  });

  it('expectedVersion : 409 version_conflict avec l’état courant', async () => {
    const a = await track('Aaaa', 120_000);
    await cmd({ type: 'play', assetId: a });
    const res = await cmd({ type: 'pause', expectedVersion: 0 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      code: 'version_conflict',
      current: { version: 1, status: 'playing' },
    });
  });

  it('erreurs : sans piste, son pas prêt, playlist vide, commande invalide, droits', async () => {
    expect((await cmd({ type: 'resume' })).json().code).toBe('no_track');
    const [row] = await t
      .db!.insert(assets)
      .values({
        id: crypto.randomUUID(),
        campaignId: c.id,
        kind: 'music',
        name: 'wip',
        source: 'catalog',
        catalogId: 'x',
        status: 'processing',
      })
      .returning();
    expect((await cmd({ type: 'play', assetId: row!.id })).json().code).toBe('asset_not_ready');
    const p = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/playlists`, { name: 'Vide' });
    expect((await cmd({ type: 'play', playlistId: p.id })).json().code).toBe('empty_playlist');
    expect((await cmd({ type: 'play' })).json().code).toBe('invalid_command');
    expect((await cmd({ type: 'play', assetId: crypto.randomUUID() })).statusCode).toBe(404);
    expect((await cmd({ type: 'pause' }, 'music', c.player)).statusCode).toBe(403);
    expect((await cmd({ type: 'pause' }, 'voix')).statusCode).toBe(400);
  });

  it('playlist : enchaînement automatique à l’heure prévue, ancre exacte', async () => {
    const a = await track('Aaaa', 10_000);
    const b = await track('Bbbb', 20_000);
    const p = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/playlists`, {
      name: 'L',
      assetIds: [a, b],
    });
    const T = t.clock.now;
    const s = (await cmd({ type: 'play', playlistId: p.id })).json();
    expect(s.next.id).toBe(b);
    const endsAt = Date.parse(s.endsAt);
    expect(endsAt).toBe(T + 10_000 - 1_500);
    t.clock.now = endsAt - 1;
    expect(await runSchedulerOnce(t.app.deps)).toBe(0);
    t.clock.now = endsAt + 480;
    expect(await runSchedulerOnce(t.app.deps)).toBe(1);
    const after = (await read()).music;
    expect(after).toMatchObject({
      status: 'playing',
      track: { id: b },
      positionMs: 0,
      anchorAt: new Date(endsAt).toISOString(),
    });
    const last = (await changed()).at(-1)!;
    expect(last.payload.cause).toBe('auto_advance');
    expect(last.actor.role).toBe('system');
  });

  it('rattrapage après panne : plusieurs pistes en une transition (skipped)', async () => {
    const ids = [
      await track('Aaaa', 10_000),
      await track('Bbbb', 10_000),
      await track('Cccc', 10_000),
    ];
    const p = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/playlists`, {
      name: 'L',
      assetIds: ids,
    });
    await cmd({ type: 'play', playlistId: p.id });
    t.clock.now += 25_000;
    await runSchedulerOnce(t.app.deps);
    const last = (await changed()).at(-1)!;
    expect(last.payload.skipped).toBe(1); // b, sautée entièrement
    expect(last.payload.state.track.id).toBe(ids[2]);
  });

  it('concurrence : deux next avec la même version → un 200, un 409', async () => {
    const ids = [
      await track('Aaaa', 60_000),
      await track('Bbbb', 60_000),
      await track('Cccc', 60_000),
    ];
    const p = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/playlists`, {
      name: 'L',
      assetIds: ids,
    });
    const s = (await cmd({ type: 'play', playlistId: p.id })).json();
    const res = await Promise.all([
      cmd({ type: 'next', expectedVersion: s.version }),
      cmd({ type: 'next', expectedVersion: s.version }),
    ]);
    expect(res.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect((await read()).music.track.id).toBe(ids[1]);
  });

  it('concurrence : pause/resume en rafale, versions strictement croissantes, un événement par changement', async () => {
    await t.close();
    t = await testApp({ COMMAND_RATE_PER_CHANNEL: '1000' });
    h = helpers(t);
    c = await t.table();
    const a = await track('Aaaa', 600_000);
    await cmd({ type: 'play', assetId: a });
    const res = await Promise.all(
      Array.from({ length: 50 }, (_, i) => cmd({ type: i % 2 ? 'resume' : 'pause' })),
    );
    expect(res.every((r) => r.statusCode === 200)).toBe(true);
    const ev = await changed();
    // Une version par changement effectif, sans trou ni doublon (l'ordre de l'outbox suit le
    // début des transactions : les clients trient par version, reduceChannel)
    const versions = ev.map((e) => e.payload.state.version as number).sort((x, y) => x - y);
    expect(versions).toEqual(Array.from({ length: versions.length }, (_, i) => i + 1));
    const final = (await read()).music;
    expect(final.version).toBe(versions.at(-1));
    const top = ev.find((e) => e.payload.state.version === final.version)!;
    expect(final.status).toBe(top.payload.state.status);
  });

  it('planificateur sur deux instances : une seule transition', async () => {
    const a = await track('Aaaa', 10_000);
    const b = await track('Bbbb', 10_000);
    const p = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/playlists`, {
      name: 'L',
      assetIds: [a, b],
    });
    await cmd({ type: 'play', playlistId: p.id });
    t.clock.now += 9_000;
    const other = await testApp();
    other.clock.now = t.clock.now;
    try {
      const n = await Promise.all([runSchedulerOnce(t.app.deps), runSchedulerOnce(other.app.deps)]);
      expect(n[0] + n[1]).toBe(1);
      expect((await changed()).filter((e) => e.payload.cause === 'auto_advance')).toHaveLength(1);
    } finally {
      await other.close();
    }
  });

  it('next du MJ contre l’enchaînement automatique : pas de double saut', async () => {
    const ids = [
      await track('Aaaa', 10_000),
      await track('Bbbb', 10_000),
      await track('Cccc', 10_000),
    ];
    const p = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/playlists`, {
      name: 'L',
      assetIds: ids,
    });
    const s = (await cmd({ type: 'play', playlistId: p.id })).json();
    t.clock.now += 9_000;
    const [, res] = await Promise.all([
      runSchedulerOnce(t.app.deps),
      cmd({ type: 'next', expectedVersion: s.version }),
    ]);
    const track2 = (await read()).music.track.id;
    if (res.statusCode === 200) expect([ids[1], ids[2]]).toContain(track2);
    else expect(track2).toBe(ids[1]);
    expect((await read()).music.version).toBe(s.version + 1);
  });

  it('suppression de la piste en cours : passage à la suivante (asset_deleted)', async () => {
    const a = await track('Aaaa', 60_000);
    const b = await track('Bbbb', 60_000);
    const p = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/playlists`, {
      name: 'L',
      assetIds: [a, b],
    });
    await cmd({ type: 'play', playlistId: p.id });
    await h.ok(c.gm, 'DELETE', `/v1/audio/campaigns/${c.id}/assets/${a}`);
    const m = (await read()).music;
    expect(m).toMatchObject({ status: 'playing', track: { id: b }, queueLength: 1 });
    expect((await changed()).at(-1)!.payload.cause).toBe('asset_deleted');
  });

  it('playlist réordonnée pendant la lecture : la piste courante continue', async () => {
    const a = await track('Aaaa', 60_000);
    const b = await track('Bbbb', 60_000);
    const p = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/playlists`, {
      name: 'L',
      assetIds: [a, b],
    });
    await cmd({ type: 'play', playlistId: p.id });
    await h.ok(c.gm, 'PATCH', `/v1/audio/campaigns/${c.id}/playlists/${p.id}`, {
      assetIds: [b, a],
    });
    const m = (await read()).music;
    expect(m).toMatchObject({ track: { id: a }, queueIndex: 1, next: { id: b } });
    expect((await changed()).at(-1)!.payload.cause).toBe('playlist_updated');
  });

  it('débit : 5 commandes par seconde et par canal', async () => {
    const a = await track('Aaaa', 60_000);
    const res = [];
    for (let i = 0; i < 7; i++) res.push((await cmd({ type: 'play', assetId: a })).statusCode);
    expect(res.filter((s) => s === 429)).toHaveLength(2);
  });
});
