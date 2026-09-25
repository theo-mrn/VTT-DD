import { nextTalentRankCost, isTalentPurchasable, findTalentTreeCycle } from '../talent-tree';
import type { TalentNode } from '../talent-tree';

function node(extra: Partial<TalentNode> & { id: string }): TalentNode {
  return { x: 0, y: 0, title: extra.id, xpCost: 5, prerequisiteIds: [], ...extra };
}

describe('nextTalentRankCost', () => {
  test('rang 0 -> 1 : xpCost × 1', () => {
    expect(nextTalentRankCost(node({ id: 'a', xpCost: 5 }), 0)).toBe(5);
  });

  test('nœud répétable, rang 1 -> 2 : xpCost × 2 (coût croissant)', () => {
    expect(nextTalentRankCost(node({ id: 'a', xpCost: 5 }), 1)).toBe(10);
  });
});

describe('isTalentPurchasable', () => {
  test('nœud de première ligne (y=0), jamais acheté => achetable même sans connexion', () => {
    const a = node({ id: 'a' });
    expect(isTalentPurchasable(a, { purchasedRanks: {} }, [a])).toBe(true);
  });

  test('nœud hors première ligne, aucune case reliée possédée => non achetable', () => {
    const a = node({ id: 'a' });
    const b = node({ id: 'b', y: 1, prerequisiteIds: ['a'] });
    expect(isTalentPurchasable(b, { purchasedRanks: {} }, [a, b])).toBe(false);
  });

  test('UNE seule case reliée possédée sur deux suffit (OU logique)', () => {
    const a = node({ id: 'a' });
    const b = node({ id: 'b' });
    const c = node({ id: 'c', y: 1, prerequisiteIds: ['a', 'b'] });
    expect(isTalentPurchasable(c, { purchasedRanks: { a: 1 } }, [a, b, c])).toBe(true);
  });

  test('connexion traversée dans le sens INVERSE : posséder la case qui me référence me débloque', () => {
    // d (y=1) n'a aucun prerequisiteIds, mais e (y=2) le référence — posséder e débloque d,
    // comme sur les grilles EotE officielles où un trait se remonte.
    const d = node({ id: 'd', y: 1 });
    const e = node({ id: 'e', y: 2, prerequisiteIds: ['d'] });
    expect(isTalentPurchasable(d, { purchasedRanks: {} }, [d, e])).toBe(false);
    expect(isTalentPurchasable(d, { purchasedRanks: { e: 1 } }, [d, e])).toBe(true);
  });

  test('nœud non répétable (maxRank absent) déjà acheté => non achetable', () => {
    const a = node({ id: 'a' });
    expect(isTalentPurchasable(a, { purchasedRanks: { a: 1 } }, [a])).toBe(false);
  });

  test('nœud répétable pas encore à maxRank => achetable', () => {
    const a = node({ id: 'a', maxRank: 3 });
    expect(isTalentPurchasable(a, { purchasedRanks: { a: 2 } }, [a])).toBe(true);
  });

  test('nœud répétable à maxRank => non achetable', () => {
    const a = node({ id: 'a', maxRank: 3 });
    expect(isTalentPurchasable(a, { purchasedRanks: { a: 3 } }, [a])).toBe(false);
  });
});

describe('findTalentTreeCycle', () => {
  test('grille acyclique => null', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b', prerequisiteIds: ['a'] }), node({ id: 'c', prerequisiteIds: ['b'] })];
    expect(findTalentTreeCycle(nodes)).toBeNull();
  });

  test('cycle direct (a dépend de b, b dépend de a) => détecté', () => {
    const nodes = [node({ id: 'a', prerequisiteIds: ['b'] }), node({ id: 'b', prerequisiteIds: ['a'] })];
    expect(findTalentTreeCycle(nodes)).not.toBeNull();
  });

  test('cycle indirect (a -> b -> c -> a) => détecté', () => {
    const nodes = [
      node({ id: 'a', prerequisiteIds: ['c'] }),
      node({ id: 'b', prerequisiteIds: ['a'] }),
      node({ id: 'c', prerequisiteIds: ['b'] }),
    ];
    expect(findTalentTreeCycle(nodes)).not.toBeNull();
  });

  test('prérequis multiples sans cycle => null', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c', prerequisiteIds: ['a', 'b'] })];
    expect(findTalentTreeCycle(nodes)).toBeNull();
  });
});
