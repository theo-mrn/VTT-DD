import { composeDicePool, rollComposedDicePool } from '../dice-pool';
import type { GameSystemDefinition, SymbolDieDefinition } from '@/modules/game-system/types';

describe('composeDicePool', () => {
  test('exemple de l\'énoncé : Agilité 3 / Discrétion rang 1 => 1 dé upgradé + 2 dés de base', () => {
    expect(composeDicePool(3, 1)).toEqual({ upgradedCount: 1, baseCount: 2 });
  });

  test('symétrique : composeDicePool(1,3) donne le même résultat que (3,1)', () => {
    expect(composeDicePool(1, 3)).toEqual({ upgradedCount: 1, baseCount: 2 });
  });

  test('égalité : tout le pool est upgradé', () => {
    expect(composeDicePool(2, 2)).toEqual({ upgradedCount: 2, baseCount: 0 });
  });

  test('compétence non entraînée (rang 0) : aucun dé upgradé', () => {
    expect(composeDicePool(3, 0)).toEqual({ upgradedCount: 0, baseCount: 3 });
  });

  test('les deux valeurs à 0 => pool vide', () => {
    expect(composeDicePool(0, 0)).toEqual({ upgradedCount: 0, baseCount: 0 });
  });

  test('valeurs négatives plafonnées à 0 (jamais de dé négatif)', () => {
    expect(composeDicePool(-1, -1)).toEqual({ upgradedCount: 0, baseCount: 0 });
  });
});

const abilityDie: SymbolDieDefinition = { key: 'ability', label: 'Aptitude', faces: [{ values: { succesBrut: 1 } }] };
const proficiencyDie: SymbolDieDefinition = { key: 'proficiency', label: 'Maîtrise', faces: [{ values: { succesBrut: 2 } }] };

const gameSystem: GameSystemDefinition = {
  systemId: 'test-eote',
  stats: [],
  symbolDice: [abilityDie, proficiencyDie],
};

describe('rollComposedDicePool', () => {
  test('lance le bon nombre de dés de chaque type', () => {
    const rolls = rollComposedDicePool(gameSystem, { baseDiceKey: 'ability', upgradedDiceKey: 'proficiency' }, 3, 1);
    expect(rolls).toHaveLength(3);
    // 1 seul face possible par dé ici => déterministe pour vérifier la composition
    expect(rolls.filter((r) => r.face.values.succesBrut === 2)).toHaveLength(1); // upgradé
    expect(rolls.filter((r) => r.face.values.succesBrut === 1)).toHaveLength(2); // base
  });

  test('lève une erreur claire si baseDiceKey est introuvable dans le système', () => {
    expect(() => rollComposedDicePool(gameSystem, { baseDiceKey: 'inconnu', upgradedDiceKey: 'proficiency' }, 3, 1))
      .toThrow(/Dé de base introuvable/);
  });

  test('lève une erreur claire si upgradedDiceKey est introuvable dans le système', () => {
    expect(() => rollComposedDicePool(gameSystem, { baseDiceKey: 'ability', upgradedDiceKey: 'inconnu' }, 3, 1))
      .toThrow(/Dé upgradé introuvable/);
  });
});
