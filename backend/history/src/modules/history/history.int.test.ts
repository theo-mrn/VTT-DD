/** Timeline d'une campagne et vérification de la chaîne, sur un vrai Postgres. */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendEvents } from '../../journal/append.js';
import { verifyChain } from './repository.js';
import {
  envelope,
  get,
  inRollback,
  TEST_DATABASE_URL,
  testApp,
  type EventBody,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

type List = { events: EventBody[]; hasMore: boolean };

describe.skipIf(!TEST_DATABASE_URL)('GET /v1/history', () => {
  let t: TestContext;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let spectator: TestUser;
  let campaignId: string;
  const character = crypto.randomUUID();

  /** Ajoute un événement à la campagne ; renvoie son id. */
  const add = async (e: Parameters<typeof envelope>[0] = {}) => {
    const ev = envelope({ roomId: campaignId, ...e });
    await appendEvents(t.db!, [ev], 'history');
    return ev.id;
  };

  beforeEach(async () => {
    t = await testApp();
    gm = await t.user();
    alice = await t.user();
    bob = await t.user();
    spectator = await t.user();
    campaignId = t.services.campaign({
      [gm.id]: 'gm',
      [alice.id]: 'player',
      [bob.id]: 'player',
      [spectator.id]: 'spectator',
    });
  });

  afterEach(async () => {
    await t.close();
  });

  it('jeton exigé ; non-membre : 404 comme une campagne inexistante', async () => {
    await add();
    const url = `/v1/history?campaignId=${campaignId}`;
    expect((await t.app.inject({ method: 'GET', url })).statusCode).toBe(401);
    const outsider = await t.user();
    const res = await t.app.inject({ method: 'GET', url, headers: outsider.auth });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'campaign_not_found' });
    const unknown = await t.app.inject({
      method: 'GET',
      url: `/v1/history?campaignId=${crypto.randomUUID()}`,
      headers: gm.auth,
    });
    expect(unknown.statusCode).toBe(404);
  });

  it('visibilité : le MJ voit tout, un joueur le public et ses propres événements « owner »', async () => {
    const pub = await add({ visibility: 'public' });
    const secret = await add({ visibility: 'gm_only', type: 'dice.rolled' });
    const alicePrivate = await add({
      visibility: 'owner',
      type: 'note.created',
      actor: { userId: alice.id, role: 'player' },
    });
    const bobPrivate = await add({
      visibility: 'owner',
      type: 'note.created',
      actor: { userId: bob.id, role: 'player' },
    });
    const ids = async (u: TestUser) =>
      (await get<List>(t, u, `/v1/history?campaignId=${campaignId}`)).events.map((e) => e.id);

    // Du plus récent au plus ancien
    expect(await ids(gm)).toEqual([bobPrivate, alicePrivate, secret, pub]);
    expect(await ids(alice)).toEqual([alicePrivate, pub]);
    expect(await ids(bob)).toEqual([bobPrivate, pub]);
    expect(await ids(spectator)).toEqual([pub]);
  });

  it('forme de l’événement : enveloppe du bus, rang et personnage concerné', async () => {
    const id = await add({
      aggregate: { type: 'character', id: character },
      actor: { userId: gm.id, role: 'gm' },
      payload: { before: { hp: 24 }, after: { hp: 17 } },
    });
    const { events } = await get<List>(t, alice, `/v1/history?campaignId=${campaignId}`);
    expect(events[0]).toMatchObject({
      id,
      seq: 1,
      type: 'character.hp_changed',
      version: 1,
      roomId: campaignId,
      actor: { userId: gm.id, role: 'gm', characterId: null },
      aggregate: { type: 'character', id: character },
      characterId: character,
      visibility: 'public',
      payload: { before: { hp: 24 }, after: { hp: 17 } },
      causationId: null,
    });
    expect(events[0]).not.toHaveProperty('hash');
    expect(events[0]).not.toHaveProperty('traceparent');
  });

  it('pagination par rang, filtres par personnage, par type et par date', async () => {
    for (let i = 1; i <= 5; i++)
      await add({
        type: i % 2 ? 'character.hp_changed' : 'legacy.combat',
        aggregate:
          i <= 2 ? { type: 'character', id: character } : { type: 'campaign', id: campaignId },
        occurredAt: new Date(Date.UTC(2026, 8, 20 + i)).toISOString(),
      });
    const seqs = async (query: string) => {
      const r = await get<List>(t, gm, `/v1/history?campaignId=${campaignId}&${query}`);
      return [r.events.map((e) => e.seq), r.hasMore];
    };
    expect(await seqs('limit=2')).toEqual([[5, 4], true]);
    expect(await seqs('limit=2&beforeSeq=4')).toEqual([[3, 2], true]);
    // Rattrapage : ce qui suit un rang, du plus ancien au plus récent
    expect(await seqs('afterSeq=3')).toEqual([[4, 5], false]);
    expect(await seqs('afterSeq=1&beforeSeq=4&order=desc')).toEqual([[3, 2], false]);
    expect(await seqs(`characterId=${character}`)).toEqual([[2, 1], false]);
    expect(await seqs('types=legacy.combat')).toEqual([[4, 2], false]);
    expect(await seqs('types=legacy.*,character.hp_changed&limit=10')).toEqual([
      [5, 4, 3, 2, 1],
      false,
    ]);
    expect(await seqs('from=2026-09-22T00:00:00Z&to=2026-09-24T00:00:00Z')).toEqual([
      [3, 2],
      false,
    ]);

    const bad = await t.app.inject({
      method: 'GET',
      url: `/v1/history?campaignId=${campaignId}&afterSeq=4&beforeSeq=2`,
      headers: gm.auth,
    });
    expect(bad.statusCode).toBe(400);
  });

  it('campaign en panne : 503, aucun droit ouvert', async () => {
    t.services.setDown(true);
    const res = await t.app.inject({
      method: 'GET',
      url: `/v1/history?campaignId=${campaignId}`,
      headers: gm.auth,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'campaign_unavailable' });
  });

  describe('GET /v1/history/verify', () => {
    it('MJ : chaîne intacte ; joueur : 403 ; non-membre : 404', async () => {
      for (let i = 0; i < 3; i++) await add();
      expect(await get(t, gm, `/v1/history/verify?campaignId=${campaignId}`)).toEqual({
        campaignId,
        ok: true,
        events: 3,
        lastSeq: 3,
        firstBroken: null,
      });
      const url = `/v1/history/verify?campaignId=${campaignId}`;
      const player = await t.app.inject({ method: 'GET', url, headers: alice.auth });
      expect(player.statusCode).toBe(403);
      const outsider = await t.user();
      expect((await t.app.inject({ method: 'GET', url, headers: outsider.auth })).statusCode).toBe(
        404,
      );
    });

    it('premier maillon cassé (transaction annulée)', async () => {
      await inRollback(t.db!, async (tx) => {
        for (let i = 0; i < 2; i++)
          await appendEvents(tx, [envelope({ roomId: campaignId })], 'history');
        // Ajout hors chaîne (le rôle du service ne peut qu'ajouter) : prev_hash qui ne suit pas
        await tx.execute(sql`
          insert into history.events (id, occurred_at, campaign_id, seq, type, version, actor_role,
            aggregate_type, aggregate_id, payload, correlation_id, prev_hash, hash)
          values (${crypto.randomUUID()}, now(), ${campaignId}, 3, 'character.hp_changed', 1, 'gm',
            'character', 'x', '{}', 'c', sha256('faux'::bytea), sha256('faux'::bytea))`);
        expect(await verifyChain(tx, campaignId)).toEqual({
          ok: false,
          events: 3,
          lastSeq: 3,
          firstBroken: { seq: 2, id: null, reason: 'head' },
        });
      });
    });
  });
});
