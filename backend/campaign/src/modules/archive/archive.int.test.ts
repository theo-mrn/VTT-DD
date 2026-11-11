/**
 * Archive d'une campagne, part de campaign (docs/export-campagne.md § 5) : instantané des
 * tables, puis import sous de nouveaux identifiants (comme le fera le service archive) pour un
 * autre MJ ; données des joueurs écartées, liens hors archive coupés, retrait d'un import manqué.
 */
import { ArchiveServiceSnapshot, remapIds, rowIds, uuidv7, type ArchiveRows } from '@vtt/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  helpers,
  SECRET,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

const internal = { 'x-internal-secret': SECRET };

describe.skipIf(!TEST_DATABASE_URL)('archive (campaign)', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let heir: TestUser;

  beforeEach(async () => {
    t = await testApp({ LOG_LEVEL: process.env.ARCHIVE_DEBUG ? 'error' : 'silent' });
    h = helpers(t);
    gm = await t.user();
    alice = await t.user();
    heir = await t.user();
  });

  afterEach(async () => {
    await t.close();
  });

  async function snapshot(campaignId: string, keepProgress: boolean) {
    const res = await t.app.inject({
      method: 'GET',
      url: `/internal/campaigns/${campaignId}/archive?keepProgress=${keepProgress}`,
      headers: internal,
    });
    expect(res.statusCode, res.body).toBe(200);
    return ArchiveServiceSnapshot.extend({ gmIds: z.array(z.uuid()) }).parse(res.json());
  }

  /** Comme le service archive : nouveaux identifiants partout, puis import. */
  async function reimport(
    campaignId: string,
    tables: Record<string, ArchiveRows>,
    foreign: string[],
    keepProgress = true,
  ) {
    const ids = new Map(
      [...rowIds(Object.values(tables)), campaignId, ...foreign].map((id) => [id, uuidv7()]),
    );
    const newId = ids.get(campaignId)!;
    const res = await t.app.inject({
      method: 'POST',
      url: `/internal/campaigns/${newId}/archive`,
      headers: internal,
      payload: {
        schemaVersion: '0040',
        tables: remapIds(tables, ids),
        ownerId: heir.id,
        options: { keepProgress },
        foreignIds: foreign.map((id) => ids.get(id)!),
      },
    });
    return { res, newId, ids };
  }

  async function sampleCampaign() {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const hero = await h.engage(id, alice);
    await h.play(id, alice, hero);
    const map = await h.ok<{ id: string }>(gm, 'POST', `/v1/campaigns/${id}/maps`, {
      name: 'Crypte',
    });
    const base = `/v1/campaigns/${id}/maps/${map.id}`;
    await h.ok(gm, 'POST', `${base}/obstacles/batch`, {
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
      ],
    });
    await h.ok(gm, 'POST', `/v1/campaigns/${id}/notes`, {
      title: 'Secret du MJ',
      type: 'quest',
      content: '<p>Le liche dort.</p><script>alert(1)</script>',
    });
    await h.ok(alice, 'POST', `/v1/campaigns/${id}/notes`, { title: 'Journal d’Alice' });
    return { id, hero, map: map.id };
  }

  it('exige le secret interne', async () => {
    const { id } = await sampleCampaign();
    const res = await t.app.inject({
      method: 'GET',
      url: `/internal/campaigns/${id}/archive?keepProgress=true`,
      headers: gm.auth,
    });
    expect(res.statusCode).toBe(401);
  });

  it('exporte le contenu du MJ, sans les données des joueurs', async () => {
    const { id, hero } = await sampleCampaign();
    const snap = await snapshot(id, true);
    expect(snap.schemaVersion).toBe('0040');
    expect(snap.gmIds).toEqual([gm.id]);
    expect(snap.tables.campaigns).toHaveLength(1);
    expect(snap.tables.maps).toHaveLength(1);
    expect(snap.tables.map_obstacles).toHaveLength(2);
    expect(snap.tables.notes!.map((n) => n.title)).toEqual(['Secret du MJ']);
    expect(snap.tables.campaign_characters!.map((c) => c.characterId)).toEqual([hero]);
    for (const absent of ['campaign_members', 'campaign_messages', 'note_pins'])
      expect(snap.tables[absent]).toBeUndefined();
  });

  it('réimporte pour un autre MJ, sous de nouveaux identifiants', async () => {
    const { id, hero } = await sampleCampaign();
    const snap = await snapshot(id, true);
    const { res, newId, ids } = await reimport(id, snap.tables, [hero]);
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().written).toMatchObject({ campaigns: 1, maps: 1, map_obstacles: 2, notes: 1 });

    const copy = await h.ok<{ id: string; name: string; code: string; role: string }>(
      heir,
      'GET',
      `/v1/campaigns/${newId}`,
    );
    expect(copy).toMatchObject({ id: newId, name: 'La Table', role: 'gm' });
    expect((await h.request(gm, 'GET', `/v1/campaigns/${newId}`)).statusCode).toBe(404);

    const { items: maps } = await h.ok<{ items: { name: string }[] }>(
      heir,
      'GET',
      `/v1/campaigns/${newId}/maps`,
    );
    expect(maps.map((m) => m.name)).toEqual(['Crypte']);

    // Personnage d'Alice : désormais au MJ qui importe, incarné par personne
    const again = await snapshot(newId, true);
    expect(again.tables.campaign_characters).toMatchObject([
      { characterId: ids.get(hero), ownerId: heir.id, playedBy: null },
    ]);
    // Note réassainie à l'import
    expect(again.tables.notes![0]!.content).not.toContain('<script');

    // L'original n'a pas bougé
    expect((await snapshot(id, true)).tables.map_obstacles).toHaveLength(2);
  });

  it('coupe ce qui vise hors de l’archive, refuse un second import', async () => {
    const { id, hero } = await sampleCampaign();
    const snap = await snapshot(id, true);
    const otherCampaign = await h.campaign(heir);
    const elsewhere = await h.ok<{ id: string }>(
      heir,
      'POST',
      `/v1/campaigns/${otherCampaign}/maps`,
      {
        name: 'Ailleurs',
      },
    );
    // Un mur rattaché à la carte d'une autre campagne : écarté
    const tables = {
      ...snap.tables,
      map_obstacles: [
        ...snap.tables.map_obstacles!,
        { ...snap.tables.map_obstacles![0]!, id: uuidv7(), mapId: elsewhere.id },
      ],
    };
    const { res, newId, ids } = await reimport(id, tables, [hero]);
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().written.map_obstacles).toBe(2);

    const again = await t.app.inject({
      method: 'POST',
      url: `/internal/campaigns/${newId}/archive`,
      headers: internal,
      payload: {
        schemaVersion: '0040',
        tables: remapIds(snap.tables, ids),
        ownerId: heir.id,
        options: { keepProgress: true },
        foreignIds: [ids.get(hero)],
      },
    });
    expect(again.statusCode).toBe(409);
  });

  it('retire un import manqué, seulement pour qui l’a importé', async () => {
    const { id, hero } = await sampleCampaign();
    const { newId } = await reimport(id, (await snapshot(id, false)).tables, [hero], false);
    const del = (userId: string) =>
      t.app.inject({
        method: 'DELETE',
        url: `/internal/campaigns/${newId}/archive?userId=${userId}`,
        headers: internal,
      });
    expect((await del(gm.id)).statusCode).toBe(403);
    expect((await del(heir.id)).statusCode).toBe(204);
    expect((await h.request(heir, 'GET', `/v1/campaigns/${newId}`)).statusCode).toBe(404);
  });
});
