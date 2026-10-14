/**
 * État des outils de table sur un vrai PostgreSQL : le MJ l'écrit, les joueurs le lisent sans
 * l'heure cachée ni les horloges secrètes, un joueur dépense un jeton, un spectateur non.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

interface State {
  worldTime: { minutes: number; visible: boolean; rate: number; anchorAt: string } | null;
  clocks: { id: string; visible: boolean; filled: number }[];
  timer: { endsAt: string | null; remainingMs: number } | null;
  fate: { count: number; max: number; last: { userId: string } | null } | null;
  mood: string | null;
  moods: Record<string, string>;
  personalMood: string | null;
  weathers: Record<string, unknown>;
  personalWeather: { weather: unknown } | null;
  paused: boolean;
  version: number;
}

describe.skipIf(!TEST_DATABASE_URL)('état de la table', () => {
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

  const url = (rest = '') => `/v1/campaigns/${campaignId}/table-state${rest}`;

  it('vide au départ ; le MJ écrit, chacun lit sa vue', async () => {
    const vide = await h.ok<State>(alice, 'GET', url());
    expect(vide).toMatchObject({
      worldTime: null,
      clocks: [],
      fate: null,
      paused: false,
      version: 0,
    });

    const ecrit = await h.ok<State>(gm, 'PATCH', url(), {
      worldTime: { minutes: 600, visible: false, rate: 60 },
      clocks: [
        { id: 'a', name: 'La garde', segments: 6, filled: 9, visible: true },
        { id: 'b', name: 'Le traître', segments: 4, filled: 1, visible: false },
      ],
      timer: { label: 'Pont', durationMs: 60_000, remainingMs: 30_000, running: true },
      fate: { count: 3, max: 5 },
      mood: 'danger',
      paused: true,
    });
    expect(ecrit.worldTime).toMatchObject({ minutes: 600, rate: 60 });
    expect(ecrit.clocks.find((c) => c.id === 'a')?.filled).toBe(6);
    expect(ecrit.timer?.endsAt).not.toBeNull();

    const joueur = await h.ok<State>(alice, 'GET', url());
    expect(joueur.worldTime).toBeNull();
    expect(joueur.clocks.map((c) => c.id)).toEqual(['a']);
    expect(joueur).toMatchObject({ mood: 'danger', paused: true, fate: { count: 3 } });
  });

  it('ambiance d’un seul joueur : lui seul la lit ; effet ponctuel ciblé validé', async () => {
    const bob = await t.user();
    const cid = await h.campaign(gm, 'dnd-classic', [alice, bob]);
    const u = `/v1/campaigns/${cid}/table-state`;
    await h.ok(gm, 'PATCH', u, { mood: 'dark', moods: { [alice.id]: 'dream' } });
    expect(await h.ok<State>(gm, 'GET', u)).toMatchObject({
      mood: 'dark',
      moods: { [alice.id]: 'dream' },
      personalMood: null,
    });
    expect(await h.ok<State>(alice, 'GET', u)).toMatchObject({
      mood: 'dark',
      moods: {},
      personalMood: 'dream',
    });
    expect(await h.ok<State>(bob, 'GET', u)).toMatchObject({ moods: {}, personalMood: null });

    // Météo d'un seul joueur : la sienne (temps clair compris), les autres suivent la scène
    await h.ok(gm, 'PATCH', u, {
      weathers: { [alice.id]: { type: 'snow', intensity: 1 }, [bob.id]: null },
    });
    expect(await h.ok<State>(alice, 'GET', u)).toMatchObject({
      weathers: {},
      personalWeather: { weather: { type: 'snow', intensity: 1 } },
    });
    expect(await h.ok<State>(bob, 'GET', u)).toMatchObject({ personalWeather: { weather: null } });

    const fx = `/v1/campaigns/${cid}/table-fx`;
    expect(
      (await h.request(gm, 'POST', fx, { effect: 'shake', userIds: [alice.id] })).statusCode,
    ).toBe(204);
    expect((await h.request(gm, 'POST', fx, { effect: 'shake', userIds: [] })).statusCode).toBe(
      400,
    );
    expect((await h.request(alice, 'POST', fx, { effect: 'shake' })).statusCode).toBe(403);
  });

  it('un joueur dépense un jeton, plus quand il n’y en a plus ; seul le MJ écrit', async () => {
    await h.ok(gm, 'PATCH', url(), { fate: { count: 1, max: 5 } });
    const apres = await h.ok<State>(alice, 'POST', url('/fate/spend'));
    expect(apres.fate).toMatchObject({ count: 0, last: { userId: alice.id } });
    expect((await h.request(alice, 'POST', url('/fate/spend'))).statusCode).toBe(409);
    expect((await h.request(alice, 'PATCH', url(), { paused: true })).statusCode).toBe(403);
    expect(
      (await h.request(gm, 'POST', `/v1/campaigns/${campaignId}/table-fx`, { effect: 'flash' }))
        .statusCode,
    ).toBe(204);
  });
});
