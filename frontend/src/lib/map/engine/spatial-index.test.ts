import { describe, expect, it } from 'vitest';
import { SpatialIndex } from './spatial-index';

const sorted = (ids: string[]) => [...ids].sort();

describe('SpatialIndex', () => {
  it('trouve les éléments qui touchent un rectangle ou un point', () => {
    const index = new SpatialIndex(100);
    index.set('a', { x: 10, y: 10, width: 20, height: 20 });
    index.set('b', { x: 150, y: 150, width: 20, height: 20 });
    index.set('c', { x: 90, y: 90, width: 30, height: 30 });

    expect(sorted(index.queryRect({ x: 0, y: 0, width: 100, height: 100 }))).toEqual(['a', 'c']);
    expect(index.queryPoint({ x: 160, y: 160 })).toEqual(['b']);
    expect(index.queryPoint({ x: 35, y: 35 })).toEqual([]);
    // Tolérance
    expect(index.queryPoint({ x: 35, y: 35 }, 6)).toEqual(['a']);
  });

  it('suit un élément déplacé et oublie un élément retiré', () => {
    const index = new SpatialIndex(64);
    index.set('a', { x: 0, y: 0, width: 10, height: 10 });
    index.set('a', { x: 500, y: 500, width: 10, height: 10 });
    expect(index.queryPoint({ x: 5, y: 5 })).toEqual([]);
    expect(index.queryPoint({ x: 505, y: 505 })).toEqual(['a']);
    index.remove('a');
    expect(index.queryPoint({ x: 505, y: 505 })).toEqual([]);
    expect(index.size).toBe(0);
  });

  it('gère les coordonnées négatives et les éléments immenses', () => {
    const index = new SpatialIndex(10);
    index.set('neg', { x: -55, y: -55, width: 10, height: 10 });
    index.set('huge', { x: -100_000, y: -100_000, width: 200_000, height: 200_000 });
    expect(sorted(index.queryPoint({ x: -50, y: -50 }))).toEqual(['huge', 'neg']);
    expect(index.queryPoint({ x: 9_000, y: 9_000 })).toEqual(['huge']);
  });

  it('parcourt la grille occupée quand la zone demandée est plus grande', () => {
    const index = new SpatialIndex(10);
    for (let i = 0; i < 50; i++) index.set(`e${i}`, { x: i * 20, y: 0, width: 5, height: 5 });
    const all = index.queryRect({ x: -1e6, y: -1e6, width: 2e6, height: 2e6 });
    expect(all).toHaveLength(50);
  });
});
