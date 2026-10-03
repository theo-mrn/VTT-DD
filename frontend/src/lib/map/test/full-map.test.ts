// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { GM, mountMap, type MapHarness } from './map-harness';

let h: MapHarness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

describe('carte complète montée', () => {
  it('monte le rendu, dessine chaque sorte et rend une image', async () => {
    h = await mountMap({ viewer: GM });
    expect(h.engine.mounted).toBe(true);
    h.frames(3);
    expect(h.renderer().renders).toBeGreaterThan(0);
  });
});
