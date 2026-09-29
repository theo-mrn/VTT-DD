/**
 * Refonte de la carte sur un vrai PostgreSQL + PostGIS : calques du MJ (pile, calque par
 * défaut, arrange, suppression, calque masqué aux joueurs), pièces, zones de brouillard,
 * murs à sens unique et translucides, mise à l'échelle.
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
interface Layer extends Item {
  name: string;
  sortOrder: number;
  role: string | null;
}

describe.skipIf(!TEST_DATABASE_URL)('carte : refonte', () => {
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
  const newMap = (body: Record<string, unknown> = {}) =>
    h.ok<Item>(gm, 'POST', url('/maps'), { name: 'Taverne', width: 1000, height: 1000, ...body });
  const layersOf = async (u: TestUser, mapId: string) =>
    (await h.ok<{ items: Layer[] }>(u, 'GET', url(`/maps/${mapId}/layers`))).items;

  it('calques : trois par carte, contenu par défaut, arrange et suppression', async () => {
    const map = await newMap();
    const base = url(`/maps/${map.id}`);
    const [sol, objets, persos] = await layersOf(gm, map.id);
    expect([sol, objets, persos].map((l) => l!.role)).toEqual(['ground', 'objects', 'tokens']);

    // Sans calque : celui de sa sorte, en haut de la pile
    const hero = await h.engage(campaignId, alice);
    const token = await h.ok<Item>(gm, 'POST', `${base}/tokens`, {
      characterId: hero,
      pos: { x: 10, y: 10 },
    });
    expect(token).toMatchObject({ layerId: persos!.id, z: 1 });
    const table = await h.ok<Item>(gm, 'POST', `${base}/objects`, { pos: { x: 1, y: 1 } });
    const tapis = await h.ok<Item>(gm, 'POST', `${base}/objects`, {
      pos: { x: 1, y: 1 },
      layerId: sol!.id,
    });
    expect(table).toMatchObject({ layerId: objets!.id, z: 1 });
    expect(table).not.toHaveProperty('isBackground');
    expect(tapis).toMatchObject({ layerId: sol!.id, z: 1 });
    const note = await h.ok<Item>(alice, 'POST', `${base}/notes`, {
      text: 'Ici',
      pos: { x: 0, y: 0 },
    });
    expect(note).toMatchObject({ layerId: null, z: 1 });

    // Nouveau calque en haut ; un calque d'une autre carte est refusé
    const toit = await h.ok<Layer>(gm, 'POST', `${base}/layers`, { name: 'Toit' });
    expect(toit.sortOrder).toBe(3);
    const other = await newMap({ name: 'Ailleurs' });
    const [foreign] = await layersOf(gm, other.id);
    const bad = await h.request(gm, 'POST', `${base}/objects`, {
      pos: { x: 1, y: 1 },
      layerId: foreign!.id,
    });
    expect(bad.json()).toMatchObject({ code: 'unknown_layer' });

    // Arrange : le tapis passe au-dessus du token, dans le toit
    const arranged = await h.ok<{ objects: Item[]; tokens: Item[] }>(
      gm,
      'POST',
      `${base}/arrange`,
      {
        items: [
          { kind: 'object', id: tapis.id, layerId: toit.id, z: 5 },
          { kind: 'token', id: token.id, layerId: toit.id, z: 2.5 },
        ],
      },
    );
    expect(arranged.objects[0]).toMatchObject({ layerId: toit.id, z: 5, version: 2 });
    expect(arranged.tokens[0]).toMatchObject({ layerId: toit.id, z: 2.5 });
    // Un joueur réordonne ses textes, pas les objets, ni vers un calque verrouillé
    await h.ok(alice, 'POST', `${base}/arrange`, {
      items: [{ kind: 'note', id: note.id, layerId: objets!.id, z: 9 }],
    });
    expect(
      (
        await h.request(alice, 'POST', `${base}/arrange`, {
          items: [{ kind: 'object', id: table.id, layerId: objets!.id, z: 9 }],
        })
      ).statusCode,
    ).toBe(403);
    await h.ok(gm, 'PATCH', `${base}/layers/${sol!.id}`, { locked: true });
    expect(
      (
        await h.request(alice, 'POST', `${base}/arrange`, {
          items: [{ kind: 'note', id: note.id, layerId: sol!.id, z: 1 }],
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await h.request(gm, 'POST', `${base}/arrange`, {
          items: [{ kind: 'token', id: token.id, layerId: null, z: 1 }],
        })
      ).json(),
    ).toMatchObject({ code: 'layer_required' });

    // Supprimer le toit : son contenu descend dans Personnages, au-dessus, ordre gardé
    await h.ok(gm, 'DELETE', `${base}/layers/${toit.id}`);
    const snap = await h.ok<Record<string, Item[]>>(gm, 'GET', base);
    expect(snap.layers!.map((l) => l.name)).toEqual(['Sol', 'Objets', 'Personnages']);
    const moved = [...snap.tokens!, ...snap.objects!].filter((x) => x.layerId === persos!.id);
    expect(moved.sort((a, b) => (a.z as number) - (b.z as number)).map((x) => x.id)).toEqual([
      token.id,
      tapis.id,
    ]);
    // ?moveTo= : vers un calque choisi ; jamais le dernier calque
    await h.ok(gm, 'DELETE', `${base}/layers/${objets!.id}?moveTo=${persos!.id}`);
    await h.ok(gm, 'DELETE', `${base}/layers/${sol!.id}`);
    const last = await h.request(gm, 'DELETE', `${base}/layers/${persos!.id}`);
    expect(last.json()).toMatchObject({ code: 'last_layer' });
    expect((await h.request(alice, 'POST', `${base}/layers`, { name: 'X' })).statusCode).toBe(403);
  });

  it('calque masqué aux joueurs : son contenu ne leur est jamais envoyé', async () => {
    const map = await newMap();
    const base = url(`/maps/${map.id}`);
    const [, objets, persos] = await layersOf(gm, map.id);
    const hero = await h.engage(campaignId, alice);
    const npc = await h.engage(campaignId, gm, { side: 'enemies' });
    await h.ok(gm, 'POST', `${base}/tokens`, { characterId: hero, pos: { x: 100, y: 100 } });
    await h.ok(gm, 'POST', `${base}/tokens`, { characterId: npc, pos: { x: 120, y: 100 } });
    const chest = await h.ok<Item>(gm, 'POST', `${base}/objects`, { pos: { x: 5, y: 5 } });
    const secret = await h.ok<Layer>(gm, 'POST', `${base}/layers`, {
      name: 'Embuscade',
      visibleToPlayers: false,
    });

    // Calque masqué : absent pour le joueur, son contenu aussi
    await h.ok(gm, 'POST', `${base}/arrange`, {
      items: [{ kind: 'object', id: chest.id, layerId: secret.id, z: 1 }],
    });
    const seen = await h.ok<Record<string, Item[]>>(alice, 'GET', base);
    expect(seen.layers!.map((l) => l.id)).not.toContain(secret.id);
    expect(seen.objects).toEqual([]);
    expect((await h.request(alice, 'PATCH', `${base}/objects/${chest.id}`, {})).statusCode).toBe(
      404,
    );

    // Masquer tout le calque des personnages : le PNJ disparaît, pas son propre héros
    await h.ok(gm, 'PATCH', `${base}/layers/${persos!.id}`, { visibleToPlayers: false });
    const tokens = (await h.ok<{ items: Item[] }>(alice, 'GET', `${base}/tokens`)).items;
    expect(tokens.map((x) => x.characterId)).toEqual([hero]);
    await h.ok(gm, 'PATCH', `${base}/layers/${objets!.id}`, { name: 'Mobilier' });

    const all = await events();
    const types = all.map((e) => `${e.type}:${e.visibility}`);
    expect(types).toContain('map_layer.created:gm_only');
    expect(types).toContain('map_layer.hidden:public');
    // L'objet passé dans le calque masqué : événement MJ, retiré chez les joueurs
    const chestEvents = all.filter((e) => (e.payload as { id?: string }).id === chest.id);
    expect(chestEvents.map((e) => `${e.type}:${e.visibility}`)).toEqual([
      'map_object.created:public',
      'map_object.updated:gm_only',
      'map_object.hidden:public',
    ]);
  });

  it('pièces, zones de brouillard en lot, murs à sens unique et translucides', async () => {
    const map = await newMap();
    const base = url(`/maps/${map.id}`);
    const room = await h.ok<Item>(gm, 'POST', `${base}/rooms`, {
      name: 'Cave',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    });
    expect(room).toMatchObject({ name: 'Cave', version: 1 });
    expect(room.points).toHaveLength(4);
    const moved = await h.ok<Item>(gm, 'PATCH', `${base}/rooms/${room.id}`, {
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 0, y: 50 },
      ],
    });
    expect(moved.points).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 0, y: 50 },
    ]);
    expect((await h.request(alice, 'POST', `${base}/rooms`, { points: [] })).statusCode).toBe(400);

    // Zones en lot : l'ordre de création fait foi ; la forme ne change pas
    const batch = await h.ok<{ created: Item[] }>(gm, 'POST', `${base}/fog-zones/batch`, {
      create: [
        { shape: 'circle', center: { x: 10, y: 10 }, radius: 5 },
        {
          shape: 'polygon',
          mode: 'clear',
          points: [
            { x: 0, y: 0 },
            { x: 5, y: 0 },
            { x: 0, y: 5 },
          ],
        },
      ],
    });
    const [circle, lasso] = batch.created as [Item, Item];
    expect(lasso.order as number).toBeGreaterThan(circle.order as number);
    const bad = await h.request(gm, 'PATCH', `${base}/fog-zones/${circle.id}`, {
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 0, y: 5 },
      ],
    });
    expect(bad.json()).toMatchObject({ code: 'fog_zone_shape' });
    const bigger = await h.ok<Item>(gm, 'PATCH', `${base}/fog-zones/${circle.id}`, { radius: 50 });
    expect(bigger).toMatchObject({ radius: 50, center: { x: 10, y: 10 } });
    const inView = await h.ok<{ items: Item[] }>(
      alice,
      'GET',
      `${base}/fog-zones?bbox=55,55,58,58`,
    );
    expect(inView.items.map((z) => z.id)).toEqual([circle.id]);

    // Mur à sens unique : bloque à gauche par défaut ; mur translucide : laisse voir
    const [oneWay, glass] = (
      await h.ok<{ created: Item[] }>(gm, 'POST', `${base}/obstacles/batch`, {
        create: [
          {
            kind: 'one_way_wall',
            points: [
              { x: 50, y: 0 },
              { x: 50, y: 100 },
            ],
          },
          {
            kind: 'wall',
            opacity: 0.5,
            points: [
              { x: 200, y: 0 },
              { x: 200, y: 100 },
            ],
          },
        ],
      })
    ).created as [Item, Item];
    expect(oneWay).toMatchObject({ blocksFrom: 'left', opacity: 1 });
    expect(oneWay).not.toHaveProperty('direction');
    const los = (from: string, to: string) =>
      h.ok<{ blocked: boolean }>(alice, 'GET', `${base}/line-of-sight?from=${from}&to=${to}`);
    // a→b vers le bas : la gauche du tracé est à l'est (x > 50)
    expect((await los('80,50', '20,50')).blocked).toBe(true);
    expect((await los('20,50', '80,50')).blocked).toBe(false);
    expect((await los('180,50', '220,50')).blocked).toBe(false);
    await h.ok(gm, 'PATCH', `${base}/obstacles/${glass.id}`, { opacity: 1 });
    expect((await los('180,50', '220,50')).blocked).toBe(true);
  });

  it('médias : URL d’envoi signée, images et vidéos, MJ seulement', async () => {
    const mo = 1024 * 1024;
    const image = await h.ok<{ uploadUrl: string; publicUrl: string; expiresIn: number }>(
      gm,
      'POST',
      url('/media'),
      { kind: 'image', contentType: 'image/avif', size: 9 * mo },
    );
    expect(image.publicUrl).toMatch(
      new RegExp(`^https://cdn\\.test\\.local/vtt/campaigns/${campaignId}/[0-9a-f-]+\\.avif$`),
    );
    expect(image.uploadUrl).toContain('X-Amz-Signature');
    const video = await h.ok<{ publicUrl: string }>(gm, 'POST', url('/media'), {
      kind: 'video',
      contentType: 'video/webm',
      size: 100 * mo,
    });
    expect(video.publicUrl).toMatch(/\.webm$/);
    expect(t.uploads.at(-1)).toMatchObject({ contentType: 'video/webm', size: 100 * mo });
    // Trop gros, type d'une autre sorte, joueur : refusés
    const big = { kind: 'video', contentType: 'video/mp4', size: 100 * mo + 1 };
    expect((await h.request(gm, 'POST', url('/media'), big)).statusCode).toBe(400);
    const odd = { kind: 'image', contentType: 'video/mp4', size: 10 };
    expect((await h.request(gm, 'POST', url('/media'), odd)).statusCode).toBe(400);
    const ok = { kind: 'image', contentType: 'image/png', size: 10 };
    expect((await h.request(alice, 'POST', url('/media'), ok)).statusCode).toBe(403);
    // Une vidéo envoyée sert de fond de carte
    const map = await newMap({ backgroundUrl: video.publicUrl });
    expect(map.backgroundUrl).toBe(video.publicUrl);
  });

  it('mise à l’échelle : toute la géométrie en une transaction', async () => {
    const map = await newMap({ spawn: { x: 10, y: 20 } });
    const base = url(`/maps/${map.id}`);
    const hero = await h.engage(campaignId, alice);
    await h.ok(gm, 'POST', `${base}/tokens`, {
      characterId: hero,
      pos: { x: 100, y: 100 },
      visionRadius: 100,
    });
    await h.ok(gm, 'POST', `${base}/objects`, { pos: { x: 10, y: 10 }, width: 20, height: 40 });
    await h.ok(gm, 'POST', `${base}/fog-zones`, {
      shape: 'circle',
      center: { x: 100, y: 50 },
      radius: 10,
    });
    await h.ok(alice, 'POST', `${base}/drawings`, {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      width: 4,
    });
    const target = await newMap({ name: 'Route' });
    await h.ok(gm, 'POST', url(`/maps/${target.id}/portals`), {
      pos: { x: 0, y: 0 },
      targetMapId: map.id,
      target: { x: 30, y: 30 },
    });
    expect((await h.request(alice, 'POST', `${base}/rescale`, { sx: 2, sy: 2 })).statusCode).toBe(
      403,
    );

    const snap = await h.ok<Record<string, Item[]> & { map: Item }>(gm, 'POST', `${base}/rescale`, {
      sx: 2,
      sy: 2,
    });
    expect(snap.map).toMatchObject({ width: 2000, height: 2000, spawn: { x: 20, y: 40 } });
    expect(snap.tokens![0]).toMatchObject({ pos: { x: 200, y: 200 }, visionRadius: 200, scale: 2 });
    expect(snap.objects![0]).toMatchObject({ pos: { x: 20, y: 20 }, width: 40, height: 80 });
    expect(snap.fogZones![0]).toMatchObject({ center: { x: 200, y: 100 }, radius: 20 });
    expect(snap.drawings![0]).toMatchObject({
      width: 8,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
      ],
    });
    const portals = await h.ok<{ items: Item[] }>(gm, 'GET', url(`/maps/${target.id}/portals`));
    expect(portals.items[0]).toMatchObject({ target: { x: 60, y: 60 }, pos: { x: 0, y: 0 } });
    const types = (await events()).map((e) => e.type);
    expect(types).toContain('map.rescaled');
  });
});
