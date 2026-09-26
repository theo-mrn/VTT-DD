import { describe, expect, it } from 'vitest';
import { computeStats, streakOf } from './index.js';

const roll = (authorId: string | null, authorName: string, faces: number, ...values: number[]) => ({
  authorId,
  authorName,
  authorAvatarUrl: null,
  diceCount: values.length,
  diceFaces: faces,
  dice: [{ faces, values: values.map((value) => ({ value, kept: true, exploded: false })) }],
  notation: `${values.length}d${faces}`,
});

describe('computeStats (calculs de dice-stats.tsx)', () => {
  // Du plus récent au plus ancien, comme la requête
  const rolls = [
    roll('a', 'Aria', 20, 20),
    roll('b', 'MJ', 20, 1),
    roll('a', 'Aria (ancien nom)', 6, 3, 4),
    roll('a', 'Aria', 20, 7),
    roll(null, 'Invité', 20, 12),
  ];

  it('par joueur, global, types de dé', () => {
    const s = computeStats(rolls, {});
    expect(s.rollCount).toBe(5);
    expect(s.diceTypes).toEqual(['1d20', '2d6']);
    const aria = s.players.find((p) => p.userId === 'a')!;
    expect(aria).toMatchObject({
      userName: 'Aria',
      totalRolls: 4,
      totalSum: 34,
      averageRoll: 8.5,
      highestRoll: 20,
      lowestRoll: 3,
      criticalSuccesses: 1,
      criticalFailures: 0,
      rollDistribution: { 20: 1, 3: 1, 4: 1, 7: 1 },
    });
    expect(s.players[0]!.userId).toBe('a');
    expect(s.players.find((p) => p.userName === 'MJ')!.criticalFailures).toBe(1);
    // Jet importé sans compte : regroupé par son nom
    expect(s.players.find((p) => p.userName === 'Invité')!.userId).toBeNull();
    expect(s.globalDistribution.find((x) => x.value === 20)).toEqual({ value: 20, count: 1 });
  });

  it('filtre par type et évolution chronologique d’un joueur', () => {
    const s = computeStats(rolls, { diceType: '1d20', userId: 'a' });
    expect(s.rollCount).toBe(4);
    expect(s.diceTypes).toEqual(['1d20', '2d6']);
    expect(s.timeline).toEqual([
      { roll: 1, total: 7, notation: '1d20' },
      { roll: 2, total: 20, notation: '1d20' },
    ]);
    expect(s.streak).toEqual({ direction: 'high', length: 1 });
    expect(computeStats(rolls, { faces: 6 }).globalDistribution).toEqual([
      { value: 3, count: 1 },
      { value: 4, count: 1 },
    ]);
  });

  it('critiques seulement sur les jets de 1d20', () => {
    const s = computeStats([roll('a', 'A', 20, 20, 1)], {});
    expect(s.players[0]!.criticalSuccesses + s.players[0]!.criticalFailures).toBe(0);
  });
});

describe('streakOf', () => {
  it('derniers dés du même côté de la moyenne', () => {
    expect(streakOf([15, 12, 18, 3, 20], 20)).toEqual({ direction: 'high', length: 3 });
    expect(streakOf([1, 2, 11], 20)).toEqual({ direction: 'low', length: 2 });
    expect(streakOf([3, 1], 5)).toEqual({ direction: null, length: 0 });
    expect(streakOf([], 20)).toEqual({ direction: null, length: 0 });
  });
});
