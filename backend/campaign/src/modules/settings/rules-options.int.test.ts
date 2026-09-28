/**
 * Règles optionnelles de la campagne (`rules.options` des réglages de table) : réglées
 * par le MJ parmi celles que le système déclare, gardées en écarts au défaut, lues par
 * character sur sa route interne pour calculer les fiches.
 *
 * Le catalogue de test ajoute deux options à D&D, pour ne pas dépendre des données.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import { referenceCatalog, type Catalog } from '../../systems/catalog.js';
import {
  helpers,
  SECRET,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

interface Settings {
  version: number;
  dice: { hiddenAttributes: string[] };
  rules: { options: Record<string, boolean> };
  updatedAt: string | null;
}

const reference = referenceCatalog();
const catalog: Catalog = {
  system(id) {
    const s = reference.system(id);
    return s && id === 'dnd-classic'
      ? {
          ...s,
          options: [
            { id: 'encombrement', default: false },
            { id: 'reposComplet', default: true },
          ],
        }
      : s;
  },
};

describe.skipIf(!TEST_DATABASE_URL)('campagnes : règles optionnelles', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;

  beforeEach(async () => {
    t = await testApp({}, { catalog });
    h = helpers(t);
    gm = await t.user('Maître');
    alice = await t.user('Alice');
  });

  afterEach(async () => {
    await t.close();
  });

  const lastEvent = async (campaignId: string) =>
    (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`)
        .orderBy(outbox.id)
    )
      .map((e) => e.envelope as { type: string; payload: Record<string, unknown> })
      .at(-1)!;

  const internal = (characterId: string, headers = { 'x-internal-secret': SECRET }) =>
    t.app.inject({ method: 'GET', url: `/internal/characters/${characterId}/rules`, headers });

  it('le MJ allume une option, la table la lit, seuls les écarts au défaut sont gardés', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const url = `/v1/campaigns/${id}/settings`;
    expect((await h.ok<Settings>(alice, 'GET', url)).rules).toEqual({ options: {} });

    const saved = await h.ok<Settings>(gm, 'PATCH', url, {
      version: 0,
      rules: { options: { encombrement: true, reposComplet: true } },
    });
    expect(saved).toMatchObject({ version: 1, rules: { options: { encombrement: true } } });
    expect(await h.ok<Settings>(alice, 'GET', url)).toEqual(saved);

    const event = await lastEvent(id);
    expect(event.type).toBe('campaign.settings_updated');
    expect(event.payload).toMatchObject({
      version: 1,
      rules: { options: { encombrement: true } },
    });

    // Les options envoyées sont réglées, les autres gardent leur valeur
    const next = await h.ok<Settings>(gm, 'PATCH', url, {
      version: 1,
      rules: { options: { reposComplet: false } },
    });
    expect(next.rules.options).toEqual({ encombrement: true, reposComplet: false });
    // Revenue à son défaut, une option n'est plus enregistrée ; le lanceur n'a pas bougé
    const back = await h.ok<Settings>(gm, 'PATCH', url, {
      version: 2,
      rules: { options: { encombrement: false } },
    });
    expect(back).toMatchObject({
      version: 3,
      dice: { hiddenAttributes: [] },
      rules: { options: { reposComplet: false } },
    });
  });

  it('refus : option inconnue du système (400), joueur (403), version périmée (409)', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const url = `/v1/campaigns/${id}/settings`;
    const unknown = await h.request(gm, 'PATCH', url, {
      version: 0,
      rules: { options: { encombrement: true, verrouRang: true } },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ code: 'unknown_option' });
    const player = await h.request(alice, 'PATCH', url, {
      version: 0,
      rules: { options: { encombrement: true } },
    });
    expect(player.statusCode).toBe(403);
    const invalid = await h.request(gm, 'PATCH', url, {
      version: 0,
      rules: { options: { encombrement: 'oui' } },
    });
    expect(invalid.statusCode).toBe(400);
    await h.ok(gm, 'PATCH', url, { version: 0, rules: { options: { encombrement: true } } });
    const stale = await h.request(gm, 'PATCH', url, {
      version: 0,
      rules: { options: { encombrement: false } },
    });
    expect(stale.statusCode).toBe(409);
    expect((await h.ok<Settings>(gm, 'GET', url)).rules.options).toEqual({ encombrement: true });
  });

  it('changement de système : les options qu’il ne déclare pas sont ignorées', async () => {
    const id = await h.campaign(gm);
    const url = `/v1/campaigns/${id}/settings`;
    await h.ok(gm, 'PATCH', url, { version: 0, rules: { options: { encombrement: true } } });
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}`, { systemId: 'star-wars-eote' });
    expect((await h.ok<Settings>(gm, 'GET', url)).rules).toEqual({ options: {} });
  });

  it('route interne : options de la campagne du personnage, aucune hors campagne', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const hero = await h.engage(id, alice);
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}/settings`, {
      version: 0,
      rules: { options: { encombrement: true } },
    });

    const res = await internal(hero);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ campaignId: id, options: { encombrement: true } });

    // Secret exigé
    expect((await internal(hero, { 'x-internal-secret': 'faux' })).statusCode).toBe(401);
    // Personnage engagé nulle part : pas de campagne, pas d'option
    const alone = crypto.randomUUID();
    expect((await internal(alone)).json()).toEqual({ campaignId: null, options: {} });

    // Engagé ensuite dans une autre campagne : la première fait foi
    const other = await h.campaign(alice);
    await h.ok(alice, 'POST', `/v1/campaigns/${other}/characters`, { characterId: hero });
    expect((await internal(hero)).json()).toEqual({
      campaignId: id,
      options: { encombrement: true },
    });
  });
});
