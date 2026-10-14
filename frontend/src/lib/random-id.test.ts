import { describe, expect, it } from 'vitest';
import { pickRandom, random, randomId } from './random-id';

describe('tirages aléatoires', () => {
  it('random reste dans [0, 1), pickRandom dans la liste, randomId change', () => {
    for (let i = 0; i < 200; i++) {
      const r = random();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      expect(['a', 'b', 'c']).toContain(pickRandom(['a', 'b', 'c']));
    }
    expect(randomId()).not.toBe(randomId());
  });
});
