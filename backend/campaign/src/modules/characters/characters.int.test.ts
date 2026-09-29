/**
 * Personnages engagés dans une campagne : qui engage quoi, dans quel camp, qui
 * retire, et les droits que l'engagement donne (route interne de character).
 */
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mapTokens, outbox } from '../../db/schema.js';
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

  it('retrait : le propriétaire ne retire pas un personnage qu’un autre membre incarne', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const hero = await h.engage(id, alice);
    const url = `/v1/campaigns/${id}/characters/${hero}`;
    await h.ok(bob, 'PUT', `/v1/campaigns/${id}/me/character`, { characterId: hero });
    expect((await h.request(alice, 'DELETE', url)).json()).toMatchObject({
      status: 409,
      code: 'character_played',
    });
    // Incarné par sa propriétaire : elle le retire ; le MJ, lui, le retire toujours
    await h.ok(alice, 'PUT', `/v1/campaigns/${id}/me/character`, { characterId: hero });
    expect((await h.request(alice, 'DELETE', url)).statusCode).toBe(204);
    const other = await h.engage(id, alice);
    await h.ok(bob, 'PUT', `/v1/campaigns/${id}/me/character`, { characterId: other });
    expect(
      (await h.request(gm, 'DELETE', `/v1/campaigns/${id}/characters/${other}`)).statusCode,
    ).toBe(204);
  });

  it('droits : membre = lecture, MJ et incarnateur = écriture, rien hors campagne ni après retrait', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const hero = await h.engage(id, alice);
    const stranger = await t.user();

    expect(await rights(hero, gm)).toMatchObject({
      read: true,
      write: true,
      campaigns: [{ campaignId: id, role: 'gm', playedBy: null }],
    });
    expect(await rights(hero, bob)).toMatchObject({ read: true, write: false });
    expect(await rights(hero, stranger)).toMatchObject({
      read: false,
      write: false,
      campaigns: [],
    });
    // Pas de possession : sa propriétaire lit tant qu'elle ne l'incarne pas, Bob l'écrit s'il l'incarne
    expect(await rights(hero, alice)).toMatchObject({ read: true, write: false });
    await h.ok(bob, 'PUT', `/v1/campaigns/${id}/me/character`, { characterId: hero });
    expect(await rights(hero, bob)).toMatchObject({ read: true, write: true });
    expect(await rights(hero, alice)).toMatchObject({ read: true, write: false });
    await h.ok(alice, 'PUT', `/v1/campaigns/${id}/me/character`, { characterId: hero });
    expect(await rights(hero, alice)).toMatchObject({ read: true, write: true });
    expect(await rights(hero, bob)).toMatchObject({ read: true, write: false });

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

  it('liste : un joueur ne voit que les joueurs, les siens et les PNJ dont un token lui est visible', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const url = (rest: string) => `/v1/campaigns/${id}${rest}`;
    const hero = await h.engage(id, alice, { name: 'Aria' });
    const friend = await h.engage(id, bob, { name: 'Brom' });
    // PNJ engagé sans token, et allié d'Alice (engagé par elle) : jamais posés
    await h.engage(id, gm, { name: 'Espion' });
    const pet = await h.engage(id, alice, { name: 'Loup', side: 'allies' });
    const map = await h.ok<{ id: string }>(gm, 'POST', url('/maps'), {
      name: 'Taverne',
      width: 1000,
      height: 1000,
    });
    await h.ok(gm, 'POST', url(`/maps/${map.id}/tokens`), {
      characterId: hero,
      pos: { x: 100, y: 100 },
    });
    const place = (name: string, visibility: string) =>
      h.ok<{ items: { id: string; characterId: string }[] }>(
        gm,
        'POST',
        url(`/maps/${map.id}/npcs`),
        { source: { quick: { name, type: 'personnage' } }, pos: { x: 300, y: 300 }, visibility },
      );
    const [goblin] = (await place('Gobelin', 'visible')).items;
    await place('Ombre', 'invisible');

    const names = async (u: TestUser, query = '') =>
      (await h.ok<{ name: string }[]>(u, 'GET', url(`/characters${query}`))).map((c) => c.name);
    expect(await names(gm)).toEqual(['Aria', 'Brom', 'Espion', 'Loup', 'Gobelin', 'Ombre']);
    // Alice : son héros, Brom (camp des joueurs), son allié, le Gobelin qu'elle voit
    expect(await names(alice)).toEqual(['Aria', 'Brom', 'Loup', 'Gobelin']);
    expect(await names(alice, '?kind=npc')).toEqual(['Gobelin']);
    // Bob voit la carte (visible des joueurs), donc le Gobelin, comme la carte le lui montre
    expect(await names(bob)).toEqual(['Aria', 'Brom', 'Gobelin']);
    // Carte cachée aux joueurs : Bob n'y a aucun token, il ne la voit plus, ni ses PNJ
    await h.ok(gm, 'PATCH', url(`/maps/${map.id}`), { visibleToPlayers: false });
    expect(await names(bob)).toEqual(['Aria', 'Brom']);
    expect(await names(alice)).toEqual(['Aria', 'Brom', 'Loup', 'Gobelin']);
    // Le MJ rend le Gobelin invisible : il disparaît de la liste d'Alice
    await h.ok(gm, 'PATCH', url(`/maps/${map.id}/tokens/${goblin!.id}`), {
      visibility: 'invisible',
    });
    expect(await names(alice)).toEqual(['Aria', 'Brom', 'Loup']);
    // Incarner renvoie la même liste filtrée
    const played = await h.ok<{ name: string; characterId: string }[]>(
      alice,
      'PUT',
      url('/me/character'),
      { characterId: hero },
    );
    expect(played.map((c) => c.name)).toEqual(['Aria', 'Brom', 'Loup']);
    expect(played.map((c) => c.characterId)).not.toContain(goblin!.characterId);
    void friend;
    void pet;
  });

  it('retrait : ses tokens quittent toutes les cartes, avec un token.deleted chacun', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const url = (rest: string) => `/v1/campaigns/${id}${rest}`;
    const hero = await h.engage(id, alice);
    const newMap = (name: string) =>
      h.ok<{ id: string }>(gm, 'POST', url('/maps'), { name, width: 1000, height: 1000 });
    const first = await newMap('Village');
    const second = await newMap('Forêt');
    const a = await h.ok<{ id: string }>(gm, 'POST', url(`/maps/${first.id}/tokens`), {
      characterId: hero,
      pos: { x: 10, y: 10 },
    });
    // En voyage : le token du village reste (absent), un autre est posé dans la forêt
    const [b] = (
      await h.ok<{ items: { id: string }[] }>(gm, 'POST', url(`/maps/${second.id}/travel`), {
        characterIds: [hero],
        pos: { x: 20, y: 20 },
      })
    ).items;

    await h.ok(alice, 'DELETE', url(`/characters/${hero}`));
    const left = await t.db!.select().from(mapTokens).where(eq(mapTokens.characterId, hero));
    expect(left).toEqual([]);
    const deleted = await t
      .db!.select({
        visibility: sql<string>`${outbox.envelope}->>'visibility'`,
        payload: sql<Record<string, unknown>>`${outbox.envelope}->'payload'`,
      })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->>'roomId' = ${id} and ${outbox.envelope}->>'type' = 'token.deleted'`,
      );
    expect(deleted).toHaveLength(2);
    expect(deleted).toEqual(
      expect.arrayContaining([
        // Absent de la carte : réservé au MJ ; présent (personnage joueur) : public
        {
          visibility: 'gm_only',
          payload: { id: a.id, mapId: first.id, characterId: hero },
        },
        {
          visibility: 'public',
          payload: { id: b!.id, mapId: second.id, characterId: hero },
        },
      ]),
    );
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
