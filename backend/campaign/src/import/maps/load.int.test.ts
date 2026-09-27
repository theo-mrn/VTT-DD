/**
 * Chargement d'une carte migrée sur un vrai PostgreSQL : contraintes
 * respectées, import rejouable sans doublon, carte lisible par l'API.
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
import type { FirestoreDoc } from '../legacy.js';
import { existing, loadMaps, produced } from './load.js';
import { legacyUuid, transformRoom } from './transform.js';

const doc = (path: string, data: Record<string, unknown>): FirestoreDoc => ({
  path,
  id: path.split('/').pop()!,
  data,
});

describe.skipIf(!TEST_DATABASE_URL)('import des cartes', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user();
    alice = await t.user();
  });

  afterEach(async () => {
    await t.close();
  });

  it('écrit la carte une seule fois et la rend lisible par l’API', async () => {
    const campaignId = await h.campaign(gm, 'dnd-classic', [alice]);
    const hero = await h.engage(campaignId, alice);
    const orc = await h.engage(campaignId, gm, { side: 'enemies' });
    // Code de salle propre au test : les identifiants dérivés ne se croisent pas
    const R = `T${crypto.randomUUID().slice(0, 8)}`;
    const docs = [
      doc(`cartes/${R}/groups/g1`, { name: 'Donjon' }),
      doc(`cartes/${R}/cities/c1`, { name: 'Taverne', groupId: 'g1', spawnX: 1, spawnY: 2 }),
      doc(`cartes/${R}/cities/c2`, { name: 'Route' }),
      doc(`cartes/${R}/settings/general`, { currentCityId: 'c1', pixelsPerUnit: 40 }),
      doc(`cartes/${R}/fog/fog_c1`, { grid: { '0,0 ': true } }),
      doc(`cartes/${R}/characters/hero`, {
        type: 'joueurs',
        x: 10,
        y: 10,
        positions: { c2: { x: 3, y: 4 } },
      }),
      doc(`cartes/${R}/characters/orc`, {
        type: 'pnj',
        cityId: 'c1',
        x: 900,
        y: 900,
        visibility: 'hidden',
      }),
      doc(`cartes/${R}/objects/o1`, { cityId: 'c1', x: 1, y: 1, imageUrl: 'https://a.test/x.png' }),
      doc(`cartes/${R}/portals/p1`, { cityId: 'c1', x: 5, y: 5, targetSceneId: 'c2' }),
    ];
    const migrated = transformRoom(
      R,
      docs,
      {
        obstacles: {
          w: {
            type: 'wall',
            cityId: 'c1',
            points: [
              { x: 0, y: 0 },
              { x: 9, y: 9 },
            ],
          },
        },
        drawings: {
          d: {
            cityId: null,
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
          },
        },
        measurements: {
          m: {
            type: 'circle',
            permanent: true,
            cityId: 'c1',
            start: { x: 0, y: 0 },
            end: { x: 3, y: 4 },
          },
        },
      },
      {
        campaignId,
        ownerId: gm.id,
        characters: new Map([
          [`cartes/${R}/characters/hero`, { id: hero, engaged: true }],
          [`cartes/${R}/characters/orc`, { id: orc, engaged: true }],
        ]),
      },
    );
    expect(migrated.warnings).toEqual([]);

    const first = await loadMaps(t.db!, campaignId, migrated, crypto.randomUUID());
    expect(first).toEqual(produced(migrated));
    expect(first).toMatchObject({ maps: 3, tokens: 3, fog: 1, settings: 1, portals: 1 });
    const again = await loadMaps(t.db!, campaignId, migrated, crypto.randomUUID());
    expect(Object.values(again).every((n) => n === 0)).toBe(true);
    expect(await existing(t.db!, migrated)).toEqual(produced(migrated));
    const imported = await t
      .db!.select()
      .from(outbox)
      .where(
        sql`${outbox.envelope}->>'roomId' = ${campaignId} and ${outbox.envelope}->>'type' = 'map.imported'`,
      );
    expect(imported).toHaveLength(1);

    // Lu par l'API : le héros est dans la scène du groupe, l'orque caché hors de sa vue
    const taverne = legacyUuid(`cartes/${R}/cities/c1`);
    const snap = await h.ok<{
      tokens: { characterId: string; pos: unknown }[];
      fog: { cells: string[] };
      portals: { targetMapId: string }[];
    }>(alice, 'GET', `/v1/campaigns/${campaignId}/maps/${taverne}`);
    expect(snap.tokens.map((x) => x.characterId)).toEqual([hero]);
    expect(snap.fog.cells).toEqual(['0,0']);
    expect(snap.portals[0]!.targetMapId).toBe(legacyUuid(`cartes/${R}/cities/c2`));
    const settings = await h.ok<{ partyMapId: string }>(
      alice,
      'GET',
      `/v1/campaigns/${campaignId}/map-settings`,
    );
    expect(settings.partyMapId).toBe(taverne);
  });
});
