/**
 * Combat complet sur un vrai PostgreSQL, avec un faux character (serveur
 * HTTP local) : démarrage, initiative D&D en individual et Star Wars en
 * slots, tours, fin de round avec décompte des durées, fin du combat.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import {
  helpers,
  SECRET,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

interface Combat {
  id: string;
  round: number;
  mode: string;
  order: { characterId: string; side: string; sortKeys: number[]; hasActed: boolean }[];
  currentIndex: number;
  slots?: { side: string }[];
  initiativeRolled: boolean;
  version: number;
  durationUpdates?: { characterId: string; expired: string[] }[];
  durationFailures?: string[];
}

describe.skipIf(!TEST_DATABASE_URL)('combat', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user();
    alice = await t.user();
    bob = await t.user();
  });

  afterEach(async () => {
    await t.close();
  });

  const url = (campaignId: string, rest = '') => `/v1/campaigns/${campaignId}/combat${rest}`;
  const events = async (campaignId: string) =>
    (
      await t
        .db!.select({ type: sql<string>`${outbox.envelope}->>'type'` })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`)
        .orderBy(outbox.id)
    )
      .map((e) => e.type)
      .filter((x) => x.startsWith('combat.'));
  const callsTo = (path: string) => t.character.calls.filter((c) => c.path.endsWith(path));

  it('démarrage : MJ seulement, participants engagés, un seul combat par campagne', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const hero = await h.engage(id, alice);
    const npc = await h.engage(id, gm);

    expect((await h.request(gm, 'GET', url(id))).statusCode).toBe(404);
    expect((await h.request(alice, 'POST', url(id), { participants: [hero] })).statusCode).toBe(
      403,
    );
    expect(
      (await h.request(gm, 'POST', url(id), { participants: [hero, hero] })).json(),
    ).toMatchObject({ status: 400, code: 'duplicate_participant' });
    expect(
      (await h.request(gm, 'POST', url(id), { participants: [hero, crypto.randomUUID()] })).json(),
    ).toMatchObject({ status: 422, code: 'character_not_engaged' });
    expect((await h.request(gm, 'POST', url(id), { participants: [] })).statusCode).toBe(400);
    expect(
      (await h.request(gm, 'POST', url(id), { participants: [hero], mode: 'creneaux' })).statusCode,
    ).toBe(400);

    const res = await h.request(gm, 'POST', url(id), { participants: [hero, npc] });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({
      round: 1,
      mode: 'individual',
      currentIndex: 0,
      initiativeRolled: false,
      order: [
        { characterId: hero, side: 'players', sortKeys: [], hasActed: false },
        { characterId: npc, side: 'enemies', sortKeys: [], hasActed: false },
      ],
    });
    expect((res.json() as Combat).slots).toBeUndefined();
    // Tout membre lit le combat, aussi dans le détail de la campagne
    expect(await h.ok<Combat>(alice, 'GET', url(id))).toMatchObject({ round: 1 });
    expect(await h.ok(alice, 'GET', `/v1/campaigns/${id}`)).toMatchObject({
      combat: { round: 1 },
    });

    expect((await h.request(gm, 'POST', url(id), { participants: [npc] })).json()).toMatchObject({
      status: 409,
      code: 'combat_in_progress',
    });
    expect(await events(id)).toEqual(['combat.started']);
  });

  it('D&D individual : initiative par character, tri, joueurs d’abord à égalité', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const goblin = await h.engage(id, gm, { sortKeys: [15] });
    const aria = await h.engage(id, alice, { sortKeys: [15] });
    const dragon = await h.engage(id, gm, { sortKeys: [21] });
    const brom = await h.engage(id, bob, { sortKeys: [15] });
    const wolf = await h.engage(id, gm, { sortKeys: [8], side: 'allies' });
    await h.ok(gm, 'POST', url(id), { participants: [goblin, aria, dragon, brom, wolf] });

    expect((await h.request(alice, 'POST', url(id, '/initiative'), {})).statusCode).toBe(403);
    expect(
      (
        await h.request(gm, 'POST', url(id, '/initiative'), {
          params: { [crypto.randomUUID()]: { bonus: 1 } },
        })
      ).json(),
    ).toMatchObject({ status: 400, code: 'unknown_participant' });

    const c = await h.ok<Combat>(gm, 'POST', url(id, '/initiative'), {
      params: { [aria.toUpperCase()]: { avantage: true } },
    });
    expect(c.initiativeRolled).toBe(true);
    expect(c.order.map((p) => p.characterId)).toEqual([dragon, aria, brom, goblin, wolf]);
    expect(c.order.map((p) => p.sortKeys)).toEqual([[21], [15], [15], [15], [8]]);

    // Action d'initiative du système, appliquée, avec l'origine (MJ, campagne) :
    // le corps suit le contrat de character (champs en français, roomId)
    const rolls = callsTo('/actions/initiative');
    expect(rolls).toHaveLength(5);
    for (const r of rolls) {
      expect(r).toMatchObject({
        method: 'POST',
        secret: SECRET,
        body: { appliquer: true, userId: gm.id, roomId: id },
      });
    }
    expect(rolls.find((r) => r.path.includes(aria))!.body.parametres).toEqual({
      avantage: true,
    });
    expect(rolls.find((r) => r.path.includes(brom))!.body.parametres).toBeUndefined();
  });

  it('initiative refusée par les règles : 422, l’ordre ne change pas', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const aria = await h.engage(id, alice, { rejection: 'Paramètre manquant : competence' });
    const npc = await h.engage(id, gm, { sortKeys: [3] });
    const before = await h.ok<Combat>(gm, 'POST', url(id), { participants: [aria, npc] });
    const res = await h.request(gm, 'POST', url(id, '/initiative'), {});
    expect(res.json()).toMatchObject({ status: 422, code: 'initiative_rejected' });
    expect(res.json().detail).toContain('competence');
    expect(await h.ok<Combat>(gm, 'GET', url(id))).toMatchObject({
      initiativeRolled: false,
      version: before.version,
    });
  });

  it('tours : le joueur finit son tour, fin de round avec décompte des durées', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const aria = await h.engage(id, alice, { sortKeys: [18], durations: { beni: 1, rage: 2 } });
    const npc = await h.engage(id, gm, { sortKeys: [12], durations: { aveugle: 2 } });
    const brom = await h.engage(id, bob, { sortKeys: [5] });
    await h.ok(gm, 'POST', url(id), { participants: [aria, npc, brom] });
    await h.ok(gm, 'POST', url(id, '/initiative'), {});

    // Tour d'Aria : Bob ne peut pas finir le tour d'un autre
    expect((await h.request(bob, 'POST', url(id, '/next'), {})).statusCode).toBe(403);
    expect(
      (await h.request(bob, 'POST', url(id, '/next'), { characterId: brom })).json(),
    ).toMatchObject({ status: 409, code: 'not_their_turn' });
    let c = await h.ok<Combat>(alice, 'POST', url(id, '/next'), {});
    expect(c).toMatchObject({ round: 1, currentIndex: 1 });
    expect(c.order[0]!.hasActed).toBe(true);
    expect(c.durationUpdates).toBeUndefined();
    // Tour du PNJ : le MJ le passe
    expect((await h.request(alice, 'POST', url(id, '/next'), {})).statusCode).toBe(403);
    c = await h.ok<Combat>(gm, 'POST', url(id, '/next'), {});
    expect(c.currentIndex).toBe(2);
    expect(callsTo('/durees/decompter')).toHaveLength(0);

    // Dernier tour : nouveau round, chaque participant décompte ses durées une fois
    c = await h.ok<Combat>(bob, 'POST', url(id, '/next'), { characterId: brom });
    expect(c).toMatchObject({ round: 2, currentIndex: 0 });
    expect(c.order.every((p) => !p.hasActed)).toBe(true);
    expect(c.durationUpdates).toEqual(
      expect.arrayContaining([
        { characterId: aria, expired: ['beni'] },
        { characterId: npc, expired: [] },
        { characterId: brom, expired: [] },
      ]),
    );
    expect(c.durationFailures).toBeUndefined();
    const ticks = callsTo('/durees/decompter');
    expect(ticks).toHaveLength(3);
    for (const r of ticks)
      expect(r).toMatchObject({ secret: SECRET, body: { userId: bob.id, roomId: id } });

    // Round 2 complet par le MJ : les états suivants arrivent à 0
    await h.ok(gm, 'POST', url(id, '/next'), {});
    await h.ok(gm, 'POST', url(id, '/next'), {});
    c = await h.ok<Combat>(gm, 'POST', url(id, '/next'), {});
    expect(c.round).toBe(3);
    expect(c.durationUpdates).toEqual(
      expect.arrayContaining([
        { characterId: aria, expired: ['rage'] },
        { characterId: npc, expired: ['aveugle'] },
      ]),
    );
    expect(callsTo('/durees/decompter')).toHaveLength(6);

    const types = await events(id);
    expect(types.filter((x) => x === 'combat.turn_changed')).toHaveLength(7);
  });

  it('un décompte en échec est signalé sans bloquer le round', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const aria = await h.engage(id, alice, { sortKeys: [10] });
    const npc = await h.engage(id, gm, { sortKeys: [5], durations: { lent: 1 } });
    await h.ok(gm, 'POST', url(id), { participants: [aria, npc] });
    await h.ok(gm, 'POST', url(id, '/initiative'), {});
    // Le personnage disparaît de character : 404 au décompte
    t.character.characters.delete(aria);
    await h.ok(gm, 'POST', url(id, '/next'), {});
    const c = await h.ok<Combat>(gm, 'POST', url(id, '/next'), {});
    expect(c.round).toBe(2);
    expect(c.durationUpdates).toEqual([{ characterId: npc, expired: ['lent'] }]);
    expect(c.durationFailures).toEqual([aria]);
  });

  it('Star Wars en slots : chaque créneau est ouvert à tout son camp', async () => {
    const id = await h.campaign(gm, 'star-wars-eote', [alice, bob]);
    // Clés : succès nets puis avantages nets, selon la compétence choisie
    const keys = (base: number[]) => (params: Record<string, unknown>) =>
      params.competence === 'calme' ? [base[0]! + 1, base[1]!] : base;
    const sw = 'star-wars-eote';
    const kesh = await h.engage(id, alice, { systemId: sw, sortKeys: keys([1, 1]) });
    const vara = await h.engage(id, bob, { systemId: sw, sortKeys: keys([1, 0]) });
    const trooper = await h.engage(id, gm, { systemId: sw, sortKeys: [3, 0] });
    const probe = await h.engage(id, gm, { systemId: sw, sortKeys: [2, 1] });

    await h.ok(gm, 'POST', url(id), {
      participants: [trooper, probe, kesh, vara],
      mode: 'slots',
    });
    let c = await h.ok<Combat>(gm, 'POST', url(id, '/initiative'), {
      params: {
        [kesh]: { competence: 'calme' },
        [vara]: { competence: 'vigilance' },
      },
    });
    // Kesh (2,1) à égalité parfaite avec la sonde : le camp players passe d'abord
    expect(c.order.map((p) => [p.characterId, p.sortKeys])).toEqual([
      [trooper, [3, 0]],
      [kesh, [2, 1]],
      [probe, [2, 1]],
      [vara, [1, 0]],
    ]);
    expect(c.slots).toEqual([
      { side: 'enemies' },
      { side: 'players' },
      { side: 'enemies' },
      { side: 'players' },
    ]);
    expect(callsTo('/actions/initiative').find((r) => r.path.includes(vara))!.body).toMatchObject({
      parametres: { competence: 'vigilance' },
    });

    // Créneau enemies : le MJ fait agir la sonde, pourtant classée après le soldat
    c = await h.ok<Combat>(gm, 'POST', url(id, '/next'), { characterId: probe });
    expect(c.currentIndex).toBe(1);
    // Créneau players : Vara agit avant Kesh ; un joueur doit dire qui agit
    expect((await h.request(bob, 'POST', url(id, '/next'), {})).json()).toMatchObject({
      status: 400,
      code: 'character_required',
    });
    expect((await h.request(bob, 'POST', url(id, '/next'), { characterId: kesh })).statusCode).toBe(
      403,
    );
    c = await h.ok<Combat>(bob, 'POST', url(id, '/next'), { characterId: vara });
    expect(c.currentIndex).toBe(2);
    // Créneau enemies : Kesh n'y joue pas, la sonde a déjà agi
    expect(
      (await h.request(alice, 'POST', url(id, '/next'), { characterId: kesh })).json(),
    ).toMatchObject({ status: 409, code: 'not_their_turn' });
    expect(
      (await h.request(gm, 'POST', url(id, '/next'), { characterId: probe })).json(),
    ).toMatchObject({ status: 409, code: 'not_their_turn' });
    await h.ok(gm, 'POST', url(id, '/next'), { characterId: trooper });
    // Dernier créneau (players) : Kesh, puis nouveau round et décompte
    c = await h.ok<Combat>(alice, 'POST', url(id, '/next'), { characterId: kesh });
    expect(c).toMatchObject({ round: 2, currentIndex: 0 });
    expect(c.order.every((p) => !p.hasActed)).toBe(true);
    expect(c.durationUpdates).toHaveLength(4);
  });

  it('fin : MJ seulement, le combat disparaît et peut reprendre', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const aria = await h.engage(id, alice);
    await h.ok(gm, 'POST', url(id), { participants: [aria] });
    expect((await h.request(alice, 'POST', url(id, '/end'))).statusCode).toBe(403);
    expect((await h.request(gm, 'POST', url(id, '/end'))).statusCode).toBe(204);
    expect((await h.request(gm, 'POST', url(id, '/end'))).statusCode).toBe(404);
    expect((await h.request(alice, 'GET', url(id))).statusCode).toBe(404);
    expect((await h.request(gm, 'POST', url(id, '/next'), {})).statusCode).toBe(404);
    expect(await h.ok(gm, 'GET', `/v1/campaigns/${id}`)).not.toHaveProperty('combat');
    expect((await h.request(gm, 'POST', url(id), { participants: [aria] })).statusCode).toBe(201);
    expect(await events(id)).toEqual(['combat.started', 'combat.ended', 'combat.started']);
  });
});
