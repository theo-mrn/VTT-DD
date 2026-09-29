import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  type EntityUpdate,
  CommandHistory,
  CommandManager,
  CONFLICT_MESSAGE,
  createCommand,
  deleteCommand,
  diffFields,
  groupCommands,
  tempId,
  UNDO_LIMIT,
  updateCommand,
  type Persistence,
} from './commands';
import { createMapStore, type MapDto } from './map-store';

interface Item extends MapDto {
  x: number;
}

const item = (id: string, x: number, version = 1): Item => ({ id, version, x });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(items: Item[] = [item('a', 0), item('b', 0)]) {
  const store = createMapStore('c', 'm');
  store.getState().hydrate({
    scene: { id: 'm', version: 1 },
    settings: null,
    collections: { items, others: [] },
  });
  const notify = vi.fn();
  const refetch = vi.fn(async () => undefined);
  const manager = new CommandManager({ store, notify, refetch, history: new CommandHistory() });
  const persistence = {
    create: vi.fn(async (drafts: readonly MapDto[]) =>
      drafts.map((d) => ({ ...d, id: `srv-${d.id}`, version: 1 })),
    ),
    update: vi.fn(async (updates: readonly EntityUpdate<MapDto>[]) =>
      updates.map((u) => ({ ...u.after, version: u.version + 1 })),
    ),
    remove: vi.fn(async (_items: readonly MapDto[]) => undefined),
  };
  const get = (id: string, key = 'items') =>
    store.getState().collections[key]?.get(id) as Item | undefined;
  const move = (
    id: string,
    x: number,
    p: Persistence<MapDto> = persistence as Persistence<MapDto>,
  ) =>
    updateCommand({
      label: 'Déplacer',
      collection: 'items',
      persistence: p,
      changes: [{ before: get(id)!, after: { ...get(id)!, x } }],
    });
  return { store, manager, notify, refetch, persistence, get, move };
}

describe('commandes', () => {
  it('applique tout de suite (optimiste), puis prend la réponse du serveur', async () => {
    const t = setup();
    const answer = deferred<MapDto[]>();
    const slow: Persistence<MapDto> = { update: () => answer.promise };
    const done = t.manager.execute(t.move('a', 10, slow));
    expect(t.get('a')).toMatchObject({ x: 10, version: 1 });
    expect(t.store.getState().pending.has('a')).toBe(true);
    answer.resolve([{ id: 'a', version: 2, x: 10 }]);
    expect(await done).toBe(true);
    expect(t.get('a')).toMatchObject({ x: 10, version: 2 });
    expect(t.store.getState().pending.has('a')).toBe(false);
  });

  it('défait l’optimisme et prévient en cas d’erreur', async () => {
    const t = setup();
    const failing: Persistence<MapDto> = {
      update: async () => {
        throw new ApiError({ status: 403, title: 'Interdit', detail: 'Réservé au MJ' });
      },
    };
    expect(await t.manager.execute(t.move('a', 10, failing))).toBe(false);
    expect(t.get('a')?.x).toBe(0);
    expect(t.notify).toHaveBeenCalledWith('Réservé au MJ');
    expect(t.manager.getSnapshot().canUndo).toBe(false);
  });

  it('409 : relit les éléments, puis « modifié entre-temps »', async () => {
    const t = setup();
    const conflict: Persistence<MapDto> = {
      update: async () => {
        throw new ApiError({ status: 409, title: 'Conflit', code: 'version_conflict' });
      },
    };
    await t.manager.execute(t.move('a', 10, conflict));
    expect(t.refetch).toHaveBeenCalledWith([{ collection: 'items', id: 'a' }]);
    expect(t.notify).toHaveBeenCalledWith(CONFLICT_MESSAGE);
    expect(t.get('a')?.x).toBe(0);
  });

  it('envoie la version rendue par la commande précédente (envois en file)', async () => {
    const t = setup();
    const first = t.manager.execute(t.move('a', 10));
    const second = t.manager.execute(t.move('a', 20));
    await Promise.all([first, second]);
    const versions = t.persistence.update.mock.calls.map((c) => c[0][0]!.version);
    expect(versions).toEqual([1, 2]);
    expect(t.get('a')).toMatchObject({ x: 20, version: 3 });
  });

  it('annuler envoie l’inverse ; refaire la renvoie', async () => {
    const t = setup();
    await t.manager.execute(t.move('a', 10));
    expect(await t.manager.undo()).toBe(true);
    expect(t.get('a')?.x).toBe(0);
    expect(t.persistence.update).toHaveBeenCalledTimes(2);
    expect(t.persistence.update.mock.calls[1]![0][0]!.changes).toEqual({ x: 0 });
    expect(t.manager.getSnapshot()).toMatchObject({
      canUndo: false,
      canRedo: true,
      redoLabel: 'Déplacer',
    });
    expect(await t.manager.redo()).toBe(true);
    expect(t.get('a')?.x).toBe(10);
    expect(t.manager.getSnapshot()).toMatchObject({ canUndo: true, canRedo: false });
  });

  it('un geste sur plusieurs couches est une seule commande', async () => {
    const t = setup();
    t.store.getState().upsert('others', [item('o', 5)], { force: true });
    const cmd = groupCommands('Déplacer 3 éléments', [
      updateCommand({
        label: 'Déplacer 3 éléments',
        collection: 'items',
        persistence: t.persistence as Persistence<MapDto>,
        changes: [
          { before: t.get('a')!, after: { ...t.get('a')!, x: 1 } },
          { before: t.get('b')!, after: { ...t.get('b')!, x: 2 } },
        ],
      }),
      updateCommand({
        label: 'Déplacer 3 éléments',
        collection: 'others',
        persistence: t.persistence as Persistence<MapDto>,
        changes: [{ before: t.get('o', 'others')!, after: { ...t.get('o', 'others')!, x: 3 } }],
      }),
    ]);
    await t.manager.execute(cmd);
    expect(t.persistence.update).toHaveBeenCalledTimes(2);
    expect(t.manager.history.undo).toHaveLength(1);
    await t.manager.undo();
    expect([t.get('a')?.x, t.get('b')?.x, t.get('o', 'others')?.x]).toEqual([0, 0, 5]);
  });

  it('annuler une suppression recrée l’élément, suivi sous son nouvel identifiant', async () => {
    const t = setup();
    const aliases = vi.fn();
    t.manager.onAlias(aliases);
    const p = t.persistence as Persistence<MapDto>;
    await t.manager.execute(
      deleteCommand({
        label: 'Supprimer',
        collection: 'items',
        persistence: p,
        items: [t.get('a')!],
      }),
    );
    expect(t.get('a')).toBeUndefined();
    await t.manager.undo();
    expect(t.get('srv-a')).toMatchObject({ x: 0 });
    expect(aliases).toHaveBeenCalledWith('a', 'srv-a');
    // Refaire supprime l'élément recréé, pas l'ancien identifiant
    await t.manager.redo();
    expect(t.persistence.remove.mock.calls[1]![0][0]!.id).toBe('srv-a');
    expect(t.get('srv-a')).toBeUndefined();
  });

  it('une création remplace l’identifiant provisoire par celui du serveur', async () => {
    const t = setup();
    const id = tempId();
    const created = t.manager.execute(
      createCommand({
        label: 'Créer',
        collection: 'items',
        persistence: t.persistence as Persistence<MapDto>,
        items: [item(id, 42, 0)],
      }),
    );
    expect(t.get(id)?.x).toBe(42);
    await created;
    expect(t.get(id)).toBeUndefined();
    expect(t.get(`srv-${id}`)?.x).toBe(42);
  });

  it('garde 100 entrées au plus dans la pile', async () => {
    const t = setup();
    for (let i = 1; i <= UNDO_LIMIT + 5; i++) await t.manager.execute(t.move('a', i));
    expect(t.manager.history.undo).toHaveLength(UNDO_LIMIT);
  });

  it('diffFields ne garde que les champs changés (comparaison profonde)', () => {
    expect(
      diffFields(
        { id: 'a', version: 1, pos: { x: 1, y: 2 }, points: [1, 2], name: 'x' },
        { id: 'a', version: 1, pos: { x: 1, y: 2 }, points: [1, 3], name: 'x' },
      ),
    ).toEqual({ points: [1, 3] });
  });
});
