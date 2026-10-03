// @vitest-environment jsdom
/**
 * Campagnes côté front : traduction de l'API (ambiance, visibilité, membres et personnages
 * incarnés, invitations), création complète (couverture envoyée, amis invités), écritures du
 * service et hooks (cache remplacé ou relu après chaque écriture).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render-hook';

type Handler = (body: Record<string, unknown> | undefined, url: string) => unknown;
const routes = vi.hoisted(() => new Map<string, Handler>());
const calls = vi.hoisted(() => [] as { method: string; url: string; body: unknown }[]);
const upload = vi.hoisted(() => ({
  prepare: vi.fn(async (f: File) => f),
  send: vi.fn(async () => 'https://cdn.test/couverture.webp'),
}));

vi.mock('./api', async (importOriginal) => {
  const real = await importOriginal<typeof import('./api')>();
  return {
    ...real,
    api: vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      const handler = routes.get(`${method} ${url.split('?')[0]}`);
      if (!handler) throw new Error(`Route non prévue : ${method} ${url}`);
      return handler(body, url);
    }),
  };
});
vi.mock('./uploads/image', () => ({
  MAX_SIDE: { 'campaign-image': 1600 },
  prepareImage: upload.prepare,
}));
vi.mock('./uploads/uploader', () => ({ uploadFile: upload.send }));

import {
  campagnes,
  clePersonnagesCampagne,
  clesCampagnes,
  useAnnulerInvitation,
  useCampagne,
  useCampagnes,
  useCampagnesPubliques,
  useCreerCampagne,
  useDeclinerInvitation,
  useDeplanifier,
  useEnvoyerCouverture,
  useIncarner,
  useInvitationsRecues,
  useInviter,
  useModifierCampagne,
  useNouveauCode,
  usePlanifier,
  useRejoindreCampagne,
  useRejoindreSansCode,
  useRetirerMembre,
  useSessionsCampagne,
  useSortirCampagne,
} from './campagnes';

const fields = {
  id: 'camp',
  name: 'Donjon',
  description: 'Profond',
  system: { id: 'dnd', version: '1' },
  code: 'ABC123',
  imageUrl: null,
  isPublic: true,
  characterCreation: true,
  pitch: 'Pitch',
  accent: 'frost',
  tags: ['horreur'],
  playerCount: 3,
  owner: { id: 'mj', name: null, avatarUrl: null },
  updatedAt: '2026-01-01',
};
const detail = (extra: Record<string, unknown> = {}) => ({
  ...fields,
  ownerId: 'mj',
  role: 'gm',
  playedCharacterId: null,
  members: [
    { userId: 'mj', name: 'MJ', avatarUrl: null, role: 'gm' },
    { userId: 'alice', name: null, avatarUrl: null, role: 'player' },
  ],
  characters: [
    { characterId: 'p1', ownerId: 'alice', side: 'players', addedBy: 'alice', playedBy: 'alice' },
  ],
  invitees: [{ userId: 'bob', name: null, avatarUrl: null, invitedBy: 'mj', invitedAt: '' }],
  version: 2,
  createdAt: '',
  ...extra,
});
const session = { id: 's1', date: '2026-02-01T20:00:00Z', title: 'Séance 1' };

beforeEach(() => {
  routes.clear();
  calls.length = 0;
  routes.set('GET /v1/campaigns', () => [
    {
      ...fields,
      role: 'gm',
      memberCount: 2,
      members: [{ userId: 'mj', name: 'MJ', avatarUrl: null, role: 'gm' }],
      nextSession: session,
      playedCharacterId: null,
      characterIds: ['p1'],
    },
  ]);
  routes.set('GET /v1/campaigns/camp', () => detail());
  routes.set('GET /v1/campaigns/camp/sessions', () => [session]);
  routes.set('GET /v1/campaigns/public', () => ({
    campaigns: [{ ...fields, accent: 'inconnu', role: null, memberCount: 3 }],
    page: 1,
    perPage: 20,
    total: 1,
  }));
  routes.set('GET /v1/campaigns/invited', () => [
    {
      ...fields,
      role: null,
      memberCount: 3,
      invitedBy: { id: 'mj', name: 'MJ', avatarUrl: null },
      invitedAt: '',
    },
  ]);
  for (const r of [
    'POST /v1/campaigns',
    'PATCH /v1/campaigns/camp',
    'POST /v1/campaigns/join',
    'POST /v1/campaigns/camp/join',
    'POST /v1/campaigns/camp/invitees',
    'POST /v1/campaigns/camp/characters',
    'POST /v1/campaigns/camp/code',
  ])
    routes.set(r, () => detail());
  for (const r of [
    'DELETE /v1/campaigns/camp',
    'DELETE /v1/campaigns/camp/invitees/bob',
    'DELETE /v1/campaigns/camp/members/alice',
    'DELETE /v1/campaigns/camp/characters/p1',
    'DELETE /v1/campaigns/camp/sessions/s1',
  ])
    routes.set(r, () => undefined);
  routes.set('PUT /v1/campaigns/camp/me/character', () => [{ characterId: 'p1' }]);
  routes.set('POST /v1/campaigns/camp/sessions', () => session);
  routes.set('GET /v1/campaigns/camp/characters', () => []);
});
afterEach(() => vi.restoreAllMocks());

describe('lectures et traduction', () => {
  it('mes campagnes, une campagne, ses sessions, publiques, invitations reçues', async () => {
    const [mienne] = await campagnes.lister();
    expect(mienne).toMatchObject({
      ambiance: 'givre',
      visibility: 'public',
      freeCreation: true,
      owner: { name: expect.any(String) },
    });
    expect(mienne!.nextSession).toEqual({ id: 's1', startsAt: session.date, title: 'Séance 1' });
    const d = await campagnes.lire('camp');
    expect(d.members.find((m) => m.userId === 'alice')!.characterId).toBe('p1');
    expect(d.invitations[0]!.userId).toBe('bob');
    expect(d.memberCount).toBe(2);
    expect(await campagnes.sessions('camp')).toHaveLength(1);
    const pub = await campagnes.publiques('  donjon ', 2);
    expect(calls.at(-1)!.url).toBe('/v1/campaigns/public?page=2&search=donjon');
    expect(pub.campagnes[0]!.ambiance).toBe('or');
    expect(pub.campagnes[0]!.members).toEqual([]);
    await campagnes.publiques('', 1);
    expect(calls.at(-1)!.url).toBe('/v1/campaigns/public?page=1');
    expect((await campagnes.invitations())[0]!.invitedBy.id).toBe('mj');
  });
});

describe('écritures', () => {
  it('création : corps traduit, couverture importée envoyée puis enregistrée, amis invités', async () => {
    const couverture = new File(['x'], 'c.png', { type: 'image/png' });
    await campagnes.creer({
      name: '  Donjon  ',
      pitch: ' p ',
      description: ' d ',
      coverUrl: '/biblio/c.webp',
      couverture,
      system: 'dnd',
      ambiance: 'braise',
      visibility: 'private',
      freeCreation: false,
      tags: ['a'],
      invite: [{ id: 'bob', name: 'Bob', avatarUrl: null }],
    });
    expect(calls[0]!.body).toMatchObject({
      systemId: 'dnd',
      name: 'Donjon',
      imageUrl: null,
      isPublic: false,
      accent: 'ember',
    });
    expect(upload.send).toHaveBeenCalledWith(
      { kind: 'campaign', id: 'camp' },
      'campaign-image',
      couverture,
      {},
    );
    expect(calls[1]!.body).toEqual({ imageUrl: 'https://cdn.test/couverture.webp' });
    expect(calls[2]!.body).toEqual({ userIds: ['bob'] });
  });

  it('rejoindre, inviter, retirer, incarner, engager, code, sessions, supprimer', async () => {
    await campagnes.rejoindre('inv_x');
    await campagnes.rejoindreSansCode('camp');
    await campagnes.retirerInvitation('camp', 'bob');
    await campagnes.retirerMembre('camp', 'alice');
    expect(await campagnes.incarner('camp', null)).toEqual([{ characterId: 'p1' }]);
    await campagnes.engager('camp', 'p1');
    await campagnes.desengager('camp', 'p1');
    await campagnes.personnages('camp', 'pc');
    expect(calls.at(-1)!.url).toBe('/v1/campaigns/camp/characters?kind=pc');
    await campagnes.nouveauCode('camp');
    expect((await campagnes.planifier('camp', session.date, null)).id).toBe('s1');
    await campagnes.deplanifier('camp', 's1');
    await campagnes.supprimer('camp');
    expect(calls.map((c) => c.method).filter((m) => m !== 'GET')).toHaveLength(11);
  });
});

describe('hooks', () => {
  it('lectures en cache', async () => {
    const r = await renderHook(() => ({
      miennes: useCampagnes(),
      une: useCampagne('camp'),
      aucune: useCampagne(null),
      sessions: useSessionsCampagne('camp'),
      publiques: useCampagnesPubliques('', 1),
      invitations: useInvitationsRecues(),
    }));
    await r.waitFor(() => {
      expect(r.result.current.miennes.data).toHaveLength(1);
      expect(r.result.current.une.data?.id).toBe('camp');
      expect(r.result.current.sessions.data).toHaveLength(1);
      expect(r.result.current.publiques.data?.total).toBe(1);
      expect(r.result.current.invitations.data).toHaveLength(1);
    });
    expect(r.result.current.aucune.fetchStatus).toBe('idle');
    await r.unmount();
  });

  it('chaque écriture met le cache à jour (détail remplacé, listes relues)', async () => {
    const r = await renderHook(() => ({
      creer: useCreerCampagne(),
      rejoindre: useRejoindreCampagne(),
      sansCode: useRejoindreSansCode(),
      modifier: useModifierCampagne('camp'),
      couverture: useEnvoyerCouverture('camp'),
      code: useNouveauCode('camp'),
      inviter: useInviter('camp'),
      annuler: useAnnulerInvitation('camp'),
      decliner: useDeclinerInvitation('bob'),
      retirer: useRetirerMembre('camp'),
      incarner: useIncarner('camp'),
      planifier: usePlanifier('camp'),
      deplanifier: useDeplanifier('camp'),
      sortir: useSortirCampagne('camp', 'alice'),
    }));
    const m = () => r.result.current;
    await r.act(() => m().modifier.mutateAsync({ name: 'Crypte' }));
    expect(r.client.getQueryData(clesCampagnes.une('camp'))).toBeDefined();
    await r.act(() => m().rejoindre.mutateAsync('ABC'));
    await r.act(() => m().sansCode.mutateAsync('camp'));
    await r.act(() => m().couverture.mutateAsync(new File(['x'], 'c.png')));
    await r.act(() => m().code.mutateAsync());
    await r.act(() => m().inviter.mutateAsync(['bob']));
    await r.act(() => m().annuler.mutateAsync('bob'));
    await r.act(() => m().decliner.mutateAsync('camp'));
    await r.act(() => m().retirer.mutateAsync('alice'));
    await r.act(() => m().incarner.mutateAsync('p1'));
    expect(r.client.getQueryData(clePersonnagesCampagne('camp'))).toEqual([{ characterId: 'p1' }]);
    await r.act(() => m().planifier.mutateAsync({ startsAt: session.date, title: null }));
    await r.act(() => m().deplanifier.mutateAsync('s1'));
    await r.act(() => m().sortir.mutateAsync('quitter'));
    await r.act(() => m().sortir.mutateAsync('supprimer'));
    expect(r.client.getQueryData(clesCampagnes.une('camp'))).toBeUndefined();
    await r.act(() =>
      m().creer.mutateAsync({
        name: 'X',
        pitch: '',
        description: '',
        coverUrl: null,
        couverture: null,
        system: 'dnd',
        ambiance: 'or',
        visibility: 'public',
        freeCreation: true,
        tags: [],
        invite: [],
      }),
    );
    await r.unmount();
  });
});
