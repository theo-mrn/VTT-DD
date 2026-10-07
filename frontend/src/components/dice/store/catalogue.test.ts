import { describe, expect, it } from 'vitest';
import { DEFAULT_DICE_PREFERENCES } from '@/lib/dice-preferences';
import type { DiceSkin } from '../three/dice-definitions';
import { compter, filtrer, prix, type Filtres } from './catalogue';

const NOMS: Record<string, string> = { a: 'Singularité', b: 'Bismuth', c: 'Or', d: 'Argent' };
const nom = (s: DiceSkin) => NOMS[s.id] ?? s.id;
const skin = (id: string, price: number, rarity: DiceSkin['rarity']) =>
  ({ id, price, rarity }) as DiceSkin;
const CAT = [
  skin('a', 2500, 'legendary'),
  skin('b', 500, 'rare'),
  skin('c', 0, 'common'),
  skin('d', 0, 'common'),
];
const prefs = { ...DEFAULT_DICE_PREFERENCES, inventory: ['c', 'd'] };
const base: Filtres = { recherche: '', possession: 'tous', rarete: null, tri: 'rarete' };
const ids = (l: DiceSkin[]) => l.map((s) => s.id);

describe('catalogue de la boutique', () => {
  it('trie par rareté puis par nom, par prix, par nom', () => {
    expect(ids(filtrer(CAT, prefs, base, nom))).toEqual(['a', 'b', 'd', 'c']);
    expect(ids(filtrer(CAT, prefs, { ...base, tri: 'prix' }, nom))).toEqual(['a', 'b', 'd', 'c']);
    expect(ids(filtrer(CAT, prefs, { ...base, tri: 'nom' }, nom))).toEqual(['d', 'b', 'c', 'a']);
  });

  it('filtre par possession, rareté et recherche sans accents', () => {
    expect(ids(filtrer(CAT, prefs, { ...base, possession: 'collection' }, nom))).toEqual([
      'd',
      'c',
    ]);
    expect(ids(filtrer(CAT, prefs, { ...base, possession: 'a-debloquer' }, nom))).toEqual([
      'a',
      'b',
    ]);
    expect(ids(filtrer(CAT, prefs, { ...base, rarete: 'rare' }, nom))).toEqual(['b']);
    expect(ids(filtrer(CAT, prefs, { ...base, recherche: ' SINGULARITE ' }, nom))).toEqual(['a']);
  });

  it('premium : la collection reste celle des dés à soi, rien à débloquer', () => {
    const premium = { ...prefs, allSkins: true };
    expect(compter(CAT, prefs)).toEqual({ tous: 4, collection: 2, 'a-debloquer': 2 });
    expect(compter(CAT, premium)).toEqual({ tous: 4, collection: 2, 'a-debloquer': 0 });
    expect(ids(filtrer(CAT, premium, { ...base, possession: 'collection' }, nom))).toEqual([
      'd',
      'c',
    ]);
    expect(filtrer(CAT, premium, { ...base, possession: 'a-debloquer' }, nom)).toEqual([]);
  });

  it('prix en euros, gratuit à 0', () => {
    expect(prix(CAT[0]!)).toMatch(/^25,00\s€$/);
    expect(prix(CAT[2]!)).toBe('Gratuit');
  });
});
