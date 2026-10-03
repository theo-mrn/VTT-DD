import { describe, expect, it } from 'vitest';
import { stripTags } from './strip-tags';

describe('stripTags', () => {
  it('se comporte comme /<[^>]+>/g', () => {
    for (const s of [
      '<p>Bonjour <b>toi</b></p>',
      'a < b et c > d',
      '<>vide<i>x</i>',
      'non fermé <a',
      '<a<b>c',
      '',
      '<<<<<<<<',
    ])
      expect(stripTags(s, ' ')).toBe(s.replace(/<[^>]+>/g, ' '));
  });

  it('reste linéaire sur une longue suite de « < » non fermés', () => {
    const s = '<'.repeat(200_000);
    const t = performance.now();
    expect(stripTags(s)).toBe(s);
    expect(performance.now() - t).toBeLessThan(200);
  });
});
