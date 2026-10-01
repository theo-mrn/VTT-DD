import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from '@/lib/realtime';
import { createMapStore, type MapDto } from './map-store';
import { MapSync, REFETCH_DEBOUNCE_MS, type SyncViewer } from './sync';

const token = (
  id: string,
  x: number,
  version = 1,
  extra: Record<string, unknown> = {},
): MapDto => ({
  id,
  version,
  mapId: 'carte',
  characterId: `perso-${id}`,
  pos: { x, y: 0 },
  layerId: 'persos',
  ...extra,
});

function event(type: string, payload: Record<string, unknown>, redacted = false): RealtimeEvent {
  return {
    seq: 1,
    redacted,
    event: {
      id: 'e',
      type,
      version: 1,
      occurredAt: '',
      roomId: 'campagne',
      actor: { userId: 'x', role: 'gm', characterId: null },
      aggregate: {
        type: type.split('.')[0]!,
        id: String(payload.id ?? payload.tokenId ?? 'carte'),
      },
      visibility: 'public',
      payload,
      correlationId: 'c',
    },
  };
}

function setup(viewer: SyncViewer = { role: 'gm', characterIds: [] }) {
  const store = createMapStore('campagne', 'carte');
  const reader = {
    snapshot: vi.fn(async () => ({
      map: { id: 'carte', version: 1, width: 1000, height: 800 },
      layers: [{ id: 'persos', version: 1, name: 'Personnages', sortOrder: 0 }],
      tokens: [token('a', 0), token('b', 10)],
      objects: [{ id: 'o', version: 1, mapId: 'carte', layerId: 'persos' }],
      obstacles: [{ id: 'porte', version: 1, mapId: 'carte', kind: 'door', isOpen: false }],
      fog: { cells: [] },
    })),
    settings: vi.fn(async () => ({ version: 1, pixelsPerUnit: 50 })),
    list: vi.fn(async (key: string) => (key === 'tokens' ? [token('a', 99, 5)] : [])),
  };
  const sync = new MapSync({ store, reader, viewer: () => viewer });
  return {
    store,
    reader,
    sync,
    get: (key: string, id: string) => store.getState().collections[key]?.get(id),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('MapSync', () => {
  it('charge la carte : scène, réglages, couches, et le reste à part', async () => {
    const t = setup();
    await t.sync.load();
    const s = t.store.getState();
    expect(s.status).toBe('ready');
    expect(s.scene).toMatchObject({ id: 'carte', width: 1000 });
    expect(s.settings).toMatchObject({ pixelsPerUnit: 50 });
    expect([...s.collections.tokens!.keys()]).toEqual(['a', 'b']);
    expect(s.extras.fog).toEqual({ cells: [] });
  });

  it('mode strict de React : éteinte puis remise en service, elle charge la scène', async () => {
    const t = setup();
    // Premier montage de l'effet, démontage aussitôt, second montage
    const first = t.sync.load();
    t.sync.dispose();
    t.sync.resume();
    await Promise.all([first, t.sync.load()]);
    expect(t.store.getState().status).toBe('ready');
  });

  it('éteinte, elle ne touche plus au store', async () => {
    const t = setup();
    t.sync.dispose();
    await t.sync.load();
    expect(t.store.getState().status).toBe('loading');
  });

  it('ignore un événement dont la version n’est pas plus récente', async () => {
    const t = setup();
    await t.sync.load();
    t.sync.handle(event('token.updated', token('a', 50, 1)));
    expect(t.get('tokens', 'a')?.pos).toEqual({ x: 0, y: 0 });
    t.sync.handle(event('token.updated', token('a', 50, 2)));
    expect(t.get('tokens', 'a')?.pos).toEqual({ x: 50, y: 0 });
  });

  it('ne touche pas un élément dont une écriture optimiste attend sa réponse', async () => {
    const t = setup();
    await t.sync.load();
    t.store.getState().markPending(['a'], true);
    t.sync.handle(event('token.updated', token('a', 50, 9)));
    t.sync.handle(
      event('token.moved', {
        tokenId: 'a',
        characterId: 'perso-a',
        from: null,
        to: { mapId: 'carte', x: 7, y: 7 },
      }),
    );
    expect(t.get('tokens', 'a')?.pos).toEqual({ x: 0, y: 0 });
  });

  it('déplacé ailleurs : la version suit (sinon la prochaine écriture serait refusée)', async () => {
    const t = setup();
    await t.sync.load();
    const moved = (x: number, version: number) =>
      event('token.moved', {
        tokenId: 'a',
        characterId: 'perso-a',
        from: null,
        to: { mapId: 'carte', x, y: 0 },
        version,
      });
    t.sync.handle(moved(30, 5));
    expect(t.get('tokens', 'a')).toMatchObject({ pos: { x: 30, y: 0 }, version: 5 });
    // Écho en retard d'un déplacement plus ancien : ignoré, la position ne recule pas
    t.sync.handle(moved(10, 4));
    expect(t.get('tokens', 'a')).toMatchObject({ pos: { x: 30, y: 0 }, version: 5 });
  });

  it('suit les tokens qui bougent, arrivent ou partent', async () => {
    const t = setup();
    await t.sync.load();
    t.sync.handle(
      event('token.moved', {
        tokenId: 'a',
        characterId: 'perso-a',
        from: null,
        to: { mapId: 'carte', x: 3, y: 4 },
      }),
    );
    expect(t.get('tokens', 'a')?.pos).toEqual({ x: 3, y: 4 });
    t.sync.handle(
      event('token.moved', {
        tokenId: 'b',
        characterId: 'perso-b',
        from: { mapId: 'carte', x: 0, y: 0 },
        to: { mapId: 'ailleurs', x: 0, y: 0 },
      }),
    );
    expect(t.get('tokens', 'b')).toBeUndefined();
    // Voyage vers une autre carte : le token d'arrivée a un autre identifiant (sa place gardée
    // là-bas) ; celui d'ici part quand même, sans fantôme chez le MJ
    t.sync.handle(
      event('token.moved', {
        tokenId: 'a-la-bas',
        characterId: 'perso-a',
        from: { mapId: 'carte', x: 3, y: 4 },
        to: { mapId: 'ailleurs', x: 0, y: 0 },
      }),
    );
    expect(t.get('tokens', 'a')).toBeUndefined();
    // Inconnu qui arrive : relecture des tokens
    t.sync.handle(
      event('token.moved', {
        tokenId: 'z',
        characterId: 'perso-z',
        from: null,
        to: { mapId: 'carte', x: 1, y: 1 },
      }),
    );
    await vi.advanceTimersByTimeAsync(REFETCH_DEBOUNCE_MS + 1);
    expect(t.reader.list).toHaveBeenCalledWith('tokens');
  });

  it('applique les couches : création, suppression, masquage, effacement groupé', async () => {
    const t = setup();
    await t.sync.load();
    t.sync.handle(
      event('map_drawing.created', { id: 'd1', version: 1, mapId: 'carte', points: [] }),
    );
    t.sync.handle(
      event('map_drawing.created', { id: 'd2', version: 1, mapId: 'carte', points: [] }),
    );
    t.sync.handle(
      event('map_drawing.created', { id: 'x', version: 1, mapId: 'autre', points: [] }),
    );
    expect([...t.store.getState().collections.drawings!.keys()]).toEqual(['d1', 'd2']);
    t.sync.handle(event('map_drawing.cleared', { mapId: 'carte', ids: ['d1', 'd2'] }));
    expect(t.store.getState().collections.drawings!.size).toBe(0);
    // Le MJ voit tout : `hidden` ne le concerne pas
    t.sync.handle(event('map_object.hidden', { id: 'o', mapId: 'carte' }));
    t.sync.handle(event('token.hidden', { id: 'a', mapId: 'carte' }));
    t.sync.handle(event('map_layer.hidden', { id: 'persos', mapId: 'carte' }));
    expect(t.get('objects', 'o')).toBeDefined();
    expect(t.get('tokens', 'a')).toBeDefined();
    expect(t.get('layers', 'persos')).toBeDefined();
  });

  it('joueur : un élément qui lui devient caché est retiré', async () => {
    const t = setup({ role: 'player', characterIds: [] });
    await t.sync.load();
    t.sync.handle(event('map_object.hidden', { id: 'o', mapId: 'carte' }));
    t.sync.handle(event('token.hidden', { id: 'a', mapId: 'carte' }));
    expect(t.get('objects', 'o')).toBeUndefined();
    expect(t.get('tokens', 'a')).toBeUndefined();
  });

  it('joueur : map.visibility_changed ou une échelle nouvelle relisent tokens et objets', async () => {
    const t = setup({ role: 'player', characterIds: [] });
    await t.sync.load();
    t.sync.handle(event('map.visibility_changed', { mapId: 'carte' }));
    t.sync.handle(event('map.visibility_changed', { mapId: 'carte' }, true));
    await vi.advanceTimersByTimeAsync(REFETCH_DEBOUNCE_MS + 1);
    expect(t.reader.list.mock.calls.map((c) => c[0]).sort()).toEqual(['objects', 'tokens']);
    t.reader.list.mockClear();
    t.sync.handle(event('map_settings.updated', { version: 2, pixelsPerUnit: 50, unitName: 'm' }));
    await vi.advanceTimersByTimeAsync(REFETCH_DEBOUNCE_MS + 1);
    expect(t.reader.list).not.toHaveBeenCalled();
    t.sync.handle(event('map_settings.updated', { version: 3, pixelsPerUnit: 70 }));
    await vi.advanceTimersByTimeAsync(REFETCH_DEBOUNCE_MS + 1);
    expect(t.reader.list).toHaveBeenCalledTimes(2);
    // Le MJ ne relit pas : il voit tout
    const gm = setup();
    await gm.sync.load();
    gm.sync.handle(event('map.visibility_changed', { mapId: 'carte' }));
    await vi.advanceTimersByTimeAsync(REFETCH_DEBOUNCE_MS + 1);
    expect(gm.reader.list).not.toHaveBeenCalled();
  });

  it('événement expurgé : la couche est relue (une fois pour une rafale)', async () => {
    const t = setup();
    await t.sync.load();
    t.sync.handle(event('token.updated', {}, true));
    t.sync.handle(event('token.updated', {}, true));
    await vi.advanceTimersByTimeAsync(REFETCH_DEBOUNCE_MS + 1);
    expect(t.reader.list).toHaveBeenCalledTimes(1);
    expect(t.get('tokens', 'a')?.pos).toEqual({ x: 99, y: 0 });
  });

  it('joueur : son token bouge ou une porte s’ouvre, tokens et objets sont relus', async () => {
    const t = setup({ role: 'player', characterIds: ['perso-a'] });
    await t.sync.load();
    t.sync.handle(
      event('token.moved', {
        tokenId: 'a',
        characterId: 'perso-a',
        from: null,
        to: { mapId: 'carte', x: 1, y: 1 },
      }),
    );
    t.sync.handle(
      event('map_obstacle.updated', {
        id: 'porte',
        version: 2,
        mapId: 'carte',
        kind: 'door',
        isOpen: true,
      }),
    );
    await vi.advanceTimersByTimeAsync(REFETCH_DEBOUNCE_MS + 1);
    expect(t.reader.list.mock.calls.map((c) => c[0]).sort()).toEqual(['objects', 'tokens']);
  });

  it('joueur : un calque masqué emporte son contenu ; revenu, la carte est relue', async () => {
    const t = setup({ role: 'player', characterIds: [] });
    await t.sync.load();
    t.sync.handle(event('map_layer.hidden', { id: 'persos', mapId: 'carte' }));
    const s = t.store.getState();
    expect(s.collections.layers!.size).toBe(0);
    expect(s.collections.tokens!.size).toBe(0);
    expect(s.collections.objects!.size).toBe(0);
    t.sync.handle(
      event('map_layer.updated', { id: 'persos', version: 3, mapId: 'carte', name: 'Personnages' }),
    );
    await vi.runAllTimersAsync();
    expect(t.reader.snapshot).toHaveBeenCalledTimes(2);
  });

  it('scène supprimée ou cachée à un joueur : la carte n’est plus disponible', async () => {
    const t = setup({ role: 'player', characterIds: [] });
    await t.sync.load();
    t.sync.handle(event('map.hidden', { id: 'carte' }));
    expect(t.store.getState().status).toBe('gone');
  });

  it('une relecture ancienne ne remplace pas une plus récente', async () => {
    const t = setup();
    let first!: (v: unknown) => void;
    t.reader.snapshot.mockImplementationOnce(
      () => new Promise((res) => (first = res as (v: unknown) => void)) as never,
    );
    const a = t.sync.load();
    await t.sync.load();
    first({ map: { id: 'carte', version: 0 }, tokens: [] });
    await a;
    expect(t.store.getState().collections.tokens!.size).toBe(2);
  });
});
