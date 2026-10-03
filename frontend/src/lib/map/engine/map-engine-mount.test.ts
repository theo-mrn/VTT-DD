// @vitest-environment jsdom
/**
 * Montage du rendu : React (mode strict, en développement) appelle l'effet de montage deux fois
 * de suite. Un seul rendu Pixi doit être créé (pas de second canvas ni de second contexte WebGL).
 */
import { describe, expect, it, vi } from 'vitest';
import { setup } from './test-kit';

const created = vi.hoisted(() => ({ count: 0 }));

vi.mock('./pixi-view', () => ({
  createPixiView: async () => {
    created.count += 1;
    await new Promise((r) => setTimeout(r, 5));
    // Rendu factice : toute méthode appelée ne fait rien
    return new Proxy({}, { get: (_t, key) => (key === 'then' ? undefined : () => undefined) });
  },
}));

describe('MapEngine.mount', () => {
  it('deux montages concurrents ne créent qu’un rendu', async () => {
    const t = setup();
    const host = document.createElement('div');
    await Promise.all([t.engine.mount(host), t.engine.mount(host)]);
    expect(created.count).toBe(1);
    expect(t.engine.mounted).toBe(true);
    expect(t.engine.ui.getState().mounted).toBe(true);
    // Déjà monté : rien de plus
    await t.engine.mount(host);
    expect(created.count).toBe(1);
    t.engine.destroy();
  });
});
