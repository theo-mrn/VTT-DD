/**
 * Personnage incarné par un membre (sans verrou), liste des personnages
 * engagés (résumés de character, filtre joueur / PNJ) et règle `characterCreation`.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

interface CampaignCharacter {
  characterId: string;
  name: string | null;
  avatarUrl: string | null;
  type: string | null;
  kind: string | null;
  side: string;
  ownerId: string;
  playedBy: string | null;
  inCreation: boolean;
}

describe.skipIf(!TEST_DATABASE_URL)('personnage incarné', () => {
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

  const play = (u: TestUser, campaignId: string, characterId: string | null) =>
    h.request(u, 'PUT', `/v1/campaigns/${campaignId}/me/character`, { characterId });
  const list = (u: TestUser, campaignId: string, query = '') =>
    h.ok<CampaignCharacter[]>(u, 'GET', `/v1/campaigns/${campaignId}/characters${query}`);

  it('liste des personnages engagés, avec leur résumé dans character', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const summary = { tagline: 'Elfe · Barde', highlights: [{ label: 'Niveau', value: '3' }] };
    const hero = await h.engage(id, alice, {
      name: 'Aria',
      avatarUrl: 'https://img/aria.png',
      kind: 'pc',
      summary,
    });
    const npc = await h.engage(id, gm, { name: 'Gobelin', type: 'pnj' });
    // Un joueur ne voit pas le PNJ, posé sur aucune carte (la liste ne le nomme pas)
    expect((await list(alice, id)).map((c) => c.characterId)).toEqual([hero]);
    expect(await list(gm, id)).toEqual([
      {
        characterId: hero,
        name: 'Aria',
        avatarUrl: 'https://img/aria.png',
        tokenUrl: null,
        mapImageUrl: null,
        type: 'personnage',
        kind: 'pc',
        side: 'players',
        ownerId: alice.id,
        playedBy: null,
        inCreation: false,
        summary,
      },
      {
        characterId: npc,
        name: 'Gobelin',
        avatarUrl: null,
        tokenUrl: null,
        mapImageUrl: null,
        type: 'pnj',
        // Ancienne version de character : ni nature (joueur / PNJ) ni résumé
        kind: null,
        side: 'enemies',
        ownerId: gm.id,
        playedBy: null,
        inCreation: false,
        summary: null,
      },
    ]);
    // Personnage disparu de character : l'engagement reste, sans résumé
    t.character.characters.delete(npc);
    expect((await list(gm, id))[1]).toMatchObject({
      characterId: npc,
      name: null,
      type: null,
      summary: null,
    });
    expect((await h.request(bob, 'GET', `/v1/campaigns/${id}/characters`)).statusCode).toBe(404);
  });

  it('filtre joueur / PNJ : seulement les personnages dont character confirme la nature', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const hero = await h.engage(id, alice, { kind: 'pc' });
    const npc = await h.engage(id, gm, { kind: 'npc' });
    const unknown = await h.engage(id, gm);
    const ids = (l: CampaignCharacter[]) => l.map((c) => c.characterId);

    expect(ids(await list(alice, id, '?kind=pc'))).toEqual([hero]);
    expect(ids(await list(gm, id, '?kind=npc'))).toEqual([npc]);
    expect(ids(await list(gm, id))).toEqual([hero, npc, unknown]);
    const invalid = await h.request(gm, 'GET', `/v1/campaigns/${id}/characters?kind=boss`);
    expect(invalid.statusCode).toBe(400);
    // Character ne répond plus pour ce personnage : exclu du filtre, gardé dans la liste
    t.character.characters.delete(hero);
    expect(ids(await list(alice, id, '?kind=pc'))).toEqual([]);
    expect(ids(await list(alice, id))).toContain(hero);
  });

  it('un joueur incarne le sien, le MJ un PNJ ; un seul personnage chacun', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const a1 = await h.engage(id, alice);
    const a2 = await h.engage(id, alice);
    const npc = await h.engage(id, gm);

    const res = await play(alice, id, a1);
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as CampaignCharacter[]).find((c) => c.characterId === a1)!.playedBy).toBe(
      alice.id,
    );
    // Changer de personnage libère l'ancien (le PNJ, posé nulle part, n'est pas listé)
    const after = (await play(alice, id, a2)).json() as CampaignCharacter[];
    expect(after.map((c) => [c.characterId, c.playedBy])).toEqual([
      [a1, null],
      [a2, alice.id],
    ]);
    expect((await play(gm, id, npc)).statusCode).toBe(200);
    expect(await h.ok(alice, 'GET', `/v1/campaigns/${id}`)).toMatchObject({
      playedCharacterId: a2,
    });
    expect(await h.ok(gm, 'GET', `/v1/campaigns/${id}`)).toMatchObject({
      playedCharacterId: npc,
    });

    // Le même choix ne produit pas d'événement ; null libère
    expect((await play(alice, id, a2)).statusCode).toBe(200);
    const released = (await play(alice, id, null)).json() as CampaignCharacter[];
    expect(released.filter((c) => c.playedBy === alice.id)).toEqual([]);

    const payloads = (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(
          sql`${outbox.envelope}->>'roomId' = ${id} and ${outbox.envelope}->>'type' = 'campaign.character_played'`,
        )
        .orderBy(outbox.id)
    ).map((e) => (e.envelope as { payload: object }).payload);
    expect(payloads).toEqual([
      { userId: alice.id, characterId: a1, previousCharacterId: null, takenFrom: null },
      { userId: alice.id, characterId: a2, previousCharacterId: a1, takenFrom: null },
      { userId: gm.id, characterId: npc, previousCharacterId: null, takenFrom: null },
      { userId: alice.id, characterId: null, previousCharacterId: a2, takenFrom: null },
    ]);
  });

  it('pas de verrou : un personnage de joueur se choisit même incarné par un autre', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const hero = await h.engage(id, alice);
    const bobs = await h.engage(id, bob);
    const playedBy = async (characterId: string) =>
      (await list(gm, id)).find((c) => c.characterId === characterId)!.playedBy;

    // Alice incarne le personnage de Bob, qui n'est pas pris
    expect((await play(alice, id, bobs)).statusCode).toBe(200);
    expect(await playedBy(bobs)).toBe(alice.id);
    // Bob le reprend : Alice n'incarne plus rien
    expect((await play(bob, id, bobs)).statusCode).toBe(200);
    expect(await playedBy(bobs)).toBe(bob.id);
    expect(await h.ok(alice, 'GET', `/v1/campaigns/${id}`)).toMatchObject({
      playedCharacterId: null,
    });
    // Le MJ aussi, puis Alice le lui reprend
    expect((await play(gm, id, hero)).statusCode).toBe(200);
    expect((await play(alice, id, hero)).statusCode).toBe(200);
    expect(await playedBy(hero)).toBe(alice.id);

    const taken = (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(
          sql`${outbox.envelope}->>'roomId' = ${id} and ${outbox.envelope}->>'type' = 'campaign.character_played'`,
        )
        .orderBy(outbox.id)
    ).map((e) => (e.envelope as { payload: { takenFrom: string | null } }).payload.takenFrom);
    expect(taken).toEqual([null, alice.id, null, gm.id]);
  });

  it('refus : PNJ d’un autre, non engagé, spectateur', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const hero = await h.engage(id, alice);
    const bobs = await h.engage(id, bob);
    const enemy = await h.engage(id, gm);
    const ally = await h.engage(id, gm, { side: 'allies' });

    // Les PNJ du MJ (adversaires, alliés) ne s'incarnent pas par un joueur
    expect((await play(alice, id, enemy)).statusCode).toBe(403);
    expect((await play(alice, id, ally)).statusCode).toBe(403);
    expect((await play(alice, id, crypto.randomUUID())).json()).toMatchObject({
      status: 404,
      code: 'character_not_engaged',
    });
    expect((await play(alice, id, 'pas-un-uuid')).statusCode).toBe(400);
    expect((await play(await t.user(), id, hero)).statusCode).toBe(404);

    // Passé spectateur, Bob n'incarne plus rien
    await play(bob, id, bobs);
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}/members/${bob.id}`, { role: 'spectator' });
    expect((await list(gm, id)).find((c) => c.characterId === bobs)!.playedBy).toBeNull();
    expect((await play(bob, id, bobs)).statusCode).toBe(403);
  });

  it('le départ d’un membre libère le personnage qu’il incarnait', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const npc = await h.engage(id, gm, { side: 'allies' });
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}/members/${alice.id}`, { role: 'gm' });
    expect((await play(alice, id, npc)).statusCode).toBe(200);
    await h.ok(alice, 'DELETE', `/v1/campaigns/${id}/members/${alice.id}`);
    expect((await list(gm, id))[0]!.playedBy).toBeNull();
  });

  it('characterCreation faux : un joueur n’engage pas un personnage en création', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}`, { characterCreation: false });
    const engage = (u: TestUser, characterId: string) =>
      h.request(u, 'POST', `/v1/campaigns/${id}/characters`, { characterId });

    const fresh = t.character.add({ ownerId: alice.id, systemId: 'dnd-classic', inCreation: true });
    expect((await engage(alice, fresh)).json()).toMatchObject({
      status: 403,
      code: 'character_creation_forbidden',
    });
    // Un personnage terminé passe ; le MJ n'est pas concerné
    const done = t.character.add({ ownerId: alice.id, systemId: 'dnd-classic' });
    expect((await engage(alice, done)).statusCode).toBe(201);
    const npc = t.character.add({ ownerId: gm.id, systemId: 'dnd-classic', inCreation: true });
    expect((await engage(gm, npc)).statusCode).toBe(201);
    expect((await list(gm, id)).find((c) => c.characterId === npc)!.inCreation).toBe(true);

    // Création permise : le nouveau personnage passe
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}`, { characterCreation: true });
    expect((await engage(alice, fresh)).statusCode).toBe(201);
  });
});
