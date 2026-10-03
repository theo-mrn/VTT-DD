/**
 * Météo d'une scène (docs/carte.md § 10, Météo) sur un vrai PostgreSQL : écrite par le MJ,
 * lue par tous, diffusée par `map.updated` ; le vent est facultatif (données de l'ancienne app
 * sans vent) et borné.
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

describe.skipIf(!TEST_DATABASE_URL)('météo de la carte', () => {
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

  it('le MJ la règle (vent compris), tous la lisent, map.updated la porte', async () => {
    // Donnée de l'ancienne app : sans vent, intensité jusqu'à 10
    const map = await h.ok<Item>(gm, 'POST', url('/maps'), {
      name: 'Col enneigé',
      weather: { type: 'snow', intensity: 2 },
    });
    expect(map.weather).toEqual({ type: 'snow', intensity: 2 });
    const base = url(`/maps/${map.id}`);

    const weather = { type: 'blizzard', intensity: 0.8, wind: { direction: 135, strength: 0.9 } };
    const updated = await h.ok<Item>(gm, 'PATCH', base, { weather, version: map.version });
    expect(updated.weather).toEqual(weather);
    expect(updated.version).toBe(map.version + 1);
    expect((await h.ok<{ map: Item }>(alice, 'GET', base)).map.weather).toEqual(weather);

    const [event] = await t
      .db!.select({
        visibility: sql<string>`${outbox.envelope}->>'visibility'`,
        payload: sql<Record<string, unknown>>`${outbox.envelope}->'payload'`,
      })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->>'roomId' = ${campaignId} and ${outbox.envelope}->>'type' = 'map.updated'`,
      )
      .orderBy(sql`${outbox.id} desc`)
      .limit(1);
    expect(event).toMatchObject({ visibility: 'public', payload: { weather } });

    // Aucune : null ; un type inconnu est gardé (le client n'affiche rien)
    expect((await h.ok<Item>(gm, 'PATCH', base, { weather: null })).weather).toBeNull();
    const odd = { type: 'aurore', intensity: 0.4 };
    expect((await h.ok<Item>(gm, 'PATCH', base, { weather: odd })).weather).toEqual(odd);
  });

  it('refuse un vent hors bornes ou une clé inconnue ; un joueur ne la change pas', async () => {
    const map = await h.ok<Item>(gm, 'POST', url('/maps'), { name: 'Plaine' });
    const base = url(`/maps/${map.id}`);
    const bad = [
      { type: 'rain', intensity: 0.5, wind: { direction: 361, strength: 0.5 } },
      { type: 'rain', intensity: 0.5, wind: { direction: 90, strength: 1.5 } },
      { type: 'rain', intensity: 0.5, wind: { direction: 90 } },
      { type: 'rain', intensity: 11 },
      { type: 'rain', intensity: 0.5, lightning: true },
    ];
    for (const weather of bad)
      expect((await h.request(gm, 'PATCH', base, { weather })).statusCode).toBe(400);
    const rain = { type: 'rain', intensity: 0.5 };
    expect((await h.request(alice, 'PATCH', base, { weather: rain })).statusCode).toBe(403);
    expect((await h.ok<{ map: Item }>(gm, 'GET', base)).map.weather).toBeNull();
  });
});
