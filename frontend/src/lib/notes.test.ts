// @vitest-environment jsdom
/**
 * Notes côté front : texte et aperçu, traduction UI ↔ API (types, partage, étiquettes),
 * requêtes du service, hooks (listes, note, facettes), mises à jour optimistes annulées sur un
 * refus, et événements temps réel appliqués au cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render-hook';

type Handler = (body: Record<string, unknown> | undefined, url: string) => unknown;
const routes = vi.hoisted(() => new Map<string, Handler>());
const calls = vi.hoisted(() => [] as { method: string; url: string; body: unknown }[]);
const events = vi.hoisted(() => ({
  handler: null as null | ((e: unknown) => void),
  generation: 0,
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
vi.mock('./realtime', () => ({
  useCampaignEvents: (_c: unknown, _t: unknown, handler: (e: unknown) => void) => {
    events.handler = handler;
    return { live: true, generation: events.generation };
  },
}));

import { ApiError } from './api';
import {
  apercuNote,
  appliquerEvenementNote,
  clesNotes,
  estConflit,
  estIntrouvable,
  iconeNote,
  notes,
  resumeDe,
  texteNote,
  useCreerNote,
  useEpinglerNote,
  useFacettesNotes,
  useModifierNote,
  useNote,
  useNotes,
  useNotesListe,
  useNotesSync,
  useSupprimerNote,
  type Note,
  type ResumeNote,
} from './notes';

const apiNote = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  campaignId: 'camp',
  owner: { id: 'moi', name: null, avatarUrl: null },
  characterId: null,
  shared: false,
  sharedWith: null,
  sharedWithGm: false,
  title: `Note ${id}`,
  icon: null,
  type: 'location',
  tags: [{ id: 't1', label: 'ville' }],
  imageUrl: null,
  pinned: false,
  permissions: { edit: true, delete: true, share: true, move: true },
  version: 1,
  createdAt: '',
  updatedAt: '',
  content: '<h2>Titre</h2><p>Une taverne &amp; ses <b>secrets</b></p>',
  race: null,
  class: null,
  region: 'Nord',
  itemType: null,
  questType: null,
  questStatus: null,
  subQuests: [],
  excerpt: 'Une taverne',
  ...extra,
});

const event = (type: string, id: string, payload: Record<string, unknown> = {}) => ({
  seq: 1,
  redacted: false,
  event: { id: `e-${Math.random()}`, type, aggregate: { type: 'note', id }, payload },
});

beforeEach(() => {
  routes.clear();
  calls.length = 0;
  routes.set('GET /v1/notes', () => ({
    items: [apiNote('n1'), apiNote('n2')],
    nextCursor: null,
    total: 2,
  }));
  routes.set('GET /v1/notes/n1', () => apiNote('n1'));
  routes.set('GET /v1/notes/facets', () => ({
    total: 2,
    pinned: 1,
    types: { location: 2 },
    campaigns: [{ campaignId: 'camp', count: 2 }],
    tags: [{ label: 'ville', count: 2 }],
  }));
});
afterEach(() => vi.restoreAllMocks());

describe('texte d’une note', () => {
  it('texte brut, aperçu sans intertitres et tronqué, icône', () => {
    expect(texteNote('<p>a&nbsp;&lt;b&gt; &quot;c&quot; &#39;d&#39;</p><br>e')).toBe(
      `a <b> "c" 'd' e`,
    );
    expect(apercuNote('<h1>Titre</h1><p>Corps du texte</p>')).toBe('Corps du texte');
    expect(apercuNote('<p>abcdefghij</p>', 4)).toBe('abcd…');
    expect(iconeNote({ icon: '🍺', kind: 'lieu' })).toBe('🍺');
    expect(iconeNote({ icon: null, kind: 'quete' })).not.toBe('📝');
    expect(iconeNote({ icon: null, kind: 'inconnu' as never })).toBe('📝');
  });

  it('erreurs reconnues : conflit de version, note introuvable', () => {
    expect(estConflit(new ApiError({ status: 409, title: '', code: 'version_conflict' }))).toBe(
      true,
    );
    expect(estConflit(new Error())).toBe(false);
    expect(estIntrouvable(new ApiError({ status: 403, title: '' }))).toBe(true);
    expect(estIntrouvable(new ApiError({ status: 500, title: '' }))).toBe(false);
  });
});

describe('service', () => {
  it('page filtrée (campagne, type, épinglées, recherche, curseur) et facettes', async () => {
    const p = await notes.page(
      { campagne: 'camp', type: 'lieu', epinglees: true, recherche: '  taverne ' },
      'c1',
      20,
    );
    expect(calls[0]!.url).toBe(
      '/v1/notes?limit=20&campaignId=camp&type=location&pinned=true&q=taverne&cursor=c1',
    );
    expect(p.items[0]).toMatchObject({ kind: 'lieu', authorName: 'Joueur', visibility: 'private' });
    const f = await notes.facettes();
    expect(f.types.lieu).toBe(2);
    expect(f.campagnes.get('camp')).toBe(2);
  });

  it('création épinglée, modification (partage, étiquettes, détails), suppression, épingle', async () => {
    routes.set('POST /v1/campaigns/camp/notes', () => apiNote('n3'));
    routes.set('PUT /v1/notes/n3/pin', () => undefined);
    routes.set('DELETE /v1/notes/n3/pin', () => undefined);
    routes.set('PATCH /v1/notes/n3', () => apiNote('n3', { version: 2 }));
    routes.set('DELETE /v1/notes/n3', () => undefined);
    const n = await notes.creer({ roomId: 'camp', title: 'Auberge', kind: 'lieu', pinned: true });
    expect(n.pinned).toBe(true);
    expect(calls[0]!.body).toEqual({ title: 'Auberge', type: 'location' });
    expect(calls[1]).toMatchObject({ method: 'PUT', url: '/v1/notes/n3/pin' });
    const base = { title: 'X' };
    for (const [visibility, part] of [
      ['gm', { shared: true, sharedWith: [], sharedWithGm: true }],
      ['room', { shared: true, sharedWith: 'all' }],
      ['characters', { shared: true, sharedWith: ['c1'], sharedWithGm: true }],
      ['private', { shared: false }],
    ] as const) {
      await notes.modifier(
        'n3',
        { ...base, visibility, sharedWith: ['c1'], sharedWithGm: true },
        1,
        [],
      );
      expect(calls.at(-1)!.body).toMatchObject({ ...part, version: 1 });
    }
    await notes.modifier(
      'n3',
      {
        tags: ['ville', 'neuve'],
        details: { region: 'Sud', questStatus: 'completed' },
        imageUrl: null,
        icon: '🗺️',
        content: '<p>x</p>',
      },
      1,
      [{ id: 't1', label: 'ville' }],
    );
    const body = calls.at(-1)!.body as { tags: { id: string; label: string }[] };
    expect(body.tags[0]).toEqual({ id: 't1', label: 'ville' });
    expect(body.tags[1]!.label).toBe('neuve');
    expect(body).toMatchObject({ region: 'Sud', questStatus: 'completed', imageUrl: null });
    await notes.supprimer('n3');
    await notes.epingler('n3', false);
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: '/v1/notes/n3/pin' });
    const note = await notes.lire('n1');
    expect(resumeDe(note).excerpt).toBe('Une taverne & ses secrets');
  });
});

describe('hooks', () => {
  it('liste de l’espace, récentes, facettes, une note', async () => {
    const r = await renderHook(() => ({
      liste: useNotesListe({ campagne: null, type: null, epinglees: false, recherche: '' }),
      recentes: useNotes({ campaignId: 'camp', limit: 5 }),
      facettes: useFacettesNotes(),
      une: useNote('n1'),
      aucune: useNote(null),
    }));
    await r.waitFor(() => {
      expect(r.result.current.liste.data?.pages[0]!.items).toHaveLength(2);
      expect(r.result.current.recentes.data).toHaveLength(2);
      expect(r.result.current.facettes.data?.total).toBe(2);
      expect(r.result.current.une.data?.id).toBe('n1');
    });
    expect(r.result.current.aucune.fetchStatus).toBe('idle');
    await r.unmount();
  });

  it('modifier : appliqué tout de suite, puis la version enregistrée ; refusé : annulé', async () => {
    const r = await renderHook(() => ({ modifier: useModifierNote(), une: useNote('n1') }));
    await r.waitFor(() => expect(r.result.current.une.data).toBeDefined());
    r.client.setQueryData(clesNotes.recentes(null, 12), [resumeDe(r.result.current.une.data!)]);
    let release!: () => void;
    routes.set(
      'PATCH /v1/notes/n1',
      () =>
        new Promise((res) => (release = () => res(apiNote('n1', { title: 'Neuf', version: 2 })))),
    );
    const pending = r.act(() =>
      r.result.current.modifier.mutateAsync({
        id: 'n1',
        patch: { title: 'Neuf', content: '<p>a</p>', kind: 'objet' },
        version: 1,
        tagRefs: [],
      }),
    );
    await r.waitFor(() =>
      expect(r.client.getQueryData<Note>(clesNotes.une('n1'))!.title).toBe('Neuf'),
    );
    expect(r.client.getQueryData<ResumeNote[]>(clesNotes.recentes(null, 12))![0]!.title).toBe(
      'Neuf',
    );
    release();
    await pending;
    expect(r.client.getQueryData<Note>(clesNotes.une('n1'))!.version).toBe(2);
    routes.set('PATCH /v1/notes/n1', () => {
      throw new ApiError({ status: 409, title: '', code: 'version_conflict' });
    });
    await r.act(() =>
      r.result.current.modifier
        .mutateAsync({ id: 'n1', patch: { title: 'Refusé' }, version: 2, tagRefs: [] })
        .catch(() => undefined),
    );
    expect(r.client.getQueryData<Note>(clesNotes.une('n1'))!.title).toBe('Neuf');
    await r.unmount();
  });

  it('créer, épingler (annulé sur refus), supprimer (revient sur refus)', async () => {
    routes.set('POST /v1/campaigns/camp/notes', () => apiNote('n9'));
    const r = await renderHook(() => ({
      creer: useCreerNote(),
      epingler: useEpinglerNote(),
      supprimer: useSupprimerNote(),
    }));
    await r.act(() => r.result.current.creer.mutateAsync({ roomId: 'camp', title: 'X' }));
    expect(r.client.getQueryData<Note>(clesNotes.une('n9'))).toBeDefined();
    r.client.setQueryData(clesNotes.recentes(null, 12), [
      resumeDe(r.client.getQueryData<Note>(clesNotes.une('n9'))!),
    ]);
    routes.set('PUT /v1/notes/n9/pin', () => {
      throw new ApiError({ status: 500, title: '' });
    });
    await r.act(() =>
      r.result.current.epingler.mutateAsync({ id: 'n9', pinned: true }).catch(() => undefined),
    );
    expect(r.client.getQueryData<Note>(clesNotes.une('n9'))!.pinned).toBe(false);
    routes.set('DELETE /v1/notes/n9', () => {
      throw new ApiError({ status: 403, title: '' });
    });
    await r.act(() => r.result.current.supprimer.mutateAsync('n9').catch(() => undefined));
    expect(r.client.getQueryData<ResumeNote[]>(clesNotes.recentes(null, 12))).toHaveLength(1);
    routes.set('DELETE /v1/notes/n9', () => undefined);
    await r.act(() => r.result.current.supprimer.mutateAsync('n9'));
    expect(r.client.getQueryData(clesNotes.une('n9'))).toBeUndefined();
    await r.unmount();
  });
});

describe('temps réel', () => {
  it('supprimée : retirée des listes ; épingle déjà à jour : rien ; créée : relue', async () => {
    const r = await renderHook(() => null);
    const note = await notes.lire('n1');
    r.client.setQueryData(clesNotes.une('n1'), note);
    r.client.setQueryData(clesNotes.recentes(null, 12), [resumeDe(note)]);
    const spy = vi.spyOn(r.client, 'invalidateQueries');
    appliquerEvenementNote(r.client, event('note.unpinned', 'n1') as never);
    expect(spy).not.toHaveBeenCalled();
    appliquerEvenementNote(r.client, event('note.pinned', 'n1') as never);
    appliquerEvenementNote(r.client, event('note.created', 'n1', { version: 1 }) as never);
    appliquerEvenementNote(r.client, event('note.created', 'n5', { version: 1 }) as never);
    expect(spy).toHaveBeenCalled();
    appliquerEvenementNote(r.client, event('note.deleted', 'n1') as never);
    expect(r.client.getQueryData<ResumeNote[]>(clesNotes.recentes(null, 12))).toEqual([]);
    expect(r.client.getQueryData(clesNotes.une('n1'))).toBeUndefined();
    await r.unmount();
  });

  it('modifiée ailleurs : ouverte, relue et reportée ; fermée, relectures regroupées', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const r = await renderHook(() => useNote('n1'));
    await r.waitFor(() => expect(r.result.current.data).toBeDefined());
    r.client.setQueryData(clesNotes.recentes(null, 12), [resumeDe(r.result.current.data!)]);
    routes.set('GET /v1/notes/n1', () => apiNote('n1', { version: 3, title: 'Relue' }));
    appliquerEvenementNote(r.client, event('note.updated', 'n1', { version: 3 }) as never);
    await r.waitFor(() =>
      expect(r.client.getQueryData<ResumeNote[]>(clesNotes.recentes(null, 12))![0]!.title).toBe(
        'Relue',
      ),
    );
    // Version déjà connue : rien
    appliquerEvenementNote(r.client, event('note.updated', 'n1', { version: 2 }) as never);
    // Fermée : plusieurs événements, une relecture des listes au bout du délai
    const spy = vi.spyOn(r.client, 'invalidateQueries');
    appliquerEvenementNote(r.client, event('note.updated', 'n7', {}) as never);
    appliquerEvenementNote(r.client, event('note.updated', 'n7', {}) as never);
    vi.advanceTimersByTime(2_100);
    expect(
      spy.mock.calls.filter(
        ([f]) => JSON.stringify(f?.queryKey) === JSON.stringify(clesNotes.listes),
      ).length,
    ).toBe(1);
    vi.useRealTimers();
    await r.unmount();
  });

  it('synchro : chaque événement nouveau appliqué ; réabonnement : notes relues', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    events.generation = 1;
    const r = await renderHook(() => useNotesSync('camp'));
    expect(r.result.current.live).toBe(true);
    events.handler!(event('note.deleted', 'n1'));
    vi.advanceTimersByTime(150);
    vi.useRealTimers();
    events.generation = 0;
    await r.unmount();
  });
});
