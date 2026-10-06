/**
 * Banc d'essai du module « objets » (tests seulement) : le moteur à blanc du banc commun, les
 * sortes `object` et `decor` branchées sur une persistance espionnée, des objets et des tokens.
 */
import { setup, spyPersistence, GM } from '@/lib/map/engine/test-kit';
import type { MapViewer } from '@/lib/map/engine/entities/entity-kind';
import type { Persistence } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';
import { createObjectKinds } from './object-kind';
import type { ObjectData } from './types';

export const PLAYER: MapViewer = { userId: 'joueuse', role: 'player', characterIds: ['aldric'] };
export const SPECTATOR: MapViewer = { userId: 'curieux', role: 'spectator', characterIds: [] };
export { GM };

/** Un objet de 100 × 50 dont le coin haut gauche est (x, y). */
export function obj(id: string, x: number, y: number, extra: Partial<ObjectData> = {}): ObjectData {
  return {
    id,
    mapId: 'carte',
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: `Objet ${id}`,
    kind: 'item',
    imageUrl: '',
    pos: { x, y },
    width: 100,
    height: 50,
    rotation: 0,
    layerId: 'objets',
    z: 1,
    isLocked: false,
    visibility: 'visible',
    visibleTo: [],
    notes: null,
    items: [],
    linkedId: null,
    groupEntityId: null,
    searchable: false,
    searchRadius: 1.5,
    ...extra,
  } as ObjectData;
}

export function token(id: string, characterId: string, x: number, y: number): MapDto {
  return { id, version: 1, characterId, pos: { x, y }, layerId: 'persos', z: 1 };
}

export const LAYERS: MapDto[] = [
  { id: 'sol', version: 1, name: 'Sol', sortOrder: 0, role: 'ground', visibleToPlayers: true },
  {
    id: 'objets',
    version: 1,
    name: 'Objets',
    sortOrder: 1,
    role: 'objects',
    visibleToPlayers: true,
  },
  {
    id: 'persos',
    version: 1,
    name: 'Personnages',
    sortOrder: 2,
    role: 'tokens',
    visibleToPlayers: true,
  },
];

export function setupObjects(
  opts: {
    objects?: ObjectData[];
    tokens?: MapDto[];
    viewer?: MapViewer;
    layers?: MapDto[];
    openSearch?(id: string): void;
  } = {},
) {
  const t = setup({ viewer: opts.viewer, layers: opts.layers ?? LAYERS });
  const persistence = spyPersistence();
  const kinds = createObjectKinds(t.engine, {
    persistence: persistence as unknown as Persistence<ObjectData>,
    openSearch: opts.openSearch,
  });
  for (const k of kinds) t.engine.registerKind(k);
  if (opts.tokens) t.store.getState().upsert('tokens', opts.tokens);
  if (opts.objects) t.store.getState().upsert('objects', opts.objects);
  const object = (id: string) =>
    t.store.getState().collections.objects?.get(id) as ObjectData | undefined;
  return { ...t, objects: persistence, kinds, object };
}
