import { describe, expect, it } from 'vitest';
import { FORME_CODE_SALLE, normaliserCodeSalle, nouveauCodeSalle } from './code.js';

describe('code de salle', () => {
  it('6 caractères base32 sans 0, O, 1 ni I', () => {
    const codes = new Set(Array.from({ length: 2000 }, nouveauCodeSalle));
    for (const code of codes) {
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
      expect(code).toMatch(FORME_CODE_SALLE);
    }
    // Tous les symboles finissent par sortir, sans collision sur un petit tirage
    expect(new Set([...codes].join(''))).toHaveProperty('size', 32);
    expect(codes.size).toBe(2000);
  });

  it('saisie tolérante ; les codes numériques importés restent valides', () => {
    expect(normaliserCodeSalle(' abc-d ef ')).toBe('ABCDEF');
    expect(FORME_CODE_SALLE.test('123456')).toBe(true);
    for (const faux of ['ABCDE', 'ABCDEFG', 'ABC_EF', 'inv_x']) {
      expect(FORME_CODE_SALLE.test(normaliserCodeSalle(faux)), faux).toBe(false);
    }
  });
});
