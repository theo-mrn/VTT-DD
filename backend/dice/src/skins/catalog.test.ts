import { describe, expect, it } from 'vitest';
import { DEFAULT_SKIN, FREE_SKINS, SKINS, skin } from './catalog.js';

describe('catalogue des skins', () => {
  it('reprend les 71 skins de l’ancienne app, gratuits : prix 0 et inventaire par défaut', () => {
    expect(SKINS).toHaveLength(71);
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(71);
    expect([...FREE_SKINS].sort()).toEqual(['gold', 'pierre_donjon', 'silver', 'steampunk_copper']);
    expect(skin(DEFAULT_SKIN)?.free).toBe(true);
    expect(skin('kyber_or')).toEqual({ id: 'kyber_or', free: false });
    expect(skin('inconnu')).toBeUndefined();
  });
});
