import { describe, expect, it } from 'vitest';
import { LiveChannel, LIVE_KIND } from '../live/live-channel';
import { CommandHistory, CommandManager } from '../store/commands';
import { createMapStore } from '../store/map-store';
import { field } from './entities/entity-kind';
import { MapEngine } from './map-engine';
import { box, boxKind, fakeBackend, GM, setup, spyPersistence, type Box } from './test-kit';

describe('MapEngine', () => {
  it('suit le magasin par diffs : ajout, changement, retrait (et la sélection suit)', () => {
    const t = setup({ boxes: [box('a', 100, 100)] });
    const entity = t.engine.entity('a')!;
    t.engine.selection.replace(['a']);
    t.store.getState().upsert('boxes', [box('a', 400, 100, { version: 2 })]);
    // Même entité, nouvelle géométrie
    expect(t.engine.entity('a')).toBe(entity);
    expect(entity.geometry.x).toBe(400);
    expect(t.engine.hitTest({ x: 400, y: 100 })?.id).toBe('a');
    expect(t.engine.hitTest({ x: 100, y: 100 })).toBeNull();
    t.store.getState().remove('boxes', ['a']);
    expect(t.engine.entity('a')).toBeUndefined();
    expect(t.engine.selection.ids).toEqual([]);
  });

  it('« Affichage » masque une famille entière : ni vue, ni touchable', () => {
    const t = setup({ boxes: [box('a', 100, 100)], kind: { display: 'objects' } });
    expect(t.engine.hitTest({ x: 100, y: 100 })?.id).toBe('a');
    const scene = t.store.getState().scene!;
    t.store.getState().setScene({ ...scene, version: 2, display: { objects: false } });
    expect(t.engine.entity('a')?.masks.has('display')).toBe(true);
    expect(t.engine.hitTest({ x: 100, y: 100 })).toBeNull();
  });

  it('dupliquer sélectionne les copies, sous l’identifiant du serveur', async () => {
    const t = setup({ boxes: [box('a', 100, 100)] });
    t.engine.selection.replace(['a']);
    await t.engine.duplicateSelection();
    await t.commands.idle();
    const [copy] = t.engine.selection.ids;
    expect(copy).toMatch(/^srv-tmp-/);
    expect(t.engine.entity(copy!)?.geometry).toMatchObject({ x: 150, y: 150 });
  });

  it('les fantômes des autres suivent le direct, puis se posent', () => {
    const store = createMapStore('campagne', 'carte');
    store.getState().hydrate({
      scene: { id: 'carte', version: 1, width: 1000, height: 1000 },
      settings: null,
      collections: { boxes: [box('a', 100, 100)] },
    });
    let now = 1_000;
    const live = new LiveChannel({
      mapId: 'carte',
      selfId: 'mj',
      transport: null,
      audienceOf: () => 'public',
      now: () => now,
    });
    const engine = new MapEngine({
      store,
      viewer: GM,
      commands: new CommandManager({
        store,
        history: new CommandHistory(),
        notify: () => undefined,
        refetch: async () => undefined,
      }),
      backend: fakeBackend(),
      live,
      rememberCamera: false,
      now: () => now,
    });
    engine.registerKind(boxKind(spyPersistence()));
    const from = { userId: 'joueur', role: 'player' };
    live.receive({ kind: LIVE_KIND, data: { m: 'carte', s: 1, drag: [['a', 200, 100]] }, from });
    now += 100;
    live.receive({ kind: LIVE_KIND, data: { m: 'carte', s: 2, drag: [['a', 300, 100]] }, from });
    now += 50;
    expect(engine.tick(now)).toBe(true);
    const a = engine.entity('a')!;
    expect(a.state.remote).toBe(true);
    expect(a.current.x).toBeCloseTo(250);
    // L'événement durable arrive : le fantôme se pose
    store.getState().upsert('boxes', [box('a', 300, 100, { version: 2 })]);
    engine.tick(now);
    expect(a.state.remote).toBe(false);
    expect(a.preview).toBeNull();
    expect(a.current.x).toBe(300);
    engine.destroy();
  });

  it('audience du direct : masqué aux joueurs ou calque caché → MJ seulement', () => {
    const t = setup({
      layers: [
        {
          id: 'secret',
          version: 1,
          name: 'Secret',
          sortOrder: 0,
          visibleToPlayers: false,
          locked: false,
          opacity: 1,
        },
        {
          id: 'public',
          version: 1,
          name: 'Public',
          sortOrder: 1,
          visibleToPlayers: true,
          locked: false,
          opacity: 1,
        },
      ],
      boxes: [
        box('a', 100, 100, { layerId: 'public' }),
        box('b', 200, 200, { layerId: 'secret' }),
        box('c', 300, 300, { layerId: 'public', hidden: true } as Partial<Box>),
      ],
      kind: { hidden: field<Box, boolean>('hidden') },
    });
    expect(t.engine.liveAudience('a')).toBe('public');
    expect(t.engine.liveAudience('b')).toBe('gm');
    expect(t.engine.liveAudience('c')).toBe('gm');
    expect(t.engine.liveAudience('inconnu')).toBe('gm');
  });

  it('un plan forcé (vision) passe devant, puis l’entité retrouve son calque', () => {
    const t = setup({
      boxes: [box('a', 100, 100, { layerId: 'sol' }), box('b', 100, 100, { layerId: 'sol', z: 5 })],
      layers: [{ id: 'sol', version: 1, name: 'Sol', sortOrder: 0 }],
      kind: {
        stacking: {
          arrangeKind: 'object',
          layerId: field<Box, string | null>('layerId'),
          z: field<Box, number>('z'),
        },
      },
    });
    const a = t.engine.entity('a')!;
    expect(a.plane).toBe('content');
    expect(t.engine.hitTest({ x: 100, y: 100 })?.id).toBe('b');
    t.engine.setPlaneOverride(a, 'allies');
    expect(a.plane).toBe('allies');
    expect(a.layerId).toBe('sol');
    expect(t.engine.hitTest({ x: 100, y: 100 })?.id).toBe('a');
    // Une donnée nouvelle garde le forçage
    t.store.getState().upsert('boxes', [box('a', 100, 100, { layerId: 'sol', version: 2 })]);
    expect(a.plane).toBe('allies');
    t.engine.setPlaneOverride(a, null);
    expect(a.plane).toBe('content');
    expect(t.engine.hitTest({ x: 100, y: 100 })?.id).toBe('b');
  });

  it('se construit et se détruit sans rendu (aucune fuite d’abonnement)', () => {
    const t = setup({ boxes: [box('a', 1, 1)] });
    t.engine.destroy();
    t.store.getState().upsert('boxes', [box('b', 5, 5)]);
    expect(t.engine.entity('b')).toBeUndefined();
    expect(t.engine.isDestroyed).toBe(true);
  });
});
