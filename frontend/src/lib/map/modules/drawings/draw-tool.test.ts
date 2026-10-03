import { describe, expect, it, vi } from 'vitest';
import type { MapViewer } from '../../engine/entities/entity-kind';
import type { Point } from '../../engine/geometry';
import { MapEngine } from '../../engine/map-engine';
import { fakeBackend, GM, setup } from '../../engine/test-kit';
import { LiveChannel, LIVE_KIND, type LiveMessage } from '../../live/live-channel';
import { CommandHistory, CommandManager } from '../../store/commands';
import { createMapStore } from '../../store/map-store';
import type { DrawTool } from './draw-tool';
import { fillFor, withAlpha } from './palette';
import { registerDrawings } from './register';
import { drawingsRuntime } from './runtime';
import type { DrawingData } from './types';

const PLAYER: MapViewer = { userId: 'joueur', role: 'player', characterIds: [] };

function drawingSetup(viewer: MapViewer = GM) {
  const t = setup({ viewer });
  registerDrawings(t.engine, { storage: null });
  const rt = drawingsRuntime(t.engine)!;
  const tool = () => t.engine.tools.active as DrawTool;
  const drawings = () => [...(t.store.getState().collections.drawings?.values() ?? [])];
  return { ...t, rt, tool, drawings };
}

function drawing(id: string, createdBy: string, extra: Partial<DrawingData> = {}): DrawingData {
  return {
    id,
    version: 1,
    mapId: 'carte',
    updatedAt: '',
    layerId: null,
    z: 1,
    tool: 'pen',
    points: [
      { x: 100, y: 500 },
      { x: 300, y: 500 },
    ],
    color: '#e5484d',
    width: 6,
    fill: null,
    closed: false,
    smooth: false,
    createdBy,
    ...extra,
  };
}

/** Tracé du pointeur, point par point. */
function stroke(t: ReturnType<typeof drawingSetup>, path: Point[], extra = {}, release = true) {
  const c = t.engine.controller;
  c.pointerDown(t.pointer(path[0]!, extra));
  for (const p of path.slice(1)) c.pointerMove(t.pointer(p, { ...extra, button: -1 }));
  if (release) c.pointerUp(t.pointer(path[path.length - 1]!, { ...extra, buttons: 0 }));
}

const line = (from: Point, to: Point, steps = 20) =>
  Array.from({ length: steps + 1 }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / steps,
    y: from.y + ((to.y - from.y) * i) / steps,
  }));

describe('outil Dessin : main levée', () => {
  it('un tracé, simplifié au lâcher, part en une commande (annotation par défaut)', async () => {
    const t = drawingSetup();
    expect(t.engine.tools.activate('draw')).toBe(true);
    stroke(t, line({ x: 100, y: 100 }, { x: 300, y: 100 }));
    expect(t.tool().state).toBe('idle');
    // Affiché tout de suite (optimiste)
    expect(t.drawings()).toHaveLength(1);
    await t.commands.idle();
    expect(t.rt.drawings.create).toHaveBeenCalledTimes(1);
    const [draft] = vi.mocked(t.rt.drawings.create!).mock.calls[0]![0];
    expect(draft).toMatchObject({
      tool: 'pen',
      points: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
      ],
      color: t.rt.settings.getState().color,
      width: t.rt.settings.getState().width,
      layerId: null,
      closed: false,
      createdBy: 'mj',
    });
    // Remplacé par l'élément du serveur
    expect(t.drawings().map((d) => d.id)).toEqual([`srv-${draft!.id}`]);
  });

  it('garde les coins, lisse au rendu', async () => {
    const t = drawingSetup();
    t.engine.tools.activate('draw');
    stroke(t, [
      ...line({ x: 100, y: 100 }, { x: 300, y: 100 }),
      ...line({ x: 300, y: 100 }, { x: 300, y: 300 }).slice(1),
    ]);
    await t.commands.idle();
    const [draft] = vi.mocked(t.rt.drawings.create!).mock.calls[0]![0];
    expect(draft!.points).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 300 },
    ]);
    expect(draft!.smooth).toBe(true);
  });

  it('Échap pendant le tracé : rien n’est écrit, l’outil revient au repos', async () => {
    const t = drawingSetup();
    t.engine.tools.activate('draw');
    stroke(t, line({ x: 100, y: 100 }, { x: 300, y: 100 }), {}, false);
    expect(t.tool().state).toBe('drawing');
    expect(t.engine.controller.keyDown(t.key('Escape'))).toBe(true);
    expect(t.tool().state).toBe('idle');
    t.engine.controller.pointerUp(t.pointer({ x: 300, y: 100 }, { buttons: 0 }));
    await t.commands.idle();
    expect(t.rt.drawings.create).not.toHaveBeenCalled();
    expect(t.drawings()).toHaveLength(0);
  });

  it('un clic sans glisser pose un point (deux points au serveur)', async () => {
    const t = drawingSetup();
    t.engine.tools.activate('draw');
    t.click({ x: 400, y: 400 });
    await t.commands.idle();
    const [draft] = vi.mocked(t.rt.drawings.create!).mock.calls[0]![0];
    expect(draft!.points).toEqual([
      { x: 400, y: 400 },
      { x: 400, y: 400 },
    ]);
  });

  it('opacité et couleur réglées : la couleur enregistrée porte l’opacité', async () => {
    const t = drawingSetup();
    t.rt.settings.patch({ color: '#3e9bf5', opacity: 0.5, width: 12 });
    t.engine.tools.activate('draw');
    stroke(t, line({ x: 100, y: 100 }, { x: 200, y: 200 }));
    await t.commands.idle();
    const [draft] = vi.mocked(t.rt.drawings.create!).mock.calls[0]![0];
    expect(draft).toMatchObject({ color: withAlpha('#3e9bf5', 0.5), width: 12 });
  });

  it('les touches 1 à 5 changent de forme', () => {
    const t = drawingSetup();
    t.engine.tools.activate('draw');
    expect(t.engine.controller.keyDown(t.key('3', { code: 'Digit3' }))).toBe(true);
    expect(t.rt.settings.getState().shape).toBe('rectangle');
    t.engine.controller.keyDown(t.key('5', { code: 'Digit5' }));
    expect(t.rt.settings.getState().shape).toBe('eraser');
  });
});

describe('outil Dessin : formes', () => {
  it('rectangle avec ⇧ : un carré, rempli si demandé', async () => {
    const t = drawingSetup();
    t.rt.settings.patch({ shape: 'rectangle', fill: true });
    t.engine.tools.activate('draw');
    stroke(t, line({ x: 100, y: 100 }, { x: 200, y: 150 }, 4), { shift: true });
    await t.commands.idle();
    const [draft] = vi.mocked(t.rt.drawings.create!).mock.calls[0]![0];
    expect(draft).toMatchObject({
      tool: 'rectangle',
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 200 },
      ],
      closed: true,
      fill: fillFor(t.rt.settings.getState().color),
      smooth: false,
    });
  });

  it('ellipse avec ⇧ : un cercle ; sans ⇧ : la boîte tracée', async () => {
    const t = drawingSetup();
    t.rt.settings.patch({ shape: 'circle' });
    t.engine.tools.activate('draw');
    stroke(t, line({ x: 500, y: 500 }, { x: 440, y: 520 }, 4), { shift: true });
    stroke(t, line({ x: 100, y: 100 }, { x: 160, y: 130 }, 4));
    await t.commands.idle();
    const calls = vi.mocked(t.rt.drawings.create!).mock.calls;
    expect(calls[0]![0][0]).toMatchObject({
      tool: 'circle',
      closed: true,
      fill: null,
      points: [
        { x: 500, y: 500 },
        { x: 440, y: 560 },
      ],
    });
    expect(calls[1]![0][0]!.points).toEqual([
      { x: 100, y: 100 },
      { x: 160, y: 130 },
    ]);
  });

  it('ligne : ⇧ l’aligne par pas de 15°', async () => {
    const t = drawingSetup();
    t.rt.settings.patch({ shape: 'line' });
    t.engine.tools.activate('draw');
    stroke(t, line({ x: 100, y: 100 }, { x: 300, y: 110 }, 4), { shift: true });
    await t.commands.idle();
    const [draft] = vi.mocked(t.rt.drawings.create!).mock.calls[0]![0];
    expect(draft!.tool).toBe('line');
    expect(draft!.points[1]!.y).toBeCloseTo(100, 1);
  });

  it('une forme trop petite (clic) n’est pas posée ; Échap non plus', async () => {
    const t = drawingSetup();
    t.rt.settings.patch({ shape: 'rectangle' });
    t.engine.tools.activate('draw');
    t.click({ x: 100, y: 100 });
    stroke(t, line({ x: 100, y: 100 }, { x: 300, y: 300 }), {}, false);
    expect(t.tool().state).toBe('shaping');
    t.engine.controller.keyDown(t.key('Escape'));
    t.engine.controller.pointerUp(t.pointer({ x: 300, y: 300 }, { buttons: 0 }));
    await t.commands.idle();
    expect(t.rt.drawings.create).not.toHaveBeenCalled();
  });
});

describe('outil Dessin : gomme', () => {
  it('efface les tracés touchés, les miens seulement pour un joueur, en une commande', async () => {
    const t = drawingSetup(PLAYER);
    t.store.getState().upsert('drawings', [
      drawing('a', 'joueur'),
      drawing('b', 'mj', {
        points: [
          { x: 100, y: 600 },
          { x: 300, y: 600 },
        ],
      }),
      drawing('c', 'joueur', {
        points: [
          { x: 700, y: 100 },
          { x: 700, y: 300 },
        ],
      }),
    ]);
    t.rt.settings.patch({ shape: 'eraser' });
    t.engine.tools.activate('draw');
    // Coupe a et b, loin de c
    stroke(t, line({ x: 200, y: 450 }, { x: 200, y: 650 }), {}, false);
    expect(t.tool().state).toBe('erasing');
    // Caché pendant le geste
    expect(t.engine.entity('a')!.masks.size).toBe(1);
    expect(t.engine.entity('b')!.masks.size).toBe(0);
    t.engine.controller.pointerUp(t.pointer({ x: 200, y: 650 }, { buttons: 0 }));
    expect(
      t
        .drawings()
        .map((d) => d.id)
        .sort(),
    ).toEqual(['b', 'c']);
    await t.commands.idle();
    expect(t.rt.drawings.remove).toHaveBeenCalledTimes(1);
    expect(vi.mocked(t.rt.drawings.remove!).mock.calls[0]![0].map((d) => d.id)).toEqual(['a']);
    // Annuler : le tracé revient
    await t.commands.undo();
    expect(t.drawings()).toHaveLength(3);
  });

  it('le MJ gomme tout ; Échap rend les tracés, rien n’est écrit', async () => {
    const t = drawingSetup();
    t.store.getState().upsert('drawings', [drawing('a', 'joueur'), drawing('b', 'mj')]);
    t.rt.settings.patch({ shape: 'eraser' });
    t.engine.tools.activate('draw');
    stroke(t, line({ x: 150, y: 450 }, { x: 150, y: 550 }), {}, false);
    expect(t.engine.entity('a')!.masks.size + t.engine.entity('b')!.masks.size).toBe(2);
    t.engine.controller.keyDown(t.key('Escape'));
    expect(t.engine.entity('a')!.masks.size).toBe(0);
    expect(t.engine.entity('b')!.masks.size).toBe(0);
    t.engine.controller.pointerUp(t.pointer({ x: 150, y: 550 }, { buttons: 0 }));
    await t.commands.idle();
    expect(t.rt.drawings.remove).not.toHaveBeenCalled();
    expect(t.drawings()).toHaveLength(2);
  });
});

describe('outil Dessin : destination', () => {
  const layers = [
    {
      id: 'sol',
      version: 1,
      name: 'Sol',
      sortOrder: 0,
      visibleToPlayers: true,
      locked: false,
      opacity: 1,
      role: 'ground',
    },
    {
      id: 'secret',
      version: 1,
      name: 'Secret',
      sortOrder: 1,
      visibleToPlayers: false,
      locked: false,
      opacity: 1,
      role: null,
    },
    {
      id: 'toit',
      version: 1,
      name: 'Toit',
      sortOrder: 2,
      visibleToPlayers: true,
      locked: true,
      opacity: 1,
      role: null,
    },
  ];

  it('« Dans le calque » : le calque actif, sinon Sol, au-dessus de son contenu', async () => {
    const t = setup({ layers });
    registerDrawings(t.engine, { storage: null });
    const rt = drawingsRuntime(t.engine)!;
    rt.settings.patch({ target: 'layer' });
    t.engine.tools.activate('draw');
    t.click({ x: 100, y: 100 });
    // Calque verrouillé : jamais
    t.engine.setActiveLayer('toit');
    t.click({ x: 200, y: 200 });
    t.engine.setActiveLayer('secret');
    t.click({ x: 300, y: 300 });
    await t.commands.idle();
    const drafts = vi.mocked(rt.drawings.create!).mock.calls.map((c) => c[0][0]!);
    expect(drafts.map((d) => d.layerId)).toEqual(['sol', 'sol', 'secret']);
    expect(drafts[1]!.z).toBeGreaterThan(drafts[0]!.z);
  });
});

describe('outil Dessin : direct', () => {
  function liveSetup() {
    const store = createMapStore('campagne', 'carte');
    store.getState().hydrate({
      scene: { id: 'carte', version: 1, width: 1000, height: 1000 },
      settings: { version: 1, pixelsPerUnit: 50, tokenScale: 1 },
      collections: {
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
        ],
      },
    });
    const sent: { kind: string; data: LiveMessage }[] = [];
    let timers: (() => void)[] = [];
    const now = 1_000;
    const live = new LiveChannel({
      mapId: 'carte',
      selfId: 'mj',
      transport: { send: (kind, data) => sent.push({ kind, data: data as LiveMessage }) },
      audienceOf: () => 'public',
      now: () => now,
      setTimer: (fn) => {
        timers.push(fn);
        return timers.length;
      },
      clearTimer: () => undefined,
    });
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
      live,
      rememberCamera: false,
    });
    engine.resize(1000, 1000);
    registerDrawings(engine, { storage: null });
    let time = 1_000;
    const pointer = (world: Point, extra = {}) => ({
      id: 1,
      type: 'mouse' as const,
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
    const flush = () => {
      const run = timers;
      timers = [];
      for (const fn of run) fn();
    };
    return { engine, sent, flush, pointer, rt: drawingsRuntime(engine)! };
  }

  it('le tracé part en continu (deltas), avec la couleur de l’auteur, puis `end`', () => {
    const t = liveSetup();
    t.engine.tools.activate('draw');
    const c = t.engine.controller;
    c.pointerDown(t.pointer({ x: 100, y: 100 }));
    c.pointerMove(t.pointer({ x: 120, y: 100 }, { button: -1 }));
    t.flush();
    c.pointerMove(t.pointer({ x: 140, y: 110 }, { button: -1 }));
    c.pointerMove(t.pointer({ x: 160, y: 120 }, { button: -1 }));
    t.flush();
    c.pointerUp(t.pointer({ x: 160, y: 120 }, { buttons: 0 }));
    t.flush();
    const strokes = t.sent.filter((m) => m.kind === LIVE_KIND).map((m) => m.data);
    expect(strokes[0]!.stroke).toMatchObject({
      tool: 'pen',
      color: t.rt.settings.getState().color,
      points: [100, 100, 120, 100],
    });
    expect(strokes[1]!.stroke!.points).toEqual([140, 110, 160, 120]);
    expect(strokes[1]!.stroke!.id).toBe(strokes[0]!.stroke!.id);
    expect(strokes[strokes.length - 1]!.end).toBe(true);
    // Le dessin enregistré garde l'identifiant du tracé en direct comme brouillon
    const drawing = [...t.engine.store.getState().collections.drawings!.values()][0]!;
    expect(drawing.id).toBe(strokes[0]!.stroke!.id);
  });

  it('une forme envoie son origine puis son extrémité ; Échap envoie l’annulation', () => {
    const t = liveSetup();
    t.rt.settings.patch({ shape: 'rectangle' });
    t.engine.tools.activate('draw');
    const c = t.engine.controller;
    c.pointerDown(t.pointer({ x: 100, y: 100 }));
    c.pointerMove(t.pointer({ x: 150, y: 150 }, { button: -1 }));
    t.flush();
    c.pointerMove(t.pointer({ x: 200, y: 180 }, { button: -1 }));
    t.flush();
    c.keyDown({
      key: 'Escape',
      code: 'Escape',
      shift: false,
      alt: false,
      ctrl: false,
      meta: false,
      repeat: false,
    });
    t.flush();
    const strokes = t.sent.map((m) => m.data);
    expect(strokes[0]!.stroke).toMatchObject({ tool: 'rectangle', points: [100, 100, 150, 150] });
    expect(strokes[1]!.stroke!.points).toEqual([200, 180]);
    const last = strokes[strokes.length - 1]!;
    expect(last.stroke?.tool ?? strokes[strokes.length - 2]!.stroke?.tool).toBe('eraser');
    expect(last.end).toBe(true);
  });

  it('une forme remplie envoie son remplissage ; un trait n’en envoie pas', () => {
    const t = liveSetup();
    t.rt.settings.patch({ shape: 'rectangle', fill: true });
    t.engine.tools.activate('draw');
    const c = t.engine.controller;
    c.pointerDown(t.pointer({ x: 100, y: 100 }));
    c.pointerMove(t.pointer({ x: 150, y: 150 }, { button: -1 }));
    c.pointerUp(t.pointer({ x: 150, y: 150 }, { buttons: 0 }));
    t.flush();
    const shape = t.sent.find((m) => m.data.stroke)!.data.stroke!;
    const drawing = [...t.engine.store.getState().collections.drawings!.values()][0]!;
    expect(shape.fill).toBeTruthy();
    expect(shape.fill).toBe(drawing.fill);

    const u = liveSetup();
    u.rt.settings.patch({ shape: 'line', fill: true });
    u.engine.tools.activate('draw');
    const d = u.engine.controller;
    d.pointerDown(u.pointer({ x: 100, y: 100 }));
    d.pointerMove(u.pointer({ x: 150, y: 150 }, { button: -1 }));
    d.pointerUp(u.pointer({ x: 150, y: 150 }, { buttons: 0 }));
    u.flush();
    expect(u.sent.find((m) => m.data.stroke)!.data.stroke!.fill).toBeUndefined();
  });

  it('rien ne part en direct pour un calque masqué aux joueurs', () => {
    const t = liveSetup();
    t.rt.settings.patch({ target: 'layer' });
    t.engine.setActiveLayer('secret');
    t.engine.tools.activate('draw');
    const c = t.engine.controller;
    c.pointerDown(t.pointer({ x: 100, y: 100 }));
    c.pointerMove(t.pointer({ x: 200, y: 100 }, { button: -1 }));
    c.pointerUp(t.pointer({ x: 200, y: 100 }, { buttons: 0 }));
    t.flush();
    expect(t.sent.filter((m) => m.data.stroke)).toHaveLength(0);
  });
});
