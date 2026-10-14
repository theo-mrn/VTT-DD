/**
 * Automatismes sur un vrai PostgreSQL : le MJ crée, modifie, liste et supprime ses réglages ;
 * paramètres et déclencheurs validés ; un joueur n'y a pas accès.
 */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe.skipIf(!TEST_DATABASE_URL)('automatismes', () => {
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

  const url = (rest = '') => `/v1/campaigns/${campaignId}/automations${rest}`;

  it('le MJ crée, modifie, liste et supprime un réglage', async () => {
    const map = await h.ok<Item>(gm, 'POST', `/v1/campaigns/${campaignId}/maps`, {
      name: 'Taverne',
    });
    const params = {
      music: { playlistId: randomUUID(), assetId: null },
      ambience: null,
      weather: { type: 'rain', intensity: 0.6 },
      mood: 'dark',
      effect: 'flash',
      time: { hour: 21, rate: 1 },
    };
    const created = await h.ok<Item>(gm, 'POST', url(), {
      name: 'Taverne, le soir',
      params,
      triggers: [{ type: 'scene.enter', mapId: map.id }, { type: 'combat.end' }],
      sceneIds: [map.id],
    });
    expect(created).toMatchObject({ name: 'Taverne, le soir', params, sceneIds: [map.id] });

    const updated = await h.ok<Item>(gm, 'PATCH', url(`/${created.id}`), {
      params: { mood: null },
      version: created.version,
    });
    expect(updated.params).toEqual({ mood: null });
    expect(updated.version).toBe(created.version + 1);

    const list = await h.ok<{ items: Item[] }>(gm, 'GET', url());
    expect(list.items.map((a) => a.id)).toEqual([created.id]);

    expect((await h.request(gm, 'DELETE', url(`/${created.id}`))).statusCode).toBe(204);
    expect((await h.ok<{ items: Item[] }>(gm, 'GET', url())).items).toEqual([]);
  });

  it('refuse un paramètre ou un déclencheur inconnu, et un joueur', async () => {
    for (const body of [
      { name: 'X', params: { volume: 2 } },
      { name: 'X', params: { music: { playlistId: randomUUID(), assetId: randomUUID() } } },
      { name: 'X', triggers: [{ type: 'dice.rolled' }] },
      { name: '' },
    ])
      expect((await h.request(gm, 'POST', url(), body)).statusCode).toBe(400);
    expect((await h.request(alice, 'GET', url())).statusCode).toBe(403);
    expect((await h.request(alice, 'POST', url(), { name: 'X' })).statusCode).toBe(403);
  });
});
