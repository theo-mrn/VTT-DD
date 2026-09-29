/**
 * Portails sur un vrai PostgreSQL + PostGIS (docs/carte.md § 10, Portails) : aller-retour relié
 * et tenu par le service, destination cachée aux joueurs, emprunt (droits, zone, arrivée,
 * scène cachée, groupe) et événements.
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
interface Portal extends Item {
  mapId: string;
  pos: { x: number; y: number };
  target: { x: number; y: number } | null;
  targetMapId: string | null;
  linkedPortalId: string | null;
  kind: string;
}
interface Token extends Item {
  characterId: string;
  mapId: string;
  pos: { x: number; y: number };
}

describe.skipIf(!TEST_DATABASE_URL)('portails', () => {
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

  const newMap = (body: Record<string, unknown> = {}) =>
    h.ok<Item>(gm, 'POST', url('/maps'), {
      name: 'Rez-de-chaussée',
      width: 1000,
      height: 1000,
      ...body,
    });
  const portals = async (u: TestUser, mapId: string) =>
    (await h.ok<{ items: Portal[] }>(u, 'GET', url(`/maps/${mapId}/portals`))).items;
  const portal = async (mapId: string, id: string) =>
    (await portals(gm, mapId)).find((p) => p.id === id)!;
  const tokens = async (u: TestUser, mapId: string) =>
    (await h.ok<{ items: Token[] }>(u, 'GET', url(`/maps/${mapId}/tokens`))).items;

  /** Carte avec le héros d'Alice en (100,100) et celui de Bob en (800,800). */
  async function scene() {
    const map = await newMap();
    const heroId = await h.engage(campaignId, alice);
    const bobId = await h.engage(campaignId, bob);
    const hero = await h.ok<Token>(gm, 'POST', url(`/maps/${map.id}/tokens`), {
      characterId: heroId,
      pos: { x: 100, y: 100 },
    });
    await h.ok<Token>(gm, 'POST', url(`/maps/${map.id}/tokens`), {
      characterId: bobId,
      pos: { x: 800, y: 800 },
    });
    return { map, hero, heroId, bobId };
  }

  it('aller-retour sur la même carte : lien symétrique tenu par le serveur', async () => {
    const map = await newMap();
    const base = url(`/maps/${map.id}/portals`);
    const a = await h.ok<Portal>(gm, 'POST', base, {
      pos: { x: 100, y: 100 },
      kind: 'same_map',
      target: { x: 700, y: 700 },
      name: 'Trappe',
    });
    expect(a).toMatchObject({ auto: false, linkedPortalId: null, targetMapId: null });
    // Le retour, relié : les destinations se croisent
    const b = await h.ok<Portal>(gm, 'POST', base, {
      pos: { x: 700, y: 700 },
      linkedPortalId: a.id,
      name: 'Trappe',
    });
    expect(b).toMatchObject({
      kind: 'same_map',
      targetMapId: null,
      target: { x: 100, y: 100 },
      linkedPortalId: a.id,
    });
    expect(await portal(map.id, a.id)).toMatchObject({
      linkedPortalId: b.id,
      target: { x: 700, y: 700 },
    });

    // Déplacer l'un : l'arrivée de l'autre suit
    await h.ok(gm, 'PATCH', `${base}/${a.id}`, { pos: { x: 150, y: 120 } });
    expect((await portal(map.id, b.id)).target).toEqual({ x: 150, y: 120 });
    // Déplacer l'arrivée d'un portail relié : son retour se déplace
    await h.ok(gm, 'PATCH', `${base}/${a.id}`, { target: { x: 650, y: 640 } });
    expect((await portal(map.id, b.id)).pos).toEqual({ x: 650, y: 640 });

    // Relié à lui-même, ou à un portail inconnu : refusé
    const self = await h.request(gm, 'PATCH', `${base}/${a.id}`, { linkedPortalId: a.id });
    expect(self.statusCode).toBe(422);
    const unknown = await h.request(gm, 'PATCH', `${base}/${a.id}`, {
      linkedPortalId: '01890000-0000-7000-8000-000000000000',
    });
    expect(unknown.json()).toMatchObject({ code: 'unknown_portal' });

    // Relier ailleurs : l'ancien partenaire est délié
    const c = await h.ok<Portal>(gm, 'POST', base, {
      pos: { x: 400, y: 400 },
      linkedPortalId: b.id,
    });
    expect((await portal(map.id, a.id)).linkedPortalId).toBeNull();
    expect(await portal(map.id, b.id)).toMatchObject({
      linkedPortalId: c.id,
      target: { x: 400, y: 400 },
    });

    // Supprimer l'un : l'autre reste, à sens unique
    await h.ok(gm, 'DELETE', `${base}/${c.id}`);
    expect(await portal(map.id, b.id)).toMatchObject({
      linkedPortalId: null,
      target: { x: 400, y: 400 },
    });
  });

  it('aller-retour entre deux scènes ; changer la scène visée délie', async () => {
    const hall = await newMap();
    const cellar = await newMap({ name: 'Cave', visibleToPlayers: false });
    const up = await h.ok<Portal>(gm, 'POST', url(`/maps/${hall.id}/portals`), {
      pos: { x: 500, y: 500 },
      icon: 'stairs',
    });
    const down = await h.ok<Portal>(gm, 'POST', url(`/maps/${cellar.id}/portals`), {
      pos: { x: 50, y: 60 },
      linkedPortalId: up.id,
    });
    expect(down).toMatchObject({
      kind: 'scene_change',
      targetMapId: hall.id,
      target: { x: 500, y: 500 },
    });
    expect(await portal(hall.id, up.id)).toMatchObject({
      kind: 'scene_change',
      targetMapId: cellar.id,
      target: { x: 50, y: 60 },
      linkedPortalId: down.id,
    });
    // Un `map_portal.updated` pour le portail de l'autre scène
    const updated = (await events()).filter(
      (e) => e.type === 'map_portal.updated' && e.payload.id === up.id,
    );
    expect(updated.length).toBeGreaterThan(0);

    // Viser une autre scène délie les deux
    const attic = await newMap({ name: 'Grenier' });
    await h.ok(gm, 'PATCH', url(`/maps/${hall.id}/portals/${up.id}`), { targetMapId: attic.id });
    expect(await portal(hall.id, up.id)).toMatchObject({
      linkedPortalId: null,
      targetMapId: attic.id,
    });
    expect((await portal(cellar.id, down.id)).linkedPortalId).toBeNull();
    // Une carte visée qui est celle du portail : une téléportation
    const same = await h.ok<Portal>(gm, 'PATCH', url(`/maps/${hall.id}/portals/${up.id}`), {
      targetMapId: hall.id,
      target: { x: 10, y: 10 },
    });
    expect(same).toMatchObject({ kind: 'same_map', targetMapId: null });
  });

  it('un joueur ne reçoit ni la destination ni le retour, et pas les portails cachés', async () => {
    const map = await newMap();
    const secret = await newMap({ name: 'Crypte secrète', visibleToPlayers: false });
    const base = url(`/maps/${map.id}/portals`);
    const shown = await h.ok<Portal>(gm, 'POST', base, {
      pos: { x: 100, y: 100 },
      targetMapId: secret.id,
      target: { x: 5, y: 5 },
      name: 'Escalier',
      auto: true,
    });
    const hidden = await h.ok<Portal>(gm, 'POST', base, {
      pos: { x: 300, y: 300 },
      visible: false,
    });

    const mine = await portals(alice, map.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      id: shown.id,
      name: 'Escalier',
      auto: true,
      target: null,
      targetMapId: null,
      linkedPortalId: null,
    });
    const snap = await h.ok<Record<string, Portal[]>>(alice, 'GET', url(`/maps/${map.id}`));
    expect(MapSnapshot.safeParse(snap).error).toBeUndefined();
    expect(snap.portals).toEqual(mine);
    const at = await h.ok<{ portals: Portal[] }>(
      alice,
      'GET',
      url(`/maps/${map.id}/at?x=100&y=100`),
    );
    expect(at.portals[0]).toMatchObject({ targetMapId: null, target: null });
    // Le MJ reçoit tout
    expect((await portal(map.id, shown.id)).targetMapId).toBe(secret.id);
    expect(await portal(map.id, hidden.id)).toBeDefined();

    // Bus : l'événement complet aux MJ, sa version réduite (même version) à tous
    const created = (await events()).filter(
      (e) => e.type === 'map_portal.created' && e.payload.id === shown.id,
    );
    expect(created.map((e) => e.visibility)).toEqual(['gm_only', 'public']);
    expect(created[0]!.payload.targetMapId).toBe(secret.id);
    expect(created[1]!.payload).toMatchObject({ targetMapId: null, target: null });
    const hiddenEvents = (await events()).filter((e) => e.payload.id === hidden.id);
    expect(hiddenEvents.map((e) => e.visibility)).toEqual(['gm_only']);
  });

  it('emprunter sur la même carte : zone, droits, arrivée sans empiler', async () => {
    const { map, hero, heroId, bobId } = await scene();
    const base = url(`/maps/${map.id}/portals`);
    const trap = await h.ok<Portal>(gm, 'POST', base, {
      pos: { x: 110, y: 100 },
      radius: 40,
      kind: 'same_map',
      target: { x: 500, y: 500 },
      name: 'Trappe',
    });
    const use = (u: TestUser, body: unknown, id = trap.id) =>
      h.request(u, 'POST', `${base}/${id}/use`, body);

    // Bob n'emprunte pas avec le personnage d'Alice ; Alice, pas depuis l'autre bout de la carte
    expect((await use(bob, { characterIds: [heroId] })).statusCode).toBe(403);
    expect((await use(alice, { party: true })).statusCode).toBe(403);
    const far = await use(bob, { characterIds: [bobId] });
    expect(far.json()).toMatchObject({ code: 'out_of_range' });

    const res = await use(alice, { characterIds: [heroId] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mapId: map.id,
      items: [{ id: hero.id, pos: { x: 500, y: 500 } }],
    });
    const moved = (await events()).filter((e) => e.type === 'token.moved');
    expect(moved.at(-1)!.payload).toMatchObject({
      tokenId: hero.id,
      from: { mapId: map.id, x: 100, y: 100 },
      to: { mapId: map.id, x: 500, y: 500 },
    });
    const used = (await events()).filter((e) => e.type === 'map_portal.used');
    expect(used).toHaveLength(1);
    expect(used[0]).toMatchObject({
      visibility: 'gm_only',
      payload: {
        id: trap.id,
        name: 'Trappe',
        toMapId: map.id,
        characterIds: [heroId],
        party: false,
      },
    });

    // Le MJ fait passer Bob sans condition de zone : il arrive à côté d'Alice, pas sur elle
    const gmUse = await h.ok<{ items: Token[] }>(gm, 'POST', `${base}/${trap.id}/use`, {
      characterIds: [bobId],
    });
    const gap = Math.hypot(gmUse.items[0]!.pos.x - 500, gmUse.items[0]!.pos.y - 500);
    expect(gap).toBeGreaterThanOrEqual(50);
    expect(gap).toBeLessThan(75);

    // Portail caché : introuvable pour un joueur ; sans destination : refusé
    const hidden = await h.ok<Portal>(gm, 'POST', base, {
      pos: { x: 500, y: 500 },
      visible: false,
      kind: 'same_map',
      target: { x: 10, y: 10 },
    });
    expect((await use(alice, { characterIds: [heroId] }, hidden.id)).statusCode).toBe(404);
    const nowhere = await h.ok<Portal>(gm, 'POST', base, {
      pos: { x: 500, y: 500 },
      kind: 'same_map',
    });
    expect((await use(alice, { characterIds: [heroId] }, nowhere.id)).json()).toMatchObject({
      code: 'portal_without_destination',
    });
  });

  it('emprunter vers une scène cachée : le joueur y arrive, /travel reste fermé', async () => {
    const { map, heroId } = await scene();
    const crypt = await newMap({
      name: 'Crypte',
      visibleToPlayers: false,
      spawn: { x: 300, y: 300 },
    });
    const vault = await newMap({ name: 'Chambre forte', visibleToPlayers: false });
    const stairs = await h.ok<Portal>(gm, 'POST', url(`/maps/${map.id}/portals`), {
      pos: { x: 100, y: 100 },
      radius: 30,
      targetMapId: crypt.id,
    });
    // Avant : la crypte est introuvable pour Alice
    expect((await h.request(alice, 'GET', url(`/maps/${crypt.id}`))).statusCode).toBe(404);

    const res = await h.ok<{ mapId: string; items: Token[] }>(
      alice,
      'POST',
      url(`/maps/${map.id}/portals/${stairs.id}/use`),
      { characterIds: [heroId] },
    );
    // Sans point d'arrivée sur le portail : celui de la scène
    expect(res).toMatchObject({
      mapId: crypt.id,
      items: [{ mapId: crypt.id, pos: { x: 300, y: 300 } }],
    });
    expect(await tokens(alice, map.id)).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ characterId: heroId })]),
    );
    // Arrivée : la crypte s'ouvre à elle, pas les autres scènes cachées
    expect((await h.request(alice, 'GET', url(`/maps/${crypt.id}`))).statusCode).toBe(200);
    const travel = await h.request(alice, 'POST', url(`/maps/${vault.id}/travel`), {
      characterIds: [heroId],
    });
    expect(travel.statusCode).toBe(404);
  });

  it('faire passer tout le groupe vers une autre scène : elle devient celle du groupe', async () => {
    const { map, heroId, bobId } = await scene();
    const road = await newMap({ name: 'Route' });
    const gate = await h.ok<Portal>(gm, 'POST', url(`/maps/${map.id}/portals`), {
      pos: { x: 900, y: 900 },
      targetMapId: road.id,
      target: { x: 200, y: 200 },
    });
    const res = await h.ok<{ mapId: string; items: Token[] }>(
      gm,
      'POST',
      url(`/maps/${map.id}/portals/${gate.id}/use`),
      { party: true },
    );
    expect(res.mapId).toBe(road.id);
    expect(res.items.map((t) => t.characterId).sort()).toEqual([heroId, bobId].sort());
    const settings = await h.ok<{ partyMapId: string }>(gm, 'GET', url('/map-settings'));
    expect(settings.partyMapId).toBe(road.id);
    // Un joueur ne fait pas passer le groupe
    const back = await h.request(alice, 'POST', url(`/maps/${map.id}/portals/${gate.id}/use`), {
      party: true,
    });
    expect(back.statusCode).toBe(403);
  });
});
