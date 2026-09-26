import { aleatoireImpose, type Generateur } from '@vtt/rules';
import { systeme } from '@vtt/systemes';
import { describe, expect, it } from 'vitest';
import { notationGenerator, poolGenerator, type PhysicalResult } from './physical.js';
import { flatResults, rollNotation, rollPool } from './roll.js';

/** Repli qui ne doit jamais servir : toutes les valeurs viennent du client. */
const never: Generateur = {
  entier: (max) => {
    throw new Error(`Tirage serveur inattendu (d${max})`);
  },
};

const d = (faces: number, value: number, tag?: string): PhysicalResult => ({
  type: `d${faces}`,
  value,
  ...(tag ? { tag } : {}),
});

const invalid = expect.objectContaining({ status: 400, code: 'invalid_physical_result' });

describe('notationGenerator (calculateFinalResult de l’ancienne app)', () => {
  it('une file par nombre de faces : l’ordre entre types de dés est libre', () => {
    const g = notationGenerator([d(20, 15), d(6, 2), d(6, 5)], never);
    const r = rollNotation('2d6+1d20+3', {}, g);
    g.finish();
    expect(r.total).toBe(25);
    expect(r.output).toBe('2d6+1d20+3 = [2, 5]+[15]+3 = 25');
    expect(flatResults(r.dice, null)).toEqual([2, 5, 15]);
    expect(g.completed).toBe(0);
  });

  it('ordre gardé dans une même file ; garder (kh) sur les valeurs fournies', () => {
    const g = notationGenerator([d(6, 2), d(6, 6), d(6, 3), d(6, 5)], never);
    const r = rollNotation('4d6kh3', {}, g);
    expect(r.output).toBe('4d6kh3 = [r2, 6, 3, 5] = 14');
    expect(g.completed).toBe(0);
  });

  it('valeurs manquantes (explosion, d100, dé non lancé) : complétées par le repli', () => {
    // 1d6! : le 6 fourni explose, la relance vient du serveur
    let g = notationGenerator([d(6, 6)], aleatoireImpose([3]));
    let r = rollNotation('1d6!', {}, g);
    expect(flatResults(r.dice, null)).toEqual([6, 3]);
    expect(r.total).toBe(9);
    expect(g.completed).toBe(1);

    // d100 jamais lancé en 3D, d20 fourni
    g = notationGenerator([d(20, 12)], aleatoireImpose([57]));
    r = rollNotation('1d20+1d100', {}, g);
    g.finish();
    expect(flatResults(r.dice, null)).toEqual([12, 57]);
    expect(g.completed).toBe(1);
  });

  it('tag ignoré pour une notation numérique ; D20 en majuscule accepté', () => {
    const g = notationGenerator([{ type: 'D20', value: 4, tag: 'peu-importe' }], never);
    expect(rollNotation('1d20', {}, g).total).toBe(4);
    g.finish();
  });

  it('hors bornes ou type inconnu : 400 invalid_physical_result, avant tout tirage', () => {
    for (const bad of [
      d(6, 7),
      d(6, 0),
      d(20, 2.5),
      d(6, -1),
      { type: 'aptitude', value: 1 },
      { type: 'd0', value: 1 },
      { type: 'dé', value: 1 },
    ]) {
      expect(() => notationGenerator([bad], never), JSON.stringify(bad)).toThrowError(invalid);
    }
  });

  it('valeurs en trop : 400 à la fin du jet', () => {
    let g = notationGenerator([d(6, 1), d(6, 2), d(6, 3)], never);
    rollNotation('2d6', {}, g);
    expect(() => g.finish()).toThrowError(invalid);
    // Dé absent de la notation
    g = notationGenerator([d(6, 1), d(8, 2)], never);
    rollNotation('1d6', {}, g);
    expect(() => g.finish()).toThrowError(
      expect.objectContaining({ detail: expect.stringContaining('d8 ×1') }),
    );
  });
});

describe('poolGenerator (rollSymbolDiceNotation de l’ancienne app)', () => {
  const sw = systeme('star-wars-eote');
  const pool = [
    { de: 'aptitude', nombre: 2 },
    { de: 'difficulte', nombre: 1 },
  ];

  it('une file par sorte (tag) : Aptitude et Difficulté, deux d8, ne se mélangent pas', () => {
    // Difficulté envoyée en premier : c'est le tag qui compte, pas l'ordre
    const g = poolGenerator(
      sw,
      pool,
      [d(8, 2, 'difficulte'), d(8, 4, 'aptitude'), d(8, 2, 'aptitude')],
      never,
    );
    const r = rollPool(sw, pool, g);
    g.finish();
    expect(r.output).toBe('Aptitude [4, 2], Difficulté [2] = 2 Succès');
    expect(flatResults([], r.symbols)).toEqual([4, 2, 2]);
    expect(r.symbols!.results.succesNets).toBe(2);
    expect(g.completed).toBe(0);
  });

  it('sorte en type, ou par son nom (accents, casse) ; forme d8 sans tag en repli', () => {
    const g = poolGenerator(
      sw,
      pool,
      [{ type: 'aptitude', value: 4 }, { type: 'd8', value: 2, tag: 'Difficulté' }, d(8, 2)],
      never,
    );
    const r = rollPool(sw, pool, g);
    g.finish();
    // Le d8 sans tag complète la deuxième Aptitude (file de la sorte vide)
    expect(flatResults([], r.symbols)).toEqual([4, 2, 2]);
  });

  it('dés manquants : complétés par le repli', () => {
    const g = poolGenerator(sw, pool, [d(8, 4, 'aptitude')], aleatoireImpose([2, 2]));
    const r = rollPool(sw, pool, g);
    g.finish();
    expect(flatResults([], r.symbols)).toEqual([4, 2, 2]);
    expect(g.completed).toBe(2);
  });

  it('hors bornes, forme incohérente, sorte inconnue : 400', () => {
    for (const bad of [
      d(8, 9, 'aptitude'),
      d(6, 4, 'aptitude'),
      d(8, 1, 'licorne'),
      { type: 'licorne', value: 1 },
      d(12, 13),
    ]) {
      expect(() => poolGenerator(sw, pool, [bad], never), JSON.stringify(bad)).toThrowError(
        invalid,
      );
    }
  });

  it('dé d’une sorte absente du pool : 400 à la fin du jet', () => {
    const g = poolGenerator(
      sw,
      pool,
      [d(8, 4, 'aptitude'), d(8, 2, 'aptitude'), d(8, 2, 'difficulte'), d(12, 1, 'maitrise')],
      never,
    );
    rollPool(sw, pool, g);
    expect(() => g.finish()).toThrowError(invalid);
  });
});
