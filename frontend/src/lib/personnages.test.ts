// @vitest-environment jsdom
/**
 * Personnages côté front : lectures (mes personnages et leur campagne, une fiche, ceux d'une
 * campagne), écritures en file par personnage avec la version connue, aperçu immédiat remplacé
 * par la réponse, conflit de version (fiche relue, écritures en attente abandonnées), échec
 * (fiche relue), report dans les listes en cache, actions du système.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render-hook';

type Handler = (body: Record<string, unknown> | undefined, url: string) => unknown;
const routes = vi.hoisted(() => new Map<string, Handler>());
const calls = vi.hoisted(() => [] as { method: string; url: string; body: unknown }[]);

vi.mock('./api', async (importOriginal) => {
  const real = await importOriginal<typeof import('./api')>();
  return {
    ...real,
    api: vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      const path = url.split('?')[0]!;
      const handler = routes.get(`${method} ${path}`) ?? routes.get(`${method} *`);
      if (!handler) throw new Error(`Route non prévue : ${method} ${url}`);
      return handler(body, url);
    }),
  };
});
vi.mock('./session', () => ({ useProfil: () => ({ id: 'moi', name: 'Moi' }) }));

import { ApiError } from './api';
import {
  campagneDe,
  clesPersonnages,
  conflitVersion,
  invaliderListesAvec,
  lienPersonnage,
  personnages,
  reporterDansListes,
  useOperationsPersonnage,
  usePersonnage,
  usePersonnages,
  usePersonnagesCampagne,
  useCampaignPlayerCharacters,
  type FichePersonnage,
} from './personnages';

const ETAT = {
  type: 'personnage',
  systeme: { id: 'dnd', version: '1' },
  valeurs: { force: 12 },
  creation: false,
};

/** Fiche telle que le service la renvoie. */
const character = (version: number, extra: Record<string, unknown> = {}) => ({
  id: 'p1',
  ownerId: 'moi',
  nom: 'Aria',
  avatarUrl: '/aria.webp',
  etat: { ...ETAT, ...(extra.etat as object) },
  fiche: {},
  details: { concept: 'Barde', appearance: '', backstory: '' },
  summary: { tagline: 'Barde', highlights: [] },
  version,
  createdAt: '2026-01-01',
  updatedAt: `2026-01-0${version}`,
  ...extra,
});

const campaignFields = {
  id: 'camp',
  name: 'Donjon',
  description: '',
  system: { id: 'dnd', version: '1' },
  code: 'ABC',
  imageUrl: null,
  isPublic: false,
  characterCreation: true,
  pitch: '',
  accent: 'gold',
  tags: [],
  playerCount: 2,
  owner: { id: 'mj', name: 'MJ', avatarUrl: null },
  updatedAt: '2026-01-01',
};

let version = 3;
beforeEach(() => {
  routes.clear();
  calls.length = 0;
  version = 3;
  routes.set('GET /v1/characters/p1', () => character(version));
  const write: Handler = (body) => {
    if (body && body.version !== version)
      throw new ApiError({ status: 409, title: 'Conflit', code: 'version_perimee' });
    version += 1;
    return character(version, { nom: 'Aria II' });
  };
  for (const r of [
    'PATCH /v1/characters/p1',
    'PUT /v1/characters/p1/valeurs',
    'POST /v1/characters/p1/creation/tirer',
    'POST /v1/characters/p1/creation/terminer',
    'POST /v1/characters/p1/achats',
    'POST /v1/characters/p1/achats/rembourser',
    'POST /v1/characters/p1/possessions',
    'DELETE /v1/characters/p1/possessions/epee',
    'POST /v1/characters/p1/possessions/give',
    'PUT /v1/characters/p1/folders',
    'POST /v1/characters/p1/bonus',
    'DELETE /v1/characters/p1/bonus/b1',
    'PUT /v1/characters/p1/effets',
    'PUT /v1/characters/p1/layout',
  ])
    routes.set(r, write);
  routes.set('DELETE /v1/characters/p1/possessions/epee', (_b, url) => {
    const v = Number(new URL(url, 'http://x').searchParams.get('version'));
    if (v !== version)
      throw new ApiError({ status: 409, title: 'Conflit', code: 'version_perimee' });
    version += 1;
    return character(version);
  });
  routes.set('DELETE /v1/characters/p1/bonus/b1', () => {
    version += 1;
    return character(version);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('utilitaires', () => {
  it('lien : la fiche, ou l’assistant d’une création en cours dans sa campagne', () => {
    expect(lienPersonnage({ id: 'p1', inCreation: false, roomId: null })).toBe('/personnages/p1');
    expect(lienPersonnage({ id: 'p1', inCreation: true, roomId: 'c' })).toBe(
      '/personnages/nouveau?campagne=c&personnage=p1',
    );
    expect(campagneDe('p1', [{ id: 'c', characterIds: ['p1'] }] as never)).toBe('c');
    expect(campagneDe('p1', undefined)).toBeNull();
    expect(conflitVersion().status).toBe(409);
  });

  it('lecture et suppression par le service', async () => {
    routes.set('GET /v1/characters', () => []);
    routes.set('DELETE /v1/characters/p1', () => undefined);
    expect((await personnages.lire('p1')).state.valeurs).toEqual({ force: 12 });
    await personnages.lister();
    await personnages.supprimer('p1');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /v1/characters/p1',
      'GET /v1/characters',
      'DELETE /v1/characters/p1',
    ]);
  });
});

describe('écritures', () => {
  it('chaque opération part avec la version connue, la fiche suit la réponse', async () => {
    const r = await renderHook(() => useOperationsPersonnage('p1'));
    const ops = r.result.current;
    await ops.profil({
      name: '  Aria  ',
      portraitUrl: '/a.webp',
      details: { concept: 'x', appearance: '', backstory: '' },
    });
    expect(calls.at(-1)!.body).toMatchObject({ version: 3, nom: 'Aria', avatarUrl: '/a.webp' });
    await ops.valeurs({ force: 14 }, { ...ETAT, valeurs: { force: 14 } } as never);
    const tirage = await ops.etape('tirer', {} as never);
    expect(tirage.tirage).toBeNull();
    await ops.terminer();
    await ops.acheter('a1', 'o1');
    await ops.rembourser(0);
    await ops.possession({ entree: 'epee' } as never);
    await ops.retirerPossession('epee', 'ex1');
    await ops.retirerPossession('epee');
    await ops.dossiers([]);
    await ops.bonus({ id: 'b1' } as never);
    await ops.retirerBonus('b1');
    await ops.effet(['epee/0'], false);
    await ops.miseEnPage(null);
    const fiche = r.client.getQueryData<FichePersonnage>(clesPersonnages.un('p1'))!;
    expect(fiche.version).toBe(version);
    const versions = calls
      .filter((c) => c.method !== 'GET')
      .map(
        (c) =>
          (c.body as { version?: number } | undefined)?.version ??
          Number(new URL(c.url, 'http://x').searchParams.get('version')),
      );
    expect(versions.slice(0, 5)).toEqual([3, 4, 5, 6, 7]);
    await r.unmount();
  });

  it('aperçu montré tout de suite, remplacé par la réponse', async () => {
    const r = await renderHook(() => useOperationsPersonnage('p1'));
    r.client.setQueryData(clesPersonnages.un('p1'), await personnages.lire('p1'));
    let release!: () => void;
    routes.set(
      'PUT /v1/characters/p1/valeurs',
      () => new Promise((res) => (release = () => res(character(++version)))),
    );
    const pending = r.result.current.valeurs({ force: 18 }, {
      ...ETAT,
      valeurs: { force: 18 },
    } as never);
    expect(r.client.getQueryData<FichePersonnage>(clesPersonnages.un('p1'))!.state.valeurs).toEqual(
      {
        force: 18,
      },
    );
    await new Promise((res) => setTimeout(res, 0));
    release();
    await pending;
    expect(r.client.getQueryData<FichePersonnage>(clesPersonnages.un('p1'))!.version).toBe(4);
    await r.unmount();
  });

  it('conflit de version : fiche relue, l’écriture refusée avec un message clair', async () => {
    const r = await renderHook(() => useOperationsPersonnage('p1'));
    r.client.setQueryData(clesPersonnages.un('p1'), await personnages.lire('p1'));
    version = 9; // changée ailleurs
    await expect(r.result.current.terminer()).rejects.toMatchObject({ status: 409 });
    expect(r.client.getQueryData<FichePersonnage>(clesPersonnages.un('p1'))!.version).toBe(9);
    // La suivante repart de la fiche relue
    await r.result.current.terminer();
    await r.unmount();
  });

  it('autre échec : la fiche est relue et l’erreur remonte ; relecture impossible : invalidée', async () => {
    const r = await renderHook(() => useOperationsPersonnage('p1'));
    routes.set('POST /v1/characters/p1/achats', () => {
      throw new ApiError({ status: 422, title: 'Pas assez d’or', code: 'fonds' });
    });
    await expect(r.result.current.acheter('a', 'o')).rejects.toMatchObject({ status: 422 });
    routes.set('GET /v1/characters/p1', () => {
      throw new Error('réseau');
    });
    await expect(r.result.current.acheter('a', 'o')).rejects.toBeTruthy();
    await r.unmount();
  });

  it('don à un autre personnage : sa fiche et les listes qui le contiennent sont relues', async () => {
    const r = await renderHook(() => useOperationsPersonnage('p1'));
    const spy = vi.spyOn(r.client, 'invalidateQueries');
    await r.result.current.donner({ to: 'p2', entree: 'epee' } as never);
    expect(
      spy.mock.calls.some(
        ([f]) => JSON.stringify(f?.queryKey) === JSON.stringify(clesPersonnages.un('p2')),
      ),
    ).toBe(true);
    await r.unmount();
  });

  it('action du système : résultat, fiche à jour si le service la renvoie', async () => {
    const r = await renderHook(() => useOperationsPersonnage('p1'));
    routes.set('POST /v1/characters/p1/actions/attaque', (body) => ({
      resultat: { total: 15, body },
      personnage: character(++version),
    }));
    const out = await r.result.current.action('attaque', {
      parametres: { arme: 'epee' },
      appliquer: true,
      campaignId: 'camp',
      visibility: 'gm',
    });
    expect(calls.at(-1)!.body).toEqual({
      parametres: { arme: 'epee' },
      appliquer: true,
      campaignId: 'camp',
      visibility: 'gm',
    });
    expect(out.fiche?.version).toBe(4);
    routes.set('POST /v1/characters/p1/actions/jet', () => ({ resultat: { total: 3 } }));
    expect((await r.result.current.action('jet', {})).fiche).toBeNull();
    await r.unmount();
  });
});

describe('listes en cache', () => {
  it('report du nom et du portrait dans les listes, sans relecture ; invalidation ciblée', async () => {
    const r = await renderHook(() => null);
    r.client.setQueryData(clesPersonnages.miens, [
      { id: 'p1', nom: 'Ancien' },
      { id: 'p9', nom: 'Autre' },
    ]);
    r.client.setQueryData(clesPersonnages.campagne('camp'), [
      { characterId: 'p1', name: 'Ancien' },
    ]);
    reporterDansListes(r.client, await personnages.lire('p1'));
    expect(r.client.getQueryData<{ nom: string }[]>(clesPersonnages.miens)![0]!.nom).toBe('Aria');
    expect(
      r.client.getQueryData<{ name: string }[]>(clesPersonnages.campagne('camp'))![0]!.name,
    ).toBe('Aria');
    // Personnage absent des listes : rien ne change
    reporterDansListes(r.client, { ...(await personnages.lire('p1')), id: 'inconnu' });
    invaliderListesAvec(r.client, 'p9');
    await r.unmount();
  });
});

describe('lectures', () => {
  it('mes personnages, avec la campagne où chacun est engagé', async () => {
    routes.set('GET /v1/characters', () => [
      {
        id: 'p1',
        nom: 'Aria',
        avatarUrl: null,
        systeme: { id: 'dnd', version: '1' },
        type: 'personnage',
        creation: false,
        concept: 'Barde',
        summary: { tagline: '', highlights: [] },
        updatedAt: '',
      },
    ]);
    routes.set('GET /v1/campaigns', () => [
      {
        ...campaignFields,
        role: 'player',
        memberCount: 2,
        members: [],
        nextSession: null,
        playedCharacterId: 'p1',
        characterIds: ['p1'],
      },
    ]);
    const r = await renderHook(() => usePersonnages());
    await r.waitFor(() => expect(r.result.current.isSuccess).toBe(true));
    expect(r.result.current.data![0]).toMatchObject({ id: 'p1', roomId: 'camp', ownerId: 'moi' });
    await r.unmount();
  });

  it('une fiche, et les personnages joueurs d’une campagne', async () => {
    routes.set('GET /v1/campaigns', () => []);
    routes.set('GET /v1/campaigns/camp', () => ({
      ...campaignFields,
      ownerId: 'mj',
      role: 'player',
      playedCharacterId: null,
      members: [],
      characters: [],
      invitees: [],
      version: 1,
      createdAt: '',
    }));
    const engage = (characterId: string, side: string) => ({
      characterId,
      name: null,
      avatarUrl: null,
      type: null,
      kind: side === 'players' ? 'pc' : 'npc',
      side,
      ownerId: 'x',
      playedBy: null,
      inCreation: false,
      summary: null,
    });
    routes.set('GET /v1/campaigns/camp/characters', (_b, url) =>
      url.includes('kind=pc')
        ? [engage('p1', 'players')]
        : [engage('p1', 'players'), engage('orc', 'enemies')],
    );
    const fiche = await renderHook(() => usePersonnage('p1'));
    await fiche.waitFor(() => expect(fiche.result.current.data?.id).toBe('p1'));
    await fiche.unmount();
    const camp = await renderHook(() => usePersonnagesCampagne('camp'));
    await camp.waitFor(() => expect(camp.result.current.data).toBeDefined());
    expect(camp.result.current.data!.map((p) => [p.id, p.name])).toEqual([
      ['p1', 'Personnage indisponible'],
    ]);
    await camp.unmount();
    const pcs = await renderHook(() => useCampaignPlayerCharacters('camp'));
    await pcs.waitFor(() => expect(pcs.result.current.data).toHaveLength(1));
    await pcs.unmount();
    const aucun = await renderHook(() => usePersonnagesCampagne(null));
    expect(aucun.result.current.isLoading).toBe(false);
    await aucun.unmount();
  });
});
