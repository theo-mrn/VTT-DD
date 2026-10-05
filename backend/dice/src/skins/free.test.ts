import { describe, expect, it, vi } from 'vitest';

describe('skins sans vente', () => {
  it('sans SKINS_FOR_SALE, tous les skins sont gratuits', async () => {
    vi.stubEnv('SKINS_FOR_SALE', '');
    vi.resetModules();
    const { SKINS, FREE_SKINS } = await import('./catalog.js');
    expect(SKINS.every((s) => s.free)).toBe(true);
    expect(FREE_SKINS).toHaveLength(SKINS.length);
    vi.unstubAllEnvs();
  });

  it('avec SKINS_FOR_SALE=on, seuls les gratuits de l’ancienne app le sont', async () => {
    vi.resetModules();
    const { skin } = await import('./catalog.js');
    expect(skin('gold')?.free).toBe(true);
    expect(skin('bismuth')?.free).toBe(false);
  });
});
