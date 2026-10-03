/**
 * Premier chargement réel : le moteur existe (modules enregistrés) avant que la scène arrive, et
 * les réglages arrivent en même temps que les couches. Toutes les entités doivent être créées.
 */
import { describe, expect, it, vi } from 'vitest';
import { CommandHistory, CommandManager } from '../store/commands';
import { createMapStore } from '../store/map-store';
import { MapEngine } from './map-engine';
import { box, boxKind, fakeBackend, GM, spyPersistence } from './test-kit';

function emptyEngine() {
  const store = createMapStore('campagne', 'carte');
  const commands = new CommandManager({
    store,
    history: new CommandHistory(),
    notify: vi.fn(),
    refetch: vi.fn(async () => undefined),
  });
  const engine = new MapEngine({
    store,
    viewer: GM,
    commands,
    backend: fakeBackend(),
    rememberCamera: false,
    notify: vi.fn(),
  });
  engine.registerKind(boxKind(spyPersistence()));
  engine.resize(1000, 1000);
  return { store, engine };
}

describe('MapEngine : premier chargement', () => {
  it('scène, réglages et couches d’un coup : toutes les entités sont créées', () => {
    const { store, engine } = emptyEngine();
    store.getState().hydrate({
      scene: { id: 'carte', version: 1, width: 1000, height: 1000, backgroundUrl: null },
      settings: { version: 1, pixelsPerUnit: 50, tokenScale: 1 },
      collections: { boxes: [box('a', 100, 100), box('b', 300, 300)], layers: [] },
    });
    expect(engine.entity('a')).toBeDefined();
    expect(engine.entity('b')).toBeDefined();
    expect(engine.hitTest({ x: 300, y: 300 })?.id).toBe('b');
    engine.destroy();
  });

  it('nouveaux réglages : les entités existantes sont recalculées, aucune ne se perd', () => {
    const { store, engine } = emptyEngine();
    store.getState().hydrate({
      scene: { id: 'carte', version: 1, width: 1000, height: 1000, backgroundUrl: null },
      settings: { version: 1, pixelsPerUnit: 50, tokenScale: 1 },
      collections: { boxes: [box('a', 100, 100)], layers: [] },
    });
    store.getState().hydrate({
      scene: { id: 'carte', version: 1, width: 1000, height: 1000, backgroundUrl: null },
      settings: { version: 2, pixelsPerUnit: 100, tokenScale: 1 },
      collections: { boxes: [box('a', 100, 100), box('c', 500, 500)], layers: [] },
    });
    expect(engine.entity('a')).toBeDefined();
    expect(engine.entity('c')).toBeDefined();
    engine.destroy();
  });
});
