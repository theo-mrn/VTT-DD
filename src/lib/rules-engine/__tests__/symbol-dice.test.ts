import { rollSymbolDie, resolveSymbolDiceRoll, formatSymbolDiceResult } from '../symbol-dice';
import type { GameSystemDefinition, SymbolDieDefinition, SymbolDieFace, StatDefinition } from '@/modules/game-system/types';

function statDef(key: string, extra: Partial<StatDefinition> = {}): StatDefinition {
  return { key, label: key, category: 'ability', dataType: 'number', origin: 'module', ...extra };
}

function face(values: SymbolDieFace['values']): SymbolDieFace {
  return { values };
}

// Système de test façon Star Wars, mais entièrement défini par de la donnée (aucun nom de symbole
// connu du moteur) : deux compteurs bruts (succesBrut/echecBrut, avantageBrut/menaceBrut) remplis par
// les faces des dés, et deux stats dérivées "net" calculées par une formule MJ ordinaire (max(sub, 0)),
// exactement comme n'importe quelle autre stat dérivée du projet (ex Defense = 18 + mod(DEX)).
const testGameSystem: GameSystemDefinition = {
  systemId: 'test-narrative',
  stats: [
    statDef('succesBrut'),
    statDef('echecBrut'),
    statDef('avantageBrut'),
    statDef('menaceBrut'),
    statDef('succesNet', {
      label: 'Succès',
      category: 'derived',
      valueFormula: { type: 'max', args: [{ type: 'sub', args: [{ type: 'stat', key: 'succesBrut' }, { type: 'stat', key: 'echecBrut' }] }, { type: 'const', value: 0 }] },
    }),
    statDef('echecNet', {
      label: 'Échec',
      category: 'derived',
      valueFormula: { type: 'max', args: [{ type: 'sub', args: [{ type: 'stat', key: 'echecBrut' }, { type: 'stat', key: 'succesBrut' }] }, { type: 'const', value: 0 }] },
    }),
    statDef('avantageNet', {
      label: 'Avantage',
      category: 'derived',
      valueFormula: { type: 'max', args: [{ type: 'sub', args: [{ type: 'stat', key: 'avantageBrut' }, { type: 'stat', key: 'menaceBrut' }] }, { type: 'const', value: 0 }] },
    }),
    statDef('menaceNet', {
      label: 'Menace',
      category: 'derived',
      valueFormula: { type: 'max', args: [{ type: 'sub', args: [{ type: 'stat', key: 'menaceBrut' }, { type: 'stat', key: 'avantageBrut' }] }, { type: 'const', value: 0 }] },
    }),
  ],
};

const boostDie: SymbolDieDefinition = {
  key: 'boost',
  label: 'Boost',
  faces: [
    face({}),
    face({}),
    face({ succesBrut: 1 }),
    face({ succesBrut: 1, avantageBrut: 1 }),
    face({ avantageBrut: 2 }),
    face({ avantageBrut: 1 }),
  ],
};

describe('rollSymbolDie', () => {
  test('retourne une valeur entre 1 et le nombre de faces, avec la face correspondante', () => {
    for (let i = 0; i < 50; i++) {
      const roll = rollSymbolDie(boostDie);
      expect(roll.value).toBeGreaterThanOrEqual(1);
      expect(roll.value).toBeLessThanOrEqual(6);
      expect(roll.face).toEqual(boostDie.faces[roll.value - 1]);
    }
  });
});

describe('resolveSymbolDiceRoll', () => {
  test('additionne les valeurs brutes de plusieurs faces puis résout les stats dérivées via le moteur de formules partagé', () => {
    const resolution = resolveSymbolDiceRoll(testGameSystem, [face({ succesBrut: 1 }), face({ succesBrut: 1, avantageBrut: 1 })]);
    expect(resolution.values.succesBrut).toBe(2);
    expect(resolution.values.avantageBrut).toBe(1);
    expect(resolution.values.succesNet).toBe(2);
    expect(resolution.values.avantageNet).toBe(1);
    expect(resolution.touchedKeys.sort()).toEqual(['avantageBrut', 'succesBrut']);
  });

  test('annulation succès/échec via la formule MJ (max(sub, 0)) — ne garde que le net', () => {
    const r1 = resolveSymbolDiceRoll(testGameSystem, [face({ succesBrut: 3 }), face({ echecBrut: 1 })]);
    expect(r1.values.succesNet).toBe(2);
    expect(r1.values.echecNet).toBe(0);

    const r2 = resolveSymbolDiceRoll(testGameSystem, [face({ succesBrut: 1 }), face({ echecBrut: 3 })]);
    expect(r2.values.succesNet).toBe(0);
    expect(r2.values.echecNet).toBe(2);
  });

  test('face vide ne contribue à rien', () => {
    const resolution = resolveSymbolDiceRoll(testGameSystem, [face({}), face({}), face({ succesBrut: 1 })]);
    expect(resolution.values.succesBrut).toBe(1);
    expect(resolution.touchedKeys).toEqual(['succesBrut']);
  });
});

describe('formatSymbolDiceResult', () => {
  test('résultat vide => "Aucun effet"', () => {
    const resolution = resolveSymbolDiceRoll(testGameSystem, [face({})]);
    expect(formatSymbolDiceResult(testGameSystem, resolution)).toBe('Aucun effet');
  });

  test('formate uniquement les stats dérivées dont la formule dépend d\'une clé touchée par ce jet, non nulles', () => {
    const resolution = resolveSymbolDiceRoll(testGameSystem, [face({ succesBrut: 2, avantageBrut: 1 })]);
    const result = formatSymbolDiceResult(testGameSystem, resolution);
    expect(result).toBe('2 Succès + 1 Avantage');
  });

  test('n\'affiche pas une stat dérivée non concernée par les clés touchées (ex menaceNet si menace/avantage jamais touchés)', () => {
    const resolution = resolveSymbolDiceRoll(testGameSystem, [face({ succesBrut: 1 })]);
    const result = formatSymbolDiceResult(testGameSystem, resolution);
    expect(result).toBe('1 Succès');
    expect(result).not.toMatch(/Menace|Avantage/);
  });
});
