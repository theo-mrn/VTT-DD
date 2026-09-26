/** Routes internes : jets d'action transmis par character, accès à tous les skins (billing). */
import { and, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import {
  helpers,
  SECRET,
  TEST_DATABASE_URL,
  testApp,
  type RollBody,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

const internal = { 'x-internal-secret': SECRET };

describe.skipIf(!TEST_DATABASE_URL)('route interne /internal/rolls', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let campaignId: string;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user('Maître');
    alice = await t.user('Alice');
    campaignId = t.services.campaign({ [gm.id]: 'gm', [alice.id]: 'player' });
  });

  afterEach(async () => {
    await t.close();
  });

  const action = (body: Record<string, unknown>, headers: Record<string, string> = internal) =>
    t.app.inject({ method: 'POST', url: '/internal/rolls', headers, payload: body });

  const attack = () => ({
    campaignId,
    authorId: alice.id,
    characterId: crypto.randomUUID(),
    characterName: 'Aria',
    actionId: 'attaque',
    label: 'Attaque avec une arme',
    notation: '1d20 + @Contact',
    visibility: 'public',
    dice: [{ faces: 20, values: [{ value: 17, kept: true, exploded: false }] }],
    total: 22,
    outcome: { success: true, critical: false, fumble: false },
    explanations: ['Attaque : 1d20 (17) + 5 = 22 contre DEF 15 : touché'],
  });

  it('exige le secret interne ; enregistre le jet sous le nom du personnage', async () => {
    expect((await action(attack(), {})).statusCode).toBe(401);
    expect(
      (await action(attack(), { ...internal, 'x-internal-secret': 'x'.repeat(40) })).statusCode,
    ).toBe(401);
    const res = await action(attack());
    expect(res.statusCode).toBe(201);
    const [roll] = await h.ok<RollBody[]>(gm, 'GET', `/v1/dice/rolls?campaignId=${campaignId}`);
    expect(roll).toMatchObject({
      id: res.json().id,
      uid: alice.id,
      userName: 'Aria',
      source: 'action',
      type: 'Action',
      actionId: 'attaque',
      label: 'Attaque avec une arme',
      results: [17],
      total: 22,
      diceCount: 1,
      diceFaces: 20,
      output: 'Attaque : 1d20 (17) + 5 = 22 contre DEF 15 : touché',
      outcome: { success: true },
    });
  });

  it('refuse un auteur hors de la campagne ; sans campagne, jet personnel', async () => {
    const outsider = await t.user('Ève');
    let res = await action({ ...attack(), authorId: outsider.id });
    expect([res.statusCode, res.json().code]).toEqual([404, 'campaign_not_found']);
    const { campaignId: _c, ...personal } = attack();
    res = await action({ ...personal, explanations: [] });
    expect(res.statusCode).toBe(201);
    const [roll] = await h.ok<RollBody[]>(alice, 'GET', '/v1/dice/rolls');
    expect(roll).toMatchObject({ visibility: 'self', output: '[17] = 22' });
  });

  it('jet à symboles : résultat formaté avec le système', async () => {
    const res = await action({
      ...attack(),
      systemId: 'star-wars-eote',
      dice: [],
      total: undefined,
      explanations: [],
      symbols: {
        dice: [{ die: 'aptitude', face: 4, symbols: { succes: 2 } }],
        totals: { succes: 2 },
        results: { succesNets: 2 },
      },
    });
    expect(res.statusCode).toBe(201);
    const [roll] = await h.ok<RollBody[]>(alice, 'GET', `/v1/dice/rolls?campaignId=${campaignId}`);
    expect(roll).toMatchObject({
      symbolResult: '2 Succès',
      results: [4],
      total: 0,
      diceCount: 1,
      diceFaces: 8,
    });
  });

  it('accès à tous les skins (billing) : secret exigé, idempotent, événement', async () => {
    const url = `/internal/users/${alice.id}/all-skins`;
    const put = (allSkins: unknown, headers: Record<string, string> = internal) =>
      t.app.inject({ method: 'PUT', url, headers, payload: { allSkins } });
    const events = async () =>
      (
        await t
          .db!.select()
          .from(outbox)
          .where(
            and(
              eq(sql`${outbox.envelope}->>'type'`, 'dice.preferences_updated'),
              eq(sql`${outbox.envelope}->'payload'->>'userId'`, alice.id),
            ),
          )
      ).map((e) => e.envelope as { actor: { role: string }; payload: Record<string, unknown> });

    expect((await put(true, {})).statusCode).toBe(401);
    expect((await put('oui')).statusCode).toBe(400);
    expect(
      (
        await t.app.inject({
          method: 'PUT',
          url: '/internal/users/pas-un-uuid/all-skins',
          headers: internal,
          payload: { allSkins: true },
        })
      ).statusCode,
    ).toBe(400);

    let res = await put(true);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ skinId: 'gold', allSkins: true });
    await h.ok(alice, 'PATCH', '/v1/dice/me/preferences', { skinId: 'bismuth' });
    expect(await h.ok(alice, 'GET', '/v1/dice/me/preferences')).toMatchObject({
      skinId: 'bismuth',
      allSkins: true,
    });
    // Rejoué : aucune écriture, aucun événement
    await put(true);
    expect((await events()).filter((e) => e.actor.role === 'system')).toHaveLength(1);

    // Fin d'abonnement : le skin choisi n'est plus possédé, retour au skin par défaut
    res = await put(false);
    expect(res.json()).toMatchObject({ skinId: 'gold', allSkins: false });
    const system = (await events()).filter((e) => e.actor.role === 'system');
    expect(system.map((e) => e.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: alice.id, skinId: 'gold', allSkins: false }),
      ]),
    );
    expect(system).toHaveLength(2);
  });

  it('sans INTERNAL_API_SECRET configuré, la route n’existe pas', async () => {
    const bare = await testApp({ INTERNAL_API_SECRET: '' });
    try {
      const res = await bare.app.inject({
        method: 'POST',
        url: '/internal/rolls',
        headers: internal,
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await bare.close();
    }
  });
});
