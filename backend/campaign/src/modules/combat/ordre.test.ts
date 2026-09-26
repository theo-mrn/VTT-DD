/**
 * Règles de tour sans base : tri d'initiative, individuel, créneaux, retrait.
 */
import { describe, expect, it } from 'vitest';
import type { Camp } from '../../db/schema.js';
import { depart, peuventAgir, retirer, suivant, trier, type Participant } from './ordre.js';

const p = (characterId: string, camp: Camp, cles: number[] = []): Participant => ({
  characterId,
  camp,
  cles,
  aAgi: false,
});

describe('trier', () => {
  it('clé par clé, la plus haute d’abord', () => {
    const ordre = trier([
      p('a', 'adversaires', [2, 5]),
      p('b', 'joueurs', [3, 0]),
      p('c', 'allies', [2, 7]),
    ]);
    expect(ordre.map((x) => x.characterId)).toEqual(['b', 'c', 'a']);
  });

  it('égalité parfaite : camp joueurs d’abord, puis ordre reçu', () => {
    const ordre = trier([
      p('adv1', 'adversaires', [10]),
      p('j1', 'joueurs', [10]),
      p('all', 'allies', [10]),
      p('j2', 'joueurs', [10]),
      p('adv2', 'adversaires', [10]),
    ]);
    expect(ordre.map((x) => x.characterId)).toEqual(['j1', 'j2', 'adv1', 'all', 'adv2']);
  });

  it('une clé absente compte comme la plus basse', () => {
    const ordre = trier([p('a', 'joueurs', [4]), p('b', 'adversaires', [4, 0])]);
    expect(ordre.map((x) => x.characterId)).toEqual(['b', 'a']);
  });
});

describe('suivant', () => {
  it('individuel : chacun son tour, nouveau round après le dernier', () => {
    let etat = depart('individuel', [p('a', 'joueurs'), p('b', 'adversaires')]);
    expect(peuventAgir(etat).map((x) => x.characterId)).toEqual(['a']);
    expect(() => suivant(etat, 'b')).toThrow(/pas le tour/);
    const un = suivant(etat);
    expect(un).toMatchObject({ aAgi: 'a', finDeRound: false });
    etat = un.etat;
    const deux = suivant(etat, 'b');
    expect(deux.finDeRound).toBe(true);
    expect(deux.etat).toMatchObject({ round: 2, courant: 0 });
    expect(deux.etat.ordre.every((x) => !x.aAgi)).toBe(true);
  });

  it('créneaux : n’importe quel membre du camp qui n’a pas agi', () => {
    let etat = depart('creneaux', [p('j1', 'joueurs'), p('a1', 'adversaires'), p('j2', 'joueurs')]);
    expect(etat.creneaux).toEqual(['joueurs', 'adversaires', 'joueurs']);
    etat = suivant(etat, 'j2').etat;
    expect(() => suivant(etat, 'j1')).toThrow(/créneau/);
    etat = suivant(etat, 'a1').etat;
    expect(() => suivant(etat, 'j2')).toThrow(/créneau/);
    const fin = suivant(etat, 'j1');
    expect(fin.finDeRound).toBe(true);
    expect(fin.etat.round).toBe(2);
  });
});

describe('retirer', () => {
  it('individuel : le tour courant reste sur le même participant', () => {
    let etat = depart('individuel', [p('a', 'joueurs'), p('b', 'joueurs'), p('c', 'joueurs')]);
    etat = suivant(etat).etat;
    const apres = retirer(etat, ['a']);
    expect(apres.courant).toBe(0);
    expect(peuventAgir(apres).map((x) => x.characterId)).toEqual(['b']);
  });

  it('créneaux : un créneau du camp disparaît avec le participant', () => {
    const etat = depart('creneaux', [
      p('j1', 'joueurs'),
      p('a1', 'adversaires'),
      p('j2', 'joueurs'),
    ]);
    const apres = retirer(etat, ['j2']);
    expect(apres.creneaux).toEqual(['joueurs', 'adversaires']);
    expect(apres.ordre.map((x) => x.characterId)).toEqual(['j1', 'a1']);
  });

  it('plus de tour courant : nouveau round, sans participant : courant 0', () => {
    let etat = depart('individuel', [p('a', 'joueurs'), p('b', 'joueurs')]);
    etat = suivant(etat).etat;
    expect(retirer(etat, ['b'])).toMatchObject({ round: 2, courant: 0 });
    expect(retirer(etat, ['a', 'b'])).toMatchObject({ courant: 0, ordre: [] });
  });
});
