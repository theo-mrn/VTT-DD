/**
 * Mémoire de l'exploration (docs/exploration.md), sur un vrai PostgreSQL : file remplie par les
 * écritures qui changent la vue, calcul du travailleur, traînées, gestes du MJ, audience, et
 * non-fuite (la mémoire ne montre aucun PNJ : ils restent filtrés par la vue en direct).
 */
import {
  decodeMask,
  decodeWindow,
  encodeWindow,
  explorationGrid,
  ExplorationMask,
  type EncodedWindow,
} from '@vtt/vision';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mapExplorationQueue, outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';
import { processExplorationQueue } from './exploration-worker.js';

interface Item {
  id: string;
  version: number;
  [k: string]: unknown;
}

interface Exploration {
  mapId: string;
  scope: string;
  cols: number;
  rows: number;
  version: number;
  window: EncodedWindow;
}

interface OutboxEvent {
  type: string;
  visibility: string;
  payload: Record<string, unknown>;
}

describe.skipIf(!TEST_DATABASE_URL)('carte : mémoire de l’exploration', () => {
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

  const events = async (type: string): Promise<OutboxEvent[]> =>
    t
      .db!.select({
        type: sql<string>`${outbox.envelope}->>'type'`,
        visibility: sql<string>`${outbox.envelope}->>'visibility'`,
        payload: sql<Record<string, unknown>>`${outbox.envelope}->'payload'`,
      })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->>'roomId' = ${campaignId} AND ${outbox.envelope}->>'type' = ${type}`,
      )
      .orderBy(outbox.id);

  const queued = async (mapId: string) =>
    (await t.db!.select().from(mapExplorationQueue)).some((r) => r.mapId === mapId);

  /** Le travailleur, sur cette scène seulement (les autres tests ont les leurs). */
  const work = (mapId: string) => processExplorationQueue(t.db!, { mapId });

  const read = async (u: TestUser, mapId: string) =>
    (await h.ok<{ exploration: Exploration | null }>(u, 'GET', url(`/maps/${mapId}/exploration`)))
      .exploration;

  const maskOf = (e: Exploration) => decodeMask(e, e.window);

  /** La case dont le centre est le plus proche de ce point est-elle explorée ? */
  const explored = (e: Exploration, x: number, y: number, size = 1000) => {
    const m = maskOf(e);
    const c = Math.min(m.cols - 1, Math.floor((x / size) * m.cols));
    const r = Math.min(m.rows - 1, Math.floor((y / size) * m.rows));
    return m.get(c, r);
  };

  /**
   * Carte 1000 × 1000, grille de 100 px (cases d'exploration de 25 px, 40 × 40) : héros d'Alice en
   * (100, 500), rayon 150 ; mur vertical en x = 300, porte fermée de y 450 à 550 ; brouillard
   * total. Un gobelin (PNJ visible) en (400, 500), derrière la porte.
   */
  async function dungeon(extra: Record<string, unknown> = {}) {
    const map = await h.ok<Item>(gm, 'POST', url('/maps'), {
      name: 'Donjon',
      width: 1000,
      height: 1000,
      fogFull: true,
      grids: [
        {
          id: 'jeu',
          name: 'Jeu',
          size: 100,
          offsetX: 0,
          offsetY: 0,
          color: '#000000',
          opacity: 0.3,
          thickness: 1,
          visibleToPlayers: false,
          primary: true,
        },
      ],
      ...extra,
    });
    const base = url(`/maps/${map.id}`);
    const heroId = await h.engage(campaignId, alice);
    const hero = await h.ok<Item>(gm, 'POST', `${base}/tokens`, {
      characterId: heroId,
      pos: { x: 100, y: 500 },
      visionRadius: 150,
    });
    const created = await h.ok<{ created: Item[] }>(gm, 'POST', `${base}/obstacles/batch`, {
      create: [
        {
          kind: 'wall',
          points: [
            { x: 300, y: 0 },
            { x: 300, y: 450 },
          ],
        },
        {
          kind: 'door',
          points: [
            { x: 300, y: 450 },
            { x: 300, y: 550 },
          ],
        },
        {
          kind: 'wall',
          points: [
            { x: 300, y: 550 },
            { x: 300, y: 1000 },
          ],
        },
      ],
    });
    const goblinId = await h.engage(campaignId, gm, { side: 'enemies' });
    const goblin = await h.ok<Item>(gm, 'POST', `${base}/tokens`, {
      characterId: goblinId,
      pos: { x: 400, y: 500 },
    });
    return { map, base, hero, heroId, door: created.created[1]!, goblin };
  }

  it('scène neuve : exploration active ; le travailleur explore ce que voit le groupe', async () => {
    const { map } = await dungeon();
    expect(map.exploration).toBe('party');
    expect(await queued(map.id)).toBe(true);
    expect(await work(map.id)).toBe(1);
    expect(await queued(map.id)).toBe(false);
    const e = (await read(alice, map.id))!;
    expect(e).toMatchObject({ mapId: map.id, scope: 'party', cols: 40, rows: 40 });
    // Le disque du héros, pas derrière la porte, pas hors de son rayon
    expect(explored(e, 100, 500)).toBe(true);
    expect(explored(e, 180, 580)).toBe(true);
    expect(explored(e, 400, 500)).toBe(false);
    expect(explored(e, 100, 800)).toBe(false);
    // Chargement de la carte : la même mémoire
    const snap = await h.ok<{ exploration: Exploration }>(alice, 'GET', url(`/maps/${map.id}`));
    expect(snap.exploration.version).toBe(e.version);
    // Événement public, fenêtre seulement
    const [ev] = await events('map.exploration_updated');
    expect(ev!.visibility).toBe('public');
    expect(ev!.payload).toMatchObject({ mapId: map.id, scope: 'party', cols: 40, rows: 40 });
    // Rien de neuf : pas d'autre version ni d'événement
    await h.ok(gm, 'PATCH', url(`/maps/${map.id}`), { fogFull: true });
    expect(await work(map.id)).toBe(0);
  });

  it('la mémoire reste quand le héros s’éloigne ; une porte ouverte explore plus loin', async () => {
    const { map, base, hero, door } = await dungeon();
    await work(map.id);
    await h.ok(alice, 'POST', `${base}/tokens/move`, {
      moves: [{ tokenId: hero.id, pos: { x: 150, y: 150 } }],
    });
    expect(await work(map.id)).toBe(1);
    let e = (await read(alice, map.id))!;
    expect(explored(e, 100, 500)).toBe(true);
    expect(explored(e, 150, 150)).toBe(true);
    expect(explored(e, 400, 500)).toBe(false);
    // Retour près de la porte, qui s'ouvre (le MJ) : la salle d'à côté se découvre
    await h.ok(alice, 'POST', `${base}/tokens/move`, {
      moves: [{ tokenId: hero.id, pos: { x: 280, y: 500 } }],
    });
    await h.ok(gm, 'PATCH', `${base}/obstacles/${door.id}`, { isOpen: true });
    await work(map.id);
    e = (await read(alice, map.id))!;
    expect(explored(e, 400, 500)).toBe(true);
  });

  it('non-fuite : la mémoire ne montre aucun PNJ hors de la vue en direct', async () => {
    const { map, base, hero, door, goblin } = await dungeon();
    await h.ok(alice, 'POST', `${base}/tokens/move`, {
      moves: [{ tokenId: hero.id, pos: { x: 280, y: 500 } }],
    });
    await h.ok(gm, 'PATCH', `${base}/obstacles/${door.id}`, { isOpen: true });
    await work(map.id);
    const tokens = async () =>
      (await h.ok<{ items: Item[] }>(alice, 'GET', `${base}/tokens`)).items.map((x) => x.id);
    expect(await tokens()).toContain(goblin.id);
    // Porte refermée, héros reparti : la salle est explorée, le gobelin n'est plus envoyé
    await h.ok(gm, 'PATCH', `${base}/obstacles/${door.id}`, { isOpen: false });
    await h.ok(alice, 'POST', `${base}/tokens/move`, {
      moves: [{ tokenId: hero.id, pos: { x: 100, y: 500 } }],
    });
    await work(map.id);
    const e = (await read(alice, map.id))!;
    expect(explored(e, 400, 500)).toBe(true);
    expect(await tokens()).not.toContain(goblin.id);
    const snap = await h.ok<{ tokens: Item[] }>(alice, 'GET', url(`/maps/${map.id}`));
    expect(snap.tokens.map((x) => x.id)).not.toContain(goblin.id);
    // Les événements d'exploration ne parlent que de cases
    for (const ev of await events('map.exploration_updated'))
      expect(JSON.stringify(ev.payload)).not.toContain(goblin.id);
  });

  it('traînée : le chemin d’un glisser est exploré, pas seulement l’arrivée', async () => {
    const { map, base, hero } = await dungeon();
    await work(map.id);
    // Glisser le long du mur, de (100, 500) à (100, 100), en passant par (100, 300)
    await h.ok(alice, 'POST', `${base}/tokens/move`, {
      moves: [{ tokenId: hero.id, pos: { x: 100, y: 100 } }],
    });
    const res = await h.ok<{ version: number }>(alice, 'POST', `${base}/exploration/trail`, {
      trails: [{ tokenId: hero.id, points: [{ x: 100, y: 300 }] }],
    });
    expect(res.version).toBeGreaterThan(1);
    await work(map.id);
    const e = (await read(alice, map.id))!;
    expect(e.version).toBeGreaterThanOrEqual(res.version);
    expect(explored(e, 100, 300)).toBe(true);
    // Bob ne trace pas pour le héros d'Alice ; un token inconnu : 404
    const forbidden = await h.request(bob, 'POST', `${base}/exploration/trail`, {
      trails: [{ tokenId: hero.id, points: [{ x: 900, y: 900 }] }],
    });
    expect(forbidden.statusCode).toBe(403);
    const unknown = await h.request(alice, 'POST', `${base}/exploration/trail`, {
      trails: [{ tokenId: crypto.randomUUID(), points: [{ x: 900, y: 900 }] }],
    });
    expect(unknown.statusCode).toBe(404);
  });

  it('traînée d’un PNJ (pas un observateur du groupe) : rien n’est exploré', async () => {
    const { map, base, goblin } = await dungeon();
    await work(map.id);
    const before = (await read(gm, map.id))!;
    const res = await h.ok<{ version: number }>(gm, 'POST', `${base}/exploration/trail`, {
      trails: [{ tokenId: goblin.id, points: [{ x: 800, y: 800 }] }],
    });
    expect(res.version).toBe(before.version);
    expect(explored((await read(gm, map.id))!, 800, 800)).toBe(false);
  });

  it('MJ : révéler, oublier (annulation exacte), grille changée, réinitialiser', async () => {
    const { map, base } = await dungeon();
    await work(map.id);
    let e = (await read(gm, map.id))!;
    const v0 = e.version;
    // Révéler le coin haut droit (8 × 8 cases)
    const cells = new Uint8Array(64).fill(1);
    const window = encodeWindow({ x: 32, y: 0, w: 8, h: 8, cells });
    e = (
      await h.ok<{ exploration: Exploration }>(gm, 'POST', `${base}/exploration`, {
        op: 'reveal',
        cols: 40,
        rows: 40,
        window,
      })
    ).exploration;
    expect(e.version).toBe(v0 + 1);
    expect(explored(e, 950, 50)).toBe(true);
    const [, ev] = await events('map.exploration_updated');
    expect(decodeWindow(ev!.payload.window as EncodedWindow)).toMatchObject({ x: 32, y: 0 });
    // Oublier
    e = (
      await h.ok<{ exploration: Exploration }>(gm, 'POST', `${base}/exploration`, {
        op: 'forget',
        cols: 40,
        rows: 40,
        window,
      })
    ).exploration;
    expect(explored(e, 950, 50)).toBe(false);
    // Grille attendue fausse : 409 ; joueur : 403
    const stale = await h.request(gm, 'POST', `${base}/exploration`, {
      op: 'reveal',
      cols: 41,
      rows: 40,
      window,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('exploration_grid_changed');
    const player = await h.request(alice, 'POST', `${base}/exploration`, { op: 'reset' });
    expect(player.statusCode).toBe(403);
    const invalid = await h.request(gm, 'POST', `${base}/exploration`, {
      op: 'reveal',
      cols: 40,
      rows: 40,
      window: { ...window, w: 9 },
    });
    expect(invalid.statusCode).toBe(422);
    // Réinitialiser : tout à zéro, puis ce que le groupe voit est exploré de nouveau
    e = (
      await h.ok<{ exploration: Exploration }>(gm, 'POST', `${base}/exploration`, { op: 'reset' })
    ).exploration;
    expect(maskOf(e).count()).toBe(0);
    expect(await queued(map.id)).toBe(true);
    await work(map.id);
    e = (await read(gm, map.id))!;
    expect(explored(e, 100, 500)).toBe(true);
    expect(maskOf(e).count()).toBeLessThan(40 * 40);
  });

  it('exploration coupée : rien en file, rien de lisible ; réactivée, le groupe explore', async () => {
    const { map, base, hero } = await dungeon({ exploration: 'off' });
    expect(map.exploration).toBe('off');
    expect(await queued(map.id)).toBe(false);
    await h.ok(alice, 'POST', `${base}/tokens/move`, {
      moves: [{ tokenId: hero.id, pos: { x: 120, y: 500 } }],
    });
    expect(await queued(map.id)).toBe(false);
    expect(await read(alice, map.id)).toBeNull();
    const off = await h.request(gm, 'POST', `${base}/exploration`, { op: 'reset' });
    expect(off.json().code).toBe('exploration_off');
    expect(
      (
        await h.ok<{ version: number | null }>(alice, 'POST', `${base}/exploration/trail`, {
          trails: [{ tokenId: hero.id, points: [{ x: 100, y: 100 }] }],
        })
      ).version,
    ).toBeNull();
    await h.ok(gm, 'PATCH', url(`/maps/${map.id}`), { exploration: 'party' });
    expect(await queued(map.id)).toBe(true);
    await work(map.id);
    expect(explored((await read(alice, map.id))!, 120, 500)).toBe(true);
  });

  it('scène cachée aux joueurs : l’événement ne part qu’à ceux qui y sont', async () => {
    const { map } = await dungeon({ visibleToPlayers: false });
    await work(map.id);
    const [ev] = await events('map.exploration_updated');
    expect(ev!.visibility).toBe('gm_only');
    expect(ev!.payload.visibleToUsers).toEqual([alice.id]);
    const res = await h.request(bob, 'GET', url(`/maps/${map.id}/exploration`));
    expect(res.statusCode).toBe(404);
  });

  it('grille : un quart de case, gardée telle quelle par le masque', () => {
    expect(explorationGrid(1000, 1000, 100)).toEqual({ cols: 40, rows: 40 });
    expect(ExplorationMask.empty({ cols: 40, rows: 40 }).count()).toBe(0);
  });
});
