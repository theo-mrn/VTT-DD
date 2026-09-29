/**
 * Visibilité serveur sur @vtt/vision (docs/carte.md § 9, Serveur), sur un vrai PostgreSQL :
 * aucun PNJ ni objet caché n'est reçu par un joueur, ni en REST ni par événement ; le contenu
 * des objets (`items`) ne lui est jamais envoyé ; événements routés joueur par joueur.
 *
 * Réception d'un événement par un joueur, comme realtime (docs/api-realtime.md) : `public`,
 * ou `gm_only` avec lui dans `visibleToUsers` (l'auteur non listé n'en reçoit qu'une version
 * expurgée, sans charge).
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

interface Item {
  id: string;
  version: number;
  [k: string]: unknown;
}

interface OutboxEvent {
  type: string;
  visibility: string;
  payload: Record<string, unknown>;
}

describe.skipIf(!TEST_DATABASE_URL)('carte : visibilité serveur (@vtt/vision)', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let campaignId: string;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user();
    alice = await t.user();
    bob = await t.user();
    campaignId = await h.campaign(gm, 'dnd-classic', [alice, bob]);
  });

  afterEach(async () => {
    await t.close();
  });

  const url = (rest = '') => `/v1/campaigns/${campaignId}${rest}`;

  const events = async (): Promise<OutboxEvent[]> =>
    t
      .db!.select({
        type: sql<string>`${outbox.envelope}->>'type'`,
        visibility: sql<string>`${outbox.envelope}->>'visibility'`,
        payload: sql<Record<string, unknown>>`${outbox.envelope}->'payload'`,
      })
      .from(outbox)
      .where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`)
      .orderBy(outbox.id);

  /** Événements qu'un joueur reçoit avec leur charge. */
  const received = async (u: TestUser) =>
    (await events()).filter(
      (e) =>
        e.visibility === 'public' ||
        (e.visibility === 'gm_only' &&
          ((e.payload.visibleToUsers as string[] | undefined) ?? []).includes(u.id)),
    );

  /**
   * Événements de carte reçus par ce joueur qui mentionnent ces éléments (id ou personnage).
   * Hors carte : un PNJ engagé par le MJ via `/characters` est annoncé à tous
   * (`campaign.character_added`, module des personnages) ; le PNJ posé par `/npcs` ne l'est pas.
   */
  const leaks = async (u: TestUser, ...ids: string[]) =>
    (await received(u)).filter((e) => {
      if (!/^(map|map_[a-z_]+|token)\./.test(e.type)) return false;
      const json = JSON.stringify(e.payload);
      return ids.some((id) => json.includes(id));
    });

  const tokenIds = async (u: TestUser, mapId: string) =>
    (await h.ok<{ items: Item[] }>(u, 'GET', url(`/maps/${mapId}/tokens`))).items.map((x) => x.id);

  const snapshot = (u: TestUser, mapId: string) =>
    h.ok<Record<string, Item[]>>(u, 'GET', url(`/maps/${mapId}`));

  const square = (x: number, y: number, w: number) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + w },
    { x, y: y + w },
  ];

  /**
   * Carte 1000 × 1000 : héros d'Alice en (100, 100), rayon 100 ; un mur vertical en x = 200
   * percé d'une porte fermée (y 80 à 120) ; Bob n'a aucun token sur la carte.
   */
  async function dungeon() {
    const map = await h.ok<Item>(gm, 'POST', url('/maps'), {
      name: 'Donjon',
      width: 1000,
      height: 1000,
    });
    const base = url(`/maps/${map.id}`);
    const heroId = await h.engage(campaignId, alice);
    const hero = await h.ok<Item>(gm, 'POST', `${base}/tokens`, {
      characterId: heroId,
      pos: { x: 100, y: 100 },
      visionRadius: 100,
    });
    const created = await h.ok<{ created: Item[] }>(gm, 'POST', `${base}/obstacles/batch`, {
      create: [
        {
          kind: 'wall',
          points: [
            { x: 200, y: 0 },
            { x: 200, y: 80 },
          ],
        },
        {
          kind: 'door',
          points: [
            { x: 200, y: 80 },
            { x: 200, y: 120 },
          ],
        },
        {
          kind: 'wall',
          points: [
            { x: 200, y: 120 },
            { x: 200, y: 1000 },
          ],
        },
      ],
    });
    const npc = async (pos: { x: number; y: number }, extra: Record<string, unknown> = {}) => {
      const characterId = await h.engage(campaignId, gm, { side: 'enemies' });
      const token = await h.ok<Item>(gm, 'POST', `${base}/tokens`, {
        characterId,
        pos,
        ...extra,
      });
      return { ...token, characterId };
    };
    return { map, base, hero, door: created.created[1]!, walls: created.created, npc };
  }

  it('PNJ derrière un mur, dans une pièce fermée, dans le brouillard ou un calque masqué : jamais reçu', async () => {
    const { map, base, door, npc } = await dungeon();
    // Derrière la porte fermée
    const behind = await npc({ x: 300, y: 100 });
    // Dans une pièce fermée (porte fermée sur son contour), du côté d'Alice
    const room = await h.ok<Item>(gm, 'POST', `${base}/rooms`, {
      name: 'Cellier',
      points: square(40, 300, 120),
    });
    await h.ok(gm, 'POST', `${base}/obstacles`, {
      kind: 'door',
      points: [
        { x: 80, y: 300 },
        { x: 120, y: 300 },
      ],
    });
    const cellar = await npc({ x: 100, y: 360 });
    // Dans le brouillard, du côté d'Alice mais hors de son rayon de vision
    await h.ok(gm, 'POST', `${base}/fog-zones`, { shape: 'rect', points: square(0, 600, 200) });
    const fogged = await npc({ x: 100, y: 700 });
    // Dans un calque masqué, tout près d'Alice
    const secret = await h.ok<Item>(gm, 'POST', `${base}/layers`, {
      name: 'Embuscade',
      visibleToPlayers: false,
    });
    const ambush = await npc({ x: 130, y: 100 }, { layerId: secret.id });
    // Témoin : un PNJ visible, à côté d'Alice
    const guard = await npc({ x: 150, y: 150 });

    const hidden = [behind, cellar, fogged, ambush];
    const aliceSees = await tokenIds(alice, map.id);
    expect(aliceSees).toContain(guard.id);
    for (const n of hidden) expect(aliceSees).not.toContain(n.id);
    const snap = await snapshot(alice, map.id);
    expect(snap.tokens!.map((x) => x.id).sort()).toEqual(aliceSees.sort());
    const near = await h.ok<{ items: Item[] }>(
      alice,
      'GET',
      `${base}/tokens/near?x=150&y=150&radius=5000`,
    );
    for (const n of hidden) expect(near.items.map((x) => x.id)).not.toContain(n.id);
    // Bob, sans token : vue d'en haut (ni pièce fermée, ni brouillard, ni calque masqué)
    const bobSees = await tokenIds(bob, map.id);
    expect(bobSees).toContain(behind.id);
    for (const n of [cellar, fogged, ambush]) expect(bobSees).not.toContain(n.id);

    // Aucun événement reçu par Alice ne mentionne un PNJ caché
    for (const n of hidden) expect(await leaks(alice, n.id, n.characterId)).toEqual([]);
    for (const n of [cellar, fogged, ambush])
      expect(await leaks(bob, n.id, n.characterId)).toEqual([]);
    // Un PNJ inconnu d'Alice ne se modifie pas chez elle (introuvable)
    expect(
      (await h.request(alice, 'PATCH', `${base}/tokens/${behind.id}`, { pos: { x: 1, y: 1 } }))
        .statusCode,
    ).toBe(404);

    // Alice ouvre la porte : le PNJ derrière devient visible, les joueurs sont prévenus
    await h.ok(alice, 'PATCH', `${base}/obstacles/${door.id}`, { isOpen: true });
    expect(await tokenIds(alice, map.id)).toContain(behind.id);
    const changed = (await events()).filter((e) => e.type === 'map.visibility_changed');
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.at(-1)).toMatchObject({ visibility: 'public', payload: { mapId: map.id } });
    // La pièce s'ouvre (sa porte), le cellier se voit
    expect(await tokenIds(alice, map.id)).not.toContain(cellar.id);
    const cellarDoor = (await h.ok<{ items: Item[] }>(gm, 'GET', `${base}/obstacles`)).items.find(
      (o) => (o.points as { y: number }[])[0]!.y === 300,
    )!;
    await h.ok(gm, 'PATCH', `${base}/obstacles/${cellarDoor.id}`, { isOpen: true });
    expect(await tokenIds(alice, map.id)).toContain(cellar.id);
    expect(room.id).toBeDefined();
  });

  it('déplacements routés joueur par joueur : token.moved à qui le voit, token.hidden à qui le perd', async () => {
    const { map, base, npc } = await dungeon();
    const orc = await npc({ x: 150, y: 150 });
    const heroChar = (await tokenIds(alice, map.id)).length;
    expect(heroChar).toBe(2);
    // Derrière le mur : Alice le perd (token.hidden ciblé), Bob (vue d'en haut) le voit encore
    await h.ok(gm, 'PATCH', `${base}/tokens/${orc.id}`, { pos: { x: 400, y: 400 } });
    let all = await events();
    const moved = all.filter((e) => e.type === 'token.moved' && e.payload.tokenId === orc.id);
    expect(moved.at(-1)).toMatchObject({
      visibility: 'gm_only',
      payload: { visibleToUsers: [bob.id] },
    });
    const lost = all.filter((e) => e.type === 'token.hidden' && e.payload.id === orc.id);
    expect(lost.at(-1)).toMatchObject({
      visibility: 'gm_only',
      payload: { visibleToUsers: [alice.id] },
    });
    expect(await tokenIds(alice, map.id)).not.toContain(orc.id);
    // Dans le brouillard : plus personne ; la zone fait relire tous les joueurs
    await h.ok(gm, 'POST', `${base}/fog-zones`, {
      shape: 'circle',
      center: { x: 400, y: 400 },
      radius: 80,
    });
    await h.ok(gm, 'PATCH', `${base}/tokens/${orc.id}`, { pos: { x: 410, y: 400 } });
    all = await events();
    expect(all.filter((e) => e.type === 'token.moved').at(-1)).toMatchObject({
      visibility: 'gm_only',
    });
    expect(all.filter((e) => e.type === 'token.moved').at(-1)!.payload.visibleToUsers).toBe(
      undefined,
    );
    expect(all.filter((e) => e.type === 'map.visibility_changed').at(-1)).toMatchObject({
      visibility: 'public',
      payload: { mapId: map.id },
    });
    // Personne ne le voyait avant ce déplacement : aucun `token.hidden` de plus
    expect(all.filter((e) => e.type === 'token.hidden')).toHaveLength(1);
    // De retour près d'Alice : visible de tous (public)
    await h.ok(gm, 'PATCH', `${base}/tokens/${orc.id}`, { pos: { x: 120, y: 160 } });
    all = await events();
    expect(all.filter((e) => e.type === 'token.moved').at(-1)).toMatchObject({
      visibility: 'public',
    });

    // Le héros d'Alice bouge : elle est prévenue de relire (observateur)
    const hero = (await h.ok<{ items: Item[] }>(alice, 'GET', `${base}/tokens`)).items.find(
      (x) => x.visibility !== undefined && x.id !== orc.id,
    )!;
    await h.ok(alice, 'PATCH', `${base}/tokens/${hero.id}`, { pos: { x: 110, y: 100 } });
    const notified = (await events()).filter((e) => e.type === 'map.visibility_changed').at(-1)!;
    expect(notified).toMatchObject({
      visibility: 'gm_only',
      payload: { mapId: map.id, visibleToUsers: [alice.id] },
    });
  });

  it('objets : filtrés par la vue, contenu jamais envoyé aux joueurs (REST, bus)', async () => {
    const { map, base } = await dungeon();
    const items = [{ id: 'or', name: 'Or', quantity: 12 }];
    const chest = await h.ok<Item>(gm, 'POST', `${base}/objects`, {
      name: 'Coffre',
      kind: 'item',
      pos: { x: 130, y: 90 },
      width: 20,
      height: 20,
      items,
      searchable: true,
      searchRadius: 2,
    });
    expect(chest.items).toEqual(items);
    const hoard = await h.ok<Item>(gm, 'POST', `${base}/objects`, {
      name: 'Trésor',
      kind: 'item',
      pos: { x: 400, y: 100 },
      items,
    });
    const statue = await h.ok<Item>(gm, 'POST', `${base}/objects`, {
      name: 'Statue',
      kind: 'decor',
      pos: { x: 500, y: 500 },
    });

    const listed = (await h.ok<{ items: Item[] }>(alice, 'GET', `${base}/objects`)).items;
    expect(listed.map((o) => o.id).sort()).toEqual([chest.id, statue.id].sort());
    expect(listed.find((o) => o.id === chest.id)!.items).toEqual([]);
    const snap = await snapshot(alice, map.id);
    expect(snap.objects!.every((o) => (o.items as unknown[]).length === 0)).toBe(true);
    expect(snap.objects!.map((o) => o.id)).not.toContain(hoard.id);
    // Le MJ garde tout
    const gmList = (await h.ok<{ items: Item[] }>(gm, 'GET', `${base}/objects`)).items;
    expect(gmList.find((o) => o.id === hoard.id)!.items).toEqual(items);

    // Contenu modifié : Alice reçoit l'objet sans son contenu, le MJ l'a en entier
    await h.ok(gm, 'PATCH', `${base}/objects/${chest.id}`, {
      items: [...items, { id: 'dague', name: 'Dague', quantity: 1 }],
    });
    for (const e of await received(alice))
      if (e.type.startsWith('map_object.') && Array.isArray(e.payload.items))
        expect(e.payload.items).toEqual([]);
    expect(await leaks(alice, hoard.id)).toEqual([]);
    const full = (await events()).filter(
      (e) => e.type === 'map_object.updated' && (e.payload.items as unknown[])?.length === 2,
    );
    expect(full).toHaveLength(1);
    expect(full[0]!.visibility).toBe('gm_only');
    expect(full[0]!.payload.visibleToUsers).toBeUndefined();

    // Fouille : à portée et vu ; derrière le mur, introuvable
    const heroId = (await h.ok<{ items: Item[] }>(alice, 'GET', `${base}/tokens`)).items[0]!
      .characterId as string;
    const found = await h.ok<Item>(alice, 'POST', `${base}/objects/${chest.id}/search`, {
      characterId: heroId,
    });
    expect((found.items as unknown[]).length).toBe(2);
    await h.ok(gm, 'PATCH', `${base}/objects/${hoard.id}`, { searchable: true, searchRadius: 100 });
    const far = await h.request(alice, 'POST', `${base}/objects/${hoard.id}/search`, {
      characterId: heroId,
    });
    expect(far.statusCode).toBe(404);
  });

  it('ligne de vue : mur et porte fermée coupent, porte ouverte laisse voir', async () => {
    const { base, door, walls } = await dungeon();
    const los = (from: string, to: string) =>
      h.ok<{ blocked: boolean; obstacleIds: string[] }>(
        alice,
        'GET',
        `${base}/line-of-sight?from=${from}&to=${to}`,
      );
    expect(await los('100,100', '300,100')).toEqual({ blocked: true, obstacleIds: [door.id] });
    expect(await los('100,300', '300,300')).toEqual({
      blocked: true,
      obstacleIds: [walls[2]!.id],
    });
    expect(await los('100,100', '150,150')).toEqual({ blocked: false, obstacleIds: [] });
    await h.ok(gm, 'PATCH', `${base}/obstacles/${door.id}`, { isOpen: true });
    expect(await los('100,100', '300,100')).toEqual({ blocked: false, obstacleIds: [] });
  });
});
