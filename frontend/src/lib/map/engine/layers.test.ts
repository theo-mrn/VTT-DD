import { describe, expect, it } from 'vitest';
import { assignZ, reorderStack, sortLayers, sortStack, zAtBottom, zOnTop } from './layers';

/** Applique les `z` calculés et renvoie l'ordre obtenu. */
function applied(order: string[], zOf: Map<string, number>, changes: Map<string, number>) {
  const z = new Map(zOf);
  for (const [id, v] of changes) z.set(id, v);
  return sortStack(order.map((id) => ({ id, z: z.get(id)! }))).map((s) => s.id);
}

describe('ordre dans un calque', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  const zOf = new Map(order.map((id, i) => [id, i * 10]));

  it('avance et recule d’un cran en gardant l’ordre relatif de la sélection', () => {
    expect(reorderStack(order, new Set(['b', 'c']), 'forward')).toEqual(['a', 'd', 'b', 'c', 'e']);
    expect(reorderStack(order, new Set(['b', 'd']), 'forward')).toEqual(['a', 'c', 'b', 'e', 'd']);
    expect(reorderStack(order, new Set(['c', 'd']), 'backward')).toEqual(['a', 'c', 'd', 'b', 'e']);
    // Déjà en haut : rien ne bouge
    expect(reorderStack(order, new Set(['e']), 'forward')).toEqual(order);
  });

  it('met la sélection au premier plan ou à l’arrière-plan', () => {
    expect(reorderStack(order, new Set(['d', 'a']), 'front')).toEqual(['b', 'c', 'e', 'a', 'd']);
    expect(reorderStack(order, new Set(['d', 'b']), 'back')).toEqual(['b', 'd', 'a', 'c', 'e']);
  });

  it('prend le z entre les voisins et n’écrit que les éléments déplacés', () => {
    const selected = new Set(['b', 'c']);
    const next = reorderStack(order, selected, 'forward');
    const changes = assignZ(next, zOf, selected);
    // Seuls b et c changent, entre d (30) et e (40)
    expect([...changes.keys()].sort()).toEqual(['b', 'c']);
    for (const v of changes.values()) {
      expect(v).toBeGreaterThan(30);
      expect(v).toBeLessThan(40);
    }
    expect(applied(order, zOf, changes)).toEqual(next);
  });

  it('pose au-dessus ou en dessous de tout, par pas entier', () => {
    const front = assignZ(reorderStack(order, new Set(['a']), 'front'), zOf, new Set(['a']));
    expect(front.get('a')).toBe(41);
    const back = assignZ(
      reorderStack(order, new Set(['e', 'd']), 'back'),
      zOf,
      new Set(['e', 'd']),
    );
    expect(back.get('d')).toBe(-2);
    expect(back.get('e')).toBe(-1);
  });

  it('n’écrit rien si la sélection est déjà à sa place', () => {
    expect(assignZ(order, zOf, new Set(['c'])).size).toBe(0);
  });

  it('renumérote la pile quand l’écart entre deux voisins est épuisé', () => {
    const tight = new Map([
      ['a', 0],
      ['b', 1e-9],
      ['c', 2e-9],
    ]);
    const next = reorderStack(['a', 'b', 'c'], new Set(['c']), 'backward');
    const changes = assignZ(next, tight, new Set(['c']));
    expect(applied(['a', 'b', 'c'], tight, changes)).toEqual(next);
    expect(changes.size).toBeGreaterThan(1);
  });

  it('range des éléments en haut ou en bas d’un autre calque', () => {
    expect(zOnTop([{ id: 'x', z: 4.5 }], 2)).toEqual([5, 6]);
    expect(zOnTop([], 2)).toEqual([0, 1]);
    expect(zAtBottom([{ id: 'x', z: 3.2 }], 2)).toEqual([2, 3]);
  });

  it('trie les calques du bas vers le haut, de façon stable', () => {
    const layers = sortLayers([
      { id: 'b', sortOrder: 2 },
      { id: 'a', sortOrder: 1 },
      { id: 'c', sortOrder: 1 },
    ]);
    expect(layers.map((l) => l.id)).toEqual(['a', 'c', 'b']);
  });
});
