/**
 * Page du banc du rendu de la vision (run.mjs) : une scène (murs, portes, fenêtres), un héros
 * déplacé de position en position, le rendu réel de la vision, puis l'obscurité aux sondes.
 */
import * as PIXI from 'pixi.js';
import type { EntityKind } from '@/lib/map/engine/entities/entity-kind';
import { MapEngine } from '@/lib/map/engine/map-engine';
import { CommandHistory, CommandManager } from '@/lib/map/store/commands';
import { createMapStore, type MapDto } from '@/lib/map/store/map-store';
import { VisionRenderer } from '@/lib/map/modules/vision/renderer';
import { VisionState } from '@/lib/map/modules/vision/vision-state';

const persistence = {
  create: async (d: MapDto[]) => d,
  update: async (u: { after: MapDto }[]) => u.map((x) => x.after),
  remove: async () => undefined,
};
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
  persistence: persistence as never,
};
const W = 1000,
  H = 1000;
type Obs = {
  id: string;
  kind: string;
  points: { x: number; y: number }[];
  isOpen?: boolean;
  blocksFrom?: 'left' | 'right' | null;
};

let app: PIXI.Application;
async function init() {
  app = new PIXI.Application();
  await app.init({
    width: W,
    height: H,
    background: 0xffffff,
    preference: 'webgl',
    antialias: false,
    resolution: 1,
  });
  document.body.appendChild(app.canvas);
}

/** Rend la scène vue par le héros aux positions successives ; renvoie l'obscurité (0..1) aux sondes. */
async function run(opts: {
  obstacles: Obs[];
  moves: { x: number; y: number }[];
  probes: { x: number; y: number }[];
  shadow?: number;
}) {
  app.stage.removeChildren();
  const store = createMapStore('c', 'm');
  store.getState().hydrate({
    scene: { id: 'm', version: 1, width: W, height: H, fogFull: false, display: {} },
    settings: { version: 1, pixelsPerUnit: 50, tokenScale: 1, shadowOpacity: opts.shadow ?? 1 },
    collections: {
      tokens: [
        {
          id: 'heros',
          version: 1,
          mapId: 'm',
          characterId: 'c-heros',
          layerId: null,
          z: 0,
          pos: opts.moves[0],
          scale: 1,
          visibility: 'visible',
          visibleTo: [],
          visionRadius: 0,
          visionBoost: false,
        },
      ],
      obstacles: opts.obstacles.map((o) => ({
        version: 1,
        mapId: 'm',
        isOpen: false,
        isLocked: false,
        color: null,
        opacity: 1,
        roomMode: null,
        blocksFrom: null,
        ...o,
      })),
      layers: [],
    },
  });
  const commands = new CommandManager({
    store,
    history: new CommandHistory(),
    notify: () => {},
    refetch: async () => {},
  });
  const engine = new MapEngine({
    store,
    viewer: { userId: 'alice', role: 'player', characterIds: ['c-heros'] },
    commands,
    rememberCamera: false,
    directory: {
      characters: () => [{ id: 'c-heros', name: 'Héros' }],
      userName: () => null,
      players: () => [{ userId: 'alice', name: 'A', characterIds: ['c-heros'] }],
    },
  });
  engine.registerKind(tokenKind);
  const state = new VisionState(engine);
  app.stage.addChild(new PIXI.Graphics().rect(0, 0, W, H).fill(0xffffff));
  const plane = new PIXI.Container();
  app.stage.addChild(plane);
  const r = new VisionRenderer(PIXI as never, app.renderer as never, plane, {
    primary: 0,
    foreground: 0xffffff,
    background: 0x000000,
    muted: 0x808080,
    destructive: 0,
    success: 0,
  });
  const cam = { x: W / 2, y: H / 2, zoom: 1, width: W, height: H };
  const frames: number[][] = [];
  for (const pos of opts.moves) {
    store.getState().upsert(
      'tokens',
      [
        {
          ...store.getState().collections.tokens!.get('heros')!,
          pos,
          version: (store.getState().collections.tokens!.get('heros')!.version as number) + 1,
        },
      ],
      { force: true },
    );
    state.sync();
    for (let i = 0; i < 3; i++) {
      r.draw(state.picture(), cam, 0);
      app.renderer.render(app.stage);
    }
  }
  const pixels = app.renderer.extract.pixels({
    target: app.stage,
    frame: new PIXI.Rectangle(0, 0, W, H),
  });
  const px = pixels.pixels;
  const out = opts.probes.map((p) => {
    const i = (Math.round(p.y) * pixels.width + Math.round(p.x)) * 4;
    return +(1 - px[i]! / 255).toFixed(2);
  });
  r.destroy();
  return out;
}
(window as unknown as { visionBench: unknown }).visionBench = { init, run };
