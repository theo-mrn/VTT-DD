/**
 * Murs avec l'outil sélection (V) : un clic sur un mur, quand rien d'autre n'est dessous, le
 * sélectionne (menu, inspecteur, Suppr) ; un token posé contre lui reste prioritaire ; un mur
 * ne se glisse pas hors de l'outil murs (soudures) et le lasso ne le prend pas.
 */
import { describe, expect, it, vi } from 'vitest';
import { SELECT_TOOL_ID } from '@/lib/map/engine/tools/tool-manager';
import { box, setup, spyPersistence } from '@/lib/map/engine/test-kit';
import type { BatchWrite } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';
import { defaultProps, OBSTACLES, type ObstacleData } from './model';
import { registerObstacles } from './register';

const P = (x: number, y: number) => ({ x, y });

function wall(id: string, points: { x: number; y: number }[]): ObstacleData {
  return {
    id,
    mapId: 'carte',
    version: 1,
    updatedAt: '',
    ...defaultProps('wall'),
    points,
  } as ObstacleData;
}

function bench(boxes: ReturnType<typeof box>[] = []) {
  const kit = setup({ boxes });
  const obstacles = Object.assign(spyPersistence(), {
    batch: vi.fn(async (w: BatchWrite<MapDto>) => ({
      created: w.create.map((d) => ({ ...d, version: 1 })),
      updated: w.update.map((u) => ({ ...u.after, version: u.version + 1 })),
    })),
  });
  kit.backend.collection = (key: string) =>
    (key === OBSTACLES ? obstacles : spyPersistence()) as never;
  kit.store.getState().replaceCollection(OBSTACLES, [wall('mur', [P(100, 300), P(500, 300)])]);
  registerObstacles(kit.engine);
  kit.engine.tools.activate(SELECT_TOOL_ID);
  const points = () =>
    (kit.store.getState().collections[OBSTACLES]?.get('mur') as ObstacleData | undefined)?.points;
  return { ...kit, obstacles, points };
}

describe('murs avec l’outil sélection', () => {
  it('un clic sur le mur le sélectionne, Suppr l’efface', async () => {
    const b = bench();
    b.click(P(300, 301));
    expect(b.engine.selection.ids).toEqual(['mur']);
    expect(b.engine.controller.keyDown(b.key('Delete'))).toBe(true);
    await b.commands.idle();
    expect(b.store.getState().collections[OBSTACLES]?.has('mur')).toBe(false);
  });

  it('un token posé sur le mur passe avant lui', () => {
    const b = bench([box('t', 300, 300)]);
    b.click(P(300, 300));
    expect(b.engine.selection.ids).toEqual(['t']);
    // À côté du token, le mur se prend
    b.click(P(450, 300));
    expect(b.engine.selection.ids).toEqual(['mur']);
  });

  it('le mur ne se glisse pas hors de l’outil murs (la carte bouge), le lasso ne le prend pas', async () => {
    const b = bench([box('t', 300, 250)]);
    b.drag(P(450, 300), P(450, 450));
    await b.commands.idle();
    expect(b.points()).toEqual([P(100, 300), P(500, 300)]);
    b.engine.selection.replace([]);
    b.drag(P(50, 200), P(600, 400), { shift: true });
    expect(b.engine.selection.ids).toEqual(['t']);
  });
});
