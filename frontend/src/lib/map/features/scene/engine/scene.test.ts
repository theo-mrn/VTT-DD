/**
 * Point d'arrivée des joueurs : un élément comme les autres pour le MJ (glisser, Suppr, ⌘Z),
 * posé aussi par le menu du clic droit ; invisible pour les joueurs.
 */
import { describe, expect, it, vi } from 'vitest';
import type { MapViewer } from '@/lib/map/engine/entities/entity-kind';
import { setup } from '@/lib/map/engine/test-kit';
import { SPAWN_COLLECTION, sceneFeature } from '../index';

function bench(viewer?: MapViewer) {
  const t = setup(viewer ? { viewer } : {});
  let version = 1;
  t.backend.updateScene = vi.fn(async (patch: Record<string, unknown>) => {
    const scene = t.store.getState().scene!;
    version = Math.max(version, scene.version) + 1;
    return { ...scene, ...patch, version };
  });
  const scene = t.store.getState().scene!;
  t.store.getState().setScene({ ...scene, version: 1, spawn: { x: 500, y: 500 } }, { force: true });
  t.engine.use(sceneFeature);
  const spawn = () => t.store.getState().scene?.spawn as { x: number; y: number } | null;
  return { ...t, spawn };
}

describe('point d’arrivée des joueurs', () => {
  it('élément du MJ : le glisser le déplace, Suppr l’enlève, ⌘Z le remet', async () => {
    const t = bench();
    expect(t.engine.entity('spawn')).toBeDefined();
    // Le drapeau monte au-dessus du point : on le prend un peu plus haut
    t.drag({ x: 500, y: 495 }, { x: 612, y: 695 });
    await t.commands.idle();
    expect(t.spawn()).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    expect(t.spawn()!.x).not.toBe(500);
    t.engine.selection.replace(['spawn']);
    t.engine.controller.keyDown(t.key('Delete'));
    await t.commands.idle();
    expect(t.spawn()).toBeNull();
    expect(t.store.getState().collections[SPAWN_COLLECTION]?.has('spawn') ?? false).toBe(false);
    await t.commands.undo();
    await t.commands.idle();
    expect(t.spawn()).not.toBeNull();
    expect(t.engine.entity('spawn')).toBeDefined();
  });

  it('clic droit dans le vide : « Arrivée des joueurs ici »', async () => {
    const t = bench();
    const item = t.engine
      .menuItems([], { x: 120, y: 340 })
      .find((i) => i.id === 'scene:spawn-here');
    item!.run!();
    await t.commands.idle();
    expect(t.spawn()).toEqual({ x: 120, y: 340 });
  });

  it('les joueurs ne le voient pas', () => {
    const t = bench({ userId: 'alice', role: 'player', characterIds: [] });
    expect(t.engine.entity('spawn')).toBeUndefined();
    expect(t.engine.menuItems([], { x: 1, y: 1 }).some((i) => i.id === 'scene:spawn-here')).toBe(
      false,
    );
  });
});
