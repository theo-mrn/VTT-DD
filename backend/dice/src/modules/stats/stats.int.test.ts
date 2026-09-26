/**
 * Statistiques sur un vrai PostgreSQL : seuls les jets dont l'appelant voit
 * le résultat comptent.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';
import type { Stats } from './index.js';

describe.skipIf(!TEST_DATABASE_URL)('statistiques', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let campaignId: string;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user('Maître');
    alice = await t.user('Alice');
    bob = await t.user('Bob');
    campaignId = t.services.campaign({ [gm.id]: 'gm', [alice.id]: 'player', [bob.id]: 'player' });
  });

  afterEach(async () => {
    await t.close();
  });

  const stats = (u: TestUser, query: string) => h.ok<Stats>(u, 'GET', `/v1/dice/stats?${query}`);

  it('par joueur et global, selon la visibilité', async () => {
    t.dice.force(20);
    await h.roll(alice, { notation: '1d20', campaignId });
    t.dice.force(1);
    await h.roll(alice, { notation: '1d20', campaignId, isBlind: true });
    t.dice.force(3, 4);
    await h.roll(bob, { notation: '2d6+1', campaignId });
    t.dice.force(4, 2, 2);
    t.services.setSystem(campaignId, 'star-wars-eote');
    await h.roll(bob, { notation: '2aptitude 1difficulte', campaignId });

    // Le MJ voit tout (sauf les dés à symboles, sans valeur numérique)
    const all = await stats(gm, `campaignId=${campaignId}`);
    expect(all.rollCount).toBe(3);
    expect(all.diceTypes).toEqual(['1d20', '2d6']);
    const a = all.players.find((p) => p.userId === alice.id)!;
    expect(a).toMatchObject({
      userName: 'Alice',
      totalRolls: 2,
      criticalSuccesses: 1,
      criticalFailures: 1,
      rollDistribution: { 1: 1, 20: 1 },
    });

    // Bob ne voit pas le résultat du jet caché d'Alice
    const forBob = await stats(bob, `campaignId=${campaignId}&diceType=1d20`);
    expect(forBob.rollCount).toBe(1);
    expect(forBob.players[0]!.criticalFailures).toBe(0);
    // Alice non plus (jet caché au MJ)
    expect((await stats(alice, `campaignId=${campaignId}&faces=20`)).rollCount).toBe(1);

    // Filtre par joueur : évolution de ses jets
    const bobOnly = await stats(gm, `campaignId=${campaignId}&userId=${bob.id}`);
    expect(bobOnly.timeline).toEqual([{ roll: 1, total: 3.5, notation: '2d6+1' }]);
  });

  it('sans campagne : ses propres jets seulement', async () => {
    t.dice.force(6);
    await h.roll(alice, { notation: '1d6' });
    t.dice.force(5);
    await h.roll(alice, { notation: '1d6', campaignId });
    const mine = await stats(alice, 'faces=6');
    expect(mine.rollCount).toBe(2);
    expect(mine.streak).toEqual({ direction: 'high', length: 2 });
    const res = await h.request(alice, 'GET', `/v1/dice/stats?userId=${bob.id}`);
    expect([res.statusCode, res.json().code]).toEqual([403, 'campaign_required']);
    const outsider = await t.user('Ève');
    expect(
      (await h.request(outsider, 'GET', `/v1/dice/stats?campaignId=${campaignId}`)).statusCode,
    ).toBe(404);
  });
});
