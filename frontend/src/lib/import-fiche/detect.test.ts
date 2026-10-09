/**
 * Détection d'une fiche importée : la fiche Noobliés de référence (lecture brute produite par
 * l'adaptateur du service character) rapprochée de D&D classique et de Nooblies.
 */
import { SheetReading } from '@vtt/contracts';
import { systeme as systemeDe } from '@vtt/systemes';
import { describe, expect, it } from 'vitest';
import reading from './fixtures/nooblies-reading.json';
import { detectSheet, plain, similarity } from './detect';

const lecture = SheetReading.parse(reading);

describe.each(['dnd-classic', 'nooblies'])('fiche Noobliés sur %s', (id) => {
  const systeme = systemeDe(id);
  const d = detectSheet(systeme, 'personnage', lecture);
  const value = (k: string) => d.values.find((v) => v.key === k)?.value;
  const rank = (e: string) => d.entries.find((x) => x.entry === e)?.rank;

  it('nom et caractéristiques', () => {
    expect(d.name).toBe('Askel Hendriksen');
    expect(['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map(value)).toEqual([16, 10, 15, 10, 13, 11]);
    expect(value('niveau')).toBe(1);
    expect(value('PV')).toBe(14);
  });

  it('valeurs calculées lues, pour les écarts', () => {
    expect(d.read).toMatchObject({ PV_Max: 14, Defense: 10, Contact: 4 });
  });

  it('race, profil et les six voies, dont la voie raciale', () => {
    expect(d.entries.filter((e) => e.sorte === 'race').map((e) => e.entry)).toEqual(['humain']);
    expect(d.entries.filter((e) => e.sorte === 'profil').map((e) => e.entry)).toEqual(['barbare']);
    expect(d.entries.filter((e) => e.sorte === 'voie').map((e) => e.entry)).toEqual([
      'barbare-brute',
      'barbare-rage',
      'barbare-pagne',
      'barbare-pourfendeur',
      'race-humain',
      expect.any(String),
    ]);
    expect(rank('barbare-brute')).toBe(2);
    expect(rank('race-humain')).toBe(1);
    expect(d.free).toEqual([]);
  });

  it('équipement absent du catalogue : objet à son nom', () => {
    const masse = d.entries.find((e) => e.fields && Object.values(e.fields).includes('Masse'));
    expect(masse).toBeDefined();
    expect(Object.values(masse!.fields!)).toContain('DM 1d6');
  });

  it('le reste en apparence et en histoire, rien de perdu', () => {
    expect(d.appearance).toContain('Taille : 1,92 m');
    expect(d.backstory).toContain('Né dans les montagnes du nord.');
    expect(d.portraitUrl).toBe('https://nooblieeschroniques.fr/illu/barbare.png');
  });
});

describe('comparaison des noms', () => {
  it('sans accents, apostrophes ni marques de fiche', () => {
    expect(plain('Voie de l’humain')).toBe(plain("Voie de l'humain"));
    expect(plain('Attaque brutale (L)')).toBe('attaque brutale');
    expect(similarity('voie du heros', 'voie du hero')).toBeGreaterThan(0.85);
    expect(similarity('voie du roc', 'voie de la rage')).toBeLessThan(0.85);
  });
});

describe('voie inconnue du catalogue', () => {
  it('devient une entrée libre de la sorte personnalisable', () => {
    const d = detectSheet(systemeDe('dnd-classic'), 'personnage', {
      ...lecture,
      entries: [
        { name: 'Voie du roc', kind: 'voie', rank: 1, ranks: ['Peau de granit', 'Écrasement'] },
      ],
    });
    expect(d.free.map((f) => [f.item.name, f.sorte])).toEqual([['Voie du roc', 'voie']]);
  });
});
