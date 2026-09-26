import { aleatoireImpose } from '@vtt/rules';
import { systeme } from '@vtt/systemes';
import { describe, expect, it } from 'vitest';
import {
  applyVariables,
  flatResults,
  formatSymbolResult,
  freeOutcome,
  rollNotation,
  rollPool,
  sheetVariables,
  symbolPool,
} from './roll.js';

const dice = (...values: number[]) => aleatoireImpose(values);

describe('rollNotation (comportement de l’ancienne app)', () => {
  it('2d6+3 : total, détail et premier groupe', () => {
    const r = rollNotation('2d6+3', {}, dice(4, 5));
    expect(r.total).toBe(12);
    expect(r.output).toBe('2d6+3 = [4, 5]+3 = 12');
    expect(r.dice).toEqual([
      {
        faces: 6,
        values: [
          { value: 4, kept: true, exploded: false },
          { value: 5, kept: true, exploded: false },
        ],
      },
    ]);
    expect([r.diceCount, r.diceFaces]).toEqual([2, 6]);
    expect(flatResults(r.dice, null)).toEqual([4, 5]);
  });

  it('4d6kh3 et 2d20kl1 : dés écartés préfixés par « r »', () => {
    const r = rollNotation('4d6kh3', {}, dice(2, 6, 3, 5));
    expect(r.total).toBe(14);
    expect(r.output).toBe('4d6kh3 = [r2, 6, 3, 5] = 14');
    const d = rollNotation('2d20kl1 + 1d4', {}, dice(15, 7, 3));
    expect(d.output).toBe('2d20kl1 + 1d4 = [r15, 7] + [3] = 10');
    expect(flatResults(d.dice, null)).toEqual([15, 7, 3]);
  });

  it('1d20! : explosion, et 1D20 en majuscule', () => {
    const r = rollNotation('1d20!', {}, dice(20, 20, 4));
    expect(r.total).toBe(44);
    expect(r.diceCount).toBe(1);
    expect(r.dice[0]!.values.map((v) => v.exploded)).toEqual([false, true, true]);
    expect(rollNotation('1D20+2', {}, dice(10)).total).toBe(12);
  });

  it('variables en nom nu : modificateur sinon valeur, insensible à la casse', () => {
    const values = {
      FOR: { value: 16, modifier: 3 },
      DEX: { value: 8, modifier: -1 },
      NIV: { value: 4 },
      NOM: { value: 'Aria' },
    };
    const vars = sheetVariables(values);
    expect(vars).toEqual({ FOR: 3, DEX: -1, NIV: 4 });
    expect(applyVariables('1d20+for+NIV', vars)).toBe('1d20+3+4');
    const r = rollNotation('1d20+FOR+DEX', { variables: vars }, dice(10));
    expect(r.notation).toBe('1d20+3+-1');
    expect(r.total).toBe(12);
    expect(r.output).toBe('1d20+3+-1 = [10]+3+-1 = 12');
  });

  it('syntaxe du moteur : @FOR et mod(@DEX) lus sur la fiche', () => {
    const sheet = { FOR: { value: 16, modifier: 3 }, DEX: { value: 8, modifier: -1 } };
    const r = rollNotation('1d20 + @FOR + mod(@DEX)', { sheet }, dice(5));
    expect(r.total).toBe(20);
  });

  it('variable explicite (ancien champ variables) sans fiche', () => {
    expect(rollNotation('1d20+CON', { variables: { CON: 3 } }, dice(7)).total).toBe(10);
  });

  it('division : total arrondi à l’entier inférieur, détail exact', () => {
    const r = rollNotation('1d6/2', {}, dice(5));
    expect(r.total).toBe(2);
    expect(r.output).toBe('1d6/2 = [5]/2 = 2.5');
  });

  it('notation invalide : 400 invalid_notation', () => {
    for (const bad of ['1d20+FOO', '1d', 'abc', '@FOR + 1', '1d20 >= 10']) {
      expect(() => rollNotation(bad, {}, dice(1)), bad).toThrowError(
        expect.objectContaining({ status: 400, code: 'invalid_notation' }),
      );
    }
  });
});

describe('freeOutcome', () => {
  const group = (faces: number, ...values: [number, boolean][]) => ({
    faces,
    values: values.map(([value, kept]) => ({ value, kept, exploded: false })),
  });
  it('un seul dé gardé à sa valeur maximale ou à 1', () => {
    expect(freeOutcome([group(20, [20, true])])).toEqual({
      success: null,
      critical: true,
      fumble: false,
    });
    expect(freeOutcome([group(20, [1, true], [15, false])]).fumble).toBe(true);
    expect(freeOutcome([group(6, [6, true], [6, true])]).critical).toBe(false);
  });
});

describe('dés à symboles (Star Wars)', () => {
  const sw = systeme('star-wars-eote');

  it('notation N<dé> : identifiant ou nom, sans accents ni casse', () => {
    expect(symbolPool('2aptitude 1difficulte', sw)).toEqual([
      { de: 'aptitude', nombre: 2 },
      { de: 'difficulte', nombre: 1 },
    ]);
    expect(symbolPool('1 Maîtrise + 2Défi', sw)).toEqual([
      { de: 'maitrise', nombre: 1 },
      { de: 'defi', nombre: 2 },
    ]);
    expect(symbolPool('1d20+3', sw)).toBeNull();
    expect(symbolPool('2aptitude', systeme('dnd-classic'))).toBeNull();
  });

  it('lancer : détail, résultat et faces comme anciens results', () => {
    // Aptitude : faces 4 (succès ×2) et 2 (succès) ; Difficulté : face 2 (échec)
    const r = rollPool(
      sw,
      [
        { de: 'aptitude', nombre: 2 },
        { de: 'difficulte', nombre: 1 },
      ],
      dice(4, 2, 2),
    );
    expect(r.symbolResult).toBe('2 Succès');
    expect(r.output).toBe('Aptitude [4, 2], Difficulté [2] = 2 Succès');
    expect(r.total).toBe(0);
    expect(r.symbols!.results.succesNets).toBe(2);
    expect(flatResults([], r.symbols)).toEqual([4, 2, 2]);
    expect([r.diceCount, r.diceFaces]).toEqual([3, 8]);
  });

  it('aucun symbole : « Aucun effet » ; dé inconnu : 400 invalid_pool', () => {
    expect(formatSymbolResult(sw, { succesNets: 0 })).toBe('Aucun effet');
    expect(() => rollPool(sw, [{ de: 'licorne', nombre: 1 }], dice(1))).toThrowError(
      expect.objectContaining({ status: 400, code: 'invalid_pool' }),
    );
    expect(() =>
      rollPool(systeme('dnd-classic'), [{ de: 'aptitude', nombre: 1 }], dice(1)),
    ).toThrowError(expect.objectContaining({ code: 'invalid_pool' }));
  });
});
