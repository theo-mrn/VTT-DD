// @vitest-environment jsdom
/**
 * Jets côté front : formules (écritures courantes, vérification, dés à lancer), service
 * (historique, lancer idempotent, effacer, statistiques), lancer avec dés 3D (faces lues
 * envoyées) ou sans (le serveur tire), historique en cache tenu à jour en direct.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render-hook';

type Handler = (body: Record<string, unknown> | undefined, url: string) => unknown;
const routes = vi.hoisted(() => new Map<string, Handler>());
const calls = vi.hoisted(
  () => [] as { method: string; url: string; body: unknown; headers: unknown }[],
);
const dice = vi.hoisted(() => ({
  faces: null as null | { type: string; value: number }[],
  roll3D: vi.fn(),
  sound: vi.fn(),
}));
const events = vi.hoisted(() => ({
  handler: null as null | ((e: unknown) => void),
  generation: 0,
}));
const toasts = vi.hoisted(() => vi.fn());

vi.mock('./api', async (importOriginal) => {
  const real = await importOriginal<typeof import('./api')>();
  return {
    ...real,
    api: vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body, headers: init.headers });
      const handler = routes.get(`${method} ${url.split('?')[0]}`);
      if (!handler) throw new Error(`Route non prévue : ${method} ${url}`);
      return handler(body, url);
    }),
  };
});
vi.mock('./dice-throw', () => ({
  roll3D: (...args: unknown[]) => {
    dice.roll3D(...args);
    return Promise.resolve(dice.faces);
  },
  setDiceSound: dice.sound,
}));
vi.mock('./realtime', () => ({
  useCampaignEvents: (_c: unknown, _t: unknown, handler: (e: unknown) => void) => {
    events.handler = handler;
    return { live: true, generation: events.generation };
  },
}));
vi.mock('./session', () => ({ useProfil: () => ({ id: 'moi' }) }));
vi.mock('sonner', () => ({ toast: toasts }));

import {
  appliquerEvenementDes,
  clesJets,
  desDeFormule,
  formuleMoteur,
  jets,
  marquerJetsPerimes,
  normaliserFormule,
  useEffacerJets,
  useJets,
  useLancer,
  useStatsJets,
  useSynchroJets,
  verifierFormule,
  type Jet,
} from './jets';
import { dicePreferencesKey } from './dice-preferences';

const roll = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  campaignId: 'camp',
  uid: 'bob',
  userName: 'Bob',
  userAvatar: null,
  persoId: null,
  total: 17,
  notation: '1d20+3',
  output: '14 + 3 = 17',
  symbolResult: null,
  source: '3d',
  visibility: 'public',
  hidden: false,
  label: null,
  dice: [{ faces: 20, values: [{ value: 14, kept: true, exploded: false }] }],
  outcome: { success: null, critical: false, fumble: false },
  createdAt: '',
  ...extra,
});

const event = (type: string, id: string) => ({
  seq: 1,
  redacted: false,
  event: { id: `e-${id}`, type, aggregate: { type: 'roll', id }, payload: {} },
});

beforeEach(() => {
  routes.clear();
  calls.length = 0;
  dice.faces = null;
  dice.roll3D.mockClear();
  toasts.mockClear();
  routes.set('GET /v1/dice/me/preferences', () => ({
    skinId: 'rubis',
    animation3d: true,
    sound: false,
    allSkins: false,
    inventory: [],
  }));
  routes.set('POST /v1/dice/rolls', (body) =>
    roll('r9', { notation: (body as { notation: string }).notation }),
  );
});
afterEach(() => vi.restoreAllMocks());

describe('formules', () => {
  it('écritures courantes : D20, d%, kh', () => {
    expect(normaliserFormule(' 2D20kh1 + d% ')).toBe('2d20k1 + d100');
    expect(formuleMoteur('D6')).toEqual({ ok: true, formule: 'd6' });
  });

  it('vérification : vide, illisible, sans personnage pour ses valeurs, valide', () => {
    expect(verifierFormule('  ')).toEqual({ ok: false, message: 'Formule vide', position: null });
    expect(verifierFormule('1d20+')).toMatchObject({ ok: false });
    expect(verifierFormule('1d20+@FOR')).toMatchObject({ ok: false });
    expect(verifierFormule('2d6+3')).toEqual({ ok: true });
  });

  it('dés à lancer : forme et nombre, dans l’ordre ; illisible : aucun', () => {
    expect(desDeFormule('2d6+1d20+4')).toEqual([
      { type: 'd6', count: 2 },
      { type: 'd20', count: 1 },
    ]);
    expect(desDeFormule('1d20+')).toEqual([]);
    expect(desDeFormule('1d20+@FOR')).toEqual([]);
  });
});

describe('service', () => {
  it('historique (campagne, page suivante), un jet, effacer, statistiques', async () => {
    routes.set('GET /v1/dice/rolls', () => [roll('r1', { hidden: true, total: null })]);
    routes.set('GET /v1/dice/rolls/r1', () => roll('r1', { outcome: { critical: true } }));
    routes.set('DELETE /v1/dice/rolls', () => ({ deleted: 3 }));
    routes.set('GET /v1/dice/stats', () => ({
      rollCount: 0,
      outcomes: { critical: 0, fumble: 0 },
      byFaces: [],
    }));
    const [j] = await jets.lister('camp', 'r5');
    expect(calls[0]!.url).toBe('/v1/dice/rolls?campaignId=camp&before=r5&limit=50');
    expect(j).toMatchObject({ total: null, hidden: true, critical: null });
    expect((await jets.un('r1')).critical).toBe('success');
    await jets.effacer(null);
    expect(calls.at(-1)!.url).toBe('/v1/dice/rolls');
    await jets.statistiques('camp');
    expect(calls.at(-1)!.url).toBe('/v1/dice/stats?campaignId=camp');
  });
});

describe('lancer', () => {
  it('dés 3D lus à l’arrêt : leurs faces partent au service avec une clé d’idempotence', async () => {
    dice.faces = [{ type: 'd20', value: 14, extra: 1 } as never];
    const r = await renderHook(() => useLancer());
    r.client.setQueryData(clesJets.liste('camp'), { pages: [[]], pageParams: [undefined] });
    const jet = await r.act(() =>
      r.result.current.mutateAsync({
        formula: 'D20+3',
        roomId: 'camp',
        visibility: 'private',
        label: '  Attaque  ',
        characterId: 'p1',
      }),
    );
    expect(dice.sound).toHaveBeenCalledWith(false);
    expect(dice.roll3D.mock.calls[0]![1]).toEqual({ enabled: true, blind: false, skinId: 'rubis' });
    const sent = calls.find((c) => c.method === 'POST')!;
    expect(sent.body).toEqual({
      notation: 'd20+3',
      campaignId: 'camp',
      visibility: 'private',
      characterId: 'p1',
      label: 'Attaque',
      physicalResults: [{ type: 'd20', value: 14 }],
    });
    expect(sent.headers).toMatchObject({ 'Idempotency-Key': expect.any(String) });
    expect(
      r.client.getQueryData<{ pages: Jet[][] }>(clesJets.liste('camp'))!.pages[0]![0]!.id,
    ).toBe(jet.id);
    await r.unmount();
  });

  it('hors campagne : jet personnel ; caché au MJ : les dés ne roulent pas pour l’auteur ; préférences illisibles : pas de 3D', async () => {
    const r = await renderHook(() => useLancer());
    await r.act(() => r.result.current.mutateAsync({ formula: '1d6' }));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ notation: '1d6' });
    await r.act(() =>
      r.result.current.mutateAsync({ formula: '1d6', roomId: 'camp', visibility: 'gm' }),
    );
    expect(dice.roll3D.mock.calls[1]![1]).toMatchObject({ blind: true });
    r.client.removeQueries({ queryKey: dicePreferencesKey });
    routes.set('GET /v1/dice/me/preferences', () => {
      throw new Error('réseau');
    });
    await r.act(() => r.result.current.mutateAsync({ formula: '1d6' }));
    expect(dice.roll3D.mock.calls[2]![1]).toMatchObject({ enabled: false });
    await r.unmount();
  });
});

describe('historique et statistiques', () => {
  it('pages de l’historique, statistiques du d20, effacer', async () => {
    routes.set('GET /v1/dice/rolls', () =>
      Array.from({ length: 50 }, (_, i) => roll(`r${100 - i}`)),
    );
    routes.set('GET /v1/dice/stats', () => ({
      rollCount: 4,
      outcomes: { critical: 1, fumble: 1 },
      byFaces: [
        {
          faces: 20,
          count: 4,
          sum: 42,
          distribution: [
            { value: 20, count: 1 },
            { value: 1, count: 1 },
            { value: 99, count: 1 },
          ],
        },
      ],
    }));
    routes.set('DELETE /v1/dice/rolls', () => ({ deleted: 50 }));
    const r = await renderHook(() => ({
      liste: useJets('camp'),
      stats: useStatsJets('camp'),
      effacer: useEffacerJets('camp'),
      inactif: useStatsJets(null, false),
    }));
    await r.waitFor(() => {
      expect(r.result.current.liste.data).toHaveLength(50);
      expect(r.result.current.stats.data?.nbD20).toBe(4);
    });
    expect(r.result.current.liste.hasNextPage).toBe(true);
    expect(r.result.current.stats.data!.moyenneD20).toBe(10.5);
    expect(r.result.current.stats.data!.repartitionD20[19]).toBe(1);
    await r.act(() => r.result.current.effacer.mutateAsync());
    marquerJetsPerimes(r.client);
    await r.unmount();
  });
});

describe('temps réel', () => {
  it('nouveau jet relu et ajouté une fois ; supprimé ; historique vidé ; préférences', async () => {
    const r = await renderHook(() => null);
    r.client.setQueryData(clesJets.liste('camp'), { pages: [[]], pageParams: [undefined] });
    routes.set('GET /v1/dice/rolls/r5', () => roll('r5'));
    const nouveau = vi.fn();
    await appliquerEvenementDes(r.client, 'camp', event('dice.rolled', 'r5') as never, nouveau);
    await appliquerEvenementDes(r.client, 'camp', event('dice.rolled', 'r5') as never, nouveau);
    expect(nouveau).toHaveBeenCalledTimes(1);
    // Jet plus visible : rien
    await appliquerEvenementDes(r.client, 'camp', event('dice.rolled', 'r6') as never, nouveau);
    await appliquerEvenementDes(r.client, 'camp', event('dice.roll_deleted', 'r5') as never);
    expect(r.client.getQueryData<{ pages: Jet[][] }>(clesJets.liste('camp'))!.pages[0]).toEqual([]);
    await appliquerEvenementDes(r.client, 'camp', event('dice.history_cleared', 'x') as never);
    await appliquerEvenementDes(r.client, 'camp', event('dice.preferences_updated', 'x') as never);
    await r.unmount();
  });

  it('synchro : jet d’un autre annoncé (caché : « ? »), le mien non ; réabonnement : relu', async () => {
    events.generation = 1;
    routes.set('GET /v1/dice/rolls/r7', () =>
      roll('r7', { label: 'Discrétion', symbolResult: '2 succès' }),
    );
    routes.set('GET /v1/dice/rolls/r8', () => roll('r8', { hidden: true }));
    routes.set('GET /v1/dice/rolls/r9', () => roll('r9', { uid: 'moi' }));
    const r = await renderHook(() => useSynchroJets('camp'));
    for (const id of ['r7', 'r8', 'r9']) events.handler!(event('dice.rolled', id));
    await r.waitFor(() => expect(toasts).toHaveBeenCalledTimes(2));
    expect(toasts.mock.calls[0]![0]).toBe('Bob : 2 succès');
    expect(toasts.mock.calls[1]![0]).toBe('Bob : ?');
    events.generation = 0;
    await r.unmount();
  });
});
