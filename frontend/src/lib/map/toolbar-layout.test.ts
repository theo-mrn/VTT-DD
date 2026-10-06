/**
 * Disposition de la barre (docs/carte.md § 6, Personnalisation) : lecture, enregistrement avec
 * la version lue, conflit avec un autre appareil (notre geste gagne), geste en attente
 * prioritaire, version périmée ignorée.
 */
import type { MapToolbarLayout } from '@vtt/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { ToolbarLayoutStore, toolbarLayoutApi } from './toolbar-layout';

type Client = typeof toolbarLayoutApi;

function fakeClient(server: MapToolbarLayout = { order: [], hidden: [], version: 0 }) {
  const state = { server, saves: [] as Parameters<Client['save']>[0][] };
  const client: Client = {
    get: async () => state.server,
    save: async (body) => {
      state.saves.push(body);
      if (body.version !== undefined && body.version !== state.server.version)
        throw new ApiError({
          type: 'about:blank',
          title: 'Conflit',
          status: 409,
          current: state.server,
        } as never);
      state.server = {
        order: [...body.order],
        hidden: [...body.hidden],
        version: state.server.version + 1,
      };
      return state.server;
    },
  };
  return { client, state };
}

describe('ToolbarLayoutStore', () => {
  it('lit le serveur, puis enregistre avec la version lue', async () => {
    const { client, state } = fakeClient({ order: ['snap'], hidden: [], version: 3 });
    const store = new ToolbarLayoutStore(client, 0);
    await store.load();
    expect(store.state).toEqual({ order: ['snap'], hidden: [] });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ order: ['camera.fit'], hidden: ['snap'] });
    expect(listener).toHaveBeenCalled();
    await store.flush();
    expect(state.saves).toEqual([{ order: ['camera.fit'], hidden: ['snap'], version: 3 }]);
    expect(state.server.version).toBe(4);
  });

  it('conflit : on repart de la version de l’autre appareil, notre geste par-dessus', async () => {
    const { client, state } = fakeClient();
    const store = new ToolbarLayoutStore(client, 0);
    await store.load();
    state.server = { order: ['autre'], hidden: [], version: 5 };
    store.set({ order: ['moi'], hidden: [] });
    await store.flush();
    await store.flush();
    expect(state.server).toEqual({ order: ['moi'], hidden: [], version: 6 });
    expect(store.state).toEqual({ order: ['moi'], hidden: [] });
  });

  it('un geste en attente l’emporte sur l’état reçu ; une version périmée est ignorée', async () => {
    const { client } = fakeClient({ order: [], hidden: [], version: 2 });
    const store = new ToolbarLayoutStore(client, 60_000);
    await store.load();
    store.set({ order: ['mien'], hidden: [] });
    store.adopt({ order: ['reçu'], hidden: [], version: 3 });
    expect(store.state.order).toEqual(['mien']);
    await store.flush();
    store.adopt({ order: ['ancien'], hidden: [], version: 1 });
    expect(store.state.order).toEqual(['mien']);
  });

  it('Rétablir : disposition vide', async () => {
    const { client, state } = fakeClient({ order: ['a'], hidden: ['b'], version: 1 });
    const store = new ToolbarLayoutStore(client, 0);
    await store.load();
    store.reset();
    await store.flush();
    expect(state.server).toEqual({ order: [], hidden: [], version: 2 });
  });
});
