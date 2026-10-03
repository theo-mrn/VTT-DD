/**
 * Aimantation des gestes : libre par défaut, grille d'une case, d'une demi-case ou d'un quart
 * de case au choix, Alt qui inverse le réglage le temps du geste.
 */
import { describe, expect, it } from 'vitest';
import { box, setup } from '../test-kit';

describe('aimantation', () => {
  it('grille selon le réglage, Alt l’inverse', () => {
    const t = setup();
    t.engine.setSnap('off');
    expect(t.engine.snapGrid()).toBeNull();
    expect(t.engine.snapGrid(true)).toEqual({ size: 50 });
    t.engine.setSnap(0.5);
    expect(t.engine.snapGrid()).toEqual({ size: 25 });
    expect(t.engine.snapGrid(true)).toBeNull();
    t.engine.setSnap(0.25);
    expect(t.engine.snapGrid()).toEqual({ size: 12.5 });
    // La grille de la carte (pas des flèches) ne change pas
    expect(t.engine.grid()).toEqual({ size: 50 });
  });

  it('libre : l’entité se pose exactement là où on la lâche', async () => {
    const t = setup({ boxes: [box('a', 20, 20)] });
    t.engine.setSnap('off');
    t.drag({ x: 20, y: 20 }, { x: 97, y: 81 });
    await t.commands.idle();
    expect(t.data('a')).toMatchObject({ x: 97, y: 81 });
  });

  it('quart de case : un cran fin (12,5 px pour une case de 50)', async () => {
    const t = setup({ boxes: [box('a', 20, 20)] });
    t.engine.setSnap(0.25);
    t.drag({ x: 20, y: 20 }, { x: 97, y: 81 });
    await t.commands.idle();
    const { x, y } = t.data('a') as { x: number; y: number };
    expect(Math.abs(x - 97)).toBeLessThanOrEqual(12.5);
    expect(Math.abs(y - 81)).toBeLessThanOrEqual(12.5);
    expect(x).not.toBe(97);
  });
});
