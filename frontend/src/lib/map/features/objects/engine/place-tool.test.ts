import { Box } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import { SELECT_TOOL_ID } from '@/lib/map/engine/tools/tool-manager';
import { obj, setupObjects } from './objects-test-kit';
import { ObjectPlaceTool } from './place-tool';
import { defaultObjectSize, ZONE_SOURCE, type ObjectSource } from './placement';
import { OBJECTS_TOOL_ID, type ObjectData } from './types';

const CHEST: ObjectSource = {
  key: 'template:coffre',
  name: 'Coffre',
  imageUrl: '/coffre.png',
  kind: 'item',
  aspect: 2,
};

function setupTool(objects: ObjectData[] = [obj('table', 600, 600)]) {
  const t = setupObjects({ objects });
  t.engine.registerTool({
    id: OBJECTS_TOOL_ID,
    label: 'Objets',
    icon: Box,
    shortcut: { code: 'KeyI', label: 'I' },
    available: isGm,
    create: () => new ObjectPlaceTool(),
  });
  // I : l'outil « Objets »
  t.engine.controller.keyDown(t.key('i'));
  const tool = t.engine.tools.active as ObjectPlaceTool;
  const created = () =>
    [...(t.store.getState().collections.objects?.values() ?? [])].filter(
      (o) => o.id !== 'table',
    ) as ObjectData[];
  return { ...t, tool, created };
}

describe('outil « Objets » (I)', () => {
  it('taille par défaut : une case sur le petit côté, proportions de l’image bornées', () => {
    expect(defaultObjectSize(50)).toEqual({ width: 50, height: 50 });
    expect(defaultObjectSize(50, 2)).toEqual({ width: 100, height: 50 });
    expect(defaultObjectSize(50, 0.5)).toEqual({ width: 50, height: 100 });
    expect(defaultObjectSize(50, 40)).toEqual({ width: 300, height: 50 });
  });

  it('sans objet choisi, la carte garde les gestes de la sélection', async () => {
    const t = setupTool();
    expect(t.engine.tools.getActiveId()).toBe(OBJECTS_TOOL_ID);
    expect(t.tool.state).toBe('browsing');
    t.click({ x: 650, y: 625 });
    expect(t.engine.selection.ids).toEqual(['table']);
    t.drag({ x: 650, y: 625 }, { x: 700, y: 675 });
    await t.commands.idle();
    expect((t.object('table') as ObjectData).pos).toEqual({ x: 650, y: 650 });
  });

  it('clic puis clic : pose aimantée, en haut du calque des objets, puis sélectionnée', async () => {
    const t = setupTool();
    t.tool.arm(CHEST, t.engine);
    expect(t.tool.state).toBe('armed');
    expect(t.tool.cursor(t.engine)).toBe('crosshair');
    t.engine.controller.pointerDown(t.pointer({ x: 212, y: 170 }));
    expect(t.tool.state).toBe('placing');
    t.engine.controller.pointerUp(t.pointer({ x: 212, y: 170 }, { buttons: 0 }));
    const [placed] = t.created();
    // 100 × 50 : coin haut gauche aimanté sur la grille de 50
    expect(placed).toMatchObject({
      name: 'Coffre',
      imageUrl: '/coffre.png',
      kind: 'item',
      pos: { x: 150, y: 150 },
      width: 100,
      height: 50,
      rotation: 0,
      layerId: 'objets',
      z: 2,
      visibility: 'visible',
      searchable: false,
      searchRadius: 1.5,
      items: [],
    });
    expect(t.tool.state).toBe('browsing');
    expect(t.engine.selection.ids).toEqual([placed!.id]);
    await t.commands.idle();
    expect(t.objects.create).toHaveBeenCalledTimes(1);
    // L'identifiant du serveur remplace le provisoire, la sélection suit
    expect(t.engine.selection.ids[0]).toMatch(/^srv-tmp-/);
    // Annuler retire l'objet posé
    await t.commands.undo();
    expect(t.created()).toHaveLength(0);
  });

  it('Alt : sans la grille ; ⇧ : l’objet reste choisi pour en poser d’autres', () => {
    const t = setupTool();
    t.tool.arm(CHEST, t.engine);
    t.click({ x: 212, y: 170 }, { alt: true, shift: true });
    expect(t.tool.state).toBe('armed');
    t.click({ x: 400, y: 400 }, { alt: true });
    const placed = t.created();
    expect(placed.map((o) => o.pos)).toEqual([
      { x: 162, y: 145 },
      { x: 350, y: 375 },
    ]);
    expect(t.tool.state).toBe('browsing');
  });

  it('Échap : annule la pose en cours, puis le choix, puis quitte l’outil ; rien n’est écrit', () => {
    const t = setupTool();
    t.tool.arm(CHEST, t.engine);
    t.engine.controller.pointerDown(t.pointer({ x: 212, y: 170 }));
    t.engine.controller.keyDown(t.key('Escape'));
    expect(t.tool.state).toBe('armed');
    t.engine.controller.pointerUp(t.pointer({ x: 212, y: 170 }, { buttons: 0 }));
    t.engine.controller.keyDown(t.key('Escape'));
    expect(t.tool.state).toBe('browsing');
    t.engine.controller.keyDown(t.key('Escape'));
    expect(t.engine.tools.getActiveId()).toBe(SELECT_TOOL_ID);
    expect(t.created()).toHaveLength(0);
    expect(t.objects.create).not.toHaveBeenCalled();
  });

  it('glisser depuis la bibliothèque : aperçu au survol, pose au lâcher ; zone à fouiller', () => {
    const t = setupTool();
    t.tool.arm(ZONE_SOURCE, t.engine);
    t.tool.hoverAt({ x: 320, y: 330 }, t.engine);
    const id = t.tool.place({ x: 320, y: 330 }, t.engine, { snap: true });
    const placed = t.object(id!)!;
    // Une case de 50 : centrée dans sa case
    expect(placed).toMatchObject({
      name: 'Zone à fouiller',
      imageUrl: '',
      searchable: true,
      pos: { x: 300, y: 300 },
      width: 50,
      height: 50,
    });
    expect(t.tool.state).toBe('browsing');
  });

  it('proportions apprises au chargement de l’image, pour la source choisie seulement', () => {
    const t = setupTool();
    const source = { ...CHEST, aspect: null };
    t.tool.arm(source, t.engine);
    t.tool.learnAspect('template:autre', 3);
    expect(t.tool.source?.aspect).toBeNull();
    t.tool.learnAspect(source.key, 0.5);
    expect(t.tool.source?.aspect).toBe(0.5);
    t.click({ x: 225, y: 250 });
    expect(t.created()[0]).toMatchObject({ width: 50, height: 100 });
  });

  it('quitter l’outil oublie l’objet choisi', () => {
    const t = setupTool();
    t.tool.arm(CHEST, t.engine);
    t.engine.tools.activate(SELECT_TOOL_ID);
    expect(t.tool.source).toBeNull();
  });
});
