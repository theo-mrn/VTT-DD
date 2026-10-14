import { describe, expect, it } from 'vitest';
import { DEFAULT_SKIN, FREE_SKINS, SKINS, skin } from './catalog.js';

describe('catalogue des skins', () => {
  it('reprend les skins de l’ancienne app (moins 3 retirés, + 16 résines à l’essai et l’acier du chevalier), gratuits : prix 0 et inventaire par défaut', () => {
    expect(SKINS).toHaveLength(85);
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(85);
    expect([...FREE_SKINS].sort()).toEqual([
      'acier_chevalier',
      'gold',
      'pierre_donjon',
      'resine_abysse',
      'resine_aurore',
      'resine_braise',
      'resine_cosmos',
      'resine_emeraude',
      'resine_fumee',
      'resine_glacier',
      'resine_jade',
      'resine_marbre',
      'resine_marbre_noir',
      'resine_miel',
      'resine_nuit',
      'resine_obsidienne',
      'resine_quartz_rose',
      'resine_sang_dragon',
      'resine_turquoise',
      'silver',
      'steampunk_copper',
    ]);
    expect(skin(DEFAULT_SKIN)?.free).toBe(true);
    expect(skin('kyber_or')).toEqual({ id: 'kyber_or', free: false });
    expect(skin('inconnu')).toBeUndefined();
  });
});
