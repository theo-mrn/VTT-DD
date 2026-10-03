/**
 * Réglages de table : lecture par les membres, écriture par le MJ avec la
 * version lue, attributs retirés limités aux attributs jetables du système,
 * événement dans l'outbox.
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

interface Settings {
  version: number;
  dice: { hiddenAttributes: string[] };
  rules: { options: Record<string, boolean> };
  updatedAt: string | null;
}

describe.skipIf(!TEST_DATABASE_URL)('campagnes : réglages de table', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let outsider: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user('Maître');
    alice = await t.user('Alice');
    outsider = await t.user('Inconnu');
  });

  afterEach(async () => {
    await t.close();
  });

  const events = async (campaignId: string) =>
    (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`)
        .orderBy(outbox.id)
    ).map((e) => e.envelope as { type: string; payload: Record<string, unknown> });

  it('défauts, puis attributs retirés par le MJ et lus par la table', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const url = `/v1/campaigns/${id}/settings`;

    expect(await h.ok<Settings>(alice, 'GET', url)).toEqual({
      version: 0,
      dice: { hiddenAttributes: [] },
      rules: { options: {} },
      updatedAt: null,
    });

    const saved = await h.ok<Settings>(gm, 'PATCH', url, {
      version: 0,
      dice: { hiddenAttributes: ['INIT', 'Magie', 'INIT'] },
    });
    expect(saved).toMatchObject({ version: 1, dice: { hiddenAttributes: ['INIT', 'Magie'] } });
    expect(saved.updatedAt).not.toBeNull();
    expect(await h.ok<Settings>(alice, 'GET', url)).toEqual(saved);

    const last = (await events(id)).at(-1)!;
    expect(last.type).toBe('campaign.settings_updated');
    expect(last.payload).toMatchObject({
      version: 1,
      dice: { hiddenAttributes: ['INIT', 'Magie'] },
    });
    expect((last.payload.changes as unknown[]).length).toBeGreaterThan(0);

    // Tout remettre : liste vide
    const reset = await h.ok<Settings>(gm, 'PATCH', url, {
      version: 1,
      dice: { hiddenAttributes: [] },
    });
    expect(reset).toMatchObject({ version: 2, dice: { hiddenAttributes: [] } });
  });

  it('version périmée : 409, rien n’est écrit', async () => {
    const id = await h.campaign(gm);
    const url = `/v1/campaigns/${id}/settings`;
    await h.ok(gm, 'PATCH', url, { version: 0, dice: { hiddenAttributes: ['FOR'] } });
    const stale = await h.request(gm, 'PATCH', url, {
      version: 0,
      dice: { hiddenAttributes: ['DEX'] },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'version_conflict' });
    expect((await h.ok<Settings>(gm, 'GET', url)).dice.hiddenAttributes).toEqual(['FOR']);
  });

  it('on ne retire qu’un attribut jetable du système', async () => {
    const id = await h.campaign(gm);
    const url = `/v1/campaigns/${id}/settings`;
    // Défense ne sert pas aux jets en D&D ; INCONNU n'existe pas
    const res = await h.request(gm, 'PATCH', url, {
      version: 0,
      dice: { hiddenAttributes: ['FOR', 'Defense', 'INCONNU'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'not_rollable' });

    // Star Wars : aucun attribut jetable, rien à retirer
    const sw = await h.campaign(gm, 'star-wars-eote');
    const swRes = await h.request(gm, 'PATCH', `/v1/campaigns/${sw}/settings`, {
      version: 0,
      dice: { hiddenAttributes: ['vigueur'] },
    });
    expect(swRes.statusCode).toBe(400);
    expect(
      await h.ok(gm, 'PATCH', `/v1/campaigns/${sw}/settings`, {
        version: 0,
        dice: { hiddenAttributes: [] },
      }),
    ).toMatchObject({ version: 1 });
  });

  it('réservé au MJ ; introuvable hors de la campagne', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const url = `/v1/campaigns/${id}/settings`;
    const player = await h.request(alice, 'PATCH', url, {
      version: 0,
      dice: { hiddenAttributes: ['FOR'] },
    });
    expect(player.statusCode).toBe(403);
    expect((await h.request(outsider, 'GET', url)).statusCode).toBe(404);
    expect(
      (await h.request(outsider, 'PATCH', url, { version: 0, dice: { hiddenAttributes: [] } }))
        .statusCode,
    ).toBe(404);
  });

  it('changement de système : les retraits qui ne valent plus sont ignorés', async () => {
    const id = await h.campaign(gm);
    const url = `/v1/campaigns/${id}/settings`;
    await h.ok(gm, 'PATCH', url, { version: 0, dice: { hiddenAttributes: ['Contact'] } });
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}`, { systemId: 'star-wars-eote' });
    expect(await h.ok<Settings>(gm, 'GET', url)).toMatchObject({
      version: 1,
      dice: { hiddenAttributes: [] },
    });
  });
});
