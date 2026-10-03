// @vitest-environment jsdom
/**
 * Outil murs (W) sur la carte complète, avec son calque d'aide dessiné à chaque image : chaîne
 * de murs (longueur affichée), rectangle (carré avec ⇧), porte posée sur un mur (aperçu),
 * sous-mode Édition (survol des sommets et segments, glisser d'un sommet, lasso, flèches),
 * Échap dans chaque état, pièces sélectionnées, double clic d'un mur hors de l'outil.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Point } from '../../engine/geometry';
import { GM, mountMap, type MapHarness } from '../../test/map-harness';

let h: MapHarness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

async function withTool(mode?: string) {
  const m = await mountMap({ viewer: GM });
  m.engine.tools.activate('obstacles');
  if (mode) m.press(mode, { code: `Digit${mode}` });
  m.frame();
  return m;
}

/** Mouvement suivi d'une image : le calque d'aide se redessine. */
const step = (m: MapHarness, p: Point, extra = {}) => {
  m.move(p, extra);
  m.frame();
};

describe('tracer', () => {
  it('chaîne de murs : aperçu et longueur à chaque mouvement, Entrée pose', async () => {
    h = await withTool('1');
    h.click({ x: 1000, y: 1000 });
    step(h, { x: 1100, y: 1000 });
    h.click({ x: 1100, y: 1000 });
    step(h, { x: 1100, y: 1150 }, { shift: true });
    h.press('Enter');
    await h.commands.idle();
    expect(h.persistence('obstacles').create).toHaveBeenCalled();
  });

  it('rectangle : ⇧ le rend carré ; Échap pendant le glisser n’écrit rien', async () => {
    h = await withTool('2');
    const c = h.engine.controller;
    c.pointerDown(h.pointer({ x: 1000, y: 1000 }));
    c.pointerMove(h.pointer({ x: 1200, y: 1050 }, { button: -1, shift: true }));
    h.frame();
    c.pointerUp(h.pointer({ x: 1200, y: 1050 }, { buttons: 0, shift: true }));
    await h.commands.idle();
    const created = h.persistence('obstacles').create.mock.calls[0]![0] as unknown as {
      points: Point[];
    }[];
    const xs = created.flatMap((w) => w.points.map((p) => p.x));
    const ys = created.flatMap((w) => w.points.map((p) => p.y));
    expect(Math.max(...xs) - Math.min(...xs)).toBe(Math.max(...ys) - Math.min(...ys));
    c.pointerDown(h.pointer({ x: 1300, y: 1300 }));
    c.pointerMove(h.pointer({ x: 1400, y: 1400 }, { button: -1 }));
    h.frame();
    h.press('Escape');
    c.pointerUp(h.pointer({ x: 1400, y: 1400 }, { buttons: 0 }));
    await h.commands.idle();
    expect(h.persistence('obstacles').create).toHaveBeenCalledTimes(1);
  });

  it('porte : aperçu au survol d’un mur, posée au clic', async () => {
    h = await withTool('3');
    step(h, { x: 600, y: 450 });
    h.click({ x: 600, y: 450 });
    h.frame();
    await h.commands.idle();
    expect(h.engine.entitiesOfKind('obstacle').length).toBeGreaterThan(4);
  });

  it('Échap pendant une chaîne : la chaîne est posée telle quelle', async () => {
    h = await withTool('4');
    h.click({ x: 1000, y: 1000 });
    h.click({ x: 1100, y: 1000 });
    step(h, { x: 1150, y: 1050 });
    h.press('Escape');
    await h.commands.idle();
    expect(h.persistence('obstacles').create).toHaveBeenCalledTimes(1);
  });
});

describe('éditer', () => {
  it('survol d’un sommet puis d’un segment, glisser d’un sommet avec sa longueur', async () => {
    h = await withTool('6');
    step(h, { x: 600, y: 100 });
    step(h, { x: 600, y: 400 });
    const c = h.engine.controller;
    c.pointerDown(h.pointer({ x: 600, y: 100 }));
    c.pointerMove(h.pointer({ x: 650, y: 100 }, { button: -1 }));
    h.frame();
    c.pointerMove(h.pointer({ x: 700, y: 100 }, { button: -1 }));
    h.frame();
    c.pointerUp(h.pointer({ x: 700, y: 100 }, { buttons: 0 }));
    await h.commands.idle();
    expect((h.get('obstacles', 'w-mur')!.points as Point[])[0]).toEqual({ x: 700, y: 100 });
  });

  it('lasso dans le vide : sélectionne les murs touchés (⇧ ajoute) ; Échap pendant : abandonné', async () => {
    h = await withTool('6');
    const c = h.engine.controller;
    c.pointerDown(h.pointer({ x: 550, y: 50 }));
    c.pointerMove(h.pointer({ x: 650, y: 300 }, { button: -1 }));
    h.frame();
    c.pointerUp(h.pointer({ x: 650, y: 300 }, { buttons: 0 }));
    expect(h.engine.selection.has('w-mur')).toBe(true);
    c.pointerDown(h.pointer({ x: 950, y: 50 }, { shift: true }));
    c.pointerMove(h.pointer({ x: 1250, y: 150 }, { button: -1, shift: true }));
    c.pointerUp(h.pointer({ x: 1250, y: 150 }, { buttons: 0, shift: true }));
    expect(h.engine.selection.has('w-mur')).toBe(true);
    expect(h.engine.selection.has('w-fenetre')).toBe(true);
    c.pointerDown(h.pointer({ x: 1700, y: 1300 }));
    c.pointerMove(h.pointer({ x: 1800, y: 1400 }, { button: -1 }));
    expect(c.keyDown(h.key('Escape'))).toBe(true);
    c.pointerUp(h.pointer({ x: 1800, y: 1400 }, { buttons: 0 }));
  });

  it('flèches : la sélection se pousse d’une case (⇧ : cinq) ; sans sélection : rien', async () => {
    h = await withTool('6');
    const c = h.engine.controller;
    expect(c.keyDown(h.key('ArrowRight'))).toBe(false);
    h.click({ x: 600, y: 450 });
    expect(c.keyDown(h.key('ArrowRight'))).toBe(true);
    expect(c.keyDown(h.key('ArrowDown', { shift: true }))).toBe(true);
    await h.commands.idle();
    expect((h.get('obstacles', 'w-mur')!.points as Point[])[0]).toEqual({ x: 650, y: 350 });
  });

  it('pièce : clic dedans la sélectionne ; clic dans le vide désélectionne (⇧ garde)', async () => {
    h = await withTool('6');
    h.click({ x: 1300, y: 1050 });
    h.frame();
    h.click({ x: 1900, y: 1450 }, { shift: true });
    h.click({ x: 1900, y: 1450 });
    expect(h.engine.selection.size).toBe(0);
  });
});

describe('hors de l’outil', () => {
  it('double clic sur un mur avec la sélection : sélectionné et son panneau ouvert', async () => {
    h = await mountMap({ viewer: GM });
    const p = h.pointer({ x: 600, y: 450 });
    const c = h.engine.controller;
    c.pointerDown(p);
    c.pointerUp({ ...p, buttons: 0 });
    c.pointerDown({ ...p, time: p.time + 100 });
    c.pointerUp({ ...p, time: p.time + 120, buttons: 0 });
    h.frame();
    expect(h.engine.selection.has('w-mur')).toBe(true);
  });
});
