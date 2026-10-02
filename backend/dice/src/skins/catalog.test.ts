import { describe, expect, it } from 'vitest';
import { DEFAULT_SKIN, FREE_SKINS, SKINS, skin } from './catalog.js';

describe('catalogue des skins', () => {
  it('reprend les 71 skins de l’ancienne app (+ 4 résines à l’essai), gratuits : prix 0 et inventaire par défaut', () => {
    expect(SKINS).toHaveLength(75);
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(75);
    expect([...FREE_SKINS].sort()).toEqual([
      'gold',
      'pierre_donjon',
      'resine_fumee',
      'resine_jade',
      'resine_marbre',
      'resine_nuit',
      'silver',
      'steampunk_copper',
    ]);
    expect(skin(DEFAULT_SKIN)?.free).toBe(true);
    expect(skin('kyber_or')).toEqual({ id: 'kyber_or', free: false });
    expect(skin('inconnu')).toBeUndefined();
  });
});
