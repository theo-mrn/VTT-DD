import type { MapObjectSearchResult } from '@vtt/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { SearchApi } from './api';
import { obj, PLAYER, setupObjects, token } from './objects-test-kit';
import { SearchController, searchErrorMessage } from './search';

const contents = (items: MapObjectSearchResult['items'], version = 1): MapObjectSearchResult => ({
  id: 'coffre',
  mapId: 'carte',
  name: 'Coffre',
  items,
  version,
});

const POTIONS = [{ id: 'p', name: 'Potion', quantity: 3, ref: 'potion' }];

const refused = (status: number, code?: string) =>
  new ApiError({ status, title: 'Refusé', ...(code ? { code } : {}) });

function setupSearch(api: Partial<SearchApi> = {}) {
  const t = setupObjects({
    viewer: { ...PLAYER, characterIds: ['aldric', 'bree'] },
    objects: [obj('coffre', 100, 100, { searchable: true })],
    // Bree est à portée, Aldric (incarné) trop loin
    tokens: [token('t1', 'aldric', 600, 600), token('t2', 'bree', 150, 200)],
  });
  const fake: SearchApi = {
    search: vi.fn(async () => contents(POTIONS)),
    take: vi.fn(async (_id, body) => ({
      object: contents(
        [{ ...POTIONS[0]!, quantity: 3 - (body.quantity ?? 3) }].filter((i) => i.quantity),
        2,
      ),
      taken: { itemId: body.itemId, name: 'Potion', quantity: body.quantity ?? 3 },
      characterVersion: 7,
    })),
    ...api,
  };
  const notify = vi.fn();
  const controller = new SearchController(t.engine, fake, { notify });
  return { ...t, api: fake, notify, controller, s: () => controller.state.getState() };
}

describe('fouille d’un joueur', () => {
  it('fouille avec le personnage à portée (l’incarné s’il l’est), puis montre le contenu', async () => {
    const t = setupSearch();
    t.controller.open('coffre');
    expect(t.s()).toMatchObject({ objectId: 'coffre', characterId: 'bree', status: 'loading' });
    await vi.waitFor(() => expect(t.s().status).toBe('ready'));
    expect(t.api.search).toHaveBeenCalledWith('coffre', 'bree');
    expect(t.s().result?.items).toEqual(POTIONS);
  });

  it('prendre : le contenu suit la réponse, le joueur est prévenu, la fiche est relue', async () => {
    const t = setupSearch();
    const taken = vi.fn();
    t.controller.onTaken(taken);
    t.controller.open('coffre');
    await vi.waitFor(() => expect(t.s().status).toBe('ready'));
    expect(await t.controller.take('p', 2)).toBe(true);
    expect(t.api.take).toHaveBeenCalledWith('coffre', {
      characterId: 'bree',
      itemId: 'p',
      quantity: 2,
    });
    expect(t.s().result?.items).toEqual([{ ...POTIONS[0], quantity: 1 }]);
    expect(t.s().result?.version).toBe(2);
    expect(t.notify).toHaveBeenCalledWith('Votre personnage a pris 2 × Potion.');
    expect(taken).toHaveBeenCalledWith('bree');
  });

  it('refus du serveur en clair ; déjà pris : message gardé et contenu relu', async () => {
    const search = vi
      .fn<SearchApi['search']>()
      .mockResolvedValueOnce(contents(POTIONS))
      .mockResolvedValueOnce(contents([], 3));
    const t = setupSearch({
      search,
      take: vi.fn(async () => {
        throw refused(404);
      }),
    });
    t.controller.open('coffre');
    await vi.waitFor(() => expect(t.s().status).toBe('ready'));
    expect(await t.controller.take('p')).toBe(false);
    expect(search).toHaveBeenCalledTimes(2);
    expect(t.s().result?.items).toEqual([]);
    expect(t.s().error).toBe('Déjà pris : quelqu’un est passé avant vous.');
  });

  it('hors de portée, service des personnages injoignable, objet disparu', () => {
    const ctx = { characterName: 'Aldric', reach: '1,5 m', action: 'search' as const };
    expect(searchErrorMessage(refused(422, 'out_of_range'), ctx)).toBe(
      'Aldric est trop loin : approchez-vous à 1,5 m de l’objet.',
    );
    expect(searchErrorMessage(refused(403, 'not_searchable'), ctx)).toMatch(/ne se fouille pas/);
    expect(
      searchErrorMessage(refused(502, 'character_unavailable'), { ...ctx, action: 'take' }),
    ).toMatch(/rien n’a été pris/);
    expect(searchErrorMessage(refused(404), ctx)).toBe('Cet objet n’est plus là.');
    expect(searchErrorMessage(refused(422, 'quantity_exceeded'), ctx)).toMatch(
      /le contenu a changé/,
    );
  });

  it('changer de personnage refouille ; fermer ignore les réponses en retard', async () => {
    let release: (r: MapObjectSearchResult) => void = () => undefined;
    const t = setupSearch({
      search: vi.fn((_id: string, characterId: string) =>
        characterId === 'aldric'
          ? new Promise<MapObjectSearchResult>((r) => (release = r))
          : Promise.resolve(contents(POTIONS)),
      ),
    });
    t.controller.open('coffre');
    await vi.waitFor(() => expect(t.s().status).toBe('ready'));
    t.controller.setCharacter('aldric');
    expect(t.s()).toMatchObject({ characterId: 'aldric', status: 'loading' });
    t.controller.close();
    release(contents([]));
    await Promise.resolve();
    expect(t.s()).toMatchObject({ objectId: null, status: 'idle', result: null });
  });
});
