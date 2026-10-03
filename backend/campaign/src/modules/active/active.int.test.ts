/**
 * Salle active (docs/discord.md) sur un vrai PostgreSQL : choix parmi ses campagnes, refus hors
 * de ses campagnes, effacement quand on quitte la campagne ou qu'elle est supprimée.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('salle active', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let player: TestUser;
  let stranger: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user('Maître');
    player = await t.user('Aria');
    stranger = await t.user();
  });

  afterEach(async () => {
    await t.close();
  });

  const active = (u: TestUser) => h.request(u, 'GET', '/v1/campaigns/active');
  const choisir = (u: TestUser, campaignId: string) =>
    h.request(u, 'PUT', '/v1/campaigns/active', { campaignId });

  it('aucune au départ, puis celle choisie parmi ses campagnes, avec son rôle et son système', async () => {
    const dnd = await h.campaign(gm, 'dnd-classic', [player]);
    const starWars = await h.campaign(gm, 'star-wars-eote', [player]);
    expect((await active(player)).json().code).toBe('no_active_campaign');

    expect((await choisir(player, dnd)).statusCode).toBe(200);
    const res = await choisir(player, starWars);
    expect(res.json()).toMatchObject({ id: starWars, role: 'player' });

    const lue = (await active(player)).json();
    expect(lue).toMatchObject({ id: starWars, role: 'player' });
    expect(lue.system.id).toBe('star-wars-eote');

    // Le MJ a la sienne, indépendante
    expect((await choisir(gm, dnd)).json()).toMatchObject({ id: dnd, role: 'gm' });
    expect((await active(player)).json().id).toBe(starWars);
  });

  it('refuse une campagne dont on n’est pas membre, comme une campagne inconnue', async () => {
    const c = await h.campaign(gm);
    expect((await choisir(stranger, c)).statusCode).toBe(404);
    expect((await choisir(stranger, crypto.randomUUID())).statusCode).toBe(404);
    expect((await active(stranger)).statusCode).toBe(404);
  });

  it('s’efface quand le joueur quitte la campagne ou qu’elle est supprimée', async () => {
    const c1 = await h.campaign(gm, 'dnd-classic', [player]);
    await h.ok(player, 'PUT', '/v1/campaigns/active', { campaignId: c1 });
    await h.ok(player, 'DELETE', `/v1/campaigns/${c1}/members/${player.id}`);
    expect((await active(player)).statusCode).toBe(404);

    const c2 = await h.campaign(gm);
    await h.ok(gm, 'PUT', '/v1/campaigns/active', { campaignId: c2 });
    await h.ok(gm, 'DELETE', `/v1/campaigns/${c2}`);
    expect((await active(gm)).statusCode).toBe(404);
  });
});
