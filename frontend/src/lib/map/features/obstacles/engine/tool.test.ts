import { describe, expect, it, vi } from 'vitest';
import { setup, spyPersistence } from '@/lib/map/engine/test-kit';
import type { BatchWrite } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';
import { defaultProps, OBSTACLES, ROOMS, type ObstacleData, type RoomData } from './model';
import { registerObstacles } from './register';
import type { ObstacleMode, ObstacleTool } from './tool';

const P = (x: number, y: number) => ({ x, y });

/** Persistance espionnée avec `/batch` (une transaction par geste). */
function batchPersistence() {
  const p = spyPersistence();
  let n = 0;
  const batch = vi.fn(async (w: BatchWrite<MapDto>) => ({
    created: w.create.map((d) => ({ ...d, id: `srv-${++n}`, version: 1 })),
    updated: w.update.map((u) => ({ ...u.after, version: u.version + 1 })),
  }));
  return Object.assign(p, { batch });
}

function wall(id: string, points: { x: number; y: number }[], extra: Partial<ObstacleData> = {}) {
  return {
    id,
    mapId: 'carte',
    version: 1,
    updatedAt: '',
    ...defaultProps('wall'),
    points,
    ...extra,
  } as ObstacleData;
}

function bench(opts: { walls?: ObstacleData[]; rooms?: RoomData[]; mode?: ObstacleMode } = {}) {
  const kit = setup();
  const obstacles = batchPersistence();
  const rooms = batchPersistence();
  kit.backend.collection = (key: string) => {
    if (key === OBSTACLES) return obstacles as never;
    return (key === ROOMS ? rooms : spyPersistence()) as never;
  };
  kit.store.getState().replaceCollection(OBSTACLES, opts.walls ?? []);
  kit.store.getState().replaceCollection(ROOMS, opts.rooms ?? []);
  registerObstacles(kit.engine);
  kit.engine.tools.activate('obstacles');
  const tool = kit.engine.tools.active as ObstacleTool;
  tool.setMode(opts.mode ?? 'wall');
  const c = kit.engine.controller;
  const walls = () =>
    [...(kit.store.getState().collections[OBSTACLES]?.values() ?? [])] as ObstacleData[];
  const roomList = () =>
    [...(kit.store.getState().collections[ROOMS]?.values() ?? [])] as RoomData[];
  /** Double clic : deux clics rapprochés au même point. */
  const doubleClick = (p: { x: number; y: number }) => {
    const t = 900_000 + Math.random() * 1000;
    c.pointerDown(kit.pointer(p, { time: t }));
    c.pointerUp(kit.pointer(p, { time: t + 50, buttons: 0 }));
    c.pointerDown(kit.pointer(p, { time: t + 120 }));
    c.pointerUp(kit.pointer(p, { time: t + 170, buttons: 0 }));
  };
  const hover = (p: { x: number; y: number }, extra = {}) =>
    c.pointerMove(kit.pointer(p, { buttons: 0, button: -1, ...extra }));
  return { ...kit, tool, obstacles, rooms, walls, roomList, doubleClick, hover };
}

describe('outil obstacles : chaîne de murs', () => {
  it('clic à clic, puis Entrée : un mur, une commande, un /batch', async () => {
    const b = bench();
    b.click(P(100, 100));
    b.click(P(300, 100));
    b.click(P(300, 300));
    expect(b.tool.state).toBe('chain');
    expect(b.walls()).toHaveLength(0);
    b.engine.controller.keyDown(b.key('Enter'));
    expect(b.tool.state).toBe('idle');
    expect(b.walls().map((w) => w.points)).toEqual([[P(100, 100), P(300, 100), P(300, 300)]]);
    await b.commands.idle();
    expect(b.obstacles.batch).toHaveBeenCalledTimes(1);
    expect(b.commands.history.undo).toHaveLength(1);
  });

  it('double clic : finit la chaîne au point du double clic', () => {
    const b = bench();
    b.click(P(100, 100));
    b.doubleClick(P(300, 100));
    expect(b.tool.state).toBe('idle');
    expect(b.walls().map((w) => w.points)).toEqual([[P(100, 100), P(300, 100)]]);
  });

  it('clic sur le premier point : la boucle se ferme', () => {
    const b = bench();
    for (const p of [P(100, 100), P(300, 100), P(300, 300), P(102, 98)]) b.click(p);
    expect(b.tool.state).toBe('idle');
    expect(b.walls()[0]!.points).toEqual([P(100, 100), P(300, 100), P(300, 300), P(100, 100)]);
  });

  it('fermer la boucle par un double clic sur le premier point ne recommence pas de chaîne', () => {
    const b = bench();
    for (const p of [P(100, 100), P(300, 100), P(300, 300)]) b.click(p);
    b.doubleClick(P(100, 100));
    expect(b.tool.state).toBe('idle');
    expect(b.tool.chain).toEqual([]);
    expect(b.walls()).toHaveLength(1);
    expect(b.walls()[0]!.points).toHaveLength(4);
  });

  it('Échap abandonne le segment en cours et pose les segments déjà posés', () => {
    const b = bench();
    b.click(P(100, 100));
    b.click(P(300, 100));
    b.hover(P(300, 250));
    b.engine.controller.keyDown(b.key('Escape'));
    expect(b.tool.state).toBe('idle');
    expect(b.walls().map((w) => w.points)).toEqual([[P(100, 100), P(300, 100)]]);
    // Un seul point : rien n'est écrit
    b.click(P(500, 500));
    b.engine.controller.keyDown(b.key('Escape'));
    expect(b.walls()).toHaveLength(1);
  });

  it('Retour arrière retire le dernier point', () => {
    const b = bench();
    b.click(P(100, 100));
    b.click(P(300, 100));
    b.click(P(300, 300));
    b.engine.controller.keyDown(b.key('Backspace'));
    expect(b.tool.chain).toEqual([P(100, 100), P(300, 100)]);
  });

  it('aimante à la grille ; Alt s’en passe', () => {
    const b = bench();
    b.click(P(104, 96));
    b.click(P(311, 97), { alt: true });
    b.engine.controller.keyDown(b.key('Enter'));
    expect(b.walls()[0]!.points).toEqual([P(100, 100), P(311, 97)]);
  });

  it('⇧ aligne à 15° depuis le point précédent', () => {
    const b = bench();
    b.click(P(100, 100));
    b.click(P(300, 110), { shift: true });
    b.engine.controller.keyDown(b.key('Enter'));
    const [, end] = b.walls()[0]!.points;
    expect(end!.y).toBeCloseTo(100, 1);
  });

  it('aimante à l’extrémité existante (10 px d’écran), avant la grille : soudure exacte', () => {
    const b = bench({ walls: [wall('a', [P(0, 0), P(123.45, 77.7)])] });
    b.click(P(126, 80));
    b.click(P(300, 80), { alt: true });
    b.engine.controller.keyDown(b.key('Enter'));
    const created = b.walls().find((w) => w.id !== 'a')!;
    expect(created.points[0]).toEqual(P(123.45, 77.7));
  });

  it('point sur un segment existant : le mur est scindé (jonction soudée), en une commande', async () => {
    const b = bench({ walls: [wall('a', [P(0, 0), P(400, 0)])] });
    b.click(P(203, 4), { alt: true });
    b.click(P(203, 200), { alt: true });
    b.engine.controller.keyDown(b.key('Enter'));
    const a = b.walls().find((w) => w.id === 'a')!;
    const created = b.walls().find((w) => w.id !== 'a')!;
    expect(a.points).toHaveLength(3);
    expect(a.points[1]).toEqual(created.points[0]);
    expect(a.points[1]!.y).toBe(0);
    await b.commands.idle();
    expect(b.obstacles.batch).toHaveBeenCalledTimes(1);
    const w = b.obstacles.batch.mock.calls[0]![0];
    expect(w.create).toHaveLength(1);
    expect(w.update).toHaveLength(1);
    // Annuler défait le tout
    await b.commands.undo();
    expect(b.walls()).toHaveLength(1);
    expect(b.walls()[0]!.points).toEqual([P(0, 0), P(400, 0)]);
  });

  it('refuse les segments de moins de 2 px', () => {
    const b = bench();
    b.click(P(100, 100), { alt: true });
    b.click(P(101, 100), { alt: true });
    expect(b.tool.chain).toHaveLength(1);
  });
});

describe('outil obstacles : autres modes', () => {
  it('rectangle de murs : glisser pose 4 murs soudés', () => {
    const b = bench({ mode: 'rect' });
    b.drag(P(100, 100), P(300, 250));
    expect(b.walls().map((w) => w.points)).toEqual([
      [P(100, 100), P(300, 100), P(300, 250), P(100, 250), P(100, 100)],
    ]);
  });

  it('porte : clic sur un mur = porte d’une case centrée, le mur scindé', async () => {
    const b = bench({ mode: 'door', walls: [wall('a', [P(0, 100), P(400, 100)])] });
    b.hover(P(200, 104));
    expect(b.tool.doorHover?.door).toEqual([P(175, 100), P(225, 100)]);
    b.click(P(200, 104));
    const kinds = b.walls().map((w) => [w.kind, w.points]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        ['wall', [P(0, 100), P(175, 100)]],
        ['wall', [P(225, 100), P(400, 100)]],
        ['door', [P(175, 100), P(225, 100)]],
      ]),
    );
    await b.commands.idle();
    expect(b.obstacles.batch).toHaveBeenCalledTimes(1);
  });

  it('porte : largeur réglable ; tracé libre en deux clics loin d’un mur', () => {
    const b = bench({ mode: 'door', walls: [wall('a', [P(0, 100), P(400, 100)])] });
    b.tool.settings.setState({ doorWidth: 2 });
    b.hover(P(200, 100));
    expect(b.tool.doorHover?.door).toEqual([P(150, 100), P(250, 100)]);
    b.click(P(100, 400));
    b.click(P(150, 400));
    expect(b.walls().find((w) => w.kind === 'door')!.points).toEqual([P(100, 400), P(150, 400)]);
  });

  it('fenêtre et sens unique : même geste que le mur, autre sorte', () => {
    const b = bench({ mode: 'window' });
    b.click(P(100, 100));
    b.doubleClick(P(200, 100));
    b.tool.setMode('oneway');
    b.click(P(100, 300));
    b.doubleClick(P(200, 300));
    expect(b.walls().map((w) => [w.kind, w.blocksFrom])).toEqual([
      ['window', null],
      ['one_way_wall', 'left'],
    ]);
  });

  it('pièce : rectangle glissé, avec ses murs, en une commande par couche', async () => {
    const b = bench({ mode: 'room' });
    b.drag(P(100, 100), P(300, 300));
    expect(b.roomList().map((r) => [r.name, r.points.length])).toEqual([['Pièce 1', 4]]);
    expect(b.walls()).toHaveLength(1);
    await b.commands.idle();
    expect(b.rooms.batch).toHaveBeenCalledTimes(1);
    expect(b.obstacles.batch).toHaveBeenCalledTimes(1);
    expect(b.commands.history.undo).toHaveLength(1);
  });

  it('pièce : polygone clic à clic, sans murs si l’option est coupée', () => {
    const b = bench({ mode: 'room' });
    b.tool.settings.setState({ roomWalls: false });
    b.click(P(100, 100));
    b.click(P(300, 100));
    b.click(P(200, 300));
    b.click(P(100, 100));
    expect(b.roomList()[0]!.points).toEqual([P(100, 100), P(300, 100), P(200, 300)]);
    expect(b.walls()).toHaveLength(0);
  });

  it('les chiffres 1 à 6 changent de sous-mode (plus d’outil Pièce)', () => {
    const b = bench();
    b.engine.controller.keyDown(b.key('3', { code: 'Digit3' }));
    expect(b.tool.mode).toBe('door');
    b.engine.controller.keyDown(b.key('6', { code: 'Digit6' }));
    expect(b.tool.mode).toBe('edit');
    // 7 : plus rien
    b.engine.controller.keyDown(b.key('7', { code: 'Digit7' }));
    expect(b.tool.mode).toBe('edit');
  });
});

describe('outil obstacles : édition', () => {
  const corner = () => [
    wall('a', [P(100, 100), P(300, 100)]),
    wall('b', [P(300, 100), P(300, 300)]),
  ];

  it('glisser un sommet : les sommets soudés bougent ensemble, une commande', async () => {
    const b = bench({ mode: 'edit', walls: corner() });
    b.drag(P(300, 100), P(350, 150));
    const byId = new Map(b.walls().map((w) => [w.id, w.points]));
    expect(byId.get('a')![1]).toEqual(P(350, 150));
    expect(byId.get('b')![0]).toEqual(P(350, 150));
    await b.commands.idle();
    expect(b.obstacles.batch).toHaveBeenCalledTimes(1);
    expect(b.obstacles.batch.mock.calls[0]![0].update).toHaveLength(2);
  });

  it('Alt + glisser détache le sommet', () => {
    const b = bench({ mode: 'edit', walls: corner() });
    b.engine.selection.replace(['a']);
    b.drag(P(300, 100), P(350, 150), { alt: true });
    const byId = new Map(b.walls().map((w) => [w.id, w.points]));
    expect(byId.get('a')![1]).toEqual(P(350, 150));
    expect(byId.get('b')![0]).toEqual(P(300, 100));
  });

  it('Échap pendant le glisser : rien n’est écrit', () => {
    const b = bench({ mode: 'edit', walls: corner() });
    b.drag(P(300, 100), P(350, 150), {}, false);
    expect(b.tool.state).toBe('vertex');
    b.engine.controller.keyDown(b.key('Escape'));
    b.engine.controller.pointerUp(b.pointer(P(350, 150), { buttons: 0 }));
    expect(b.walls().find((w) => w.id === 'a')!.points[1]).toEqual(P(300, 100));
    expect(b.commands.history.undo).toHaveLength(0);
  });

  it('double clic sur un segment : ajoute un sommet', () => {
    const b = bench({ mode: 'edit', walls: corner() });
    b.doubleClick(P(200, 102));
    expect(b.walls().find((w) => w.id === 'a')!.points).toEqual([
      P(100, 100),
      P(200, 100),
      P(300, 100),
    ]);
  });

  it('Suppr : supprime le sommet cliqué, puis le segment cliqué', () => {
    const b = bench({
      mode: 'edit',
      walls: [wall('a', [P(100, 100), P(200, 100), P(300, 100), P(300, 300)])],
    });
    b.click(P(200, 100));
    expect(b.tool.sub?.type).toBe('vertex');
    b.engine.controller.keyDown(b.key('Delete'));
    expect(b.walls()[0]!.points).toEqual([P(100, 100), P(300, 100), P(300, 300)]);
    b.click(P(300, 200));
    expect(b.tool.sub).toEqual({ type: 'segment', id: 'a', index: 1 });
    b.engine.controller.keyDown(b.key('Delete'));
    expect(b.walls()[0]!.points).toEqual([P(100, 100), P(300, 100)]);
  });

  it('glisser un mur étire le voisin soudé', () => {
    const b = bench({ mode: 'edit', walls: corner() });
    b.drag(P(200, 100), P(200, 150));
    const byId = new Map(b.walls().map((w) => [w.id, w.points]));
    expect(byId.get('a')).toEqual([P(100, 150), P(300, 150)]);
    expect(byId.get('b')).toEqual([P(300, 150), P(300, 300)]);
  });

  it('un clic sur l’icône d’une porte la sélectionne dans l’outil W (sans l’ouvrir)', () => {
    const b = bench({
      mode: 'edit',
      walls: [wall('d', [P(100, 100), P(300, 100)], { kind: 'door' })],
    });
    b.click(P(200, 100));
    expect(b.engine.selection.ids).toEqual(['d']);
    expect(b.walls()[0]!.isOpen).toBe(false);
  });

  it('les tokens et objets ne se touchent pas avec l’outil W', () => {
    const b = bench({ mode: 'edit' });
    b.store.getState().upsert('boxes', [{ id: 'box', version: 1, x: 500, y: 500, w: 40, h: 40 }]);
    expect(b.engine.hitTest(P(500, 500))).toBeNull();
    b.engine.tools.activate('select');
    expect(b.engine.hitTest(P(500, 500))?.id).toBe('box');
  });
});

describe('portes : clic de tous, hors de l’outil', () => {
  it('MJ : un clic sur l’icône sélectionne la porte et ouvre son panneau, sans l’ouvrir', () => {
    const b = bench({ walls: [wall('d', [P(100, 100), P(150, 100)], { kind: 'door' })] });
    b.engine.tools.activate('select');
    b.click(P(125, 100));
    expect(b.walls()[0]!.isOpen).toBe(false);
    expect(b.engine.selection.ids).toEqual(['d']);
    expect(b.engine.ui.getState().selectionPanel).toBe(true);
    // « Ouvrir la porte » : l'action principale de son panneau
    const toggle = b.engine.menuItems(['d'], P(125, 100)).find((i) => i.id === 'door:toggle');
    expect(toggle).toMatchObject({ label: 'Ouvrir la porte', primary: true });
    toggle!.run!();
    expect(b.walls()[0]!.isOpen).toBe(true);
  });

  it('joueur : un clic sur l’icône ouvre la porte (hors de la pile), sans la sélectionner', () => {
    const b = bench({ walls: [wall('d', [P(100, 100), P(150, 100)], { kind: 'door' })] });
    b.engine.tools.activate('select');
    b.engine.setViewer({ userId: 'joueur', role: 'player', characterIds: [] });
    b.click(P(125, 100));
    expect(b.walls()[0]!.isOpen).toBe(true);
    expect(b.engine.selection.size).toBe(0);
    expect(b.commands.history.undo).toHaveLength(0);
  });

  it('joueur : une porte verrouillée refuse, avec un message', () => {
    const b = bench({
      walls: [wall('d', [P(100, 100), P(150, 100)], { kind: 'door', isLocked: true })],
    });
    b.engine.tools.activate('select');
    b.engine.setViewer({ userId: 'joueur', role: 'player', characterIds: [] });
    b.click(P(125, 100));
    expect(b.walls()[0]!.isOpen).toBe(false);
    expect(b.notify).toHaveBeenCalledWith('Cette porte est verrouillée.');
  });
});
