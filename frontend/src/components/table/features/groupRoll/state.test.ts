import { describe, expect, it } from 'vitest';
import { groupRoll, groupRollActions, normalizeGroupRoll, ranked } from './state';

const r = (userId: string, total: number | null) => ({
  userId,
  name: userId,
  total,
  symbols: null,
  critical: null,
});

describe('jet de groupe', () => {
  it('classe du meilleur au pire, les résultats cachés à la fin', () => {
    expect(ranked([r('a', 8), r('b', null), r('c', 17)]).map((x) => x.userId)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('un résultat par joueur, le dernier compte ; plus rien une fois clos', () => {
    groupRollActions.start('Perception', '1d20 + SAG', true, ['a', 'b']);
    const id = groupRoll.store.getState().value!.id;
    groupRollActions.record(id, r('a', 5));
    groupRollActions.record(id, r('a', 12));
    expect(groupRoll.store.getState().value!.results).toEqual([r('a', 12)]);
    groupRollActions.close();
    groupRollActions.record(id, r('b', 20));
    expect(groupRoll.store.getState().value!.results).toHaveLength(1);
    groupRollActions.clear();
  });

  it('écarte une demande illisible', () => {
    expect(normalizeGroupRoll({ id: 'x' })).toBeNull();
    expect(normalizeGroupRoll({ id: 'x', formula: '1d20' })?.shared).toBe(true);
  });
});
