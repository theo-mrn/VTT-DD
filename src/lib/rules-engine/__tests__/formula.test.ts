import { evaluateFormula, resolveStatValue, resolveStatModifier, FormulaCycleError, type FormulaContext } from '../formula';
import type { FormulaNode } from '@/modules/game-system/types';

function modifierFormulaFor(key: string): FormulaNode {
  return {
    type: 'floor',
    arg: { type: 'div', args: [{ type: 'sub', args: [{ type: 'stat', key }, { type: 'const', value: 10 }] }, { type: 'const', value: 2 }] },
  };
}

function makeCtx(overrides: Partial<FormulaContext> = {}): FormulaContext {
  return {
    rawStats: { FOR: 14, DEX: 12, CON: 16 },
    statDefs: {
      FOR: { key: 'FOR', label: 'FOR', category: 'ability', dataType: 'number', modifierFormula: modifierFormulaFor('FOR'), origin: 'module' },
      DEX: { key: 'DEX', label: 'DEX', category: 'ability', dataType: 'number', modifierFormula: modifierFormulaFor('DEX'), origin: 'module' },
      CON: { key: 'CON', label: 'CON', category: 'ability', dataType: 'number', modifierFormula: modifierFormulaFor('CON'), origin: 'module' },
    },
    ...overrides,
  };
}

describe('evaluateFormula', () => {
  test('const', () => {
    expect(evaluateFormula({ type: 'const', value: 42 }, makeCtx())).toBe(42);
  });

  test('mod(FOR) — floor((14-10)/2) = 2', () => {
    const ctx = makeCtx();
    expect(evaluateFormula({ type: 'modifier', key: 'FOR' }, ctx)).toBe(2);
  });

  test('Defense = 18 + mod(DEX) — DEX=12 -> mod=1 -> Defense=19', () => {
    const ctx = makeCtx();
    const formula: FormulaNode = { type: 'add', args: [{ type: 'const', value: 18 }, { type: 'modifier', key: 'DEX' }] };
    expect(evaluateFormula(formula, ctx)).toBe(19);
  });

  test('PV = 1 + mod(CON) + jet de dé fixe — CON=16 -> mod=3, dice 1d1 (déterministe via roll injecté)', () => {
    const ctx = makeCtx({ roll: () => 5 });
    const formula: FormulaNode = {
      type: 'add',
      args: [{ type: 'const', value: 1 }, { type: 'modifier', key: 'CON' }, { type: 'dice', notation: '1d12' }],
    };
    expect(evaluateFormula(formula, ctx)).toBe(1 + 3 + 5);
  });

  test('diceField résout la notation depuis une autre stat (ex deVie="d12")', () => {
    const ctx = makeCtx({ rawStats: { FOR: 14, DEX: 12, CON: 16, deVie: 'd12' }, roll: () => 7 });
    expect(evaluateFormula({ type: 'diceField', key: 'deVie' }, ctx)).toBe(7);
  });

  test('bonus() lit ctx.bonuses', () => {
    const ctx = makeCtx({ bonuses: { Contact: 3 } });
    expect(evaluateFormula({ type: 'bonus', key: 'Contact' }, ctx)).toBe(3);
    expect(evaluateFormula({ type: 'bonus', key: 'Absent' }, ctx)).toBe(0);
  });

  test('min/max/floor/ceil/clamp', () => {
    const ctx = makeCtx();
    expect(evaluateFormula({ type: 'min', args: [{ type: 'const', value: 3 }, { type: 'const', value: 1 }] }, ctx)).toBe(1);
    expect(evaluateFormula({ type: 'max', args: [{ type: 'const', value: 3 }, { type: 'const', value: 1 }] }, ctx)).toBe(3);
    expect(evaluateFormula({ type: 'ceil', arg: { type: 'const', value: 1.2 } }, ctx)).toBe(2);
    expect(evaluateFormula({ type: 'clamp', arg: { type: 'const', value: 99 }, lo: { type: 'const', value: 0 }, hi: { type: 'const', value: 10 } }, ctx)).toBe(10);
  });

  test('une ability SANS modifierFormula explicite a quand même mod() calculable par défaut '
    + '(floor((v-10)/2)) — indépendant de rollUsesModifier/affichage, une autre stat peut toujours '
    + 'référencer mod(Corps) sans que le MJ ait besoin de cocher une case sur Corps elle-même', () => {
    const ctx = makeCtx({
      statDefs: { Corps: { key: 'Corps', label: 'Corps', category: 'ability', dataType: 'number', origin: 'module' } },
      rawStats: { Corps: 3 },
    });
    expect(resolveStatModifier('Corps', ctx)).toBe(Math.floor((3 - 10) / 2));
    expect(resolveStatValue('Corps', ctx)).toBe(3);
  });

  test('une stat non-ability (derived/vital/meta) sans modifierFormula reste sans modificateur '
    + '(pas de floor((v-10)/2) implicite en dehors des abilities)', () => {
    const ctx = makeCtx({
      statDefs: { Defense: { key: 'Defense', label: 'Defense', category: 'derived', dataType: 'number', origin: 'module' } },
      rawStats: { Defense: 15 },
    });
    expect(resolveStatModifier('Defense', ctx)).toBeUndefined();
  });

  test('{type:"self"} résout à ctx.self (0 si absent)', () => {
    expect(evaluateFormula({ type: 'self' }, makeCtx({ self: 17 }))).toBe(17);
    expect(evaluateFormula({ type: 'self' }, makeCtx())).toBe(0);
  });

  test('gameSystemModifierFormula (formule globale) prime sur modifierFormula par-stat et sur le '
    + 'calcul par défaut — appliquée à N\'IMPORTE QUELLE ability via {type:"self"}, sans référencer '
    + 'sa clé en dur (fonctionne même pour deux stats différentes avec la même formule globale)', () => {
    const globalFormula: FormulaNode = { type: 'floor', arg: { type: 'div', args: [{ type: 'self' }, { type: 'const', value: 3 }] } };
    const ctx = makeCtx({
      gameSystemModifierFormula: globalFormula,
      statDefs: {
        FOR: { key: 'FOR', label: 'FOR', category: 'ability', dataType: 'number', modifierFormula: modifierFormulaFor('FOR'), origin: 'module' },
        Corps: { key: 'Corps', label: 'Corps', category: 'ability', dataType: 'number', origin: 'module' },
      },
      rawStats: { FOR: 15, Corps: 9 },
    });
    // Sans formule globale, mod(FOR) via modifierFormula par-stat donnerait floor((15-10)/2)=2 ;
    // avec la formule globale, c'est floor(15/3)=5 qui prime.
    expect(resolveStatModifier('FOR', ctx)).toBe(5);
    expect(resolveStatModifier('Corps', ctx)).toBe(Math.floor(9 / 3));
  });
});

describe('resolveStatValue — dérivées récursives', () => {
  test('Defense dérivée référence mod(DEX)', () => {
    const ctx = makeCtx({
      statDefs: {
        DEX: { key: 'DEX', label: 'DEX', category: 'ability', dataType: 'number', modifierFormula: modifierFormulaFor('DEX'), origin: 'module' },
        Defense: {
          key: 'Defense', label: 'Défense', category: 'derived', dataType: 'number',
          valueFormula: { type: 'add', args: [{ type: 'const', value: 18 }, { type: 'modifier', key: 'DEX' }] },
          origin: 'module',
        },
      },
      rawStats: { DEX: 12 },
    });
    expect(resolveStatValue('Defense', ctx)).toBe(19);
  });

  test('cycle de dépendance lève FormulaCycleError', () => {
    const ctx = makeCtx({
      statDefs: {
        A: { key: 'A', label: 'A', category: 'derived', dataType: 'number', valueFormula: { type: 'stat', key: 'B' }, origin: 'module' },
        B: { key: 'B', label: 'B', category: 'derived', dataType: 'number', valueFormula: { type: 'stat', key: 'A' }, origin: 'module' },
      },
      rawStats: {},
    });
    expect(() => resolveStatValue('A', ctx)).toThrow(FormulaCycleError);
  });
});
