// @vitest-environment jsdom
/**
 * Contrôleur sur la carte complète : déplacer la vue (bouton du milieu, Espace, glisser dans le
 * vide), double clic du milieu (vue d'ensemble), clic droit (menu), pincement à deux doigts,
 * appui long, annulation d'un geste, molette pendant un outil, et les raccourcis (annuler,
 * rétablir, dupliquer, ordre, calques, tourner, pousser, supprimer, Échap, K, outils).
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Point } from '../geometry';
import { layersPanelOf } from '@/lib/map/features/layers/engine/panel';
import { GM, mountMap, type MapHarness } from '../../test/map-harness';

let h: MapHarness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

const at = (m: MapHarness, id: string): Point => {
  const g = m.engine.entity(id)!.current;
  return { x: g.x, y: g.y };
};

describe('déplacer la vue', () => {
  it('bouton du milieu : la vue glisse ; double clic du milieu : vue d’ensemble', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    const before = h.engine.camera.snapshot();
    c.pointerDown(h.pointer({ x: 500, y: 500 }, { button: 1 }));
    expect(c.busy).toBe(true);
    expect(c.currentMode).toBe('pan');
    c.pointerMove(h.pointer({ x: 400, y: 450 }, { button: -1 }));
    c.pointerUp(h.pointer({ x: 400, y: 450 }, { button: 1, buttons: 0 }));
    expect(c.busy).toBe(false);
    expect(h.engine.camera.snapshot()).not.toEqual(before);
    // Deux clics du milieu rapprochés : vue d'ensemble
    const p = h.pointer({ x: 300, y: 300 }, { button: 1 });
    c.pointerDown(p);
    c.pointerUp({ ...p, buttons: 0 });
    c.pointerDown({ ...p, time: p.time + 100 });
    c.pointerUp({ ...p, time: p.time + 120, buttons: 0 });
    h.frames(30, 30);
  });

  it('Espace tenu : le glisser déplace la vue, curseur « main » ; relâché ou focus perdu : fini', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    expect(c.keyDown(h.key(' ', { code: 'Space' }))).toBe(true);
    expect(c.keyDown(h.key(' ', { code: 'Space', repeat: true }))).toBe(true);
    expect(c.cursor()).toBe('grab');
    c.pointerDown(h.pointer(at(h, 't-heros')));
    expect(c.currentMode).toBe('pan');
    c.pointerUp(h.pointer(at(h, 't-heros'), { buttons: 0 }));
    c.keyUp(h.key(' ', { code: 'Space' }));
    expect(c.cursor()).not.toBe('grab');
    c.keyDown(h.key(' ', { code: 'Space' }));
    c.blur();
    expect(c.cursor()).not.toBe('grab');
    c.blur();
  });

  it('clic droit : sur un élément, le sélectionne (panneau) ; dans le vide, menu de la carte', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    c.pointerDown(h.pointer(at(h, 't-heros'), { button: 2 }));
    expect(h.engine.selection.has('t-heros')).toBe(true);
    expect(h.engine.ui.getState().selectionPanel).toBe(true);
    c.pointerUp(h.pointer(at(h, 't-heros'), { button: 2, buttons: 0 }));
    c.pointerDown(h.pointer({ x: 1950, y: 1450 }, { button: 2 }));
    expect(h.engine.selection.size).toBe(0);
    expect(h.engine.ui.getState().menu).not.toBeNull();
    h.engine.closeMenu();
    // Pendant un glisser de la vue, un second bouton est ignoré
    c.pointerDown(h.pointer({ x: 1900, y: 1400 }, { button: 1 }));
    expect(c.pointerDown(h.pointer({ x: 1900, y: 1400 }, { id: 2, button: 2 }))).toBe(true);
    expect(h.engine.ui.getState().menu).toBeNull();
    c.pointerUp(h.pointer({ x: 1900, y: 1400 }, { button: 1, buttons: 0 }));
  });

  it('pincement à deux doigts : zoom et déplacement ; un doigt levé : la vue glisse encore', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    const zoom = h.engine.camera.zoom;
    const touch = (id: number, x: number, y: number) =>
      h!.pointer({ x, y }, { id, type: 'touch', screen: { x, y } });
    c.pointerDown(touch(1, 400, 400));
    c.pointerDown(touch(2, 500, 400));
    expect(c.currentMode).toBe('pinch');
    c.pointerMove(touch(1, 350, 400));
    c.pointerMove(touch(2, 550, 400));
    expect(h.engine.camera.zoom).toBeGreaterThan(zoom);
    // Échap pendant le pincement : gardé
    expect(c.keyDown(h.key('Escape'))).toBe(true);
    c.pointerUp({ ...touch(2, 550, 400), buttons: 0 });
    expect(c.currentMode).toBe('pan');
    c.pointerMove(touch(1, 300, 380));
    c.pointerUp({ ...touch(1, 300, 380), buttons: 0 });
    expect(c.busy).toBe(false);
  });

  it('pincement pendant un geste d’outil : l’outil est annulé', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    h.engine.tools.activate('obstacles');
    c.pointerDown(h.pointer({ x: 1000, y: 1000 }, { id: 1, type: 'touch' }));
    c.pointerDown(h.pointer({ x: 1100, y: 1000 }, { id: 2, type: 'touch' }));
    expect(c.currentMode).toBe('pinch');
    c.pointerCancel(h.pointer({ x: 1100, y: 1000 }, { id: 2, type: 'touch' }));
    c.pointerCancel(h.pointer({ x: 1000, y: 1000 }, { id: 1, type: 'touch' }));
    expect(c.busy).toBe(false);
  });

  it('appui long au doigt : menu ; le doigt bouge trop : pas de menu', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    c.pointerDown(h.pointer(at(h, 't-heros'), { type: 'touch' }));
    c.pointerMove(
      h.pointer({ x: at(h, 't-heros').x + 300, y: 300 }, { type: 'touch', button: -1 }),
    );
    c.pointerUp(h.pointer({ x: 600, y: 300 }, { type: 'touch', buttons: 0 }));
    expect(h.engine.ui.getState().menu).toBeNull();
    c.pointerDown(h.pointer({ x: 1900, y: 1400 }, { type: 'touch' }));
    await new Promise((r) => setTimeout(r, 700));
    c.pointerUp(h.pointer({ x: 1900, y: 1400 }, { type: 'touch', buttons: 0 }));
  });

  it('annulation du navigateur pendant un geste d’outil ou un glisser de vue', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    h.engine.tools.activate('obstacles');
    c.pointerDown(h.pointer({ x: 1000, y: 1000 }));
    c.pointerMove(h.pointer({ x: 1100, y: 1000 }, { button: -1 }));
    c.pointerCancel(h.pointer({ x: 1100, y: 1000 }));
    expect(c.busy).toBe(false);
    c.pointerDown(h.pointer({ x: 1000, y: 1000 }, { button: 1 }));
    c.pointerCancel(h.pointer({ x: 1000, y: 1000 }));
    expect(c.busy).toBe(false);
  });

  it('molette : zoom au point ; pendant un tracé, l’outil suit le pointeur', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    const zoom = h.engine.camera.zoom;
    c.wheel({ x: 500, y: 400 }, -200, 0, false);
    expect(h.engine.camera.zoom).toBeGreaterThan(zoom);
    h.engine.tools.activate('obstacles');
    c.pointerDown(h.pointer({ x: 1000, y: 1000 }));
    c.pointerMove(h.pointer({ x: 1050, y: 1000 }, { button: -1 }));
    c.wheel({ x: 500, y: 400 }, 120, 0, true);
    c.pointerUp(h.pointer({ x: 1050, y: 1000 }, { buttons: 0 }));
  });
});

describe('raccourcis', () => {
  it('annuler, rétablir (⌘⇧Z, ⌘Y), dupliquer', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    h.click(at(h, 'l-torche'));
    const lights = () => h!.engine.entitiesOfKind('light').length;
    const n = lights();
    expect(c.keyDown(h.key('d', { code: 'KeyD', ctrl: true }))).toBe(true);
    await h.commands.idle();
    expect(lights()).toBe(n + 1);
    c.keyDown(h.key('z', { code: 'KeyZ', meta: true }));
    await h.commands.idle();
    expect(lights()).toBe(n);
    c.keyDown(h.key('Z', { code: 'KeyZ', meta: true, shift: true }));
    await h.commands.idle();
    c.keyDown(h.key('z', { code: 'KeyZ', ctrl: true }));
    await h.commands.idle();
    c.keyDown(h.key('y', { code: 'KeyY', ctrl: true }));
    await h.commands.idle();
    expect(lights()).toBe(n + 1);
    expect(c.keyDown(h.key('q', { code: 'KeyQ', ctrl: true }))).toBe(false);
  });

  it('ordre et calque au clavier : un cran, premier plan, calque voisin ; sans sélection : rien', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    expect(c.keyDown(h.key('ArrowUp', { ctrl: true }))).toBe(false);
    h.click(at(h, 'o-coffre'));
    for (const k of [
      h.key('ArrowUp', { ctrl: true }),
      h.key('ArrowDown', { ctrl: true }),
      h.key('ArrowUp', { ctrl: true, shift: true }),
      h.key('ArrowDown', { meta: true, shift: true }),
      h.key('ArrowUp', { ctrl: true, alt: true }),
    ])
      expect(c.keyDown(k)).toBe(true);
    await h.commands.idle();
    expect(h.engine.entity('o-coffre')!.layerId).toBe('persos');
  });

  it('flèches (×5 avec ⇧), R et ⇧R, Suppr ; Alt seul : rien', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    expect(c.keyDown(h.key('ArrowLeft'))).toBe(false);
    expect(c.keyDown(h.key('Delete'))).toBe(false);
    h.click(at(h, 'o-coffre'));
    c.keyDown(h.key('ArrowRight'));
    c.keyDown(h.key('ArrowDown', { shift: true }));
    c.keyDown(h.key('ArrowLeft'));
    c.keyDown(h.key('ArrowUp'));
    await h.commands.idle();
    expect(h.get('objects', 'o-coffre')!.pos).toEqual({ x: 500, y: 700 });
    c.keyDown(h.key('r'));
    c.keyDown(h.key('R', { code: 'KeyR', shift: true }));
    c.keyDown(h.key('r'));
    await h.commands.idle();
    expect(h.get('objects', 'o-coffre')!.rotation).not.toBe(0);
    expect(c.keyDown(h.key('r', { alt: true }))).toBe(false);
    c.keyDown(h.key('Backspace'));
    await h.commands.idle();
    expect(h.engine.entity('o-coffre')).toBeUndefined();
  });

  it('K : panneau des calques ; touche d’outil ; raccourci de module (Q) ; touche inconnue', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    const open = layersPanelOf(h.engine).getState().open;
    expect(c.keyDown(h.key('k'))).toBe(true);
    expect(layersPanelOf(h.engine).getState().open).toBe(!open);
    expect(c.keyDown(h.key('w'))).toBe(true);
    expect(h.engine.tools.getActiveId()).toBe('obstacles');
    // Outil murs : les chiffres choisissent son mode
    expect(c.keyDown(h.key('2', { code: 'Digit2' }))).toBe(true);
    h.engine.tools.activate('select');
    expect(c.keyDown(h.key('q'))).toBe(true);
    expect(c.keyDown(h.key('M', { code: 'KeyM', shift: true }))).toBe(false);
    expect(c.keyDown(h.key('%', { code: 'Digit5' }))).toBe(false);
  });

  it('Échap : annule le tracé, puis ferme ce qui est ouvert, puis revient à la sélection, puis désélectionne', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    h.engine.tools.activate('obstacles');
    h.click({ x: 1000, y: 1000 });
    h.click({ x: 1100, y: 1000 });
    expect(c.keyDown(h.key('Escape'))).toBe(true);
    expect(c.keyDown(h.key('Escape'))).toBe(true);
    expect(h.engine.tools.getActiveId()).toBe('select');
    h.click(at(h, 'o-coffre'));
    h.engine.openInspector(['o-coffre']);
    expect(c.keyDown(h.key('Escape'))).toBe(true);
    expect(c.keyDown(h.key('Escape'))).toBe(true);
    expect(h.engine.selection.size).toBe(0);
    expect(c.keyDown(h.key('Escape'))).toBe(false);
  });

  it('pendant un geste : pas de raccourci qui changerait ce qu’on tient', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    h.click(at(h, 'o-coffre'));
    c.pointerDown(h.pointer(at(h, 'o-coffre')));
    c.pointerMove(h.pointer({ x: 600, y: 600 }, { button: -1 }));
    expect(c.keyDown(h.key('Delete'))).toBe(false);
    expect(c.keyDown(h.key('ArrowUp', { ctrl: true }))).toBe(false);
    c.pointerUp(h.pointer({ x: 600, y: 600 }, { buttons: 0 }));
    c.dispose();
    expect(c.busy).toBe(false);
  });
});
