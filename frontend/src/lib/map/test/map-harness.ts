/**
 * Banc d'essai de la carte complète (tests seulement, environnement jsdom) : le vrai moteur, les
 * modules de l'app (`MAP_MODULES`) et la vraie scène PixiJS. Seul le GPU est simulé : l'`Application`
 * reçoit un faux rendu (chaque image est notée, rien n'est dessiné) et les canevas de jsdom un
 * faux contexte 2D. Tout le reste s'exécute : rendu des sortes, vues, interactions, outils, menus.
 *
 * Données : une scène avec un exemplaire de chaque sorte (token, objet, mur, porte, fenêtre,
 * pièce, lumière, brouillard, dessin, note, zone sonore, portail, mesure, calques), surchargeable.
 */
// Avant Pixi : il touche un canevas dès son import
import './fake-canvas';
import * as PIXI from 'pixi.js';
import { vi } from 'vitest';
import type { MapViewer } from '../engine/entities/entity-kind';
import type { MapPlayer } from '../engine/map-engine';
import { MapEngine } from '../engine/map-engine';
import type { Point } from '../engine/geometry';
import type { MapKey, MapPointer } from '../engine/tools/tool';
import { fakeBackend, spyPersistence } from '../engine/test-kit';
import { LiveChannel, LIVE_KIND, PING_KIND, type LiveMessage } from '../live/live-channel';
import { MAP_MODULES } from '@/lib/map/features';
import { CommandHistory, CommandManager } from '../store/commands';
import { createMapStore, type MapDto } from '../store/map-store';

// ─── Faux GPU ────────────────────────────────────────────────────────────────

/** Rendus demandés au faux GPU (par image, et dans les textures). */
export interface FakeRenderer {
  renders: number;
  canvas: HTMLCanvasElement;
  resolution: number;
  width: number;
  height: number;
  resize(w: number, h: number): void;
  render(o: unknown): void;
  destroy(): void;
}

let installed = false;

/** Faux GPU pour toute la suite (une fois) : canevas, `Application`, chargement des textures. */
export function installFakeGpu() {
  if (installed) return;
  installed = true;
  const proto = PIXI.Application.prototype as unknown as {
    init(o: { width?: number; height?: number; resolution?: number }): Promise<void>;
    destroy(): void;
    stage: PIXI.Container;
    renderer: FakeRenderer;
    ticker: { stop(): void; start(): void; add(): void; remove(): void; destroy(): void };
  };
  proto.init = async function (o) {
    this.stage ??= new PIXI.Container();
    const canvas = document.createElement('canvas');
    const renderer: FakeRenderer = {
      renders: 0,
      canvas,
      resolution: o.resolution ?? 1,
      width: o.width ?? 1,
      height: o.height ?? 1,
      resize(w, h) {
        this.width = w;
        this.height = h;
      },
      render() {
        this.renders += 1;
      },
      destroy() {},
    };
    // Toute autre méthode du rendu (textures, extraction…) : rien
    this.renderer = new Proxy(renderer, {
      get: (t, k) => (k in t ? t[k as keyof FakeRenderer] : () => undefined),
    });
    this.ticker = { stop() {}, start() {}, add() {}, remove() {}, destroy() {} };
  };
  proto.destroy = function () {
    this.stage.destroy({ children: true });
  };
  // Second rendu (la météo dessine dans son propre canevas) : même faux GPU
  const webgl = PIXI.WebGLRenderer.prototype as unknown as {
    init(this: Record<string, unknown>, o: { width?: number; height?: number }): Promise<void>;
  };
  webgl.init = async function (o) {
    const canvas = document.createElement('canvas');
    const size = { width: o.width ?? 1, height: o.height ?? 1 };
    Object.defineProperty(this, 'canvas', { value: canvas, configurable: true });
    Object.defineProperty(this, 'width', { get: () => size.width, configurable: true });
    Object.defineProperty(this, 'height', { get: () => size.height, configurable: true });
    this.renders = 0;
    this.render = function (this: { renders: number }) {
      this.renders += 1;
    };
    this.resize = (w: number, h: number) => {
      size.width = w;
      size.height = h;
    };
    this.destroy = () => canvas.remove();
  };
  // Images : une texture blanche, tout de suite
  vi.spyOn(PIXI.Assets, 'load').mockImplementation(async () => PIXI.Texture.WHITE as never);
  vi.spyOn(PIXI.Assets, 'unload').mockImplementation(async () => undefined);
}

// ─── Données ─────────────────────────────────────────────────────────────────

export const GM: MapViewer = { userId: 'mj', role: 'gm', characterIds: [] };
export const ALICE: MapViewer = { userId: 'alice', role: 'player', characterIds: ['c-heros'] };
export const SPECTATOR: MapViewer = { userId: 'spec', role: 'spectator', characterIds: [] };
export const PLAYERS: MapPlayer[] = [
  { userId: 'alice', name: 'Alice', characterIds: ['c-heros'] },
  { userId: 'bob', name: 'Bob', characterIds: ['c-barde'] },
];

const base = (id: string) => ({
  id,
  mapId: 'carte',
  version: 1,
  updatedAt: '2026-10-03T08:00:00.000Z',
});

export const fixtures = {
  layer: (
    id: string,
    sortOrder: number,
    role: 'ground' | 'objects' | 'tokens' | null,
    extra = {},
  ) => ({
    ...base(id),
    name: id,
    sortOrder,
    visibleToPlayers: true,
    locked: false,
    opacity: 1,
    role,
    ...extra,
  }),
  token: (id: string, characterId: string, x: number, y: number, extra = {}) => ({
    ...base(id),
    characterId,
    layerId: 'persos',
    z: 0,
    pos: { x, y },
    scale: 1,
    shape: 'circle',
    imageUrl: null,
    visibility: 'visible',
    visibleTo: [],
    visionRadius: 6,
    visionBoost: false,
    notes: null,
    audio: null,
    interactions: null,
    ...extra,
  }),
  object: (id: string, x: number, y: number, extra = {}) => ({
    ...base(id),
    name: `Objet ${id}`,
    kind: 'item',
    imageUrl: '/objets/coffre.webp',
    pos: { x, y },
    width: 50,
    height: 50,
    rotation: 0,
    layerId: 'objets',
    z: 0,
    isLocked: false,
    visibility: 'visible',
    visibleTo: [],
    notes: null,
    items: [],
    linkedId: null,
    groupEntityId: null,
    searchable: false,
    searchRadius: 1,
    ...extra,
  }),
  obstacle: (id: string, kind: string, points: Point[], extra = {}) => ({
    ...base(id),
    kind,
    points,
    blocksFrom: kind === 'one_way_wall' ? 'left' : null,
    isOpen: false,
    isLocked: false,
    color: null,
    opacity: 1,
    roomMode: null,
    ...extra,
  }),
  room: (id: string, points: Point[]) => ({ ...base(id), name: `Pièce ${id}`, points }),
  light: (id: string, x: number, y: number, extra = {}) => ({
    ...base(id),
    name: `Lumière ${id}`,
    pos: { x, y },
    radius: 4,
    visible: true,
    color: '#ffcc88',
    intensity: 1,
    falloff: 0.5,
    attachedTokenId: null,
    ...extra,
  }),
  fog: (id: string, extra = {}) => ({
    ...base(id),
    shape: 'circle',
    mode: 'fog',
    points: [],
    center: { x: 900, y: 900 },
    radius: 80,
    order: 1,
    createdBy: 'mj',
    ...extra,
  }),
  drawing: (id: string, tool: string, points: Point[], extra = {}) => ({
    ...base(id),
    layerId: null,
    z: 0,
    tool,
    points,
    color: '#ff0000',
    width: 4,
    fill: null,
    closed: false,
    smooth: tool === 'pen',
    createdBy: 'mj',
    ...extra,
  }),
  note: (id: string, x: number, y: number, extra = {}) => ({
    ...base(id),
    layerId: null,
    z: 0,
    text: 'Taverne du Poney',
    pos: { x, y },
    rotation: 0,
    color: '#ffffff',
    fontSize: 24,
    fontFamily: null,
    createdBy: 'mj',
    ...extra,
  }),
  sound: (id: string, x: number, y: number, extra = {}) => ({
    ...base(id),
    name: `Son ${id}`,
    pos: { x, y },
    radius: 5,
    url: '/sons/feu.mp3',
    assetId: null,
    volume: 0.8,
    color: null,
    active: true,
    ...extra,
  }),
  portal: (id: string, x: number, y: number, extra = {}) => ({
    ...base(id),
    name: `Portail ${id}`,
    pos: { x, y },
    radius: 30,
    kind: 'same_map',
    targetMapId: null,
    target: { x: 1000, y: 200 },
    icon: 'stairs',
    color: null,
    visible: true,
    auto: false,
    linkedPortalId: null,
    ...extra,
  }),
  measurement: (id: string, shape: string, start: Point, end: Point, extra = {}) => ({
    ...base(id),
    shape,
    start,
    end,
    color: '#ffcc00',
    skin: null,
    options: {},
    createdBy: 'mj',
    ...extra,
  }),
};

/** Personnages de l'annuaire : un héros joué par Alice, un barde, un orc ennemi (PNJ). */
export const CHARACTERS = [
  {
    id: 'c-heros',
    name: 'Héros',
    portraitUrl: '/portraits/heros.webp',
    tokenUrl: null,
    side: 'players',
    kind: 'pc',
    ownerId: 'alice',
    playedBy: 'alice',
    resource: { key: 'pv', label: 'PV', value: 12, max: 20, color: null, fills: false },
  },
  {
    id: 'c-barde',
    name: 'Barde',
    portraitUrl: null,
    tokenUrl: null,
    side: 'players',
    kind: 'pc',
    ownerId: 'bob',
    playedBy: 'bob',
    resource: null,
  },
  {
    id: 'c-orc',
    name: 'Orc',
    portraitUrl: '/portraits/orc.webp',
    tokenUrl: '/tokens/orc.webp',
    side: 'enemies',
    kind: 'npc',
    ownerId: null,
    playedBy: null,
    resource: { key: 'pv', label: 'PV', value: 3, max: 15, color: null, fills: false },
  },
];

/** Une scène de 2000 × 1500 avec un exemplaire de chaque sorte. */
export function fullMap(): Record<string, MapDto[]> {
  const f = fixtures;
  return {
    layers: [
      f.layer('sol', 0, 'ground'),
      f.layer('objets', 1, 'objects'),
      f.layer('persos', 2, 'tokens'),
      f.layer('secret', 3, null, { visibleToPlayers: false }),
    ],
    tokens: [
      f.token('t-heros', 'c-heros', 300, 300),
      f.token('t-barde', 'c-barde', 400, 300, { shape: 'square' }),
      f.token('t-orc', 'c-orc', 700, 300, { visibility: 'hidden' }),
    ],
    objects: [
      f.object('o-coffre', 500, 500, { searchable: true }),
      f.object('o-table', 800, 600, { kind: 'decor', isLocked: true }),
    ],
    obstacles: [
      f.obstacle('w-mur', 'wall', [
        { x: 600, y: 100 },
        { x: 600, y: 800 },
      ]),
      f.obstacle('w-porte', 'door', [
        { x: 100, y: 900 },
        { x: 200, y: 900 },
      ]),
      f.obstacle('w-fenetre', 'window', [
        { x: 1000, y: 100 },
        { x: 1100, y: 100 },
      ]),
      f.obstacle('w-sens', 'one_way_wall', [
        { x: 1200, y: 100 },
        { x: 1200, y: 300 },
      ]),
    ],
    rooms: [
      f.room('r-salle', [
        { x: 1300, y: 900 },
        { x: 1600, y: 900 },
        { x: 1600, y: 1200 },
        { x: 1300, y: 1200 },
      ]),
    ],
    lights: [
      f.light('l-torche', 350, 350),
      f.light('l-portee', 0, 0, { attachedTokenId: 't-heros' }),
    ],
    fogZones: [
      f.fog('z-brume'),
      f.fog('z-clair', {
        shape: 'rect',
        mode: 'clear',
        center: null,
        radius: null,
        points: [
          { x: 1300, y: 100 },
          { x: 1500, y: 300 },
        ],
      }),
    ],
    drawings: [
      f.drawing('d-trait', 'pen', [
        { x: 100, y: 100 },
        { x: 150, y: 120 },
        { x: 200, y: 110 },
      ]),
      f.drawing(
        'd-rect',
        'rectangle',
        [
          { x: 100, y: 1100 },
          { x: 300, y: 1300 },
        ],
        { fill: '#00ff0055' },
      ),
      f.drawing('d-cercle', 'circle', [
        { x: 400, y: 1200 },
        { x: 480, y: 1200 },
      ]),
    ],
    notes: [f.note('n-taverne', 900, 1000)],
    musicZones: [f.sound('s-feu', 1500, 600)],
    portals: [f.portal('p-escalier', 1700, 300)],
    measurements: [
      f.measurement('m-cone', 'cone', { x: 1100, y: 1250 }, { x: 1250, y: 1400 }),
      f.measurement('m-cercle', 'circle', { x: 900, y: 300 }, { x: 980, y: 300 }),
    ],
  };
}

// ─── Banc ────────────────────────────────────────────────────────────────────

export interface MapHarnessOptions {
  viewer?: MapViewer;
  /** Collections, à la place de `fullMap()` (ou complétées : `extend`). */
  collections?: Record<string, MapDto[]>;
  extend?: Record<string, MapDto[]>;
  scene?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  players?: MapPlayer[];
  /** Ne pas monter le rendu (moteur seul). */
  headless?: boolean;
  /** Sans canal direct (gestes des autres, curseurs, pings). */
  offline?: boolean;
}

/** Carte complète montée dans un hôte jsdom de 1000 × 800. */
export async function mountMap(opts: MapHarnessOptions = {}) {
  installFakeGpu();
  const store = createMapStore('campagne', 'carte');
  store.getState().hydrate({
    scene: {
      ...base('carte'),
      name: 'Donjon',
      description: '',
      groupId: null,
      backgroundUrl: null,
      isDefault: true,
      visibleToPlayers: true,
      spawn: { x: 200, y: 200 },
      width: 2000,
      height: 1500,
      weather: null,
      display: {},
      fogFull: false,
      grids: [
        {
          id: 'g1',
          name: 'Cases',
          size: 50,
          offsetX: 0,
          offsetY: 0,
          color: '#ffffff',
          opacity: 0.3,
          thickness: 1,
          visibleToPlayers: true,
          primary: true,
        },
      ],
      ...opts.scene,
    },
    settings: {
      campaignId: 'campagne',
      partyMapId: null,
      tokenScale: 1,
      pixelsPerUnit: 50,
      unitName: 'm',
      shadowOpacity: 0.8,
      dungeonMode: false,
      music: null,
      version: 1,
      ...opts.settings,
    },
    collections: { ...(opts.collections ?? fullMap()), ...opts.extend },
  });
  const notify = vi.fn();
  const commands = new CommandManager({
    store,
    history: new CommandHistory(),
    notify,
    refetch: vi.fn(async () => undefined),
  });
  // Une persistance espionnée par couche, gardée : les tests lisent ce qui est parti
  const persistences = new Map<string, ReturnType<typeof spyPersistence>>();
  const persistence = (key: string) => {
    let p = persistences.get(key);
    if (!p) persistences.set(key, (p = spyPersistence()));
    return p;
  };
  const backend = { ...fakeBackend(), collection: persistence };
  // Canal direct : ce qui part est noté, ce qui arrive passe par `receive`
  const sent: { kind: string; data: unknown; options: unknown }[] = [];
  const engineRef: { current: MapEngine | null } = { current: null };
  const live = opts.offline
    ? null
    : new LiveChannel({
        mapId: 'carte',
        selfId: (opts.viewer ?? GM).userId,
        transport: { send: (kind, data, options) => sent.push({ kind, data, options }) },
        audienceOf: (id) => engineRef.current?.liveAudience(id) ?? 'gm',
      });
  // Horloge du moteur = temps des images (`frame`) : une animation lancée par un événement
  // (vue centrée sur un ping…) part du même temps que les images qui la font avancer
  let time = 10_000;
  const engine = new MapEngine({
    store,
    live,
    now: () => time,
    viewer: opts.viewer ?? GM,
    commands,
    backend,
    rememberCamera: false,
    snap: 1,
    notify,
    directory: {
      characters: () => CHARACTERS,
      userName: (id) => ({ alice: 'Alice', bob: 'Bob', mj: 'MJ' })[id] ?? null,
      players: () => opts.players ?? PLAYERS,
    },
  });
  engineRef.current = engine;
  for (const module of MAP_MODULES) engine.use(module);
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { value: 1000 });
  Object.defineProperty(host, 'clientHeight', { value: 800 });
  document.body.appendChild(host);
  engine.resize(1000, 800);
  if (!opts.headless) await engine.mount(host);

  /** Une image : étape du moteur puis rendu (le faux GPU compte les rendus). */
  const frame = (dt = 16) => {
    time += dt;
    (engine as unknown as { frame(now: number): void }).frame(time);
  };
  /** Plusieurs images, le temps qu'une animation se termine. */
  const frames = (n: number, dt = 50) => {
    for (let i = 0; i < n; i++) frame(dt);
  };
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
    time: (time += 500),
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
  const move = (world: Point, extra: Partial<MapPointer> = {}) =>
    c.pointerMove(pointer(world, { button: -1, buttons: 0, ...extra }));
  const click = (world: Point, extra: Partial<MapPointer> = {}) => {
    c.pointerDown(pointer(world, extra));
    c.pointerUp(pointer(world, { ...extra, buttons: 0 }));
  };
  const drag = (from: Point, to: Point, extra: Partial<MapPointer> = {}, steps = 4) => {
    c.pointerDown(pointer(from, extra));
    for (let i = 1; i <= steps; i++)
      c.pointerMove(
        pointer(
          { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps },
          { ...extra, button: -1 },
        ),
      );
    c.pointerUp(pointer(to, { ...extra, buttons: 0 }));
  };
  const press = (k: string, extra: Partial<MapKey> = {}) => {
    c.keyDown(key(k, extra));
    c.keyUp(key(k, extra));
  };
  const renderer = () => engine.renderer as unknown as FakeRenderer;
  let seq = 0;
  /** Message direct d'un autre (numéro de séquence croissant). */
  const receive = (
    userId: string,
    data: Omit<LiveMessage, 'm' | 's'>,
    role = userId === 'mj' ? 'gm' : 'player',
  ) =>
    live?.receive({
      kind: LIVE_KIND,
      data: { m: 'carte', s: ++seq, ...data },
      from: { userId, role },
    });
  const receivePing = (userId: string, x: number, y: number, focus = false, role = 'gm') =>
    live?.receive({ kind: PING_KIND, data: { m: 'carte', x, y, focus }, from: { userId, role } });
  const destroy = () => {
    engine.destroy();
    live?.destroy();
    host.remove();
  };
  return {
    store,
    engine,
    commands,
    backend,
    persistence,
    notify,
    host,
    frame,
    frames,
    pointer,
    key,
    move,
    click,
    drag,
    press,
    renderer,
    destroy,
    live,
    sent,
    receive,
    receivePing,
    /** Donnée d'une collection. */
    get: (collection: string, id: string) =>
      store.getState().collections[collection]?.get(id) as Record<string, unknown> | undefined,
  };
}

export type MapHarness = Awaited<ReturnType<typeof mountMap>>;
