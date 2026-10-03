import { describe, expect, it } from 'vitest';
import { slugImporte, slugsDebloques, titreDepuisFirestore } from './import.js';

describe('import des titres Firebase (transformation)', () => {
  it('convertit les anciennes clés : slug à « _ », libellé complet, alias retiré', () => {
    expect(slugImporte('rat_de_taverne')).toBe('rat-de-taverne');
    expect(slugImporte('Béni des Dieux')).toBe('beni-des-dieux');
    expect(slugImporte('beni-des-dieux')).toBe('beni-des-dieux');
    expect(slugImporte('maudit_par_les_des')).toBe('maudit-des-des');
  });

  it('ne garde que les titres « unlocked », sans doublon', () => {
    expect(
      slugsDebloques({
        titles: {
          vagabond: 'unlocked',
          Vagabond: 'unlocked',
          heros: 'locked',
          'Maudit des dés': 'unlocked',
          bizarre: true,
        },
      }),
    ).toEqual(['maudit-des-des', 'vagabond']);
    expect(slugsDebloques({})).toEqual([]);
    expect(slugsDebloques({ titles: ['vagabond'] })).toEqual([]);
  });

  it('lit un document du catalogue Firestore', () => {
    expect(
      titreDepuisFirestore({
        path: 'titles/lanceur_enthousiaste',
        id: 'lanceur_enthousiaste',
        data: {
          id: 'lanceur_enthousiaste',
          label: 'Lanceur Enthousiaste',
          order: 26,
          defaultUnlocked: false,
          condition: { type: 'event', description: 'Lancer 50 dés' },
        },
      }),
    ).toEqual({
      slug: 'lanceur-enthousiaste',
      label: 'Lanceur Enthousiaste',
      description: 'Lancer 50 dés',
      condition: { type: 'event', description: 'Lancer 50 dés' },
      defaultUnlocked: false,
      sortOrder: 26,
    });
  });

  it('écarte un titre sans libellé ou retiré, et ignore une condition inconnue', () => {
    expect(titreDepuisFirestore({ path: 'titles/x', id: 'x', data: {} })).toBeNull();
    expect(
      titreDepuisFirestore({
        path: 'titles/maudit_par_les_des',
        id: 'maudit_par_les_des',
        data: { label: 'Maudit par les dés' },
      }),
    ).toBeNull();
    expect(
      titreDepuisFirestore({
        path: 'titles/a',
        id: 'a',
        data: { label: 'A', condition: { type: 'magie' }, order: 'x' },
      }),
    ).toMatchObject({ condition: null, description: null, sortOrder: 0, defaultUnlocked: false });
  });
});
