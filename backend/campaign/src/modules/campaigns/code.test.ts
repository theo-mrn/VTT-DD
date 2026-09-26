import { describe, expect, it } from 'vitest';
import { CAMPAIGN_CODE_FORMAT, newCampaignCode, normalizeCampaignCode } from './code.js';

describe('code de campagne', () => {
  it('6 caractères base32 sans 0, O, 1 ni I', () => {
    const codes = new Set(Array.from({ length: 2000 }, newCampaignCode));
    for (const code of codes) {
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
      expect(code).toMatch(CAMPAIGN_CODE_FORMAT);
    }
    // Tous les symboles finissent par sortir, sans collision sur un petit tirage
    expect(new Set([...codes].join(''))).toHaveProperty('size', 32);
    expect(codes.size).toBe(2000);
  });

  it('saisie tolérante ; les codes numériques importés restent valides', () => {
    expect(normalizeCampaignCode(' abc-d ef ')).toBe('ABCDEF');
    expect(CAMPAIGN_CODE_FORMAT.test('123456')).toBe(true);
    for (const wrong of ['ABCDE', 'ABCDEFG', 'ABC_EF', 'inv_x']) {
      expect(CAMPAIGN_CODE_FORMAT.test(normalizeCampaignCode(wrong)), wrong).toBe(false);
    }
  });
});
