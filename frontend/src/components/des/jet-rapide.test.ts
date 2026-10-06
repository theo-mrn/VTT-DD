// @vitest-environment jsdom
/** Jet rapide : historique des formules (la dernière d'abord, sans doublon, 20 au plus). */
import { afterEach, describe, expect, it } from 'vitest';
import { lireHistorique, retenir } from './jet-rapide';

afterEach(() => localStorage.clear());

describe('historique du jet rapide', () => {
  it('la dernière d’abord, sans doublon', () => {
    retenir('1d20');
    retenir('2d6 + 3');
    retenir('1d20');
    expect(lireHistorique()).toEqual(['1d20', '2d6 + 3']);
  });

  it('20 au plus ; illisible : vide', () => {
    for (let i = 0; i < 25; i++) retenir(`1d${i + 2}`);
    expect(lireHistorique()).toHaveLength(20);
    expect(lireHistorique()[0]).toBe('1d26');
    localStorage.setItem('yner:ui:des:jets-rapides', 'pas du json');
    expect(lireHistorique()).toEqual([]);
  });
});
