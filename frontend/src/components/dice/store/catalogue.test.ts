import { describe, expect, it } from 'vitest';
import { DEFAULT_DICE_PREFERENCES } from '@/lib/dice-preferences';
import type { DiceSkin } from '../three/dice-definitions';
import { compter, filtrer, prix, type Filtres } from './catalogue';

const skin = (id: string, name: string, price: number, rarity: DiceSkin['rarity']) =>
  ({ id, name, price, rarity }) as DiceSkin;
const CAT = [
  skin('a', 'Singularité', 2500, 'legendary'),
  skin('b', 'Bismuth', 500, 'rare'),
  skin('c', 'Or', 0, 'common'),
  skin('d', 'Argent', 0, 'common'),
];
const prefs = { ...DEFAULT_DICE_PREFERENCES, inventory: ['c', 'd'] };
const base: Filtres = { recherche: '', possession: 'tous', rarete: null, tri: 'rarete' };
const ids = (l: DiceSkin[]) => l.map((s) => s.id);

describe('catalogue de la boutique', () => {
  it('trie par rareté puis par nom, par prix, par nom', () => {
    expect(ids(filtrer(CAT, prefs, base))).toEqual(['a', 'b', 'd', 'c']);
    expect(ids(filtrer(CAT, prefs, { ...base, tri: 'prix' }))).toEqual(['a', 'b', 'd', 'c']);
    expect(ids(filtrer(CAT, prefs, { ...base, tri: 'nom' }))).toEqual(['d', 'b', 'c', 'a']);
  });

  it('filtre par possession, rareté et recherche sans accents', () => {
    expect(ids(filtrer(CAT, prefs, { ...base, possession: 'possedes' }))).toEqual(['d', 'c']);
    expect(ids(filtrer(CAT, prefs, { ...base, possession: 'a-debloquer' }))).toEqual(['a', 'b']);
    expect(ids(filtrer(CAT, prefs, { ...base, rarete: 'rare' }))).toEqual(['b']);
    expect(ids(filtrer(CAT, prefs, { ...base, recherche: ' SINGULARITE ' }))).toEqual(['a']);
  });

  it('compte sur tout le catalogue ; allSkins : tout est possédé', () => {
    expect(compter(CAT, prefs)).toEqual({ tous: 4, possedes: 2, 'a-debloquer': 2 });
    expect(compter(CAT, { ...prefs, allSkins: true })).toEqual({
      tous: 4,
      possedes: 4,
      'a-debloquer': 0,
    });
  });

  it('prix en euros, gratuit à 0', () => {
    expect(prix(CAT[0]!)).toMatch(/^25,00\s€$/);
    expect(prix(CAT[2]!)).toBe('Gratuit');
  });
});
