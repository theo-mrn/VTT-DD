import { afterEach, describe, expect, it, vi } from 'vitest';
import { box, setup } from '../test-kit';
import { LONG_PRESS_MS } from './controller';

const LAYERS = [
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
    id: 'objets',
    version: 1,
    name: 'Objets',
    sortOrder: 1,
    visibleToPlayers: true,
    locked: false,
    opacity: 1,
    role: 'objects',
  },
  {
    id: 'toit',
    version: 1,
    name: 'Toit',
    sortOrder: 2,
    visibleToPlayers: true,
    locked: false,
    opacity: 1,
    role: null,
  },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('gestes communs', () => {
  it('clic : sélectionne ; ⇧ + clic : ajoute ou retire ; clic dans le vide : désélectionne', () => {
    const t = setup({ boxes: [box('a', 100, 100), box('b', 300, 300)] });
    t.click({ x: 100, y: 100 });
    expect(t.engine.selection.ids).toEqual(['a']);
    t.click({ x: 300, y: 300 }, { shift: true });
    expect(t.engine.selection.ids).toEqual(['a', 'b']);
    t.click({ x: 100, y: 100 }, { shift: true });
    expect(t.engine.selection.ids).toEqual(['b']);
    t.click({ x: 700, y: 700 });
    expect(t.engine.selection.ids).toEqual([]);
  });

  it('sous le seuil de 4 px, c’est un clic : rien ne bouge', () => {
    const t = setup({ boxes: [box('a', 100, 100)] });
    // 2 pixels du monde ≈ 1,9 px d'écran
    t.drag({ x: 100, y: 100 }, { x: 102, y: 100 });
    expect(t.persistence.update).not.toHaveBeenCalled();
    expect(t.data('a')?.x).toBe(100);
    expect(t.engine.selection.ids).toEqual(['a']);
  });

  it('panneau de la sélection : au clic simple, jamais pendant ni après un glisser', () => {
    const t = setup({ boxes: [box('a', 100, 100), box('b', 300, 300)] });
    const panel = () => t.engine.ui.getState().selectionPanel;
    t.drag({ x: 100, y: 100 }, { x: 160, y: 100 });
    expect([t.engine.selection.ids, panel()]).toEqual([['a'], false]);
    t.click({ x: 300, y: 300 });
    expect([t.engine.selection.ids, panel()]).toEqual([['b'], true]);
    // Glisser l'élément ouvert : le panneau se ferme et ne revient pas au lâcher
    t.drag({ x: 300, y: 300 }, { x: 360, y: 300 });
    expect([t.engine.selection.ids, panel()]).toEqual([['b'], false]);
    t.click({ x: 700, y: 700 });
    expect([t.engine.selection.ids, panel()]).toEqual([[], false]);
  });

  it('glisser déplace toute la sélection en une seule commande', async () => {
    const t = setup({ boxes: [box('a', 100, 100), box('b', 300, 300), box('c', 600, 600)] });
    t.click({ x: 100, y: 100 });
    t.click({ x: 300, y: 300 }, { shift: true });
    // Alt : sans aimantation à la grille
    t.drag({ x: 100, y: 100 }, { x: 137, y: 121 }, { alt: true });
    await t.commands.idle();
    expect(t.persistence.update).toHaveBeenCalledTimes(1);
    const updates = t.persistence.update.mock.calls[0]![0];
    expect(updates.map((u) => u.after.id).sort()).toEqual(['a', 'b']);
    expect(t.data('a')).toMatchObject({ x: 137, y: 121, version: 2 });
    expect(t.data('b')).toMatchObject({ x: 337, y: 321 });
    expect(t.data('c')?.x).toBe(600);
  });

  it('aimante l’entité tenue à la grille (Alt pour s’en passer)', async () => {
    const t = setup({ boxes: [box('a', 20, 20)] });
    // Boîte de 40 < case de 50 : elle se centre dans sa case
    t.drag({ x: 20, y: 20 }, { x: 97, y: 81 });
    await t.commands.idle();
    expect(t.data('a')).toMatchObject({ x: 75, y: 75 });
  });

  it('Échap pendant le glisser : tout revient en place, rien n’est écrit', () => {
    const t = setup({ boxes: [box('a', 100, 100)] });
    t.drag({ x: 100, y: 100 }, { x: 300, y: 300 }, { alt: true }, false);
    expect(t.engine.entity('a')?.current.x).toBe(300);
    expect(t.engine.controller.keyDown(t.key('Escape'))).toBe(true);
    expect(t.engine.entity('a')?.preview).toBeNull();
    expect(t.engine.entity('a')?.current.x).toBe(100);
    t.engine.controller.pointerUp(t.pointer({ x: 300, y: 300 }, { buttons: 0 }));
    expect(t.persistence.update).not.toHaveBeenCalled();
  });

  it('glisser : début, déplacements et fin signalés aux modules (validé ou annulé)', async () => {
    const t = setup({ boxes: [box('a', 100, 100), box('b', 300, 300)] });
    const steps: string[] = [];
    t.engine.onDrag((e) => steps.push(`${e.phase}:${e.primary.id}:${e.committed}`));
    t.drag({ x: 100, y: 100 }, { x: 200, y: 100 }, { alt: true });
    await t.commands.idle();
    expect(steps[0]).toBe('start:a:false');
    expect(steps).toContain('move:a:false');
    expect(steps.at(-1)).toBe('end:a:true');
    steps.length = 0;
    t.drag({ x: 300, y: 300 }, { x: 400, y: 300 }, { alt: true }, false);
    t.engine.controller.keyDown(t.key('Escape'));
    expect(steps.at(-1)).toBe('end:b:false');
  });

  it('pendant un geste, touches et clic droit sont proposés aux modules ; Échap garde son sens', () => {
    const t = setup({ boxes: [box('a', 100, 100)] });
    const inputs: string[] = [];
    t.engine.onGestureInput((i) => {
      inputs.push(i.kind === 'key' ? i.key.code : `bouton ${i.pointer.button}`);
      return i.kind === 'button' || i.key.code === 'Space';
    });
    // Hors geste : rien n'est proposé
    t.engine.controller.keyDown(t.key(' ', { code: 'Space' }));
    t.engine.controller.keyUp(t.key(' ', { code: 'Space' }));
    expect(inputs).toEqual([]);
    t.drag({ x: 100, y: 100 }, { x: 200, y: 100 }, { alt: true }, false);
    expect(t.engine.controller.keyDown(t.key(' ', { code: 'Space' }))).toBe(true);
    t.engine.controller.pointerChord(t.pointer({ x: 200, y: 100 }, { button: 2, buttons: 3 }));
    t.engine.controller.pointerDown(t.pointer({ x: 200, y: 100 }, { id: 2, button: 2 }));
    expect(t.engine.controller.keyDown(t.key('Escape'))).toBe(true);
    expect(inputs).toEqual(['Space', 'bouton 2', 'bouton 2']);
    expect(t.engine.entity('a')?.preview).toBeNull();
  });

  it('un élément verrouillé se sélectionne mais ne bouge pas', () => {
    const t = setup({ boxes: [box('a', 100, 100, { locked: true })] });
    t.drag({ x: 100, y: 100 }, { x: 300, y: 300 });
    expect(t.engine.selection.ids).toEqual(['a']);
    expect(t.persistence.update).not.toHaveBeenCalled();
    expect(t.engine.entity('a')?.current.x).toBe(100);
  });

  it('⇧ + glisser dans le vide trace un lasso, qui ajoute à la sélection', () => {
    const t = setup({
      boxes: [box('a', 100, 100), box('b', 200, 150), box('c', 800, 800)],
    });
    t.drag({ x: 50, y: 50 }, { x: 250, y: 250 }, { shift: true });
    expect([...t.engine.selection.ids].sort()).toEqual(['a', 'b']);
    t.drag({ x: 750, y: 750 }, { x: 900, y: 900 }, { shift: true });
    expect([...t.engine.selection.ids].sort()).toEqual(['a', 'b', 'c']);
  });

  it('glisser dans le vide déplace la carte, sans toucher à la sélection', () => {
    const t = setup({ boxes: [box('a', 100, 100)] });
    t.click({ x: 100, y: 100 });
    const cam = t.engine.camera;
    const before = { x: cam.x, y: cam.y };
    const c = t.engine.controller;
    // Positions d'écran fixes : la carte suit le pointeur de 100 px vers la droite, 50 vers le bas
    const down = t.pointer({ x: 500, y: 500 });
    c.pointerDown(down);
    const screen = { x: down.screen.x + 100, y: down.screen.y + 50 };
    c.pointerMove({ ...down, screen, world: cam.screenToWorld(screen) });
    c.pointerUp({ ...down, screen, world: cam.screenToWorld(screen), buttons: 0 });
    expect(cam.x).toBeCloseTo(before.x - 100 / cam.zoom);
    expect(cam.y).toBeCloseTo(before.y - 50 / cam.zoom);
    expect(t.engine.selection.ids).toEqual(['a']);
    expect(t.persistence.update).not.toHaveBeenCalled();
  });

  it('glisser un élément qui ne bouge pas (verrouillé) déplace la carte', () => {
    const t = setup({ boxes: [box('a', 500, 500, { locked: true })] });
    const cam = t.engine.camera;
    const before = cam.x;
    const c = t.engine.controller;
    const down = t.pointer({ x: 500, y: 500 });
    c.pointerDown(down);
    const screen = { x: down.screen.x - 80, y: down.screen.y };
    c.pointerMove({ ...down, screen, world: cam.screenToWorld(screen) });
    c.pointerUp({ ...down, screen, world: cam.screenToWorld(screen), buttons: 0 });
    expect(cam.x).toBeCloseTo(before + 80 / cam.zoom);
    expect(t.engine.entity('a')?.current.x).toBe(500);
    expect(t.persistence.update).not.toHaveBeenCalled();
  });

  it('double clic : ouvre l’inspecteur', () => {
    const t = setup({ boxes: [box('a', 100, 100)] });
    const c = t.engine.controller;
    const down = t.pointer({ x: 100, y: 100 });
    c.pointerDown(down);
    c.pointerUp({ ...down, buttons: 0 });
    c.pointerDown({ ...down, time: down.time + 200 });
    c.pointerUp({ ...down, time: down.time + 250, buttons: 0 });
    expect(t.engine.ui.getState().inspector).toEqual(['a']);
  });

  it('clic droit : l’entité est sélectionnée, son panneau sert de menu ; menu de la carte au vide', () => {
    const t = setup({ boxes: [box('a', 100, 100), box('b', 300, 300)] });
    t.engine.controller.pointerDown(t.pointer({ x: 100, y: 100 }, { button: 2, buttons: 2 }));
    expect(t.engine.ui.getState().menu).toBeNull();
    expect(t.engine.selection.ids).toEqual(['a']);
    const labels = t.engine.menuItems(['a'], { x: 100, y: 100 }).map((i) => i.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Inspecter',
        'Verrouiller',
        'Pivoter',
        'Dupliquer',
        'Disposition',
        'Supprimer',
      ]),
    );
    // Dans le vide : menu de la carte, sélection vidée
    t.engine.controller.pointerDown(t.pointer({ x: 700, y: 700 }, { button: 2, buttons: 2 }));
    const empty = t.engine.ui.getState().menu!;
    expect(empty.ids).toEqual([]);
    expect(t.engine.menuItems([], empty.world).map((i) => i.id)).toContain('map:ping');
  });

  it('appui long au doigt : sélectionne l’entité, menu de la carte au vide', () => {
    vi.useFakeTimers();
    const t = setup({ boxes: [box('a', 100, 100)] });
    t.engine.controller.pointerDown(t.pointer({ x: 100, y: 100 }, { type: 'touch' }));
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    expect(t.engine.ui.getState().menu).toBeNull();
    expect(t.engine.selection.ids).toEqual(['a']);
  });

  it('clavier : Suppr supprime, flèches déplacent d’une case, ⌘Z annule', async () => {
    const t = setup({ boxes: [box('a', 100, 100), box('b', 300, 300)] });
    const c = t.engine.controller;
    t.click({ x: 100, y: 100 });
    expect(c.keyDown(t.key('ArrowRight'))).toBe(true);
    await t.commands.idle();
    expect(t.data('a')?.x).toBe(150);
    expect(c.keyDown(t.key('ArrowDown', { shift: true }))).toBe(true);
    await t.commands.idle();
    expect(t.data('a')?.y).toBe(350);
    expect(c.keyDown(t.key('z', { meta: true }))).toBe(true);
    await t.commands.idle();
    expect(t.data('a')?.y).toBe(100);

    t.click({ x: 300, y: 300 });
    expect(c.keyDown(t.key('Delete'))).toBe(true);
    await t.commands.idle();
    expect(t.persistence.remove).toHaveBeenCalledTimes(1);
    expect(t.data('b')).toBeUndefined();
    expect(t.engine.selection.ids).toEqual([]);
  });

  it('Échap annule l’outil, puis vide la sélection', () => {
    const t = setup({ boxes: [box('a', 100, 100)] });
    t.click({ x: 100, y: 100 });
    expect(t.engine.controller.keyDown(t.key('Escape'))).toBe(true);
    expect(t.engine.selection.ids).toEqual([]);
    expect(t.engine.controller.keyDown(t.key('Escape'))).toBe(false);
  });

  it('les raccourcis d’un joueur ne touchent pas ce qu’il n’a pas le droit de modifier', () => {
    const t = setup({
      boxes: [box('a', 100, 100)],
      viewer: { userId: 'joueur', role: 'player', characterIds: [] },
    });
    t.click({ x: 100, y: 100 });
    expect(t.engine.selection.ids).toEqual(['a']);
    t.drag({ x: 100, y: 100 }, { x: 300, y: 300 });
    t.engine.controller.keyDown(t.key('Delete'));
    expect(t.persistence.update).not.toHaveBeenCalled();
    expect(t.persistence.remove).not.toHaveBeenCalled();
  });
});

describe('calques du MJ', () => {
  it('le toucher prend le calque le plus haut, puis le z le plus grand', () => {
    const t = setup({
      layers: LAYERS,
      boxes: [
        box('tapis', 100, 100, { layerId: 'sol', z: 5 }),
        box('table', 100, 100, { layerId: 'objets', z: 1 }),
        box('vase', 100, 100, { layerId: 'objets', z: 2 }),
      ],
    });
    expect(t.engine.hitTest({ x: 100, y: 100 })?.id).toBe('vase');
    t.store
      .getState()
      .upsert('boxes', [box('toit', 100, 100, { layerId: 'toit', z: 0, version: 2 })]);
    expect(t.engine.hitTest({ x: 100, y: 100 })?.id).toBe('toit');
  });

  it('un calque verrouillé ou caché localement se traverse au clic', () => {
    const t = setup({
      layers: LAYERS.map((l) => (l.id === 'toit' ? { ...l, locked: true } : l)),
      boxes: [
        box('table', 100, 100, { layerId: 'objets' }),
        box('toit', 100, 100, { layerId: 'toit' }),
      ],
    });
    expect(t.engine.hitTest({ x: 100, y: 100 })?.id).toBe('table');
    t.engine.setLayerHiddenLocally('objets', true);
    expect(t.engine.hitTest({ x: 100, y: 100 })).toBeNull();
  });

  it('un élément sans calque connu va dans le calque de son rôle', () => {
    const t = setup({ layers: LAYERS, boxes: [box('a', 100, 100, { layerId: 'disparu' })] });
    expect(t.engine.entity('a')?.layerId).toBe('objets');
    expect(t.engine.entity('a')?.plane).toBe('content');
  });

  it('⌘↑ avance d’un cran : une commande, seuls les éléments déplacés', async () => {
    const t = setup({
      layers: LAYERS,
      boxes: [
        box('a', 100, 100, { layerId: 'objets', z: 0 }),
        box('b', 300, 300, { layerId: 'objets', z: 10 }),
        box('c', 500, 500, { layerId: 'objets', z: 20 }),
      ],
    });
    t.click({ x: 300, y: 300 });
    expect(t.engine.selection.ids).toEqual(['b']);
    expect(t.engine.controller.keyDown(t.key('ArrowUp', { meta: true }))).toBe(true);
    await t.commands.idle();
    expect(t.backend.arrange).toHaveBeenCalledTimes(1);
    const items = t.backend.arrange.mock.calls[0]![0] as { id: string; z: number }[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'b', kind: 'object', layerId: 'objets' });
    expect(items[0]!.z).toBeGreaterThan(20);
    expect(t.engine.entity('b')?.z).toBe(items[0]!.z);
  });

  it('⌥⌘↑ change de calque en gardant l’ordre relatif ; annuler le remet', async () => {
    const t = setup({
      layers: LAYERS,
      boxes: [
        box('a', 100, 100, { layerId: 'objets', z: 1 }),
        box('b', 300, 300, { layerId: 'objets', z: 2 }),
        box('toit', 800, 800, { layerId: 'toit', z: 7 }),
      ],
    });
    t.click({ x: 100, y: 100 });
    t.click({ x: 300, y: 300 }, { shift: true });
    t.engine.controller.keyDown(t.key('ArrowUp', { meta: true, alt: true }));
    await t.commands.idle();
    const items = t.backend.arrange.mock.calls[0]![0] as {
      id: string;
      layerId: string;
      z: number;
    }[];
    expect(items.map((i) => i.layerId)).toEqual(['toit', 'toit']);
    const za = items.find((i) => i.id === 'a')!.z;
    const zb = items.find((i) => i.id === 'b')!.z;
    // En bas du calque du dessus, a toujours sous b
    expect(za).toBeLessThan(zb);
    expect(zb).toBeLessThan(7);
    expect(t.engine.entity('a')?.layerId).toBe('toit');

    await t.commands.undo();
    expect(t.engine.entity('a')).toMatchObject({ layerId: 'objets', z: 1 });
    const back = t.backend.arrange.mock.calls[1]![0] as { id: string; layerId: string }[];
    expect(back.every((i) => i.layerId === 'objets')).toBe(true);
  });
});
