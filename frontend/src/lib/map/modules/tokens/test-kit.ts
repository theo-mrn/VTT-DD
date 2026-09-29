/**
 * Banc d'essai du module `tokens`, sans WebGL ni React : un moteur à blanc avec la sorte
 * `token`, un annuaire rempli à la main, un faux client des PNJ et une persistance espionnée.
 * Réservé aux tests (`*.test.ts`).
 */
import type { MapNpcsCreated, MapToken } from '@vtt/contracts';
import { vi } from 'vitest';
import { fakeBackend, GM, spyPersistence } from '../../engine/test-kit';
import type { MapViewer } from '../../engine/entities/entity-kind';
import type { Point } from '../../engine/geometry';
import { MapEngine } from '../../engine/map-engine';
import type { MapKey, MapPointer } from '../../engine/tools/tool';
import { CommandHistory, CommandManager } from '../../store/commands';
import { createMapStore, type MapDto } from '../../store/map-store';
import type { NpcApi } from './api';
import { TOKEN_KIND_ID } from './edit';
import type { CharacterInfo, TokenData } from './model';
import { TOKENS_TOOL_ID, TokenPlaceTool } from './place-tool';
import { attachTokensState, createTokensState } from './state';
import { createTokenKind, watchDirectory } from './token-kind';

export const ALICE: MapViewer = { userId: 'alice', role: 'player', characterIds: ['hero'] };
export const SPECTATOR: MapViewer = { userId: 'spec', role: 'spectator', characterIds: [] };

export function token(id: string, characterId: string, extra: Partial<TokenData> = {}): TokenData {
  return {
    id,
    mapId: 'carte',
    version: 1,
    updatedAt: '',
    characterId,
    layerId: 'personnages',
    z: 0,
    pos: { x: 500, y: 500 },
    scale: 1,
    shape: 'circle',
    imageUrl: null,
    visibility: 'visible',
    visibleTo: [],
    visionRadius: 100,
    visionBoost: false,
    notes: null,
    audio: null,
    interactions: null,
    ...extra,
  };
}

export function character(id: string, extra: Partial<CharacterInfo> = {}): CharacterInfo {
  return {
    id,
    name: id,
    portraitUrl: null,
    side: 'enemies',
    kind: 'npc',
    ownerId: 'mj',
    playedBy: null,
    resource: null,
    ...extra,
  };
}

const LAYERS: MapDto[] = [
  {
    id: 'personnages',
    version: 1,
    name: 'Personnages',
    sortOrder: 3,
    visibleToPlayers: true,
    locked: false,
    opacity: 1,
    role: 'tokens',
  },
];

/** Faux client des PNJ : répond comme le service (tokens créés en grille, ids `srv-…`). */
export function fakeNpcApi() {
  let n = 0;
  const created = (count: number, pos: Point, extra: Partial<TokenData> = {}): MapNpcsCreated => {
    const items = Array.from({ length: count }, (_, i) => {
      n += 1;
      return token(`srv-${n}`, `npc-${n}`, { pos: { x: pos.x + i * 50, y: pos.y }, ...extra });
    }) as unknown as MapToken[];
    return {
      items,
      characters: items.map((t) => ({
        id: t.characterId,
        name: t.characterId,
        avatarUrl: null,
        templateId: null,
      })),
    };
  };
  const api = {
    place: vi.fn(async (body: { count?: number; pos: Point }) =>
      created(body.count ?? 1, body.pos),
    ),
    duplicate: vi.fn(async (_id: string, body: { pos: Point; count?: number }) =>
      created(body.count ?? 1, body.pos),
    ),
    removeWithCharacter: vi.fn(async (_id: string) => undefined),
  };
  return api as typeof api & NpcApi;
}

export function setupTokens(
  opts: {
    tokens?: TokenData[];
    characters?: CharacterInfo[];
    viewer?: MapViewer;
    players?: { id: string; name: string }[];
  } = {},
) {
  const store = createMapStore('campagne', 'carte');
  const notify = vi.fn();
  const commands = new CommandManager({
    store,
    history: new CommandHistory(),
    notify,
    refetch: vi.fn(async () => undefined),
  });
  const base = spyPersistence();
  const backend = { ...fakeBackend(), collection: () => base };
  store.getState().hydrate({
    scene: { id: 'carte', version: 1, width: 1000, height: 1000, backgroundUrl: null },
    settings: { version: 1, pixelsPerUnit: 50, tokenScale: 1, unitName: 'm' },
    collections: { tokens: opts.tokens ?? [], layers: LAYERS },
  });
  const engine = new MapEngine({
    store,
    viewer: opts.viewer ?? GM,
    commands,
    backend,
    rememberCamera: false,
    snap: 1,
    notify,
    directory: {
      characters: () => opts.players ?? [],
      userName: () => null,
    },
  });
  const api = fakeNpcApi();
  const tokens = createTokensState(engine, api);
  attachTokensState(engine, tokens);
  tokens.directory.replace(opts.characters ?? []);
  engine.registerKind(createTokenKind(tokens));
  watchDirectory(tokens);
  let tool: TokenPlaceTool | null = null;
  engine.registerTool({
    id: TOKENS_TOOL_ID,
    label: 'Personnages',
    icon: () => null,
    available: (v) => v.role === 'gm',
    create: () => {
      tool = new TokenPlaceTool(tokens);
      tokens.tool = tool;
      return tool;
    },
  });
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
  const key = (code: string, extra: Partial<MapKey> = {}): MapKey => ({
    key: extra.key ?? code,
    code,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    repeat: false,
    ...extra,
  });
  const c = engine.controller;
  const click = (world: Point, extra: Partial<MapPointer> = {}) => {
    c.pointerDown(pointer(world, extra));
    c.pointerUp(pointer(world, { ...extra, buttons: 0 }));
  };
  const drag = (from: Point, to: Point) => {
    c.pointerDown(pointer(from));
    for (let i = 1; i <= 4; i++)
      c.pointerMove(
        pointer(
          { x: from.x + ((to.x - from.x) * i) / 4, y: from.y + ((to.y - from.y) * i) / 4 },
          { button: -1 },
        ),
      );
    c.pointerUp(pointer(to, { buttons: 0 }));
  };
  const data = (id: string) =>
    store.getState().collections.tokens?.get(id) as TokenData | undefined;
  const all = () => [...(store.getState().collections.tokens?.values() ?? [])] as TokenData[];
  const entity = (id: string) => engine.entity(id)!;
  const activateTool = () => {
    engine.tools.activate(TOKENS_TOOL_ID);
    return tool!;
  };
  return {
    store,
    engine,
    commands,
    notify,
    base,
    api,
    tokens,
    pointer,
    key,
    click,
    drag,
    data,
    all,
    entity,
    activateTool,
    kind: () => engine.kinds.get(TOKEN_KIND_ID)!,
  };
}
