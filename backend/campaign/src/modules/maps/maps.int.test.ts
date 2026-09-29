/**
 * Carte sur un vrai PostgreSQL + PostGIS : scènes, couches, tokens, droits
 * MJ/joueur, visibilité côté serveur (brouillard, murs, lumières, rayon de
 * vision), requêtes spatiales et événements de l'outbox.
 */
import { MapSnapshot } from '@vtt/contracts';
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
interface Token extends Item {
  characterId: string;
  mapId: string;
  pos: { x: number; y: number };
}

describe.skipIf(!TEST_DATABASE_URL)('carte', () => {
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

  /** Carte 1000×1000 (case de brouillard : 50 px). */
  const newMap = (body: Record<string, unknown> = {}) =>
    h.ok<Item>(gm, 'POST', url('/maps'), { name: 'Taverne', width: 1000, height: 1000, ...body });

  it('textes : rotation autour du début de la ligne de base, droits par défaut', async () => {
    const map = await newMap();
    const base = url(`/maps/${map.id}`);
    const note = await h.ok<Item>(alice, 'POST', `${base}/notes`, {
      text: 'Ici',
      pos: { x: 5, y: 5 },
    });
    expect(note.rotation).toBe(0);
    const turned = await h.ok<Item>(alice, 'PATCH', `${base}/notes/${note.id}`, {
      rotation: 30,
      version: note.version,
    });
    expect(turned).toMatchObject({ rotation: 30, version: note.version + 1 });
    expect(
      (await h.request(alice, 'PATCH', `${base}/notes/${note.id}`, { rotation: 'penché' }))
        .statusCode,
    ).toBe(400);
    // Le texte d'Alice ne tourne pas sous la main de Bob ; le MJ, si
    expect(
      (await h.request(bob, 'PATCH', `${base}/notes/${note.id}`, { rotation: 45 })).statusCode,
    ).toBe(403);
    await h.ok(gm, 'PATCH', `${base}/notes/${note.id}`, { rotation: -90 });
    const created = await h.ok<Item>(bob, 'POST', `${base}/notes`, {
      text: 'Là',
      pos: { x: 1, y: 1 },
      rotation: 12.5,
    });
    expect(created.rotation).toBe(12.5);
    const snap = await h.ok<Record<string, Item[]>>(bob, 'GET', base);
    expect(MapSnapshot.safeParse(snap).error).toBeUndefined();
    expect(snap.notes!.map((n) => n.rotation as number).sort((a, b) => a - b)).toEqual([-90, 12.5]);
  });

  const tokens = async (u: TestUser, mapId: string) =>
    (await h.ok<{ items: Token[] }>(u, 'GET', url(`/maps/${mapId}/tokens`))).items;

  /** Scène avec le personnage d'Alice en (100,100) et un PNJ du MJ. */
  async function scene(npc: Record<string, unknown> = {}, npcPos = { x: 150, y: 100 }) {
    const map = await newMap();
    const heroId = await h.engage(campaignId, alice);
    const npcId = await h.engage(campaignId, gm, { side: 'enemies' });
    const hero = await h.ok<Token>(gm, 'POST', url(`/maps/${map.id}/tokens`), {
      characterId: heroId,
      pos: { x: 100, y: 100 },
      visionRadius: 100,
    });
    const orc = await h.ok<Token>(gm, 'POST', url(`/maps/${map.id}/tokens`), {
      characterId: npcId,
      pos: npcPos,
      ...npc,
    });
    return { map, hero, orc, heroId, npcId };
  }

  it('scènes : le MJ crée, les joueurs ne voient que les cartes visibles', async () => {
    const shown = await newMap();
    const secret = await newMap({ name: 'Repaire', visibleToPlayers: false });
    expect(shown).toMatchObject({ name: 'Taverne', isDefault: false, width: 1000, version: 1 });

    const all = await h.ok<{ items: Item[] }>(gm, 'GET', url('/maps'));
    expect(all.items.map((m) => m.id)).toEqual([shown.id, secret.id]);
    const mine = await h.ok<{ items: Item[] }>(alice, 'GET', url('/maps'));
    expect(mine.items.map((m) => m.id)).toEqual([shown.id]);
    expect((await h.request(alice, 'GET', url(`/maps/${secret.id}`))).statusCode).toBe(404);
    expect((await h.request(alice, 'POST', url('/maps'), { name: 'X' })).statusCode).toBe(403);

    // Une seule carte par défaut (le fond global de l'ancienne app)
    await newMap({ name: 'Fond', isDefault: true });
    const again = await h.request(gm, 'POST', url('/maps'), { name: 'Fond 2', isDefault: true });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'default_map_exists' });

    // Verrou optimiste, puis la carte cachée produit map.hidden
    const stale = await h.request(gm, 'PATCH', url(`/maps/${shown.id}`), {
      name: 'Auberge',
      version: 9,
    });
    expect(stale.statusCode).toBe(409);
    const hidden = await h.ok<Item>(gm, 'PATCH', url(`/maps/${shown.id}`), {
      visibleToPlayers: false,
      version: 1,
    });
    expect(hidden.version).toBe(2);
    const types = (await events()).map((e) => `${e.type}:${e.visibility}`);
    expect(types).toContain('map.updated:gm_only');
    expect(types).toContain('map.hidden:public');
    expect(types).toContain('map.created:gm_only');
  });

  it('couches : droits MJ, auteur et portes', async () => {
    const map = await newMap();
    const base = url(`/maps/${map.id}`);

    // Objets : MJ seulement ; caché → absent pour les joueurs
    const chest = await h.ok<Item>(gm, 'POST', `${base}/objects`, {
      name: 'Coffre',
      pos: { x: 10, y: 20 },
      visibility: 'hidden',
      items: [{ id: 'i1', name: 'Or', quantity: 3 }],
    });
    await h.ok(gm, 'POST', `${base}/objects`, { name: 'Table', pos: { x: 50, y: 50 } });
    expect(
      (await h.request(alice, 'POST', `${base}/objects`, { pos: { x: 1, y: 1 } })).statusCode,
    ).toBe(403);
    const seen = await h.ok<{ items: Item[] }>(alice, 'GET', `${base}/objects`);
    expect(seen.items.map((o) => o.name)).toEqual(['Table']);
    expect(
      (await h.request(alice, 'PATCH', `${base}/objects/${chest.id}`, { name: 'x' })).statusCode,
    ).toBe(404);

    // Dessins : tout joueur ; l'auteur ou le MJ efface
    const line = await h.ok<Item>(alice, 'POST', `${base}/drawings`, {
      points: [{ x: 0, y: 0 }],
      color: '#ff0000',
    });
    expect(line).toMatchObject({
      createdBy: alice.id,
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    });
    const other = await h.ok<Item>(bob, 'POST', `${base}/drawings`, {
      tool: 'line',
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
    });
    expect((await h.request(alice, 'DELETE', `${base}/drawings/${other.id}`)).statusCode).toBe(403);
    await h.ok(alice, 'DELETE', `${base}/drawings`); // les siens seulement
    const left = await h.ok<{ items: Item[] }>(gm, 'GET', `${base}/drawings`);
    expect(left.items.map((d) => d.id)).toEqual([other.id]);
    await h.ok(gm, 'DELETE', `${base}/drawings/${other.id}`);

    // Obstacles : lot du MJ ; un joueur ouvre une porte non verrouillée
    const batch = await h.ok<{ created: Item[] }>(gm, 'POST', `${base}/obstacles/batch`, {
      create: [
        {
          kind: 'wall',
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
        {
          kind: 'door',
          points: [
            { x: 100, y: 0 },
            { x: 120, y: 0 },
          ],
        },
        {
          kind: 'door',
          points: [
            { x: 120, y: 0 },
            { x: 140, y: 0 },
          ],
          isLocked: true,
        },
      ],
    });
    const [wall, door, locked] = batch.created as [Item, Item, Item];
    const opened = await h.ok<Item>(alice, 'PATCH', `${base}/obstacles/${door.id}`, {
      isOpen: true,
    });
    expect(opened).toMatchObject({ isOpen: true, version: 2 });
    expect(
      (await h.request(alice, 'PATCH', `${base}/obstacles/${locked.id}`, { isOpen: true }))
        .statusCode,
    ).toBe(403);
    expect(
      (await h.request(alice, 'PATCH', `${base}/obstacles/${wall.id}`, { isOpen: true }))
        .statusCode,
    ).toBe(403);

    // Gabarit permanent et texte d'un joueur, zone sonore du MJ
    const cone = await h.ok<Item>(alice, 'POST', `${base}/measurements`, {
      shape: 'cone',
      start: { x: 0, y: 0 },
      end: { x: 30, y: 40 },
      color: '#00ff00',
      options: { coneAngle: 60 },
    });
    expect(cone).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 30, y: 40 } });
    await h.ok(bob, 'POST', `${base}/notes`, { text: 'Ici !', pos: { x: 5, y: 5 } });
    await h.ok(gm, 'POST', `${base}/music-zones`, {
      pos: { x: 500, y: 500 },
      radius: 50,
      url: 'E8Ced6hW45',
    });

    // Portail vers une carte d'une autre campagne : refusé
    const elsewhere = await h.campaign(gm);
    const [foreign] = (await h.ok<{ items: Item[] }>(gm, 'GET', `/v1/campaigns/${elsewhere}/maps`))
      .items;
    expect(foreign).toBeUndefined();
    const foreignMap = await h.ok<Item>(gm, 'POST', `/v1/campaigns/${elsewhere}/maps`, {
      name: 'Ailleurs',
    });
    const bad = await h.request(gm, 'POST', `${base}/portals`, {
      pos: { x: 1, y: 1 },
      targetMapId: foreignMap.id,
    });
    expect(bad.statusCode).toBe(422);

    // Chargement initial : tout d'un coup, filtré pour le joueur
    const snap = await h.ok<Record<string, Item[]>>(alice, 'GET', base);
    // Conforme au contrat partagé avec le front
    expect(MapSnapshot.safeParse(snap).error).toBeUndefined();
    expect(MapSnapshot.safeParse(await h.ok(gm, 'GET', base)).error).toBeUndefined();
    expect(snap.objects).toHaveLength(1);
    expect(snap.obstacles).toHaveLength(3);
    expect(snap.measurements).toHaveLength(1);
    expect(snap.notes).toHaveLength(1);
    expect(snap.musicZones).toHaveLength(1);
    expect(snap.fogZones).toEqual([]);
    expect(snap.layers!.map((l) => l.name)).toEqual(['Sol', 'Objets', 'Personnages']);
    // Fenêtre d'affichage : seuls les éléments qui la touchent
    const view = await h.ok<Record<string, Item[]>>(gm, 'GET', `${base}?bbox=0,0,30,30`);
    expect(view.objects!.map((o) => o.name)).toEqual(['Coffre']);

    const types = (await events()).map((e) => `${e.type}:${e.visibility}`);
    expect(types).toContain('map_object.created:gm_only');
    expect(types).toContain('map_object.created:public');
    expect(types).toContain('map_drawing.cleared:public');
    expect(types).toContain('map_obstacle.updated:public');
  });

  it('tokens : déplacements, droits et un seul token.moved', async () => {
    const { map, hero, orc } = await scene({ visibility: 'visible' });
    const base = url(`/maps/${map.id}/tokens`);

    const moved = await h.ok<Token>(alice, 'PATCH', `${base}/${hero.id}`, {
      pos: { x: 120, y: 110 },
      version: 1,
    });
    expect(moved).toMatchObject({ pos: { x: 120, y: 110 }, version: 2 });
    expect(
      (await h.request(alice, 'PATCH', `${base}/${hero.id}`, { visibility: 'hidden' })).statusCode,
    ).toBe(403);
    expect(
      (await h.request(alice, 'PATCH', `${base}/${hero.id}`, { visionRadius: 5000 })).statusCode,
    ).toBe(403);
    // Vision augmentée : le rayon triple, puis revient
    const boosted = await h.ok<Token>(alice, 'PATCH', `${base}/${hero.id}`, { visionBoost: true });
    expect(boosted).toMatchObject({ visionBoost: true, visionRadius: 300 });
    const normal = await h.ok<Token>(alice, 'PATCH', `${base}/${hero.id}`, { visionBoost: false });
    expect(normal).toMatchObject({ visionBoost: false, visionRadius: 100 });
    expect(
      (await h.request(alice, 'PATCH', `${base}/${orc.id}`, { pos: { x: 0, y: 0 } })).statusCode,
    ).toBe(403);
    expect(
      (await h.request(bob, 'PATCH', `${base}/${hero.id}`, { pos: { x: 0, y: 0 } })).statusCode,
    ).toBe(403);
    const stale = await h.request(alice, 'PATCH', `${base}/${hero.id}`, {
      pos: { x: 1, y: 1 },
      version: 1,
    });
    expect(stale.statusCode).toBe(409);

    // Déplacement groupé du MJ
    await h.ok(gm, 'POST', `${base}/move`, {
      moves: [
        { tokenId: hero.id, pos: { x: 130, y: 130 } },
        { tokenId: orc.id, pos: { x: 200, y: 200 } },
      ],
    });
    const all = await events();
    const moves = all.filter((e) => e.type === 'token.moved');
    expect(moves).toHaveLength(3);
    expect(moves[0]!.payload).toMatchObject({
      tokenId: hero.id,
      from: { mapId: map.id, x: 100, y: 100 },
      to: { mapId: map.id, x: 120, y: 110 },
    });

    // Un personnage non engagé ne se pose pas ; pas deux tokens sur la même carte
    const stranger = t.character.add({ ownerId: gm.id, systemId: 'dnd-classic' });
    const refused = await h.request(gm, 'POST', base, {
      characterId: stranger,
      pos: { x: 0, y: 0 },
    });
    expect(refused.statusCode).toBe(422);
    const twice = await h.request(gm, 'POST', base, {
      characterId: hero.characterId,
      pos: { x: 0, y: 0 },
    });
    expect(twice.json()).toMatchObject({ code: 'token_exists' });

    // Rayon : le plus proche d'abord
    const near = await h.ok<{ items: (Token & { distance: number })[] }>(
      gm,
      'GET',
      `${base}/near?x=130&y=130&radius=50`,
    );
    expect(near.items.map((x) => x.id)).toEqual([hero.id]);
    expect(near.items[0]!.distance).toBe(0);

    await h.ok(gm, 'DELETE', `${base}/${orc.id}`);
    expect((await tokens(gm, map.id)).map((x) => x.id)).toEqual([hero.id]);
  });

  it('visibilité : invisible, custom, brouillard, lumière, mur et rayon de vision', async () => {
    // PNJ caché à 50 px du héros (rayon 100) : visible
    const { map, orc, npcId } = await scene({ visibility: 'hidden' });
    const base = url(`/maps/${map.id}`);
    const ids = async (u: TestUser) => (await tokens(u, map.id)).map((x) => x.characterId);
    expect(await ids(alice)).toContain(npcId);
    expect(await ids(bob)).not.toContain(npcId); // Bob n'a aucun token sur la carte

    // Un mur entre les deux : caché
    const wall = await h.ok<Item>(gm, 'POST', `${base}/obstacles`, {
      points: [
        { x: 125, y: 0 },
        { x: 125, y: 300 },
      ],
    });
    expect(await ids(alice)).not.toContain(npcId);
    const los = await h.ok<{ blocked: boolean; obstacleIds: string[] }>(
      alice,
      'GET',
      `${base}/line-of-sight?from=100,100&to=150,100`,
    );
    expect(los).toEqual({ blocked: true, obstacleIds: [wall.id] });
    // Calque obstacles masqué par le MJ : plus d'occlusion
    await h.ok(gm, 'PATCH', base, { display: { obstacles: false } });
    expect(await ids(alice)).toContain(npcId);
    await h.ok(gm, 'PATCH', base, { display: { obstacles: true } });
    await h.ok(gm, 'PATCH', `${base}/obstacles/${wall.id}`, { kind: 'door', isOpen: true });
    expect(await ids(alice)).toContain(npcId);

    // Loin du héros : caché, sauf éclairé par une lumière (rayon 2 × 50 px/unité)
    await h.ok(gm, 'PATCH', `${base}/tokens/${orc.id}`, { pos: { x: 600, y: 600 } });
    expect(await ids(alice)).not.toContain(npcId);
    const light = await h.ok<Item>(gm, 'POST', `${base}/lights`, {
      pos: { x: 650, y: 600 },
      radius: 2,
    });
    expect(await ids(alice)).toContain(npcId);
    const at = await h.ok<Record<string, Item[]>>(alice, 'GET', `${base}/at?x=600&y=600`);
    expect(at.lights!.map((l) => l.id)).toEqual([light.id]);
    await h.ok(gm, 'PATCH', `${base}/lights/${light.id}`, { visible: false });
    expect(await ids(alice)).not.toContain(npcId);

    // Visible, mais dans une zone de brouillard ; une zone « clear » posée après la découvre
    await h.ok(gm, 'PATCH', `${base}/tokens/${orc.id}`, { visibility: 'visible' });
    expect(await ids(alice)).toContain(npcId);
    const square = (x: number, y: number, w: number) => [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + w },
      { x, y: y + w },
    ];
    const fog = await h.ok<Item>(gm, 'POST', `${base}/fog-zones`, {
      shape: 'rect',
      points: square(550, 550, 100),
    });
    expect(fog).toMatchObject({ shape: 'rect', mode: 'fog', center: null, createdBy: gm.id });
    expect(await ids(alice)).not.toContain(npcId);
    const hole = await h.ok<Item>(gm, 'POST', `${base}/fog-zones`, {
      shape: 'circle',
      mode: 'clear',
      center: { x: 600, y: 600 },
      radius: 10,
    });
    expect(hole.order).toBeGreaterThan(fog.order as number);
    expect(hole).toMatchObject({ points: [], radius: 10 });
    expect(await ids(alice)).toContain(npcId);
    await h.ok(gm, 'DELETE', `${base}/fog-zones/${hole.id}`);
    expect(await ids(alice)).not.toContain(npcId);
    await h.ok(gm, 'DELETE', `${base}/fog-zones/${fog.id}`);
    // Toute la carte sous le brouillard
    await h.ok(gm, 'PATCH', base, { fogFull: true });
    expect(await ids(alice)).not.toContain(npcId);
    await h.ok(gm, 'PATCH', base, { fogFull: false });

    // Invisible : jamais ; custom : seulement les joueurs visés
    await h.ok(gm, 'PATCH', `${base}/tokens/${orc.id}`, { visibility: 'invisible' });
    expect(await ids(alice)).not.toContain(npcId);
    expect(await ids(gm)).toContain(npcId);
    const bobHero = await h.engage(campaignId, bob);
    await h.ok(gm, 'PATCH', `${base}/tokens/${orc.id}`, {
      visibility: 'custom',
      visibleTo: [bobHero],
    });
    expect(await ids(alice)).not.toContain(npcId);
    await h.ok(gm, 'POST', `${base}/tokens`, { characterId: bobHero, pos: { x: 900, y: 900 } });
    expect(await ids(bob)).toContain(npcId);

    // Un token caché ne fuit pas dans les événements publics
    const all = await events();
    const orcEvents = all.filter(
      (e) =>
        (e.payload as { id?: string; tokenId?: string }).id === orc.id ||
        (e.payload as { tokenId?: string }).tokenId === orc.id,
    );
    expect(orcEvents.find((e) => e.type === 'token.created')!.visibility).toBe('gm_only');
    expect(orcEvents.filter((e) => e.type === 'token.hidden').length).toBeGreaterThan(0);
    const leaked = orcEvents.filter(
      (e) =>
        e.visibility === 'public' &&
        e.type === 'token.updated' &&
        (e.payload as { visibility: string }).visibility !== 'visible',
    );
    expect(leaked).toEqual([]);

    // Visibilité custom : realtime reçoit les joueurs visés (propriétaires des personnages)
    const custom = orcEvents.filter(
      (e) => (e.payload as { visibility?: string }).visibility === 'custom',
    );
    expect(custom.length).toBeGreaterThan(0);
    for (const e of custom) {
      expect(e.visibility).toBe('gm_only');
      expect((e.payload as { visibleToUsers?: string[] }).visibleToUsers).toEqual([bob.id]);
    }
  });

  it('quadrillages : par scène, lus par tous ; la grille de jeu donne la case de la scène', async () => {
    const map = await newMap();
    const base = url(`/maps/${map.id}`);
    const grid = {
      id: 'cases',
      name: 'Cases',
      size: 100,
      offsetX: 10,
      offsetY: 20,
      color: '#000000',
      opacity: 0.4,
      thickness: 1,
      visibleToPlayers: true,
      primary: true,
    };
    const zones = { ...grid, id: 'zones', name: 'Zones', size: 500, primary: false };
    // Lumière de 2 unités : 100 px avec la case de la campagne (50), 200 px avec la grille (100)
    await h.ok(gm, 'POST', `${base}/lights`, { pos: { x: 300, y: 300 }, radius: 2 });
    const lit = async () =>
      (await h.ok<{ lights: Item[] }>(gm, 'GET', `${base}/at?x=450&y=300`)).lights.length;
    expect(await lit()).toBe(0);

    const updated = await h.ok<Item>(gm, 'PATCH', base, { grids: [grid, zones] });
    expect(updated.grids).toEqual([grid, zones]);
    expect(await lit()).toBe(1);
    const snap = await h.ok<{ map: Item }>(alice, 'GET', base);
    expect(snap.map.grids).toEqual([grid, zones]);

    // Une seule grille de jeu ; le MJ seul règle les quadrillages
    expect(
      (await h.request(gm, 'PATCH', base, { grids: [grid, { ...zones, primary: true }] }))
        .statusCode,
    ).toBe(400);
    expect((await h.request(alice, 'PATCH', base, { grids: [] })).statusCode).toBe(403);

    // Mise à l'échelle du fond : la case et l'origine suivent
    await h.ok(gm, 'PATCH', base, { width: 1000, height: 1000 });
    await h.ok(gm, 'POST', `${base}/rescale`, { sx: 2, sy: 2 });
    const [scaled] = (await h.ok<{ map: Item }>(gm, 'GET', base)).map.grids as (typeof grid)[];
    expect(scaled).toMatchObject({ size: 200, offsetX: 20, offsetY: 40 });
  });

  it('personnages joueurs : sur la scène du groupe dès leur arrivée, sans s’empiler', async () => {
    const road = await newMap({ name: 'Route', spawn: { x: 500, y: 500 } });
    await h.ok(gm, 'PATCH', url('/map-settings'), { partyMapId: road.id });
    const aliceHero = await h.engage(campaignId, alice);
    const bobHero = await h.engage(campaignId, bob);
    const npc = await h.engage(campaignId, gm, { side: 'enemies' });
    const onRoad = await tokens(gm, road.id);
    expect(onRoad.map((x) => x.characterId).sort()).toEqual([aliceHero, bobHero].sort());
    // Le premier sur le point d'apparition, le suivant une case plus loin
    expect(onRoad.find((x) => x.characterId === aliceHero)?.pos).toEqual({ x: 500, y: 500 });
    const [a, b] = onRoad;
    expect(Math.hypot(a!.pos.x - b!.pos.x, a!.pos.y - b!.pos.y)).toBeGreaterThanOrEqual(50);
    expect(onRoad.some((x) => x.characterId === npc)).toBe(false);

    // Un personnage incarné, même hors du camp des joueurs, rejoint aussi le groupe
    const ally = await h.engage(campaignId, alice, { side: 'allies' });
    expect((await tokens(gm, road.id)).some((x) => x.characterId === ally)).toBe(false);
    await h.play(campaignId, alice, ally);
    expect((await tokens(gm, road.id)).some((x) => x.characterId === ally)).toBe(true);

    // Tout le groupe ailleurs : chacun sa case autour du point d'arrivée
    const camp = await newMap({ name: 'Camp', spawn: { x: 200, y: 200 } });
    const party = await h.ok<{ items: Token[] }>(gm, 'POST', url(`/maps/${camp.id}/travel`), {});
    expect(party.items.map((x) => x.characterId).sort()).toEqual([aliceHero, bobHero, ally].sort());
    expect(new Set(party.items.map((x) => `${x.pos.x},${x.pos.y}`)).size).toBe(3);
    expect(await tokens(gm, road.id)).toEqual([]);
  });

  it('voyage entre scènes, carte du groupe et suppression protégée', async () => {
    const { map: tavern, hero, heroId } = await scene();
    const road = await newMap({ name: 'Route', spawn: { x: 5, y: 6 } });
    const lair = await newMap({ name: 'Antre', visibleToPlayers: false });

    // Le joueur emmène son personnage (point d'apparition), pas celui des autres
    const [arrived] = (
      await h.ok<{ items: Token[] }>(alice, 'POST', url(`/maps/${road.id}/travel`), {
        characterIds: [heroId],
      })
    ).items;
    expect(arrived).toMatchObject({ mapId: road.id, pos: { x: 5, y: 6 }, visionRadius: 100 });
    expect(await tokens(gm, tavern.id)).toHaveLength(1); // le PNJ reste
    expect(
      (await h.request(alice, 'POST', url(`/maps/${lair.id}/travel`), { characterIds: [heroId] }))
        .statusCode,
    ).toBe(404);
    const bobHero = await h.engage(campaignId, bob);
    expect(
      (await h.request(alice, 'POST', url(`/maps/${road.id}/travel`), { characterIds: [bobHero] }))
        .statusCode,
    ).toBe(403);
    // Une fois sur la carte cachée (amené par le MJ), le joueur la voit
    await h.ok(gm, 'POST', url(`/maps/${lair.id}/travel`), {
      characterIds: [heroId],
      pos: { x: 1, y: 2 },
    });
    expect(
      (await h.ok<{ items: Item[] }>(alice, 'GET', url('/maps'))).items.map((m) => m.id),
    ).toContain(lair.id);

    // Retour dans la taverne : même token, nouvelle position
    const [back] = (
      await h.ok<{ items: Token[] }>(gm, 'POST', url(`/maps/${tavern.id}/travel`), {
        characterIds: [heroId],
        pos: { x: 42, y: 43 },
      })
    ).items;
    expect(back).toMatchObject({ id: hero.id, pos: { x: 42, y: 43 } });

    // Tout le groupe sur la route : carte du groupe
    const party = await h.ok<{ items: Token[] }>(gm, 'POST', url(`/maps/${road.id}/travel`), {});
    expect(party.items.map((x) => x.characterId).sort()).toEqual([heroId, bobHero].sort());
    const settings = await h.ok<Item>(alice, 'GET', url('/map-settings'));
    expect(settings).toMatchObject({ partyMapId: road.id, pixelsPerUnit: 50, unitName: 'm' });
    expect((await h.request(alice, 'POST', url(`/maps/${road.id}/travel`), {})).statusCode).toBe(
      403,
    );

    const moves = (await events()).filter((e) => e.type === 'token.moved');
    expect(moves[0]!.payload).toMatchObject({
      from: { mapId: tavern.id, x: 100, y: 100 },
      to: { mapId: road.id, x: 5, y: 6 },
    });

    const blocked = await h.request(gm, 'DELETE', url(`/maps/${road.id}`));
    expect(blocked.json()).toMatchObject({ code: 'players_present' });
    await h.ok(gm, 'DELETE', url(`/maps/${lair.id}`));
    expect((await h.ok<{ items: Item[] }>(gm, 'GET', url('/maps'))).items).toHaveLength(2);
  });

  it('réglages et dossiers de scènes (MJ)', async () => {
    const group = await h.ok<Item>(gm, 'POST', url('/map-groups'), { name: 'Donjon' });
    const map = await newMap({ groupId: group.id });
    expect(map).toMatchObject({ groupId: group.id });
    expect((await h.request(alice, 'GET', url('/map-groups'))).statusCode).toBe(403);
    await h.ok(gm, 'DELETE', url(`/map-groups/${group.id}`));
    expect(await h.ok<Item>(gm, 'GET', url(`/maps/${map.id}`))).toMatchObject({
      map: { groupId: null },
    });

    const s = await h.ok<Item>(gm, 'PATCH', url('/map-settings'), {
      pixelsPerUnit: 70,
      dungeonMode: true,
      music: { videoId: 'abc', isPlaying: true },
    });
    expect(s).toMatchObject({ pixelsPerUnit: 70, dungeonMode: true, version: 1 });
    expect(
      (await h.request(alice, 'PATCH', url('/map-settings'), { unitName: 'ft' })).statusCode,
    ).toBe(403);
    expect(
      (await h.request(gm, 'PATCH', url('/map-settings'), { unitName: 'ft', version: 5 }))
        .statusCode,
    ).toBe(409);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('carte : index spatiaux', () => {
  it('les requêtes par rayon et par fenêtre passent par les index GiST', async () => {
    const t = await testApp();
    try {
      const plans = await t.db!.transaction(async (tx) => {
        // Tables presque vides en test : on interdit le parcours séquentiel pour voir l'index choisi
        await tx.execute(sql`set local enable_seqscan = off`);
        const plan = async (q: ReturnType<typeof sql>) =>
          (await tx.execute<{ 'QUERY PLAN': string }>(sql`explain ${q}`)).rows
            .map((r) => r['QUERY PLAN'])
            .join('\n');
        const map = '00000000-0000-4000-8000-000000000000';
        return [
          // Sans filtre de carte : l'index unique (map_id, character_id) ne peut pas servir
          await plan(sql`select id from campaign.map_tokens
            where ST_DWithin(pos, ST_SetSRID(ST_MakePoint(1, 1), 0), 50)`),
          await plan(sql`select id from campaign.map_obstacles where map_id = ${map}
            and geom && ST_MakeEnvelope(0, 0, 100, 100, 0)`),
        ];
      });
      expect(plans[0]).toContain('map_tokens_map_pos');
      expect(plans[1]).toContain('map_obstacles_map_geom');
    } finally {
      await t.close();
    }
  });
});
