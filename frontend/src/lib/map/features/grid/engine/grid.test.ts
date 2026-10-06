/**
 * Quadrillages : lignes dans la vue, calibrage sur l'image, une seule grille de jeu, et la case
 * de la scène qui vient de la grille de jeu (tokens, aimantation sur ses lignes).
 */
import type { MapGrid } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { box, setup } from '@/lib/map/engine/test-kit';
import { SELECT_TOOL_ID } from '@/lib/map/engine/tools/tool-manager';
import { CalibrateTool, gridModule } from '../index';
import {
  calibrate,
  densityFade,
  GRID_CALIBRATE_TOOL_ID,
  linePositions,
  newGrid,
  visibleGrids,
  withGrid,
} from './model';
import { calibrateSettings, gridDisplay, setGridShown } from './state';

const grid = (id: string, extra: Partial<MapGrid> = {}): MapGrid => ({
  id,
  name: id,
  size: 100,
  offsetX: 10,
  offsetY: 20,
  color: '#000000',
  opacity: 0.4,
  thickness: 1,
  visibleToPlayers: true,
  primary: false,
  ...extra,
});

describe('quadrillage : calculs', () => {
  it('lignes dans un intervalle, depuis l’origine, et rien quand elles sont trop nombreuses', () => {
    expect(linePositions(10, 100, 0, 350)).toEqual([10, 110, 210, 310]);
    expect(linePositions(10, 100, 110, 110)).toEqual([110]);
    expect(linePositions(0, 1, 0, 5000)).toBeNull();
  });

  it('calibrage : la case est la moyenne des côtés sur le nombre de cases, l’origine le coin', () => {
    expect(calibrate({ x: 310, y: 420 }, { x: 110, y: 220 }, 2)).toEqual({
      size: 100,
      offsetX: 10,
      offsetY: 20,
    });
    expect(calibrate({ x: 0, y: 0 }, { x: 2, y: 2 }, 1)).toBeNull();
  });

  it('une seule grille de jeu, origine ramenée dans la case', () => {
    const grids = [grid('a', { primary: true }), grid('b')];
    const next = withGrid(grids, 'b', { primary: true, offsetX: 250 });
    expect(next.map((g) => g.primary)).toEqual([false, true]);
    expect(next[1]!.offsetX).toBe(50);
    // Premier quadrillage : la grille de jeu, à la case de la scène
    expect(newGrid([], 88)).toMatchObject({ primary: true, size: 88 });
    expect(newGrid([grid('a', { primary: true })], 88)).toMatchObject({ primary: false });
  });

  it('densité : trop fin à l’écran, il s’efface ; les joueurs ne voient que les leurs', () => {
    expect(densityFade(4)).toBe(0);
    expect(densityFade(10)).toBeCloseTo(0.5);
    expect(densityFade(40)).toBe(1);
    const grids = [grid('a'), grid('b', { visibleToPlayers: false })];
    expect(visibleGrids(grids, false).map((g) => g.id)).toEqual(['a']);
    expect(visibleGrids(grids, true)).toHaveLength(2);
  });
});

describe('quadrillage dans le moteur', () => {
  it('la grille de jeu donne la case de la scène et l’origine de l’aimantation', () => {
    const t = setup({ boxes: [box('a', 20, 20)] });
    const scene = t.store.getState().scene!;
    t.store.getState().setScene({
      ...scene,
      version: 2,
      grids: [grid('jeu', { primary: true, size: 80 })],
    });
    expect(t.engine.kindContext().pixelsPerUnit).toBe(80);
    expect(t.engine.grid()).toEqual({ size: 80, offsetX: 10, offsetY: 20 });
    // Sans grille de jeu : la case de la campagne
    t.store.getState().setScene({ ...scene, version: 3, grids: [grid('deco')] });
    expect(t.engine.kindContext().pixelsPerUnit).toBe(50);
  });

  it('ajuster sur l’image : un glisser sur 2 × 2 cases aligne le quadrillage visé', async () => {
    const t = setup();
    const scene = t.store.getState().scene!;
    t.store.getState().setScene({
      ...scene,
      version: 2,
      grids: [grid('jeu', { primary: true, size: 50 })],
    });
    const settings = calibrateSettings(t.engine);
    settings.setState({ gridId: 'jeu', cells: 2 });
    t.engine.registerTool({
      id: GRID_CALIBRATE_TOOL_ID,
      label: 'Ajuster',
      icon: () => null,
      hidden: true,
      create: () => new CalibrateTool(settings),
    });
    t.engine.tools.activate(GRID_CALIBRATE_TOOL_ID);
    t.drag({ x: 130, y: 145 }, { x: 330, y: 345 });
    await t.commands.idle();
    const saved = (t.store.getState().scene?.grids as MapGrid[])[0]!;
    expect(saved).toMatchObject({ size: 100, offsetX: 30, offsetY: 45, primary: true });
    expect(t.engine.tools.getActiveId()).toBe(SELECT_TOOL_ID);
  });

  it('Q affiche ou masque le quadrillage sur mon écran, pour tous les rôles', () => {
    const t = setup({ viewer: { userId: 'joueur', role: 'player', characterIds: [] } });
    t.engine.use(gridModule);
    setGridShown(true);
    expect(t.engine.controller.keyDown(t.key('q', { code: 'KeyQ' }))).toBe(true);
    expect(gridDisplay.getState().shown).toBe(false);
    t.engine.controller.keyDown(t.key('q', { code: 'KeyQ' }));
    expect(gridDisplay.getState().shown).toBe(true);
    t.engine.destroy();
  });
});
