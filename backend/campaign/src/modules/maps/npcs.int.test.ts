/**
 * PNJ posés en une fois (création dans character, engagement, tokens, compensation),
 * duplication, suppression avec le personnage, et fouille des objets (portée, butin donné
 * au personnage par character, événements du MJ). character est simulé (fake-character).
 */
import { and, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { campaignCharacters, mapTokens, outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

interface Item {
  id: string;
  version: number;
  [k: string]: unknown;
}
interface Token extends Item {
  characterId: string;
  pos: { x: number; y: number };
}

describe.skipIf(!TEST_DATABASE_URL)('carte : PNJ et fouille', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let campaignId: string;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user();
    alice = await t.user();
    campaignId = await h.campaign(gm, 'dnd-classic', [alice]);
  });

  afterEach(async () => {
    await t.close();
  });

  const url = (rest = '') => `/v1/campaigns/${campaignId}${rest}`;
  const events = async () =>
    t
      .db!.select({
        type: sql<string>`${outbox.envelope}->>'type'`,
        visibility: sql<string>`${outbox.envelope}->>'visibility'`,
        payload: sql<Record<string, unknown>>`${outbox.envelope}->'payload'`,
      })
      .from(outbox)
      .where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`)
      .orderBy(outbox.id);
  const newMap = () =>
    h.ok<Item>(gm, 'POST', url('/maps'), { name: 'Taverne', width: 1000, height: 1000 });
  const engaged = async () =>
    t.db!.select().from(campaignCharacters).where(eq(campaignCharacters.campaignId, campaignId));

  it('pose N PNJ en une fois : personnages, engagement ennemi, tokens en grille', async () => {
    const map = await newMap();
    const created = await h.ok<{ items: Token[]; characters: Item[] }>(
      gm,
      'POST',
      url(`/maps/${map.id}/npcs`),
      {
        source: { quick: { name: 'Gobelin', type: 'personnage', imageUrl: 'https://a.b/g.png' } },
        count: 4,
        pos: { x: 500, y: 500 },
        visibility: 'hidden',
      },
    );
    expect(created.characters.map((c) => c.name)).toEqual([
      'Gobelin',
      'Gobelin 2',
      'Gobelin 3',
      'Gobelin 4',
    ]);
    expect(created.items).toHaveLength(4);
    expect(created.items[0]).toMatchObject({ visibility: 'hidden', imageUrl: 'https://a.b/g.png' });
    // Grille 2×2 centrée, une case (50 px) d'écart
    expect(created.items.map((x) => x.pos)).toEqual([
      { x: 475, y: 475 },
      { x: 525, y: 475 },
      { x: 475, y: 525 },
      { x: 525, y: 525 },
    ]);
    const rows = await engaged();
    expect(rows.filter((r) => r.side === 'enemies')).toHaveLength(4);
    expect(rows.every((r) => r.ownerId === gm.id)).toBe(true);
    const call = t.character.calls.find((c) => c.path === '/internal/npcs')!;
    expect(call.body).toMatchObject({
      ownerId: gm.id,
      campaignId,
      systemId: 'dnd-classic',
      count: 4,
    });
    // Engagement et tokens cachés : réservés au MJ
    const types = (await events()).map((e) => `${e.type}:${e.visibility}`);
    expect(types.filter((x) => x === 'campaign.character_added:gm_only')).toHaveLength(4);
    expect(types.filter((x) => x === 'token.created:gm_only')).toHaveLength(4);
    // Joueur : refusé ; source invalide : 400
    const denied = await h.request(alice, 'POST', url(`/maps/${map.id}/npcs`), {
      source: { quick: { name: 'X', type: 'personnage' } },
      pos: { x: 0, y: 0 },
    });
    expect(denied.statusCode).toBe(403);
  });

  it('compensation : rien ne reste si la pose échoue ; refus de character relayé', async () => {
    const map = await newMap();
    const npcs = url(`/maps/${map.id}/npcs`);
    t.character.behaviour.failNpcs = { status: 404, code: 'not_found' };
    const refused = await h.request(gm, 'POST', npcs, {
      source: { templateId: crypto.randomUUID() },
      pos: { x: 0, y: 0 },
    });
    expect(refused.statusCode).toBe(404);
    delete t.character.behaviour.failNpcs;

    // La pose échoue après la création (le second est déjà engagé : conflit en base)
    const hero = await h.engage(campaignId, alice);
    const fresh = crypto.randomUUID();
    t.character.behaviour.npcIds = [fresh, hero];
    const failed = await h.request(gm, 'POST', npcs, {
      source: { quick: { name: 'Orque', type: 'personnage' } },
      count: 2,
      pos: { x: 0, y: 0 },
    });
    expect(failed.statusCode).toBe(500);
    delete t.character.behaviour.npcIds;
    const compensation = t.character.calls.find((c) => c.path === '/internal/npcs/delete');
    expect(compensation!.body).toMatchObject({
      ids: [fresh, hero],
      userId: gm.id,
      roomId: campaignId,
    });
    expect(t.character.characters.get(fresh)!.deleted).toBe(true);
    expect(t.character.characters.get(hero)!.deleted).toBeUndefined();
    expect((await engaged()).map((r) => r.characterId)).toEqual([hero]);
    const tokens = await t.db!.select().from(mapTokens).where(eq(mapTokens.mapId, map.id));
    expect(tokens).toEqual([]);
  });

  it('dupliquer un PNJ posé, supprimer un PNJ avec son personnage', async () => {
    const map = await newMap();
    const [orc] = (
      await h.ok<{ items: Token[] }>(gm, 'POST', url(`/maps/${map.id}/npcs`), {
        source: { quick: { name: 'Orque', type: 'personnage' } },
        pos: { x: 100, y: 100 },
        side: 'allies',
      })
    ).items;
    await h.ok(gm, 'PATCH', url(`/maps/${map.id}/tokens/${orc!.id}`), { visionRadius: 42 });
    const copies = await h.ok<{ items: Token[]; characters: Item[] }>(
      gm,
      'POST',
      url(`/maps/${map.id}/tokens/${orc!.id}/duplicate`),
      { pos: { x: 300, y: 300 }, count: 2 },
    );
    expect(copies.characters.map((c) => c.name)).toEqual(['Orque 2', 'Orque 3']);
    expect(copies.items[0]).toMatchObject({ visionRadius: 42, layerId: orc!.layerId });
    expect((await engaged()).filter((r) => r.side === 'allies')).toHaveLength(3);

    // Un personnage joueur ne se duplique pas, et ne se supprime pas avec son token
    const hero = await h.engage(campaignId, alice);
    const heroToken = await h.ok<Token>(gm, 'POST', url(`/maps/${map.id}/tokens`), {
      characterId: hero,
      pos: { x: 0, y: 0 },
    });
    const dup = await h.request(
      gm,
      'POST',
      url(`/maps/${map.id}/tokens/${heroToken.id}/duplicate`),
      {
        pos: { x: 0, y: 0 },
      },
    );
    expect(dup.json()).toMatchObject({ code: 'not_an_npc' });
    const kill = await h.request(
      gm,
      'DELETE',
      url(`/maps/${map.id}/tokens/${heroToken.id}?character=delete`),
    );
    expect(kill.json()).toMatchObject({ code: 'not_an_npc' });

    // Supprimer le PNJ : token, engagement, puis personnage dans character
    await h.ok(gm, 'DELETE', url(`/maps/${map.id}/tokens/${orc!.id}?character=delete`));
    expect(t.character.characters.get(orc!.characterId)!.deleted).toBe(true);
    expect((await engaged()).map((r) => r.characterId)).not.toContain(orc!.characterId);
    const left = await t
      .db!.select()
      .from(mapTokens)
      .where(and(eq(mapTokens.mapId, map.id), eq(mapTokens.characterId, orc!.characterId)));
    expect(left).toEqual([]);
    // Retirer seulement le token : le personnage reste engagé
    await h.ok(gm, 'DELETE', url(`/maps/${map.id}/tokens/${copies.items[0]!.id}`));
    expect((await engaged()).map((r) => r.characterId)).toContain(copies.items[0]!.characterId);
    const types = (await events()).map((e) => e.type);
    expect(types).toContain('campaign.character_removed');
  });

  it('fouille : portée, contenu, prise donnée au personnage, MJ prévenu', async () => {
    const map = await newMap();
    const base = url(`/maps/${map.id}`);
    const hero = await h.engage(campaignId, alice);
    await h.play(campaignId, alice, hero);
    await h.ok(gm, 'POST', `${base}/tokens`, { characterId: hero, pos: { x: 100, y: 100 } });
    const chest = await h.ok<Item>(gm, 'POST', `${base}/objects`, {
      name: 'Coffre',
      pos: { x: 150, y: 80 },
      width: 40,
      height: 40,
      items: [
        { id: 'or', name: 'Pièces d’or', quantity: 30, ref: 'po' },
        { id: 'cle', name: 'Clé rouillée', quantity: 1, description: 'Ouvre la crypte' },
      ],
    });
    const search = (characterId = hero) =>
      h.request(alice, 'POST', `${base}/objects/${chest.id}/search`, { characterId });
    expect((await search()).json()).toMatchObject({ code: 'not_searchable' });
    await h.ok(gm, 'PATCH', `${base}/objects/${chest.id}`, { searchable: true, searchRadius: 1 });
    // Token à 50 px du bord (1 unité = 50 px) : à portée
    const found = (await search()).json() as { items: { id: string }[] };
    expect(found.items.map((i) => i.id)).toEqual(['or', 'cle']);
    await h.ok(gm, 'PATCH', `${base}/objects/${chest.id}`, { searchRadius: 0.5 });
    expect((await search()).json()).toMatchObject({ code: 'out_of_range' });
    await h.ok(gm, 'PATCH', `${base}/objects/${chest.id}`, { searchRadius: 1 });
    expect((await search(crypto.randomUUID())).statusCode).toBe(403);

    // Prendre 10 pièces, puis la clé : l'objet se vide, character reçoit
    const took = await h.ok<{ object: { items: { id: string; quantity: number }[] } }>(
      alice,
      'POST',
      `${base}/objects/${chest.id}/take`,
      { characterId: hero, itemId: 'or', quantity: 10 },
    );
    expect(took.object.items).toEqual([
      expect.objectContaining({ id: 'or', quantity: 20 }),
      expect.objectContaining({ id: 'cle' }),
    ]);
    await h.ok(alice, 'POST', `${base}/objects/${chest.id}/take`, {
      characterId: hero,
      itemId: 'cle',
    });
    expect(t.character.loot.get(hero)).toEqual([
      { ref: 'po', name: 'Pièces d’or', quantity: 10, playerId: alice.id },
      { name: 'Clé rouillée', description: 'Ouvre la crypte', quantity: 1, playerId: alice.id },
    ]);
    const tooMany = await h.request(alice, 'POST', `${base}/objects/${chest.id}/take`, {
      characterId: hero,
      itemId: 'or',
      quantity: 21,
    });
    expect(tooMany.json()).toMatchObject({ code: 'quantity_exceeded' });
    // character refuse : l'objet ne change pas
    t.character.behaviour.failReceive = { status: 422, code: 'objet_libre_indisponible' };
    const refusedTake = await h.request(alice, 'POST', `${base}/objects/${chest.id}/take`, {
      characterId: hero,
      itemId: 'or',
    });
    expect(refusedTake.json()).toMatchObject({ code: 'objet_libre_indisponible' });
    const after = await h.ok<{ items: Item[] }>(gm, 'GET', `${base}/objects`);
    expect(after.items[0]!.items).toEqual([expect.objectContaining({ id: 'or', quantity: 20 })]);

    const all = await events();
    const searched = all.filter((e) => e.type === 'map_object.searched');
    expect(searched.every((e) => e.visibility === 'gm_only')).toBe(true);
    const looted = all.filter((e) => e.type === 'map_object.looted');
    expect(looted.map((e) => e.payload)).toMatchObject([
      { characterId: hero, item: { id: 'or', quantity: 10 }, remaining: 20 },
      { characterId: hero, item: { id: 'cle', quantity: 1 }, remaining: 0 },
    ]);
    expect(looted.every((e) => e.visibility === 'gm_only')).toBe(true);
  });
});
