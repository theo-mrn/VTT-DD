/**
 * Routes internes (appelées par character) : secret exigé, droits d'un
 * utilisateur dans une campagne et sur un personnage engagé.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  helpers,
  SECRET,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

const internal = { 'x-internal-secret': SECRET };

describe.skipIf(!TEST_DATABASE_URL)('routes internes', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user();
    alice = await t.user();
    bob = await t.user();
  });

  afterEach(async () => {
    await t.close();
  });

  const get = (url: string, headers: Record<string, string> = internal) =>
    t.app.inject({ method: 'GET', url, headers });

  it('exigent le secret interne (401), ignorent un jeton utilisateur', async () => {
    const id = await h.campaign(gm);
    const hero = await h.engage(id, gm);
    const urls = [
      `/internal/campaigns/${id}/rights?userId=${gm.id}&characterId=${hero}`,
      `/internal/characters/${hero}/campaigns-of?userId=${gm.id}`,
    ];
    for (const headers of <Record<string, string>[]>[
      {},
      { 'x-internal-secret': 'mauvais-secret-mauvais-secret-mauvais' },
      { 'x-internal-secret': SECRET.slice(0, -1) },
      gm.auth,
    ]) {
      for (const url of urls) expect((await get(url, headers)).statusCode, url).toBe(401);
    }
    for (const url of urls) expect((await get(url)).statusCode, url).toBe(200);
    // Le secret est vérifié avant la validation : un paramètre invalide sans secret reste 401
    expect((await get(`/internal/campaigns/pas-un-uuid/rights`, {})).statusCode).toBe(401);
    expect((await get(`/internal/campaigns/pas-un-uuid/rights?userId=x`)).statusCode).toBe(400);
  });

  it('sans INTERNAL_API_SECRET configuré, les routes n’existent pas (404)', async () => {
    const bare = await testApp({ INTERNAL_API_SECRET: '' });
    try {
      const u = await bare.user();
      for (const url of [
        `/internal/campaigns/${crypto.randomUUID()}/rights?userId=${u.id}`,
        `/internal/characters/${crypto.randomUUID()}/campaigns-of?userId=${u.id}`,
      ]) {
        for (const headers of [internal, {}]) {
          const res = await bare.app.inject({ method: 'GET', url, headers });
          expect(res.statusCode, url).toBe(404);
        }
      }
    } finally {
      await bare.close();
    }
  });

  it('droits dans une campagne : rôle, et lecture/écriture sur un personnage engagé', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    await h.ok(gm, 'PATCH', `/v1/campaigns/${id}/members/${bob.id}`, { role: 'spectator' });
    const hero = await h.engage(id, alice);
    const free = t.character.add({ ownerId: alice.id, systemId: 'dnd-classic' });
    const stranger = await t.user();
    const rights = async (u: TestUser, characterId?: string) => {
      const res = await get(
        `/internal/campaigns/${id}/rights?userId=${u.id.toUpperCase()}` +
          (characterId ? `&characterId=${characterId}` : ''),
      );
      expect(res.statusCode, res.body).toBe(200);
      return res.json() as unknown;
    };

    expect(await rights(gm)).toEqual({ member: true, role: 'gm' });
    expect(await rights(stranger)).toEqual({ member: false, role: null });
    expect(await rights(gm, hero)).toEqual({
      member: true,
      role: 'gm',
      character: { engaged: true, side: 'players', read: true, write: true },
    });
    expect(await rights(alice, hero)).toMatchObject({
      role: 'player',
      character: { read: true, write: true },
    });
    expect(await rights(bob, hero)).toMatchObject({
      role: 'spectator',
      character: { read: true, write: false },
    });
    expect(await rights(stranger, hero)).toEqual({
      member: false,
      role: null,
      character: { engaged: true, side: 'players', read: false, write: false },
    });
    // Personnage non engagé : aucun droit, même pour le MJ
    expect(await rights(gm, free)).toMatchObject({
      character: { engaged: false, side: null, read: false, write: false },
    });
    // Campagne inconnue : personne n'y est membre
    const unknown = await get(
      `/internal/campaigns/${crypto.randomUUID()}/rights?userId=${gm.id}&characterId=${hero}`,
    );
    expect(unknown.json()).toMatchObject({ member: false, character: { engaged: false } });
  });

  it('campaigns-of : réponse attendue par character, toutes campagnes confondues', async () => {
    const c1 = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const c2 = await h.campaign(bob, 'dnd-classic', [alice]);
    const hero = await h.engage(c1, alice);
    await h.ok(alice, 'POST', `/v1/campaigns/${c2}/characters`, { characterId: hero });
    const campaignsOf = async (u: TestUser) =>
      (await get(`/internal/characters/${hero}/campaigns-of?userId=${u.id}`)).json() as {
        read: boolean;
        write: boolean;
        campaigns: { campaignId: string; role: string }[];
      };

    // Bob est joueur dans c1 et MJ de c2 : il écrit grâce à c2
    const b = await campaignsOf(bob);
    expect(b).toMatchObject({ read: true, write: true });
    expect(b.campaigns).toEqual(
      expect.arrayContaining([
        { campaignId: c1, role: 'player' },
        { campaignId: c2, role: 'gm' },
      ]),
    );
    expect(await campaignsOf(gm)).toEqual({
      read: true,
      write: true,
      campaigns: [{ campaignId: c1, role: 'gm' }],
    });
    await h.ok(bob, 'DELETE', `/v1/campaigns/${c2}/characters/${hero}`);
    expect(await campaignsOf(bob)).toEqual({
      read: true,
      write: false,
      campaigns: [{ campaignId: c1, role: 'player' }],
    });
  });
});
