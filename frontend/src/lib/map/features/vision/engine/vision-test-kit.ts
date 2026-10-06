/**
 * Banc d'essai de la visibilité (tests, sans WebGL) : moteur à blanc, sortes « token » et
 * « objet » minimales, carte 1000 × 1000 avec le héros d'Alice en (100, 100) et un mur
 * vertical en x = 200.
 */
import { vi } from 'vitest';
import type { EntityKind, MapViewer } from '@/lib/map/engine/entities/entity-kind';
import { MapEngine, type MapPlayer } from '@/lib/map/engine/map-engine';
import { spyPersistence } from '@/lib/map/engine/test-kit';
import { CommandHistory, CommandManager } from '@/lib/map/store/commands';
import { createMapStore, type MapDto } from '@/lib/map/store/map-store';
import { Fades, VISION_MASK } from './fades';
import { applyDecisions } from '../index';
import { VisionState } from './vision-state';

export const ALICE: MapViewer = { userId: 'alice', role: 'player', characterIds: ['c-heros'] };
export const GM: MapViewer = { userId: 'mj', role: 'gm', characterIds: ['c-orc', 'c-gob'] };
export const PLAYERS: MapPlayer[] = [
  { userId: 'alice', name: 'Alice', characterIds: ['c-heros'] },
  { userId: 'bob', name: 'Bob', characterIds: ['c-barde'] },
];

export const token = (
  id: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
): MapDto => ({
  id,
  version: 1,
  mapId: 'carte',
  characterId: `c-${id}`,
  layerId: 'persos',
  z: 0,
  pos: { x, y },
  scale: 1,
  visibility: 'visible',
  visibleTo: [],
  visionRadius: 100,
  visionBoost: false,
  ...extra,
});

export const object = (
  id: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
): MapDto => ({
  id,
  version: 1,
  mapId: 'carte',
  name: id,
  kind: 'item',
  pos: { x, y },
  width: 20,
  height: 20,
  rotation: 0,
  layerId: 'objets',
  z: 0,
  visibility: 'visible',
  visibleTo: [],
  items: [],
  ...extra,
});

export const wall = (
  id: string,
  x: number,
  y0: number,
  y1: number,
  extra: Record<string, unknown> = {},
): MapDto => ({
  id,
  version: 1,
  mapId: 'carte',
  kind: 'wall',
  points: [
    { x, y: y0 },
    { x, y: y1 },
  ],
  blocksFrom: null,
  isOpen: false,
  isLocked: false,
  color: null,
  opacity: 1,
  roomMode: null,
  ...extra,
});

const tokenKind: EntityKind = {
  id: 'token',
  label: 'Token',
  collection: 'tokens',
  capabilities: ['select', 'move'],
  plane: 'content',
  geometry: (t) => {
    const p = t.pos as { x: number; y: number };
    return { x: p.x, y: p.y, width: 50, height: 50, rotation: 0 };
  },
  applyGeometry: (t, g) => ({ ...t, pos: { x: g.x, y: g.y } }),
  can: () => true,
  persistence: spyPersistence(),
};

const objectKind: EntityKind = {
  id: 'object',
  label: 'Objet',
  collection: 'objects',
  capabilities: ['select', 'move'],
  plane: 'content',
  geometry: (o) => {
    const p = o.pos as { x: number; y: number };
    const w = o.width as number;
    const h = o.height as number;
    return { x: p.x + w / 2, y: p.y + h / 2, width: w, height: h, rotation: o.rotation as number };
  },
  can: () => true,
  persistence: spyPersistence(),
};

/** Carte 1000 × 1000 : héros d'Alice (100, 100), rayon 100, mur vertical en x = 200. */
export function setup(
  opts: {
    viewer?: MapViewer;
    tokens?: MapDto[];
    objects?: MapDto[];
    obstacles?: MapDto[];
    extra?: Record<string, MapDto[]>;
    players?: MapPlayer[] | null;
  } = {},
) {
  const store = createMapStore('campagne', 'carte');
  store.getState().hydrate({
    scene: { id: 'carte', version: 1, width: 1250, height: 1250, fogFull: false, display: {} },
    settings: { version: 1, pixelsPerUnit: 50, tokenScale: 1, shadowOpacity: 0.8 },
    collections: {
      tokens: [token('heros', 100, 100), ...(opts.tokens ?? [])],
      objects: opts.objects ?? [],
      obstacles: opts.obstacles ?? [wall('mur', 200, 0, 1000)],
      layers: [
        { id: 'persos', version: 1, name: 'Personnages', sortOrder: 2, visibleToPlayers: true },
        { id: 'objets', version: 1, name: 'Objets', sortOrder: 1, visibleToPlayers: true },
      ],
      ...opts.extra,
    },
  });
  const commands = new CommandManager({
    store,
    history: new CommandHistory(),
    notify: vi.fn(),
    refetch: vi.fn(async () => undefined),
  });
  const players = opts.players === undefined ? PLAYERS : opts.players;
  const engine = new MapEngine({
    store,
    viewer: opts.viewer ?? ALICE,
    commands,
    rememberCamera: false,
    directory: {
      characters: () => [
        { id: 'c-heros', name: 'Héros' },
        { id: 'c-barde', name: 'Barde' },
      ],
      userName: () => null,
      ...(players ? { players: () => players } : {}),
    },
  });
  engine.registerKind(tokenKind);
  engine.registerKind(objectKind);
  const state = new VisionState(engine);
  const fades = new Fades(engine);
  const run = () => {
    const changed = state.sync();
    applyDecisions(engine, state, fades, 0);
    fades.step(1_000);
    return changed;
  };
  return {
    store,
    engine,
    state,
    run,
    masked: (id: string) => engine.entity(id)!.masks.has(VISION_MASK),
  };
}
