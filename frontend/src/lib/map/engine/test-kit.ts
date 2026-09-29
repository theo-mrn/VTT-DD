/**
 * Banc d'essai du moteur, sans WebGL ni DOM : un moteur « à blanc » sur un magasin réel, une
 * sorte d'entité factice (des boîtes), une persistance espionnée et des pointeurs synthétiques.
 * Réservé aux tests (`*.test.ts`).
 */
import { vi } from 'vitest';
import {
  CommandManager,
  CommandHistory,
  type EntityUpdate,
  type Persistence,
} from '../store/commands';
import { createMapStore, type MapDto } from '../store/map-store';
import { field, gmOnly, type EntityKind, type MapViewer } from './entities/entity-kind';
import type { Point } from './geometry';
import { MapEngine, type EngineBackend } from './map-engine';
import type { MapKey, MapPointer } from './tools/tool';

export interface Box extends MapDto {
  x: number;
  y: number;
  w: number;
  h: number;
  locked?: boolean;
  layerId?: string | null;
  z?: number;
}

export const GM: MapViewer = { userId: 'mj', role: 'gm', characterIds: [] };

export function box(id: string, x: number, y: number, extra: Partial<Box> = {}): Box {
  return { id, version: 1, x, y, w: 40, h: 40, layerId: null, z: 0, ...extra };
}

/** Persistance espionnée : répond comme le serveur (version + 1, identifiant définitif). */
export function spyPersistence() {
  const persistence = {
    create: vi.fn(async (drafts: readonly MapDto[]) =>
      drafts.map((d) => ({ ...d, id: `srv-${d.id}`, version: 1 })),
    ),
    update: vi.fn(async (updates: readonly EntityUpdate<MapDto>[]) =>
      updates.map((u) => ({ ...u.after, version: u.version + 1 })),
    ),
    remove: vi.fn(async (_items: readonly MapDto[]) => undefined),
  };
  return persistence as typeof persistence & Persistence<MapDto>;
}

export function boxKind(
  persistence: Persistence<MapDto>,
  extra: Partial<EntityKind<Box>> = {},
): EntityKind<Box> {
  return {
    id: 'box',
    label: 'Boîte',
    collection: 'boxes',
    capabilities: [
      'select',
      'move',
      'rotate',
      'resize',
      'lock',
      'hide',
      'duplicate',
      'delete',
      'inspect',
      'order',
    ],
    plane: 'content',
    stacking: {
      arrangeKind: 'object',
      layerId: field<Box, string | null>('layerId'),
      z: field<Box, number>('z'),
      defaultRole: 'objects',
    },
    geometry: (b) => ({ x: b.x, y: b.y, width: b.w, height: b.h, rotation: 0 }),
    applyGeometry: (b, g) => ({ ...b, x: g.x, y: g.y, w: g.width, h: g.height }),
    locked: field<Box, boolean>('locked'),
    name: (b) => `Boîte ${b.id}`,
    can: gmOnly,
    duplicate: (b, offset) => ({ ...b, x: b.x + offset.x, y: b.y + offset.y }),
    persistence: persistence as Persistence<Box>,
    ...extra,
  };
}

export function fakeBackend(): EngineBackend & { arrange: ReturnType<typeof vi.fn> } {
  return {
    arrange: vi.fn(async () => undefined),
    collection: () => spyPersistence(),
    deleteLayer: vi.fn(async () => undefined),
    updateScene: vi.fn(async (patch: Record<string, unknown>) => ({
      id: 'carte',
      version: 2,
      ...patch,
    })),
    rescale: vi.fn(async () => undefined),
  };
}

/** Moteur à blanc sur une carte de 1000 × 1000, vue de 1000 × 1000 (zoom ≈ 0,95). */
export function setup(
  opts: {
    boxes?: Box[];
    layers?: MapDto[];
    viewer?: MapViewer;
    kind?: Partial<EntityKind<Box>>;
  } = {},
) {
  const store = createMapStore('campagne', 'carte');
  const notify = vi.fn();
  const refetch = vi.fn(async () => undefined);
  const commands = new CommandManager({ store, history: new CommandHistory(), notify, refetch });
  const backend = fakeBackend();
  const persistence = spyPersistence();
  store.getState().hydrate({
    scene: { id: 'carte', version: 1, width: 1000, height: 1000, backgroundUrl: null },
    settings: { version: 1, pixelsPerUnit: 50, tokenScale: 1 },
    collections: { boxes: opts.boxes ?? [], layers: opts.layers ?? [] },
  });
  const engine = new MapEngine({
    store,
    viewer: opts.viewer ?? GM,
    commands,
    backend,
    rememberCamera: false,
    notify,
  });
  engine.registerKind(boxKind(persistence, opts.kind));
  engine.resize(1000, 1000);

  let time = 1_000;
  const pointer = (world: Point, extra: Partial<MapPointer> = {}): MapPointer => ({
    id: 1,
    type: 'mouse',
    button: 0,
    buttons: 1,
    screen: engine.camera.worldToScreen(world),
    world,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    time: (time += 1_000),
    ...extra,
  });
  const key = (k: string, extra: Partial<MapKey> = {}): MapKey => ({
    key: k,
    code: extra.code ?? (k.length === 1 ? `Key${k.toUpperCase()}` : k),
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    repeat: false,
    ...extra,
  });
  const c = engine.controller;
  /** Clic complet (bouton, lâcher) au même point. */
  const click = (world: Point, extra: Partial<MapPointer> = {}) => {
    c.pointerDown(pointer(world, extra));
    c.pointerUp(pointer(world, { ...extra, buttons: 0 }));
  };
  /** Glisser de `from` à `to`, en plusieurs pas. */
  const drag = (from: Point, to: Point, extra: Partial<MapPointer> = {}, release = true) => {
    c.pointerDown(pointer(from, extra));
    for (let i = 1; i <= 4; i++)
      c.pointerMove(
        pointer(
          { x: from.x + ((to.x - from.x) * i) / 4, y: from.y + ((to.y - from.y) * i) / 4 },
          { ...extra, button: -1 },
        ),
      );
    if (release) c.pointerUp(pointer(to, { ...extra, buttons: 0 }));
  };
  const data = (id: string) => store.getState().collections.boxes?.get(id) as Box | undefined;
  return {
    store,
    engine,
    commands,
    backend,
    persistence,
    notify,
    refetch,
    pointer,
    key,
    click,
    drag,
    data,
  };
}
