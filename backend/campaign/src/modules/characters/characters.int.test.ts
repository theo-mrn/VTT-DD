/**
 * Personnages engagés dans une campagne : qui engage quoi, dans quel camp, qui
 * retire, et les droits que l'engagement donne (route interne de character).
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

interface Campaign {
  characters: { characterId: string; ownerId: string; side: string; addedBy: string }[];
  combat?: { order: { characterId: string }[] };
}

describe.skipIf(!TEST_DATABASE_URL)('personnages engagés', () => {
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

  const engage = (campaignId: string, u: TestUser, body: object) =>
    h.request(u, 'POST', `/v1/campaigns/${campaignId}/characters`, body);
  const newCharacter = (u: TestUser, systemId = 'dnd-classic') =>
    t.character.add({ ownerId: u.id, systemId });
  const rights = async (characterId: string, u: TestUser) =>
    (
      await t.app.inject({
        method: 'GET',
        url: `/internal/characters/${characterId}/campaigns-of?userId=${u.id}`,
        headers: { 'x-internal-secret': SECRET },
      })
    ).json() as { read: boolean; write: boolean };

  it('camp par défaut : players pour un joueur, enemies pour le MJ', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const hero = newCharacter(alice);
    const res = await engage(id, alice, { characterId: hero.toUpperCase() });
    expect(res.statusCode, res.body).toBe(201);
    const npc = newCharacter(gm);
    const c = await h.ok<Campaign>(gm, 'POST', `/v1/campaigns/${id}/characters`, {
      characterId: npc,
    });
    expect(c.characters).toEqual([
      { characterId: hero, ownerId: alice.id, side: 'players', addedBy: alice.id, playedBy: null },
      { characterId: npc, ownerId: gm.id, side: 'enemies', addedBy: gm.id, playedBy: null },
    ]);
    // Le MJ choisit le camp de ses PNJ, un joueur peut engager un allié
    await h.ok(gm, 'POST', `/v1/campaigns/${id}/characters`, {
      characterId: newCharacter(gm),
      side: 'allies',
    });
    expect(
      (await engage(id, alice, { characterId: newCharacter(alice), side: 'allies' })).statusCode,
    ).toBe(201);

    // Le résumé est demandé à character avec le secret interne et l'origine
    const call = t.character.calls.find((a) => a.path === `/internal/characters/${hero}`);
    expect(call).toMatchObject({ method: 'GET', secret: SECRET });

    const types = (
      await t
        .db!.select({ type: sql<string>`${outbox.envelope}->>'type'` })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${id}`)
    ).map((e) => e.type);
    expect(types.filter((x) => x === 'campaign.character_added')).toHaveLength(4);
  });

  it('refus : spectateur, adversaire par un joueur, personnage d’un autre, autre système', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}/members/${bob.id}`, { role: 'spectator' });

    expect((await engage(id, bob, { characterId: newCharacter(bob) })).statusCode).toBe(403);
    expect(
      (await engage(id, alice, { characterId: newCharacter(alice), side: 'enemies' })).statusCode,
    ).toBe(403);
    // Le personnage d'un autre (même le MJ) est introuvable : on ne l'engage jamais
    expect((await engage(id, gm, { characterId: newCharacter(alice) })).statusCode).toBe(404);
    expect((await engage(id, alice, { characterId: crypto.randomUUID() })).statusCode).toBe(404);
    expect(
      (await engage(id, alice, { characterId: newCharacter(alice, 'star-wars-eote') })).json(),
    ).toMatchObject({ status: 422, code: 'system_mismatch' });
    expect((await engage(id, alice, { characterId: 'pas-un-uuid' })).statusCode).toBe(400);
    expect(
      (
        await h.request(await t.user(), 'POST', `/v1/campaigns/${id}/characters`, {
          characterId: newCharacter(alice),
        })
      ).statusCode,
    ).toBe(404);

    const hero = newCharacter(alice);
    expect((await engage(id, alice, { characterId: hero })).statusCode).toBe(201);
    expect((await engage(id, alice, { characterId: hero })).json()).toMatchObject({
      status: 409,
      code: 'already_engaged',
    });
  });

  it('retrait : le propriétaire ou le MJ, jamais un autre joueur', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const a1 = await h.engage(id, alice);
    const a2 = await h.engage(id, alice);
    const remove = (u: TestUser, c: string) =>
      h.request(u, 'DELETE', `/v1/campaigns/${id}/characters/${c}`);

    expect((await remove(bob, a1)).statusCode).toBe(403);
    expect((await remove(alice, a1)).statusCode).toBe(204);
    expect((await remove(alice, a1)).statusCode).toBe(404);
    expect((await remove(gm, a2)).statusCode).toBe(204);
    const c = await h.ok<Campaign>(gm, 'GET', `/v1/campaigns/${id}`);
    expect(c.characters).toEqual([]);
  });

  it('droits : membre = lecture, MJ = écriture, rien hors de la campagne ni après retrait', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const hero = await h.engage(id, alice);
    const stranger = await t.user();

    expect(await rights(hero, gm)).toEqual({
      read: true,
      write: true,
      campaigns: [{ campaignId: id, role: 'gm' }],
    });
    expect(await rights(hero, bob)).toMatchObject({ read: true, write: false });
    expect(await rights(hero, stranger)).toEqual({ read: false, write: false, campaigns: [] });

    // Un spectateur lit, un joueur promu MJ écrit
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}/members/${bob.id}`, { role: 'spectator' });
    expect(await rights(hero, bob)).toMatchObject({ read: true, write: false });
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}/members/${bob.id}`, { role: 'gm' });
    expect(await rights(hero, bob)).toMatchObject({ read: true, write: true });

    await h.ok(alice, 'DELETE', `/v1/campaigns/${id}/characters/${hero}`);
    expect(await rights(hero, gm)).toMatchObject({ read: false, write: false });
  });

  it('retirer un personnage le sort du combat en cours', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const hero = await h.engage(id, alice);
    const npc = await h.engage(id, gm);
    await h.ok(gm, 'POST', `/v1/campaigns/${id}/combat`, { participants: [hero, npc] });
    await h.ok(alice, 'DELETE', `/v1/campaigns/${id}/characters/${hero}`);
    const c = await h.ok<Campaign>(gm, 'GET', `/v1/campaigns/${id}`);
    expect(c.combat!.order.map((p) => p.characterId)).toEqual([npc]);
  });

  it('character injoignable : 502, rien n’est engagé', async () => {
    const down = await testApp({ CHARACTER_URL: 'http://127.0.0.1:9' });
    try {
      const dh = helpers(down);
      const u = await down.user();
      const id = await dh.campaign(u);
      const res = await dh.request(u, 'POST', `/v1/campaigns/${id}/characters`, {
        characterId: crypto.randomUUID(),
      });
      expect(res.json()).toMatchObject({ status: 502, code: 'character_unavailable' });
      expect((await dh.ok<Campaign>(u, 'GET', `/v1/campaigns/${id}`)).characters).toEqual([]);
    } finally {
      await down.close();
    }
  });
});
