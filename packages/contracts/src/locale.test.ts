import { describe, expect, it } from 'vitest';
import { AccountLocale, DEFAULT_LOCALE, isLocale, LOCALES } from './locale.js';

describe('langues', () => {
  it('le français est la langue par défaut et fait partie de la liste', () => {
    expect(DEFAULT_LOCALE).toBe('fr');
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });

  it('reconnaît seulement les codes de la liste', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('en-GB')).toBe(false);
    expect(isLocale('EN')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it('la préférence du compte accepte une langue connue ou null', () => {
    expect(AccountLocale.parse('en')).toBe('en');
    expect(AccountLocale.parse(null)).toBeNull();
    expect(AccountLocale.safeParse('de').success).toBe(false);
  });
});
