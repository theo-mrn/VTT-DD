import { describe, expect, it } from 'vitest';
import { localeOfCountry, matchAcceptLanguage, resolveLocale } from './resolve';

describe('matchAcceptLanguage', () => {
  it('prend la première langue connue, variantes régionales comprises', () => {
    expect(matchAcceptLanguage('en-GB,en;q=0.9')).toBe('en');
    expect(matchAcceptLanguage('fr-CA')).toBe('fr');
    expect(matchAcceptLanguage('de-DE,de;q=0.9,en;q=0.8,fr;q=0.7')).toBe('en');
  });

  it('respecte les poids, puis l’ordre de l’en-tête', () => {
    expect(matchAcceptLanguage('fr;q=0.5,en;q=0.8')).toBe('en');
    expect(matchAcceptLanguage('en;q=0.8,fr;q=0.8')).toBe('en');
    expect(matchAcceptLanguage('fr;q=0,en;q=0.1')).toBe('en');
  });

  it('ignore les jokers, les langues inconnues et les en-têtes vides', () => {
    expect(matchAcceptLanguage('*')).toBeNull();
    expect(matchAcceptLanguage('de, ja;q=0.5')).toBeNull();
    expect(matchAcceptLanguage('')).toBeNull();
    expect(matchAcceptLanguage(null)).toBeNull();
    expect(matchAcceptLanguage('en;q=abc')).toBeNull();
  });
});

describe('resolveLocale', () => {
  it('le cookie passe avant le navigateur', () => {
    expect(resolveLocale({ cookie: 'fr', acceptLanguage: 'en-US' })).toBe('fr');
    expect(resolveLocale({ cookie: 'en', acceptLanguage: 'fr-FR' })).toBe('en');
  });

  it('un cookie inconnu est ignoré', () => {
    expect(resolveLocale({ cookie: 'xx', acceptLanguage: 'en-US' })).toBe('en');
  });

  it('sans rien de connu : le français', () => {
    expect(resolveLocale({})).toBe('fr');
    expect(resolveLocale({ acceptLanguage: 'ja-JP' })).toBe('fr');
  });
});

describe('localeOfCountry', () => {
  it('français dans un pays francophone, outre-mer compris ; anglais ailleurs', () => {
    expect(localeOfCountry('FR')).toBe('fr');
    expect(localeOfCountry('be')).toBe('fr');
    expect(localeOfCountry('RE')).toBe('fr');
    expect(localeOfCountry('SN')).toBe('fr');
    expect(localeOfCountry('GB')).toBe('en');
    expect(localeOfCountry('US')).toBe('en');
    expect(localeOfCountry('DE')).toBe('en');
  });

  it('pays partagé, inconnu, Tor ou mal formé : pas de choix', () => {
    expect(localeOfCountry('CA')).toBeNull();
    expect(localeOfCountry('MA')).toBeNull();
    expect(localeOfCountry('XX')).toBeNull();
    expect(localeOfCountry('T1')).toBeNull();
    expect(localeOfCountry('FRA')).toBeNull();
    expect(localeOfCountry('')).toBeNull();
    expect(localeOfCountry(null)).toBeNull();
  });
});

describe('resolveLocale avec le pays', () => {
  it('le pays passe avant le navigateur', () => {
    expect(resolveLocale({ country: 'GB', acceptLanguage: 'fr-FR' })).toBe('en');
    expect(resolveLocale({ country: 'FR', acceptLanguage: 'en-US' })).toBe('fr');
  });

  it('le cookie passe avant le pays', () => {
    expect(resolveLocale({ cookie: 'fr', country: 'GB', acceptLanguage: 'en-GB' })).toBe('fr');
  });

  it('pays partagé ou inconnu : le navigateur décide', () => {
    expect(resolveLocale({ country: 'CA', acceptLanguage: 'fr-CA' })).toBe('fr');
    expect(resolveLocale({ country: 'CA', acceptLanguage: 'en-CA' })).toBe('en');
    expect(resolveLocale({ country: 'XX', acceptLanguage: 'en-US' })).toBe('en');
    expect(resolveLocale({ country: null, acceptLanguage: null })).toBe('fr');
  });
});
