/**
 * Règles de tour sans base : tri d'initiative, individual, slots, retrait.
 */
import { describe, expect, it } from 'vitest';
import type { Side } from '../../db/schema.js';
import { canActNow, next, remove, sortByInitiative, start, type Participant } from './turns.js';

const p = (characterId: string, side: Side, sortKeys: number[] = []): Participant => ({
  characterId,
  side,
  sortKeys,
  hasActed: false,
});

describe('sortByInitiative', () => {
  it('clé par clé, la plus haute d’abord', () => {
    const order = sortByInitiative([
      p('a', 'enemies', [2, 5]),
      p('b', 'players', [3, 0]),
      p('c', 'allies', [2, 7]),
    ]);
    expect(order.map((x) => x.characterId)).toEqual(['b', 'c', 'a']);
  });

  it('égalité parfaite : camp players d’abord, puis ordre reçu', () => {
    const order = sortByInitiative([
      p('e1', 'enemies', [10]),
      p('p1', 'players', [10]),
      p('al', 'allies', [10]),
      p('p2', 'players', [10]),
      p('e2', 'enemies', [10]),
    ]);
    expect(order.map((x) => x.characterId)).toEqual(['p1', 'p2', 'e1', 'al', 'e2']);
  });

  it('une clé absente compte comme la plus basse', () => {
    const order = sortByInitiative([p('a', 'players', [4]), p('b', 'enemies', [4, 0])]);
    expect(order.map((x) => x.characterId)).toEqual(['b', 'a']);
  });
});

describe('next', () => {
  it('individual : chacun son tour, nouveau round après le dernier', () => {
    let state = start('individual', [p('a', 'players'), p('b', 'enemies')]);
    expect(canActNow(state).map((x) => x.characterId)).toEqual(['a']);
    expect(() => next(state, 'b')).toThrow(/pas le tour/);
    const one = next(state);
    expect(one).toMatchObject({ acted: 'a', endOfRound: false });
    state = one.state;
    const two = next(state, 'b');
    expect(two.endOfRound).toBe(true);
    expect(two.state).toMatchObject({ round: 2, currentIndex: 0 });
    expect(two.state.order.every((x) => !x.hasActed)).toBe(true);
  });

  it('slots : n’importe quel membre du camp qui n’a pas agi', () => {
    let state = start('slots', [p('p1', 'players'), p('e1', 'enemies'), p('p2', 'players')]);
    expect(state.slots).toEqual(['players', 'enemies', 'players']);
    state = next(state, 'p2').state;
    expect(() => next(state, 'p1')).toThrow(/créneau/);
    state = next(state, 'e1').state;
    expect(() => next(state, 'p2')).toThrow(/créneau/);
    const end = next(state, 'p1');
    expect(end.endOfRound).toBe(true);
    expect(end.state.round).toBe(2);
  });
});

describe('remove', () => {
  it('individual : le tour courant reste sur le même participant', () => {
    let state = start('individual', [p('a', 'players'), p('b', 'players'), p('c', 'players')]);
    state = next(state).state;
    const after = remove(state, ['a']);
    expect(after.currentIndex).toBe(0);
    expect(canActNow(after).map((x) => x.characterId)).toEqual(['b']);
  });

  it('slots : un créneau du camp disparaît avec le participant', () => {
    const state = start('slots', [p('p1', 'players'), p('e1', 'enemies'), p('p2', 'players')]);
    const after = remove(state, ['p2']);
    expect(after.slots).toEqual(['players', 'enemies']);
    expect(after.order.map((x) => x.characterId)).toEqual(['p1', 'e1']);
  });

  it('plus de tour courant : nouveau round, sans participant : index 0', () => {
    let state = start('individual', [p('a', 'players'), p('b', 'players')]);
    state = next(state).state;
    expect(remove(state, ['b'])).toMatchObject({ round: 2, currentIndex: 0 });
    expect(remove(state, ['a', 'b'])).toMatchObject({ currentIndex: 0, order: [] });
  });
});
