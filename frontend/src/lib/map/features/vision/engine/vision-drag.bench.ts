/**
 * Budget du rendu de la visibilité pendant un glisser (docs/carte.md § 9) : < 4 ms par image
 * sur une carte de 1 000 murs. Mesure la part CPU faite à chaque image du glisser, à blanc :
 * `VisionState.sync` (vue de l'observateur déplacé, tokens et objets décidés) et masquage. Le
 * rendu GPU (textures à ½ et ¼ de la résolution) se mesure en développement dans le
 * navigateur (`window.__vttVision.summary()`, étape `render`).
 *
 * `pnpm --filter @vtt/web exec vitest bench --run src/lib/map/features/vision/engine/vision-drag.bench.ts`
 */
import { encodeMask, explorationGrid, ExplorationMask } from '@vtt/vision';
import { bench, describe } from 'vitest';
import { attachExploration } from '@/lib/map/features/exploration/engine/model';
import type { EntityKind, MapViewer } from '@/lib/map/engine/entities/entity-kind';
import { MapEngine, type MapPlayer } from '@/lib/map/engine/map-engine';
import { spyPersistence } from '@/lib/map/engine/test-kit';
import { CommandHistory, CommandManager } from '@/lib/map/store/commands';
import { createMapStore, type MapDto } from '@/lib/map/store/map-store';
import { Fades } from './fades';
import { applyDecisions } from '../index';
import { VisionState } from './vision-state';

/** Générateur pseudo-aléatoire à graine (mesures reproductibles). */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const CELL = 200;
const GRID = 13;
const SIZE = CELL * GRID;

/** Donjon en grille : cloisons en trois morceaux (mur, porte, mur), piliers, pièces fermées. */
function dungeon() {
  const rand = prng(7);
  const obstacles: MapDto[] = [];
  let n = 0;
  const seg = (kind: string, a: [number, number], b: [number, number], extra = {}) =>
    obstacles.push({
      id: `o${n++}`,
      version: 1,
      kind,
      points: [
        { x: a[0], y: a[1] },
        { x: b[0], y: b[1] },
      ],
      blocksFrom: null,
      isOpen: false,
      isLocked: false,
      opacity: 1,
      ...extra,
    });
  for (let i = 0; i <= GRID; i++)
    for (let j = 0; j < GRID; j++) {
      const a = j * CELL;
      const d0 = a + 80;
      const d1 = a + 120;
      const open = rand() < 0.5;
      // Cloison horizontale y = i·CELL, puis verticale x = i·CELL
      seg('wall', [a, i * CELL], [d0, i * CELL]);
      seg('door', [d0, i * CELL], [d1, i * CELL], { isOpen: open });
      seg('wall', [d1, i * CELL], [a + CELL, i * CELL]);
      seg('wall', [i * CELL, a], [i * CELL, d0]);
      seg('door', [i * CELL, d0], [i * CELL, d1], { isOpen: !open });
      seg('wall', [i * CELL, d1], [i * CELL, a + CELL]);
    }
  // Piliers
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(rand() * GRID) * CELL + 60 + rand() * 80;
    const y = Math.floor(rand() * GRID) * CELL + 60 + rand() * 80;
    seg('wall', [x, y], [x + 12, y]);
    seg('wall', [x + 12, y], [x + 12, y + 12]);
    seg('wall', [x + 12, y + 12], [x, y + 12]);
    seg('wall', [x, y + 12], [x, y]);
  }
  const rooms: MapDto[] = [];
  for (let k = 0; k < 30; k++) {
    const x = Math.floor(rand() * GRID) * CELL;
    const y = Math.floor(rand() * GRID) * CELL;
    rooms.push({
      id: `r${k}`,
      version: 1,
      points: [
        { x, y },
        { x: x + CELL, y },
        { x: x + CELL, y: y + CELL },
        { x, y: y + CELL },
      ],
    });
  }
  return { obstacles, rooms };
}

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
  ...tokenKind,
  id: 'object',
  label: 'Objet',
  collection: 'objects',
  geometry: (o) => {
    const p = o.pos as { x: number; y: number };
    return { x: p.x + 10, y: p.y + 10, width: 20, height: 20, rotation: 0 };
  },
};

function setup(viewer: MapViewer) {
  const rand = prng(11);
  const { obstacles, rooms } = dungeon();
  const at = () => ({
    x: Math.floor(rand() * GRID) * CELL + 30 + rand() * 140,
    y: Math.floor(rand() * GRID) * CELL + 30 + rand() * 140,
  });
  const token = (id: string, extra: Record<string, unknown> = {}): MapDto => ({
    id,
    version: 1,
    characterId: `c-${id}`,
    layerId: 'persos',
    pos: at(),
    scale: 1,
    visibility: 'visible',
    visibleTo: [],
    visionRadius: 300,
    ...extra,
  });
  const tokens = [
    token('heros', { pos: { x: 6.5 * CELL, y: 6.5 * CELL } }),
    token('barde'),
    token('garde', { visibility: 'ally' }),
    ...Array.from({ length: 60 }, (_, i) =>
      token(`pnj${i}`, { visibility: i % 3 ? 'visible' : 'hidden' }),
    ),
  ];
  const objects = Array.from({ length: 40 }, (_, i) => ({
    id: `obj${i}`,
    version: 1,
    kind: i % 4 ? 'item' : 'decor',
    pos: at(),
    width: 20,
    height: 20,
    rotation: 0,
    layerId: 'objets',
    visibility: 'visible',
    visibleTo: [],
  }));
  const lights = Array.from({ length: 10 }, (_, i) => ({
    id: `l${i}`,
    version: 1,
    pos: at(),
    radius: 3,
    visible: true,
    falloff: 0.5,
    color: '#ffcc88',
    intensity: 1,
    attachedTokenId: i === 0 ? 'heros' : null,
  }));
  const fogZones = Array.from({ length: 10 }, (_, i) => ({
    id: `z${i}`,
    version: 1,
    shape: 'circle',
    mode: i % 3 ? 'fog' : 'clear',
    points: [],
    center: at(),
    radius: 250,
    order: i,
  }));
  const store = createMapStore('campagne', 'carte');
  store.getState().hydrate({
    scene: {
      id: 'carte',
      version: 1,
      width: SIZE,
      height: SIZE,
      fogFull: false,
      display: {},
      exploration: 'party',
    },
    settings: { version: 1, pixelsPerUnit: 50, tokenScale: 1, shadowOpacity: 1 },
    collections: {
      tokens,
      objects,
      obstacles,
      rooms,
      lights,
      fogZones,
      layers: [
        { id: 'persos', version: 1, sortOrder: 1, visibleToPlayers: true },
        { id: 'objets', version: 1, sortOrder: 0, visibleToPlayers: true },
      ],
    },
  });
  const players: MapPlayer[] = [
    { userId: 'alice', name: 'Alice', characterIds: ['c-heros'] },
    { userId: 'bob', name: 'Bob', characterIds: ['c-barde'] },
    { userId: 'carla', name: 'Carla', characterIds: [] },
    { userId: 'dan', name: 'Dan', characterIds: [] },
  ];
  const engine = new MapEngine({
    store,
    viewer,
    commands: new CommandManager({
      store,
      history: new CommandHistory(),
      notify: () => {},
      refetch: async () => {},
    }),
    rememberCamera: false,
    directory: {
      characters: () => [
        { id: 'c-heros', name: 'Héros' },
        { id: 'c-barde', name: 'Barde' },
      ],
      userName: () => null,
      players: () => players,
    },
  });
  engine.registerKind(tokenKind);
  engine.registerKind(objectKind);
  const state = new VisionState(engine);
  const fades = new Fades(engine);
  state.sync();
  applyDecisions(engine, state, fades, 0);
  return { engine, state, fades, obstacles };
}

const player = setup({ userId: 'alice', role: 'player', characterIds: ['c-heros'] });
const heros = player.engine.entity('heros')!;
let step = 0;

// Mémoire de l'exploration (docs/exploration.md § 5.3) : masque vide connu, marqué en local
const GRID_CELLS = explorationGrid(SIZE, SIZE, 50);
player.engine.store.getState().setExtra('exploration', {
  mapId: 'carte',
  scope: 'party',
  cols: GRID_CELLS.cols,
  rows: GRID_CELLS.rows,
  version: 1,
  window: encodeMask(ExplorationMask.empty(GRID_CELLS)),
});
const memory = attachExploration(player.engine, null, {
  set: () => 0,
  clear: () => undefined,
}).model;

/** Deux vues du héros, déjà marquées : le régime établi d'un glisser. */
const steadyViews = [0, 60].map((dx) => {
  player.engine.setPreview(heros, { ...heros.geometry, x: heros.geometry.x + dx });
  player.state.sync();
  const live = player.state.liveView()!;
  memory.markLocal(live.prep, live.view);
  return live;
});

const gm = setup({ userId: 'mj', role: 'gm', characterIds: [] });
const pnj = gm.engine.entity('pnj1')!;

console.log(
  `carte ${SIZE} × ${SIZE} : ${player.obstacles.length} murs et portes, 30 pièces, 63 tokens, ` +
    '40 objets, 10 lumières (une torche sur le héros), 10 zones',
);

describe('glisser (par image)', () => {
  bench('joueur : son héros bouge, vue refaite, 103 entités décidées (budget 4 ms)', () => {
    step += 1;
    const dx = ((step % 80) - 40) * 3;
    player.engine.setPreview(heros, {
      ...heros.geometry,
      x: heros.geometry.x + dx,
      y: heros.geometry.y,
    });
    player.state.sync();
    applyDecisions(player.engine, player.state, player.fades, step);
  });

  bench('joueur : même chose, et la mémoire marquée à chaque image (10 Hz en vrai)', () => {
    step += 1;
    const dx = ((step % 80) - 40) * 3;
    player.engine.setPreview(heros, {
      ...heros.geometry,
      x: heros.geometry.x + dx,
      y: heros.geometry.y,
    });
    player.state.sync();
    applyDecisions(player.engine, player.state, player.fades, step);
    const live = player.state.liveView();
    if (live) memory.markLocal(live.prep, live.view);
  });

  bench(
    `mémoire : premier marquage d'une vue, ${GRID_CELLS.cols} × ${GRID_CELLS.rows} cases`,
    () => {
      const live = player.state.liveView();
      if (!live) throw new Error('aucune vue');
      memory.replaceLocal(ExplorationMask.empty(GRID_CELLS));
      memory.markLocal(live.prep, live.view);
    },
  );

  bench('mémoire : marquage en régime (vue déjà explorée, cases hors vue re-testées)', () => {
    step += 1;
    const live = steadyViews[step & 1]!;
    memory.markLocal(live.prep, live.view);
  });

  bench('MJ : un PNJ glissé, audience pour 4 joueurs (15 Hz)', () => {
    step += 1;
    const dx = ((step % 80) - 40) * 3;
    gm.engine.setPreview(pnj, { ...pnj.geometry, x: pnj.geometry.x + dx });
    gm.state.sync();
    gm.state.audience(pnj);
  });
});
