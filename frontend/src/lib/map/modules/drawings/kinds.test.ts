import { describe, expect, it, vi } from 'vitest';
import type { MapViewer } from '../../engine/entities/entity-kind';
import { GM, setup } from '../../engine/test-kit';
import type { SelectTool } from '../../engine/tools/select-tool';
import { applyDrawingGeometry, drawingGeometry, drawingLooksDifferent } from './drawing-kind';
import { applyNoteGeometry, noteGeometry } from './note-kind';
import { clearDrawings } from './operations';
import { registerDrawings } from './register';
import { drawingsRuntime } from './runtime';
import { layoutNote } from './text-layout';
import type { DrawingData, NoteData } from './types';

const PLAYER: MapViewer = { userId: 'joueur', role: 'player', characterIds: [] };
const OTHER: MapViewer = { userId: 'autre', role: 'player', characterIds: [] };
const SPECTATOR: MapViewer = { userId: 'curieux', role: 'spectator', characterIds: [] };

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
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ],
    color: '#e5484d',
    width: 10,
    fill: null,
    closed: false,
    smooth: false,
    createdBy,
    ...extra,
  };
}

function note(id: string, createdBy: string, extra: Partial<NoteData> = {}): NoteData {
  return {
    id,
    version: 1,
    mapId: 'carte',
    updatedAt: '',
    layerId: null,
    z: 2,
    text: 'Taverne',
    pos: { x: 500, y: 500 },
    color: '#f5f1e8',
    fontSize: 32,
    fontFamily: null,
    createdBy,
    ...extra,
  };
}

function kindsSetup(viewer: MapViewer = GM) {
  const t = setup({ viewer });
  registerDrawings(t.engine, { storage: null });
  const rt = drawingsRuntime(t.engine)!;
  return { ...t, rt };
}

describe('dessin : toucher précis', () => {
  it('distance au trait ≤ épaisseur / 2 + 6 px d’écran', () => {
    const t = kindsSetup();
    t.store.getState().upsert('drawings', [drawing('a', 'mj')]);
    const zoom = t.engine.camera.zoom;
    const reach = 5 + 6 / zoom;
    expect(t.engine.hitTest({ x: 200, y: 100 + reach - 0.5 })?.id).toBe('a');
    expect(t.engine.hitTest({ x: 200, y: 100 + reach + 1 })).toBeNull();
  });

  it('forme remplie : l’intérieur touche ; vide : on clique à travers', () => {
    const t = kindsSetup();
    const square = [
      { x: 400, y: 400 },
      { x: 600, y: 600 },
    ];
    t.store
      .getState()
      .upsert('drawings', [
        drawing('vide', 'mj', { tool: 'rectangle', closed: true, points: square }),
      ]);
    expect(t.engine.hitTest({ x: 500, y: 500 })).toBeNull();
    t.store.getState().upsert('drawings', [
      drawing('vide', 'mj', {
        version: 2,
        tool: 'rectangle',
        closed: true,
        points: square,
        fill: '#e5484d59',
      }),
    ]);
    expect(t.engine.hitTest({ x: 500, y: 500 })?.id).toBe('vide');
  });

  it('un texte se touche dans sa boîte', () => {
    const t = kindsSetup();
    t.store.getState().upsert('notes', [note('n', 'mj')]);
    const g = t.engine.entity('n')!.geometry;
    expect(t.engine.hitTest({ x: g.x, y: g.y })?.id).toBe('n');
    expect(t.engine.hitTest({ x: g.x, y: g.y + g.height })).toBeNull();
  });
});

describe('droits : auteur ou MJ', () => {
  it('l’auteur et le MJ modifient ; un autre joueur et un spectateur regardent', () => {
    for (const [viewer, allowed] of [
      [GM, true],
      [PLAYER, true],
      [OTHER, false],
      [SPECTATOR, false],
    ] as const) {
      const t = kindsSetup(viewer);
      t.store.getState().upsert('drawings', [drawing('a', 'joueur')]);
      t.store.getState().upsert('notes', [note('n', 'joueur')]);
      for (const id of ['a', 'n']) {
        const e = t.engine.entity(id)!;
        expect(e.kind.can('select', e, viewer)).toBe(true);
        expect(e.kind.can('inspect', e, viewer)).toBe(true);
        for (const action of ['move', 'resize', 'delete', 'order'] as const)
          expect(e.kind.can(action, e, viewer), `${viewer.userId} ${action}`).toBe(allowed);
      }
    }
  });

  it('les outils sont aux membres, pas aux spectateurs', () => {
    expect(kindsSetup(PLAYER).engine.tools.activate('draw')).toBe(true);
    expect(kindsSetup(PLAYER).engine.tools.activate('text')).toBe(true);
    expect(kindsSetup(SPECTATOR).engine.tools.activate('draw')).toBe(false);
  });

  it('glisser le dessin d’un autre joueur ne fait rien', async () => {
    const t = kindsSetup(OTHER);
    t.store.getState().upsert('drawings', [drawing('a', 'joueur')]);
    t.drag({ x: 200, y: 100 }, { x: 200, y: 300 }, { alt: true });
    await t.commands.idle();
    expect(t.rt.drawings.update).not.toHaveBeenCalled();
  });
});

describe('glisser et poignées', () => {
  it('glisser translate les points : une commande', async () => {
    const t = kindsSetup(PLAYER);
    t.store.getState().upsert('drawings', [drawing('a', 'joueur')]);
    t.drag({ x: 200, y: 100 }, { x: 250, y: 180 }, { alt: true });
    await t.commands.idle();
    expect(t.rt.drawings.update).toHaveBeenCalledTimes(1);
    const [u] = vi.mocked(t.rt.drawings.update).mock.calls[0]![0];
    expect(u!.changes).toEqual({
      points: [
        { x: 150, y: 180 },
        { x: 350, y: 180 },
      ],
    });
  });

  it('la géométrie d’un dessin compte l’épaisseur, et la taille met les points à l’échelle', () => {
    const d = drawing('a', 'mj', {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
    });
    const g = drawingGeometry(d);
    expect(g).toEqual({ x: 50, y: 25, width: 110, height: 60, rotation: 0 });
    // Taille doublée autour du coin haut gauche (épaisseur inchangée)
    const out = applyDrawingGeometry(d, { x: 100, y: 50, width: 210, height: 110, rotation: 0 });
    expect(out.points).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 100 },
    ]);
    expect(out.width).toBe(10);
  });

  it('un texte grandit par sa taille de police, sa boîte suit', () => {
    const n = note('n', 'mj');
    const g = noteGeometry(n);
    const out = applyNoteGeometry(n, {
      x: g.x - g.width / 2 + g.width,
      y: g.y - g.height / 2 + g.height,
      width: g.width * 2,
      height: g.height * 2,
      rotation: 0,
    });
    expect(out.fontSize).toBe(64);
    // Coin haut gauche gardé
    const next = noteGeometry(out);
    expect(next.x - next.width / 2).toBeCloseTo(g.x - g.width / 2, 1);
    expect(next.y - next.height / 2).toBeCloseTo(g.y - g.height / 2, 1);
  });

  it('pos est sur la ligne de base de la première ligne', () => {
    const n = note('n', 'mj', { text: 'Deux\nlignes' });
    const l = layoutNote(n.text, n.fontSize, n.fontFamily);
    const g = noteGeometry(n);
    expect(g.y - g.height / 2).toBeCloseTo(n.pos.y - l.baseline);
    expect(l.lines).toEqual(['Deux', 'lignes']);
    expect(g.height).toBeCloseTo(l.lineHeight * 2);
  });

  it('seul un changement visible redessine le trait', () => {
    const a = drawing('a', 'mj');
    expect(drawingLooksDifferent(a, { ...a, version: 2 })).toBe(false);
    expect(drawingLooksDifferent(a, { ...a, points: a.points.map((p) => ({ ...p })) })).toBe(false);
    expect(drawingLooksDifferent(a, { ...a, color: '#000000' })).toBe(true);
  });
});

describe('ordre, calque, annotation', () => {
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
  ];

  it('les annotations s’ordonnent entre elles (dessins et textes confondus)', async () => {
    const t = setup({ layers });
    registerDrawings(t.engine, { storage: null });
    t.store.getState().upsert('drawings', [drawing('a', 'mj', { z: 1 })]);
    t.store.getState().upsert('notes', [note('n', 'mj', { z: 2 })]);
    const a = t.engine.entity('a')!;
    expect(a.plane).toBe('annotations');
    expect(a.layerId).toBeNull();
    await t.engine.arrange([a], 'front');
    expect(t.backend.arrange).toHaveBeenCalledWith([
      { kind: 'drawing', id: 'a', layerId: null, z: expect.any(Number) },
    ]);
    expect(t.engine.entity('a')!.z).toBeGreaterThan(t.engine.entity('n')!.z);
  });

  it('un dessin rangé dans un calque est dans le plan du contenu, et revient en annotation', async () => {
    const t = setup({ layers });
    registerDrawings(t.engine, { storage: null });
    t.store.getState().upsert('drawings', [drawing('a', 'mj', { layerId: 'sol' })]);
    const e = t.engine.entity('a')!;
    expect(e.plane).toBe('content');
    expect(e.layerId).toBe('sol');
    const item = t.engine
      .menuItems(['a'], { x: 0, y: 0 })
      .find((i) => i.id === 'drawings:to-annotation');
    item!.run!();
    await t.commands.idle();
    expect(t.backend.arrange).toHaveBeenCalledWith([
      { kind: 'drawing', id: 'a', layerId: null, z: expect.any(Number) },
    ]);
    expect(t.engine.entity('a')!.plane).toBe('annotations');
  });
});

describe('effacer', () => {
  it('« Effacer mes dessins » : les miens seulement, en une commande annulable', async () => {
    const t = kindsSetup(PLAYER);
    t.store.getState().upsert('drawings', [drawing('a', 'joueur'), drawing('b', 'mj')]);
    await clearDrawings(t.rt, 'mine');
    await t.commands.idle();
    expect(vi.mocked(t.rt.drawings.remove!).mock.calls[0]![0].map((d) => d.id)).toEqual(['a']);
    // Un joueur ne peut pas tout effacer
    await clearDrawings(t.rt, 'all');
    expect(t.rt.drawings.remove).toHaveBeenCalledTimes(1);
  });

  it('« Tout effacer » (MJ) demande confirmation', async () => {
    const t = kindsSetup();
    t.store.getState().upsert('drawings', [drawing('a', 'joueur'), drawing('b', 'mj')]);
    const done = clearDrawings(t.rt, 'all');
    const confirm = t.engine.ui.getState().confirm!;
    expect(confirm.danger).toBe(true);
    confirm.resolve(true);
    await done;
    await t.commands.idle();
    expect(
      vi
        .mocked(t.rt.drawings.remove!)
        .mock.calls[0]![0].map((d) => d.id)
        .sort(),
    ).toEqual(['a', 'b']);
    await t.commands.undo();
    expect(t.store.getState().collections.drawings?.size).toBe(2);
  });
});

describe('texte : double clic', () => {
  it('ouvre l’édition en place pour l’auteur, l’inspecteur pour les autres', () => {
    const t = kindsSetup(PLAYER);
    t.store
      .getState()
      .upsert('notes', [note('mine', 'joueur'), note('other', 'mj', { pos: { x: 100, y: 800 } })]);
    const tool = t.engine.tools.active as SelectTool;
    const mine = t.engine.entity('mine')!.geometry;
    expect(tool.doubleClick(t.pointer({ x: mine.x, y: mine.y }), t.engine)).toBe(true);
    expect(t.rt.editor.session?.id).toBe('mine');
    expect(t.engine.entity('mine')!.masks.size).toBe(1);
    expect(t.engine.ui.getState().inspector).toBeNull();
    t.rt.editor.cancel();
    expect(t.engine.entity('mine')!.masks.size).toBe(0);
    const other = t.engine.entity('other')!.geometry;
    tool.doubleClick(t.pointer({ x: other.x, y: other.y }), t.engine);
    expect(t.rt.editor.session).toBeNull();
    expect(t.engine.ui.getState().inspector).toEqual(['other']);
  });
});
