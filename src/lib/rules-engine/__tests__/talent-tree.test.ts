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
  test('nœud sans prérequis, jamais acheté => achetable', () => {
    const a = node({ id: 'a' });
    expect(isTalentPurchasable(a, { purchasedRanks: {} })).toBe(true);
  });

  test('nœud avec prérequis non satisfait => non achetable', () => {
    const b = node({ id: 'b', prerequisiteIds: ['a'] });
    expect(isTalentPurchasable(b, { purchasedRanks: {} })).toBe(false);
  });

  test('nœud avec TOUS les prérequis satisfaits (ET logique) => achetable', () => {
    const c = node({ id: 'c', prerequisiteIds: ['a', 'b'] });
    expect(isTalentPurchasable(c, { purchasedRanks: { a: 1, b: 1 } })).toBe(true);
  });

  test('nœud avec un seul prérequis sur deux satisfaits => non achetable', () => {
    const c = node({ id: 'c', prerequisiteIds: ['a', 'b'] });
    expect(isTalentPurchasable(c, { purchasedRanks: { a: 1 } })).toBe(false);
  });

  test('nœud non répétable (maxRank absent) déjà acheté => non achetable', () => {
    const a = node({ id: 'a' });
    expect(isTalentPurchasable(a, { purchasedRanks: { a: 1 } })).toBe(false);
  });

  test('nœud répétable pas encore à maxRank => achetable', () => {
    const a = node({ id: 'a', maxRank: 3 });
    expect(isTalentPurchasable(a, { purchasedRanks: { a: 2 } })).toBe(true);
  });

  test('nœud répétable à maxRank => non achetable', () => {
    const a = node({ id: 'a', maxRank: 3 });
    expect(isTalentPurchasable(a, { purchasedRanks: { a: 3 } })).toBe(false);
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
